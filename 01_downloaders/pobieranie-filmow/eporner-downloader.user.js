// ==UserScript==
// @name         Eporner Video Downloader
// @namespace    http://tampermonkey.net/
// @version      3.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/eporner-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/eporner-downloader.user.js
// @description  Pobiera wideo z eporner.com (hd-porn / video- / embed) z wyborem jakości, paskiem postępu, GM_download i otwarciem w karcie
// @author       opencode
// @match        *://*.eporner.com/hd-porn/*
// @match        *://*.eporner.com/video-*
// @match        *://*.eporner.com/embed/*
// @match        *://*.eporner.com/film-porno/*
// @match        *://*.eporner.com/video-porno/*
// @match        *://*.eporner.com/porno-video/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=eporner.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      eporner.com
// @connect      *.eporner.com
// @connect      *.cdn.eporner.com
// @connect      vid-s*.eporner.com
// @connect      dash-s*.eporner.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // --- konfiguracja ---
    const QUALITY_ORDER = ['1080', '720', '480', '360', '240'];
    const QUALITY_LABELS = { '1080': '1080p', '720': '720p HD', '480': '480p', '360': '360p', '240': '240p' };

    function log(...args) { console.log('[EPD v3]', ...args); }

    const _W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // --- ekstrakcja danych wideo ---

    // Wyciąga vid (np. eo5DIQuAIZj) — priorytet: EP JS > #EPvideo[data-vid] > URL
    function getVid() {
        const p = _W.EP && _W.EP.video && _W.EP.video.player;
        if (p && p.vid) return String(p.vid).trim();
        const epv = document.querySelector('#EPvideo[data-vid]');
        if (epv) {
            const dv = epv.getAttribute('data-vid');
            if (dv) return dv.split('/')[0].trim();
        }
        const dv2 = document.querySelector('[data-vid]');
        if (dv2) {
            const dv = dv2.getAttribute('data-vid');
            if (dv) return dv.split('/')[0].trim();
        }
        // fallback z URL: /hd-porn/{vid}/ /embed/{vid}/ /video-{vid}
        const m = location.pathname.match(/\/(?:hd-porn|embed|video-porno|porno-video|film-porno)\/([^\/]+)/);
        if (m) return m[1].trim();
        const m2 = location.pathname.match(/\/video-([A-Za-z0-9]+)/);
        if (m2) return m2[1].trim();
        return null;
    }

    // Wyciąga hash playera (32 hex) do /xhr/video
    function getPlayerHash() {
        const p = _W.EP && _W.EP.video && _W.EP.video.player;
        if (p && p.hash) return String(p.hash).trim();
        // w HTML hash jest tylko w JS inline EP.video.player.hash, nie w data-vid — fallback parsuj skrypty
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
            const txt = s.textContent || '';
            const m = txt.match(/EP\.video\.player\.hash\s*=\s*['"]([a-f0-9]{32})['"]/i);
            if (m) return m[1];
        }
        // ostatnia deska: spróbuj wydłubać z atrybutów (rzadko)
        return null;
    }

    function getVideoTitle() {
        const h1 = document.querySelector('#video-info h1');
        if (h1) {
            // klon bez spanów (28min, 720p)
            const clone = h1.cloneNode(true);
            clone.querySelectorAll('span').forEach(s => s.remove());
            let title = clone.textContent.trim();
            if (title) return title;
            // fallback poprzedniej metody
            title = h1.textContent.trim().replace(/\s*\d+min.*$/, '').trim();
            if (title) return title;
        }
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && ogTitle.content) {
            let t = ogTitle.content.replace(' - EPORNER', '').replace(/ - Nancy.*$/i, '').trim();
            if (t) return t;
        }
        const titleEl = document.querySelector('title');
        if (titleEl) return titleEl.textContent.replace(' - EPORNER', '').trim();
        return 'video';
    }

    // --- hash XHR: 32 hex -> base36 (4 bloki po 8 hex) ---
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
            } catch (e) { return null; }
        }
        return hash;
    }

    function buildXhrUrl(vid, playerHash) {
        const xhrHash = computeXhrHash(playerHash);
        if (!xhrHash || !vid) return null;
        const params = new URLSearchParams({
            hash: xhrHash,
            domain: location.hostname,
            pixelRatio: String(window.devicePixelRatio || 1),
            playerWidth: '0',
            playerHeight: '0',
            fallback: 'false',
            embed: 'false',
            supportedFormats: 'hls,dash,h265,vp9,av1,mp4',
            _: String(Date.now()),
        });
        return `${location.origin}/xhr/video/${encodeURIComponent(vid)}?${params}`;
    }

    function fetchVideoSources() {
        return new Promise((resolve) => {
            const vid = getVid();
            const playerHash = getPlayerHash();
            if (!vid || !playerHash) {
                log('Brak vid/hash', { vid, playerHash });
                resolve([]);
                return;
            }
            const url = buildXhrUrl(vid, playerHash);
            if (!url) { resolve([]); return; }
            log('Fetching XHR:', url);
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
                                    quality: labelShort.replace('p', '').trim(),
                                    label: qualityLabel,
                                    url: info.src,
                                });
                            }
                        }
                        sources.sort((a, b) => QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality));
                        log('Źródła CDN:', sources);
                        resolve(sources);
                    } catch (e) {
                        log('Błąd parsowania JSON:', e, resp.responseText.slice(0, 500));
                        resolve([]);
                    }
                },
                onerror: () => resolve([]),
                ontimeout: () => resolve([]),
            });
        });
    }

    // --- UI helpers ---

    function notify(msg, type) {
        const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336' };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;transition:opacity 0.4s;font-family:Arial,sans-serif;pointer-events:none;';
        el.innerHTML = `<div style="background:${colors[type] || colors.info};color:#fff;padding:10px 18px;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-size:13px;">${msg}</div>`;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3500);
    }

    function getFilename(_source) {
        // nazwa pliku = dokładnie tytuł filmu (bez sufiksu jakości), sanitize + .mp4
        const title = getVideoTitle().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').slice(0, 120).trim();
        return `${title || 'video'}.mp4`;
    }

    function copyText(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) {}
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        ta.remove();
        return true;
    }

    // Pobiera przez blob z paskiem postępu; obsługuje anulowanie (abort)
    let currentRequest = null;

    function startDownload(source, buttonEl, extraRow) {
        const filename = getFilename(source);
        const originalText = buttonEl.textContent;

        // Zamień przycisk na pasek postępu
        buttonEl.innerHTML = '';
        buttonEl.style.cssText = 'width:150px;height:30px;padding:0;border:1px solid #0f3460;border-radius:4px;cursor:default;overflow:hidden;display:inline-block;position:relative;';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'width:100%;height:100%;background:#1a1a2e;position:relative;overflow:hidden;';
        const bar = document.createElement('div');
        bar.style.cssText = 'width:0%;height:100%;background:#e94560;transition:width .3s;';
        const label = document.createElement('span');
        label.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-family:Arial,sans-serif;';
        label.textContent = '0%';
        wrap.appendChild(bar);
        wrap.appendChild(label);
        buttonEl.appendChild(wrap);

        // Przycisk Anuluj
        let cancelBtn = null;
        if (extraRow) {
            cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Anuluj';
            cancelBtn.style.cssText = 'background:#333;color:#fff;border:1px solid #555;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;margin-left:6px;';
            cancelBtn.addEventListener('click', () => {
                if (currentRequest && typeof currentRequest.abort === 'function') currentRequest.abort();
                currentRequest = null;
                label.textContent = 'Anulowano';
                bar.style.background = '#888';
                setTimeout(() => {
                    buttonEl.textContent = originalText;
                    buttonEl.style.cssText = '';
                    buttonEl.className = 'ep-dl-btn';
                    if (cancelBtn) cancelBtn.remove();
                }, 1200);
            });
            extraRow.appendChild(cancelBtn);
        }

        currentRequest = GM_xmlhttpRequest({
            method: 'GET',
            url: source.url,
            headers: { Referer: location.href },
            responseType: 'blob',
            onprogress: (e) => {
                if (e.total > 0) {
                    const pct = Math.min(Math.round((e.loaded / e.total) * 100), 100);
                    bar.style.width = pct + '%';
                    label.textContent = pct + '%';
                } else {
                    const mb = (e.loaded / 1024 / 1024).toFixed(1);
                    label.textContent = mb + ' MB';
                }
            },
            onload: (resp) => {
                currentRequest = null;
                if (cancelBtn) cancelBtn.remove();
                // jeśli abort zwrócił pusty blob, nie zapisuj
                if (!resp.response || resp.response.size === 0) {
                    label.textContent = 'Błąd';
                    bar.style.background = '#f44336';
                    return;
                }
                const blob = resp.response;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
                bar.style.width = '100%';
                bar.style.background = '#4CAF50';
                label.textContent = '✓ ' + source.label;
                // fallback GM_download jeśli <a>.click zablokowany (cross-origin)
                setTimeout(() => {
                    // przywróć przycisk po 3s (lekko przezroczysty)
                    buttonEl.style.opacity = '0.6';
                }, 1500);
            },
            onerror: () => {
                currentRequest = null;
                if (cancelBtn) cancelBtn.remove();
                label.textContent = 'Błąd';
                bar.style.background = '#f44336';
                setTimeout(() => {
                    buttonEl.textContent = originalText;
                    buttonEl.className = 'ep-dl-btn';
                    buttonEl.style.cssText = '';
                }, 2000);
            },
            ontimeout: () => {
                currentRequest = null;
                if (cancelBtn) cancelBtn.remove();
                label.textContent = 'Timeout';
                bar.style.background = '#f44336';
            },
        });
    }

    function createUI(sources) {
        if (!sources.length) {
            notify('Nie znaleziono źródeł wideo', 'error');
            return;
        }
        if (document.getElementById('eporner-downloader')) return;

        const container = document.createElement('div');
        container.id = 'eporner-downloader';
        container.innerHTML = `
            <div style="background:#1a1a2e;border:1px solid #e94560;border-radius:8px;padding:12px 16px;margin:12px 0;font-family:Arial,sans-serif;color:#eee;">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <span style="font-weight:700;font-size:14px;color:#e94560;">▼ Pobierz:</span>
                    <div id="ep-dl-buttons" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;"></div>
                </div>
                <div id="ep-dl-extra" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center;"></div>
                <div style="margin-top:6px;font-size:11px;color:#888;">Blob = pasek postępu (anulowanie). GM_download = przez menedżer przeglądarki. „Otwórz” = nowa karta (najszybsze). „Kopiuj” = URL do schowka.</div>
            </div>
        `;

        const btnWrap = container.querySelector('#ep-dl-buttons');
        const extraRow = container.querySelector('#ep-dl-extra');

        sources.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'ep-dl-btn';
            btn.textContent = s.label;
            btn.title = `Pobierz ${s.label} (blob + pasek)`;
            btn.addEventListener('click', () => startDownload(s, btn, extraRow));
            btnWrap.appendChild(btn);
        });

        // rząd 2: szybkie akcje dla najlepszej jakości
        const best = sources[0];
        if (best) {
            const gmBtn = document.createElement('button');
            gmBtn.className = 'ep-dl-btn ep-dl-btn--secondary';
            gmBtn.textContent = 'GM_download ' + best.label;
            gmBtn.title = 'Pobierz przez GM_download (bez paska, natywnie)';
            gmBtn.addEventListener('click', () => {
                const filename = getFilename(best);
                notify(`Pobieranie ${best.label} przez GM_download...`, 'info');
                try {
                    GM_download({ url: best.url, name: filename, headers: { Referer: location.href }, saveAs: true,
                        onload: () => notify('Pobieranie rozpoczęte', 'success'),
                        onerror: (e) => notify('Błąd GM_download: ' + (e.error || ''), 'error')
                    });
                } catch (e) {
                    window.open(best.url, '_blank');
                }
            });
            extraRow.appendChild(gmBtn);

            const tabBtn = document.createElement('button');
            tabBtn.className = 'ep-dl-btn ep-dl-btn--secondary';
            tabBtn.textContent = 'Otwórz ' + best.label;
            tabBtn.title = 'Otwórz CDN URL w nowej karcie (wymaga gestu, najszybsze)';
            tabBtn.addEventListener('click', () => {
                const win = window.open('about:blank', '_blank');
                if (win) win.location.href = best.url;
                else window.open(best.url, '_blank');
            });
            extraRow.appendChild(tabBtn);

            const copyBtn = document.createElement('button');
            copyBtn.className = 'ep-dl-btn ep-dl-btn--secondary';
            copyBtn.textContent = 'Kopiuj URL';
            copyBtn.addEventListener('click', () => {
                copyText(best.url);
                notify('Skopiowano URL: ' + best.label, 'success');
            });
            extraRow.appendChild(copyBtn);
        }

        // wstaw po playerze lub pod #video-info
        const target = document.querySelector('#movieplayer-box') || document.querySelector('#vidcontent') || document.querySelector('#moviexxx');
        if (target && target.parentNode) {
            target.parentNode.insertBefore(container, target.nextSibling);
        } else {
            const info = document.querySelector('#video-info');
            if (info && info.parentNode) info.parentNode.insertBefore(container, info.nextSibling);
            else document.body.prepend(container);
        }
    }

    function waitForPlayer(maxWait) {
        return new Promise((resolve) => {
            const start = Date.now();
            function check() {
                const vid = getVid();
                const hash = getPlayerHash();
                if (vid && hash) {
                    log('Player gotowy, vid:', vid, 'hash:', hash.slice(0, 8) + '...');
                    resolve(true);
                    return;
                }
                if (Date.now() - start >= maxWait) {
                    const epv = document.querySelector('#EPvideo');
                    log('Timeout waitForPlayer — dump:', {
                        vid, hash,
                        EP: typeof _W.EP,
                        EP_player: _W.EP && _W.EP.video && _W.EP.video.player ? Object.keys(_W.EP.video.player) : 'brak',
                        EPvideo_data_vid: epv ? epv.getAttribute('data-vid') : 'brak #EPvideo',
                        url_vid: location.pathname,
                    });
                    resolve(false);
                    return;
                }
                setTimeout(check, 500);
            }
            check();
        });
    }

    async function init() {
        // nie uruchamiaj na listach / kategorii tylko na stronie wideo
        const isVideoPage = /^\/(hd-porn|video-|embed|film-porno|video-porno|porno-video)\//.test(location.pathname) || document.querySelector('#EPvideo') || (_W.EP && _W.EP.video && _W.EP.video.player && _W.EP.video.player.vid);
        if (!isVideoPage) { log('Nie jest to strona wideo, pomijam'); return; }

        log('Init', location.href);
        const ready = await waitForPlayer(20000);
        if (!ready) {
            notify('Nie znaleziono danych wideo (vid/hash)', 'error');
            return;
        }
        const sources = await fetchVideoSources();
        if (sources.length) {
            createUI(sources);
        } else {
            notify('Nie udało się pobrać źródeł wideo (CDN)', 'error');
        }
    }

    GM_addStyle(`
        .ep-dl-btn {
            background: #16213e; color: #eee; border: 1px solid #0f3460;
            border-radius: 4px; padding: 6px 12px; cursor: pointer;
            font-size: 12px; transition: background .15s; white-space: nowrap;
            display: inline-block; font-family: Arial, sans-serif;
        }
        .ep-dl-btn:hover { background: #0f3460; border-color: #e94560; }
        .ep-dl-btn:active { background: #e94560; }
        .ep-dl-btn--secondary { background: #1e2a4a; font-size: 11px; padding: 5px 10px; }
        #eporner-downloader { animation: epFadeIn .3s ease; }
        @keyframes epFadeIn { from { opacity:0; transform: translateY(-4px);} to {opacity:1; transform:none;} }
    `);

    GM_registerMenuCommand('Pobierz z eporner (najlepsza jakość — blob)', async () => {
        const sources = await fetchVideoSources();
        if (!sources.length) { notify('Nie znaleziono wideo', 'error'); return; }
        if (!document.getElementById('eporner-downloader')) createUI(sources);
        // kliknij pierwszy przycisk programowo
        const btn = document.querySelector('#ep-dl-buttons .ep-dl-btn');
        if (btn) btn.click();
    });

    GM_registerMenuCommand('Pobierz z eporner (GM_download)', async () => {
        const sources = await fetchVideoSources();
        if (!sources.length) { notify('Nie znaleziono wideo', 'error'); return; }
        const best = sources[0];
        const filename = getFilename(best);
        GM_download({ url: best.url, name: filename, saveAs: true });
    });

    GM_registerMenuCommand('Kopiuj URL (najlepsza jakość)', async () => {
        const sources = await fetchVideoSources();
        if (!sources.length) { notify('Nie znaleziono wideo', 'error'); return; }
        copyText(sources[0].url);
        notify('Skopiowano: ' + sources[0].label, 'success');
    });

    GM_registerMenuCommand('Pokaż panel pobierania', async () => {
        const sources = await fetchVideoSources();
        if (!sources.length) { notify('Nie znaleziono wideo', 'error'); return; }
        if (!document.getElementById('eporner-downloader')) createUI(sources);
        document.getElementById('eporner-downloader')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
    } else {
        setTimeout(init, 300);
    }
})();
