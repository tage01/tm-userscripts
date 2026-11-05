// ==UserScript==
// @name         Eporner Video Downloader (Direct)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/eporner-downloader-direct.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/eporner-downloader-direct.user.js
// @description  Pobiera wideo z eporner.com — bezpośrednie pobieranie przez GM_download
// @author       opencode
// @match        *://*.eporner.com/hd-porn/*
// @match        *://*.eporner.com/video-*
// @match        *://*.eporner.com/embed/*
// @match        *://*.eporner.com/film-porno/*
// @match        *://*.eporner.com/video-porno/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=eporner.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const QUALITY_ORDER = ['1080', '720', '480', '360', '240'];

    function log(...args) { console.log('[EPD-D]', ...args); }

    const _W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    function getVideoHash() {
        const p = _W.EP && _W.EP.video && _W.EP.video.player;
        if (p && p.vid) return p.vid;
        const dv = document.querySelector('[data-vid]');
        if (dv) return dv.getAttribute('data-vid').split('/')[0];
        return null;
    }

    function getPlayerHash() {
        const p = _W.EP && _W.EP.video && _W.EP.video.player;
        if (p && p.hash) return p.hash;
        const dv = document.querySelector('[data-vid]');
        if (dv) return dv.getAttribute('data-vid').split('/')[0];
        return null;
    }

    function getVideoTitle() {
        const h1 = document.querySelector('#video-info h1');
        if (h1) {
            let title = h1.textContent.trim().replace(/\s*\d+min.*$/, '').trim();
            if (title) return title;
        }
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) return ogTitle.content;
        const titleEl = document.querySelector('title');
        if (titleEl) return titleEl.textContent.replace(' - EPORNER', '').trim();
        return 'video';
    }

    function computeXhrHash(hash) {
        if (!hash) return null;
        if (/^[a-f0-9]{32}$/i.test(hash)) {
            try {
                return [
                    parseInt(hash.substring(0, 8), 16).toString(36),
                    parseInt(hash.substring(8, 16), 16).toString(36),
                    parseInt(hash.substring(16, 24), 16).toString(36),
                    parseInt(hash.substring(24, 32), 16).toString(36),
                ].join('');
            } catch (e) {
                return null;
            }
        }
        return hash;
    }

    function buildXhrUrl(vid, playerHash) {
        const xhrHash = computeXhrHash(playerHash);
        if (!xhrHash) return null;
        const params = new URLSearchParams({
            hash: xhrHash,
            domain: location.hostname,
            pixelRatio: window.devicePixelRatio || 1,
            playerWidth: 0,
            playerHeight: 0,
            fallback: 'false',
            embed: 'false',
            supportedFormats: 'hls,dash,h265,vp9,av1,mp4',
            _: Date.now(),
        });
        return `${location.origin}/xhr/video/${vid}?${params}`;
    }

    function fetchVideoSources() {
        return new Promise((resolve) => {
            const vid = getVideoHash();
            const playerHash = getPlayerHash();
            if (!vid || !playerHash) { resolve([]); return; }
            const url = buildXhrUrl(vid, playerHash);
            if (!url) { resolve([]); return; }
            log('Fetching:', url);
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: { Referer: location.href },
                onload: (resp) => {
                    try {
                        const data = JSON.parse(resp.responseText);
                        const sources = [];
                        if (data.sources && data.sources.mp4) {
                            for (const [qualityLabel, info] of Object.entries(data.sources.mp4)) {
                                const labelShort = info.labelShort || qualityLabel;
                                sources.push({
                                    quality: labelShort.replace('p', ''),
                                    label: qualityLabel,
                                    url: info.src,
                                });
                            }
                        }
                        sources.sort((a, b) => QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality));
                        log('CDN sources:', sources);
                        resolve(sources);
                    } catch (e) { resolve([]); }
                },
                onerror: () => resolve([]),
                ontimeout: () => resolve([]),
            });
        });
    }

    function getFilename(_source) {
        const title = getVideoTitle().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').slice(0, 120).trim();
        return `${title || 'video'}.mp4`;
    }

    function notify(msg, type) {
        const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336' };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;transition:opacity 0.4s;font-family:Arial,sans-serif;pointer-events:none;';
        el.innerHTML = `<div style="background:${colors[type] || colors.info};color:#fff;padding:10px 18px;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-size:13px;">${msg}</div>`;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3500);
    }

    function createUI(sources) {
        if (!sources.length) { notify('Nie znaleziono źródeł wideo', 'error'); return; }

        const container = document.createElement('div');
        container.id = 'eporner-downloader-direct';
        container.innerHTML = `
            <div style="background:#1a1a2e;border:1px solid #e94560;border-radius:8px;padding:12px 16px;margin:12px 0;font-family:Arial,sans-serif;color:#eee;">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span style="font-weight:700;font-size:14px;color:#e94560;">▼ Pobierz (direct):</span>
                    <div id="ep-dd-buttons" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
                </div>
                <div style="margin-top:6px;font-size:11px;color:#888;">Kliknij jakość — pobieranie przez menedżer przeglądarki</div>
            </div>
        `;

        const btnWrap = container.querySelector('#ep-dd-buttons');
        sources.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'ep-dd-btn';
            btn.textContent = s.label;
            btn.addEventListener('click', () => {
                const filename = getFilename(s);
                notify(`Pobieranie ${s.label}...`, 'info');
                GM_download({ url: s.url, name: filename, headers: { Referer: location.href } });
            });
            btnWrap.appendChild(btn);
        });

        const target = document.querySelector('#movieplayer-box') || document.querySelector('#vidcontent');
        if (target) {
            target.parentNode.insertBefore(container, target.nextSibling);
        } else {
            const info = document.querySelector('#video-info');
            if (info) info.parentNode.insertBefore(container, info.nextSibling);
        }
    }

    function waitForPlayer(maxWait) {
        return new Promise((resolve) => {
            const start = Date.now();
            function check() {
                const vid = getVideoHash();
                const hash = getPlayerHash();
                if (vid && hash) { log('Ready, vid:', vid, 'hash:', hash); resolve(true); return; }
                if (Date.now() - start >= maxWait) { resolve(false); return; }
                setTimeout(check, 500);
            }
            check();
        });
    }

    async function init() {
        log('Initializing');
        const ready = await waitForPlayer(20000);
        if (!ready) { notify('Nie znaleziono danych wideo', 'error'); return; }
        const sources = await fetchVideoSources();
        if (sources.length) { createUI(sources); }
        else { notify('Nie udało się pobrać źródeł wideo', 'error'); }
    }

    GM_addStyle(`
        .ep-dd-btn {
            background: #16213e; color: #eee; border: 1px solid #0f3460;
            border-radius: 4px; padding: 6px 12px; cursor: pointer;
            font-size: 12px; transition: background .15s; white-space: nowrap;
            display: inline-block; font-family: Arial, sans-serif;
        }
        .ep-dd-btn:hover { background: #0f3460; border-color: #e94560; }
        .ep-dd-btn:active { background: #e94560; }
    `);

    GM_registerMenuCommand('Pobierz direct (najlepsza jakość)', async () => {
        const sources = await fetchVideoSources();
        if (!sources.length) { notify('Nie znaleziono wideo', 'error'); return; }
        const best = sources[0];
        const filename = getFilename(best);
        GM_download({ url: best.url, name: filename, headers: { Referer: location.href } });
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
    } else {
        setTimeout(init, 200);
    }
})();
