// ==UserScript==
// @name         PornX Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/pornx-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/pornx-downloader.user.js
// @description  Pobiera wideo z pornx.to — wyciąga embed luluvdo/luluvido, rozpakowuje JW Player (Dean Edwards packer) i skleja segmenty HLS (AES-128 / fMP4) do pliku .ts/.mp4
// @author       opencode
// @match        *://pornx.to/*
// @match        *://*.pornx.to/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pornx.to
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @connect      pornx.to
// @connect      luluvdo.com
// @connect      luluvido.com
// @connect      luluvid.com
// @connect      lulucdn.com
// @connect      cdn-tnmr.org
// @connect      *
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // Porządki: strona pornx.to (motyw vidorev) osadza film przez iframe luluvdo,
    // a luluvdo serwuje JW Player z HLS (master.m3u8) spakowanym packerem Dean Edwards.
    // Mechanizm 1:1 z pornhoarder-dl v1.10.0 (deobfuscatePacked + downloadHls z AES-128/EXT-X-MAP).

    const log = (...a) => console.log('[PX]', ...a);
    const qs = (s, r) => (r || document).querySelector(s);

    const state = {
        postId: null,
        luluvdoUrl: null,
        masterUrl: null,
        variants: [],
        qualityIndex: 0,
        title: 'video',
        ui: {},
    };

    let pxReqs = [];       // aktywne requesty (do abort)
    let pxCancelled = false;

    // ---------------------------------------------------------------- powiadomienia

    function notify(msg, type = 'info', ms = 4000) {
        const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336', warning: '#ff9800' };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;transition:opacity .4s;font-family:Arial,sans-serif;pointer-events:none;';
        el.innerHTML = `<div style="background:${colors[type] || colors.info};color:#fff;padding:10px 18px;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.4);font-size:13px;max-width:420px;">${msg}</div>`;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ms);
    }

    const errMsg = (e) => {
        if (!e) return 'błąd pobierania';
        if (typeof e === 'string') return e;
        if (e.message) return String(e.message);
        if (e.error) return String(e.error) + (e.details ? ' (' + e.details + ')' : '');
        if (e.details) return String(e.details);
        if (e.status) return 'HTTP ' + e.status;
        try { return JSON.stringify(e); } catch (_) { return 'błąd pobierania'; }
    };

    function fmtSize(b) {
        if (!b && b !== 0) return '?';
        const u = ['B', 'KB', 'MB', 'GB'];
        let i = 0, s = b;
        while (s >= 1024 && i < 3) { s /= 1024; i++; }
        return s.toFixed(i > 0 ? 1 : 0) + ' ' + u[i];
    }

    // ---------------------------------------------------------------- GM fetch

    function gmFetch(url, headers) {
        return new Promise((ok, fail) => {
            const req = GM_xmlhttpRequest({
                method: 'GET', url,
                headers: headers || {},
                onload: (r) => {
                    pxReqs = pxReqs.filter((x) => x !== req);
                    if (r.status >= 200 && r.status < 300) ok(r.responseText !== undefined ? r.responseText : r.response);
                    else fail('HTTP ' + r.status);
                },
                onerror: (e) => { pxReqs = pxReqs.filter((x) => x !== req); fail(errMsg(e)); },
                ontimeout: () => { pxReqs = pxReqs.filter((x) => x !== req); fail('Timeout'); },
            });
            pxReqs.push(req);
        });
    }

    function gmFetchBlob(url, headers) {
        return new Promise((ok, fail) => {
            const req = GM_xmlhttpRequest({
                method: 'GET', url, responseType: 'blob',
                headers: headers || {},
                onload: (r) => {
                    pxReqs = pxReqs.filter((x) => x !== req);
                    if (r.status && r.status !== 200) fail('HTTP ' + r.status);
                    else ok(r.response);
                },
                onerror: (e) => { pxReqs = pxReqs.filter((x) => x !== req); fail(errMsg(e)); },
                ontimeout: () => { pxReqs = pxReqs.filter((x) => x !== req); fail('Timeout'); },
            });
            pxReqs.push(req);
        });
    }

    // Binarne dane jako ArrayBuffer - wymagane przez WebCrypto przy odszyfrowaniu AES-128.
    function gmFetchBin(url, headers) {
        return new Promise((ok, fail) => {
            const req = GM_xmlhttpRequest({
                method: 'GET', url, responseType: 'arraybuffer',
                headers: headers || {},
                onload: (r) => {
                    pxReqs = pxReqs.filter((x) => x !== req);
                    if (r.status && r.status !== 200) fail('HTTP ' + r.status);
                    else if (!r.response) fail('Brak danych');
                    else ok(r.response);
                },
                onerror: (e) => { pxReqs = pxReqs.filter((x) => x !== req); fail(errMsg(e)); },
                ontimeout: () => { pxReqs = pxReqs.filter((x) => x !== req); fail('Timeout'); },
            });
            pxReqs.push(req);
        });
    }

    const headersFor = (ref) => ({ Referer: ref || location.href });

    // ---------------------------------------------------------------- dane strony

    function getPostId() {
        const m = document.body.className.match(/postid-(\d+)/);
        if (m) return m[1];
        const short = qs('link[rel="shortlink"]');
        if (short) {
            const p = short.href.match(/[?&]p=(\d+)/);
            if (p) return p[1];
        }
        const emb = qs('iframe[src*="embed.php?video="]');
        if (emb) {
            const v = emb.src.match(/[?&]video=(\d+)/);
            if (v) return v[1];
        }
        return null;
    }

    function getTitle() {
        const h1 = qs('h1.entry-title');
        if (h1 && h1.textContent.trim()) return cleanTitle(h1.textContent);
        const og = qs('meta[property="og:title"]');
        if (og && og.content) return cleanTitle(og.content.replace(/\s*\|\s*PornX\s*$/i, ''));
        return 'video';
    }

    function cleanTitle(t) {
        return t.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').slice(0, 100);
    }

    // Szuka URL embeda luluvdo/luluvido: iframe w DOM -> surowy HTML strony -> api.php?video=ID.
    async function findLuluvdoUrl() {
        const iframe = qs('iframe[src*="luluvdo.com"], iframe[src*="lulustream.com"], iframe[src*="luluvido.com"], iframe[src*="luluvid.com"]');
        if (iframe && iframe.src) return iframe.src;
        const html = document.documentElement.innerHTML;
        let m = html.match(/https?:\/\/(?:www\.)?(?:luluvdo|lulustream|luluvido|luluvid)\.com\/e\/[A-Za-z0-9]+/);
        if (m) return m[0];
        if (state.postId) {
            try {
                const api = await gmFetch(`https://pornx.to/api.php?video=${state.postId}`, headersFor(location.href));
                const m2 = api && api.match(/https?:\/\/(?:www\.)?(?:luluvdo|lulustream|luluvido|luluvid)\.com\/e\/[A-Za-z0-9]+/);
                if (m2) return m2[0];
            } catch (e) { log('api.php blad:', errMsg(e)); }
        }
        return null;
    }

    // ---------------------------------------------------------------- Dean Edwards packer
    // Wariant prosty (luluvdo/JW Player), bez eval — port 1:1 z pornhoarder-dl v1.9.7:
    // eval(function(p,a,c,k,e,d){...}('PAYLOAD',A,C,'K0|K1'.split('|')))  (4-arg)
    // lub ...,'K0|K1'.split('|'),0,{}))  (6-arg)

    function deobfuscatePacked(html) {
        if (!html || html.indexOf('eval(function') === -1) return html;
        // Czytaj string JS (ze \escape) od pozycji st; zwroc [wartosc, endIdx]
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
            // zbilansowana klamra ciala
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
            // Koniec wyrazenia eval: bilans nawiasow od zamkniecia kluczy
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
            // symbol = liczba w bazie a (odpowiednik c.toString(a))
            const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const toBase = (n) => {
                if (n === 0) return '0';
                let s = '';
                while (n > 0) { s = DIGITS[n % a] + s; n = Math.floor(n / a); }
                return s;
            };
            let out = payload;
            for (let n = c - 1; n >= 0; n--) {
                const w = keys[n];
                if (!w) continue;
                const sym = toBase(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp('\\b' + sym + '\\b', 'g');
                out = out.replace(re, () => w);
            }
            // hex-escape'y (\xNN) potrafia pojawic sie w URL-ach
            out = out.replace(/\\x([0-9a-fA-F]{2})/g, (mm, h) => String.fromCharCode(parseInt(h, 16)));
            text = text.slice(0, head) + out + text.slice(end);
            log('deobfuscatePacked: rozlozono packer (a=' + a + ', c=' + c + ')');
        }
        return text;
    }

    // ---------------------------------------------------------------- HLS helpers

    const absHls = (rel, base) => {
        try { return new URL(rel, base).href; } catch (e) { return rel; }
    };

    function extractMasterUrl(cleanHtml) {
        let m = cleanHtml.match(/["']?(?:source|file|hls|playlist)["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"']*)/i);
        if (m) return m[1];
        m = cleanHtml.match(/["']?file["']?\s*:\s*["'](https?:\/\/[^"']+\.(mp4|m3u8)[^"']*)/i);
        if (m) return m[1];
        m = cleanHtml.match(/(https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*)/);
        if (m) return m[1];
        return null;
    }

    // Parsuj master.m3u8 -> [{bandwidth, height, uri}] od najwyzszej jakosci
    function parseVariants(text, base) {
        const lines = text.split(/\r?\n/);
        const variants = [];
        let cur = null;
        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            if (t.startsWith('#EXT-X-STREAM-INF')) {
                const bw = t.match(/BANDWIDTH=(\d+)/);
                const res = t.match(/RESOLUTION=(\d+)x(\d+)/);
                cur = { bandwidth: bw ? parseInt(bw[1], 10) : 0, height: res ? parseInt(res[2], 10) : 0, uri: null };
            } else if (!t.startsWith('#') && cur) {
                cur.uri = absHls(t, base);
                variants.push(cur);
                cur = null;
            }
        }
        variants.sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));
        return variants;
    }

    // ---------------------------------------------------------------- HLS: AES-128 + EXT-X-MAP

    // Lista atrybutow HLS: KEY=VALUE, VALUE moze byc w cudzyslowie.
    const hlsAttrs = (line) => {
        const attrs = {};
        const re = /([A-Za-z0-9-]+)=("[^"]*"|[^,]*)/g;
        let m;
        while ((m = re.exec(line))) {
            let v = m[2].trim();
            if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1);
            attrs[m[1].toUpperCase()] = v;
        }
        return attrs;
    };

    // "0x0123..." -> Uint8Array; null gdy zapis nieprawidlowy.
    const hexToBytes = (hex) => {
        const h = String(hex).replace(/^0x/i, '');
        if (!h.length || h.length % 2 || !/^[0-9a-f]+$/i.test(h)) return null;
        const out = new Uint8Array(h.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
        return out;
    };

    const webCrypto = () => (typeof window !== 'undefined' && window.crypto) || (typeof crypto !== 'undefined' ? crypto : null);

    // IV segmentu: atrybut IV z EXT-X-KEY albo numer sekwencji (128-bit big-endian).
    const hlsIv = (seg) => {
        if (seg.key && seg.key.iv) {
            const b = hexToBytes(seg.key.iv);
            if (b && b.length === 16) return b;
            throw new Error('Nieprawidlowy IV w EXT-X-KEY: ' + seg.key.iv);
        }
        const iv = new Uint8Array(16);
        let n = Number(seg.seq) || 0;
        for (let i = 15; i >= 12 && n > 0; i--) { iv[i] = n & 0xff; n = Math.floor(n / 256); }
        return iv;
    };

    // AES-128-CBC; WebCrypto sam zdejmuje padding PKCS#7.
    const hlsDecrypt = (buf, key, iv) => {
        const c = webCrypto();
        if (!c || !c.subtle) return Promise.reject(new Error('Brak WebCrypto (crypto.subtle)'));
        return c.subtle.decrypt({ name: 'AES-CBC', iv }, key, buf);
    };

    // Klucz AES-128 z URI (cache - zwykle jeden klucz na cala playliste).
    const importAesKey = async (uri, headers, cache) => {
        if (cache.has(uri)) return cache.get(uri);
        const c = webCrypto();
        if (!c || !c.subtle) throw new Error('Brak WebCrypto (crypto.subtle)');
        const buf = await gmFetchBin(uri, headers);
        if (!buf || buf.byteLength !== 16) {
            throw new Error('Klucz AES-128: oczekiwano 16 B, otrzymano ' + (buf ? buf.byteLength : 0) + ' B');
        }
        const k = await c.subtle.importKey('raw', buf, { name: 'AES-CBC' }, false, ['decrypt']);
        cache.set(uri, k);
        return k;
    };

    // Media playlista -> segmenty z kluczem/IV per segment + init segment (EXT-X-MAP).
    function parseMediaPlaylist(text, base) {
        const out = { segments: [], map: null };
        let seq = 0;
        let key = null;
        for (const raw of text.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line) continue;
            if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
                seq = parseInt(line.slice(line.indexOf(':') + 1), 10) || 0;
                continue;
            }
            if (line.startsWith('#EXT-X-KEY:')) {
                const a = hlsAttrs(line);
                const method = (a.METHOD || 'NONE').toUpperCase();
                if (a.KEYFORMAT && a.KEYFORMAT.toLowerCase() !== 'identity') {
                    throw new Error('HLS z KEYFORMAT=' + a.KEYFORMAT + ' (DRM) - nie obslugiwane');
                }
                if (method === 'NONE') key = null;
                else if (method === 'AES-128') key = { method, uri: absHls(a.URI || '', base), iv: a.IV || null };
                else throw new Error('HLS z szyfrowaniem ' + method + ' - obslugiwane tylko AES-128');
                continue;
            }
            if (line.startsWith('#EXT-X-MAP:')) {
                const a = hlsAttrs(line);
                if (a.URI) out.map = { uri: absHls(a.URI, base), key };
                continue;
            }
            if (line.startsWith('#')) continue;
            out.segments.push({ url: absHls(line, base), seq, key });
            seq++;
        }
        return out;
    }

    function variantLabel(v) {
        if (v.height) return v.height + 'p';
        if (v.bandwidth) return Math.round(v.bandwidth / 1000) + ' kbps';
        return 'Auto';
    }

    const isHls = (u) => /\.m3u8(\?|$|#)/i.test(u || '');

    // ---------------------------------------------------------------- logika zrodel

    // Pobiera strone embeda -> master URL (zawsze swiezy token)
    async function resolveMaster() {
        const html = await gmFetch(state.luluvdoUrl, headersFor(location.href));
        const clean = deobfuscatePacked(html);
        const url = extractMasterUrl(clean);
        if (!url) throw new Error('Nie znaleziono strumienia na stronie embeda');
        state.masterUrl = url;
        log('Master URL:', url);
        return url;
    }

    async function loadVariants() {
        const text = await gmFetch(state.masterUrl, headersFor(state.luluvdoUrl));
        state.variants = parseVariants(text, state.masterUrl);
        log('Warianty:', state.variants.map(variantLabel).join(', ') || '(playlista prosta)');
    }

    // Swieza playlista wariantu w momencie kliku (token mogl wygasnac)
    async function getVariantPlaylist() {
        try {
            const masterText = await gmFetch(state.masterUrl, headersFor(state.luluvdoUrl));
            const variants = parseVariants(masterText, state.masterUrl);
            if (!variants.length) return { url: state.masterUrl, text: masterText, label: 'Auto' };
            const v = variants[state.qualityIndex] || variants[0];
            const text = await gmFetch(v.uri, headersFor(state.luluvdoUrl));
            return { url: v.uri, text, label: variantLabel(v) };
        } catch (e) {
            // token wygasl — odswiez embed i sprobuj raz jeszcze
            log('Odswiezam embed:', errMsg(e));
            await resolveMaster();
            const masterText = await gmFetch(state.masterUrl, headersFor(state.luluvdoUrl));
            const variants = parseVariants(masterText, state.masterUrl);
            if (!variants.length) return { url: state.masterUrl, text: masterText, label: 'Auto' };
            const v = variants[state.qualityIndex] || variants[0];
            const text = await gmFetch(v.uri, headersFor(state.luluvdoUrl));
            return { url: v.uri, text, label: variantLabel(v) };
        }
    }

    // ---------------------------------------------------------------- UI

    function buildPanel() {
        const box = document.createElement('div');
        box.id = 'px-downloader';
        box.innerHTML = `
            <div class="px-panel">
                <div class="px-head">
                    <span class="px-title">▼ PornX Downloader</span>
                    <span class="px-badge" id="px-badge">...</span>
                </div>
                <div class="px-row">
                    <select class="px-select" id="px-quality" title="Wybierz jakość"></select>
                    <div class="px-btns">
                        <button class="px-btn px-btn-main" id="px-dl" title="Pobierz i sklej segmenty HLS (AES-128 / fMP4) do pliku .ts/.mp4">Pobierz film</button>
                        <button class="px-btn" id="px-open" title="Otwórz strumień w nowej karcie">Otwórz w karcie</button>
                        <button class="px-btn" id="px-copy" title="Kopiuj URL strumienia (token czasowy)">Kopiuj URL</button>
                    </div>
                </div>
                <div class="px-url" id="px-url"></div>
                <div class="px-progress" id="px-progress" style="display:none;">
                    <div class="px-progress-bar"><div class="px-progress-fill" id="px-fill"></div></div>
                    <div class="px-progress-text" id="px-progress-text"></div>
                    <button class="px-btn px-btn-cancel" id="px-cancel">Anuluj</button>
                </div>
            </div>`;

        const anchor = qs('.single-player-video-wrapper') || qs('.single-post-video-player-content') || qs('h1.entry-title');
        if (anchor) anchor.parentNode.insertBefore(box, anchor.nextSibling);
        else document.body.insertBefore(box, document.body.firstChild);

        state.ui = {
            badge: box.querySelector('#px-badge'),
            quality: box.querySelector('#px-quality'),
            dl: box.querySelector('#px-dl'),
            open: box.querySelector('#px-open'),
            copy: box.querySelector('#px-copy'),
            url: box.querySelector('#px-url'),
            progress: box.querySelector('#px-progress'),
            fill: box.querySelector('#px-fill'),
            progressText: box.querySelector('#px-progress-text'),
            cancel: box.querySelector('#px-cancel'),
        };

        state.ui.quality.addEventListener('change', () => {
            state.qualityIndex = parseInt(state.ui.quality.value, 10) || 0;
            updateUrlLine();
        });
        state.ui.dl.addEventListener('click', startDownload);
        state.ui.open.addEventListener('click', openInTab);
        state.ui.copy.addEventListener('click', copyUrl);
        state.ui.cancel.addEventListener('click', () => {
            pxCancelled = true;
            pxReqs.forEach((r) => { try { r.abort(); } catch (e) {} });
            pxReqs = [];
            setProgressState(false);
            notify('Anulowano pobieranie', 'warning');
        });

        GM_addStyle(`
            #px-downloader { font-family: Arial, sans-serif; }
            .px-panel {
                background: #1a1a2e; border: 1px solid #e94560; border-radius: 8px;
                padding: 12px 16px; margin: 12px 0; color: #eee; box-shadow: 0 4px 20px rgba(0,0,0,.3);
            }
            .px-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
            .px-title { font-weight: 700; font-size: 14px; color: #e94560; }
            .px-badge {
                background: #16213e; color: #ffa500; border: 1px solid #0f3460;
                border-radius: 10px; padding: 2px 10px; font-size: 12px; font-weight: 600;
            }
            .px-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
            .px-select {
                background: #16213e; color: #eee; border: 1px solid #0f3460; border-radius: 4px;
                padding: 6px 8px; font-size: 12px; font-family: Arial, sans-serif;
            }
            .px-btns { display: flex; gap: 6px; flex-wrap: wrap; }
            .px-btn {
                background: #16213e; color: #eee; border: 1px solid #0f3460;
                border-radius: 4px; padding: 6px 12px; cursor: pointer;
                font-size: 12px; transition: background .15s; white-space: nowrap;
                font-family: Arial, sans-serif;
            }
            .px-btn:hover { background: #0f3460; border-color: #e94560; }
            .px-btn:active { background: #e94560; }
            .px-btn-main { background: #e94560; border-color: #e94560; color: #fff; font-weight: 600; }
            .px-btn-main:hover { background: #ff5a76; border-color: #ff5a76; }
            .px-btn-cancel { margin-top: 8px; background: #333; border-color: #555; }
            .px-url {
                margin-top: 8px; font-size: 10px; color: #666; word-break: break-all;
                max-height: 34px; overflow: hidden;
            }
            .px-progress { margin-top: 10px; }
            .px-progress-bar { width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden; }
            .px-progress-fill {
                height: 100%; width: 0%; background: linear-gradient(90deg, #e94560, #ff8a00);
                border-radius: 4px; transition: width .25s;
            }
            .px-progress-text { font-size: 12px; color: #aaa; margin-top: 6px; }
        `);
    }

    function setProgressState(show) {
        state.ui.progress.style.display = show ? 'block' : 'none';
    }

    function setProgress(pct, text) {
        state.ui.fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
        state.ui.progressText.textContent = text;
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
        } else {
            state.ui.quality.style.display = 'none';
            state.ui.badge.textContent = isHls(state.masterUrl) ? 'HLS' : 'MP4';
        }
        updateUrlLine();
    }

    function updateUrlLine() {
        const v = state.variants[state.qualityIndex];
        const url = (v && v.uri) || state.masterUrl || '';
        state.ui.url.textContent = url;
        state.ui.url.title = url;
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

    // ---------------------------------------------------------------- pobieranie

    async function startDownload() {
        if (!state.masterUrl) { notify('Brak URL wideo', 'error'); return; }
        pxCancelled = false;
        setProgressState(true);
        setProgress(0, 'Przygotowanie...');

        try {
            if (!isHls(state.masterUrl)) {
                const blob = await gmFetchBlob(state.masterUrl, headersFor(state.luluvdoUrl));
                if (pxCancelled) return;
                setProgress(100, 'Gotowe');
                saveBlob(blob, state.title + '.mp4');
                notify('Film pobrany', 'success');
                setProgressState(false);
                return;
            }

            let playlist;
            try {
                playlist = await getVariantPlaylist();
            } catch (e) {
                log('Variant fetch failed:', e);
                notify('Nie udało się pobrać listy segmentów: ' + errMsg(e), 'error');
                setProgressState(false);
                return;
            }

            // Playlista z kluczami AES-128 / EXT-X-MAP (klucz moze sie zmieniac w trakcie)
            let pl;
            try {
                pl = parseMediaPlaylist(playlist.text, playlist.url);
            } catch (e) {
                notify(errMsg(e), 'error', 6000);
                setProgressState(false);
                return;
            }
            if (!pl.segments.length) {
                notify('Playlista nie zawiera segmentów', 'error');
                setProgressState(false);
                return;
            }

            const res = await downloadSegments(pl);
            if (pxCancelled) return;
            setProgress(100, 'Sklejanie segmentów...');
            // fMP4 (EXT-X-MAP) wymaga init segmentu na poczatku pliku
            const pieces = (res.isMp4 ? [res.init] : []).concat(res.parts);
            const ext = res.isMp4 ? '.mp4' : '.ts';
            const filename = `${state.title}_${playlist.label}${ext}`;
            saveBlob(new Blob(pieces, { type: res.isMp4 ? 'video/mp4' : 'video/mp2t' }), filename);
            setProgressState(false);
            notify('Film pobrany: ' + filename, 'success', 5000);
        } catch (e) {
            log('Download failed:', e);
            if (!pxCancelled) {
                const m = errMsg(e);
                if (/40[13]|HTTP 403/.test(m)) notify('Link wygasl (HTTP 403) — odśwież stronę i spróbuj ponownie', 'error', 6000);
                else notify('Błąd pobierania: ' + m, 'error');
            }
            setProgressState(false);
        }
    }

    // Pobiera segmenty (z odszyfrowaniem AES-128) + init segment EXT-X-MAP.
    // Zwraca { parts, init, isMp4 }.
    async function downloadSegments(playlist) {
        const items = playlist.segments;
        const headers = headersFor(state.luluvdoUrl);
        const keyCache = new Map();
        const CONCURRENCY = 5;

        const fetchPart = async (item) => {
            const buf = await gmFetchBin(item.url, headers);
            if (!item.key) return buf;
            const key = await importAesKey(item.key.uri, headers, keyCache);
            try {
                return await hlsDecrypt(buf, key, hlsIv(item));
            } catch (e) {
                throw new Error('Odszyfrowanie AES-128 nieudane (' + String(item.url).slice(-48) + ')');
            }
        };

        let init = null;
        if (playlist.map && playlist.map.uri) {
            setProgress(0, 'Pobieranie init segmentu (EXT-X-MAP)...');
            init = await fetchPart({
                url: playlist.map.uri,
                key: playlist.map.key,
                // Bez IV w EXT-X-KEY obowiazuje numer sekwencji pierwszego segmentu.
                seq: playlist.map.key && playlist.map.key.iv ? 0 : items[0].seq,
            });
        }

        const parts = new Array(items.length);
        let next = 0, done = 0, bytes = 0;
        const worker = async () => {
            while (!pxCancelled) {
                const i = next++;
                if (i >= items.length) return;
                const buf = await fetchPart(items[i]);
                parts[i] = buf;
                done++;
                bytes += buf.byteLength;
                const pct = Math.round((done / items.length) * 100);
                setProgress(pct, `${done} / ${items.length} segmentów • ${fmtSize(bytes)} • ${pct}%`);
            }
        };
        const workers = [];
        for (let w = 0; w < Math.min(CONCURRENCY, items.length); w++) workers.push(worker());
        try {
            await Promise.all(workers);
        } catch (e) {
            // przerwij pozostale requesty, zeby nie pobierac reszty po bledzie
            pxReqs.forEach((r) => { try { r.abort(); } catch (_) {} });
            pxReqs = [];
            throw e;
        }
        return { parts, init, isMp4: !!init };
    }

    async function openInTab() {
        const win = window.open('about:blank', '_blank');
        if (!win) { notify('Nowa karta zablokowana — zezwól na wyskakujące okna', 'warning'); return; }
        let url = state.masterUrl;
        if (isHls(url)) {
            try { url = (await getVariantPlaylist()).url; } catch (e) { /* zostaw master */ }
        }
        try { win.location.href = url; }
        catch (e) { window.open(url, '_blank'); }
        notify('Otwieram strumień w nowej karcie', 'info');
    }

    async function copyUrl() {
        let url = state.masterUrl;
        if (isHls(url)) {
            try { url = (await getVariantPlaylist()).url; } catch (e) { /* zostaw master */ }
        }
        try {
            await navigator.clipboard.writeText(url);
            notify('URL skopiowany (token czasowy — użyj od razu)', 'success');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (_) {}
            ta.remove();
            notify('URL skopiowany (token czasowy — użyj od razu)', 'success');
        }
    }

    // ---------------------------------------------------------------- init

    async function init() {
        log('Start:', location.href);
        state.postId = getPostId();
        state.title = getTitle();
        state.luluvdoUrl = await findLuluvdoUrl();
        if (!state.luluvdoUrl) {
            log('Brak embeda luluvdo — skrypt nieaktywny na tej podstronie');
            return;
        }
        log('Embed:', state.luluvdoUrl);
        buildPanel();
        state.ui.badge.textContent = 'łączenie...';
        GM_registerMenuCommand('Pobierz film (PornX)', startDownload);
        try {
            await resolveMaster();
            await loadVariants();
            updateQualityUI();
        } catch (e) {
            log('Init failed:', e);
            state.ui.badge.textContent = 'błąd';
            notify('Nie udało się odczytać strumienia: ' + errMsg(e), 'error');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 800));
    } else {
        setTimeout(init, 800);
    }
})();
