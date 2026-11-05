// ==UserScript==
// @name         ThotChicks Video Downloader
// @namespace    http://tampermonkey.net/
// @version      2.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/thotchicks-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/thotchicks-downloader.user.js
// @description  Pobiera wideo z thotchicks.com — deszyfruje URL z thotplay.com i skleja segmenty HLS w jeden plik .ts
// @author       opencode
// @match        *://*.thotchicks.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=thotchicks.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @connect      thotplay.com
// @connect      cdn.thotplay.com
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        CONCURRENCY: 5,   // równoległe pobieranie segmentów
        RETRIES: 2,       // ponowne próby dla pojedynczego segmentu
        TIMEOUT: 60000,
    };

    const log = (...a) => console.log('[THC]', ...a);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // ---------------------------------------------------------------- notify

    function notify(msg, type = 'info', ms = 3500) {
        const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336', warning: '#ff9800' };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;transition:opacity .4s;font-family:Arial,sans-serif;pointer-events:none;';
        el.innerHTML = `<div style="background:${colors[type] || colors.info};color:#fff;padding:10px 18px;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.4);font-size:13px;max-width:420px;">${msg}</div>`;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ms);
    }

    // ---------------------------------------------------------------- page info

    function getEmbedUrl() {
        const meta = document.querySelector('meta[itemprop="embedURL"]');
        if (meta) return meta.getAttribute('content');
        const iframe = document.querySelector('iframe[src*="thotplay.com"]');
        if (iframe) return iframe.src;
        return null;
    }

    function getVideoTitle() {
        const h1 = document.querySelector('h1');
        if (h1) return h1.textContent.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
        const og = document.querySelector('meta[property="og:title"]');
        if (og) return og.content.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
        return 'video';
    }

    // ---------------------------------------------------------------- GM fetch

    function gmFetch(url, responseType) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType,
                timeout: CONFIG.TIMEOUT,
                headers: { Referer: location.href },
                onload: (r) => {
                    if (r.status >= 200 && r.status < 300) {
                        const data = responseType === 'text'
                            ? (r.responseText !== undefined ? r.responseText : r.response)
                            : r.response;
                        resolve(data);
                    } else {
                        reject(new Error('HTTP ' + r.status));
                    }
                },
                onerror: () => reject(new Error('Błąd sieci')),
                ontimeout: () => reject(new Error('Timeout')),
            });
        });
    }

    async function gmFetchRetry(url, responseType, retries = CONFIG.RETRIES) {
        for (let i = 0; ; i++) {
            try { return await gmFetch(url, responseType); }
            catch (e) { if (i >= retries) throw e; await sleep(400 * (i + 1)); }
        }
    }

    const fetchText = (u) => gmFetchRetry(u, 'text');
    const fetchBlob = (u) => gmFetchRetry(u, 'blob');

    // ---------------------------------------------------------------- decrypt (CryptoJS AES / OpenSSL salted)

    function md5(bytes) {
        const u8 = new Uint8Array(bytes);
        const total = Math.ceil((u8.length + 9) / 64) * 64;
        const c = new Uint8Array(total);
        c.set(u8);
        c[u8.length] = 0x80;
        const v = new DataView(c.buffer);
        v.setUint32(total - 8, u8.length << 3, true);
        v.setUint32(total - 4, Math.floor(u8.length / 0x20000000), true);
        let h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
        const k = [];
        for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
        const s = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
        const f = [
            (b, c_, d) => ((b & c_) | (~b & d)) >>> 0,
            (b, c_, d) => ((d & b) | (~d & c_)) >>> 0,
            (b, c_, d) => (b ^ c_ ^ d) >>> 0,
            (b, c_, d) => (c_ ^ (b | ~d)) >>> 0,
        ];
        const g = [i => i, i => (5 * i + 1) % 16, i => (3 * i + 5) % 16, i => (7 * i) % 16];
        const rotl = (v_, n) => ((v_ << n) | (v_ >>> (32 - n))) >>> 0;
        for (let o = 0; o < total; o += 64) {
            const w = new Uint32Array(c.buffer, o, 16);
            let [a, b, c_, d] = h;
            for (let r = 0; r < 4; r++) {
                for (let i = r * 16, e = i + 16; i < e; i++) {
                    const t = a + f[r](b, c_, d) + k[i] + w[g[r](i)];
                    const na = (b + rotl(t, s[r][i % 4])) >>> 0;
                    [a, b, c_, d] = [d, na, b, c_];
                }
            }
            h[0] = (h[0] + a) >>> 0;
            h[1] = (h[1] + b) >>> 0;
            h[2] = (h[2] + c_) >>> 0;
            h[3] = (h[3] + d) >>> 0;
        }
        const r = new Uint8Array(16);
        const dv = new DataView(r.buffer);
        for (let i = 0; i < 4; i++) dv.setUint32(i * 4, h[i], true);
        return r;
    }

    function concat(...arrays) {
        let len = 0;
        for (const a of arrays) len += a.length;
        const r = new Uint8Array(len);
        let off = 0;
        for (const a of arrays) { r.set(a, off); off += a.length; }
        return r;
    }

    function decryptAesCryptoJS(encrypted, key) {
        const buf = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
        const salt = buf.slice(8, 16);
        const ct = buf.slice(16);
        const keyBytes = new TextEncoder().encode(key);
        const m1 = md5(concat(keyBytes, salt));
        const m2 = md5(concat(m1, keyBytes, salt));
        const m3 = md5(concat(m2, keyBytes, salt));
        const dk = concat(m1, m2);
        const iv = m3.slice(0, 16);
        return crypto.subtle.importKey('raw', dk, { name: 'AES-CBC' }, false, ['decrypt'])
            .then(keyObj => crypto.subtle.decrypt({ name: 'AES-CBC', iv }, keyObj, ct))
            .then(pt => new TextDecoder().decode(pt));
    }

    function extractEncryptedData(html) {
        const urlMatch = html.match(/const videoURL\s*=\s*['"]([^'"]+)['"]/);
        const keyMatch = html.match(/decryptLink\(\s*[^,]+,\s*['"]([^'"]+)['"]\s*\)/);
        return {
            encryptedUrl: urlMatch ? urlMatch[1] : null,
            secretKey: keyMatch ? keyMatch[1] : null,
        };
    }

    // ---------------------------------------------------------------- HLS parsing

    function resolveUrl(base, ref) {
        try { return new URL(ref, base).href; } catch (e) { return ref; }
    }

    function parseAttributes(line) {
        const attrs = {};
        const re = /([A-Z0-9-]+)=("([^"]*)"|([^,]*))/g;
        let m;
        while ((m = re.exec(line)) !== null) {
            attrs[m[1]] = m[3] !== undefined ? m[3] : m[4];
        }
        return attrs;
    }

    function parseVariants(text, baseUrl) {
        const variants = [];
        const lines = text.split(/\r?\n/);
        let cur = null;
        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            if (t.startsWith('#EXT-X-STREAM-INF')) {
                cur = parseAttributes(t.slice('#EXT-X-STREAM-INF'.length));
            } else if (!t.startsWith('#') && cur) {
                const bw = parseInt(cur.BANDWIDTH) || 0;
                const res = /(\d+)x(\d+)/.exec(cur.RESOLUTION || '');
                variants.push({
                    url: resolveUrl(baseUrl, t),
                    bandwidth: bw,
                    height: res ? parseInt(res[2]) : 0,
                    width: res ? parseInt(res[1]) : 0,
                    codecs: cur.CODECS || '',
                });
                cur = null;
            }
        }
        variants.sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));
        return variants;
    }

    function parseSegments(text, baseUrl) {
        const segs = [];
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            segs.push(resolveUrl(baseUrl, t));
        }
        return segs;
    }

    function variantLabel(v) {
        if (v.height) return `${v.height}p (${v.width}x${v.height})`;
        if (v.bandwidth) return Math.round(v.bandwidth / 1000) + ' kbps';
        return 'Auto';
    }

    function isHlsUrl(url) {
        return /\.m3u8(\?|$|#)/i.test(url);
    }

    // ---------------------------------------------------------------- UI

    const state = {
        embedUrl: null,
        encryptedUrl: null,
        secretKey: null,
        masterUrl: null,
        variants: [],
        qualityIndex: 0,
        title: getVideoTitle(),
        cancelRequested: false,
        ui: {},
    };

    function buildPanel() {
        const container = document.createElement('div');
        container.id = 'thc-downloader';
        container.innerHTML = `
            <div class="thc-panel">
                <div class="thc-head">
                    <span class="thc-title">▼ ThotChicks Downloader</span>
                    <span class="thc-badge" id="thc-badge">...</span>
                </div>
                <div class="thc-row">
                    <select class="thc-select" id="thc-quality" title="Wybierz jakość"></select>
                    <div class="thc-btns">
                        <button class="thc-btn thc-btn-main" id="thc-dl" title="Pobierz i sklej segmenty w plik .ts">Pobierz film</button>
                        <button class="thc-btn" id="thc-open" title="Otwórz strumień w nowej karcie (najlepiej w Edge)">Otwórz w karcie</button>
                        <button class="thc-btn" id="thc-copy" title="Kopiuj URL strumienia (token ważny ok. 2 min)">Kopiuj URL</button>
                    </div>
                </div>
                <div class="thc-url" id="thc-url"></div>
                <div class="thc-progress" id="thc-progress" style="display:none;">
                    <div class="thc-progress-bar"><div class="thc-progress-fill" id="thc-fill"></div></div>
                    <div class="thc-progress-text" id="thc-progress-text"></div>
                    <button class="thc-btn thc-btn-cancel" id="thc-cancel">Anuluj</button>
                </div>
            </div>
        `;

        const target = document.querySelector('.video-player-area') || document.querySelector('.entry-content') || document.querySelector('#content');
        if (target) target.parentNode.insertBefore(container, target.nextSibling);
        else document.body.appendChild(container);

        state.ui = {
            badge: container.querySelector('#thc-badge'),
            quality: container.querySelector('#thc-quality'),
            dl: container.querySelector('#thc-dl'),
            open: container.querySelector('#thc-open'),
            copy: container.querySelector('#thc-copy'),
            url: container.querySelector('#thc-url'),
            progress: container.querySelector('#thc-progress'),
            fill: container.querySelector('#thc-fill'),
            progressText: container.querySelector('#thc-progress-text'),
            cancel: container.querySelector('#thc-cancel'),
        };

        state.ui.quality.addEventListener('change', () => {
            state.qualityIndex = parseInt(state.ui.quality.value) || 0;
            updateUrlLine();
        });
        state.ui.dl.addEventListener('click', startDownload);
        state.ui.open.addEventListener('click', openInTab);
        state.ui.copy.addEventListener('click', copyUrl);
        state.ui.cancel.addEventListener('click', () => {
            state.cancelRequested = true;
            setProgressState(false);
            notify('Anulowano pobieranie', 'warning');
        });
    }

    function setProgressState(show) {
        state.ui.progress.style.display = show ? 'block' : 'none';
    }

    function setProgress(pct, text) {
        state.ui.fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
        state.ui.progressText.textContent = text;
    }

    function fmtBytes(b) {
        if (!b && b !== 0) return '0 MB';
        const mb = b / 1048576;
        if (mb < 1) return b.toFixed(0) + ' B';
        if (mb < 1024) return mb.toFixed(1) + ' MB';
        return (mb / 1024).toFixed(2) + ' GB';
    }

    function updateQualityUI() {
        const v = state.variants;
        if (v.length > 1) {
            state.ui.quality.style.display = '';
            state.ui.quality.innerHTML = '';
            v.forEach((item, i) => {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.textContent = 'Jakość: ' + variantLabel(item);
                state.ui.quality.appendChild(opt);
            });
            state.ui.quality.selectedIndex = 0;
            state.ui.badge.textContent = variantLabel(v[0]);
        } else if (v.length === 1) {
            state.ui.quality.style.display = 'none';
            state.ui.badge.textContent = variantLabel(v[0]);
        } else if (isHlsUrl(state.masterUrl)) {
            state.ui.quality.style.display = 'none';
            state.ui.badge.textContent = 'HLS';
        } else {
            state.ui.quality.style.display = 'none';
            state.ui.badge.textContent = 'MP4';
        }
        updateUrlLine();
    }

    function updateUrlLine() {
        const url = getSelectedUrl();
        state.ui.url.textContent = url || '';
        state.ui.url.title = url || '';
    }

    function getSelectedUrl() {
        const v = state.variants[state.qualityIndex];
        return (v && v.url) || state.masterUrl || '';
    }

    // ---------------------------------------------------------------- logic

    async function refreshEmbed() {
        const html = await fetchText(state.embedUrl).catch(() => null);
        if (!html) { notify('Nie udało się pobrać strony odtwarzacza', 'error'); return false; }
        const { encryptedUrl, secretKey } = extractEncryptedData(html);
        if (!encryptedUrl || !secretKey) { notify('Nie znaleziono zaszyfrowanego URL', 'error'); return false; }
        state.encryptedUrl = encryptedUrl;
        state.secretKey = secretKey;
        try {
            state.masterUrl = await decryptAesCryptoJS(encryptedUrl, secretKey);
            log('Master URL:', state.masterUrl);
            return true;
        } catch (e) {
            log('Decrypt error:', e);
            notify('Błąd deszyfrowania URL', 'error');
            return false;
        }
    }

    async function loadVariants() {
        try {
            const text = await fetchText(state.masterUrl);
            state.variants = parseVariants(text, state.masterUrl);
        } catch (e) {
            log('Master fetch failed:', e);
            const ok = await refreshEmbed();
            if (!ok) return;
            try {
                const text = await fetchText(state.masterUrl);
                state.variants = parseVariants(text, state.masterUrl);
            } catch (e2) {
                log('Master retry failed:', e2);
                state.variants = [];
            }
        }
        log('Variants:', state.variants);
    }

    async function getVariantPlaylist() {
        // Świeży token: pobierz master (nowy token) -> wybrany wariant
        try {
            const masterText = await fetchText(state.masterUrl);
            const variants = parseVariants(masterText, state.masterUrl);
            if (!variants.length) throw new Error('no variants');
            const variant = variants[state.qualityIndex] || variants[0];
            const text = await fetchText(variant.url);
            return { url: variant.url, text };
        } catch (e) {
            // wygasł token lub błąd — odśwież embed i spróbuj raz jeszcze
            await refreshEmbed();
            const masterText = await fetchText(state.masterUrl);
            const variants = parseVariants(masterText, state.masterUrl);
            const variant = variants[state.qualityIndex] || variants[0];
            const text = await fetchText(variant.url);
            return { url: variant.url, text };
        }
    }

    function downloadSegments(urls, onProgress) {
        return new Promise((resolve, reject) => {
            if (!urls.length) { resolve([]); return; }
            const parts = new Array(urls.length);
            let next = 0;
            let done = 0;
            let bytes = 0;
            let active = 0;
            let finished = false;

            const checkCancel = () => {
                if (state.cancelRequested && !finished) {
                    finished = true;
                    reject(new Error('cancelled'));
                }
            };

            function worker() {
                checkCancel();
                if (finished || state.cancelRequested) return;
                if (next >= urls.length) {
                    if (done === urls.length && !finished) {
                        finished = true;
                        resolve(parts);
                    }
                    return;
                }
                const i = next++;
                active++;
                gmFetchRetry(urls[i], 'blob')
                    .then((blob) => {
                        active--;
                        if (state.cancelRequested && !finished) {
                            finished = true;
                            reject(new Error('cancelled'));
                            return;
                        }
                        if (finished) return;
                        parts[i] = blob;
                        done++;
                        bytes += blob.size;
                        onProgress(done, urls.length, bytes);
                        worker();
                    })
                    .catch((e) => {
                        active--;
                        if (!finished) { finished = true; reject(e); }
                    });
            }

            for (let w = 0; w < Math.min(CONFIG.CONCURRENCY, urls.length); w++) worker();
        });
    }

    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
    }

    async function startDownload() {
        const masterUrl = state.masterUrl;
        if (!masterUrl) { notify('Brak URL wideo', 'error'); return; }

        state.cancelRequested = false;
        setProgressState(true);
        setProgress(0, 'Przygotowanie...');

        try {
            if (!isHlsUrl(masterUrl)) {
                // bezpośredni plik (mp4 itp.)
                const blob = await fetchBlob(masterUrl);
                if (state.cancelRequested) return;
                setProgress(100, 'Gotowe');
                saveBlob(blob, state.title + '.mp4');
                notify('Film pobrany', 'success');
                setProgressState(false);
                return;
            }

            let playlist;
            let segments;
            try {
                playlist = await getVariantPlaylist();
                segments = parseSegments(playlist.text, playlist.url);
            } catch (e) {
                log('Variant fetch failed:', e);
                notify('Nie udało się pobrać listy segmentów: ' + e.message, 'error');
                setProgressState(false);
                return;
            }

            if (!segments.length) {
                notify('Playlista nie zawiera segmentów', 'error');
                setProgressState(false);
                return;
            }
            if (playlist.text.includes('#EXT-X-KEY') || playlist.text.includes('#EXT-X-MAP')) {
                notify('Ten strumień wymaga ffmpeg (szyfrowany/fMP4) — użyj "Kopiuj URL" i ffmpeg', 'warning');
                setProgressState(false);
                return;
            }

            const filename = state.title + '.ts';
            const parts = await downloadSegments(segments, (done, total, bytes) => {
                const pct = Math.round((done / total) * 100);
                setProgress(pct, `${done} / ${total} segmentów • ${fmtBytes(bytes)} • ${pct}%`);
            });

            if (state.cancelRequested) return;
            setProgress(100, 'Sklejanie segmentów...');
            const blob = new Blob(parts, { type: 'video/mp2t' });
            saveBlob(blob, filename);
            setProgressState(false);
            notify('Film pobrany: ' + filename, 'success', 5000);
        } catch (e) {
            log('Download failed:', e);
            if (e.message !== 'cancelled' && !state.cancelRequested) {
                notify('Błąd pobierania: ' + e.message, 'error');
            }
            setProgressState(false);
        }
    }

    async function openInTab() {
        let url = getSelectedUrl();
        // Otwórz kartę od razu (gest użytkownika), potem nawiguj na świeży URL
        const win = window.open('about:blank', '_blank');
        if (!win) { notify('Nowa karta zablokowana — zezwól na wyskakujące okna dla tej strony', 'warning'); return; }
        try {
            win.document.title = 'Ładowanie strumienia...';
        } catch (e) { /* cross-origin nie ma znaczenia przy about:blank */ }
        if (isHlsUrl(url)) {
            try {
                const pl = await getVariantPlaylist();
                url = pl.url;
            } catch (e) { /* zostaw dotychczasowy URL */ }
        }
        try {
            win.location.href = url;
        } catch (e) {
            window.open(url, '_blank');
        }
        notify('Otwieram strumień. W Edge gra w odtwarzaczu, w Chrome/VLC wklej URL', 'info');
    }

    async function copyUrl() {
        let url = getSelectedUrl();
        if (isHlsUrl(url)) {
            try {
                const pl = await getVariantPlaylist();
                url = pl.url;
            } catch (e) { /* zostaw dotychczasowy URL */ }
        }
        try {
            await navigator.clipboard.writeText(url);
            notify('URL skopiowany (ważny ok. 2 min)', 'success');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            notify('URL skopiowany (ważny ok. 2 min)', 'success');
        }
    }

    async function init() {
        log('Initializing on:', location.href);
        const embedUrl = getEmbedUrl();
        if (!embedUrl) { notify('Nie znaleziono embed URL', 'error'); return; }
        state.embedUrl = embedUrl;
        buildPanel();
        const ok = await refreshEmbed();
        if (!ok) return;
        await loadVariants();
        updateQualityUI();
    }

    GM_addStyle(`
        #thc-downloader { font-family: Arial, sans-serif; }
        .thc-panel {
            background: #1a1a2e; border: 1px solid #e94560; border-radius: 8px;
            padding: 12px 16px; margin: 12px 0; color: #eee; box-shadow: 0 4px 20px rgba(0,0,0,.3);
        }
        .thc-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
        .thc-title { font-weight: 700; font-size: 14px; color: #e94560; }
        .thc-badge {
            background: #16213e; color: #ffa500; border: 1px solid #0f3460;
            border-radius: 10px; padding: 2px 10px; font-size: 12px; font-weight: 600;
        }
        .thc-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .thc-select {
            background: #16213e; color: #eee; border: 1px solid #0f3460; border-radius: 4px;
            padding: 6px 8px; font-size: 12px; font-family: Arial, sans-serif;
        }
        .thc-btns { display: flex; gap: 6px; flex-wrap: wrap; }
        .thc-btn {
            background: #16213e; color: #eee; border: 1px solid #0f3460;
            border-radius: 4px; padding: 6px 12px; cursor: pointer;
            font-size: 12px; transition: background .15s; white-space: nowrap;
            font-family: Arial, sans-serif;
        }
        .thc-btn:hover { background: #0f3460; border-color: #e94560; }
        .thc-btn:active { background: #e94560; }
        .thc-btn-main { background: #e94560; border-color: #e94560; color: #fff; font-weight: 600; }
        .thc-btn-main:hover { background: #ff5a76; border-color: #ff5a76; }
        .thc-btn-cancel { margin-top: 8px; background: #333; border-color: #555; }
        .thc-url {
            margin-top: 8px; font-size: 10px; color: #666; word-break: break-all;
            max-height: 34px; overflow: hidden;
        }
        .thc-progress { margin-top: 10px; }
        .thc-progress-bar { width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden; }
        .thc-progress-fill {
            height: 100%; width: 0%; background: linear-gradient(90deg, #e94560, #ff8a00);
            border-radius: 4px; transition: width .25s;
        }
        .thc-progress-text { font-size: 12px; color: #aaa; margin-top: 6px; }
    `);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }
})();
