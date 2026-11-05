// ==UserScript==
// @name         Pornhub Video Downloader
// @version      9.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pornhub/pornhub-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pornhub/pornhub-downloader.user.js
// @description  Pobiera filmy z Pornhuba w najlepszej jakości
// @author       You
// @include      https://*.pornhub.com/view_video.php*
// @include      https://*.pornhubpremium.com/view_video.php*
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    GM_addStyle(`
        .phdl-pnl { position: fixed; top: 80px; right: 20px; z-index: 999999; background: rgba(0,0,0,0.92); padding: 14px 18px; border-radius: 10px; border: 1px solid #ff6a00; box-shadow: 0 4px 24px rgba(0,0,0,0.7); font: 14px Arial, sans-serif; min-width: 230px; backdrop-filter: blur(4px); }
        .phdl-pnl .phdl-hdr { color: #fff; font-weight: 700; font-size: 15px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
        .phdl-pnl select { width: 100%; padding: 7px; font-size: 13px; border: 1px solid #555; border-radius: 5px; background: #1a1a2e; color: #fff; margin-bottom: 6px; cursor: pointer; }
        .phdl-pnl select:disabled { opacity: .5; cursor: not-allowed; }
        .phdl-pnl .phdl-btn-row { display: flex; gap: 6px; }
        .phdl-pnl .phdl-btn { flex: 1; padding: 9px 0; font-size: 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #ff6a00, #ee0979); border: none; border-radius: 5px; cursor: pointer; }
        .phdl-pnl .phdl-btn:hover { opacity: .85; }
        .phdl-pnl .phdl-btn:disabled { opacity: .4; cursor: not-allowed; }
        .phdl-pnl .phdl-btn-cancel { background: #555; flex: 0.4; }
        .phdl-pnl .phdl-btn-cancel:hover { background: #777; }
        .phdl-pnl .phdl-st { color: #8cf; font-size: 11px; text-align: center; margin-top: 5px; min-height: 16px; word-break: break-word; }
        .phdl-pnl .phdl-err { color: #f88; }
        .phdl-close { position: absolute; top: 3px; right: 7px; color: #888; cursor: pointer; font-size: 17px; background: none; border: none; padding: 2px 5px; }
        .phdl-close:hover { color: #fff; }
        .phdl-progress { width: 100%; height: 4px; background: #333; border-radius: 2px; margin-top: 4px; overflow: hidden; }
        .phdl-progress-bar { height: 100%; background: #ff6a00; width: 0%; transition: width .3s; min-width: 2px; }
    `);

    const pageFetch = unsafeWindow.fetch.bind(unsafeWindow);

    // ============================================================
    //  Pobierz źródła MP4 z JSON API get_media
    // ============================================================
    async function fetchRealSources() {
        let mediaDefs = null;
        try {
            const key = Object.keys(unsafeWindow).find(k => /^flashvars_\d+$/.test(k));
            if (key) {
                const fv = unsafeWindow[key];
                if (Array.isArray(fv.mediaDefinitions)) mediaDefs = fv.mediaDefinitions;
            }
        } catch (e) {}

        if (!mediaDefs) {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent || '';
                const idx = text.indexOf('mediaDefinitions');
                if (idx === -1) continue;
                const colon = text.indexOf(':', idx + 16);
                if (colon === -1) continue;
                const start = text.indexOf('[', colon);
                if (start === -1) continue;
                let depth = 0, jsonStr = '', i = start;
                while (i < text.length) {
                    const ch = text[i]; jsonStr += ch;
                    if (ch === '[') depth++;
                    else if (ch === ']') { depth--; if (depth === 0) break; }
                    i++;
                }
                try {
                    const clean = jsonStr.replace(/'/g, '"').replace(/,(\s*[\]}])/g, '$1');
                    mediaDefs = JSON.parse(clean);
                    if (Array.isArray(mediaDefs) && mediaDefs.length > 0) break;
                } catch (e) {}
            }
        }

        if (!mediaDefs || !Array.isArray(mediaDefs)) return [];

        const proxyEntry = mediaDefs.find(d => d.remote === true && (d.format || '').toLowerCase() === 'mp4');
        if (!proxyEntry || !proxyEntry.videoUrl) return [];

        let json;
        try {
            const resp = await pageFetch(proxyEntry.videoUrl, { credentials: 'include' });
            if (!resp.ok) return [];
            json = await resp.json();
        } catch (e) {
            return [];
        }

        if (!Array.isArray(json)) return [];

        const sources = [];
        for (const item of json) {
            const url = item.videoUrl;
            const q = String(item.quality || item.height || '').replace(/p/i, '');
            if (url && typeof url === 'string' && url.startsWith('http') && url.includes('.mp4')) {
                sources.push({ quality: q || '?', url });
            }
        }

        sources.sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0));
        return sources;
    }

    // ============================================================
    //  Pobieranie MP4 (zwraca obiekt z abort())
    // ============================================================
    function startDownload(url, quality, title, stEl, progressBar, onDone) {
        const filename = (title || 'video').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100) + '_' + quality + 'p.mp4';
        setStatus(stEl, 'Pobieranie CDN...');

        let aborted = false;

        const request = GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            headers: { Referer: location.href },
            onload: resp => {
                if (aborted) return;
                const blob = resp.response;
                if (!blob || blob.size < 1024) {
                    setStatus(stEl, 'Plik za mały: ' + (blob ? blob.size : 0) + ' B', true);
                    onDone();
                    return;
                }
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl; a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { a.remove(); URL.revokeObjectURL(blobUrl); }, 3000);
                setStatus(stEl, `Gotowe! ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
                GM_notification({ text: 'Zapisano: ' + filename, timeout: 4000 });
                onDone();
            },
            onprogress: (ev) => {
                if (aborted) return;
                if (ev.total > 0 && progressBar) {
                    progressBar.style.width = Math.round((ev.loaded / ev.total) * 100) + '%';
                }
                setStatus(stEl, `Pobieranie... ${(ev.loaded / 1024 / 1024).toFixed(1)} MB / ${ev.total > 0 ? (ev.total / 1024 / 1024).toFixed(1) + ' MB' : '?'}`);
            },
            onerror: () => {
                if (!aborted) { setStatus(stEl, 'Błąd pobierania', true); onDone(); }
            },
            ontimeout: () => {
                if (!aborted) { setStatus(stEl, 'Timeout', true); onDone(); }
            },
            timeout: 600000,
        });

        return {
            abort: () => {
                aborted = true;
                if (request && typeof request.abort === 'function') {
                    request.abort();
                }
                setStatus(stEl, 'Anulowano', true);
            }
        };
    }

    function setStatus(el, msg, isErr) {
        if (el) { el.textContent = msg; el.className = 'phdl-st' + (isErr ? ' phdl-err' : ''); }
    }

    // ============================================================
    //  UI
    // ============================================================
    function buildUI(sources, videoTitle) {
        document.querySelectorAll('.phdl-pnl').forEach(el => el.remove());

        const pnl = document.createElement('div');
        pnl.className = 'phdl-pnl';

        const close = document.createElement('button');
        close.className = 'phdl-close'; close.textContent = '✕';
        close.onclick = () => {
            if (activeRequest) activeRequest.abort();
            pnl.remove();
        };
        pnl.appendChild(close);

        const hdr = document.createElement('div');
        hdr.className = 'phdl-hdr'; hdr.innerHTML = '⬇ Pobierz';
        pnl.appendChild(hdr);

        const sel = document.createElement('select');
        sources.forEach(src => {
            const opt = document.createElement('option');
            opt.value = src.url;
            opt.textContent = (src.quality.match(/^\d+$/) ? src.quality + 'p' : src.quality) + ' MP4';
            opt.dataset.quality = src.quality || '?';
            sel.appendChild(opt);
        });
        pnl.appendChild(sel);

        const progressWrap = document.createElement('div');
        progressWrap.className = 'phdl-progress';
        progressWrap.style.display = 'none';
        const progressBar = document.createElement('div');
        progressBar.className = 'phdl-progress-bar';
        progressWrap.appendChild(progressBar);
        pnl.appendChild(progressWrap);

        const btnRow = document.createElement('div');
        btnRow.className = 'phdl-btn-row';

        const btn = document.createElement('button');
        btn.className = 'phdl-btn'; btn.textContent = 'Pobierz';
        btnRow.appendChild(btn);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'phdl-btn phdl-btn-cancel';
        cancelBtn.textContent = 'Anuluj';
        cancelBtn.style.display = 'none';
        btnRow.appendChild(cancelBtn);

        pnl.appendChild(btnRow);

        const st = document.createElement('div');
        st.className = 'phdl-st';
        pnl.appendChild(st);

        let activeRequest = null;
        let isDownloading = false;

        function resetUI() {
            isDownloading = false;
            activeRequest = null;
            btn.disabled = false;
            btn.textContent = 'Pobierz';
            cancelBtn.style.display = 'none';
            sel.disabled = false;
            close.style.display = 'block';
        }

        btn.addEventListener('click', () => {
            if (isDownloading) return;
            const opt = sel.options[sel.selectedIndex];
            if (!opt) return;

            isDownloading = true;
            btn.disabled = true;
            btn.textContent = 'Pobieranie...';
            cancelBtn.style.display = 'block';
            sel.disabled = true;
            close.style.display = 'none';
            progressWrap.style.display = 'block';
            progressBar.style.width = '0%';

            activeRequest = startDownload(
                opt.value,
                opt.dataset.quality,
                videoTitle,
                st,
                progressBar,
                resetUI
            );
        });

        cancelBtn.addEventListener('click', () => {
            if (activeRequest) {
                activeRequest.abort();
                resetUI();
            }
        });

        document.body.appendChild(pnl);
        setStatus(st, sources.length + ' jakości - wybierz i kliknij Pobierz');
    }

    async function init() {
        if (!location.pathname.includes('view_video') && !location.search.includes('viewkey=')) return;

        const pnl = document.createElement('div');
        pnl.className = 'phdl-pnl';
        pnl.innerHTML = '<div class="phdl-hdr">⬇ PH Downloader</div><div class="phdl-st">Szukam źródeł...</div>';
        document.body.appendChild(pnl);

        let sources = [];
        for (let i = 0; i < 20; i++) {
            sources = await fetchRealSources();
            if (sources.length > 0) break;
            await new Promise(r => setTimeout(r, 1500));
        }

        if (sources.length === 0) {
            pnl.innerHTML = '<button class="phdl-close" onclick="this.parentElement.remove()">✕</button>'
                + '<div class="phdl-hdr">⬇ PH Downloader</div>'
                + '<div class="phdl-st phdl-err">Nie znaleziono źródeł. F12 → console</div>';
            return;
        }

        pnl.remove();
        const titleEl = document.querySelector('h1') || document.querySelector('[class*="title"]');
        buildUI(sources, titleEl ? titleEl.textContent.trim() : 'video');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
