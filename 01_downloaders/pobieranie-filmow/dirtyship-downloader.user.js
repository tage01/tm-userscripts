// ==UserScript==
// @name         DirtyShip Downloader
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/dirtyship-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/dirtyship-downloader.user.js
// @description  Dodaje panel pobierania MP4 na dirtyship.com (FluidPlayer video#fp-video-0)
// @author       You
// @match        https://dirtyship.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=dirtyship.com
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @connect      dirtyship.com
// @connect      dirtyship.net
// @connect      cdn10.dirtyship.net
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Jeśli CDN zmieni numer (cdn11, cdn12...), dodaj go do @connect
    // albo tymczasowo ustaw // @connect *

    const PANEL_ID = 'ds-dl-panel';

    // Czyści tytuł do nazwy pliku
    function sanitize(name) {
        return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'dirtyship-video';
    }

    function getTitle() {
        // Tytuł filmu na dirtyship
        const h1 = document.querySelector('h1.singletitle');
        if (h1 && h1.textContent.trim()) return sanitize(h1.textContent.trim());
        const og = document.querySelector('meta[property="og:title"]');
        if (og && og.content) return sanitize(og.content);
        return sanitize(document.title.replace(/ - DirtyShip.*$/i, ''));
    }

    // Szuka źródeł wideo (FluidPlayer + fallback generyczny)
    function findSources() {
        const out = [];
        const seen = new Set();

        // 1. Główny player dirtyship
        document.querySelectorAll('#fp-video-0 source[src], video#fp-video-0 source[src]').forEach(s => {
            const src = s.getAttribute('src');
            if (src && !seen.has(src)) {
                seen.add(src);
                out.push({ label: s.getAttribute('title') || 'default', src });
            }
        });

        // 2. Dowolny <video> na stronie (fallback)
        document.querySelectorAll('video[src], video source[src]').forEach(el => {
            let src = el.getAttribute('src');
            if (!src) {
                const inner = el.querySelector('source[src]');
                if (inner) src = inner.getAttribute('src');
            }
            // pomijamy miniatury / reklamy vast
            if (src && src.includes('.mp4') && !seen.has(src)) {
                seen.add(src);
                out.push({ label: el.getAttribute('title') || 'video', src });
            }
        });

        // 3. currentSrc po inicjalizacji playera (anti-leech fallback)
        document.querySelectorAll('video').forEach(v => {
            try {
                const cs = v.currentSrc;
                if (cs && cs.includes('.mp4') && !seen.has(cs)) {
                    seen.add(cs);
                    out.push({ label: 'currentSrc', src: cs });
                }
            } catch(e) {}
        });

        return out;
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
            try { fname = new URL(s.src).pathname.split('/').pop(); } catch(e) {}
            return `<option value="${i}">${s.label} - ${fname}</option>`;
        }).join('');

        div.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">' +
                `<b>DirtyShip DL (${sources.length})</b>` +
                '<button id="ds-x" style="background:#333;color:#fff;border:0;border-radius:6px;padding:2px 8px;cursor:pointer;">X</button>' +
            '</div>' +
            `<div style="font-size:12px;opacity:.8;margin-bottom:6px;word-break:break-word;">${title}</div>` +
            (sources.length > 1 ? `<select id="ds-q" style="width:100%;margin-bottom:6px;">${opts}</select>` : '') +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button id="ds-dl" style="flex:1;background:#e840cc;color:#fff;border:0;border-radius:6px;padding:6px;cursor:pointer;">Pobierz</button>' +
                '<button id="ds-open" style="flex:1;background:#444;color:#fff;border:0;border-radius:6px;padding:6px;cursor:pointer;">Otwórz</button>' +
                '<button id="ds-copy" style="flex:1;background:#444;color:#fff;border:0;border-radius:6px;padding:6px;cursor:pointer;">Kopiuj URL</button>' +
            '</div>' +
            '<div id="ds-status" style="font-size:12px;margin-top:6px;opacity:.8;"></div>';
        document.body.appendChild(div);

        const getSel = () => {
            const sel = document.getElementById('ds-q');
            return sources[sel ? +sel.value : 0];
        };
        const status = (t) => { document.getElementById('ds-status').textContent = t; };

        document.getElementById('ds-x').onclick = () => div.remove();

        document.getElementById('ds-dl').onclick = () => {
            const s = getSel();
            const fname = `${title}.mp4`;
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

        document.getElementById('ds-open').onclick = () => {
            // Otworzenie w nowej karcie wymaga gestu użytkownika - dlatego przycisk, nie automat
            window.open(getSel().src, '_blank');
        };

        document.getElementById('ds-copy').onclick = async () => {
            const url = getSel().src;
            try { GM_setClipboard(url); status('Skopiowano URL.'); }
            catch(e) {
                try { await navigator.clipboard.writeText(url); status('Skopiowano URL.'); }
                catch(e2) { prompt('Skopiuj URL:', url); }
            }
        };

        GM_registerMenuCommand('Pobierz DirtyShip', () => document.getElementById('ds-dl').click());
    }

    // Czeka na player (FluidPlayer ładuje się z opóźnieniem) - MutationObserver + polling
    let tries = 0;
    function scan() {
        tries++;
        const srcs = findSources();
        if (srcs.length) {
            createPanel(srcs);
            return true;
        }
        if (tries < 40) setTimeout(scan, 750); // ~30s
        else console.log('[DS-DL] nie znaleziono <video> na tej stronie');
        return false;
    }

    new MutationObserver(() => {
        if (!document.getElementById(PANEL_ID) && findSources().length) scan();
    }).observe(document.documentElement, { childList: true, subtree: true });

    setTimeout(scan, 800);
})();
