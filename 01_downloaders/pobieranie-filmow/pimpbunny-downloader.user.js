// ==UserScript==
// @name         PimpBunny Video Downloader
// @namespace    http://tampermonkey.net/
// @version      2.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/pimpbunny-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/pimpbunny-downloader.user.js
// @description  Pobiera wideo z pimpbunny.com – używa URL z playera (z tokenem)
// @author       opencode
// @match        *://pimpbunny.com/*/videos/*
// @match        *://*.pimpbunny.com/*/videos/*
// @match        *://pimpbunny.com/videos/*
// @match        *://*.pimpbunny.com/videos/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pimpbunny.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    let progressEl = null;
    let currentRequest = null;

    GM_addStyle(`
        .pb-dl-btn-container {
            position: absolute; z-index: 99999; pointer-events: auto;
            top: 10px; right: 10px; display: flex; gap: 6px; flex-direction: column;
        }
        .pb-dl-btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            padding: 8px 14px; border: none; border-radius: 8px; cursor: pointer;
            font-size: 13px; font-weight: 600; font-family: Arial, sans-serif;
            color: #fff; background: linear-gradient(135deg, #e91e63, #9c27b0);
            box-shadow: 0 2px 12px rgba(233,30,99,0.4);
            transition: all 0.2s ease; backdrop-filter: blur(4px); user-select: none;
        }
        .pb-dl-btn:hover { transform: scale(1.08); }
        .pb-dl-btn:active { transform: scale(0.95); }
        .pb-dl-progress {
            position: fixed; z-index: 999999; top: 20px; right: 20px; width: 320px;
            font-family: Arial, sans-serif;
        }
        .pb-dl-progress-bar {
            width: 100%; height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin-top: 8px;
        }
        .pb-dl-progress-fill {
            height: 100%; width: 0%; background: linear-gradient(90deg, #e91e63, #9c27b0); border-radius: 3px; transition: width 0.3s;
        }
        .pb-dl-cancel-btn {
            margin-top: 8px; padding: 4px 12px; border: 1px solid #555; border-radius: 4px;
            cursor: pointer; font-size: 11px; color: #ccc; background: #333;
        }
        .pb-dl-cancel-btn:hover { background: #555; color: #fff; }
    `);

    function notify(msg, type = 'info') {
        const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336' };
        const el = document.createElement('div');
        el.style.cssText = `position:fixed;z-index:999999;top:20px;right:20px;opacity:1;transition:opacity 0.4s;font-family:Arial,sans-serif;pointer-events:none;`;
        el.innerHTML = `<div style="background:${colors[type]};color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-size:14px;">${msg}</div>`;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 4000);
    }

    function showProgress(filename) {
        if (progressEl) progressEl.remove();
        progressEl = document.createElement('div');
        progressEl.className = 'pb-dl-progress';
        progressEl.innerHTML = `<div style="background:#1a1a2e;color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.8);font-size:13px;">
            <div style="margin-bottom:4px;">Pobieranie: <strong>${filename}</strong></div>
            <div style="font-size:11px;color:#aaa;" class="pb-dl-progress-text">0%</div>
            <div class="pb-dl-progress-bar"><div class="pb-dl-progress-fill"></div></div>
            <div style="margin-top:8px;"><button class="pb-dl-cancel-btn">Anuluj</button></div>
        </div>`;
        progressEl.querySelector('.pb-dl-cancel-btn').addEventListener('click', () => {
            if (currentRequest) currentRequest.abort();
            notify('Anulowano', 'info');
            removeProgress();
        });
        document.body.appendChild(progressEl);
        return progressEl;
    }

    function updateProgress(pct) {
        if (!progressEl) return;
        const fill = progressEl.querySelector('.pb-dl-progress-fill');
        const text = progressEl.querySelector('.pb-dl-progress-text');
        if (fill) fill.style.width = `${Math.min(pct, 100)}%`;
        if (text) text.textContent = `${Math.round(pct)}%`;
    }

    function removeProgress() {
        if (!progressEl) return;
        progressEl.style.opacity = '0';
        setTimeout(() => { if (progressEl) { progressEl.remove(); progressEl = null; } }, 400);
    }

    function getVideoInfo() {
        const video = document.querySelector('video.fp-engine, video[src*="get_file"]');
        if (!video || !video.src) return null;
        const url = video.src;
        const ld = document.querySelector('script[type="application/ld+json"]');
        let name = 'video';
        if (ld) {
            try {
                const data = JSON.parse(ld.textContent);
                if (data.name) name = data.name;
            } catch {}
        }
        name = name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 120);
        const qMatch = url.match(/_(\d{3,4}p)\.mp4/);
        const quality = qMatch ? qMatch[1] : 'source';
        return { url, name, quality };
    }

    function downloadVideo(url, filename) {
        showProgress(filename);
        currentRequest = GM_xmlhttpRequest({
            method: 'GET', url, responseType: 'blob',
            onprogress: (e) => {
                if (e.total > 0) updateProgress((e.done / e.total) * 100);
            },
            onload: (resp) => {
                currentRequest = null;
                if (resp.status >= 200 && resp.status < 300) {
                    updateProgress(100);
                    setTimeout(() => removeProgress(), 500);
                    notify('Pobrano!', 'success');
                    const blobUrl = URL.createObjectURL(resp.response);
                    GM_download({ url: blobUrl, name: filename, saveAs: false,
                        onerror: () => {
                            const a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => { a.remove(); URL.revokeObjectURL(blobUrl); }, 5000);
                        }
                    });
                } else {
                    removeProgress();
                    notify(`Błąd HTTP ${resp.status}`, 'error');
                }
            },
            onerror: () => { currentRequest = null; removeProgress(); notify('Błąd pobierania', 'error'); },
            ontimeout: () => { currentRequest = null; removeProgress(); notify('Timeout', 'error'); },
        });
    }

    function injectUI() {
        const info = getVideoInfo();
        if (!info) {
            notify('Nie znaleziono źródła wideo. Odtwórz film i spróbuj ponownie.', 'error');
            return;
        }

        const filename = `${info.name}_${info.quality}`;

        const player = document.querySelector('.pb-player, .video-player, video.fp-engine, [class*="player"]');
        const container = player?.parentElement || document.querySelector('.video-container, .player-container, .video-wrapper') || document.body;

        if (container && container !== document.body) {
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
        }

        const btnDiv = document.createElement('div');
        btnDiv.className = 'pb-dl-btn-container';

        const dlBtn = document.createElement('button');
        dlBtn.className = 'pb-dl-btn';
        dlBtn.textContent = `Pobierz (${info.quality})`;
        dlBtn.addEventListener('click', () => downloadVideo(info.url, `${filename}.mp4`));

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

        notify(`Znaleziono: ${info.name} (${info.quality})`, 'info');
    }

    GM_registerMenuCommand('Pobierz wideo', () => injectUI());

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(injectUI, 2000));
    } else {
        setTimeout(injectUI, 2000);
    }
})();
