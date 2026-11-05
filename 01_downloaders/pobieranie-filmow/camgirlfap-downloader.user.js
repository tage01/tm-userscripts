// ==UserScript==
// @name         CamGirlFap Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/camgirlfap-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/camgirlfap-downloader.user.js
// @description  Pobiera wideo z camgirlfap.com - wyciaga URL z flashvars (kt_player / KVS) i pobiera przez GM_xmlhttpRequest z paskiem postepu
// @author       opencode
// @match        *://camgirlfap.com/video/*
// @match        *://*.camgirlfap.com/video/*
// @match        *://camgirlfap.com/embed/*
// @match        *://*.camgirlfap.com/embed/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=camgirlfap.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @connect      camgirlfap.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    let currentRequest = null;
    let progressEl = null;

    GM_addStyle(`
        .cgf-dl-panel {
            position: absolute; z-index: 99999; pointer-events: auto;
            top: 10px; right: 10px; display: flex; gap: 6px; flex-direction: column;
            font-family: Arial, sans-serif;
        }
        .cgf-dl-btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            padding: 8px 14px; border: none; border-radius: 8px; cursor: pointer;
            font-size: 13px; font-weight: 600; font-family: Arial, sans-serif;
            color: #fff; background: linear-gradient(135deg, #ff6b35, #e91e63);
            box-shadow: 0 2px 12px rgba(233,30,99,0.4);
            transition: all 0.2s ease; backdrop-filter: blur(4px); user-select: none;
        }
        .cgf-dl-btn:hover { transform: scale(1.05); }
        .cgf-dl-btn:active { transform: scale(0.95); }
        .cgf-dl-btn.alt {
            background: linear-gradient(135deg, #ff8f00, #ff6f00);
        }
        .cgf-dl-btn.ghost {
            background: #1a1a2e; border: 1px solid #555; font-size: 11px; padding: 5px 10px;
        }
        .cgf-dl-btn.ghost:hover { background: #333; }
        .cgf-dl-progress {
            position: fixed; z-index: 999999; top: 20px; right: 20px; width: 340px;
            font-family: Arial, sans-serif;
        }
        .cgf-dl-progress-bar {
            width: 100%; height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin-top: 8px;
        }
        .cgf-dl-progress-fill {
            height: 100%; width: 0%; background: linear-gradient(90deg, #ff6b35, #e91e63); border-radius: 3px; transition: width 0.3s;
        }
        .cgf-dl-cancel-btn {
            margin-top: 8px; padding: 4px 12px; border: 1px solid #555; border-radius: 4px;
            cursor: pointer; font-size: 11px; color: #ccc; background: #333;
        }
        .cgf-dl-cancel-btn:hover { background: #555; color: #fff; }
    `);

    function notify(msg, type = 'info') {
        const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336', warning: '#ff9800' };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;opacity:1;transition:opacity 0.4s;font-family:Arial,sans-serif;pointer-events:none;';
        el.innerHTML = `<div style="background:${colors[type]};color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-size:14px;max-width:360px;word-break:break-word;">${msg}</div>`;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 4000);
    }

    function showProgress(filename) {
        if (progressEl) progressEl.remove();
        progressEl = document.createElement('div');
        progressEl.className = 'cgf-dl-progress';
        progressEl.innerHTML = `<div style="background:#1a1a2e;color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.8);font-size:13px;">
            <div style="margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Pobieranie: <strong>${filename}</strong></div>
            <div style="font-size:11px;color:#aaa;" class="cgf-dl-progress-text">0% — 0 MB</div>
            <div class="cgf-dl-progress-bar"><div class="cgf-dl-progress-fill"></div></div>
            <div style="margin-top:8px;display:flex;gap:6px;"><button class="cgf-dl-cancel-btn">Anuluj</button></div>
        </div>`;
        progressEl.querySelector('.cgf-dl-cancel-btn').addEventListener('click', () => {
            if (currentRequest) currentRequest.abort();
            notify('Anulowano', 'info');
            removeProgress();
        });
        document.body.appendChild(progressEl);
        return progressEl;
    }

    function updateProgress(pct, loaded, total) {
        if (!progressEl) return;
        const fill = progressEl.querySelector('.cgf-dl-progress-fill');
        const text = progressEl.querySelector('.cgf-dl-progress-text');
        if (fill) fill.style.width = `${Math.min(pct, 100)}%`;
        if (text) {
            if (total > 0) text.textContent = `${Math.round(pct)}% — ${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`;
            else text.textContent = `${Math.round(pct)}% — ${(loaded / 1048576).toFixed(1)} MB`;
        }
    }

    function removeProgress() {
        if (!progressEl) return;
        progressEl.style.opacity = '0';
        setTimeout(() => { if (progressEl) { progressEl.remove(); progressEl = null; } }, 400);
    }

    // ---- pozyskanie tytułu ----
    function getTitle() {
        // 1. flashvars video_title z JS
        try {
            const html = document.documentElement.innerHTML;
            const m = html.match(/video_title\s*:\s*['"]([^'"]+)['"]/);
            if (m && m[1]) return m[1].trim();
        } catch {}
        // 2. h1
        const h1 = document.querySelector('h1.title, h1');
        if (h1 && h1.textContent.trim()) return h1.textContent.trim();
        const og = document.querySelector('meta[property="og:title"]');
        if (og && og.content) return og.content.trim();
        return document.title ? document.title.replace(/\s*[-|].*$/, '').trim() : 'video';
    }

    function sanitize(name) {
        return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 120).replace(/\s/g, '_');
    }

    // ---- parsowanie flashvars KVS ----
    function extractSources() {
        const sources = [];
        const seen = new Set();

        function add(url, label) {
            if (!url || typeof url !== 'string') return;
            url = url.trim();
            // filtruj śmieci: musi być get_file lub .mp4
            if (!url.includes('get_file') && !url.includes('.mp4')) return;
            // odrzuć redirect-page (embed bez get_file)
            if (url.startsWith('/video/')) return;
            // normalizuj względne
            try { url = new URL(url, location.href).href; } catch {}
            if (seen.has(url)) return;
            seen.add(url);
            // wykryj jakość z label lub z URL
            let quality = label || '';
            if (!quality) {
                const qm = url.match(/_(\d{3,4}p)\.mp4/);
                quality = qm ? qm[1] : 'mp4';
            }
            // postfix .mp4 już w URL
            sources.push({ url, label: quality, quality });
        }

        // Strategia 1: parsuj wszystkie <script> zawierające video_url
        const scripts = document.querySelectorAll('script');
        let combined = '';
        for (const s of scripts) {
            const t = s.textContent || '';
            if (t.includes('video_url')) combined += '\n' + t;
        }
        if (!combined) combined = document.documentElement.innerHTML;

        // mapy url -> text
        const urlMap = new Map();
        const textMap = new Map();

        // video_url, video_alt_url, video_alt_url2 ... (KVS)
        const reUrl = /(video_(?:alt_)?url\d*)\s*:\s*['"]([^'"]+)['"]/g;
        let m;
        while ((m = reUrl.exec(combined)) !== null) {
            urlMap.set(m[1], m[2]);
        }
        const reText = /(video_(?:alt_)?url\d*_text)\s*:\s*['"]([^'"]+)['"]/g;
        while ((m = reText.exec(combined)) !== null) {
            textMap.set(m[1], m[2]);
        }

        // posortuj klucze żeby video_url pierwsze, potem alt
        const sortedKeys = Array.from(urlMap.keys()).sort((a, b) => {
            if (a === 'video_url') return -1;
            if (b === 'video_url') return 1;
            return a.localeCompare(b);
        });

        for (const key of sortedKeys) {
            const url = urlMap.get(key);
            const textKey = key + '_text';
            const label = textMap.get(textKey) || '';
            add(url, label);
        }

        // Fallback: <video> currentSrc po inicjalizacji kt_player
        try {
            const v = document.querySelector('video');
            if (v) {
                const vsrc = v.currentSrc || v.src || '';
                if (vsrc) add(vsrc, 'video-tag');
                v.querySelectorAll('source').forEach(s => { if (s.src) add(s.src, s.getAttribute('label') || 'source'); });
            }
        } catch {}

        // Fallback: bezpośredni regex na HTML (gdy skrypt obfuskowany)
        if (sources.length === 0) {
            const reDirect = /https:\/\/camgirlfap\.com\/get_file\/[^'"\s]+/g;
            const html = document.documentElement.innerHTML;
            let mm;
            while ((mm = reDirect.exec(html)) !== null) {
                let u = mm[0];
                // usuń trailing \ lub ;
                u = u.replace(/\\+$/, '').replace(/['"]$/, '');
                add(u, '');
            }
        }

        // deduplikacja po label - zachowaj najlepszą
        return sources;
    }

    function downloadVideo(url, filename) {
        showProgress(filename);
        let loaded = 0;
        currentRequest = GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            headers: { Referer: location.href },
            onprogress: (e) => {
                if (e.lengthComputable && e.total > 0) {
                    loaded = e.loaded;
                    updateProgress((e.loaded / e.total) * 100, e.loaded, e.total);
                } else if (e.loaded) {
                    loaded = e.loaded;
                    updateProgress(0, e.loaded, 0);
                    const txt = progressEl && progressEl.querySelector('.cgf-dl-progress-text');
                    if (txt) txt.textContent = `${(e.loaded / 1048576).toFixed(1)} MB pobrano...`;
                }
            },
            onload: (resp) => {
                currentRequest = null;
                if (resp.status >= 200 && resp.status < 300) {
                    updateProgress(100, loaded || resp.response.size || 0, loaded || resp.response.size || 0);
                    setTimeout(() => removeProgress(), 600);
                    notify('Pobrano! Zapisywanie...', 'success');
                    const blobUrl = URL.createObjectURL(resp.response);
                    GM_download({
                        url: blobUrl, name: filename, saveAs: true,
                        onload: () => { setTimeout(() => URL.revokeObjectURL(blobUrl), 5000); notify('Zapisano: ' + filename, 'success'); },
                        onerror: () => {
                            // fallback <a>
                            const a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => { a.remove(); URL.revokeObjectURL(blobUrl); }, 5000);
                        }
                    });
                } else {
                    removeProgress();
                    notify(`Błąd HTTP ${resp.status}. Spróbuj "Otwórz w karcie".`, 'error');
                }
            },
            onerror: () => { currentRequest = null; removeProgress(); notify('Błąd sieci. Spróbuj "Otwórz w karcie".', 'error'); },
            ontimeout: () => { currentRequest = null; removeProgress(); notify('Timeout', 'error'); },
        });
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => notify('Skopiowano URL', 'success')).catch(() => fallbackCopy(text));
        } else fallbackCopy(text);
    }
    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); notify('Skopiowano URL', 'success'); } catch { notify('Kopiowanie nieudane', 'error'); }
        ta.remove();
    }

    function buildPanel(sources, title) {
        // usuń stary panel
        const old = document.querySelector('.cgf-dl-panel');
        if (old) old.remove();

        const container = document.querySelector('.player-wrap') || document.querySelector('#kt_player') || document.querySelector('.player-holder') || document.querySelector('.player');
        let host = container;
        if (!host) host = document.body;

        // upewnij się że host ma position relative
        if (host !== document.body) {
            const cs = getComputedStyle(host);
            if (cs.position === 'static') host.style.position = 'relative';
        }

        const panel = document.createElement('div');
        panel.className = 'cgf-dl-panel';
        // jeśli host to body -> fixed
        if (host === document.body) {
            panel.style.position = 'fixed';
            panel.style.top = '12px';
            panel.style.right = '12px';
        }

        const base = sanitize(title);

        sources.forEach((src, idx) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '4px';
            row.style.alignItems = 'center';

            const btn = document.createElement('button');
            btn.className = 'cgf-dl-btn' + (idx > 0 ? ' alt' : '');
            btn.textContent = `Pobierz ${src.quality}`;
            btn.title = src.url;
            btn.addEventListener('click', () => {
                const fname = `${base}_${src.quality}.mp4`;
                downloadVideo(src.url, fname);
            });

            const openBtn = document.createElement('button');
            openBtn.className = 'cgf-dl-btn ghost';
            openBtn.textContent = 'Otwórz';
            openBtn.title = 'Otwórz wideo w nowej karcie (działa gdy pobieranie blokowane)';
            openBtn.addEventListener('click', () => window.open(src.url, '_blank'));

            const copyBtn = document.createElement('button');
            copyBtn.className = 'cgf-dl-btn ghost';
            copyBtn.textContent = 'Kopiuj';
            copyBtn.addEventListener('click', () => copyText(src.url));

            row.appendChild(btn);
            row.appendChild(openBtn);
            row.appendChild(copyBtn);
            panel.appendChild(row);
        });

        // info o tokenie
        const info = document.createElement('div');
        info.style.cssText = 'font-size:10px;color:#aaa;text-align:right;margin-top:2px;';
        info.textContent = sources.length > 1 ? `${sources.length} jakości` : '480p/720p zależnie od wideo';
        panel.appendChild(info);

        host.appendChild(panel);
        notify(`Znaleziono ${sources.length} źródło(ła) • ${title}`, 'success');
    }

    function init() {
        let sources = extractSources();
        const title = getTitle();

        // przechwyć kt_player jako fallback (gdy flashvars jeszcze nie w DOM)
        try {
            const orig = window.kt_player;
            if (typeof orig === 'function' && !orig.__cgfPatched) {
                window.kt_player = function () {
                    try {
                        const args = Array.from(arguments);
                        // ostatni arg to flashvars
                        const fv = args[args.length - 1];
                        if (fv && fv.video_url && !sources.length) {
                            const tmp = [];
                            if (fv.video_url) tmp.push({ url: fv.video_url, quality: fv.video_url_text || '480p' });
                            if (fv.video_alt_url && fv.video_alt_url.includes('get_file')) tmp.push({ url: fv.video_alt_url, quality: fv.video_alt_url_text || '720p' });
                            if (tmp.length) {
                                sources = tmp;
                                setTimeout(() => buildPanel(sources, fv.video_title || title), 500);
                            }
                        }
                    } catch {}
                    return orig.apply(this, arguments);
                };
                window.kt_player.__cgfPatched = true;
            }
        } catch {}

        if (sources.length > 0) {
            buildPanel(sources, title);
            return;
        }

        // polling – KVS renderuje video z opóźnieniem
        let tries = 0;
        const maxTries = 20;
        const timer = setInterval(() => {
            tries++;
            sources = extractSources();
            if (sources.length > 0) {
                clearInterval(timer);
                buildPanel(sources, getTitle());
            } else if (tries >= maxTries) {
                clearInterval(timer);
                // sprawdź <video> jako ostatnia deska
                const v = document.querySelector('video');
                if (v && (v.currentSrc || v.src)) {
                    const url = v.currentSrc || v.src;
                    if (url.includes('get_file') || url.includes('.mp4')) {
                        buildPanel([{ url, quality: 'video' }], getTitle());
                        return;
                    }
                }
                notify('Nie znaleziono źródeł. Odśwież stronę lub uruchom z menu Tampermonkey.', 'error');
                // dodaj przycisk ręczny
                const host = document.querySelector('.player-holder') || document.body;
                if (host && getComputedStyle(host).position === 'static') host.style.position = 'relative';
                const p = document.createElement('div');
                p.className = 'cgf-dl-panel';
                if (host === document.body) { p.style.position = 'fixed'; p.style.top = '12px'; p.style.right = '12px'; }
                const b = document.createElement('button');
                b.className = 'cgf-dl-btn';
                b.textContent = 'Spróbuj ponownie';
                b.addEventListener('click', () => { p.remove(); init(); });
                p.appendChild(b);
                host.appendChild(p);
            }
        }, 800);

        // obserwuj DOM na wypadek późnego wstrzyknięcia <video>
        const mo = new MutationObserver(() => {
            const v = document.querySelector('video');
            if (v && v.currentSrc && v.currentSrc.includes('get_file')) {
                const s = extractSources();
                if (s.length && !document.querySelector('.cgf-dl-panel')) {
                    mo.disconnect();
                    buildPanel(s, getTitle());
                }
            }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => mo.disconnect(), 30000);
    }

    GM_registerMenuCommand('Pobierz wideo (camgirlfap)', () => {
        const s = extractSources();
        if (s.length === 0) { notify('Brak źródeł – odśwież stronę', 'error'); return; }
        const t = getTitle();
        buildPanel(s, t);
        // auto-pobierz najlepszą jakość
        const best = s[s.length - 1] || s[0];
        const fname = `${sanitize(t)}_${best.quality}.mp4`;
        downloadVideo(best.url, fname);
    });
    GM_registerMenuCommand('Kopiuj link (najlepsza jakość)', () => {
        const s = extractSources();
        if (s.length) copyText(s[s.length - 1].url);
        else notify('Brak źródeł', 'error');
    });
    GM_registerMenuCommand('Otwórz wideo w karcie', () => {
        const s = extractSources();
        if (s.length) window.open(s[s.length - 1].url, '_blank');
        else notify('Brak źródeł', 'error');
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1200));
    else setTimeout(init, 1200);
})();
