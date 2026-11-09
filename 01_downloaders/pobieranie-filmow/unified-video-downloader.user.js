// ==UserScript==
// @name         Unified Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.7
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/unified-video-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/unified-video-downloader.user.js
// @description  Zunifikowany downloader wideo: eporner + KVS (webpussi/camgirlfap/porn4fans/pimpbunny/sheeshfans) + tnaflix + dirtyship + mat6tube + freemiumgirls + thotchicks (AES+HLS) + pornx (packer+HLS) + yesporn (iframe player-x) + livecamrips (MixDrop) + fallback generyczny + mini-kolejka
// @author       opencode
// @match        *://*.eporner.com/hd-porn/*
// @match        *://*.eporner.com/video-*
// @match        *://*.eporner.com/embed/*
// @match        *://*.eporner.com/film-porno/*
// @match        *://*.eporner.com/video-porno/*
// @match        *://*.eporner.com/porno-video/*
// @match        https://www.tnaflix.com/*/video*
// @match        https://www.tnaflix.com/video*
// @match        https://player.tnaflix.com/video*
// @match        *://pimpbunny.com/*/videos/*
// @match        *://*.pimpbunny.com/*/videos/*
// @match        *://pimpbunny.com/videos/*
// @match        *://*.pimpbunny.com/videos/*
// @match        *://*.thotchicks.com/*
// @match        *://mat6tube.com/watch/*
// @match        *://*.mat6tube.com/watch/*
// @match        *://pornx.to/*
// @match        *://*.pornx.to/*
// @match        https://www.webpussi.com/videos/*
// @match        https://webpussi.com/videos/*
// @match        https://www.webpussi.com/embed/*
// @match        https://webpussi.com/embed/*
// @match        *://camgirlfap.com/video/*
// @match        *://*.camgirlfap.com/video/*
// @match        *://camgirlfap.com/embed/*
// @match        *://*.camgirlfap.com/embed/*
// @match        https://dirtyship.com/*
// @match        *://freemiumgirls.com/video/*
// @match        *://freemiumgirls.com/video-player/*
// @match        *://porn4fans.com/video/*
// @match        *://*.porn4fans.com/video/*
// @match        *://sheeshfans.com/video/*
// @match        *://*.sheeshfans.com/video/*
// @match        *://sheeshfans.com/embed/*
// @match        *://*.sheeshfans.com/embed/*
// @match        *://*.camwhores.tv/*
// @match        *://*.camwhores.com/*
// @match        *://*.xvideos.com/*
// @match        *://*.xnxx.com/*
// @match        *://*.xhamster.com/*
// @match        *://*.redtube.com/*
// @match        *://*.youporn.com/*
// @match        *://*.spankbang.com/*
// @match        *://*.tube8.com/*
// @match        *://*.porntrex.com/*
// @match        *://*.hclips.com/*
// @match        *://*.txxx.com/*
// @match        *://*.drtuber.com/*
// @match        *://*.nuvid.com/*
// @match        *://*.yespornpleasexxx.com/*
// @match        *://livecamrips.to/*
// @match        *://*.livecamrips.to/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=eporner.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      eporner.com
// @connect      *.eporner.com
// @connect      *.cdn.eporner.com
// @connect      vid-s*.eporner.com
// @connect      dash-s*.eporner.com
// @connect      thotplay.com
// @connect      cdn.thotplay.com
// @connect      thotchicks.com
// @connect      *.thotchicks.com
// @connect      luluvdo.com
// @connect      lulustream.com
// @connect      lulucdn.com
// @connect      cdn-tnmr.org
// @connect      mat6tube.com
// @connect      cdn.pvvstream.pro
// @connect      cdn2.pvvstream.pro
// @connect      tr.pvvstream.pro
// @connect      img.pvvstream.pro
// @connect      nmcorp.video
// @connect      dirtyship.com
// @connect      dirtyship.net
// @connect      cdn10.dirtyship.net
// @connect      camgirlfap.com
// @connect      porn4fans.com
// @connect      sheeshfans.com
// @connect      *.sheeshfans.com
// @connect      www.porn4fans.com
// @connect      cdn.porn4fans.com
// @connect      webpussi.com
// @connect      www.webpussi.com
// @connect      cdn.webpussi.com
// @connect      cdn3.webpussi.com
// @connect      freemiumgirls.com
// @connect      pornx.to
// @connect      pimpbunny.com
// @connect      yespornpleasexxx.com
// @connect      pornsexnvideos.com
// @connect      *.pornsexnvideos.com
// @connect      livecamrips.to
// @connect      mdzsmutpcvykb.net
// @connect      mxdrop.click
// @connect      *.mxdrop.click
// @connect      mxcontent.net
// @connect      *.mxcontent.net
// @connect      tnaflix.com
// @connect      *
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

/* ============================================================================
 * Unified Video Downloader v1.0
 *
 * Unifikuje 15 dotychczasowych skryptów z katalogu pobieranie-filmow:
 *  - eporner (3 warianty: blob / direct / tab) -> adapter `eporner`
 *  - pimpbunny + webpussi + camgirlfap + porn4fans + sheeshfans (KVS/kt_player, get_file)
 *    -> jeden wspólny adapter `kvs` (wcześniej 4x ten sam regex na flashvars)
 *  - tnaflix (#video-player source) -> adapter `tnaflix`
 *  - dirtyship (FluidPlayer #fp-video-0) -> adapter `dirtyship`
 *  - mat6tube (window.playlist + /download) -> adapter `mat6tube`
 *  - freemiumgirls (POST /api/media-token) -> adapter `freemiumgirls`
 *  - thotchicks (AES-CBC + HLS) i pornx (Dean Edwards packer + HLS)
 *    -> adaptery `thotchicks` / `pornx` na WSPÓLNYM silniku HLS
 *  - adult-video-downloader (generyczny skan ~40 domen) -> adapter `generic`
 *  - video-queue-collector -> wbudowana MINI-KOLEJKA (GM storage, eksport,
 *    pobieranie sekwencyjne; format pozycji zgodny z kolektorem)
 *
 * Architektura: CORE (poniżej) + ADAPTERY (obiekt ADAPTERS) + PANEL (jedno UI)
 * Nowy serwis = dopisz 1 adapter (~20 linii), reszta (pobieranie, HLS, UI,
 * kolejka, SPA-guard) działa bez zmian.
 * ========================================================================== */

