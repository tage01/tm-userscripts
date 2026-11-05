// ==UserScript==
// @name         Chaturbot - Fullscreen stream (video only)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/02_cam/chaturbate/chaturbot_fill.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/02_cam/chaturbate/chaturbot_fill.user.js
// @description  Przełącznik widoku: normalny / wypełniający okno + screenshot
// @author       You
// @match        http://chaturbot.co/*
// @match        https://chaturbot.co/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    var room = window.location.pathname.replace(/^\//, '').replace(/\/$/, '');
    if (!room) return;

    var hlsSource = null;
    var hlsInstance = null;

    function goFullscreen() {
        localStorage.setItem('cb_mode', 'full');
        document.title = room + ' - stream';

        GM_addStyle('body,html{margin:0!important;padding:0!important}');
        GM_addStyle('body{background:#000;overflow:hidden}');
        GM_addStyle('html,body{width:100vw;height:100vh}');

        var followOrig = document.getElementById('followbutton');
        if (followOrig && followOrig.parentNode !== document.body) {
            document.body.appendChild(followOrig);
        }
        if (followOrig) followOrig.style.display = 'none';

        var nav = document.querySelector('nav');
        if (nav) nav.remove();

        var all = document.body.children;
        for (var i = all.length - 1; i >= 0; i--) {
            var el = all[i];
            if (el.tagName === 'SCRIPT' || el.id === 'video-container' || el.id === 'toggle-btn' || el.id === 'screenshot-btn' || el === followOrig) continue;
            el.remove();
        }

        var container = document.getElementById('video-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'video-container';
            container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:#000';
            document.body.appendChild(container);
        }

        createVideo();
        addToggle();
        addFollow(followOrig);
        addRefreshButton();
        screenshotBtn();
    }

    function addFollow(origBtn) {
        if (!origBtn) return;
        origBtn.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;display:block';

        var overlayBtn = document.createElement('div');
        overlayBtn.id = 'follow-btn-custom';
        overlayBtn.style.cssText = 'position:fixed;top:calc(50% + 5px);right:44px;z-index:99999;width:32px;height:32px;line-height:32px;text-align:center;font-size:16px;border:none;border-radius:4px;background:rgba(80,80,80,0.7);color:#fff;cursor:pointer;user-select:none;text-decoration:none;display:block;padding:0';
        overlayBtn.onmouseenter = function() { overlayBtn.style.background = 'rgba(80,80,80,0.9)'; };
        overlayBtn.onmouseleave = function() { overlayBtn.style.background = 'rgba(80,80,80,0.7)'; };
        overlayBtn.addEventListener('click', function(e) {
            e.preventDefault();
            var b = document.getElementById('followbutton');
            if (b) b.click();
        });
        document.body.appendChild(overlayBtn);

        function sync() {
            var b = document.getElementById('followbutton');
            if (!b || b === overlayBtn) return;
            b.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;display:block';
            var html = b.innerHTML.toLowerCase();
            var followed = html.indexOf('glyphicon-ok') > -1 || html.indexOf('following') > -1 || html.indexOf('unfollow') > -1 || html.indexOf('favorited') > -1;
            overlayBtn.innerHTML = followed ? '\u2764' : '\u002B';
        }
        sync();
        setInterval(sync, 1000);
    }

    function initVideo(video) {
        if (!hlsSource) return;
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hlsInstance = new Hls();
            hlsInstance.on(Hls.Events.MEDIA_ATTACHED, function onAttached() {
                hlsInstance.off(Hls.Events.MEDIA_ATTACHED, onAttached);
                hlsInstance.loadSource(hlsSource);
                video.play()['catch'](function(){});
            });
            hlsInstance.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = hlsSource;
        }
    }

    function createVideo() {
        var container = document.getElementById('video-container');
        if (!container) return;
        container.innerHTML = '';

        if (!hlsSource) {
            container.innerHTML = '<div style="color:#fff;text-align:center;padding:40vh 0">Strumie\u0144 niedost\u0119pny</div>';
            return;
        }

        var video = createVideoElement(container);

        if (typeof Hls === 'undefined') {
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
            s.onload = function() { initVideo(video); };
            s.onerror = function() {
                if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = hlsSource;
                } else {
                    container.innerHTML = '<div style="color:#fff;text-align:center;padding:40vh 0;font-size:20px">Nie mo\u017Cna za\u0142adowa\u0107 hls.js</div>';
                }
            };
            document.head.appendChild(s);
        } else {
            initVideo(video);
        }
    }

    function createVideoElement(container) {
        var video = document.createElement('video');
        video.style.cssText = 'width:100%;height:100%;object-fit:contain';
        video.setAttribute('autoplay', '');
        video.setAttribute('controls', '');
        video.setAttribute('playsinline', '');
        video.muted = true;
        container.appendChild(video);
        return video;
    }

    function extractHlsSource(html) {
        var match = html.match(/window\.initialRoomDossier\s*=\s*"([\s\S]*?)";/);
        if (!match) return null;
        var jsStr = match[1];
        var jsonStr = jsStr.replace(/\\u([0-9a-fA-F]{4})/g, function(m, hex) {
            return String.fromCharCode(parseInt(hex, 16));
        });
        try {
            var data = JSON.parse(jsonStr);
            return data.hls_source || null;
        } catch(e) { return null; }
    }

    function refreshStream() {
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }
        var container = document.getElementById('video-container');
        if (!container) return false;
        container.innerHTML = '<div style="color:#fff;text-align:center;padding:40vh 0;font-size:16px">\u0141adowanie...</div>';

        var urls = [
            'https://chaturbate.com/embed/' + room + '/',
            'https://chaturbate.com/' + room + '/',
            'https://chaturbate.com/embed/' + room + '/?embed_type=slider'
        ];

        function fetchFresh(idx) {
            if (idx >= urls.length) {
                container.innerHTML = '<div style="color:#fff;text-align:center;padding:40vh 0">Nie mo\u017Cna od\u015Bwie\u017Cy\u0107</div>';
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: urls[idx],
                onload: function(resp) {
                    if (resp.status >= 400) { fetchFresh(idx + 1); return; }
                    var src = extractHlsSource(resp.responseText);
                    if (src) {
                        hlsSource = src;
                        container.innerHTML = '';
                        var video = createVideoElement(container);
                        setTimeout(function() { initVideo(video); }, 100);
                        return;
                    }
                    fetchFresh(idx + 1);
                },
                onerror: function() { fetchFresh(idx + 1); }
            });
        }
        fetchFresh(0);
        return true;
    }

    function addRefreshButton() {
        var existing = document.getElementById('refresh-btn');
        if (existing) existing.remove();

        var btn = document.createElement('div');
        btn.id = 'refresh-btn';
        btn.title = 'Od\u015Bwie\u017C stream';
        btn.textContent = '\u21BB';
        btn.style.cssText = 'position:fixed;top:calc(50% + 5px);right:6px;z-index:99999;width:32px;height:32px;line-height:32px;text-align:center;font-size:18px;border:none;border-radius:4px;background:rgba(80,80,80,0.7);color:#fff;cursor:pointer;user-select:none';
        btn.addEventListener('mouseenter', function() { btn.style.background = 'rgba(80,80,80,0.9)'; });
        btn.addEventListener('mouseleave', function() { btn.style.background = 'rgba(80,80,80,0.7)'; });
        btn.addEventListener('click', function() { if (!refreshStream()) createVideo(); });
        document.body.appendChild(btn);
    }

    function captureScreenshot(video) {
        var w = video.videoWidth || video.clientWidth;
        var h = video.videoHeight || video.clientHeight;
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);
        var roomName = window.location.pathname.replace(/^\//, '').replace(/\/$/, '') || 'chaturbot';
        var link = document.createElement('a');
        link.download = roomName + '_' + Date.now() + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    function screenshotBtn() {
        var existing = document.getElementById('screenshot-btn');
        if (existing) return;

        var btn = document.createElement('div');
        btn.id = 'screenshot-btn';
        btn.textContent = '\u25C9';
        btn.title = 'Zapisz klatk\u0119';
        btn.style.cssText = 'position:fixed;top:calc(50% - 37px);right:44px;z-index:99999;width:32px;height:32px;line-height:32px;text-align:center;font-size:18px;border:none;border-radius:4px;background:rgba(80,80,80,0.7);color:#fff;cursor:pointer;user-select:none';
        btn.addEventListener('mouseenter', function() { btn.style.background = 'rgba(80,80,80,0.9)'; });
        btn.addEventListener('mouseleave', function() { btn.style.background = 'rgba(80,80,80,0.7)'; });
        btn.addEventListener('click', function() {
            var v = document.querySelector('#video-container video, video');
            if (v) captureScreenshot(v);
        });
        document.body.appendChild(btn);
    }

    function addToggle() {
        var existing = document.getElementById('toggle-btn');
        if (existing) existing.remove();

        var btn = document.createElement('div');
        btn.id = 'toggle-btn';
        btn.title = 'Widok normalny';
        btn.textContent = '\u2715';
        btn.style.cssText = 'position:fixed;top:calc(50% - 37px);right:6px;z-index:99999;width:32px;height:32px;line-height:32px;text-align:center;font-size:18px;border:none;border-radius:4px;background:rgba(80,80,80,0.7);color:#fff;cursor:pointer;user-select:none';
        btn.addEventListener('mouseenter', function() { btn.style.background = 'rgba(80,80,80,0.9)'; });
        btn.addEventListener('mouseleave', function() { btn.style.background = 'rgba(80,80,80,0.7)'; });
        btn.addEventListener('click', function() {
            localStorage.setItem('cb_mode', 'normal');
            location.reload();
        });
        document.body.appendChild(btn);
    }

    var tried = [];

    function tryFetch(urls, idx) {
        if (idx >= urls.length) return;
        var url = urls[idx];
        tried.push(url);
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function(resp) {
                if (resp.status >= 400) { tryFetch(urls, idx + 1); return; }
                var src = extractHlsSource(resp.responseText);
                if (src) {
                    hlsSource = src;
                    if (localStorage.getItem('cb_mode') !== 'normal') {
                        goFullscreen();
                    } else {
                        addToggleNormal();
                    }
                    return;
                }
                tryFetch(urls, idx + 1);
            },
            onerror: function() { tryFetch(urls, idx + 1); }
        });
    }

    function addToggleNormal() {
        var btn = document.createElement('div');
        btn.id = 'toggle-btn';
        btn.title = 'Widok pe\u0142ny';
        btn.textContent = '\u26F6';
        btn.style.cssText = 'position:fixed;top:60px;right:6px;z-index:99999;width:32px;height:32px;line-height:32px;text-align:center;font-size:18px;border:none;border-radius:4px;background:rgba(80,80,80,0.7);color:#fff;cursor:pointer;user-select:none';
        btn.addEventListener('mouseenter', function() { btn.style.background = 'rgba(80,80,80,0.9)'; });
        btn.addEventListener('mouseleave', function() { btn.style.background = 'rgba(80,80,80,0.7)'; });
        btn.addEventListener('click', goFullscreen);
        document.body.appendChild(btn);

        function tryScreenshot() {
            if (document.getElementById('screenshot-btn')) return;
            var video = document.querySelector('video');
            if (video && video.readyState >= 2) screenshotBtn();
        }
        setTimeout(function() { tryScreenshot(); }, 1000);
        var si = setInterval(tryScreenshot, 500);
        setTimeout(function() { clearInterval(si); }, 180000);
        var obsScreenshot = new MutationObserver(function() { tryScreenshot(); });
        obsScreenshot.observe(document.documentElement, { childList: true, subtree: true });
    }

    var urls = [
        'https://chaturbate.com/embed/' + room + '/',
        'https://chaturbate.com/' + room + '/',
        'https://chaturbate.com/embed/' + room + '/?embed_type=slider'
    ];
    tryFetch(urls, 0);
})();
