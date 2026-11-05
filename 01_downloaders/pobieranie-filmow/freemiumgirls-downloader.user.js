// ==UserScript==
// @name         FreemiumGirls Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/freemiumgirls-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/freemiumgirls-downloader.user.js
// @description  Pobiera wideo z freemiumgirls.com – API /api/media-token + Fluid Player
// @author       opencode
// @match        *://freemiumgirls.com/video/*
// @match        *://freemiumgirls.com/video-player/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=freemiumgirls.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @connect      freemiumgirls.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const API_ENDPOINT = '/api/media-token';
    let currentRequest = null;
    let progressEl = null;

    GM_addStyle(`
        .fg-dl-btn-wrap {
            position: absolute; z-index: 99999; pointer-events: auto;
            top: 10px; right: 10px; display: flex; gap: 6px; flex-direction: column;
        }
        .fg-dl-btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            padding: 8px 14px; border: none; border-radius: 8px; cursor: pointer;
            font-size: 13px; font-weight: 600; font-family: Arial, sans-serif;
            color: #fff; background: linear-gradient(135deg, #e91e63, #9c27b0);
            box-shadow: 0 2px 12px rgba(233,30,99,0.4);
            transition: all 0.2s ease; backdrop-filter: blur(4px); user-select: none;
        }
        .fg-dl-btn:hover { transform: scale(1.08); }
        .fg-dl-btn:active { transform: scale(0.95); }
        .fg-dl-progress {
            position: fixed; z-index: 999999; top: 20px; right: 20px; width: 320px;
            font-family: Arial, sans-serif;
        }
        .fg-dl-progress-bar {
            width: 100%; height: 6px; background: #333; border-radius: 3px;
            overflow: hidden; margin-top: 8px;
        }
        .fg-dl-progress-fill {
            height: 100%; width: 0%;
            background: linear-gradient(90deg, #e91e63, #9c27b0);
            border-radius: 3px; transition: width 0.3s;
        }
        .fg-dl-cancel-btn {
            margin-top: 8px; padding: 4px 12px; border: 1px solid #555;
            border-radius: 4px; cursor: pointer; font-size: 11px;
            color: #ccc; background: #333;
        }
        .fg-dl-cancel-btn:hover { background: #555; color: #fff; }
    `);

    function notify(msg, type = 'info') {
        const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336' };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;opacity:1;' +
            'transition:opacity 0.4s;font-family:Arial,sans-serif;pointer-events:none;';
        el.innerHTML = '<div style="background:' + colors[type] + ';color:#fff;padding:12px 20px;' +
            'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-size:14px;">' + msg + '</div>';
        document.body.appendChild(el);
        setTimeout(function () { el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 400); }, 4000);
    }

    function showProgress(filename) {
        if (progressEl) progressEl.remove();
        progressEl = document.createElement('div');
        progressEl.className = 'fg-dl-progress';
        progressEl.innerHTML = '<div style="background:#1a1a2e;color:#fff;padding:12px 20px;' +
            'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.8);font-size:13px;">' +
            '<div style="margin-bottom:4px;">Pobieranie: <strong>' + filename + '</strong></div>' +
            '<div style="font-size:11px;color:#aaa;" class="fg-dl-progress-text">0%</div>' +
            '<div class="fg-dl-progress-bar"><div class="fg-dl-progress-fill"></div></div>' +
            '<div style="margin-top:8px;"><button class="fg-dl-cancel-btn">Anuluj</button></div></div>';
        progressEl.querySelector('.fg-dl-cancel-btn').addEventListener('click', function () {
            if (currentRequest) currentRequest.abort();
            notify('Anulowano', 'info');
            removeProgress();
        });
        document.body.appendChild(progressEl);
        return progressEl;
    }

    function updateProgress(pct) {
        if (!progressEl) return;
        var fill = progressEl.querySelector('.fg-dl-progress-fill');
        var text = progressEl.querySelector('.fg-dl-progress-text');
        if (fill) fill.style.width = Math.min(pct, 100) + '%';
        if (text) text.textContent = Math.round(pct) + '%';
    }

    function removeProgress() {
        if (!progressEl) return;
        progressEl.style.opacity = '0';
        setTimeout(function () {
            if (progressEl) { progressEl.remove(); progressEl = null; }
        }, 400);
    }

    function getSlug() {
        var path = window.location.pathname;
        var match = path.match(/\/video(?:-player)?\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    function getTitle() {
        var h1 = document.querySelector('h1');
        if (h1 && h1.textContent.trim()) return h1.textContent.trim();
        var og = document.querySelector('meta[property="og:title"]');
        if (og && og.content) return og.content.trim();
        var title = document.title;
        return title ? title.replace(/\s*[-–|].*$/, '').trim() : 'video';
    }

    function sanitizeFilename(name) {
        return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 120);
    }

    function fetchMediaToken(slug, signal) {
        return fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: slug }),
            signal: signal,
        }).then(function (resp) {
            return resp.json().then(function (data) {
                if (!resp.ok) throw new Error(data.error || 'Media token failed: ' + resp.status);
                if (!data.src || !data.type) throw new Error('Media token response invalid.');
                return data;
            });
        });
    }

    function downloadVideo(url, filename) {
        showProgress(filename);
        currentRequest = GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            headers: { Referer: location.href },
            onprogress: function (e) {
                if (e.total > 0) updateProgress((e.done / e.total) * 100);
            },
            onload: function (resp) {
                currentRequest = null;
                if (resp.status >= 200 && resp.status < 300) {
                    updateProgress(100);
                    setTimeout(function () { removeProgress(); }, 500);
                    notify('Pobrano!', 'success');
                    var blobUrl = URL.createObjectURL(resp.response);
                    GM_download({
                        url: blobUrl, name: filename, saveAs: false,
                        onerror: function () {
                            var a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(function () { a.remove(); URL.revokeObjectURL(blobUrl); }, 5000);
                        }
                    });
                } else {
                    removeProgress();
                    notify('Błąd HTTP ' + resp.status, 'error');
                }
            },
            onerror: function () {
                currentRequest = null;
                removeProgress();
                notify('Błąd pobierania', 'error');
            },
            ontimeout: function () {
                currentRequest = null;
                removeProgress();
                notify('Timeout', 'error');
            },
        });
    }

    function injectUI() {
        var slug = getSlug();
        if (!slug) {
            notify('Nie udało się wyodrębnić sluga z URL.', 'error');
            return;
        }

        var title = sanitizeFilename(getTitle());
        var filename = title + '.mp4';

        var player = document.querySelector('.fg-fluid-player-shell, [class*="playerShell"], [class*="player"]');
        var container = player || document.querySelector('[class*="embed"]') || document.querySelector('main') || document.body;

        if (container && container !== document.body) {
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
        }

        var btnDiv = document.createElement('div');
        btnDiv.className = 'fg-dl-btn-wrap';

        var dlBtn = document.createElement('button');
        dlBtn.className = 'fg-dl-btn';
        dlBtn.textContent = 'Pobierz wideo';
        dlBtn.addEventListener('click', function () {
            dlBtn.disabled = true;
            dlBtn.textContent = 'Ładowanie tokena...';

            fetchMediaToken(slug, null).then(function (media) {
                dlBtn.textContent = 'Pobieranie...';
                var mediaFilename = sanitizeFilename(title) + '.mp4';
                downloadVideo(media.src, mediaFilename);
            }).catch(function (err) {
                dlBtn.disabled = false;
                dlBtn.textContent = 'Pobierz wideo';
                notify('Błąd: ' + err.message, 'error');
            });
        });

        btnDiv.appendChild(dlBtn);

        if (container && container !== document.body) {
            container.appendChild(btnDiv);
        } else {
            btnDiv.style.position = 'fixed';
            btnDiv.style.top = '10px';
            btnDiv.style.right = '10px';
            btnDiv.style.zIndex = '99999';
            document.body.appendChild(btnDiv);
        }
    }

    GM_registerMenuCommand('Pobierz wideo', function () { injectUI(); });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(injectUI, 2000);
        });
    } else {
        setTimeout(injectUI, 2000);
    }
})();
