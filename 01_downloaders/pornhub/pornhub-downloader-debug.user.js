// ==UserScript==
// @name         Pornhub Video Downloader
// @version      6.0-debug
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pornhub/pornhub-downloader-debug.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pornhub/pornhub-downloader-debug.user.js
// @description  Pobiera filmy z Pornhuba w najlepszej jakości
// @author       You
// @include      https://*.pornhub.com/view_video.php*
// @include      https://*.pornhubpremium.com/view_video.php*
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        unsafeWindow
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    GM_addStyle(`
        .phdl-pnl { position: fixed; top: 80px; right: 20px; z-index: 999999; background: rgba(0,0,0,0.92); padding: 14px 18px; border-radius: 10px; border: 1px solid #ff6a00; box-shadow: 0 4px 24px rgba(0,0,0,0.7); font: 14px Arial, sans-serif; min-width: 260px; backdrop-filter: blur(4px); }
        .phdl-pnl .phdl-hdr { color: #fff; font-weight: 700; font-size: 15px; margin-bottom: 8px; }
        .phdl-pnl select { width: 100%; padding: 7px; font-size: 13px; border: 1px solid #555; border-radius: 5px; background: #1a1a2e; color: #fff; margin-bottom: 6px; cursor: pointer; }
        .phdl-pnl .phdl-btn { width: 100%; padding: 9px 0; font-size: 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #ff6a00, #ee0979); border: none; border-radius: 5px; cursor: pointer; }
        .phdl-pnl .phdl-btn:hover { opacity: .85; }
        .phdl-pnl .phdl-btn:disabled { opacity: .4; cursor: not-allowed; }
        .phdl-pnl .phdl-st { color: #8cf; font-size: 11px; text-align: center; margin-top: 5px; min-height: 16px; word-break: break-word; }
        .phdl-pnl .phdl-err { color: #f88; }
        .phdl-close { position: absolute; top: 3px; right: 7px; color: #888; cursor: pointer; font-size: 17px; background: none; border: none; padding: 2px 5px; }
        .phdl-close:hover { color: #fff; }
        .phdl-debug { color: #aa8; font-size: 10px; margin-top: 4px; max-height: 200px; overflow: auto; white-space: pre-wrap; word-break: break-all; border-top: 1px solid #444; padding-top: 4px; }
    `);

    function getSources() {
        const sources = [];
        let flashvars = null;
        try {
            const key = Object.keys(unsafeWindow).find(k => /^flashvars_\d+$/.test(k));
            if (key) flashvars = unsafeWindow[key];
        } catch (e) {}

        if (flashvars && Array.isArray(flashvars.mediaDefinitions)) {
            for (const item of flashvars.mediaDefinitions) {
                const url = item.videoUrl;
                const q = String(item.quality || item.height || '').replace(/p/i, '');
                if (url && typeof url === 'string' && url.startsWith('http'))
                    sources.push({ quality: q || '?', url, format: (item.format || 'mp4').toLowerCase(), remote: !!item.remote });
            }
            return sources;
        }

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
                else if (ch === ']') { depth--; if (depth === 0) { i++; break; } }
                i++;
            }
            try {
                let clean = jsonStr.replace(/'/g, '"').replace(/,(\s*[\]}])/g, '$1');
                const arr = JSON.parse(clean);
                for (const item of arr) {
                    const url = item.videoUrl || item.url || item.src;
                    const q = String(item.quality || item.height || item.label || '').replace(/p/i, '');
                    if (url && typeof url === 'string' && url.startsWith('http'))
                        sources.push({ quality: q || '?', url, format: (item.format || 'mp4').toLowerCase(), remote: !!item.remote });
                }
                if (sources.length > 0) break;
            } catch (e) {}
        }
        return sources;
    }

    const pageFetch = unsafeWindow.fetch.bind(unsafeWindow);

    async function debugFetch(url, label, debugEl) {
        const lines = [];
        lines.push(`--- ${label} ---`);
        lines.push(`URL: ${url.slice(0, 120)}...`);
        try {
            const resp = await pageFetch(url, { credentials: 'include' });
            lines.push(`Status: ${resp.status} ${resp.statusText}`);
            const contentType = resp.headers.get('content-type') || '?';
            lines.push(`Content-Type: ${contentType}`);
            const cl = resp.headers.get('content-length') || '?';
            lines.push(`Content-Length: ${cl}`);

            const text = await resp.text();
            lines.push(`Body (${text.length} B):`);
            lines.push(text.slice(0, 500));
            if (text.length > 500) lines.push('...(truncated)');
        } catch (e) {
            lines.push(`ERROR: ${e.message}`);
        }
        lines.push('');
        const text = lines.join('\n');
        if (debugEl) {
            debugEl.textContent += '\n' + text;
            debugEl.scrollTop = debugEl.scrollHeight;
        }
        console.log('[PH-DL]', label, lines.join(' | '));
        return text;
    }

    function buildUI(sources, videoTitle) {
        document.querySelectorAll('.phdl-pnl').forEach(el => el.remove());

        const sorted = [...sources].sort((a, b) => {
            const na = parseInt(a.quality, 10) || 0;
            const nb = parseInt(b.quality, 10) || 0;
            if (a.format === 'mp4' && b.format !== 'mp4') return -1;
            if (a.format !== 'mp4' && b.format === 'mp4') return 1;
            return nb - na;
        });

        const pnl = document.createElement('div');
        pnl.className = 'phdl-pnl';

        const close = document.createElement('button');
        close.className = 'phdl-close'; close.textContent = '✕';
        close.onclick = () => pnl.remove();
        pnl.appendChild(close);

        const hdr = document.createElement('div');
        hdr.className = 'phdl-hdr'; hdr.innerHTML = '⬇ Pobierz';
        pnl.appendChild(hdr);

        const sel = document.createElement('select');
        sorted.forEach(src => {
            const opt = document.createElement('option');
            opt.value = src.url;
            const ql = (src.quality.match(/^\d+$/) ? src.quality + 'p' : src.quality);
            opt.textContent = ql + ' [' + src.format.toUpperCase() + (src.remote ? '·proxy' : '') + ']';
            opt.dataset.quality = src.quality || '?';
            opt.dataset.format = src.format || 'mp4';
            sel.appendChild(opt);
        });
        pnl.appendChild(sel);

        const btn = document.createElement('button');
        btn.className = 'phdl-btn'; btn.textContent = 'Debug: sprawdź URL';
        pnl.appendChild(btn);

        const st = document.createElement('div');
        st.className = 'phdl-st'; st.textContent = sorted.length + ' źródło/a';
        pnl.appendChild(st);

        const debugEl = document.createElement('div');
        debugEl.className = 'phdl-debug';
        debugEl.textContent = 'Debug output...';
        pnl.appendChild(debugEl);

        btn.addEventListener('click', async () => {
            const opt = sel.options[sel.selectedIndex];
            if (!opt) return;
            btn.disabled = true;
            btn.textContent = 'Sprawdzanie...';

            const url = opt.value;
            const format = opt.dataset.format;
            const quality = opt.dataset.quality;

            // Debug: wyślij zapytanie i pokaż odpowiedź
            await debugFetch(url, `Źródło: ${quality}p [${format.toUpperCase()}]`, debugEl);

            // Dla HLS spróbuj też master.m3u8
            if (format === 'hls') {
                await debugFetch(url, `HLS master.m3u8`, debugEl);
            }

            btn.disabled = false;
            btn.textContent = 'Debug: sprawdź URL';
        });

        document.body.appendChild(pnl);
    }

    function init() {
        if (!location.pathname.includes('view_video') && !location.search.includes('viewkey=')) return;

        let tries = 0;
        const iv = setInterval(() => {
            tries++;
            const sources = getSources();
            if (sources.length > 0 || tries >= 10) {
                clearInterval(iv);
                if (sources.length === 0) {
                    const pnl = document.createElement('div');
                    pnl.className = 'phdl-pnl';
                    pnl.innerHTML = '<button class="phdl-close" onclick="this.parentElement.remove()">✕</button>'
                        + '<div class="phdl-hdr">⬇ PH Downloader</div>'
                        + '<div class="phdl-st phdl-err">Nie znaleziono źródeł. F12 → console</div>';
                    document.body.appendChild(pnl);
                    return;
                }
                const titleEl = document.querySelector('h1') || document.querySelector('[class*="title"]');
                buildUI(sources, titleEl ? titleEl.textContent.trim() : 'video');
            }
        }, 1500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
