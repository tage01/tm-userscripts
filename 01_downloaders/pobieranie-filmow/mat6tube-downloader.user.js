// ==UserScript==
// @name         Mat6Tube Downloader
// @namespace    http://tampermonkey.net/
// @version      1.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/mat6tube-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/mat6tube-downloader.user.js
// @description  Dodaje panel pobierania MP4 na mat6tube.com (window.playlist + oficjalny /download)
// @author       opencode
// @match        *://mat6tube.com/watch/*
// @match        *://*.mat6tube.com/watch/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mat6tube.com
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @connect      mat6tube.com
// @connect      cdn.pvvstream.pro
// @connect      cdn2.pvvstream.pro
// @connect      tr.pvvstream.pro
// @connect      img.pvvstream.pro
// @connect      nmcorp.video
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Jeśli CDN zmieni domenę, dodaj ją do @connect
    // albo tymczasowo ustaw // @connect *

    const PANEL_ID = 'm6t-dl-panel';

    // Kolejność jakości z window.playlist (deterministyczne sortowanie)
    const QUALITY_ORDER = ['1080', '720', '480', '360', '240', '144'];

    // Czyści tytuł do nazwy pliku
    function sanitize(name) {
        return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'mat6tube-video';
    }

    function getTitle() {
        // Tytuł filmu na mat6tube
        const h1 = document.querySelector('.video_info h1');
        if (h1 && h1.textContent.trim()) return sanitize(h1.textContent.trim());
        const og = document.querySelector('meta[property="og:title"]');
        if (og && og.content) return sanitize(og.content);
        return sanitize(document.title.replace(/\s*-\s*BEST XXX TUBE\s*$/i, ''));
    }

    function sortSources(sources) {
        const rank = (l) => {
            const i = QUALITY_ORDER.indexOf(String(l));
            return i === -1 ? 999 : i;
        };
        return sources.slice().sort((a, b) => rank(a.label) - rank(b.label));
    }

    // Szuka źródeł wideo (window.playlist + fallback generyczny)
    function findSources() {
        const out = [];
        const seen = new Set();
        const push = (label, src) => {
            if (src && /^https?:/.test(src) && !seen.has(src)) {
                seen.add(src);
                out.push({ label, src });
            }
        };

        // 1. window.playlist z inline <script> (JW Player 8.34.5, świeże tokeny secure=...)
        //    Format: window.playlist = {"sources":[{"file":".../vid_720p.mp4?secure=...","label":"720"}, ...]}
        document.querySelectorAll('script:not([src])').forEach(el => {
            const txt = el.textContent || '';
            if (!txt.includes('window.playlist')) return;
            const m = txt.match(/window\.playlist\s*=\s*(\{.+?\});/s);
            if (!m) return;
            try {
                const pl = JSON.parse(m[1]);
                if (pl && Array.isArray(pl.sources)) {
                    pl.sources.forEach(s => {
                        if (s && s.file) push(String(s.label || 'mp4') + 'p', s.file);
                    });
                }
            } catch(e) {}
        });

        // 2. Oficjalny endpoint strony (/download/ID?h=...&e=...) - ten sam,
        //    którego używa natywny przycisk playera (window.open(window.downloadUrl))
        document.querySelectorAll('script:not([src])').forEach(el => {
            const m = (el.textContent || '').match(/window\.downloadUrl\s*=\s*"([^"]+)"/);
            if (m) {
                try { push('official', new URL(m[1], location.origin).href); } catch(e) {}
            }
        });

        // 3. Dowolny <video> na stronie (fallback)
        document.querySelectorAll('video[src], video source[src]').forEach(el => {
            let src = el.getAttribute('src');
            if (!src) {
                const inner = el.querySelector('source[src]');
                if (inner) src = inner.getAttribute('src');
            }
            if (src && src.includes('.mp4')) push(el.getAttribute('label') || 'video', src);
        });

        // 4. currentSrc po inicjalizacji playera (anti-leech fallback)
        document.querySelectorAll('video').forEach(v => {
            try {
                const cs = v.currentSrc;
                if (cs && cs.includes('.mp4')) push('currentSrc', cs);
            } catch(e) {}
        });

        // 5. Meta ya:ovs:content_url (/videofile/ID.mp4) - działa tylko z sesją, ostatnia deska
        const meta = document.querySelector('meta[property="ya:ovs:content_url"]');
        if (meta && meta.content) push('meta', meta.content);

        // Oficjalny link na górę, reszta wg jakości
        const official = out.filter(s => s.label === 'official');
        const rest = sortSources(out.filter(s => s.label !== 'official'));
        return [...official, ...rest];
    }

    function createPanel(sources) {
        if (document.getElementById(PANEL_ID)) return;

        const title = getTitle();
        const div = document.createElement('div');
        div.id = PANEL_ID;
        // Nie niszczy layoutu - fixed w rogu
        div.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:999999;background:#111;color:#fff;padding:10px 12px;border-radius:10px;font:13px/1.4 Arial,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:320px;';

        const opts = sources.map((s,i) => {
            let fname = s.src;
            try { fname = new URL(s.src).pathname.split('/').pop() || s.src; } catch(e) {}
            return `<option value="${i}">${s.label} - ${fname}</option>`;
        }).join('');

        div.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">' +
                `<b>Mat6Tube DL (${sources.length})</b>` +
                '<button id="m6t-x" style="background:#333;color:#fff;border:0;border-radius:6px;padding:2px 8px;cursor:pointer;">X</button>' +
            '</div>' +
            `<div style="font-size:12px;opacity:.8;margin-bottom:6px;word-break:break-word;">${title}</div>` +
            (sources.length > 1 ? `<select id="m6t-q" style="width:100%;margin-bottom:6px;">${opts}</select>` : '') +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button id="m6t-dl" style="flex:1;background:#e840cc;color:#fff;border:0;border-radius:6px;padding:6px;cursor:pointer;">Pobierz</button>' +
                '<button id="m6t-open" style="flex:1;background:#444;color:#fff;border:0;border-radius:6px;padding:6px;cursor:pointer;">Otwórz</button>' +
                '<button id="m6t-copy" style="flex:1;background:#444;color:#fff;border:0;border-radius:6px;padding:6px;cursor:pointer;">Kopiuj URL</button>' +
            '</div>' +
            '<div id="m6t-status" style="font-size:12px;margin-top:6px;opacity:.8;"></div>';
        document.body.appendChild(div);

        const getSel = () => {
            const sel = document.getElementById('m6t-q');
            return sources[sel ? +sel.value : 0];
        };
        const status = (t) => { document.getElementById('m6t-status').textContent = t; };

        document.getElementById('m6t-x').onclick = () => div.remove();

        document.getElementById('m6t-dl').onclick = () => {
            const s = getSel();
            const fname = `${title} [${s.label}].mp4`;
            status('Pobieranie: ' + fname);
            try {
                GM_download({ url: s.src, name: fname, saveAs: true,
                    onload: () => status('Zapisano.'),
                    onerror: () => { status('GM_download błąd, otwieram w karcie...'); window.open(s.src, '_blank'); },
                    ontimeout: () => status('Timeout.')
                });
            } catch(e) {
                window.open(s.src, '_blank');
            }
        };

        document.getElementById('m6t-open').onclick = () => {
            // Otworzenie w nowej karcie wymaga gestu użytkownika - dlatego przycisk, nie automat
            window.open(getSel().src, '_blank');
        };

        document.getElementById('m6t-copy').onclick = async () => {
            const url = getSel().src;
            try { GM_setClipboard(url); status('Skopiowano URL.'); }
            catch(e) {
                try { await navigator.clipboard.writeText(url); status('Skopiowano URL.'); }
                catch(e2) { prompt('Skopiuj URL:', url); }
            }
        };

        GM_registerMenuCommand('Pobierz Mat6Tube', () => document.getElementById('m6t-dl').click());
    }

    // Czeka na player (JW ładuje window.playlist z opóźnieniem) - MutationObserver + polling
    let tries = 0;
    function scan() {
        tries++;
        const srcs = findSources();
        if (srcs.length) {
            createPanel(srcs);
            return true;
        }
        if (tries < 40) setTimeout(scan, 750); // ~30s
        else console.log('[M6T-DL] nie znaleziono źródeł na tej stronie');
        return false;
    }

    new MutationObserver(() => {
        if (!document.getElementById(PANEL_ID) && findSources().length) scan();
    }).observe(document.documentElement, { childList: true, subtree: true });

    setTimeout(scan, 800);
})();
