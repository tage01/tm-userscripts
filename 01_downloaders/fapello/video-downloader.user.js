// ==UserScript==
// @name         Video Downloader - ecamrips
// @namespace    http://tampermonkey.net/
// @version      7.4
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/fapello/video-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/fapello/video-downloader.user.js
// @description  Downloads videos from ecamrips.com
// @match        *://*.ecamrips.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    if (window.self !== window.top) return;

    console.log('[VD] v7.4 starting on', location.href);

    var state = {
        videoUrl: null,
        referrer: null,
        panel: null,
        body: null,
        found: false
    };

    GM_addStyle([
        '#vd-panel{position:fixed!important;bottom:10px!important;right:10px!important;z-index:2147483647!important;background:#1a1a2e!important;color:#eee!important;border-radius:12px!important;box-shadow:0 4px 24px rgba(0,0,0,0.6)!important;font-family:Segoe UI,Tahoma,sans-serif!important;font-size:13px!important;min-width:340px!important;max-height:420px!important;overflow:hidden!important;border:1px solid #444!important}',
        '#vd-panel.minimized #vd-body{display:none!important}',
        '#vd-header{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:8px 14px!important;background:#16213e!important;cursor:move!important;user-select:none!important;border-bottom:1px solid #444!important}',
        '#vd-header .vd-title{font-weight:600!important;font-size:14px!important;color:#00d4ff!important}',
        '#vd-header .vd-btns button{background:none!important;border:none!important;color:#aaa!important;font-size:16px!important;cursor:pointer!important;margin-left:6px!important;padding:2px 6px!important}',
        '#vd-header .vd-btns button:hover{color:#fff!important}',
        '#vd-body{padding:12px!important;max-height:340px!important;overflow-y:auto!important}',
        '.vd-empty{text-align:center!important;color:#888!important;padding:14px 10px!important}',
        '.vd-log{font-size:11px!important;color:#aaa!important;padding:2px 0!important;border-bottom:1px solid #333!important}',
        '.vd-log .ts{color:#555!important}',
        '.vd-log .ok{color:#4caf50!important}',
        '.vd-log .fail{color:#f44336!important}',
        '.vd-log .info{color:#2196f3!important}',
        '.vd-log .warn{color:#ff9800!important}',
        '.vd-found{background:#0f3460!important;border-radius:8px!important;padding:12px!important;margin-bottom:10px!important;border:1px solid #1a1a5e!important;word-break:break-all!important}',
        '.vd-found .vd-title{font-weight:600;color:#00d4ff;font-size:12px;margin-bottom:4px}',
        '.vd-found .vd-meta{font-size:11px;color:#888;margin-bottom:10px}',
        '#vd-progress-wrap{background:#1a1a3e!important;border-radius:6px!important;height:28px!important;overflow:hidden!important;border:1px solid #333!important;margin:8px 0!important;position:relative}',
        '#vd-progress-bar{width:0%;height:100%;background:linear-gradient(90deg,#00d4ff,#0088cc)!important;transition:width .3s!important}',
        '#vd-progress-text{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8)}',
        '#vd-dl-btn{width:100%;padding:10px;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;background:#00d4ff;color:#000}',
        '#vd-dl-btn:disabled{background:#333!important;color:#888!important;cursor:not-allowed!important}',
        '.vd-actions{display:flex;flex-direction:column;gap:6px;margin-top:8px}',
        '.vd-actions button{padding:8px;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600}',
        '.vd-actions .vd-act-play{background:#333;color:#ff9800;border:1px solid #555!important}',
        '.vd-actions .vd-act-scan{background:#0f3460;color:#00d4ff;border:1px solid #1a1a5e!important}'
    ].join(''));

    function log(msg, type) {
        var t = new Date().toLocaleTimeString();
        var cls = type || 'info';
        console.log('[VD] [' + t + ']', msg);
        if (state.body) {
            var d = document.createElement('div');
            d.className = 'vd-log';
            d.innerHTML = '<span class="ts">[' + t + ']</span> <span class="' + cls + '">' + esc(msg) + '</span>';
            state.body.appendChild(d);
            state.body.scrollTop = state.body.scrollHeight;
        }
    }

    function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[m]; }); }

    function shortUrl(u) { try { return new URL(u).pathname.split('/').filter(Boolean).pop() || u; } catch { return u; } }

    function formatSize(bytes) {
        if (!bytes || bytes < 0) return '?';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function initPanel() {
        if (document.getElementById('vd-panel') || !document.body) return false;
        state.panel = document.createElement('div'); state.panel.id = 'vd-panel';
        state.panel.innerHTML = [
            '<div id="vd-header">',
                '<span class="vd-title">Video Downloader</span>',
                '<div class="vd-btns">',
                    '<button id="vd-min" title="Minimize">-</button>',
                    '<button id="vd-close" title="Close">x</button>',
                '</div>',
            '</div>',
            '<div id="vd-body"><div class="vd-empty">Initializing...</div></div>'
        ].join('');
        document.body.appendChild(state.panel);
        state.body = state.panel.querySelector('#vd-body');

        var drag = false, dx, dy;
        state.panel.querySelector('#vd-header').addEventListener('mousedown', function (e) {
            if (e.target.tagName === 'BUTTON') return;
            drag = true; dx = e.clientX - state.panel.offsetLeft; dy = e.clientY - state.panel.offsetTop;
        });
        document.addEventListener('mousemove', function (e) {
            if (!drag) return;
            state.panel.style.left = (e.clientX - dx) + 'px'; state.panel.style.top = (e.clientY - dy) + 'px';
            state.panel.style.right = 'auto'; state.panel.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', function () { drag = false; });
        document.getElementById('vd-min').onclick = function () { state.panel.classList.toggle('minimized'); };
        document.getElementById('vd-close').onclick = function () { state.panel.style.display = 'none'; };
        return true;
    }

    function setEmpty(html) {
        if (state.body) state.body.innerHTML = '<div class="vd-empty">' + html + '</div>';
    }

    function showFound(url, ref) {
        state.videoUrl = url;
        state.referrer = ref;
        state.found = true;
        if (!state.body) return;
        var ext = (url.match(/\.(\w+)(\?|$)/) || [])[1] || 'mp4';
        state.body.innerHTML = [
            '<div class="vd-found">',
                '<div class="vd-title">' + esc(shortUrl(url)) + '</div>',
                '<div class="vd-meta">' + ext.toUpperCase() + '</div>',
                '<div id="vd-progress-wrap" style="display:none">',
                    '<div id="vd-progress-bar"></div>',
                    '<div id="vd-progress-text">0%</div>',
                '</div>',
                '<button id="vd-dl-btn">Download</button>',
                '<button id="vd-cancel-btn" style="display:none;width:100%;padding:6px;margin-top:4px;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;background:#500;color:#f88">Cancel</button>',
            '</div>'
        ].join('');
        document.getElementById('vd-dl-btn').onclick = function () {
            startDownload(url, ref);
        };
    }

    var currentRequest = null;

    function setProgress(pct, label, done) {
        var wrap = document.getElementById('vd-progress-wrap');
        var bar = document.getElementById('vd-progress-bar');
        var txt = document.getElementById('vd-progress-text');
        var btn = document.getElementById('vd-dl-btn');
        var cancel = document.getElementById('vd-cancel-btn');
        if (wrap) wrap.style.display = '';
        if (bar) bar.style.width = Math.min(pct, 100) + '%';
        if (txt) txt.textContent = label || Math.round(pct) + '%';
        if (btn) {
            if (done) {
                btn.textContent = 'Download';
                btn.disabled = false;
                if (cancel) cancel.style.display = 'none';
            } else if (pct >= 100) {
                btn.textContent = 'Done';
                btn.disabled = false;
                if (cancel) cancel.style.display = 'none';
            } else {
                btn.textContent = 'Downloading...';
                btn.disabled = true;
                if (cancel) cancel.style.display = '';
            }
        }
    }

    // ---- Iframe access ----
    function findPlayerIframe() {
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
            if (iframes[i].id === 'videomoi') return iframes[i];
        }
        for (var i = 0; i < iframes.length; i++) {
            var src = iframes[i].src || '';
            if (src.indexOf('loading_video') !== -1 || src.indexOf('play.php') !== -1) return iframes[i];
        }
        if (iframes.length > 0) return iframes[0];
        return null;
    }

    function accessIframeDoc(ifr) {
        try {
            if (!ifr) return null;
            return ifr.contentDocument || ifr.contentWindow.document;
        } catch (e) {
            return null;
        }
    }

    function getIframeUrl(ifr) {
        if (!ifr) return null;
        try { return ifr.src || ifr.contentWindow.location.href; } catch (e) { return ifr.src; }
    }

    function scanDocForVideo(doc) {
        if (!doc) return null;
        var videos = doc.querySelectorAll('video');
        for (var i = 0; i < videos.length; i++) {
            var v = videos[i];
            if (v.currentSrc && v.currentSrc.indexOf('blob:') !== 0) return v.currentSrc;
            if (v.src && v.src.indexOf('blob:') !== 0) return v.src;
        }
        var sources = doc.querySelectorAll('video source');
        for (var i = 0; i < sources.length; i++) {
            var s = sources[i];
            if (s.src && s.src.indexOf('blob:') !== 0) return s.src;
        }
        var scripts = doc.querySelectorAll('script:not([src])');
        for (var i = 0; i < scripts.length; i++) {
            var m = scripts[i].textContent.match(/["'](https?:\/\/[^"']+\.(mp4|m3u8)[^"']*)["']/i);
            if (m) return m[1];
        }
        return null;
    }

    function clickPlayInIframe(ifr) {
        if (!ifr) return;
        try {
            var doc = ifr.contentDocument || ifr.contentWindow.document;
            if (!doc) return;
            var ids = ['playButton', 'play', 'btn-play', 'video-play', 'start-btn'];
            for (var i = 0; i < ids.length; i++) {
                var btn = doc.getElementById(ids[i]);
                if (btn) { btn.click(); log('Clicked #' + ids[i], 'ok'); return; }
            }
            var classes = ['.play-button', '.play-btn', '.video-play', '.start-button'];
            for (var i = 0; i < classes.length; i++) {
                var btn = doc.querySelector(classes[i]);
                if (btn) { btn.click(); log('Clicked ' + classes[i], 'ok'); return; }
            }
            if (typeof ifr.contentWindow.playVideoFunction === 'function') {
                ifr.contentWindow.playVideoFunction();
                log('Called playVideoFunction()', 'ok');
                return;
            }
        } catch (e) {}
    }

    // ---- Download ----
    function startDownload(url, ref) {
        var btn = document.getElementById('vd-dl-btn');
        var cancelBtn = document.getElementById('vd-cancel-btn');

        var refUrl = ref || getIframeUrl(findPlayerIframe()) || location.href;
        log('Download: ' + url, 'info');
        log('Referer: ' + refUrl, 'info');

        setProgress(0, 'Starting...');

        currentRequest = GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            headers: { 'Referer': refUrl },
            responseType: 'blob',
            onload: function (resp) {
                currentRequest = null;
                if (resp.response && resp.response.size > 0) {
                    setProgress(100, 'Saving...');
                    var blobUrl = URL.createObjectURL(resp.response);
                    var a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = 'video_' + Date.now() + '.mp4';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(function () {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(blobUrl);
                    }, 5000);
                    log('Done (' + formatSize(resp.response.size) + ')', 'ok');
                    setProgress(100, 'Complete!', true);
                } else {
                    log('Empty response', 'fail');
                    setProgress(0, 'Error: empty', true);
                }
            },
            onerror: function (err) {
                currentRequest = null;
                if (err && err.aborted) {
                    log('Download cancelled', 'warn');
                    setProgress(0, 'Cancelled', true);
                } else {
                    log('Download error: ' + JSON.stringify(err), 'fail');
                    setProgress(0, 'Error', true);
                }
            },
            onprogress: function (p) {
                if (p.total > 0) {
                    var pct = (p.loaded / p.total) * 100;
                    setProgress(pct, Math.round(pct) + '% (' + formatSize(p.loaded) + '/' + formatSize(p.total) + ')');
                } else {
                    setProgress(0, formatSize(p.loaded) + '...');
                }
            },
            ontimeout: function () {
                currentRequest = null;
                log('Download timeout', 'fail');
                setProgress(0, 'Timeout', true);
            },
            onabort: function () {
                currentRequest = null;
                log('Download aborted', 'warn');
                setProgress(0, 'Cancelled', true);
            }
        });

        cancelBtn.onclick = function () {
            if (currentRequest) {
                log('Cancelling download...', 'warn');
                currentRequest.abort();
                currentRequest = null;
                cancelBtn.style.display = 'none';
            }
        };
    }

    // ---- Main ----
    function start() {
        if (!initPanel()) { setTimeout(start, 300); return; }
        log('Panel created');

        var ifr = findPlayerIframe();

        if (!ifr) {
            log('No iframe found', 'fail');
            setEmpty('No iframe found');
            return;
        }

        log('Iframe: id="' + (ifr.id || '') + '" src="' + (getIframeUrl(ifr) || '') + '"');

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'vd-actions';
        actionsDiv.innerHTML = [
            '<button class="vd-act-play" id="vd-act-play">Click Play in Iframe</button>',
            '<button class="vd-act-scan" id="vd-act-scan">Find Video</button>'
        ].join('');
        state.body.appendChild(actionsDiv);

        document.getElementById('vd-act-play').onclick = function () {
            log('Clicking play...', 'info');
            clickPlayInIframe(ifr);
        };

        document.getElementById('vd-act-scan').onclick = function () {
            log('Scanning iframe...', 'info');
            var doc = accessIframeDoc(ifr);
            if (!doc) { setEmpty('Cannot access iframe'); return; }
            var url = scanDocForVideo(doc);
            var ref = getIframeUrl(ifr);
            if (url) {
                log('Found: ' + url, 'ok');
                showFound(url, ref);
            } else {
                log('No video found', 'warn');
                log('Title: ' + (doc.title || '(none)'), 'info');
            }
        };

        setTimeout(function () {
            var doc = accessIframeDoc(ifr);
            if (!doc) return;

            var url = scanDocForVideo(doc);
            if (url) {
                log('Found: ' + url, 'ok');
                showFound(url, getIframeUrl(ifr));
                return;
            }

            var iframeUrl = getIframeUrl(ifr);
            if (iframeUrl && iframeUrl.indexOf('loading_video') !== -1) {
                log('Loading page, clicking play...');
                clickPlayInIframe(ifr);
                var polls = 0;
                var iv = setInterval(function () {
                    polls++;
                    var doc2 = accessIframeDoc(ifr);
                    if (!doc2) return;
                    var u = scanDocForVideo(doc2);
                    if (u) {
                        clearInterval(iv);
                        log('Found: ' + u, 'ok');
                        showFound(u, getIframeUrl(ifr));
                    } else if (polls > 30) {
                        clearInterval(iv);
                        log('Timed out', 'warn');
                    }
                }, 1000);
            } else {
                var polls2 = 0;
                var iv2 = setInterval(function () {
                    polls2++;
                    var doc2 = accessIframeDoc(ifr);
                    if (!doc2) return;
                    var u = scanDocForVideo(doc2);
                    if (u) {
                        clearInterval(iv2);
                        log('Found: ' + u, 'ok');
                        showFound(u, getIframeUrl(ifr));
                    } else if (polls2 > 20) {
                        clearInterval(iv2);
                    }
                }, 1000);
            }
        }, 1500);
    }

    start();
})();
