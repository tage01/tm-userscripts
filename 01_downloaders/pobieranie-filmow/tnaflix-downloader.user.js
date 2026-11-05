// ==UserScript==
// @name         Tnaflix Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/tnaflix-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/tnaflix-downloader.user.js
// @description  Pobiera główne wideo z tnaflix.com, ignoruje miniatury
// @author       You
// @match        https://www.tnaflix.com/*/video*
// @match        https://www.tnaflix.com/video*
// @match        https://player.tnaflix.com/video*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tnaflix.com
// @grant        GM_download
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const QUALITY_LABELS = {
        '720': '720p HD',
        '480': '480p',
        '360': '360p',
        '240': '240p',
        '144': '144p',
    };

    const QUALITY_ORDER = ['720', '480', '360', '240', '144'];

    function getVideoTitle() {
        const titleEl = document.querySelector('title');
        if (!titleEl) return 'video';
        return titleEl.textContent
            .replace(/ - Tnaflix\.com$/, '')
            .replace(/ TNAFlix Porn Videos$/, '')
            .trim() || 'video';
    }

    function getSources() {
        const sources = document.querySelectorAll('#video-player source');
        if (!sources.length) return [];
        return Array.from(sources)
            .map(s => ({
                size: s.getAttribute('size'),
                url: s.getAttribute('src'),
                label: QUALITY_LABELS[s.getAttribute('size')] || s.getAttribute('size') + 'p',
            }))
            .filter(s => s.url)
            .sort((a, b) => QUALITY_ORDER.indexOf(a.size) - QUALITY_ORDER.indexOf(b.size));
    }

    function createUI(sources) {
        const container = document.createElement('div');
        container.id = 'tnaflix-downloader';
        container.innerHTML = `
            <div style="background:#1a1a2e;border:1px solid #e94560;border-radius:8px;padding:12px 16px;margin:12px 0;font-family:Arial,sans-serif;color:#eee;">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span style="font-weight:700;font-size:14px;color:#e94560;">▼ Pobierz wideo:</span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        ${sources.map(s => `
                            <button class="tna-dl-btn" data-url="${s.url}" data-size="${s.size}"
                                style="background:#16213e;color:#eee;border:1px solid #0f3460;border-radius:4px;padding:6px 14px;cursor:pointer;font-size:13px;transition:background .15s;">
                                ${s.label}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div id="tna-dl-status" style="margin-top:6px;font-size:12px;color:#aaa;display:none;"></div>
            </div>
        `;

        const target = document.querySelector('#video-player-container') || document.querySelector('#video-player');
        if (target) {
            target.parentNode.insertBefore(container, target.nextSibling);
        }

        container.querySelectorAll('.tna-dl-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const url = this.dataset.url;
                const size = this.dataset.size;
                const title = getVideoTitle();
                const ext = 'mp4';
                const filename = `${title}-${size}p.${ext}`.replace(/[<>:"/\\|?*]/g, '_');

                const status = document.getElementById('tna-dl-status');
                status.style.display = 'block';
                status.textContent = `Rozpoczynanie pobierania ${size}p...`;

                GM_download({
                    url: url,
                    name: filename,
                    saveAs: true,
                    onload: () => { status.textContent = `Pobrano: ${filename}`; },
                    onerror: (err) => { status.textContent = `Błąd: ${err}`; },
                    ontimeout: () => { status.textContent = 'Przekroczono czas oczekiwania'; },
                });
            });
        });
    }

    function init() {
        const player = document.getElementById('video-player');
        if (!player) return;

        const sources = getSources();
        if (!sources.length) return;

        // Wait a bit for page to settle, then inject UI
        const doInject = () => {
            if (!document.getElementById('tnaflix-downloader')) {
                createUI(sources);
            }
        };

        if (document.readyState === 'complete') {
            setTimeout(doInject, 500);
        } else {
            window.addEventListener('load', () => setTimeout(doInject, 500));
        }
    }

    GM_addStyle(`
        .tna-dl-btn:hover {
            background: #0f3460 !important;
            border-color: #e94560 !important;
        }
        .tna-dl-btn:active {
            background: #e94560 !important;
        }
    `);

    init();
})();
