// ==UserScript==
// @name         Chaturbot - Fullscreen stream (video only)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/02_cam/chaturbate/chaturbot.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/02_cam/chaturbate/chaturbot.user.js
// @description  Wypełnia okno przeglądarki tylko streamem video z chaturbot.co
// @author       You
// @match        http://chaturbot.co/*
// @match        https://chaturbot.co/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    if (/login|browse/i.test(window.location.href)) return;

    var mode = localStorage.getItem('chaturbot_mode') || 'stream';

    function addToggleBtn(label, nextMode) {
        var btn = document.createElement('div');
        btn.textContent = label;
        btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:10000;background:rgba(0,0,0,0.7);color:#fff;padding:8px 14px;border-radius:4px;cursor:pointer;font:14px sans-serif';
        btn.addEventListener('click', function() {
            localStorage.setItem('chaturbot_mode', nextMode);
            location.reload();
        });
        document.documentElement.appendChild(btn);
    }

    if (mode === 'normal') {
        addToggleBtn('Tryb stream', 'stream');
        return;
    }

    addToggleBtn('Normalny widok', 'normal');

    var room = window.location.pathname.replace(/^\//, '').replace(/\/$/, '');

    function injectVideo(hlsUrl) {
        document.title = room + ' - stream';

        var css = GM_addStyle;
        css('* { margin:0 !important; padding:0 !important; }');
        css('body { background:#000; overflow:hidden; }');
        css('html, body { width:100vw; height:100vh; }');

        var nav = document.querySelector('nav');
        if (nav) nav.remove();

        var all = document.body.children;
        for (var i = all.length - 1; i >= 0; i--) {
            if (all[i].tagName !== 'SCRIPT' && all[i].id !== 'video-container') {
                all[i].remove();
            }
        }

        var container = document.createElement('div');
        container.id = 'video-container';
        container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:#000';
        document.body.appendChild(container);

        if (hlsUrl) {
            var video = document.createElement('video');
            video.style.cssText = 'width:100%;height:100%;object-fit:contain';
            video.setAttribute('autoplay', '');
            video.setAttribute('controls', '');
            video.setAttribute('playsinline', '');
            video.muted = true;
            container.appendChild(video);

            var playHls = function() {
                if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                    var hls = new Hls();
                    hls.loadSource(hlsUrl);
                    hls.attachMedia(video);
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = hlsUrl;
                } else {
                    container.innerHTML = '<div style="color:#fff;text-align:center;padding:40vh 0;font-size:20px">HLS nie jest wspierany w tej przegl\u0105darce</div>';
                }
            };

            if (typeof Hls === 'undefined') {
                var s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                s.onload = playHls;
                s.onerror = function() {
                    if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = hlsUrl;
                    } else {
                        container.innerHTML = '<div style="color:#fff;text-align:center;padding:40vh 0;font-size:20px">Nie mo\u017Cna za\u0142adowa\u0107 hls.js</div>';
                    }
                };
                document.head.appendChild(s);
            } else {
                playHls();
            }
        } else {
            container.innerHTML = '<div style="color:#fff;text-align:center;padding:40vh 0">Nie znaleziono strumienia</div>';
        }
    }

    var triedUrls = [];

    function tryFetch(urls, idx) {
        if (idx >= urls.length) {
            injectVideo(null);
            return;
        }
        var url = urls[idx];
        triedUrls.push(url);
        console.log('Chaturbot fill: fetching', url);
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function(resp) {
                if (resp.status >= 400) {
                    console.log('Chaturbot fill: HTTP ' + resp.status + ' for ' + url);
                    tryFetch(urls, idx + 1);
                    return;
                }
                var html = resp.responseText;
                var match = html.match(/window\.initialRoomDossier\s*=\s*"([\s\S]*?)";/);
                if (match) {
                    var jsStr = match[1];
                    var jsonStr = jsStr.replace(/\\u([0-9a-fA-F]{4})/g, function(m, hex) {
                        return String.fromCharCode(parseInt(hex, 16));
                    });
                    try {
                        var data = JSON.parse(jsonStr);
                        if (data.hls_source) {
                            injectVideo(data.hls_source);
                            return;
                        }
                    } catch(e) {
                        console.log('Chaturbot fill: JSON parse error', e);
                    }
                } else {
                    console.log('Chaturbot fill: no initialRoomDossier found in ' + url);
                }
                tryFetch(urls, idx + 1);
            },
            onerror: function() {
                console.log('Chaturbot fill: request error for ' + url);
                tryFetch(urls, idx + 1);
            }
        });
    }

    if (room && room !== '') {
        var urls = [
            'https://chaturbate.com/embed/' + room + '/',
            'https://chaturbate.com/' + room + '/',
            'https://chaturbate.com/embed/' + room + '/?embed_type=slider'
        ];
        tryFetch(urls, 0);
    }
})();