(function () {
    'use strict';

    if (window.__uvdDone) return;
    window.__uvdDone = true;

    const _W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const log = (...a) => console.log('[UVD]', ...a);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    /* ============================ CORE: pomocnicze ============================ */

    // Kolejność jakości do deterministycznego sortowania (wspólna dla całości)
    const QUALITY_ORDER = ['2160', '1440', '1080', '720', '480', '360', '240', '144'];
    function qualityRank(label) {
        const m = String(label || '').match(/(\d{3,4})/);
        const i = m ? QUALITY_ORDER.indexOf(m[1]) : -1;
        return i === -1 ? 999 : i;
    }

    // Wyodrębnia jakość (rozdzielczość) ze źródła: najpierw z label, potem z URL.
    // Zwraca np. "1080p" albo null gdy nie da się ustalić.
    function sourceQuality(s) {
        if (!s) return null;
        const label = String(s.label || '');
        let m = label.match(/(\d{3,4})\s*p/i);
        if (m) return m[1] + 'p';
        const url = String(s.url || '');
        m = url.match(/[_\-\/](\d{3,4})p\b/i) || url.match(/(\d{3,4})p\b/i);
        if (m) return m[1] + 'p';
        if (s.kind === 'hls') return 'HLS';
        // Fallback: wymiary aktualnego <video> (gdy URL nie zawiera rozdzielczości)
        try {
            const v = document.querySelector('video');
            if (v && v.videoHeight) return v.videoHeight + 'p';
        } catch (e) { /* ignoruj */ }
        return null;
    }

    // Tekst opcji na pickliście: label + (jeśli brak jakości w label) dopisana jakość.
    function picklistOptionText(s) {
        const q = sourceQuality(s);
        const hlsTag = (s && s.kind === 'hls') ? ' (HLS)' : '';
        const label = (s && s.label) || '';
        if (q && !label.includes(q.replace('p', ''))) {
            return label + ' · ' + q + hlsTag;
        }
        return label + hlsTag;
    }

    // Czyści tytuł do nazwy pliku (Windows-safe, max 120 znaków)
    function sanitize(name) {
        return String(name || 'video')
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120) || 'video';
    }

    function notify(msg, type, ms) {
        const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336', warning: '#ff9800' };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;transition:opacity .4s;font-family:Arial,sans-serif;pointer-events:none;';
        el.innerHTML = '<div style="background:' + (colors[type] || colors.info) + ';color:#fff;padding:10px 18px;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.4);font-size:13px;max-width:420px;">' + msg + '</div>';
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ms || 3500);
    }

    function copyText(text, okMsg) {
        const done = () => notify(okMsg || 'Skopiowano URL', 'success');
        try {
            if (typeof GM_setClipboard === 'function') { GM_setClipboard(text); done(); return; }
        } catch (e) { /* spadek niżej */ }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else fallbackCopy(text, done);
    }
    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { notify('Nie udało się skopiować', 'error'); }
        ta.remove();
    }

    // Tytuł: h1 -> JSON-LD name -> og:title -> <title> (wspólne dla adapterów)
    function titleFromSelectors(h1Sel, suffixRe) {
        const h1 = h1Sel ? document.querySelector(h1Sel) : document.querySelector('h1');
        if (h1 && h1.textContent.trim()) return sanitize(h1.textContent.trim());
        const ld = document.querySelector('script[type="application/ld+json"]');
        if (ld) {
            try {
                const d = JSON.parse(ld.textContent);
                const arr = Array.isArray(d) ? d : [d];
                for (const o of arr) if (o && o.name) return sanitize(String(o.name));
            } catch (e) { /* ignoruj */ }
        }
        const og = document.querySelector('meta[property="og:title"]');
        if (og && og.content) return sanitize(og.content.replace(suffixRe || /\s*[-|].*$/, '').trim());
        return sanitize(document.title.replace(suffixRe || /\s*[-|].*$/, '').trim());
    }

    /* ==================== CORE: pobieranie przez GM_xmlhttpRequest ==================== */

    function gmFetchText(url, referer, timeout) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url, timeout: timeout || 60000,
                headers: { Referer: referer || location.href },
                onload: (r) => {
                    if (r.status >= 200 && r.status < 300) {
                        resolve(r.responseText !== undefined ? r.responseText : r.response);
                    } else reject(new Error('HTTP ' + r.status));
                },
                onerror: () => reject(new Error('Błąd sieci')),
                ontimeout: () => reject(new Error('Timeout')),
            });
        });
    }

    async function gmFetchTextRetry(url, referer, retries) {
        retries = retries === undefined ? 2 : retries;
        for (let i = 0; ; i++) {
            try { return await gmFetchText(url, referer); }
            catch (e) { if (i >= retries) throw e; await sleep(400 * (i + 1)); }
        }
    }

    // Stan aktywnego pobierania MP4 (do przycisku ANULUJ); HLS ma własną flagę
    const dlState = { busy: false, request: null, blobUrl: null };

    // Schemat spadkowy MP4: GM_download direct -> blob z postępem -> <a> -> nowa karta.
    // blobFirst (KVS): tokeny jednorazowe + wymagany Referer — GM_download bez
    // nagłówków dostaje stronę HTML zamiast filmu, więc od razu blob z Referer.
    function downloadMp4(source, filename, ui, blobFirst, fallbackUrl) {
        if (dlState.busy) { notify('Pobieranie już trwa — anuluj je najpierw', 'warning'); return; }
        dlState.busy = true;
        if (blobFirst) { downloadMp4Blob(source, filename, ui, fallbackUrl); return; }
        setUiStatus(ui, 'Zapis przez menedżer pobierania…', false);
        try {
            GM_download({
                url: source.url, name: filename, saveAs: true,
                onload: () => { dlState.busy = false; setUiStatus(ui, 'Gotowe — plik w menedżerze pobierania', false); notify('Pobieranie rozpoczęte: ' + filename, 'success'); },
                onerror: () => downloadMp4Blob(source, filename, ui, fallbackUrl),
                ontimeout: () => downloadMp4Blob(source, filename, ui, fallbackUrl),
            });
            // GM_download nie woła onload przy dużych plikach od razu — odblokuj UI po chwili
            setTimeout(() => { if (dlState.busy) { dlState.busy = false; setUiStatus(ui, 'Plik przekazany do menedżera pobierania', false); } }, 4000);
        } catch (e) {
            downloadMp4Blob(source, filename, ui, fallbackUrl);
        }
    }

    function downloadMp4Blob(source, filename, ui, fallbackUrl, _retried) {
        setUiStatus(ui, 'Pobieranie… 0%', true);
        showUiCancel(ui, true);
        dlState.request = GM_xmlhttpRequest({
            method: 'GET', url: source.url, responseType: 'blob', timeout: 600000,
            headers: { Referer: source.referer || location.href },
            onprogress: (e) => {
                if (e.total > 0) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    setUiProgress(ui, pct);
                    setUiStatus(ui, 'Pobieranie… ' + pct + '%', true);
                } else {
                    setUiStatus(ui, 'Pobrano ' + (e.loaded / 1048576).toFixed(1) + ' MB', true);
                }
            },
            onload: (res) => {
                showUiCancel(ui, false);
                dlState.request = null;
                if (res.status >= 400) {
                    // Martwy token? Zanim pokażesz błąd, spróbuj URL z playera
                    if (fallbackUrl && !_retried) {
                        notify('Błąd HTTP ' + res.status + ' — próbuję URL odtwarzany przez player…', 'warning');
                        downloadMp4Blob({ kind: source.kind, label: source.label, url: fallbackUrl, ext: source.ext }, filename, ui, null, true);
                        return;
                    }
                    dlState.busy = false;
                    setUiStatus(ui, 'Błąd HTTP ' + res.status + ' — token mógł wygasnąć, odśwież stronę', false);
                    return;
                }
                const blob = res.response;
                if (!blob || blob.size === 0) {
                    dlState.busy = false;
                    setUiStatus(ui, 'Pusta odpowiedź — odśwież stronę', false);
                    return;
                }
                // Serwer zwrócił stronę HTML zamiast filmu (martwy token) — nie zapisuj śmieci
                if (String((blob && blob.type) || '').includes('html')) {
                    if (fallbackUrl && !_retried) {
                        notify('Serwer zwrócił stronę zamiast filmu — próbuję URL z playera…', 'warning');
                        downloadMp4Blob({ kind: source.kind, label: source.label, url: fallbackUrl, ext: source.ext }, filename, ui, null, true);
                        return;
                    }
                    dlState.busy = false;
                    setUiStatus(ui, 'Serwer zwrócił stronę zamiast filmu — odśwież stronę i spróbuj ponownie', false);
                    return;
                }
                setUiProgress(ui, 100);
                dlState.blobUrl = URL.createObjectURL(blob);
                const blobUrl = dlState.blobUrl;
                try {
                    GM_download({
                        url: blobUrl, name: filename,
                        onload: () => { dlState.busy = false; setUiStatus(ui, 'Zapisano: ' + filename, false); setTimeout(() => URL.revokeObjectURL(blobUrl), 5000); },
                        onerror: () => { saveViaAnchor(blobUrl, filename); dlState.busy = false; setUiStatus(ui, 'Zapisano: ' + filename, false); },
                    });
                } catch (e) {
                    saveViaAnchor(blobUrl, filename);
                    dlState.busy = false;
                    setUiStatus(ui, 'Zapisano: ' + filename, false);
                }
            },
            onerror: () => { dlState.request = null; dlState.busy = false; showUiCancel(ui, false); setUiStatus(ui, 'Błąd sieci — spróbuj „Karta"', false); },
            ontimeout: () => { dlState.request = null; dlState.busy = false; showUiCancel(ui, false); setUiStatus(ui, 'Przekroczono czas pobierania', false); },
        });
    }

    function cancelMp4(ui) {
        if (dlState.request) { try { dlState.request.abort(); } catch (e) {} dlState.request = null; }
        if (dlState.blobUrl) { try { URL.revokeObjectURL(dlState.blobUrl); } catch (e) {} dlState.blobUrl = null; }
        dlState.busy = false;
        showUiCancel(ui, false);
        setUiStatus(ui, 'Anulowano', false);
    }

    function saveViaAnchor(blobUrl, name) {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(blobUrl); }, 5000);
    }

    // Otwórz w nowej karcie: najpierw about:blank w geście kliku, potem nawigacja
    function openInTab(url) {
        const win = window.open('about:blank', '_blank');
        if (!win) { notify('Nowa karta zablokowana — zezwól na wyskakujące okna', 'warning'); return; }
        try { win.location.href = url; } catch (e) { window.open(url, '_blank'); }
    }

    /* ============================ CORE: silnik HLS ============================ */
    // Wspólny dla thotchicks + pornx + generycznych m3u8 (wcześniej 2x ten sam kod)

    const HLS = { CONCURRENCY: 5, RETRIES: 2, TIMEOUT: 60000, cancelRequested: false, activeReqs: [] };

    function hlsResolve(base, ref) {
        try { return new URL(ref, base).href; } catch (e) { return ref; }
    }
    function isHlsUrl(u) { return /\.m3u8(\?|$|#)/i.test(u || ''); }

    function parseHlsVariants(text, baseUrl) {
        const variants = [];
        const lines = text.split(/\r?\n/);
        let cur = null;
        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            if (t.startsWith('#EXT-X-STREAM-INF')) {
                const bw = t.match(/BANDWIDTH=(\d+)/);
                const res = t.match(/RESOLUTION=(\d+)x(\d+)/);
                cur = { bandwidth: bw ? parseInt(bw[1], 10) : 0, height: res ? parseInt(res[2], 10) : 0, url: null };
            } else if (!t.startsWith('#') && cur) {
                cur.url = hlsResolve(baseUrl, t);
                variants.push(cur);
                cur = null;
            }
        }
        variants.sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));
        return variants;
    }

    function parseHlsSegments(text, baseUrl) {
        const segs = [];
        for (const line of text.split(/\r?\n/)) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            segs.push(hlsResolve(baseUrl, t));
        }
        return segs;
    }

    function hlsVariantLabel(v) {
        if (v.height) return v.height + 'p';
        if (v.bandwidth) return Math.round(v.bandwidth / 1000) + ' kbps';
        return 'Auto';
    }

    function gmFetchBlobTrack(url, referer) {
        return new Promise((ok, fail) => {
            const req = GM_xmlhttpRequest({
                method: 'GET', url, responseType: 'blob', timeout: HLS.TIMEOUT,
                headers: { Referer: referer || location.href },
                onload: (r) => {
                    HLS.activeReqs = HLS.activeReqs.filter((x) => x !== req);
                    if (r.status >= 200 && r.status < 300) ok(r.response);
                    else fail(new Error('HTTP ' + r.status));
                },
                onerror: () => { HLS.activeReqs = HLS.activeReqs.filter((x) => x !== req); fail(new Error('Błąd sieci')); },
                ontimeout: () => { HLS.activeReqs = HLS.activeReqs.filter((x) => x !== req); fail(new Error('Timeout')); },
            });
            HLS.activeReqs.push(req);
        });
    }

    async function gmFetchBlobRetry(url, referer) {
        for (let i = 0; ; i++) {
            try { return await gmFetchBlobTrack(url, referer); }
            catch (e) { if (i >= HLS.RETRIES) throw e; await sleep(400 * (i + 1)); }
        }
    }

    // Pobiera segmenty pulą workerów; getPlaylist() ma zwrócić ŚWIEŻĄ playlistę
    // wariantu (token m3u8 ważny ~2 min). Zwraca Blob .ts albo rzuca Error.
    async function downloadHls(source, filename, ui, onProgress) {
        HLS.cancelRequested = false;
        HLS.activeReqs = [];
        const playlist = await source.getPlaylist();
        const segments = parseHlsSegments(playlist.text, playlist.url);
        if (!segments.length) throw new Error('Playlista nie zawiera segmentów');
        if (playlist.text.includes('#EXT-X-KEY') || playlist.text.includes('#EXT-X-MAP')) {
            throw new Error('ENCRYPTED: ten strumień wymaga ffmpeg (szyfrowany/fMP4) — użyj „Kopiuj URL" i ffmpeg');
        }
        const parts = new Array(segments.length);
        let next = 0, done = 0, bytes = 0, finished = false;
        const referer = source.referer || location.href;
        await new Promise((resolve, reject) => {
            function worker() {
                if (finished || HLS.cancelRequested) return;
                if (next >= segments.length) {
                    if (done === segments.length && !finished) { finished = true; resolve(); }
                    return;
                }
                const i = next++;
                gmFetchBlobRetry(segments[i], referer).then((blob) => {
                    if (HLS.cancelRequested || finished) return;
                    parts[i] = blob;
                    done++;
                    bytes += blob.size;
                    if (onProgress) onProgress(done, segments.length, bytes);
                    worker();
                }).catch((e) => { if (!finished) { finished = true; reject(e); } });
            }
            for (let w = 0; w < Math.min(HLS.CONCURRENCY, segments.length); w++) worker();
        });
        if (HLS.cancelRequested) throw new Error('cancelled');
        return new Blob(parts, { type: 'video/mp2t' });
    }

    function cancelHls() {
        HLS.cancelRequested = true;
        HLS.activeReqs.forEach((r) => { try { r.abort(); } catch (e) {} });
        HLS.activeReqs = [];
    }

    /* ===================== CORE: krypto (thotchicks) i packer (pornx) ===================== */
    // Web Crypto API nie ma MD5 — własna implementacja (jak w thotchicks v2.0)

    function md5(bytes) {
        const u8 = new Uint8Array(bytes);
        const total = Math.ceil((u8.length + 9) / 64) * 64;
        const c = new Uint8Array(total);
        c.set(u8);
        c[u8.length] = 0x80;
        const v = new DataView(c.buffer);
        v.setUint32(total - 8, u8.length << 3, true);
        v.setUint32(total - 4, Math.floor(u8.length / 0x20000000), true);
        const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
        const k = [];
        for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
        const s = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
        const f = [
            (b, cc, d) => ((b & cc) | (~b & d)) >>> 0,
            (b, cc, d) => ((d & b) | (~d & cc)) >>> 0,
            (b, cc, d) => (b ^ cc ^ d) >>> 0,
            (b, cc, d) => (cc ^ (b | ~d)) >>> 0,
        ];
        const g = [(i) => i, (i) => (5 * i + 1) % 16, (i) => (3 * i + 5) % 16, (i) => (7 * i) % 16];
        const rotl = (vv, n) => ((vv << n) | (vv >>> (32 - n))) >>> 0;
        for (let o = 0; o < total; o += 64) {
            const w = new Uint32Array(c.buffer, o, 16);
            let a = h[0], b = h[1], cc = h[2], d = h[3];
            for (let r = 0; r < 4; r++) {
                for (let i = r * 16, e = i + 16; i < e; i++) {
                    const t = (a + f[r](b, cc, d) + k[i] + w[g[r](i)]) >>> 0;
                    const na = (b + rotl(t, s[r][i % 4])) >>> 0;
                    const tmpD = d; d = cc; cc = b; b = na; a = tmpD;
                }
            }
            h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + cc) >>> 0; h[3] = (h[3] + d) >>> 0;
        }
        const r = new Uint8Array(16);
        const dv = new DataView(r.buffer);
        for (let i = 0; i < 4; i++) dv.setUint32(i * 4, h[i], true);
        return r;
    }

    function u8concat(...arrays) {
        let len = 0;
        for (const a of arrays) len += a.length;
        const r = new Uint8Array(len);
        let off = 0;
        for (const a of arrays) { r.set(a, off); off += a.length; }
        return r;
    }

    // Deszyfracja AES-256-CBC w formacie CryptoJS/OpenSSL „Salted__" (thotchicks)
    function decryptAesCryptoJS(encrypted, key) {
        const buf = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
        const salt = buf.slice(8, 16);
        const ct = buf.slice(16);
        const keyBytes = new TextEncoder().encode(key);
        const m1 = md5(u8concat(keyBytes, salt));
        const m2 = md5(u8concat(m1, keyBytes, salt));
        const m3 = md5(u8concat(m2, keyBytes, salt));
        const dk = u8concat(m1, m2);
        const iv = m3.slice(0, 16);
        return crypto.subtle.importKey('raw', dk, { name: 'AES-CBC' }, false, ['decrypt'])
            .then((keyObj) => crypto.subtle.decrypt({ name: 'AES-CBC', iv }, keyObj, ct))
            .then((pt) => new TextDecoder().decode(pt));
    }

    // Rozpakowanie packera Dean Edwards bez eval (pornx; port z pornhoarder-dl)
    function deobfuscatePacked(html) {
        if (!html || html.indexOf('eval(function') === -1) return html;
        const parseStr = (s, st) => {
            const q = s[st];
            if (q !== "'" && q !== '"') return null;
            let v = '';
            let j = st + 1;
            while (j < s.length) {
                const ch = s[j];
                if (ch === '\\') { v += (j + 1 < s.length ? s[j + 1] : ''); j += 2; continue; }
                if (ch === q) return [v, j + 1];
                v += ch; j++;
            }
            return null;
        };
        let text = html;
        for (let round = 0; round < 3; round++) {
            const head = text.indexOf('eval(function');
            if (head === -1) break;
            const brace = text.indexOf('{', head);
            if (brace === -1) break;
            let depth = 0, bodyEnd = -1;
            for (let j = brace; j < text.length; j++) {
                if (text[j] === '{') depth++;
                else if (text[j] === '}') { depth--; if (depth === 0) { bodyEnd = j; break; } }
            }
            if (bodyEnd === -1) break;
            let pIdx = bodyEnd + 1;
            while (pIdx < text.length && ' \t\r\n'.indexOf(text[pIdx]) !== -1) pIdx++;
            if (text[pIdx] !== '(') break;
            const pl = parseStr(text, pIdx + 1);
            if (!pl) break;
            const payload = pl[0];
            let pos = pl[1];
            const numM = /^\s*,\s*(\d+)\s*,\s*(\d+)\s*,/.exec(text.slice(pos));
            if (!numM) break;
            const a = parseInt(numM[1], 10);
            const c = parseInt(numM[2], 10);
            pos += numM[0].length;
            const kl = parseStr(text, pos);
            if (!kl) break;
            const keys = kl[0].split('|');
            let depth2 = 1, end = -1;
            for (let j = kl[1]; j < text.length; j++) {
                const ch = text[j];
                if (ch === '(') depth2++;
                else if (ch === ')') {
                    depth2--;
                    if (depth2 === 0) {
                        let t = j + 1;
                        while (t < text.length && ' \t\r\n'.indexOf(text[t]) !== -1) t++;
                        end = (text[t] === ')') ? t + 1 : t;
                        break;
                    }
                }
            }
            if (end === -1) break;
            const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const toBase = (n) => {
                if (n === 0) return '0';
                let str = '';
                while (n > 0) { str = DIGITS[n % a] + str; n = Math.floor(n / a); }
                return str;
            };
            let out = payload;
            for (let n = c - 1; n >= 0; n--) {
                const w = keys[n];
                if (!w) continue;
                const sym = toBase(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                out = out.replace(new RegExp('\\b' + sym + '\\b', 'g'), () => w);
            }
            out = out.replace(/\\x([0-9a-fA-F]{2})/g, (mm, hh) => String.fromCharCode(parseInt(hh, 16)));
            text = text.slice(0, head) + out + text.slice(end);
        }
        return text;
    }

    // Odescape'owanie stringów JS z flashvars (obsługuje '...' i "...")
    function unescapeJs(s) {
        return String(s)
            .replace(/\\(['"\\/])/g, '$1')
            .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }

    /* ================== CORE: mechanizm eporner (/xhr/video + hash) ================== */
    // Hash XHR różni się od hash playera: 32 hex -> 4 bloki base36

    function epornerComputeXhrHash(hash) {
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

    function epornerGetVid() {
        const p = _W.EP && _W.EP.video && _W.EP.video.player;
        if (p && p.vid) return String(p.vid).trim();
        const epv = document.querySelector('#EPvideo[data-vid]');
        if (epv) { const dv = epv.getAttribute('data-vid'); if (dv) return dv.split('/')[0].trim(); }
        const dv2 = document.querySelector('[data-vid]');
        if (dv2) { const dv = dv2.getAttribute('data-vid'); if (dv) return dv.split('/')[0].trim(); }
        const m = location.pathname.match(/\/(?:hd-porn|embed|video-porno|porno-video|film-porno)\/([^/]+)/);
        if (m) return m[1].trim();
        const m2 = location.pathname.match(/\/video-([A-Za-z0-9]+)/);
        if (m2) return m2[1].trim();
        return null;
    }

    function epornerGetPlayerHash() {
        const p = _W.EP && _W.EP.video && _W.EP.video.player;
        if (p && p.hash) return String(p.hash).trim();
        for (const s of document.querySelectorAll('script')) {
            const txt = s.textContent || '';
            const m = txt.match(/EP\.video\.player\.hash\s*=\s*['"]([a-f0-9]{32})['"]/i);
            if (m) return m[1];
        }
        return null;
    }

    function epornerWaitForPlayer(maxWait) {
        maxWait = maxWait || 20000;
        return new Promise((resolve) => {
            const start = Date.now();
            (function check() {
                if (epornerGetVid() && epornerGetPlayerHash()) return resolve(true);
                if (Date.now() - start >= maxWait) return resolve(false);
                setTimeout(check, 500);
            })();
        });
    }

    function epornerFetchSources() {
        return new Promise((resolve) => {
            const vid = epornerGetVid();
            const playerHash = epornerGetPlayerHash();
            const xhrHash = epornerComputeXhrHash(playerHash);
            if (!vid || !xhrHash) { resolve([]); return; }
            const params = new URLSearchParams({
                hash: xhrHash, domain: location.hostname,
                pixelRatio: String(window.devicePixelRatio || 1),
                playerWidth: '0', playerHeight: '0', fallback: 'false', embed: 'false',
                supportedFormats: 'hls,dash,h265,vp9,av1,mp4', _: String(Date.now()),
            });
            const url = location.origin + '/xhr/video/' + encodeURIComponent(vid) + '?' + params;
            GM_xmlhttpRequest({
                method: 'GET', url, headers: { Referer: location.href },
                onload: (resp) => {
                    try {
                        const data = JSON.parse(resp.responseText);
                        const out = [];
                        if (data.sources && data.sources.mp4) {
                            for (const [ql, info] of Object.entries(data.sources.mp4)) {
                                out.push({
                                    kind: 'mp4', quality: (info.labelShort || ql).replace('p', '').trim(),
                                    label: ql, url: info.src, ext: 'mp4',
                                });
                            }
                        }
                        out.sort((a, b) => qualityRank(a.label) - qualityRank(b.label));
                        resolve(out);
                    } catch (e) { resolve([]); }
                },
                onerror: () => resolve([]), ontimeout: () => resolve([]),
            });
        });
    }

    /* ================== CORE: parser KVS/kt_player (get_file) ================== */
    // Jeden parser zamiast 4 kopii (webpussi/camgirlfap/porn4fans/pimpbunny).
    // Flashvars ma LOSOWĄ nazwę zmiennej — parsujemy po kluczach video_url*.

    function kvsQualityFromUrl(url) {
        const q = String(url).match(/_(\d{3,4}p)\.\w{3,4}/);
        return q ? q[1] : 'oryginał';
    }

    // Czyta źródła z żywego obiektu JS (var flashvars = {...} lub global o losowej
    // nazwie z kluczami video_url*) — ten sam format co parsowanie HTML, bez regexów.
    function kvsFromObject(obj) {
        const out = [];
        if (!obj || typeof obj !== 'object') return out;
        const seen = new Set();
        Object.keys(obj)
            .filter((k) => /^(video_(alt_)?url\d*)$/.test(k))
            .sort((a, b) => {
                if (a === 'video_url') return -1;
                if (b === 'video_url') return 1;
                return a.localeCompare(b);
            })
            .forEach((key) => {
                let url = obj[key];
                if (typeof url !== 'string') return;
                url = url.trim();
                if (!url || url.indexOf('http') !== 0 || seen.has(url)) return;
                if (url.indexOf('get_file') === -1 && url.indexOf('.mp4') === -1) return;
                if (/_preview/i.test(url) || url.startsWith('/video/')) return;
                seen.add(url);
                const tk = key + '_text';
                const label = (typeof obj[tk] === 'string' && obj[tk].trim()) || kvsQualityFromUrl(url);
                out.push({ kind: 'mp4', key, url, label, ext: 'mp4' });
            });
        return out;
    }

    // Znajdź obiekt flashvars w unsafeWindow (standardowa nazwa lub losowa ze KVS)
    function kvsFindFlashvarsObject() {
        try {
            if (_W.flashvars && typeof _W.flashvars === 'object' && typeof _W.flashvars.video_url === 'string') {
                return _W.flashvars;
            }
            for (const k of Object.keys(_W)) {
                try {
                    const o = _W[k];
                    if (o && typeof o === 'object' && typeof o.video_url === 'string' && o.video_url.indexOf('http') === 0) {
                        return o;
                    }
                } catch (e) { /* globalki cross-origin */ }
            }
        } catch (e) { /* ignoruj */ }
        return null;
    }

    function kvsExtractSources() {
        const flash = []; // URL-e z flashvars (mogą mieć jednorazowy token v-acctoken)
        const live = [];  // URL-e faktycznie grane przez player (po redirectach CDN)
        const seen = new Set();
        const pushTo = (arr) => (key, url, label) => {
            if (!url || url.indexOf('http') !== 0 || seen.has(url)) return;
            // filtr śmieci: tylko get_file lub .mp4; odrzuć preview i redirect-page
            if (url.indexOf('get_file') === -1 && url.indexOf('.mp4') === -1) return;
            if (/_preview/i.test(url) || url.startsWith('/video/')) return;
            seen.add(url);
            arr.push({ kind: 'mp4', key, url, label: label || kvsQualityFromUrl(url), ext: 'mp4' });
        };
        const pushFlash = pushTo(flash);
        const pushLive = pushTo(live);

        // 0. Żywy obiekt JS (window.flashvars) — odporny na modyfikacje <script>
        //    przez Cloudflare Rocket Loader i na późne wykonanie skryptów playera
        const fv = kvsFindFlashvarsObject();
        if (fv) {
            kvsFromObject(fv).forEach((s) => {
                if (!seen.has(s.url)) { seen.add(s.url); flash.push(s); }
            });
        }

        // 1. Parsowanie całego HTML (zawsze — obiekt JS może jeszcze nie istnieć,
        //    innerHTML zawiera też treść wszystkich inline <script>)
        const html = document.documentElement.innerHTML;
        const map = {}, txt = {};
        let m;
        const reUrl = /(video_(?:alt_)?url\d*)\s*:\s*'((?:\\.|[^'\\])*)'/g;
        const reUrlDq = /(video_(?:alt_)?url\d*)\s*:\s*"((?:\\.|[^"\\])*)"/g;
        const reTxt = /(video_(?:alt_)?url\d*)_text\s*:\s*'((?:\\.|[^'\\])*)'/g;
        const reTxtDq = /(video_(?:alt_)?url\d*)_text\s*:\s*"((?:\\.|[^"\\])*)"/g;
        while ((m = reUrl.exec(html)) !== null) map[m[1]] = unescapeJs(m[2]);
        while ((m = reUrlDq.exec(html)) !== null) { if (!map[m[1]]) map[m[1]] = unescapeJs(m[2]); }
        while ((m = reTxt.exec(html)) !== null) txt[m[1]] = unescapeJs(m[2]);
        while ((m = reTxtDq.exec(html)) !== null) { if (!txt[m[1]]) txt[m[1]] = unescapeJs(m[2]); }
        Object.keys(map).sort((a, b) => {
            if (a === 'video_url') return -1;
            if (b === 'video_url') return 1;
            return a.localeCompare(b);
        }).forEach((key) => pushFlash(key, map[key], txt[key + '_text'] || txt[key]));

        // URL faktycznie odtwarzany przez player — zwykle po redirectach CDN, bez
        // jednorazowego tokena; to NAJPEWNIEJSZE źródło (stary skrypt pimpbunny brał je z video.src)
        document.querySelectorAll('video').forEach((v) => {
            try {
                const u = v.currentSrc || v.src || '';
                if (u && u.indexOf('blob:') !== 0 && u.indexOf('http') === 0) {
                    pushLive('player', u, 'player • ' + kvsQualityFromUrl(u));
                }
                v.querySelectorAll('source').forEach((s) => {
                    const su = s.getAttribute('src');
                    if (su) pushLive('source-tag', new URL(su, location.href).href, 'player • ' + (s.getAttribute('label') || s.getAttribute('title') || kvsQualityFromUrl(su)));
                });
            } catch (e) { /* ignoruj */ }
        });
        return [...live, ...flash];
    }

    // URL faktycznie odtwarzany przez playera w TEJ chwili (świeży, po redirectach).
    // Wołane w momencie kliku — tokeny z flashvars są jednorazowe, tego nie cache'ujemy.
    function kvsLiveUrl() {
        const v = document.querySelector('video');
        if (!v) return null;
        try {
            const u = v.currentSrc || v.src;
            if (u && u.indexOf('blob:') !== 0 && u.indexOf('http') === 0) return u;
        } catch (e) { /* ignoruj */ }
        return null;
    }

    function kvsGetTitle() {
        try {
            const fv = kvsFindFlashvarsObject();
            if (fv && fv.video_title) return sanitize(unescapeJs(String(fv.video_title)));
        } catch (e) { /* spadek niżej */ }
        const html = document.documentElement.innerHTML;
        let m = html.match(/video_title\s*:\s*'((?:\\.|[^'\\])*)'/) || html.match(/video_title\s*:\s*"((?:\\.|[^"\\])*)"/);
        if (m && m[1]) return sanitize(unescapeJs(m[1]));
        return titleFromSelectors(null, null);
    }

    // KVS trzyma rendery pod przewidywalnym wzorem …_720p.mp4 — gdy flashvars
    // wystawia tylko 1 jakość, ta sonda sprawdza które warianty NAPRAWDĘ istnieją
    // (lekkie zapytanie Range po 2 bajty, bez ściągania pliku) i dopisuje je do listy.
    const KVS_PROBE_HEIGHTS = ['2160', '1440', '1080', '720', '480', '360', '240'];

    function kvsBuildVariantUrl(url, height) {
        // …/27645_2160p.mp4/?v-acctoken=…  ->  …/27645_1080p.mp4/?v-acctoken=…
        const m = String(url).match(/^(.*)_(\d{3,4}p)(\.\w+)(\/?)(\?.*)?$/);
        if (!m) return null;
        return m[1] + '_' + height + 'p' + m[3] + m[4] + (m[5] || '');
    }

    function kvsVerifyUrl(url) {
        // Sonda HEAD bez ściągania body; akceptuj TYLKO video/* — strona błędu
        // (martwy token) zwraca 200 z text/html i takie „jakości" odrzucamy.
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'HEAD', url, timeout: 20000,
                headers: { Referer: location.href },
                onload: (r) => {
                    const m = String(r.responseHeaders || '').match(/content-type:\s*([^\r\n]+)/i);
                    const mime = m ? m[1].toLowerCase() : '';
                    const isVideo = /video|octet-stream|\bmp4\b/.test(mime);
                    resolve(r.status >= 200 && r.status < 300 && isVideo);
                },
                onerror: () => resolve(false),
                ontimeout: () => resolve(false),
            });
        });
    }

    // Zwraca TYLKO nowo zweryfikowane warianty (bez mergowania) — mergowanie robi
    // wywołujący, żeby sonda mogła działać w tle po zbudowaniu panelu.
    async function kvsProbeMissingQualities(found) {
        const base = found.find((s) => s.kind === 'mp4' && /_\d{3,4}p\.\w+/.test(s.url));
        if (!base) return [];
        const have = found.map((s) => String(s.label));
        const missing = KVS_PROBE_HEIGHTS.filter((h) => !have.some((l) => l.includes(h)));
        if (!missing.length) return [];
        log('KVS: sondowanie jakości:', missing.join(','));
        const results = [];
        const queue = missing.slice();
        async function worker() {
            while (queue.length) {
                const h = queue.shift();
                const url = kvsBuildVariantUrl(base.url, h);
                if (!url) continue;
                const ok = await kvsVerifyUrl(url).catch(() => false);
                if (ok) results.push({ kind: 'mp4', key: 'probed-' + h, url, label: h + 'p', ext: 'mp4' });
            }
        }
        await Promise.all([worker(), worker(), worker()]);
        if (results.length) log('KVS: dosondowane warianty:', results.map((s) => s.label).join(','));
        return results;
    }

    /* ============================ ADAPTERY per-site ============================ */
    // Każdy adapter: { id, label, test(host, path), getTitle(), getSources() }
    // getSources() -> Promise<[{kind:'mp4'|'hls', label, url, ext?, referer?, getPlaylist?}]>
    // Dla HLS: url = master m3u8, getPlaylist() = async () => {url, text} ze ŚWIEŻYM tokenem.

    // Pobiera jak gmFetchText, ale zwraca też finalUrl (po redirectach embeda)
    function gmFetchFull(url, referer) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url, timeout: 60000,
                headers: { Referer: referer || location.href },
                onload: (r) => {
                    if (r.status >= 200 && r.status < 300) resolve({ text: r.responseText, finalUrl: r.finalUrl || url });
                    else reject(new Error('HTTP ' + r.status));
                },
                onerror: () => reject(new Error('Błąd sieci')),
                ontimeout: () => reject(new Error('Timeout')),
            });
        });
    }

    // livecamrips: iframe#iframe-video -> embed (mdzsmutpcvykb.net -> mxdrop.click, MixDrop)
    // -> packer Dean Edwards -> MDCore.wurl = //…mxcontent.net/v2/ID.mp4?s=…&e=… (token ~4 h).
    // Plik wymaga User-Agent + Referer embeda (inaczej 403).
    async function livecamripsResolve() {
        const frame = document.querySelector('iframe#iframe-video') || document.querySelector('iframe[src*="/e/"]');
        const src = frame ? frame.getAttribute('src') || '' : '';
        if (!src || src === 'about:blank') return [];
        const embed = await gmFetchFull(new URL(src, location.href).href, location.href);
        const clean = deobfuscatePacked(embed.text);
        const m = clean.match(/MDCore\.wurl\s*=\s*"([^"]+)"/);
        if (!m) throw new Error('Nie znaleziono strumienia MixDrop (MDCore.wurl)');
        const url = m[1].startsWith('//') ? 'https:' + m[1] : m[1];
        return [{ kind: 'mp4', label: 'MP4', url, ext: 'mp4', referer: embed.finalUrl }];
    }

    const ADAPTERS = [
        {
            id: 'eporner', label: 'Eporner',
            test: (h) => h.includes('eporner.com'),
            getTitle: () => {
                const h1 = document.querySelector('#video-info h1');
                if (h1) {
                    const clone = h1.cloneNode(true);
                    clone.querySelectorAll('span').forEach((s) => s.remove());
                    if (clone.textContent.trim()) return sanitize(clone.textContent.trim());
                }
                return titleFromSelectors(null, / - EPORNER/i);
            },
            getSources: async () => {
                await epornerWaitForPlayer(20000);
                return epornerFetchSources();
            },
        },
        {
            id: 'kvs', label: 'KVS', blobFirst: true,
            test: (h) => ['webpussi.com', 'camgirlfap.com', 'porn4fans.com', 'pimpbunny.com', 'sheeshfans.com'].some((d) => h.includes(d)),
            getTitle: kvsGetTitle,
            getSources: async () => kvsExtractSources(),
        },
        {
            id: 'tnaflix', label: 'TNAFlix',
            test: (h) => h.includes('tnaflix.com'),
            getTitle: () => titleFromSelectors(null, / - Tnaflix\.com$| TNAFlix Porn Videos$/),
            getSources: async () => {
                const out = [];
                document.querySelectorAll('#video-player source').forEach((s) => {
                    const size = s.getAttribute('size');
                    const url = s.getAttribute('src');
                    if (url) out.push({ kind: 'mp4', label: size ? size + 'p' : 'mp4', url, ext: 'mp4' });
                });
                out.sort((a, b) => qualityRank(a.label) - qualityRank(b.label));
                return out;
            },
        },
        {
            id: 'dirtyship', label: 'DirtyShip',
            test: (h) => h.includes('dirtyship.com'),
            getTitle: () => {
                const h1 = document.querySelector('h1.singletitle');
                if (h1 && h1.textContent.trim()) return sanitize(h1.textContent.trim());
                return titleFromSelectors(null, / - DirtyShip.*$/i);
            },
            getSources: async () => {
                const out = [];
                const seen = new Set();
                const push = (label, src) => {
                    if (!src || seen.has(src)) return;
                    try { src = new URL(src, location.href).href; } catch (e) { return; }
                    seen.add(src);
                    out.push({ kind: 'mp4', label: label || 'mp4', url: src, ext: 'mp4' });
                };
                document.querySelectorAll('#fp-video-0 source[src], video#fp-video-0 source[src]').forEach((s) => push(s.getAttribute('title') || 'default', s.getAttribute('src')));
                document.querySelectorAll('video[src], video source[src]').forEach((el) => {
                    let src = el.getAttribute('src');
                    if (!src) { const inner = el.querySelector('source[src]'); if (inner) src = inner.getAttribute('src'); }
                    if (src && src.includes('.mp4')) push(el.getAttribute('title') || 'video', src);
                });
                document.querySelectorAll('video').forEach((v) => {
                    try { if (v.currentSrc && v.currentSrc.includes('.mp4')) push('currentSrc', v.currentSrc); } catch (e) {}
                });
                return out;
            },
        },
        {
            id: 'mat6tube', label: 'Mat6Tube',
            test: (h) => h.includes('mat6tube.com'),
            getTitle: () => {
                const h1 = document.querySelector('.video_info h1');
                if (h1 && h1.textContent.trim()) return sanitize(h1.textContent.trim());
                return titleFromSelectors(null, /\s*-\s*BEST XXX TUBE\s*$/i);
            },
            getSources: async () => {
                const out = [];
                const seen = new Set();
                const push = (label, src) => {
                    if (!src || !/^https?:/.test(src) || seen.has(src)) return;
                    seen.add(src);
                    out.push({ kind: 'mp4', label, url: src, ext: 'mp4' });
                };
                // 1. window.playlist (JW Player, świeże tokeny secure=...)
                document.querySelectorAll('script:not([src])').forEach((el) => {
                    const txt = el.textContent || '';
                    if (!txt.includes('window.playlist')) return;
                    const mm = txt.match(/window\.playlist\s*=\s*(\{.+?\});/s);
                    if (!mm) return;
                    try {
                        const pl = JSON.parse(mm[1]);
                        if (pl && Array.isArray(pl.sources)) {
                            pl.sources.forEach((s) => { if (s && s.file) push(String(s.label || 'mp4') + 'p', s.file); });
                        }
                    } catch (e) {}
                    // 2. oficjalny /download (ten sam co natywny przycisk playera)
                    const dm = txt.match(/window\.downloadUrl\s*=\s*"([^"]+)"/);
                    if (dm) { try { push('official', new URL(dm[1], location.origin).href); } catch (e) {} }
                });
                // 3. <video> + currentSrc, 4. meta ya:ovs:content_url (ostatnia deska, bywa 404 bez sesji)
                document.querySelectorAll('video').forEach((v) => {
                    try { if (v.currentSrc && v.currentSrc.includes('.mp4')) push('currentSrc', v.currentSrc); } catch (e) {}
                });
                const meta = document.querySelector('meta[property="ya:ovs:content_url"]');
                if (meta && meta.content) push('meta', meta.content);
                const official = out.filter((s) => s.label === 'official');
                const rest = out.filter((s) => s.label !== 'official').sort((a, b) => qualityRank(a.label) - qualityRank(b.label));
                return [...official, ...rest];
            },
        },
        {
            id: 'freemiumgirls', label: 'FreemiumGirls',
            test: (h) => h.includes('freemiumgirls.com'),
            getTitle: () => titleFromSelectors('h1', null),
            getSources: async () => {
                const m = location.pathname.match(/\/video(?:-player)?\/([^/?#]+)/);
                const slug = m ? decodeURIComponent(m[1]) : null;
                if (slug) {
                    try {
                        const resp = await fetch('/api/media-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ slug }),
                        });
                        const data = await resp.json();
                        if (resp.ok && data.src) {
                            return [{ kind: 'mp4', label: data.type || 'mp4', url: data.src, ext: 'mp4' }];
                        }
                    } catch (e) { log('media-token błąd:', e); }
                }
                // Fallback: <video> po starcie Fluid Playera
                const out = [];
                document.querySelectorAll('video').forEach((v) => {
                    try {
                        const u = v.currentSrc || v.src;
                        if (u && u.indexOf('blob:') !== 0) out.push({ kind: 'mp4', label: 'video', url: u, ext: 'mp4' });
                    } catch (e) {}
                });
                return out;
            },
        },
        {
            id: 'thotchicks', label: 'ThotChicks',
            test: (h) => h.includes('thotchicks.com'),
            getTitle: () => titleFromSelectors('h1', null),
            getSources: async () => {
                const meta = document.querySelector('meta[itemprop="embedURL"]');
                const iframe = document.querySelector('iframe[src*="thotplay.com"]');
                const embedUrl = (meta && meta.getAttribute('content')) || (iframe && iframe.src);
                if (!embedUrl) return [];
                const st = { embedUrl, masterUrl: null };
                const refreshEmbed = async () => {
                    const html = await gmFetchTextRetry(st.embedUrl, location.href);
                    const urlM = html.match(/const videoURL\s*=\s*['"]([^'"]+)['"]/);
                    const keyM = html.match(/decryptLink\(\s*[^,]+,\s*['"]([^'"]+)['"]\s*\)/);
                    if (!urlM || !keyM) throw new Error('Nie znaleziono zaszyfrowanego URL');
                    st.masterUrl = await decryptAesCryptoJS(urlM[1], keyM[1]);
                    return st.masterUrl;
                };
                await refreshEmbed();
                const referer = st.embedUrl;
                const getPlaylist = async () => {
                    try {
                        const masterText = await gmFetchTextRetry(st.masterUrl, referer);
                        const variants = parseHlsVariants(masterText, st.masterUrl);
                        if (!variants.length) return { url: st.masterUrl, text: masterText };
                        const v = variants[0];
                        const text = await gmFetchTextRetry(v.url, referer);
                        return { url: v.url, text };
                    } catch (e) {
                        await refreshEmbed(); // token ważny ~2 min — odśwież i raz jeszcze
                        const masterText = await gmFetchTextRetry(st.masterUrl, referer);
                        const variants = parseHlsVariants(masterText, st.masterUrl);
                        if (!variants.length) return { url: st.masterUrl, text: masterText };
                        const v = variants[0];
                        const text = await gmFetchTextRetry(v.url, referer);
                        return { url: v.url, text };
                    }
                };
                // Wczytaj warianty do listy jakości w UI
                let variants = [];
                try {
                    const masterText = await gmFetchTextRetry(st.masterUrl, referer);
                    variants = parseHlsVariants(masterText, st.masterUrl);
                } catch (e) { /* UI pokaże sam master */ }
                const mkSrc = (variant, idx) => ({
                    kind: 'hls', label: variant ? hlsVariantLabel(variant) : 'HLS',
                    url: variant ? variant.url : st.masterUrl, ext: 'ts', referer,
                    getPlaylist: async () => {
                        try {
                            const masterText = await gmFetchTextRetry(st.masterUrl, referer);
                            const vs = parseHlsVariants(masterText, st.masterUrl);
                            const v = (variant && vs[idx]) || vs[0];
                            if (!v) return { url: st.masterUrl, text: masterText };
                            const text = await gmFetchTextRetry(v.url, referer);
                            return { url: v.url, text };
                        } catch (e) {
                            await refreshEmbed();
                            return getPlaylist();
                        }
                    },
                });
                if (!variants.length) return [mkSrc(null, 0)];
                return variants.map((v, i) => mkSrc(v, i));
            },
        },
        {
            id: 'pornx', label: 'PornX',
            test: (h) => h.includes('pornx.to'),
            getTitle: () => {
                const h1 = document.querySelector('h1.entry-title');
                if (h1 && h1.textContent.trim()) return sanitize(h1.textContent.trim());
                return titleFromSelectors(null, /\s*\|\s*PornX\s*$/i);
            },
            getSources: async () => {
                const qs = (s) => document.querySelector(s);
                let luluvdoUrl = qs('iframe[src*="luluvdo.com"], iframe[src*="lulustream.com"]');
                luluvdoUrl = luluvdoUrl && luluvdoUrl.src;
                if (!luluvdoUrl) {
                    const mm = document.documentElement.innerHTML.match(/https?:\/\/(?:www\.)?(?:luluvdo|lulustream)\.com\/e\/[A-Za-z0-9]+/);
                    if (mm) luluvdoUrl = mm[0];
                }
                if (!luluvdoUrl) {
                    const pid = (document.body.className.match(/postid-(\d+)/) || [])[1];
                    if (pid) {
                        try {
                            const api = await gmFetchTextRetry('https://pornx.to/api.php?video=' + pid, location.href);
                            const mm = api.match(/https?:\/\/(?:www\.)?(?:luluvdo|lulustream)\.com\/e\/[A-Za-z0-9]+/);
                            if (mm) luluvdoUrl = mm[0];
                        } catch (e) {}
                    }
                }
                if (!luluvdoUrl) return [];
                const st = { embed: luluvdoUrl, masterUrl: null };
                const resolveMaster = async () => {
                    const html = await gmFetchTextRetry(st.embed, location.href);
                    const clean = deobfuscatePacked(html);
                    let mm = clean.match(/["']?(?:source|file|hls|playlist)["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"']*)/i)
                        || clean.match(/(https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*)/);
                    if (!mm) throw new Error('Nie znaleziono strumienia na stronie embeda');
                    st.masterUrl = mm[1];
                    return st.masterUrl;
                };
                await resolveMaster();
                const getPlaylist = async () => {
                    try {
                        const masterText = await gmFetchTextRetry(st.masterUrl, st.embed);
                        const vs = parseHlsVariants(masterText, st.masterUrl);
                        if (!vs.length) return { url: st.masterUrl, text: masterText };
                        const text = await gmFetchTextRetry(vs[0].url, st.embed);
                        return { url: vs[0].url, text };
                    } catch (e) {
                        await resolveMaster();
                        const masterText = await gmFetchTextRetry(st.masterUrl, st.embed);
                        const vs = parseHlsVariants(masterText, st.masterUrl);
                        if (!vs.length) return { url: st.masterUrl, text: masterText };
                        const text = await gmFetchTextRetry(vs[0].url, st.embed);
                        return { url: vs[0].url, text };
                    }
                };
                if (!isHlsUrl(st.masterUrl)) {
                    return [{ kind: 'mp4', label: 'MP4', url: st.masterUrl, ext: 'mp4', referer: st.embed }];
                }
                let variants = [];
                try {
                    const masterText = await gmFetchTextRetry(st.masterUrl, st.embed);
                    variants = parseHlsVariants(masterText, st.masterUrl);
                } catch (e) {}
                if (!variants.length) {
                    return [{ kind: 'hls', label: 'HLS', url: st.masterUrl, ext: 'ts', referer: st.embed, getPlaylist }];
                }
                return variants.map((v, i) => ({
                    kind: 'hls', label: hlsVariantLabel(v), url: v.url, ext: 'ts', referer: st.embed,
                    getPlaylist: async () => {
                        const masterText = await gmFetchTextRetry(st.masterUrl, st.embed).catch(async () => {
                            await resolveMaster();
                            return gmFetchTextRetry(st.masterUrl, st.embed);
                        });
                        const vs = parseHlsVariants(masterText, st.masterUrl);
                        const vv = vs[i] || vs[0];
                        if (!vv) return { url: st.masterUrl, text: masterText };
                        const text = await gmFetchTextRetry(vv.url, st.embed);
                        return { url: vv.url, text };
                    },
                }));
            },
        },
        {
            id: 'yesporn', label: 'YesPorn', blobFirst: true,
            test: (h) => h.includes('yespornpleasexxx.com'),
            getTitle: () => titleFromSelectors('#post-title', / - YesPorn.*$/i),
            getSources: async () => {
                // Film jest w iframe player-x.php?q=<base64(urlencode(HTML))>; w HTML jest <source src="…mp4">.
                // MP4 wymaga Referer (hotlink) — stąd blobFirst.
                const out = [];
                const seen = new Set();
                const collect = (html) => {
                    const re = /(?:src|href)="(https?:[^"]+?\.mp4[^"]*)"/g;
                    let m;
                    while ((m = re.exec(html)) !== null) {
                        const url = m[1].replace(/&amp;/g, '&');
                        if (seen.has(url)) continue;
                        seen.add(url);
                        out.push({ kind: 'mp4', label: 'MP4', url, ext: 'mp4' });
                    }
                };
                const frames = [...document.querySelectorAll('iframe')]
                    .map((f) => f.getAttribute('data-litespeed-src') || f.getAttribute('src') || '')
                    .filter((s) => s.includes('player-x.php'));
                for (const src of frames) {
                    const q = (src.match(/[?&]q=([^&#]+)/) || [])[1];
                    if (q) {
                        try {
                            const bin = atob(decodeURIComponent(q));
                            const txt = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
                            collect(decodeURIComponent(txt));
                        } catch (e) { log('yesporn: dekodowanie q błąd:', e); }
                    }
                    if (!out.length) {
                        try { collect(await gmFetchTextRetry(new URL(src, location.href).href, location.href)); }
                        catch (e) { log('yesporn: player-x błąd:', e); }
                    }
                }
                return out;
            },
        },
        {
            id: 'livecamrips', label: 'LiveCamRips', blobFirst: true,
            test: (h) => h.includes('livecamrips.to'),
            getTitle: () => titleFromSelectors('h1', null),
            getSources: livecamripsResolve,
            refresh: livecamripsResolve,
        },
        {
            id: 'generic', label: 'Auto',
            test: () => true, // fallback dla każdej innej domeny
            getTitle: () => titleFromSelectors(null, null),
            getSources: async () => {
                const out = [];
                const seen = new Set();
                const push = (label, url, ext, kind) => {
                    if (!url || url.startsWith('blob:') || url.startsWith('data:') || seen.has(url)) return;
                    try { url = new URL(url, location.href).href; } catch (e) { return; }
                    seen.add(url);
                    out.push({ kind: kind || 'mp4', label: label || ext || 'source', url, ext: ext || 'mp4' });
                };
                document.querySelectorAll('video').forEach((v) => {
                    try {
                        if (v.src) push('video.src', v.src, 'mp4');
                        if (v.currentSrc) push('currentSrc', v.currentSrc, 'mp4');
                        v.querySelectorAll('source').forEach((s) => {
                            if (s.src) push(s.getAttribute('label') || s.getAttribute('title') || s.type || 'source', s.src, 'mp4');
                        });
                    } catch (e) {}
                });
                const pageText = document.documentElement.innerHTML;
                const patterns = [
                    /(?:video_url|videoUrl|videoSrc|downloadUrl|download_url|file_url|fileUrl|mediaUrl|streamUrl)\s*[:=]\s*["'](https?:\/\/[^"']+)/gi,
                    /["'](https?:\/\/[^"']+\.(?:mp4|webm|m3u8|mkv|mov)[^"']*?)["']/gi,
                ];
                for (const re of patterns) {
                    let mm;
                    while ((mm = re.exec(pageText)) !== null) {
                        const u = mm[1] || mm[2];
                        if (u && u.length > 10) {
                            const ext = u.split('?')[0].split('.').pop().toLowerCase();
                            push(ext.toUpperCase() + ' (auto)', u, ext, ext === 'm3u8' ? 'hls' : 'mp4');
                        }
                    }
                }
                document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
                    try {
                        const d = JSON.parse(s.textContent);
                        const arr = Array.isArray(d) ? d : [d];
                        arr.forEach((o) => { if (o && o.contentUrl) push('JSON-LD', o.contentUrl, 'mp4'); });
                    } catch (e) {}
                });
                // HLS ze skanu: dopnij prosty getPlaylist bez odświeżania tokena
                out.forEach((src) => {
                    if (src.kind === 'hls' && !src.getPlaylist) {
                        src.referer = location.href;
                        src.ext = 'ts';
                        src.getPlaylist = async () => ({ url: src.url, text: await gmFetchTextRetry(src.url, location.href) });
                    }
                });
                return out;
            },
        },
    ];

    function findAdapter() {
        const h = location.hostname;
        const p = location.pathname;
        for (const a of ADAPTERS) {
            try { if (a.test(h, p)) return a; } catch (e) {}
        }
        return ADAPTERS[ADAPTERS.length - 1];
    }

    /* ==================== MINI-KOLEJKA (format zgodny z VQC) ==================== */

    const QUEUE_KEY = 'uvd_queue_v1';
    function loadQueue() {
        try { return JSON.parse(GM_getValue(QUEUE_KEY, '[]')) || []; } catch (e) { return []; }
    }
    function saveQueue(q) { GM_setValue(QUEUE_KEY, JSON.stringify(q)); }
    function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    function addToQueue(source, title) {
        const q = loadQueue();
        const item = {
            id: makeId(), pageUrl: location.href, title: title,
            site: location.hostname.replace(/^www\./, ''),
            quality: sourceQuality(source) || source.label, label: source.label,
            directUrl: source.kind === 'mp4' ? source.url : '',
            filename: sanitize(title) + '.' + (source.ext || 'mp4'),
            addedAt: Date.now(), ext: source.ext || 'mp4',
            type: source.kind === 'hls' ? 'page-hls' : 'unified',
        };
        if (q.some((x) => x.pageUrl === item.pageUrl && x.directUrl === item.directUrl)) {
            notify('Już w kolejce', 'warning');
            return;
        }
        q.push(item);
        saveQueue(q);
        notify('Dodano do kolejki (' + q.length + '): ' + item.filename, 'success');
    }

    async function downloadQueue() {
        const q = loadQueue();
        const withUrl = q.filter((x) => x.directUrl);
        const without = q.filter((x) => !x.directUrl);
        if (!withUrl.length) {
            notify('Kolejka nie ma bezpośrednich URL-i (same strony HLS) — pobierz je pojedynczo', 'warning', 5000);
            return;
        }
        if (without.length) notify('Pomijam ' + without.length + ' pozycji HLS/stron — pobierz je ręcznie', 'warning');
        for (let i = 0; i < withUrl.length; i++) {
            const item = withUrl[i];
            notify('Kolejka ' + (i + 1) + '/' + withUrl.length + ': ' + item.filename, 'info');
            try {
                await new Promise((resolve, reject) => {
                    try {
                        GM_download({
                            url: item.directUrl, name: item.filename, saveAs: false,
                            headers: { Referer: item.pageUrl },
                            onload: () => resolve(), onerror: (e) => reject(e), ontimeout: () => reject(new Error('timeout')),
                        });
                    } catch (e) { reject(e); }
                });
            } catch (e) {
                log('Błąd kolejki:', item.filename, e);
                notify('Błąd: ' + item.filename, 'error');
            }
            await sleep(1200); // odstęp między pobraniami
        }
        notify('Zakończono kolejkę: ' + withUrl.length + ' pozycji', 'success');
    }

    function exportQueue() {
        const q = loadQueue();
        if (!q.length) { notify('Kolejka pusta', 'warning'); return; }
        const json = JSON.stringify(q, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kolejka-uvd-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
        copyText(q.map((x) => x.directUrl || x.pageUrl).join('\n'), 'URL-e w schowku, JSON pobrany');
    }

    /* ============================ UNIFIED PANEL UI ============================ */
    // Jeden fixed panel (nie rusza layoutu strony), przeciągalny za nagłówek.

    const PANEL_ID = 'uvd-panel';
    const ui = { root: null, select: null, status: null, bar: null, barWrap: null, cancel: null, badge: null };

    function setUiStatus(u, text, progress) {
        const st = (u || ui).status;
        const bw = (u || ui).barWrap;
        if (st) st.textContent = text || '';
        if (bw) bw.style.display = progress ? 'block' : 'none';
    }
    function setUiProgress(u, pct) {
        const bar = (u || ui).bar;
        if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    }
    function showUiCancel(u, show) {
        const c = (u || ui).cancel;
        if (c) c.style.display = show ? '' : 'none';
    }

    function buildPanel(adapter, sources, title) {
        const old = document.getElementById(PANEL_ID);
        if (old) old.remove();
        const root = document.createElement('div');
        root.id = PANEL_ID;

        const opts = sources.map((s, i) => '<option value="' + i + '">' + picklistOptionText(s) + '</option>').join('');
        root.innerHTML =
            '<div class="uvd-head" id="uvd-head"><b>▼ UVD · ' + adapter.label + ' (' + sources.length + ')</b>' +
            '<span><button id="uvd-hide" title="Zwiń">−</button> <button id="uvd-x" title="Zamknij">×</button></span></div>' +
            '<div class="uvd-body" id="uvd-body">' +
            '<div class="uvd-title" title="' + title + '">' + title.slice(0, 60) + '</div>' +
            (sources.length > 1 ? '<select id="uvd-q">' + opts + '</select>' : '') +
            '<div class="uvd-btns">' +
            '<button id="uvd-dl" class="uvd-main">Pobierz</button>' +
            '<button id="uvd-fast" title="GM_download bez paska (szybkie)">Szybko</button>' +
            '<button id="uvd-tab" title="Otwórz w nowej karcie">Karta</button>' +
            '<button id="uvd-copy" title="Kopiuj URL">Kopiuj</button>' +
            '<button id="uvd-queue" title="Dodaj do kolejki">+Kol</button>' +
            '<button id="uvd-cancel" style="display:none">Anuluj</button>' +
            '</div>' +
            '<div class="uvd-barwrap" id="uvd-barwrap"><div class="uvd-bar" id="uvd-bar"></div></div>' +
            '<div class="uvd-status" id="uvd-status"></div>' +
            '</div>';
        document.body.appendChild(root);

        ui.root = root;
        ui.select = root.querySelector('#uvd-q');
        ui.status = root.querySelector('#uvd-status');
        ui.bar = root.querySelector('#uvd-bar');
        ui.barWrap = root.querySelector('#uvd-barwrap');
        ui.cancel = root.querySelector('#uvd-cancel');

        const getSel = () => sources[ui.select ? parseInt(ui.select.value, 10) || 0 : 0];
        const fnameFor = (s) => sanitize(title) + (s.kind === 'hls' ? '_' + s.label.replace(/[^0-9a-zA-Z]/g, '') + '.ts' : '.mp4');

        // Przeciąganie za nagłówek
        const head = root.querySelector('#uvd-head');
        let drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
        head.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            drag = true; sx = e.clientX; sy = e.clientY;
            const r = root.getBoundingClientRect();
            ox = r.left; oy = r.top;
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!drag) return;
            root.style.left = (ox + e.clientX - sx) + 'px';
            root.style.top = (oy + e.clientY - sy) + 'px';
            root.style.right = 'auto'; root.style.bottom = 'auto';
        });
        window.addEventListener('mouseup', () => { drag = false; });

        root.querySelector('#uvd-x').onclick = () => root.remove();
        root.querySelector('#uvd-hide').onclick = (e) => {
            const b = root.querySelector('#uvd-body');
            const hidden = b.style.display !== 'none';
            b.style.display = hidden ? 'none' : '';
            e.target.textContent = hidden ? '+' : '−';
        };

        root.querySelector('#uvd-dl').onclick = async () => {
            let s = getSel();
            if (!s) return;
            if (s.kind === 'mp4' && adapter.blobFirst) {
                // Tokeny jednorazowe — odśwież źródła w MOMENCIE KLIKU (nie cache'uj!),
                // pobierz blobem z Referer
                if (adapter.refresh) {
                    try { const fresh = await adapter.refresh(); if (fresh && fresh.length) s = fresh[0]; }
                    catch (e) { log('refresh źródła błąd:', e); }
                }
                let live = null;
                if (adapter.id === 'kvs') {
                    // KVS: gdy serwer odda HTML, cofnij się do URL-a z playera
                    const fresh = kvsExtractSources();
                    if (fresh.length) {
                        const sameQ = fresh.find((f) => f.label === s.label) || fresh[0];
                        if (sameQ) s = sameQ;
                    }
                    live = kvsLiveUrl();
                }
                downloadMp4(s, fnameFor(s), ui, true, live && live !== s.url ? live : null);
                return;
            }
            if (s.kind === 'hls') {
                setUiStatus(ui, 'Przygotowanie HLS…', true);
                showUiCancel(ui, true);
                HLS.cancelRequested = false;
                try {
                    const blob = await downloadHls(s, fnameFor(s), ui, (done, total, bytes) => {
                        const pct = Math.round((done / total) * 100);
                        setUiProgress(ui, pct);
                        setUiStatus(ui, done + '/' + total + ' segm. • ' + (bytes / 1048576).toFixed(1) + ' MB • ' + pct + '%', true);
                    });
                    showUiCancel(ui, false);
                    if (HLS.cancelRequested) { setUiStatus(ui, 'Anulowano', false); return; }
                    setUiProgress(ui, 100);
                    setUiStatus(ui, 'Sklejanie…', true);
                    saveViaAnchor(URL.createObjectURL(blob), fnameFor(s));
                    setUiStatus(ui, 'Zapisano: ' + fnameFor(s), false);
                    notify('Film pobrany: ' + fnameFor(s), 'success');
                } catch (e) {
                    showUiCancel(ui, false);
                    if (String(e.message).startsWith('ENCRYPTED')) { notify(e.message.slice(10), 'warning', 6000); setUiStatus(ui, 'HLS szyfrowany — skopiuj URL do ffmpeg', false); }
                    else if (e.message !== 'cancelled' && !HLS.cancelRequested) { setUiStatus(ui, 'Błąd: ' + e.message, false); }
                    else setUiStatus(ui, 'Anulowano', false);
                }
                return;
            }
            downloadMp4(s, fnameFor(s), ui);
        };
        root.querySelector('#uvd-fast').onclick = () => {
            const s = getSel();
            if (!s) return;
            if (adapter.blobFirst) {
                // KVS: direct bez Referer zwraca stronę HTML — idź tą samą ścieżką co Pobierz
                root.querySelector('#uvd-dl').click();
                return;
            }
            notify('Pobieranie (szybkie): ' + s.label, 'info');
            try {
                GM_download({ url: s.url, name: fnameFor(s), saveAs: true, onload: () => notify('Zapisano', 'success') });
            } catch (e) { openInTab(s.url); }
        };
        root.querySelector('#uvd-tab').onclick = async () => {
            const s = getSel();
            if (!s) return;
            if (adapter.id === 'kvs') {
                // URL grany przez player (po redirectach) zamiast tokena z flashvars
                openInTab(kvsLiveUrl() || s.url);
                return;
            }
            if (s.kind === 'hls' && s.getPlaylist) {
                try {
                    const pl = await s.getPlaylist();
                    openInTab(pl.url);
                    return;
                } catch (e) { /* spadek na master */ }
            }
            openInTab(s.url);
        };
        root.querySelector('#uvd-copy').onclick = async () => {
            const s = getSel();
            if (!s) return;
            if (adapter.id === 'kvs') {
                copyText(kvsLiveUrl() || s.url, 'Skopiowano URL odtwarzany przez player');
                return;
            }
            if (s.kind === 'hls' && s.getPlaylist) {
                try {
                    const pl = await s.getPlaylist();
                    copyText(pl.url, 'URL skopiowany (token czasowy — użyj od razu)');
                    return;
                } catch (e) { /* spadek na master */ }
            }
            copyText(s.url);
        };
        root.querySelector('#uvd-queue').onclick = () => {
            const s = getSel();
            if (s) addToQueue(s, title);
        };
        ui.cancel.onclick = () => { cancelMp4(ui); cancelHls(); };

        GM_addStyle(
            '#' + PANEL_ID + '{position:fixed;right:12px;bottom:12px;z-index:999999;background:#111;color:#fff;' +
            'padding:0;border-radius:10px;font:13px/1.4 Arial,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5);' +
            'width:330px;max-width:92vw;border:1px solid #e94560;}' +
            '#' + PANEL_ID + ' .uvd-head{display:flex;justify-content:space-between;align-items:center;cursor:move;' +
            'background:#1a1a2e;padding:7px 10px;border-radius:10px 10px 0 0;color:#e94560;font-size:12px;}' +
            '#' + PANEL_ID + ' .uvd-head button{background:#333;color:#fff;border:0;border-radius:5px;' +
            'padding:1px 7px;cursor:pointer;margin-left:4px;}' +
            '#' + PANEL_ID + ' .uvd-body{padding:8px 10px;}' +
            '#' + PANEL_ID + ' .uvd-title{font-size:12px !important;opacity:.85 !important;margin-bottom:6px !important;word-break:break-word !important;color:#fff !important;}' +
            '#' + PANEL_ID + ' select#uvd-q{width:100% !important;margin-bottom:6px !important;' +
            'background:#222 !important;color:#fff !important;border:1px solid #e94560 !important;' +
            'border-radius:5px !important;padding:6px !important;font-size:13px !important;' +
            'opacity:1 !important;appearance:auto !important;color-scheme:dark !important;}' +
            '#' + PANEL_ID + ' select#uvd-q option{background:#222 !important;color:#fff !important;font-size:13px !important;}' +
            '#' + PANEL_ID + ' .uvd-btns{display:flex;gap:5px;flex-wrap:wrap;}' +
            '#' + PANEL_ID + ' .uvd-btns button{flex:1;background:#444;color:#fff;border:0;border-radius:6px;padding:6px 4px;cursor:pointer;font-size:12px;white-space:nowrap;}' +
            '#' + PANEL_ID + ' .uvd-btns button:hover{background:#555;}' +
            '#' + PANEL_ID + ' .uvd-main{background:#e840cc!important;font-weight:bold;}' +
            '#' + PANEL_ID + ' .uvd-main:hover{background:#f060d8!important;}' +
            '#' + PANEL_ID + ' .uvd-barwrap{height:5px;background:#333;border-radius:3px;margin-top:6px;display:none;overflow:hidden;}' +
            '#' + PANEL_ID + ' .uvd-bar{height:100%;width:0;background:#4caf50;transition:width .2s;}' +
            '#' + PANEL_ID + ' .uvd-status{font-size:11px !important;margin-top:5px !important;opacity:.9 !important;word-break:break-word !important;color:#fff !important;}'
        );
        log('Panel:', adapter.id, sources.length, 'źródeł');
    }

    /* ============================ INIT (SPA-guard) ============================ */

    async function scan() {
        if (document.getElementById(PANEL_ID)) return true;
        const adapter = findAdapter();
        let sources = [];
        try {
            sources = await adapter.getSources();
        } catch (e) {
            log(adapter.id, 'getSources błąd:', e);
            return false;
        }
        if (!sources || !sources.length) return false;
        let title = 'video';
        try { title = adapter.getTitle() || 'video'; } catch (e) {}
        buildPanel(adapter, sources, title);
        notify('UVD [' + adapter.label + ']: ' + sources.map((s) => picklistOptionText(s)).join(', '), 'success');
        // KVS: sonda brakujących jakości w TLE (panel już stoi, nic nie blokuje).
        // Gdy strona wystawia mało źródeł, dopisz dosondowane do tej samej tablicy
        // (getSel czyta ją na żywo) i odbuduj select.
        if (adapter.id === 'kvs' && sources.length < 3) {
            kvsProbeMissingQualities(sources).then((extra) => {
                const box = document.getElementById(PANEL_ID);
                if (!extra.length || !box) return;
                const have = new Set(sources.map((x) => x.url));
                extra.forEach((x) => { if (!have.has(x.url)) { have.add(x.url); sources.push(x); } });
                if (sources.length < 2) return;
                sources.sort((a, b) => qualityRank(a.label) - qualityRank(b.label));
                const headB = box.querySelector('.uvd-head b');
                if (headB) headB.textContent = '▼ UVD · ' + adapter.label + ' (' + sources.length + ')';
                let sel = box.querySelector('#uvd-q');
                const prevIdx = sel ? sel.selectedIndex : 0;
                if (!sel) {
                    sel = document.createElement('select');
                    sel.id = 'uvd-q';
                    box.querySelector('.uvd-body').insertBefore(sel, box.querySelector('.uvd-btns'));
                    ui.select = sel;
                }
                sel.innerHTML = sources.map((x, i) => '<option value="' + i + '">' + picklistOptionText(x) + '</option>').join('');
                sel.selectedIndex = Math.min(Math.max(prevIdx, 0), sources.length - 1);
                notify('UVD: dosondowano jakości: ' + extra.map((x) => x.label).join(', '), 'success');
            }).catch(() => {});
        }
        return true;
    }

    let scanTimer = null;
    function scheduleScan() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scan, 300);
    }

    function init() {
        log('Start:', location.href, 'adapter:', findAdapter().id);
        // Wielokrotne skany — playery (JW/FluidPlayer/kt_player) ładują się z opóźnieniem
        [800, 2500, 6000].forEach((t) => setTimeout(scan, t));
        // MutationObserver z debounce (podmiany DOM playera)
        const mo = new MutationObserver(() => {
            if (!document.getElementById(PANEL_ID)) scheduleScan();
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => mo.disconnect(), 45000);
        // Re-init przy nawigacji SPA bez reloadu
        let lastHref = location.href;
        setInterval(() => {
            if (location.href !== lastHref) {
                lastHref = location.href;
                const old = document.getElementById(PANEL_ID);
                if (old) old.remove();
                setTimeout(scan, 1200);
            }
        }, 1000);

        GM_registerMenuCommand('UVD: Pobierz najlepszą jakość', async () => {
            const a = findAdapter();
            const sources = await a.getSources();
            if (!sources.length) { notify('Nie znaleziono wideo', 'error'); return; }
            const title = a.getTitle();
            if (!document.getElementById(PANEL_ID)) buildPanel(a, sources, title);
            document.getElementById('uvd-dl').click();
        });
        GM_registerMenuCommand('UVD: Pokaż panel', () => scan());
        GM_registerMenuCommand('UVD: Kopiuj URL (najlepsza jakość)', async () => {
            const a = findAdapter();
            const sources = await a.getSources();
            if (!sources.length) { notify('Nie znaleziono wideo', 'error'); return; }
            copyText(sources[0].url);
        });
        GM_registerMenuCommand('UVD: diagnostyka strony (wynik w konsoli F12)', async () => {
            const a = findAdapter();
            const inner = document.documentElement.innerHTML;
            const fv = a.id === 'kvs' ? kvsFindFlashvarsObject() : null;
            const vids = [];
            document.querySelectorAll('video').forEach((v) => {
                try { vids.push((v.currentSrc || v.src || '(pusty)').slice(0, 100)); }
                catch (e) { vids.push('(błąd odczytu)'); }
            });
            let srcList = [];
            try { srcList = (await a.getSources()).map((s) => s.label + ' :: ' + s.url.slice(0, 80)); }
            catch (e) { srcList = ['BŁĄD getSources: ' + e.message]; }
            const info = {
                adapter: a.id, host: location.hostname,
                inlineScripts: document.querySelectorAll('script:not([src])').length,
                video_url_w_HTML: inner.includes('video_url'),
                window_flashvars: !!fv,
                flashvars_klucze: fv ? Object.keys(fv).filter((k) => /url|title/i.test(k)) : [],
                video_elementy: vids,
                wykryte_zrodla: srcList,
            };
            log('DIAGNOSTYKA:', info);
            notify('Diagnostyka w konsoli (F12): adapter=' + a.id + ', źródeł=' + srcList.length + ', video=' + vids.length, 'info', 6000);
        });
        GM_registerMenuCommand('UVD: Pobierz kolejkę (' + loadQueue().length + ')', () => downloadQueue());
        GM_registerMenuCommand('UVD: Eksport kolejki (JSON+TXT)', () => exportQueue());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
    } else {
        setTimeout(init, 400);
    }
})();
