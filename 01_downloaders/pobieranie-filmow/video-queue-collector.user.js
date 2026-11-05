// ==UserScript==
// @name         Video Queue Collector — kolejka filmów do pobrania
// @namespace    http://tampermonkey.net/
// @version      1.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/video-queue-collector.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/video-queue-collector.user.js
// @description  Zbieraj linki do filmów z wielu stron (eporner/tnaflix/pimpbunny/thotchicks/webpussi/camwhores + ~40 domen) i pobieraj je wsadowo. Nazwa pliku = tytuł filmu (edytowalna per-pozycja).
// @author       opencode
// @match        *://*.eporner.com/*
// @match        *://*.tnaflix.com/*
// @match        *://*.pimpbunny.com/*
// @match        *://*.thotchicks.com/*
// @match        *://*.webpussi.com/*
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
// @match        *://*.porntrex.com/*
// @match        *://*.hclips.com/*
// @match        *://*.txxx.com/*
// @match        *://*.hdzog.com/*
// @match        *://*.vjav.com/*
// @match        *://*.drtuber.com/*
// @match        *://*.nuvid.com/*
// @match        *://*.zbporn.com/*
// @match        *://*.anysex.com/*
// @match        *://*.gotporn.com/*
// @match        *://*.spankwire.com/*
// @match        *://*.keezmovies.com/*
// @match        *://*.extremetube.com/*
// @match        *://*.pornhoarder.com/*
// @match        *://*.pornhd.com/*
// @match        *://*.uiporn.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      eporner.com
// @connect      *.eporner.com
// @connect      *.cdn.eporner.com
// @connect      vid-s*.eporner.com
// @connect      dash-s*.eporner.com
// @connect      tnaflix.com
// @connect      *.tnaflix.com
// @connect      pimpbunny.com
// @connect      *.pimpbunny.com
// @connect      thotplay.com
// @connect      cdn.thotplay.com
// @connect      thotchicks.com
// @connect      *.thotchicks.com
// @connect      webpussi.com
// @connect      *.webpussi.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ---------------------------------------------------------------- config
    const STORAGE_KEY = 'vqc_queue_v1';
    const QUEUE_COLLAPSED_KEY = 'vqc_collapsed_v1';
    const QUALITY_ORDER = ['1080', '720', '480', '360', '240', '144'];
    // GM storage jest per-skrypt, więc kolejka jest współdzielona między domenami
    const _W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    function log(...a) { console.log('[VQC]', ...a); }

    // ---------------------------------------------------------------- storage
    function loadQueue() {
        try { return JSON.parse(GM_getValue(STORAGE_KEY, '[]')) || []; } catch { return []; }
    }
    function saveQueue(q) {
        GM_setValue(STORAGE_KEY, JSON.stringify(q));
    }
    function isCollapsed() {
        return GM_getValue(QUEUE_COLLAPSED_KEY, false);
    }
    function setCollapsed(v) {
        GM_setValue(QUEUE_COLLAPSED_KEY, !!v);
    }

    function sanitizeFilename(s) {
        return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 140) || 'video';
    }
    // zapewnia rozszerzenie .mp4/.ts itp. i sanityzuje bez podwójnego cięcia
    function sanitizeWithExt(name, ext) {
        ext = (ext || 'mp4').replace(/^\./, '').toLowerCase();
        // usuń istniejące rozszerzenie z nazwy jeśli użytkownik je wpisał
        name = name.replace(/\.[a-z0-9]{2,4}$/i, '').trim();
        name = sanitizeFilename(name);
        if (!name.toLowerCase().endsWith('.' + ext)) name += '.' + ext;
        return name;
    }
    function buildFilename(title, ext) {
        return sanitizeWithExt(title, ext);
    }
    function siteName() {
        return location.hostname.replace(/^www\./, '');
    }

    // ---------------------------------------------------------------- tytuły / id
    // zwraca SUROWY tytuł (bez sanityzacji — sanityzacja dopiero przy budowie filename)
    function getRawTitle() {
        let h1 = document.querySelector('#video-info h1');
        if (h1) {
            const clone = h1.cloneNode(true);
            clone.querySelectorAll('span').forEach(s => s.remove());
            let t = clone.textContent.trim();
            if (t) return t;
        }
        const ld = document.querySelector('script[type="application/ld+json"]');
        if (ld) {
            try { const d = JSON.parse(ld.textContent); if (d.name) return String(d.name).trim(); } catch {}
        }
        const og = document.querySelector('meta[property="og:title"]');
        if (og && og.content) return og.content.replace(' - EPORNER', '').replace(/ - Tnaflix.*$/i, '').trim();
        // thotchicks / generyczne h1
        const h1any = document.querySelector('h1');
        if (h1any && h1any.textContent.trim().length > 3 && h1any.textContent.trim().length < 200) return h1any.textContent.trim();
        return document.title.replace(' - EPORNER', '').replace(' - Tnaflix.com', '').trim() || 'video';
    }
    function getVideoTitle_generic() {
        return sanitizeFilename(getRawTitle());
    }

    // ---------------------------------------------------------------- Eporner: wydobycie źródeł (kopiuje logikę eporner-downloader v3.1)
    function getVid() {
        const p = _W.EP && _W.EP.video && _W.EP.video.player;
        if (p && p.vid) return String(p.vid).trim();
        const epv = document.querySelector('#EPvideo[data-vid]');
        if (epv) { const dv = epv.getAttribute('data-vid'); if (dv) return dv.split('/')[0].trim(); }
        const dv2 = document.querySelector('[data-vid]');
        if (dv2) { const dv = dv2.getAttribute('data-vid'); if (dv) return dv.split('/')[0].trim(); }
        const m = location.pathname.match(/\/(?:hd-porn|embed|video-porno|porno-video|film-porno)\/([^\/]+)/);
        if (m) return m[1].trim();
        const m2 = location.pathname.match(/\/video-([A-Za-z0-9]+)/);
        if (m2) return m2[1].trim();
        return null;
    }
    function getPlayerHash() {
        const p = _W.EP && _W.EP.video && _W.EP.video.player;
        if (p && p.hash) return String(p.hash).trim();
        for (const s of document.querySelectorAll('script')) {
            const txt = s.textContent || '';
            const m = txt.match(/EP\.video\.player\.hash\s*=\s*['"]([a-f0-9]{32})['"]/i);
            if (m) return m[1];
        }
        return null;
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
            } catch { return null; }
        }
        return hash;
    }
    function buildXhrUrl(vid, playerHash) {
        const xhrHash = computeXhrHash(playerHash);
        if (!xhrHash || !vid) return null;
        const params = new URLSearchParams({
            hash: xhrHash, domain: location.hostname,
            pixelRatio: String(window.devicePixelRatio || 1),
            playerWidth: '0', playerHeight: '0', fallback: 'false', embed: 'false',
            supportedFormats: 'hls,dash,h265,vp9,av1,mp4', _: String(Date.now()),
        });
        return `${location.origin}/xhr/video/${encodeURIComponent(vid)}?${params}`;
    }
    function fetchEpornerSources() {
        return new Promise((resolve) => {
            const vid = getVid(), playerHash = getPlayerHash();
            if (!vid || !playerHash) { resolve([]); return; }
            const url = buildXhrUrl(vid, playerHash);
            if (!url) { resolve([]); return; }
            GM_xmlhttpRequest({
                method: 'GET', url, headers: { Referer: location.href },
                onload: (resp) => {
                    try {
                        const data = JSON.parse(resp.responseText);
                        const out = [];
                        if (data.sources && data.sources.mp4) {
                            for (const [label, info] of Object.entries(data.sources.mp4)) {
                                out.push({ quality: (info.labelShort || label).replace('p', '').trim(), label, url: info.src, ext: 'mp4', type: 'eporner' });
                            }
                        }
                        out.sort((a, b) => QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality));
                        resolve(out);
                    } catch { resolve([]); }
                },
                onerror: () => resolve([]), ontimeout: () => resolve([]),
            });
        });
    }
    function waitForEporner(maxWait = 20000) {
        return new Promise((resolve) => {
            const start = Date.now();
            (function check() {
                if (getVid() && getPlayerHash()) return resolve(true);
                if (Date.now() - start >= maxWait) return resolve(false);
                setTimeout(check, 500);
            })();
        });
    }

    // ---------------------------------------------------------------- Tnaflix
    function fetchTnaflixSources() {
        const sources = document.querySelectorAll('#video-player source');
        if (!sources.length) return [];
        const LABELS = { '720': '720p', '480': '480p', '360': '360p', '240': '240p', '144': '144p' };
        const ORDER = ['720', '480', '360', '240', '144'];
        const out = Array.from(sources).map(s => ({
            quality: s.getAttribute('size') || '',
            label: LABELS[s.getAttribute('size')] || (s.getAttribute('size') + 'p'),
            url: s.getAttribute('src'), ext: 'mp4', type: 'tnaflix'
        })).filter(s => s.url);
        out.sort((a, b) => ORDER.indexOf(a.quality) - ORDER.indexOf(b.quality));
        return out;
    }

    // ---------------------------------------------------------------- PimpBunny
    function fetchPimpBunnySource() {
        const video = document.querySelector('video.fp-engine, video[src*="get_file"]');
        if (!video || !video.src) return [];
        const url = video.src;
        const qm = url.match(/_(\d{3,4}p)\.mp4/);
        const quality = qm ? qm[1].replace('p', '') : 'source';
        return [{ quality, label: qm ? qm[1] : 'source', url, ext: 'mp4', type: 'pimpbunny' }];
    }

    // ---------------------------------------------------------------- ThotChicks (tylko meta — m3u8/HLS wymaga deszyfracji, do kolejki zapisujemy strone)
    function isThotChicksPage() {
        return location.hostname.includes('thotchicks.com');
    }

    // ---------------------------------------------------------------- Generic fallback (jak w adult-video-downloader)
    function fetchGenericSources() {
        const out = [];
        const seen = new Set();
        function add(url, label, ext) {
            if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;
            try { url = new URL(url, location.href).href; } catch { return; }
            if (seen.has(url)) return;
            seen.add(url);
            out.push({ quality: label || ext || 'source', label: label || ext || 'source', url, ext: ext || 'mp4', type: 'generic' });
        }
        document.querySelectorAll('video').forEach(v => {
            if (v.src) add(v.src, 'video.src', (v.src.split('.').pop() || 'mp4').split('?')[0]);
            if (v.currentSrc) add(v.currentSrc, 'currentSrc', 'mp4');
            v.querySelectorAll('source').forEach(s => {
                if (s.src) add(s.src, s.getAttribute('size') || s.type || 'source', 'mp4');
            });
        });
        return out;
    }

    // ---------------------------------------------------------------- główna ekstrakcja
    async function extractSources() {
        const host = location.hostname;
        if (host.includes('eporner.com')) {
            await waitForEporner(12000);
            const s = await fetchEpornerSources();
            if (s.length) return s;
        }
        if (host.includes('tnaflix.com')) {
            const s = fetchTnaflixSources();
            if (s.length) return s;
        }
        if (host.includes('pimpbunny.com')) {
            const s = fetchPimpBunnySource();
            if (s.length) return s;
        }
        if (isThotChicksPage()) {
            // HLS — nie próbujemy tu deszyfrować, kolejka zapisze stronę; pobranie indywidualne niech użyje dedykowanego downloadera
            // ale jeśli <video> już ma src, użyj go
            const g = fetchGenericSources();
            if (g.length) return g;
            // zapis strony jako placeholder (bez directUrl)
            return [];
        }
        const generic = fetchGenericSources();
        if (generic.length) return generic;
        return [];
    }

    // ---------------------------------------------------------------- kolejka — CRUD
    function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    function addToQueue(item) {
        const q = loadQueue();
        // deduplikacja po pageUrl + directUrl
        if (q.some(x => x.pageUrl === item.pageUrl && x.directUrl === item.directUrl)) {
            notify('Już w kolejce', 'warning');
            return false;
        }
        q.push(item);
        saveQueue(q);
        notify(`Dodano do kolejki: ${item.title} [${item.label}]`, 'success');
        renderFloating();
        return true;
    }

    function removeFromQueue(id) {
        let q = loadQueue();
        q = q.filter(x => x.id !== id);
        saveQueue(q);
        renderFloating();
    }
    function clearQueue() {
        saveQueue([]);
        renderFloating();
        notify('Kolejka wyczyszczona', 'info');
    }
    function renameInQueue(id, newFilename) {
        const q = loadQueue();
        const it = q.find(x => x.id === id);
        if (!it) return;
        // sanityzuj z zachowaniem rozszerzenia oryginału
        const ext = (it.ext || 'mp4').replace(/^\./, '');
        it.filename = sanitizeWithExt(newFilename, ext);
        // aktualizuj też tytuł jeśli użytkownik zmienił nazwę — tytuł zostaje, filename jest niezależny
        saveQueue(q);
        renderFloating();
        notify(`Zmieniono nazwę: ${it.filename}`, 'success');
    }

    // ---------------------------------------------------------------- notify
    function notify(msg, type) {
        const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336', warning: '#ff9800' };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;transition:opacity .4s;font-family:Arial,sans-serif;pointer-events:none;max-width:420px;';
        el.innerHTML = `<div style="background:${colors[type] || colors.info};color:#fff;padding:10px 18px;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.4);font-size:13px;">${msg}</div>`;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3200);
    }

    // ---------------------------------------------------------------- panel dodawania na stronie wideo
    async function injectAddPanel() {
        if (document.getElementById('vqc-add-panel')) return;
        const sources = await extractSources();
        const isVideoPage = sources.length > 0 || /^\/(hd-porn|video-|embed|film-porno|video-porno|porno-video)\//.test(location.pathname)
            || document.querySelector('#EPvideo') || document.querySelector('#video-player') || document.querySelector('video.fp-engine')
            || isThotChicksPage();

        if (!isVideoPage) return;

        const title = getVideoTitle_generic();
        const site = siteName();

        // jeśli brak źródeł (np thotchicks HLS bez gotowego video.src), pokaż przycisk „dodaj stronę"
        const container = document.createElement('div');
        container.id = 'vqc-add-panel';
        const hasSources = sources.length > 0;

        let buttonsHtml = '';
        if (hasSources) {
            buttonsHtml = sources.map((s, i) => `
                <button class="vqc-add-btn" data-idx="${i}" title="${s.url.slice(0, 80)}">${s.label}</button>
            `).join('');
            // przycisk „najlepsza"
            buttonsHtml += `<button class="vqc-add-btn vqc-add-btn--best" data-idx="0" title="Dodaj najlepszą jakość">+ Najlepsza</button>`;
        } else {
            buttonsHtml = `<button class="vqc-add-btn vqc-add-btn--best" data-idx="-1">+ Dodaj tę stronę do kolejki</button>
                <span style="font-size:11px;color:#888;">(bezpośredni URL zostanie pobrany przy kolejkowaniu)</span>`;
        }

        container.innerHTML = `
            <div style="background:#1a1a2e;border:1px solid #e94560;border-radius:8px;padding:10px 14px;margin:10px 0;font-family:Arial,sans-serif;color:#eee;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;">
                <span style="font-weight:700;font-size:13px;color:#e94560;">◆ Kolejka</span>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">${buttonsHtml}</div>
                <span style="font-size:11px;color:#888;">Dodaje do kolejki • zarządzenie w pływającym panelu ↘</span>
            </div>
        `;

        // wstaw za playerem
        const target = document.querySelector('#movieplayer-box') || document.querySelector('#vidcontent')
            || document.querySelector('#video-player-container') || document.querySelector('#video-player')
            || document.querySelector('.pb-player') || document.querySelector('video.fp-engine')?.parentElement
            || document.querySelector('.video-player-area') || document.querySelector('#video-info')
            || document.querySelector('h1')?.parentElement;
        if (target && target.parentNode) target.parentNode.insertBefore(container, target.nextSibling);
        else document.body.prepend(container);

        container.querySelectorAll('.vqc-add-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                const rawTitle = getRawTitle();
                if (idx === -1) {
                    // thotchicks / brak źródeł — zapisz stronę; pozwól od razu edytować nazwę
                    const defName = buildFilename(rawTitle, 'mp4');
                    const edited = prompt('Nazwa pliku (możesz edytować):', defName);
                    if (edited === null) return; // anulowano
                    const filename = sanitizeWithExt(edited.trim() || defName, 'mp4');
                    addToQueue({
                        id: makeId(), pageUrl: location.href, title: rawTitle, site,
                        quality: 'strona', label: 'strona (HLS)', directUrl: '',
                        filename, addedAt: Date.now(), ext: 'mp4', type: 'page'
                    });
                } else {
                    const s = sources[idx] || sources[0];
                    if (!s) { notify('Brak źródła', 'error'); return; }
                    // domyślnie: tytuł filmu jako nazwa pliku (sanityzowany), z właściwym rozszerzeniem
                    const defName = buildFilename(rawTitle, s.ext || 'mp4');
                    // szybkie dodanie bez pytania przy kliknięciu „+ Najlepsza", edycja dostępna w widgetcie
                    // dla pozostałych jakości — daj szansę edycji gdy użytkownik przytrzyma Shift
                    let filename = defName;
                    // Shift+klik = edytuj nazwę przed dodaniem
                    // @ts-ignore — event jest w closure? przechwyć globalnie
                    const isShift = window.event && window.event.shiftKey;
                    if (isShift) {
                        const edited = prompt('Nazwa pliku (Shift+klik — możesz edytować):', defName);
                        if (edited === null) return;
                        filename = sanitizeWithExt(edited.trim() || defName, s.ext || 'mp4');
                    }
                    addToQueue({
                        id: makeId(), pageUrl: location.href, title: rawTitle, site,
                        quality: s.quality, label: s.label, directUrl: s.url,
                        filename, addedAt: Date.now(), ext: s.ext || 'mp4', type: s.type
                    });
                }
            });
        });
    }

    // ---------------------------------------------------------------- pływający widget kolejki
    let widgetEl = null;

    function buildFloatingWidget() {
        if (widgetEl) return widgetEl;
        widgetEl = document.createElement('div');
        widgetEl.id = 'vqc-widget';
        widgetEl.innerHTML = `
            <div class="vqc-widget-head" id="vqc-head">
                <span class="vqc-widget-title">⬥ Kolejka (<span id="vqc-count">0</span>)</span>
                <div class="vqc-widget-head-btns">
                    <button id="vqc-toggle" title="Zwiń/rozwiń">−</button>
                    <button id="vqc-close" title="Ukryj (menu Tampermonkey → Pokaż)">×</button>
                </div>
            </div>
            <div class="vqc-widget-body" id="vqc-body">
                <div id="vqc-list" class="vqc-list"></div>
                <div class="vqc-actions">
                    <button id="vqc-dl-all" class="vqc-btn vqc-btn--primary" title="Pobierz kolejno przez GM_download (z opóźnieniem 1.2s)">Pobierz wszystkie</button>
                    <button id="vqc-copy-all" class="vqc-btn" title="Kopiuj listę URL-i do schowka">Kopiuj URL-e</button>
                    <button id="vqc-export" class="vqc-btn" title="Eksportuj kolejkę do JSON / TXT (re-import w kolektorze)">Eksport JSON</button>
                    <button id="vqc-export-jd" class="vqc-btn" style="border-color:#4caf50;color:#4caf50;" title="Eksport dla JDownloadera — plik .crawljob z nazwami plików (tytułami). Przeciągnij do LinkGrabber">JD crawljob</button>
                    <button id="vqc-import-btn" class="vqc-btn" title="Importuj z JSON">Import</button>
                    <button id="vqc-clear" class="vqc-btn vqc-btn--danger" title="Wyczyść kolejkę">Wyczyść</button>
                </div>
                <div class="vqc-hint">Tip: dodawaj filmy przyciskiem „+ Najlepsza". JSON = re-import w kolektorze. JD crawljob / TXT = import do JDownloadera (LinkGrabber). Kolejka współdzielona między domenami.</div>
                <input type="file" id="vqc-import-file" accept=".json,.txt" style="display:none" />
            </div>
        `;
        document.body.appendChild(widgetEl);

        // drag
        const head = widgetEl.querySelector('#vqc-head');
        let drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
        head.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            drag = true; sx = e.clientX; sy = e.clientY;
            const r = widgetEl.getBoundingClientRect();
            ox = r.left; oy = r.top;
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!drag) return;
            widgetEl.style.left = (ox + e.clientX - sx) + 'px';
            widgetEl.style.top = (oy + e.clientY - sy) + 'px';
            widgetEl.style.right = 'auto'; widgetEl.style.bottom = 'auto';
        });
        window.addEventListener('mouseup', () => drag = false);

        widgetEl.querySelector('#vqc-toggle').addEventListener('click', () => {
            const body = widgetEl.querySelector('#vqc-body');
            const collapsed = body.style.display !== 'none';
            body.style.display = collapsed ? 'none' : '';
            widgetEl.querySelector('#vqc-toggle').textContent = collapsed ? '+' : '−';
            setCollapsed(collapsed);
        });
        widgetEl.querySelector('#vqc-close').addEventListener('click', () => {
            widgetEl.style.display = 'none';
        });

        widgetEl.querySelector('#vqc-dl-all').addEventListener('click', downloadAll);
        widgetEl.querySelector('#vqc-copy-all').addEventListener('click', copyAllUrls);
        widgetEl.querySelector('#vqc-export').addEventListener('click', exportQueue);
        widgetEl.querySelector('#vqc-export-jd').addEventListener('click', exportJDownloader);
        widgetEl.querySelector('#vqc-clear').addEventListener('click', () => {
            if (confirm('Wyczyścić kolejkę?')) clearQueue();
        });
        widgetEl.querySelector('#vqc-import-btn').addEventListener('click', () => {
            widgetEl.querySelector('#vqc-import-file').click();
        });
        widgetEl.querySelector('#vqc-import-file').addEventListener('change', importQueue);

        // przywróć stan zwinięcia
        if (isCollapsed()) {
            widgetEl.querySelector('#vqc-body').style.display = 'none';
            widgetEl.querySelector('#vqc-toggle').textContent = '+';
        }

        // odświeżaj co 2s (synchronizacja między kartami — GM storage nie ma eventu)
        setInterval(renderFloating, 2000);

        return widgetEl;
    }

    function renderFloating() {
        if (!widgetEl) buildFloatingWidget();
        const q = loadQueue();
        const countEl = document.getElementById('vqc-count');
        if (countEl) countEl.textContent = String(q.length);
        const list = document.getElementById('vqc-list');
        if (!list) return;
        if (!q.length) {
            list.innerHTML = `<div class="vqc-empty">Kolejka pusta — odwiedź strony wideo i kliknij „+ Najlepsza"</div>`;
            return;
        }
        list.innerHTML = q.map(item => `
            <div class="vqc-item" data-id="${item.id}">
                <div class="vqc-item-main">
                    <div class="vqc-item-title" title="${item.title}">${item.title}</div>
                    <div class="vqc-item-meta">${item.site} • ${item.label} • ${item.ext} ${item.directUrl ? '' : '• <span style="color:#ff9800">strona (HLS)</span>'}</div>
                    <div class="vqc-item-filename" title="Kliknij ✎ aby zmienić nazwę pliku">📄 ${item.filename}</div>
                    <div class="vqc-item-url" title="${item.directUrl || item.pageUrl}">${(item.directUrl || item.pageUrl).slice(0, 64)}</div>
                </div>
                <div class="vqc-item-actions">
                    <button class="vqc-mini" data-act="rename" title="Zmień nazwę pliku">✎</button>
                    <button class="vqc-mini" data-act="play" title="Otwórz stronę filmu">Otwórz</button>
                    <button class="vqc-mini" data-act="copy" title="Kopiuj URL">Kopiuj</button>
                    <button class="vqc-mini vqc-mini--danger" data-act="remove" title="Usuń z kolejki">×</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.vqc-item').forEach(row => {
            const id = row.dataset.id;
            row.querySelector('[data-act="remove"]').addEventListener('click', () => removeFromQueue(id));
            row.querySelector('[data-act="rename"]').addEventListener('click', () => {
                const item = loadQueue().find(x => x.id === id);
                if (!item) return;
                // inline prompt — prosto i niezawodnie; można wpisać dowolną nazwę, rozszerzenie zostanie zachowane
                const edited = prompt('Nowa nazwa pliku:', item.filename);
                if (edited === null) return;
                const trimmed = edited.trim();
                if (!trimmed) { notify('Nazwa nie może być pusta', 'warning'); return; }
                renameInQueue(id, trimmed);
            });
            // klik na samą nazwę też edytuje
            const fnEl = row.querySelector('.vqc-item-filename');
            if (fnEl) fnEl.addEventListener('click', () => row.querySelector('[data-act="rename"]').click());
            row.querySelector('[data-act="copy"]').addEventListener('click', () => {
                const item = loadQueue().find(x => x.id === id);
                if (!item) return;
                const url = item.directUrl || item.pageUrl;
                copyText(url);
                notify('Skopiowano URL', 'success');
            });
            row.querySelector('[data-act="play"]').addEventListener('click', () => {
                const item = loadQueue().find(x => x.id === id);
                if (!item) return;
                window.open(item.pageUrl, '_blank');
            });
        });
    }

    function copyText(text) {
        try { navigator.clipboard.writeText(text); return; } catch {}
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch {}
        ta.remove();
    }

    // ---------------------------------------------------------------- akcje masowe
    let bulkRunning = false;

    async function downloadAll() {
        if (bulkRunning) { notify('Pobieranie już trwa…', 'warning'); return; }
        const q = loadQueue();
        if (!q.length) { notify('Kolejka pusta', 'warning'); return; }
        // filtr: tylko mp4 z directUrl; strony HLS pomijamy z instrukcją
        const withUrl = q.filter(x => x.directUrl);
        const withoutUrl = q.filter(x => !x.directUrl);
        if (!withUrl.length) {
            notify('Brak bezpośrednich URL-i (kolejka zawiera tylko strony HLS). Otwórz je pojedynczo dedykowanym downloaderem.', 'warning', 5000);
            return;
        }
        if (withoutUrl.length) {
            notify(`Pomijam ${withoutUrl.length} pozycji bez directUrl (HLS/strona) — pobierz je ręcznie`, 'warning', 4000);
        }
        bulkRunning = true;
        const btn = document.getElementById('vqc-dl-all');
        const orig = btn ? btn.textContent : '';
        let done = 0;
        for (const item of withUrl) {
            if (!bulkRunning) break;
            if (btn) btn.textContent = `Pobieranie ${done + 1}/${withUrl.length}…`;
            try {
                await new Promise((resolve, reject) => {
                    try {
                        GM_download({
                            url: item.directUrl,
                            name: item.filename,
                            saveAs: false,
                            headers: { Referer: item.pageUrl },
                            onload: () => resolve(),
                            onerror: (e) => reject(e),
                            ontimeout: () => reject(new Error('timeout')),
                        });
                    } catch (e) { reject(e); }
                });
                notify(`Pobrano: ${item.filename}`, 'success');
            } catch (e) {
                log('GM_download błąd', item, e);
                notify(`Błąd: ${item.title} — ${e && e.error || e}`, 'error');
                // fallback: otwórz w karcie po błędzie (wymaga gestu — tu może zostać zablokowane)
                // nie przerywamy kolejki
            }
            done++;
            // odstęp między pobraniami, żeby nie zabić przeglądarki/serwera
            await new Promise(r => setTimeout(r, 1200));
        }
        bulkRunning = false;
        if (btn) btn.textContent = orig || 'Pobierz wszystkie';
        if (done === withUrl.length) notify(`Zakończono kolejkę: ${done}/${withUrl.length}`, 'success');
    }

    function copyAllUrls() {
        const q = loadQueue();
        if (!q.length) { notify('Kolejka pusta', 'warning'); return; }
        const text = q.map(x => x.directUrl || x.pageUrl).join('\n');
        copyText(text);
        notify(`Skopiowano ${q.length} URL-i`, 'success');
    }

    function exportQueue() {
        const q = loadQueue();
        if (!q.length) { notify('Kolejka pusta', 'warning'); return; }
        // JSON — do re-importu w kolektorze (zachowuje title/filename)
        const json = JSON.stringify(q, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `kolejka-filmow-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
        // dodatkowo TXT z URL-ami (dla JDownloadera — wklej do LinkGrabber)
        const txt = q.map(x => x.directUrl || x.pageUrl).join('\n');
        copyText(txt);
        notify('Wyeksportowano JSON (pobranie) + TXT w schowku — wklej TXT do JDownloadera', 'success');
    }

    // Eksport dla JDownloadera z zachowaniem nazw plików (tytułów)
    // JDownloader rozumie pliki *.crawljob — każdy to JSON z text+packageName+filename
    // Alternatywnie można po prostu wkleić TXT do LinkGrabber, ale wtedy nazwa = z URL (Packagizer może zmienić)
    function exportJDownloader() {
        const q = loadQueue();
        if (!q.length) { notify('Kolejka pusta', 'warning'); return; }
        const withUrl = q.filter(x => x.directUrl);
        if (!withUrl.length) { notify('Brak directUrl — dodaj filmy z eporner/tnaflix/pimpbunny (mają bezpośrednie linki)', 'warning'); return; }

        // 1) plik crawljob — JDownloader: przeciągnij *.crawljob do LinkGrabber lub wrzuć do folderu cfg/crawljobs
        // Format: https://support.jdownloader.org/Knowledgebase/Article/View/crawljob
        // Każda pozycja to osobny crawljob; generujemy ZIP-like: jeden plik JSON z wieloma entries (JDownloader łyka Array)
        const jobs = withUrl.map(item => ({
            text: item.directUrl,
            packageName: sanitizeFilename(item.title).slice(0, 80) || 'video',
            // JDownloader Packagizer może ustawić nazwę pliku po pobraniu; filename hint:
            filename: item.filename,
            comment: `${item.site} | ${item.label} | ${item.pageUrl}`,
            enabled: true, autoStart: false, autoConfirm: false,
            overwritePackagizerEnabled: true,
            // nagłówek Referer — niektóre CDN wymagają
            referer: item.pageUrl,
        }));
        // pojedynczy plik .crawljob z tablicą — JDownloader 2 potrafi; fallback: jeden job per plik w ZIP
        const json = JSON.stringify(jobs.length === 1 ? jobs[0] : jobs, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `kolejka-jdownloader-${new Date().toISOString().slice(0, 10)}.crawljob`;
        document.body.appendChild(a); a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);

        // 2) dodatkowo TXT w schowku (dla szybkiego Ctrl+V w LinkGrabber)
        const txt = withUrl.map(x => x.directUrl).join('\n');
        copyText(txt);
        notify(`Wyeksportowano ${jobs.length} pozycji jako .crawljob (przeciągnij do JDownloadera) + TXT w schowku`, 'success', 5000);
    }

    function importQueue(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const text = String(reader.result || '');
                let imported = [];
                if (file.name.endsWith('.json')) {
                    imported = JSON.parse(text);
                    if (!Array.isArray(imported)) throw new Error('JSON musi być listą');
                } else {
                    // TXT — jedna URL na linię
                    imported = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map((url, i) => ({
                        id: makeId(), pageUrl: url, title: `import-${i + 1}`, site: (() => { try { return new URL(url).hostname; } catch { return 'import'; } })(),
                        quality: 'import', label: 'import', directUrl: url, filename: `video-import-${i + 1}.mp4`, addedAt: Date.now(), ext: 'mp4', type: 'import'
                    }));
                }
                const q = loadQueue();
                let added = 0;
                for (const it of imported) {
                    if (!it.pageUrl && !it.directUrl) continue;
                    if (q.some(x => x.pageUrl === it.pageUrl && x.directUrl === it.directUrl)) continue;
                    if (!it.id) it.id = makeId();
                    q.push(it); added++;
                }
                saveQueue(q);
                renderFloating();
                notify(`Zaimportowano ${added} pozycji (pominięto duplikaty)`, 'success');
            } catch (err) {
                notify('Błąd importu: ' + err.message, 'error');
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    }

    // ---------------------------------------------------------------- style + menu
    GM_addStyle(`
        #vqc-add-panel { animation: vqcFade .25s ease; }
        @keyframes vqcFade { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
        .vqc-add-btn {
            background:#16213e;color:#eee;border:1px solid #0f3460;border-radius:4px;
            padding:5px 10px;cursor:pointer;font-size:12px;transition:background .15s;white-space:nowrap;
            font-family:Arial,sans-serif;
        }
        .vqc-add-btn:hover { background:#0f3460;border-color:#e94560; }
        .vqc-add-btn:active { background:#e94560; }
        .vqc-add-btn--best { background:#e94560;border-color:#e94560;color:#fff;font-weight:700; }
        .vqc-add-btn--best:hover { background:#ff5a76;border-color:#ff5a76; }
        #vqc-widget {
            position:fixed;right:18px;bottom:18px;z-index:999998;
            width:380px;max-width:92vw;max-height:72vh;
            background:#1a1a2e;border:1px solid #e94560;border-radius:10px;
            box-shadow:0 10px 40px rgba(0,0,0,.5);
            font-family:Arial,sans-serif;color:#eee;
            display:flex;flex-direction:column;overflow:hidden;
        }
        .vqc-widget-head {
            display:flex;align-items:center;justify-content:space-between;
            padding:8px 10px;background:#16213e;border-bottom:1px solid #0f3460;
            cursor:move;user-select:none;
        }
        .vqc-widget-title { font-weight:700;font-size:13px;color:#e94560; }
        .vqc-widget-head-btns { display:flex;gap:6px; }
        .vqc-widget-head-btns button {
            width:22px;height:22px;border:1px solid #0f3460;background:#0f3460;color:#eee;
            border-radius:4px;cursor:pointer;font-size:13px;line-height:1;
        }
        .vqc-widget-head-btns button:hover { background:#e94560;border-color:#e94560; }
        .vqc-widget-body { padding:10px;overflow:auto; }
        .vqc-list { display:flex;flex-direction:column;gap:6px;max-height:38vh;overflow:auto;margin-bottom:8px; }
        .vqc-empty { font-size:12px;color:#888;padding:10px;text-align:center;border:1px dashed #333;border-radius:6px; }
        .vqc-item {
            display:flex;align-items:center;justify-content:space-between;gap:8px;
            background:#16213e;border:1px solid #0f3460;border-radius:6px;padding:6px 8px;
        }
        .vqc-item-main { min-width:0;flex:1; }
        .vqc-item-title { font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .vqc-item-meta { font-size:10px;color:#888; }
        .vqc-item-filename { font-size:11px;color:#4caf50;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;border:1px dashed #2e5a2e;border-radius:4px;padding:1px 4px;margin-top:2px;background:#1e2e1e; }
        .vqc-item-filename:hover { background:#2a4a2a;border-color:#4caf50; }
        .vqc-item-url { font-size:10px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .vqc-item-actions { display:flex;gap:4px;flex-shrink:0; }
        .vqc-mini {
            padding:3px 6px;border:1px solid #0f3460;background:#0f3460;color:#eee;border-radius:4px;
            cursor:pointer;font-size:10px;
        }
        .vqc-mini:hover { background:#1e3a5f; }
        .vqc-mini--danger { background:#3a1a1a;border-color:#5a2222; }
        .vqc-mini--danger:hover { background:#e94560;border-color:#e94560; }
        .vqc-actions { display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px; }
        .vqc-btn {
            padding:6px 10px;border:1px solid #0f3460;background:#16213e;color:#eee;border-radius:4px;
            cursor:pointer;font-size:11px;
        }
        .vqc-btn:hover { background:#0f3460;border-color:#e94560; }
        .vqc-btn--primary { background:#e94560;border-color:#e94560;color:#fff;font-weight:700; }
        .vqc-btn--primary:hover { background:#ff5a76;border-color:#ff5a76; }
        .vqc-btn--danger { background:#3a1a1a;border-color:#5a2222; }
        .vqc-hint { font-size:10px;color:#666;line-height:1.35;border-top:1px solid #222;padding-top:6px; }
    `);

    GM_registerMenuCommand('⬥ Pokaż kolejkę', () => {
        buildFloatingWidget();
        widgetEl.style.display = '';
        renderFloating();
    });
    GM_registerMenuCommand('⬥ Wyczyść kolejkę', () => { if (confirm('Wyczyścić kolejkę?')) clearQueue(); });
    GM_registerMenuCommand('⬥ Kopiuj URL-e z kolejki', copyAllUrls);
    GM_registerMenuCommand('⬥ Eksportuj kolejkę (JSON)', exportQueue);
    GM_registerMenuCommand('⬥ Eksport JDownloader (.crawljob)', exportJDownloader);
    GM_registerMenuCommand('⬥ Pobierz wszystkie (GM_download)', downloadAll);
    GM_registerMenuCommand('⬥ Anuluj pobieranie kolejki', () => { bulkRunning = false; notify('Anulowano kolejkę', 'warning'); });

    // ---------------------------------------------------------------- init
    function init() {
        buildFloatingWidget();
        renderFloating();
        // panele dodawania — z opóźnieniem, bo player ładuje się dynamicznie
        setTimeout(injectAddPanel, 700);
        setTimeout(injectAddPanel, 2500);
        setTimeout(injectAddPanel, 6000);
        // dla SPA / nawigacji bez reloadu
        let lastHref = location.href;
        setInterval(() => {
            if (location.href !== lastHref) {
                lastHref = location.href;
                setTimeout(injectAddPanel, 1200);
            }
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
    else setTimeout(init, 400);
})();
