// ==UserScript==
// @name         Universal Media Downloader (PL)
// @namespace    opencode-test.downloaders
// @version      1.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/uniwersalny/universal-media-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/uniwersalny/universal-media-downloader.user.js
// @description  Jeden przycisk pobierania na każdej stronie: wykrywa <video> (mp4/webm), strumienie HLS (m3u8) i galerie zdjęć. Kolejka sekwencyjna, ZIP dla obrazów, komenda ffmpeg dla HLS.
// @author       opencode-test
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ---------- Konfiguracja (menu Tampermonkey) ----------
    const CFG = {
        minImg: GM_getValue('umd_minImg', 400),   // minimalny bok obrazu w px (mniejsze = ikony, odrzucane)
        autoOpen: GM_getValue('umd_autoOpen', false), // czy otwierać panel po wykryciu pierwszego wideo
        whitelist: GM_getValue('umd_whitelist', ''),
    };

    GM_registerMenuCommand('Minimalny rozmiar obrazu…', () => {
        const v = prompt('Minimalny bok obrazu w px (mniejsze pomijane):', String(GM_getValue('umd_minImg', 400)));
        if (v !== null && !isNaN(parseInt(v, 10))) { GM_setValue('umd_minImg', parseInt(v, 10)); location.reload(); }
    });
    GM_registerMenuCommand(CFG.autoOpen ? 'Wyłącz auto-otwieranie panelu' : 'Włącz auto-otwieranie panelu', () => {
        GM_setValue('umd_autoOpen', !CFG.autoOpen); location.reload();
    });
    GM_registerMenuCommand('Whitelist domen…', () => {
        const v = prompt('Domeny pomijane (przecinek):', GM_getValue('umd_whitelist', ''));
        if (v !== null) { GM_setValue('umd_whitelist', v); location.reload(); }
    });

    const host = location.hostname || '';
    if (String(CFG.whitelist).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        .some(d => host === d || host.endsWith('.' + d))) return;

    // ---------- Magazyn wykrytych mediów (dedup po URL-u) ----------
    const videos = new Map(); // url -> { url, label, el }
    const hlsStreams = new Map();
    const images = new Map();

    const VIDEO_EXT = /\.(mp4|webm|mov|mkv|avi|m4v)(\?|#|$)/i;
    const IMG_EXT = /\.(jpg|jpeg|png|webp|avif|gif|bmp)(\?|#|$)/i;

    function fileName(url, ext) {
        // Bezpieczna nazwa: tytuł strony + ogon URL-a, bez znaków zakazanych w Windows.
        let base = '';
        try {
            const u = new URL(url, location.href);
            base = decodeURIComponent(u.pathname.split('/').pop() || 'plik');
            base = base.split('?')[0].split('#')[0] || 'plik';
        } catch (e) { base = 'plik'; }
        base = base.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
        if (ext && !new RegExp('\\.' + ext + '$', 'i').test(base)) base += '.' + ext;
        const title = (document.title || 'strona').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
        return title + '_' + base;
    }

    // ---------- 1. Skan <video> (currentSrc PO inicjalizacji playera — lekcja thothub) ----------
    function scanVideos() {
        let added = false;
        document.querySelectorAll('video').forEach(v => {
            const src = v.currentSrc || v.src || '';
            if (src && !videos.has(src) && !hlsStreams.has(src)) {
                if (/\.m3u8(\?|#|$)/i.test(src)) {
                    hlsStreams.set(src, { url: src, label: labelFor(v, src) });
                } else {
                    videos.set(src, { url: src, label: labelFor(v, src) });
                }
                added = true;
            }
            // <source> wewnątrz <video> (nieaktywne warianty jakości też łapiemy).
            v.querySelectorAll('source[src]').forEach(s => {
                const u = s.src;
                if (u && !videos.has(u) && !hlsStreams.has(u)) {
                    if (/\.m3u8(\?|#|$)/i.test(u)) hlsStreams.set(u, { url: u, label: labelFor(v, u) });
                    else if (VIDEO_EXT.test(u) || u.startsWith('blob:')) videos.set(u, { url: u, label: labelFor(v, u) });
                    added = true;
                }
            });
        });
        if (added) render();
        return added;
    }

    function labelFor(videoEl, src) {
        const short = src.length > 70 ? '…' + src.slice(-69) : src;
        const res = (videoEl.videoWidth && videoEl.videoHeight)
            ? ` [${videoEl.videoWidth}x${videoEl.videoHeight}]` : '';
        return short + res;
    }

    // ---------- 2. Intercepcja fetch/XHR (wzorzec filmweb-censor: flaga __umdPatched) ----------
    function noteUrl(url) {
        if (typeof url !== 'string') return;
        const abs = url.startsWith('http') || url.startsWith('blob:') ? url : null;
        if (!abs) return;
        if (/\.m3u8(\?|#|$)/i.test(abs)) {
            if (!hlsStreams.has(abs)) { hlsStreams.set(abs, { url: abs, label: abs }); render(); }
        } else if (VIDEO_EXT.test(abs)) {
            if (!videos.has(abs)) { videos.set(abs, { url: abs, label: abs }); render(); }
        }
    }

    function patchNetwork() {
        if (window.__umdPatched) return;
        window.__umdPatched = true;
        const origFetch = window.fetch;
        window.fetch = function (...args) {
            try { noteUrl(typeof args[0] === 'string' ? args[0] : args[0] && args[0].url); } catch (e) {}
            return origFetch.apply(this, args);
        };
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            try { noteUrl(url); } catch (e) {}
            return origOpen.call(this, method, url, ...rest);
        };
    }

    // ---------- 3. Performance entries (łapie requesty sprzed startu skryptu) ----------
    function scanPerf() {
        let added = false;
        try {
            performance.getEntriesByType('resource').forEach(r => {
                const u = r.name || '';
                if (/\.m3u8(\?|#|$)/i.test(u) && !hlsStreams.has(u)) {
                    hlsStreams.set(u, { url: u, label: u }); added = true;
                } else if (VIDEO_EXT.test(u) && !videos.has(u)) {
                    videos.set(u, { url: u, label: u }); added = true;
                }
            });
        } catch (e) {}
        if (added) render();
    }

    // ---------- 4. Skan obrazów (filtr rozmiaru odcina ikony — naturalWidth jak w girlstop) ----------
    function scanImages() {
        let added = false;
        document.querySelectorAll('img[src]').forEach(img => {
            const raw = img.currentSrc || img.src;
            if (!raw || raw.startsWith('data:') || images.has(raw)) return;
            const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10) || 0;
            const h = img.naturalHeight || parseInt(img.getAttribute('height') || '0', 10) || 0;
            // Obrazy jeszcze niezaładowane (0x0) pomijamy w tym cyklu — wrócą w kolejnym skanie.
            if ((w > 0 || h > 0) && Math.max(w, h) < CFG.minImg) return;
            if (!IMG_EXT.test(raw.split('?')[0]) && w === 0) return; // bez rozszerzenia i bez rozmiaru = śledzenie
            images.set(raw, { url: raw, label: `${Math.max(w, h) || '?'}px — ${raw.slice(-60)}` });
            added = true;
        });
        // Linki bezpośrednio do plików graficznych (<a href="...jpg">).
        document.querySelectorAll('a[href]').forEach(a => {
            const href = a.href;
            if (href && IMG_EXT.test(href.split('?')[0]) && !images.has(href)) {
                images.set(href, { url: href, label: href.slice(-70) });
                added = true;
            }
        });
        if (added) render();
    }

    // ---------- 5. Pobieranie: kolejka sekwencyjna + abort (wzorzec redgifs/pornhub) ----------
    const queue = [];
    let busy = false;
    let abortHandle = null;

    function enqueue(items) {
        items.forEach(it => queue.push(it));
        pump();
        renderStatus();
    }

    function pump() {
        if (busy || queue.length === 0) { renderStatus(); return; }
        busy = true;
        const item = queue.shift();
        renderStatus(`Pobieranie ${item.name}…`);
        downloadOne(item, (ok, msg) => {
            busy = false;
            renderStatus(ok ? `OK: ${item.name}` : `BŁĄD: ${msg || item.name}`);
            setTimeout(pump, 400); // odstęp między plikami (anty rate-limit)
        });
    }

    function downloadOne(item, done) {
        // Blob: odczyt fetch → obiekt → <a download> (blob: czyta tylko ten sam kontekst).
        if (item.url.startsWith('blob:')) {
            fetch(item.url).then(r => r.blob()).then(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = item.name;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 10000);
                done(true);
            }).catch(() => done(false, 'blob nieczytelny (DRM/kontekst playera?)'));
            return;
        }
        // Plik http(s): GM_download (omija CORS, wysyła Referer strony)...
        try {
            abortHandle = GM_download({
                url: item.url,
                name: item.name,
                onerror: () => fallbackBlob(item, done),
                ontimeout: () => fallbackBlob(item, done),
                onload: () => done(true),
            });
        } catch (e) { fallbackBlob(item, done); }
    }

    function fallbackBlob(item, done) {
        // ...a gdy serwer odrzuci (hotlink-protection), blob przez GM_xmlhttpRequest z Referer.
        abortHandle = GM_xmlhttpRequest({
            method: 'GET',
            url: item.url,
            headers: { Referer: location.href },
            responseType: 'blob',
            onload: (res) => {
                if (res.status >= 400) { done(false, 'HTTP ' + res.status); return; }
                const a = document.createElement('a');
                a.href = URL.createObjectURL(res.response);
                a.download = item.name;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 10000);
                done(true);
            },
            onerror: () => done(false, 'serwer odrzucił (hotlink/DRM?)'),
            ontimeout: () => done(false, 'timeout'),
        });
    }

    function cancelAll() {
        queue.length = 0;
        if (abortHandle && abortHandle.abort) { try { abortHandle.abort(); } catch (e) {} }
        busy = false;
        renderStatus('Anulowano.');
    }

    // ---------- 6. ZIP dla obrazów (JSZip, wzorzec reddit-media-downloader) ----------
    function downloadImagesZip(checkedUrls) {
        const urls = checkedUrls.length ? checkedUrls : [...images.keys()];
        if (urls.length === 0) { renderStatus('Brak obrazów.'); return; }
        renderStatus(`Pakowanie ZIP (${urls.length})…`);
        const zip = new JSZip();
        let i = 0;
        const next = () => {
            if (i >= urls.length) {
                zip.generateAsync({ type: 'blob' }).then(blob => {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = fileName(location.href, 'zip').replace(/\.zip\.zip$/i, '.zip');
                    document.body.appendChild(a); a.click(); a.remove();
                    renderStatus(`ZIP gotowy (${urls.length} plików).`);
                });
                return;
            }
            const url = urls[i++];
            renderStatus(`ZIP ${i}/${urls.length}…`);
            GM_xmlhttpRequest({
                method: 'GET', url, headers: { Referer: location.href }, responseType: 'arraybuffer',
                onload: (res) => {
                    if (res.status < 400) {
                        try {
                            const u = new URL(url);
                            zip.file(u.pathname.split('/').pop().split('?')[0] || `img${i}.jpg`, res.response);
                        } catch (e) {}
                    }
                    setTimeout(next, 200);
                },
                onerror: () => setTimeout(next, 200),
            });
        };
        next();
    }

    // ---------- 7. UI: przycisk + panel (lewy dół — prawy zajęty przez clean-links/filmweb) ----------
    let panel = null, btn = null, statusEl = null;
    let firstVideo = true;

    GM_addStyle(`
        #umd-btn { position: fixed !important; left: 10px !important; bottom: 10px !important;
            z-index: 2147483646 !important; font: 12px/1.4 system-ui, sans-serif !important;
            background: #1a73e8 !important; color: #fff !important; border: none !important;
            padding: 6px 10px !important; border-radius: 8px !important; cursor: pointer !important;
            opacity: .85 !important; box-shadow: 0 2px 8px rgba(0,0,0,.3) !important; }
        #umd-panel { position: fixed !important; left: 10px !important; bottom: 48px !important;
            width: 360px !important; max-height: 60vh !important; overflow-y: auto !important;
            z-index: 2147483647 !important; font: 12px/1.4 system-ui, sans-serif !important;
            background: #fff !important; color: #111 !important; border: 1px solid #ccc !important;
            border-radius: 10px !important; box-shadow: 0 4px 20px rgba(0,0,0,.35) !important;
            padding: 10px !important; }
        #umd-panel h3 { margin: 8px 0 4px !important; font-size: 12px !important; }
        #umd-panel .umd-row { display: flex !important; gap: 6px !important; align-items: center !important;
            padding: 3px 0 !important; border-bottom: 1px solid #eee !important; }
        #umd-panel .umd-url { flex: 1 !important; overflow: hidden !important; text-overflow: ellipsis !important;
            white-space: nowrap !important; }
        #umd-panel button { font-size: 11px !important; padding: 2px 8px !important; cursor: pointer !important; }
        #umd-status { margin-top: 6px !important; color: #555 !important; min-height: 16px !important; }
    `);

    function buildUI() {
        btn = document.createElement('button');
        btn.id = 'umd-btn';
        btn.textContent = '⬇ Media (0)';
        btn.addEventListener('click', () => {
            if (panel) { panel.remove(); panel = null; return; }
            openPanel();
        });
        document.body.appendChild(btn);
    }

    function openPanel() {
        panel = document.createElement('div');
        panel.id = 'umd-panel';
        document.body.appendChild(panel);
        render();
    }

    function checkedUrls(cls) {
        if (!panel) return [];
        return [...panel.querySelectorAll(`input.${cls}:checked`)].map(c => c.value);
    }

    function render(extraStatus) {
        const total = videos.size + images.size + hlsStreams.size;
        if (btn) btn.textContent = `⬇ Media (${total})`;
        // Auto-otwarcie raz, po pierwszym wideo (opcjonalne).
        if (CFG.autoOpen && firstVideo && videos.size > 0 && document.body && !panel) {
            firstVideo = false;
            openPanel();
            return;
        }
        firstVideo = videos.size === 0;
        if (!panel) return;
        if (extraStatus !== undefined) { renderStatus(extraStatus); return; }

        let html = `<div><b>Universal Media Downloader</b>
            <button id="umd-rescan" style="float:right">↻ Skan</button></div>`;

        html += `<h3>🎬 Wideo (${videos.size})</h3>`;
        if (!videos.size) html += `<div style="color:#888">brak — poczekaj na start playera</div>`;
        videos.forEach((v, url) => {
            html += `<div class="umd-row"><input type="checkbox" class="umd-v" value="${esc(url)}" checked>
                <span class="umd-url" title="${esc(url)}">${esc(v.label)}</span>
                <button data-dl="${esc(url)}">⬇</button></div>`;
        });
        if (videos.size) html += `<button id="umd-dl-v">Pobierz zaznaczone</button> `;

        html += `<h3>📡 HLS / m3u8 (${hlsStreams.size})</h3>`;
        if (!hlsStreams.size) html += `<div style="color:#888">brak</div>`;
        hlsStreams.forEach((s, url) => {
            html += `<div class="umd-row"><span class="umd-url" title="${esc(url)}">${esc(url.slice(-70))}</span>
                <button data-cp="${esc(url)}">URL</button>
                <button data-ff="${esc(url)}">ffmpeg</button></div>`;
        });

        html += `<h3>🖼 Obrazy (${images.size})</h3>`;
        if (!images.size) html += `<div style="color:#888">brak (filtr: ≥${CFG.minImg}px)</div>`;
        [...images.entries()].slice(0, 200).forEach(([url, im]) => {
            html += `<div class="umd-row"><input type="checkbox" class="umd-i" value="${esc(url)}" checked>
                <span class="umd-url" title="${esc(url)}">${esc(im.label)}</span></div>`;
        });
        if (images.size > 200) html += `<div style="color:#888">…i ${images.size - 200} więcej (limit listy)</div>`;
        if (images.size) html += `<button id="umd-dl-i">Pobierz zaznaczone</button> <button id="umd-zip-i">ZIP</button> `;

        html += `<div><button id="umd-cancel">✖ Anuluj kolejkę</button></div><div id="umd-status"></div>`;
        panel.innerHTML = html;
        statusEl = panel.querySelector('#umd-status');

        panel.querySelector('#umd-rescan').addEventListener('click', () => { fullScan(); });
        const dv = panel.querySelector('#umd-dl-v');
        if (dv) dv.addEventListener('click', () => {
            enqueue(checkedUrls('umd-v').map(u => ({ url: u, name: fileName(u, 'mp4') })));
        });
        const di = panel.querySelector('#umd-dl-i');
        if (di) di.addEventListener('click', () => {
            enqueue(checkedUrls('umd-i').map(u => ({ url: u, name: fileName(u) })));
        });
        const zi = panel.querySelector('#umd-zip-i');
        if (zi) zi.addEventListener('click', () => downloadImagesZip(checkedUrls('umd-i')));
        panel.querySelector('#umd-cancel').addEventListener('click', cancelAll);
        panel.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => {
            enqueue([{ url: b.dataset.dl, name: fileName(b.dataset.dl, 'mp4') }]);
        }));
        panel.querySelectorAll('[data-cp]').forEach(b => b.addEventListener('click', () => {
            GM_setClipboard(b.dataset.cp); renderStatus('Skopiowano URL m3u8.');
        }));
        panel.querySelectorAll('[data-ff]').forEach(b => b.addEventListener('click', () => {
            GM_setClipboard(`ffmpeg -i "${b.dataset.ff}" -c copy "${fileName(b.dataset.ff, 'mp4')}"`);
            renderStatus('Skopiowano komendę ffmpeg.');
        }));
    }

    function renderStatus(msg) {
        if (msg !== undefined) {
            if (statusEl) statusEl.textContent = msg;
            else if (btn && queue.length) btn.textContent = `⬇ (${queue.length}) ${msg}`;
        } else if (btn) {
            const total = videos.size + images.size + hlsStreams.size;
            btn.textContent = busy ? `⬇ …(${queue.length})` : `⬇ Media (${total})`;
        }
        if (msg && statusEl) statusEl.textContent = msg;
    }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---------- 8. Start: pełny skan + observer + skany cykliczne (SPA) ----------
    function fullScan() {
        scanVideos();
        scanPerf();
        scanImages();
    }

    function start() {
        patchNetwork();
        if (!document.body) {
            setTimeout(start, 300);
            return;
        }
        buildUI();
        fullScan();
        let debounce = null;
        new MutationObserver(() => {
            clearTimeout(debounce);
            debounce = setTimeout(fullScan, 400);
        }).observe(document.body, { childList: true, subtree: true });
        // Leniwe playery (jak shreddit-async-loader / GWT): skany 1/3/7/15s + co 10s polling <video>.
        [1000, 3000, 7000, 15000].forEach(t => setTimeout(fullScan, t));
        setInterval(() => { if (scanVideos() && CFG.autoOpen && !panel) openPanel(); }, 10000);
    }

    start();
})();
