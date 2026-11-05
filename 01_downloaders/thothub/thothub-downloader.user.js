// ==UserScript==
// @name         Thothub Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.3
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/thothub/thothub-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/thothub/thothub-downloader.user.js
// @description  Dodaje przycisk do pobierania wideo ze stron thothub.to, zapis w /thothub/
// @author       You
// @match        https://thothub.to/videos/*
// @match        https://thothub.to/embed/*
// @icon         https://thothub.to/favicon.ico
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

var DOWNLOAD_PATH = 'thothub/';

(function () {
    'use strict';

    GM_addStyle(`
        .thothub-dl-btn {
            display: inline-block;
            margin: 8px 0;
            padding: 10px 20px;
            background: #C41E3A;
            color: #fff !important;
            font-weight: 700;
            font-size: 14px;
            border-radius: 6px;
            text-decoration: none;
            cursor: pointer;
            border: none;
            transition: background 0.2s;
        }
        .thothub-dl-btn:hover {
            background: #a01830;
        }
        .thothub-dl-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .thothub-dl-status {
            display: inline-block;
            margin-left: 10px;
            font-size: 13px;
            color: #666;
        }
    `);

    function getVideoTitle() {
        const h1 = document.querySelector('h1');
        if (h1) return h1.textContent.trim();
        const title = document.querySelector('title');
        return title ? title.textContent.replace(/\s*-\s*Thothub$/, '').trim() : 'video';
    }

    function sanitizeFilename(name) {
        return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
    }

    function getVideoUrl() {
        const video = document.querySelector('video');
        if (video && video.currentSrc) return video.currentSrc;
        if (video && video.src && !video.src.startsWith('blob:')) return video.src;
        const source = document.querySelector('video source');
        if (source && source.src) return source.src;
        return null;
    }

    function waitForVideo(retries) {
        retries = retries || 0;
        if (retries > 30) return null;
        const url = getVideoUrl();
        if (url) return url;
        return null;
    }

    function addDownloadButton() {
        const target = document.querySelector('.video-info .info-holder .info-buttons')
            || document.querySelector('.info-buttons')
            || document.querySelector('.player-wrap');

        if (!target) return;
        if (document.querySelector('.thothub-dl-btn')) return;

        const container = document.createElement('div');
        container.style.cssText = 'margin: 6px 0; display: flex; align-items: center; flex-wrap: wrap;';

        const btn = document.createElement('a');
        btn.className = 'thothub-dl-btn';
        btn.textContent = '⏬ Pobierz wideo';
        btn.href = '#';

        const status = document.createElement('span');
        status.className = 'thothub-dl-status';

        container.appendChild(btn);
        container.appendChild(status);
        target.parentNode.insertBefore(container, target.nextSibling);

        function startDownload(videoUrl) {
            const title = sanitizeFilename(getVideoTitle());
            const filename = title ? title + '.mp4' : 'thothub_video.mp4';
            const path = DOWNLOAD_PATH + filename;

            btn.disabled = true;
            btn.textContent = '⏳ Pobieranie... (0%)';
            status.textContent = '';

            GM_xmlhttpRequest({
                method: 'GET',
                url: videoUrl,
                responseType: 'blob',
                headers: {
                    'Referer': window.location.origin + '/'
                },
                onprogress: function (e) {
                    if (e.lengthComputable) {
                        const pct = Math.round(e.loaded / e.total * 100);
                        btn.textContent = '⏳ Pobieranie... (' + pct + '%)';
                    }
                },
                onload: function (resp) {
                    if (resp.status >= 200 && resp.status < 300 && resp.response) {
                        btn.textContent = '⏳ Zapisywanie...';
                        const blob = resp.response;
                        const blobUrl = URL.createObjectURL(blob);

                        GM_download({
                            url: blobUrl,
                            name: path,
                            saveAs: false,
                            onload: function () {
                                URL.revokeObjectURL(blobUrl);
                                btn.disabled = false;
                                btn.textContent = '✅ Pobrano! (/' + DOWNLOAD_PATH + ')';
                                setTimeout(function () {
                                    btn.textContent = '⏬ Pobierz wideo';
                                }, 4000);
                            },
                            onerror: function () {
                                URL.revokeObjectURL(blobUrl);
                                saveViaAnchor(blob, filename, videoUrl);
                            }
                        });
                    } else {
                        fallbackOpenTab(videoUrl, 'Błąd serwera: ' + resp.status);
                    }
                },
                onerror: function () {
                    fallbackOpenTab(videoUrl, 'Błąd pobierania');
                },
                ontimeout: function () {
                    fallbackOpenTab(videoUrl, 'Przekroczono czas');
                },
                timeout: 120000
            });
        }

        function saveViaAnchor(blob, filename, videoUrl) {
            btn.textContent = '⏳ Zapisywanie (anchor)...';
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 10000);

            btn.disabled = false;
            btn.textContent = '✅ Pobrano! (domyślny folder)';
            setTimeout(function () {
                btn.textContent = '⏬ Pobierz wideo';
            }, 4000);
        }

        function fallbackOpenTab(videoUrl, msg) {
            btn.textContent = '⏬ Otwórz w nowej karcie';
            status.textContent = msg;
            btn.href = videoUrl;
            btn.target = '_blank';
            btn.rel = 'noopener noreferrer';
            btn.onclick = null;
            btn.disabled = false;
        }

        function tryDownload() {
            let videoUrl = getVideoUrl();

            if (videoUrl) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    startDownload(videoUrl);
                });
                return;
            }

            btn.textContent = '⏳ Czekam na wideo...';
            btn.disabled = true;

            var attempts = 0;
            var interval = setInterval(function () {
                attempts++;
                videoUrl = getVideoUrl();
                if (videoUrl) {
                    clearInterval(interval);
                    btn.disabled = false;
                    btn.textContent = '⏬ Pobierz wideo';
                    btn.addEventListener('click', function (e) {
                        e.preventDefault();
                        startDownload(videoUrl);
                    });
                } else if (attempts > 40) {
                    clearInterval(interval);
                    var fallbackUrl = getVideoUrl();
                    btn.textContent = fallbackUrl ? '⏬ Pobierz' : '⏬ Spróbuj pobrać';
                    btn.disabled = false;
                    btn.addEventListener('click', function (e) {
                        e.preventDefault();
                        startDownload(fallbackUrl || videoUrl);
                    });
                }
            }, 500);
        }

        tryDownload();
    }

    addDownloadButton();
})();
