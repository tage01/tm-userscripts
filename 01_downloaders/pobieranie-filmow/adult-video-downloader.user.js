// ==UserScript==
// @name         Universal Adult Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/adult-video-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/adult-video-downloader.user.js
// @description  Pobieraj filmy ze stron wideo dla dorosłych
// @author       opencode
// @match        *://*.webpussi.com/*
// @match        *://*.eporner.com/*
// @match        *://*.camwhores.tv/*
// @match        *://*.camwhores.com/*
// @match        *://*.cam4.com/*
// @match        *://*.chaturbate.com/*
// @match        *://*.xvideos.com/*
// @match        *://*.xnxx.com/*
// @match        *://*.pornhub.com/*
// @match        *://*.xhamster.com/*
// @match        *://*.redtube.com/*
// @match        *://*.youporn.com/*
// @match        *://*.spankbang.com/*
// @match        *://*.tube8.com/*
// @match        *://*.tnaflix.com/*
// @match        *://*.porntrex.com/*
// @match        *://*.hclips.com/*
// @match        *://*.txxx.com/*
// @match        *://*.hdzog.com/*
// @match        *://*.vjav.com/*
// @match        *://*.javlibrary.com/*
// @match        *://*.drtuber.com/*
// @match        *://*.nuvid.com/*
// @match        *://*.zbporn.com/*
// @match        *://*.anysex.com/*
// @match        *://*.gotporn.com/*
// @match        *://*.efukt.com/*
// @match        *://*.shortyvideos.com/*
// @match        *://*.playvids.com/*
// @match        *://*.fapvid.com/*
// @match        *://*.fux.com/*
// @match        *://*.thumbzilla.com/*
// @match        *://*.daftsex.com/*
// @match        *://*.missav.com/*
// @match        *://*.jav.guru/*
// @match        *://*.javhub.net/*
// @match        *://*.18vr.com/*
// @match        *://*.mrdeepfakes.com/*
// @match        *://*.pimpbunny.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pornhub.com
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        HOTKEY: 'p', // naciśnij P aby pobrać
        BUTTON_POSITION: 'top-right', // top-right, top-left, bottom-right, bottom-left
        AUTO_DETECT: true,
        SHOW_NOTIFICATIONS: true,
        NOTIFICATION_DURATION: 4000,
        MAX_QUALITY: true,
        DEBUG: false,
    };

    const log = (...args) => CONFIG.DEBUG && console.log('[AVD]', ...args);

    function notify(message, type = 'info') {
        if (!CONFIG.SHOW_NOTIFICATIONS) return;
        const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336', warning: '#ff9800' };
        const el = document.createElement('div');
        el.className = 'avd-notification';
        el.innerHTML = `
            <div style="background:${colors[type] || colors.info};color:#fff;padding:12px 20px;
                border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-size:14px;
                display:flex;align-items:center;gap:10px;max-width:400px;word-break:break-word;">
                <span style="font-size:18px;">${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'}</span>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, CONFIG.NOTIFICATION_DURATION);
    }

    GM_addStyle(`
        .avd-notification {
            position: fixed; z-index: 999999; top: 20px; right: 20px;
            transition: opacity 0.4s ease; font-family: Arial, sans-serif; pointer-events: none;
        }
        .avd-btn-container {
            position: absolute; z-index: 99999; pointer-events: auto;
            top: 10px; right: 10px; display: flex; gap: 6px; flex-direction: column;
        }
        .avd-btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            padding: 8px 14px; border: none; border-radius: 8px; cursor: pointer;
            font-size: 13px; font-weight: 600; font-family: Arial, sans-serif;
            color: #fff; background: linear-gradient(135deg, #e91e63, #9c27b0);
            box-shadow: 0 2px 12px rgba(233,30,99,0.4);
            transition: all 0.2s ease; backdrop-filter: blur(4px); user-select: none;
        }
        .avd-btn:hover { transform: scale(1.08); box-shadow: 0 4px 20px rgba(233,30,99,0.6); }
        .avd-btn:active { transform: scale(0.95); }
        .avd-btn svg { width: 16px; height: 16px; fill: currentColor; }
        .avd-btn-quality {
            background: linear-gradient(135deg, #ff6f00, #ff8f00);
            box-shadow: 0 2px 12px rgba(255,111,0,0.4);
        }
        .avd-btn-quality:hover { box-shadow: 0 4px 20px rgba(255,111,0,0.6); }
        .avd-btn-copy {
            background: linear-gradient(135deg, #1565c0, #1976d2);
            box-shadow: 0 2px 12px rgba(21,101,192,0.4);
        }
        .avd-btn-copy:hover { box-shadow: 0 4px 20px rgba(21,101,192,0.6); }
        .avd-btn-close {
            background: linear-gradient(135deg, #424242, #616161);
            padding: 6px 10px; font-size: 11px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .avd-quality-popup {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: #1a1a2e; border: 1px solid #333; border-radius: 12px;
            padding: 20px; z-index: 999999; min-width: 320px; max-width: 450px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.8); color: #fff;
            font-family: Arial, sans-serif;
        }
        .avd-quality-popup h3 {
            margin: 0 0 15px; font-size: 16px; color: #e91e63;
            border-bottom: 1px solid #333; padding-bottom: 10px;
        }
        .avd-quality-option {
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 14px; margin: 6px 0; background: #16213e;
            border-radius: 8px; cursor: pointer; transition: all 0.2s;
            border: 1px solid transparent;
        }
        .avd-quality-option:hover {
            background: #1a1a4e; border-color: #e91e63;
        }
        .avd-quality-option .q-label { font-weight: 600; font-size: 14px; }
        .avd-quality-option .q-info { font-size: 12px; color: #999; }
        .avd-quality-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7); z-index: 999998;
        }
        .avd-progress {
            position: fixed; bottom: 30px; right: 30px; background: #1a1a2e;
            border: 1px solid #333; border-radius: 12px; padding: 16px 20px;
            z-index: 999999; color: #fff; min-width: 280px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.6); font-family: Arial, sans-serif;
        }
        .avd-progress-bar {
            width: 100%; height: 6px; background: #333; border-radius: 3px;
            margin-top: 10px; overflow: hidden;
        }
        .avd-progress-fill {
            height: 100%; background: linear-gradient(90deg, #e91e63, #9c27b0);
            border-radius: 3px; transition: width 0.3s ease; width: 0%;
        }
        .avd-progress-text { font-size: 13px; margin-top: 6px; color: #aaa; }
    `);

    const SVG = {
        download: '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
        quality: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81a.49.49 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z"/></svg>',
        copy: '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
        close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
        film: '<svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>',
    };

    const VIDEO_EXTENSIONS = /\.(mp4|webm|mkv|m3u8|mov|m4v|avi|flv|ts)(\?[^"'\s]*)?/i;
    const VIDEO_EXTS_ONLY = ['mp4', 'webm', 'mkv', 'm3u8', 'mov', 'm4v', 'avi', 'flv', 'ts', 'mpd'];

    function isVideoUrl(url) {
        try {
            const u = new URL(url);
            const path = u.pathname.toLowerCase();
            if (VIDEO_EXTS_ONLY.some(ext => path.endsWith('.' + ext))) return true;
            for (const p of u.searchParams.keys()) {
                const v = (u.searchParams.get(p) || '').toLowerCase();
                if (VIDEO_EXTS_ONLY.some(ext => v.endsWith('.' + ext))) return true;
            }
            return false;
        } catch { return false; }
    }

    function findVideoSources() {
        const sources = new Map();

        function addSource(url, label, type = 'direct', force = false) {
            if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;
            try { url = new URL(url, location.href).href; } catch (e) { return; }
            if (sources.has(url)) return;
            const clean = url.split('?')[0].split('#')[0];
            const ext = clean.split('.').pop().toLowerCase();
            const hasVideoExt = VIDEO_EXTS_ONLY.includes(ext);
            if (!hasVideoExt && !force && !isVideoUrl(url)) return;
            const quality = label || (ext === 'm3u8' ? 'HLS Stream' : hasVideoExt ? ext.toUpperCase() : 'Source');
            sources.set(url, { url, quality, type, ext: hasVideoExt ? ext : 'mp4', label });
        }

        // 1. HTML5 <video> and <source> tags (always valid video)
        document.querySelectorAll('video').forEach((video, i) => {
            const label = video.id || video.className || `Video ${i + 1}`;
            if (video.src) addSource(video.src, `${label} (src)`, 'video-tag', true);
            if (video.currentSrc) addSource(video.currentSrc, `${label} (current)`, 'video-tag', true);
            video.querySelectorAll('source').forEach((s, j) => {
                if (s.src) addSource(s.src, `${label} Source ${j + 1} (${s.type || 'auto'})`, 'video-tag', true);
            });
        });

        // 2. JavaScript variables in page
        const jsPatterns = [
            { re: /(?:video_url|videoUrl|videoSrc|videoSource|videoSrcHd|videoUrlHd|downloadUrl|download_url|file_url|fileUrl|mediaUrl|media_url|streamUrl|stream_url)\s*[:=]\s*["'](https?:\/\/[^"']+)/gi, force: true },
            { re: /(?:file|source|url|src|stream)\s*:\s*["'](https?:\/\/[^"']+\.(?:mp4|webm|m3u8|mkv|mov|avi|flv)[^"']*)/gi, force: false },
            { re: /["'](https?:\/\/[^"']+\.(?:mp4|webm|m3u8|mkv|mov|avi|flv)[^"']*?)["']/gi, force: false },
            { re: /["'](https?:\/\/[^"']+\.m3u8[^"']*?)["']/gi, force: true },
            { re: /["'](https?:\/\/[^"']+\.mpd[^"']*?)["']/gi, force: true },
        ];

        const pageText = document.documentElement.innerHTML;
        for (const { re, force } of jsPatterns) {
            let match;
            while ((match = re.exec(pageText)) !== null) {
                const url = match[2] || match[1];
                if (url && url.length > 10) {
                    const ext = url.split('?')[0].split('.').pop().toLowerCase();
                    addSource(url, `${ext.toUpperCase()} (detected)`, 'js-scan', force);
                }
            }
        }

        // 3. Check for iframes / embedded players (only video platforms)
        const videoIframeHosts = ['player.vimeo.com', 'youtube.com', 'embed.', 'player.', 'stream.', 'hls.', 'cdn.'];
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                const src = iframe.src || iframe.getAttribute('data-src') || '';
                if (src && videoIframeHosts.some(h => src.includes(h))) {
                    addSource(src, `iframe: ${src.substring(0, 50)}...`);
                }
            } catch (e) {}
        });

        // 4. JSON-LD / JSON data
        document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]').forEach(s => {
            try {
                const data = JSON.parse(s.textContent);
                extractUrlsFromJson(data, sources);
            } catch (e) {}
        });

        // 5. Global JS objects
        const globalVars = ['player', 'videojs', 'flowplayer', 'jwplayer', 'Plyr', 'video_data', 'videoData', 'flashvars', 'videoConfig', 'playerConfig'];
        for (const v of globalVars) {
            try {
                const obj = window[v];
                if (obj) extractUrlsFromJson(obj, sources);
            } catch (e) {}
        }

        return Array.from(sources.values());
    }

    function extractUrlsFromJson(obj, sources, depth = 0) {
        if (depth > 5 || !obj) return;
        try {
            if (typeof obj === 'string') {
                if (obj.length > 10 && (VIDEO_EXTENSIONS.test(obj) || obj.includes('.m3u8') || obj.includes('.mpd'))) {
                    const clean = obj.split('?')[0].split('#')[0];
                    const ext = clean.split('.').pop().toLowerCase();
                    const hasVideoExt = VIDEO_EXTS_ONLY.includes(ext);
                    sources.set(obj, { url: obj, quality: hasVideoExt ? ext.toUpperCase() : 'Source', type: 'json', ext: hasVideoExt ? ext : 'mp4' });
                }
                return;
            }
            if (Array.isArray(obj)) {
                obj.forEach(item => extractUrlsFromJson(item, sources, depth + 1));
                return;
            }
            if (typeof obj === 'object') {
                const interesting = ['src', 'url', 'file', 'source', 'video', 'stream', 'hls', 'manifest', 'download'];
                for (const key of Object.keys(obj)) {
                    const lk = key.toLowerCase();
                    if (interesting.some(i => lk.includes(i))) {
                        extractUrlsFromJson(obj[key], sources, depth + 1);
                    }
                }
            }
        } catch (e) {}
    }

    function getFilename() {
        const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
        const title = document.title;
        let name = ogTitle || title || 'video';
        name = name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 120);
        return name;
    }

    function downloadViaLink(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 1000);
    }

    function downloadViaGM(url, filename) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                timeout: 300000,
                onprogress: (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        const mb = (e.loaded / 1048576).toFixed(1);
                        const total = (e.total / 1048576).toFixed(1);
                        showProgress(filename, pct, `${mb} MB / ${total} MB`);
                    }
                },
                onload: (resp) => {
                    hideProgress();
                    if (resp.status >= 200 && resp.status < 300) {
                        const blob = resp.response;
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => { a.remove(); URL.revokeObjectURL(blobUrl); }, 5000);
                        resolve();
                    } else {
                        reject(new Error(`HTTP ${resp.status}`));
                    }
                },
                onerror: (e) => { hideProgress(); reject(e); },
                ontimeout: () => { hideProgress(); reject(new Error('timeout')); },
            });
        });
    }

    function showProgress(filename, pct, text) {
        let el = document.getElementById('avd-progress');
        if (!el) {
            el = document.createElement('div');
            el.id = 'avd-progress';
            el.className = 'avd-progress';
            el.innerHTML = `
                <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Pobieranie...</div>
                <div id="avd-progress-filename" style="font-size:12px;color:#aaa;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
                <div class="avd-progress-bar"><div id="avd-progress-fill" class="avd-progress-fill"></div></div>
                <div id="avd-progress-text" class="avd-progress-text"></div>
            `;
            document.body.appendChild(el);
        }
        el.querySelector('#avd-progress-filename').textContent = filename;
        el.querySelector('#avd-progress-fill').style.width = pct + '%';
        el.querySelector('#avd-progress-text').textContent = `${pct}% - ${text}`;
    }

    function hideProgress() {
        const el = document.getElementById('avd-progress');
        if (el) el.remove();
    }

    async function handleDownload(source, filename) {
        const ext = source.ext || source.url.split('?')[0].split('.').pop() || 'mp4';
        const fn = filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;

        if (source.ext === 'm3u8') {
            notify('Stream HLS - otwieram link do pobrania.', 'warning');
            downloadViaLink(source.url, `stream_${fn}`);
            return;
        }

        notify('Pobieranie...', 'info');

        // 1. GM_xmlhttpRequest + blob - działa przy CORS
        try {
            await downloadViaGM(source.url, fn);
            notify('Pobieranie zakończone!', 'success');
            return;
        } catch (e) {
            log('GM download failed:', e);
        }

        // 2. Fallback: link (działa tylko dla tej samej domeny)
        try {
            downloadViaLink(source.url, fn);
            notify('Pobieranie rozpoczęte!', 'success');
            return;
        } catch (e) {
            log('Link download failed:', e);
        }

        // 3. Otwórz w nowej karcie
        notify('Otwieram film w nowej karcie - kliknij prawym i "Zapisz jako..."', 'warning');
        window.open(source.url, '_blank');
    }

    function showQualityPopup(sources, filename) {
        const existing = document.querySelector('.avd-quality-overlay');
        if (existing) existing.remove();
        const existingPopup = document.querySelector('.avd-quality-popup');
        if (existingPopup) existingPopup.remove();

        const overlay = document.createElement('div');
        overlay.className = 'avd-quality-overlay';
        document.body.appendChild(overlay);

        const popup = document.createElement('div');
        popup.className = 'avd-quality-popup';

        const qualityGroups = {};
        sources.forEach(s => {
            const q = s.quality || 'Unknown';
            if (!qualityGroups[q]) qualityGroups[q] = [];
            qualityGroups[q].push(s);
        });

        const sorted = Object.entries(qualityGroups).sort((a, b) => {
            const aNum = parseInt(a[0]) || 0;
            const bNum = parseInt(b[0]) || 0;
            return bNum - aNum;
        });

        let html = `<h3>Wybierz jakość pobierania</h3>`;

        for (const [quality, items] of sorted) {
            for (const item of items) {
                const icon = item.ext === 'm3u8' ? '🎬' : item.ext === 'mp4' ? '📹' : '🎞️';
                html += `
                    <div class="avd-quality-option" data-url="${encodeURIComponent(item.url)}" data-ext="${item.ext}">
                        <div>
                            <div class="q-label">${icon} ${quality}</div>
                            <div class="q-info">${item.type} · ${item.ext.toUpperCase()} · ${item.url.substring(0, 60)}...</div>
                        </div>
                        <span style="color:#e91e63;font-weight:bold;">⬥</span>
                    </div>
                `;
            }
        }

        html += `<div style="margin-top:15px;text-align:center;">
            <button id="avd-cancel" style="background:#333;color:#fff;border:none;padding:8px 20px;
                border-radius:6px;cursor:pointer;font-size:13px;">Anuluj</button>
            <span style="color:#666;font-size:11px;margin-left:12px;">Esc zamknij · ${CONFIG.HOTKEY.toUpperCase()} pobierz najlepszą</span>
        </div>`;

        popup.innerHTML = html;
        document.body.appendChild(popup);

        popup.querySelectorAll('.avd-quality-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const url = decodeURIComponent(opt.dataset.url);
                const ext = opt.dataset.ext;
                const item = sources.find(s => s.url === url) || { url, ext };
                overlay.remove();
                popup.remove();
                handleDownload(item, filename);
            });
        });

        document.getElementById('avd-cancel')?.addEventListener('click', () => {
            overlay.remove();
            popup.remove();
        });

        overlay.addEventListener('click', () => {
            overlay.remove();
            popup.remove();
        });

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                popup.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    function createDownloadButton(container, sources, filename) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'avd-btn-container';
        btnContainer.style.display = 'flex';

        // Main download button
        const dlBtn = document.createElement('button');
        dlBtn.className = 'avd-btn';
        dlBtn.innerHTML = `${SVG.download} Pobierz`;
        dlBtn.title = `Pobierz film (${CONFIG.HOTKEY.toUpperCase()})`;
        dlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (sources.length === 0) {
                notify('Nie znaleziono żadnych źródeł wideo.', 'error');
                return;
            }
            if (sources.length === 1) {
                handleDownload(sources[0], filename);
            } else {
                showQualityPopup(sources, filename);
            }
        });

        // Quality selector button
        const qBtn = document.createElement('button');
        qBtn.className = 'avd-btn avd-btn-quality';
        qBtn.innerHTML = `${SVG.quality} Jakość`;
        qBtn.title = 'Wybierz jakość';
        qBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showQualityPopup(sources, filename);
        });

        // Copy URL button
        const cpBtn = document.createElement('button');
        cpBtn.className = 'avd-btn avd-btn-copy';
        cpBtn.innerHTML = `${SVG.copy} URL`;
        cpBtn.title = 'Kopiuj URL wideo';
        cpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (sources.length === 0) {
                notify('Nie znaleziono żadnych źródeł wideo.', 'error');
                return;
            }
            const best = sources[0];
            navigator.clipboard.writeText(best.url).then(() => {
                notify('URL skopiowany do schowka!', 'success');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = best.url;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                notify('URL skopiowany!', 'success');
            });
        });

        btnContainer.appendChild(dlBtn);
        btnContainer.appendChild(qBtn);
        btnContainer.appendChild(cpBtn);
        container.appendChild(btnContainer);

        return btnContainer;
    }

    function findVideoContainer() {
        const selectors = [
            '.video-container', '.player-container', '.video-wrapper',
            '.video-box', '.player-box', '#video-container', '#player',
            '.html5-video-player', '.video-player', '.fp-player',
            '.videojs-player', '#player_area', '.pl_video',
            '.video_area', '.main_video', '.video_block',
            '[class*="player"]', '[class*="video"]',
            'video', '.embed-responsive',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        // Fallback: find the video element's parent
        const video = document.querySelector('video');
        if (video) {
            let parent = video.parentElement;
            while (parent && parent !== document.body) {
                const rect = parent.getBoundingClientRect();
                if (rect.width > 300 && rect.height > 200) return parent;
                parent = parent.parentElement;
            }
            return video.parentElement || video;
        }
        return null;
    }

    function injectUI(sources) {
        if (sources.length === 0) {
            log('No video sources found');
            notify('Nie wykryto źródeł wideo. Strona może wymagać dodatkowej obsługi.', 'warning');
            return;
        }

        log(`Found ${sources.length} video sources:`, sources);
        notify(`Znaleziono ${sources.length} źródeł wideo!`, 'success');

        const container = findVideoContainer();
        if (!container) {
            log('No video container found, injecting into body');
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;';
            document.body.appendChild(div);
            createDownloadButton(div, sources, getFilename());
            return;
        }

        const computed = window.getComputedStyle(container);
        if (computed.position === 'static') {
            container.style.position = 'relative';
        }

        createDownloadButton(container, sources, getFilename());
    }

    // Site-specific optimizations
    function siteSpecificExtractors() {
        const hostname = location.hostname;
        const sources = [];

        // ePorner - extract from flashvars
        if (hostname.includes('eporner.com')) {
            try {
                if (window.flashvars) {
                    const vars = window.flashvars;
                    if (vars.video_url) sources.push({ url: vars.video_url, quality: 'SD', type: 'flashvars', ext: 'mp4' });
                    if (vars.video_url_text) sources.push({ url: vars.video_url_text, quality: 'HD', type: 'flashvars', ext: 'mp4' });
                    if (vars.video_alt_url) sources.push({ url: vars.video_alt_url, quality: 'Alt', type: 'flashvars', ext: 'mp4' });
                }
            } catch (e) {}
        }

        // Camwhores - check for specific player objects
        if (hostname.includes('camwhores')) {
            const text = document.documentElement.innerHTML;
            const match = text.match(/(?:flashvars|config)\s*=\s*\{([^}]+)\}/);
            if (match) {
                try {
                    const flashvars = new Function('return {' + match[1] + '}')();
                    if (flashvars.video_url) sources.push({ url: flashvars.video_url, quality: 'Source', type: 'flashvars', ext: 'mp4' });
                } catch (e) {}
            }
        }

        // XHamster - check for player data
        if (hostname.includes('xhamster')) {
            try {
                const scripts = document.querySelectorAll('script');
                scripts.forEach(s => {
                    const content = s.textContent;
                    if (content.includes('videoURL')) {
                        const match = content.match(/videoURL['"]\s*:\s*['"]([^'"]+)/);
                        if (match) sources.push({ url: match[1], quality: 'Source', type: 'xhamster', ext: 'mp4' });
                    }
                });
            } catch (e) {}
        }

        return sources;
    }

    function init() {
        log('Initializing on:', location.href);
        let sources = [];

        // Try site-specific first
        sources = siteSpecificExtractors();

        // Then general extraction
        if (sources.length === 0) {
            sources = findVideoSources();
        }

        injectUI(sources);

        // Global hotkey
        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === CONFIG.HOTKEY && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                const target = e.target;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
                e.preventDefault();
                if (sources.length === 0) {
                    sources = findVideoSources();
                    if (sources.length === 0) {
                        notify('Nie znaleziono wideo. Odśwież stronę lub poczekaj na załadowanie.', 'error');
                        return;
                    }
                }
                if (sources.length === 1) {
                    handleDownload(sources[0], getFilename());
                } else {
                    showQualityPopup(sources, getFilename());
                }
            }
        });

        // MutationObserver for dynamic content
        let retryCount = 0;
        const maxRetries = 10;
        const observer = new MutationObserver(() => {
            if (retryCount >= maxRetries) return;
            const newSources = findVideoSources();
            if (newSources.length > sources.length) {
                sources = newSources;
                retryCount = 0;
                const existing = document.querySelector('.avd-btn-container');
                if (existing) existing.remove();
                injectUI(sources);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Stop observing after a while
        setTimeout(() => { observer.disconnect(); }, 30000);

        // Menu commands
        GM_registerMenuCommand('Pobierz film (najlepsza jakość)', () => {
            const s = findVideoSources();
            if (s.length > 0) {
                handleDownload(s[0], getFilename());
            } else {
                notify('Nie znaleziono wideo.', 'error');
            }
        });

        GM_registerMenuCommand('Wybierz jakość', () => {
            const s = findVideoSources();
            if (s.length > 0) {
                showQualityPopup(s, getFilename());
            } else {
                notify('Nie znaleziono wideo.', 'error');
            }
        });

        GM_registerMenuCommand('Kopiuj URL wideo', () => {
            const s = findVideoSources();
            if (s.length > 0) {
                navigator.clipboard.writeText(s[0].url).then(() => {
                    notify('URL skopiowany!', 'success');
                }).catch(() => {
                    notify('Błąd kopiowania.', 'error');
                });
            }
        });

        log('Initialization complete');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
    } else {
        setTimeout(init, 1500);
    }

})();
