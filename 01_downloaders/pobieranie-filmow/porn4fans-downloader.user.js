// ==UserScript==
// @name         Porn4Fans Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/porn4fans-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pobieranie-filmow/porn4fans-downloader.user.js
// @description  Pobiera wideo z porn4fans.com – wyciąga źródła z kt_player (video_url / video_alt_url) i pobiera MP4 przez GM_xmlhttpRequest + GM_download
// @author       opencode
// @match        *://porn4fans.com/video/*
// @match        *://*.porn4fans.com/video/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=porn4fans.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-idle
// @connect      porn4fans.com
// @connect      www.porn4fans.com
// @connect      cdn.porn4fans.com
// @connect      *
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[P4F]';
    const log = (...a) => console.log(LOG_PREFIX, ...a);

    // stan
    let sourcesCache = []; // {url, label, key, sizeLabel, resolution}
    let cacheTime = 0;
    let currentRequest = null;
    let progressEl = null;

    const _W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // ---------------------------------------------------------------- style
    GM_addStyle(`
        #p4f-downloader { font-family: Arial, sans-serif; }
        .p4f-panel {
            background: #1a1a2e; border: 1px solid #00A6EE; border-radius: 8px;
            padding: 12px 16px; margin: 12px 0; color: #eee; box-shadow: 0 4px 20px rgba(0,0,0,.3);
        }
        .p4f-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
        .p4f-title { font-weight: 700; font-size: 14px; color: #00A6EE; }
        .p4f-badge { background: #16213e; color: #60cfff; border: 1px solid #0f3460; border-radius: 10px; padding: 2px 10px; font-size: 11px; font-weight: 600; }
        .p4f-btns { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
        .p4f-btn {
            background: #16213e; color: #eee; border: 1px solid #0f3460;
            border-radius: 6px; padding: 7px 14px; cursor: pointer;
            font-size: 12px; font-weight: 600; transition: all .15s; white-space: nowrap;
            font-family: Arial, sans-serif;
        }
        .p4f-btn:hover { background: #0f3460; border-color: #00A6EE; transform: translateY(-1px); }
        .p4f-btn:active { background: #00A6EE; transform: scale(0.97); }
        .p4f-btn-main { background: #00A6EE; border-color: #00A6EE; color: #fff; }
        .p4f-btn-main:hover { background: #33b8f0; border-color: #33b8f0; }
        .p4f-btn-ghost { background: transparent; border-color: #333; color: #aaa; font-weight: 400; }
        .p4f-btn-ghost:hover { background: #222; color: #fff; border-color: #555; }
        .p4f-url { margin-top: 8px; font-size: 10px; color: #666; word-break: break-all; max-height: 36px; overflow: hidden; }
        .p4f-progress {
            position: fixed; z-index: 999999; top: 20px; right: 20px; width: 340px;
            font-family: Arial, sans-serif;
        }
        .p4f-progress-inner {
            background: #1a1a2e; color: #fff; padding: 14px 18px; border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,.8); border: 1px solid #00A6EE;
        }
        .p4f-progress-bar { width: 100%; height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin-top: 8px; }
        .p4f-progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #00A6EE, #60cfff); border-radius: 3px; transition: width 0.3s; }
        .p4f-progress-text { font-size: 11px; color: #aaa; margin-top: 6px; }
        .p4f-cancel-btn {
            margin-top: 10px; padding: 5px 12px; border: 1px solid #555; border-radius: 4px;
            cursor: pointer; font-size: 11px; color: #ccc; background: #333; font-family: Arial, sans-serif;
        }
        .p4f-cancel-btn:hover { background: #555; color: #fff; }
        .p4f-floating {
            position: absolute; z-index: 99999; top: 10px; right: 10px;
            display: flex; gap: 6px; pointer-events: auto;
        }
        .p4f-floating .p4f-btn { padding: 8px 12px; font-size: 12px; box-shadow: 0 2px 12px rgba(0,166,238,0.4); }
    `);

    // ---------------------------------------------------------------- helpers
    function notify(msg, type = 'info', ms = 3500) {
        const colors = { info: '#00A6EE', success: '#4CAF50', error: '#f44336', warning: '#ff9800' };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;transition:opacity .4s;font-family:Arial,sans-serif;pointer-events:none;max-width:420px;';
        el.innerHTML = `<div style="background:${colors[type] || colors.info};color:#fff;padding:10px 18px;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.4);font-size:13px;">${msg}</div>`;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ms);
    }

    function sanitizeFilename(s) {
        return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video';
    }

    function getTitle() {
        // 1) z flashvars video_title
        const scripts = document.querySelectorAll('script');
        let html = '';
        scripts.forEach(s => html += (s.textContent || '') + '\n');
        const m = html.match(/video_title\s*:\s*'([^']+)'/);
        if (m && m[1]) return sanitizeFilename(m[1].trim());
        // 2) og:title / h1 / title
        const og = document.querySelector('meta[property="og:title"]');
        if (og && og.content) return sanitizeFilename(og.content.replace(/\s*\|\s*Porn4Fans.*$/i, '').trim());
        const h1 = document.querySelector('h1');
        if (h1 && h1.textContent.trim()) return sanitizeFilename(h1.textContent.trim());
        const t = document.querySelector('title');
        if (t) return sanitizeFilename(t.textContent.replace(/\s*\|\s*Porn4Fans.*$/i, '').trim());
        return 'video';
    }

    function getQualityOrder(label) {
        const n = parseInt(label) || 0;
        return n;
    }

    // ---------------------------------------------------------------- ekstrakcja źródeł
    // Szuka w <script> blokach kt_player config: video_url / video_alt_url / video_alt_url2...
    function extractFromScriptsText(text) {
        const sources = [];
        // mapa label: key -> text (np. "url" -> "480p")
        const textMap = new Map();
        const reText = /video_(alt_url\d*|url)_text\s*:\s*['"]([^'"]+)['"]/g;
        let tm;
        while ((tm = reText.exec(text)) !== null) {
            textMap.set(tm[1], tm[2].trim());
        }
        const reSize = /video_(alt_url\d*|url)_size\s*:\s*['"]([^'"]+)['"]/g;
        const sizeMap = new Map();
        while ((tm = reSize.exec(text)) !== null) {
            sizeMap.set(tm[1], tm[2].trim());
        }
        const reUrl = /video_(alt_url\d*|url)\s*:\s*['"]([^'"]+)['"]/g;
        while ((tm = reUrl.exec(text)) !== null) {
            const key = tm[1]; // "url", "alt_url", "alt_url2"...
            const url = tm[2].trim();
            // filtr: tylko get_file (pomija preview, timeline, adv itp.)
            if (!url.includes('get_file')) continue;
            // porn4fans ma czasem preview mp4 z get_file – odfiltruj _preview
            if (/_preview/i.test(url)) continue;
            const label = textMap.get(key) || key;
            const size = sizeMap.get(key) || '';
            sources.push({ url, label, key, size, resolution: size });
        }
        return sources;
    }

    function extractFromScripts() {
        const scripts = document.querySelectorAll('script');
        let all = '';
        scripts.forEach(s => {
            if (s.textContent) all += s.textContent + '\n';
        });
        // dodatkowo spróbuj w innerHTML całej strony (na wypadek inline event handlers)
        // ale scripts wystarczą – config kt_player jest w <script>
        return extractFromScriptsText(all);
    }

    function extractFromJsonLd() {
        const sources = [];
        document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
            try {
                const data = JSON.parse(s.textContent);
                const arr = Array.isArray(data) ? data : [data];
                arr.forEach(obj => {
                    if (obj.contentUrl && obj.contentUrl.includes('get_file')) {
                        // contentUrl w JSON-LD jest bez tokena – traktuj jako fallback 720p
                        // ale jeśli już mamy źródła z tokenem, nie dodawaj duplikatu
                        sources.push({ url: obj.contentUrl, label: '720p', key: 'ld-json', size: '', resolution: '' });
                    }
                });
            } catch {}
        });
        return sources;
    }

    function extractFromVideoElement() {
        const sources = [];
        // po inicjalizacji kt_player w DOM pojawia się <video> z src = get_file ... (po redirect CDN)
        document.querySelectorAll('video').forEach(v => {
            const src = v.currentSrc || v.src || '';
            if (src && src.includes('get_file') && !src.includes('_preview')) {
                // jakość próbuj wyciągnąć z URL: _720p.mp4, 720p, albo z rozdzielczości
                let label = 'MP4';
                const qm = src.match(/_(\d{3,4})p\.mp4/i) || src.match(/\/(\d{3,4})p\//);
                if (qm) label = qm[1] + 'p';
                sources.push({ url: src, label, key: 'video-el', size: '', resolution: '' });
            }
            // także <source>
            v.querySelectorAll('source').forEach(sr => {
                const su = sr.src || '';
                if (su && su.includes('get_file')) {
                    let label = sr.getAttribute('label') || sr.getAttribute('data-label') || 'MP4';
                    sources.push({ url: su, label: label.trim() || 'MP4', key: 'source-el', size: '', resolution: '' });
                }
            });
        });
        document.querySelectorAll('video ~ source, source[src*="get_file"]').forEach(sr => {
            const su = sr.src || sr.getAttribute('src') || '';
            if (su && !sources.some(s => s.url === su) && su.includes('get_file')) {
                sources.push({ url: su, label: 'MP4', key: 'source-el2', size: '', resolution: '' });
            }
        });
        return sources;
    }

    function dedupAndSort(sources) {
        const seen = new Set();
        const out = [];
        for (const s of sources) {
            // normalizuj URL (usuń końcowy slash dla porównań)
            const norm = s.url.replace(/\/$/, '');
            if (seen.has(norm)) continue;
            seen.add(norm);
            out.push(s);
        }
        // sort malejąco po jakości numerycznej, 1080 > 720 > 480...
        out.sort((a, b) => getQualityOrder(b.label) - getQualityOrder(a.label));
        return out;
    }

    function getAllSources() {
        let a = extractFromScripts();
        let b = extractFromJsonLd();
        let c = extractFromVideoElement();
        // priorytet: a (z tokenem) > c (video element) > b (ld bez tokena)
        let merged = [...a, ...c, ...b];
        return dedupAndSort(merged);
    }

    // odśwież źródła przez pobranie świeżej strony (token v-acctoken wygasa po kilku min)
    function refreshSourcesViaFetch() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: location.href,
                headers: { Referer: location.href },
                onload: (resp) => {
                    try {
                        const txt = resp.responseText || resp.response || '';
                        const fresh = dedupAndSort(extractFromScriptsText(txt));
                        if (fresh.length) {
                            sourcesCache = fresh;
                            cacheTime = Date.now();
                            log('Odświeżono źródła via fetch:', fresh);
                        }
                        resolve(fresh.length ? fresh : sourcesCache);
                    } catch (e) {
                        log('refresh parse error', e);
                        resolve(sourcesCache);
                    }
                },
                onerror: () => resolve(sourcesCache),
                ontimeout: () => resolve(sourcesCache),
            });
        });
    }

    async function getFreshSources() {
        // jeśli cache świeży (<90s) to zwróć bez fetch
        if (sourcesCache.length && (Date.now() - cacheTime) < 90_000) return sourcesCache;
        // jeśli cache starszy, spróbuj odświeżyć
        if (sourcesCache.length && (Date.now() - cacheTime) >= 90_000) {
            return await refreshSourcesViaFetch();
        }
        // brak cache – zbuduj z DOM
        const domSources = getAllSources();
        if (domSources.length) {
            sourcesCache = domSources;
            cacheTime = Date.now();
            return domSources;
        }
        // ostatnia deska: fetch strony
        return await refreshSourcesViaFetch();
    }

    // ---------------------------------------------------------------- progress UI
    function showProgress(filename) {
        removeProgress();
        progressEl = document.createElement('div');
        progressEl.className = 'p4f-progress';
        progressEl.innerHTML = `
            <div class="p4f-progress-inner">
                <div style="font-weight:700;font-size:13px;color:#00A6EE;">Pobieranie: <span style="color:#fff;">${filename}</span></div>
                <div class="p4f-progress-text">0% • 0 MB</div>
                <div class="p4f-progress-bar"><div class="p4f-progress-fill"></div></div>
                <div><button class="p4f-cancel-btn">Anuluj</button></div>
            </div>`;
        progressEl.querySelector('.p4f-cancel-btn').addEventListener('click', () => {
            if (currentRequest && currentRequest.abort) currentRequest.abort();
            notify('Anulowano', 'info');
            removeProgress();
        });
        document.body.appendChild(progressEl);
        return progressEl;
    }

    function updateProgress(pct, loaded, total) {
        if (!progressEl) return;
        const fill = progressEl.querySelector('.p4f-progress-fill');
        const text = progressEl.querySelector('.p4f-progress-text');
        if (fill) fill.style.width = Math.min(pct, 100) + '%';
        if (text) {
            const mbLoaded = (loaded / 1048576).toFixed(1);
            if (total > 0) {
                const mbTotal = (total / 1048576).toFixed(1);
                text.textContent = `${Math.round(pct)}% • ${mbLoaded} / ${mbTotal} MB`;
            } else {
                text.textContent = `${Math.round(pct)}% • ${mbLoaded} MB`;
            }
        }
    }

    function removeProgress() {
        if (!progressEl) return;
        const el = progressEl;
        progressEl = null;
        el.style.opacity = '0';
        el.style.transition = 'opacity .3s';
        setTimeout(() => el.remove(), 300);
    }

    // ---------------------------------------------------------------- pobieranie
    async function downloadUrl(url, filename) {
        // jeśli token stary, odśwież przed pobieraniem (fire-and-forget jeśli świeży fetch nie zdąży)
        // tu pobieranie idzie od razu ze świeżym URL jeśli udało się odświeżyć w getFreshSources
        showProgress(filename);
        return new Promise((resolve, reject) => {
            currentRequest = GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                headers: { Referer: location.href },
                onprogress: (e) => {
                    // e.done = loaded, e.total = total, e.lengthComputable
                    if (e.lengthComputable && e.total > 0) {
                        updateProgress((e.loaded / e.total) * 100, e.loaded, e.total);
                    } else if (e.loaded) {
                        // bez total – pokazuj MB
                        const pct = 0; // nieznany
                        if (progressEl) {
                            const text = progressEl.querySelector('.p4f-progress-text');
                            if (text) text.textContent = `${(e.loaded / 1048576).toFixed(1)} MB pobrano...`;
                        }
                    }
                },
                onload: (resp) => {
                    currentRequest = null;
                    if (resp.status >= 200 && resp.status < 300) {
                        updateProgress(100, resp.response ? resp.response.size : 0, resp.response ? resp.response.size : 0);
                        setTimeout(() => removeProgress(), 600);
                        const blob = resp.response;
                        const blobUrl = URL.createObjectURL(blob);
                        // Preferuj GM_download (zapis do folderu pobierania), fallback <a>
                        try {
                            GM_download({
                                url: blobUrl,
                                name: filename,
                                saveAs: true,
                                onload: () => {
                                    notify(`Pobrano: ${filename}`, 'success');
                                    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
                                    resolve();
                                },
                                onerror: () => {
                                    // fallback anchor
                                    const a = document.createElement('a');
                                    a.href = blobUrl;
                                    a.download = filename;
                                    document.body.appendChild(a);
                                    a.click();
                                    setTimeout(() => { a.remove(); URL.revokeObjectURL(blobUrl); }, 5000);
                                    notify(`Pobrano: ${filename}`, 'success');
                                    resolve();
                                },
                                ontimeout: () => {
                                    notify('Timeout GM_download, próbuję fallback...', 'warning');
                                    const a = document.createElement('a');
                                    a.href = blobUrl;
                                    a.download = filename;
                                    document.body.appendChild(a);
                                    a.click();
                                    setTimeout(() => { a.remove(); URL.revokeObjectURL(blobUrl); }, 5000);
                                    resolve();
                                }
                            });
                        } catch (err) {
                            const a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => { a.remove(); URL.revokeObjectURL(blobUrl); }, 5000);
                            notify(`Pobrano: ${filename}`, 'success');
                            resolve();
                        }
                    } else {
                        removeProgress();
                        notify(`Błąd HTTP ${resp.status}`, 'error');
                        reject(new Error('HTTP ' + resp.status));
                    }
                },
                onerror: () => { currentRequest = null; removeProgress(); notify('Błąd sieci przy pobieraniu', 'error'); reject(new Error('network')); },
                ontimeout: () => { currentRequest = null; removeProgress(); notify('Timeout pobierania', 'error'); reject(new Error('timeout')); }
            });
        });
    }

    async function handleDownloadClick(source) {
        const title = getTitle();
        // odśwież jeśli token wygasł
        let url = source.url;
        if (Date.now() - cacheTime > 90_000) {
            const fresh = await refreshSourcesViaFetch();
            // znajdź pasującą jakość po label
            const match = fresh.find(s => s.label === source.label) || fresh[0];
            if (match) url = match.url;
        }
        const safeLabel = source.label.replace(/[^0-9a-zA-Z]/g, '');
        const filename = `${title}_${safeLabel}.mp4`;
        log('Pobieranie', filename, url);
        notify(`Pobieranie ${source.label}...`, 'info');
        await downloadUrl(url, filename);
    }

    function openInTab(source) {
        // otwórz od razu (gest użytkownika), potem ewentualnie odśwież URL
        const win = window.open('about:blank', '_blank');
        if (!win) { notify('Pop-up zablokowany — zezwól na wyskakujące okna', 'warning'); return; }
        let url = source.url;
        // jeśli token stary, odśwież w tle i nawiguj
        if (Date.now() - cacheTime > 90_000) {
            refreshSourcesViaFetch().then(fresh => {
                const m = fresh.find(s => s.label === source.label) || fresh[0];
                const u = m ? m.url : url;
                try { win.location.href = u; } catch {}
            });
            try { win.location.href = url; } catch {}
        } else {
            try { win.location.href = url; } catch { window.open(url, '_blank'); }
        }
        notify('Otwieram w nowej karcie', 'info');
    }

    async function copyUrl(source) {
        let url = source.url;
        if (Date.now() - cacheTime > 90_000) {
            const fresh = await refreshSourcesViaFetch();
            const m = fresh.find(s => s.label === source.label) || fresh[0];
            if (m) url = m.url;
        }
        try {
            await navigator.clipboard.writeText(url);
            notify('Skopiowano URL (token ważny kilka minut)', 'success');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            notify('Skopiowano URL', 'success');
        }
    }

    // ---------------------------------------------------------------- UI injection
    function buildPanel(sources) {
        // usuń stary panel
        const old = document.getElementById('p4f-downloader');
        if (old) old.remove();
        const floatOld = document.querySelector('.p4f-floating');
        if (floatOld) floatOld.remove();

        if (!sources.length) return;

        const title = getTitle();
        const panel = document.createElement('div');
        panel.id = 'p4f-downloader';
        panel.innerHTML = `
            <div class="p4f-panel">
                <div class="p4f-head">
                    <span class="p4f-title">▼ Porn4Fans Downloader</span>
                    <span class="p4f-badge">${sources.length} ${sources.length === 1 ? 'jakość' : 'jakości'} • ${title.slice(0, 32)}</span>
                </div>
                <div class="p4f-btns" id="p4f-btns"></div>
                <div class="p4f-url" id="p4f-url" title="${sources[0].url}">${sources[0].url}</div>
                <div style="margin-top:6px;font-size:11px;color:#666;">Kliknij jakość aby pobrać • Otwórz = nowa karta (bez blokady popup) • Kopiuj = do schowka</div>
            </div>
        `;

        const btnWrap = panel.querySelector('#p4f-btns');
        const urlLine = panel.querySelector('#p4f-url');

        sources.forEach(src => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
            const mainBtn = document.createElement('button');
            mainBtn.className = 'p4f-btn p4f-btn-main';
            mainBtn.textContent = `⬇ ${src.label}` + (src.size ? ` (${src.size})` : '');
            mainBtn.title = `Pobierz ${src.label} – ${src.url}`;
            mainBtn.addEventListener('click', () => handleDownloadClick(src));
            mainBtn.addEventListener('mouseenter', () => { urlLine.textContent = src.url; urlLine.title = src.url; });
            mainBtn.addEventListener('focus', () => { urlLine.textContent = src.url; urlLine.title = src.url; });

            const openBtn = document.createElement('button');
            openBtn.className = 'p4f-btn p4f-btn-ghost';
            openBtn.textContent = 'Otwórz';
            openBtn.title = 'Otwórz w nowej karcie';
            openBtn.addEventListener('click', () => openInTab(src));

            const copyBtn = document.createElement('button');
            copyBtn.className = 'p4f-btn p4f-btn-ghost';
            copyBtn.textContent = 'Kopiuj';
            copyBtn.title = 'Kopiuj URL do schowka';
            copyBtn.addEventListener('click', () => copyUrl(src));

            row.appendChild(mainBtn);
            row.appendChild(openBtn);
            row.appendChild(copyBtn);
            btnWrap.appendChild(row);
        });

        // miejsce wstrzyknięcia: pod playerem
        const playerWrap = document.getElementById('player_wrap') || document.getElementById('kt_player') || document.querySelector('.player-holder') || document.querySelector('.player-wrap') || document.querySelector('.player');
        if (playerWrap) {
            // wstaw po playerze
            const parent = playerWrap.parentElement || playerWrap;
            // jeśli playerWrap to #kt_player, wstaw po #player_wrap
            const anchor = document.getElementById('player_wrap') || playerWrap;
            anchor.insertAdjacentElement('afterend', panel);
        } else {
            // fallback: na górze strony
            document.body.insertBefore(panel, document.body.firstChild);
        }

        // dodatkowy pływający przycisk na playerze (szybki dostęp)
        const container = document.getElementById('player_wrap') || document.querySelector('.player-holder');
        if (container) {
            if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
            const floating = document.createElement('div');
            floating.className = 'p4f-floating';
            const best = sources[0];
            const floBtn = document.createElement('button');
            floBtn.className = 'p4f-btn p4f-btn-main';
            floBtn.textContent = `⬇ ${best.label}`;
            floBtn.title = `Pobierz najlepszą jakość (${best.label})`;
            floBtn.addEventListener('click', (e) => { e.stopPropagation(); handleDownloadClick(best); });
            floating.appendChild(floBtn);
            container.appendChild(floating);
        }

        log('Panel wstrzyknięty, źródła:', sources);
    }

    function waitForSources(maxWait = 15000) {
        return new Promise(resolve => {
            const start = Date.now();
            function check() {
                const s = getAllSources();
                if (s.length) { resolve(s); return; }
                if (Date.now() - start >= maxWait) { resolve(s); return; }
                setTimeout(check, 600);
            }
            check();
        });
    }

    async function init() {
        log('init na', location.href);
        const sources = await waitForSources(15000);
        if (!sources.length) {
            log('Nie znaleziono źródeł po 15s, próbuję fetch strony...');
            const fresh = await refreshSourcesViaFetch();
            if (fresh.length) {
                buildPanel(fresh);
                sourcesCache = fresh; cacheTime = Date.now();
                notify(`Znaleziono ${fresh.length} jakości`, 'success');
                return;
            }
            notify('Nie znaleziono źródeł wideo. Odśwież stronę i upewnij się że player się załadował.', 'error', 5000);
            // zostaw menu do debug
            return;
        }
        sourcesCache = sources;
        cacheTime = Date.now();
        buildPanel(sources);
        notify(`Znaleziono: ${sources.map(s=>s.label).join(', ')}`, 'info');
    }

    // re-init przy nawigacji SPA / zmianie video_id
    let lastHref = location.href;
    setInterval(() => {
        if (location.href !== lastHref) {
            lastHref = location.href;
            if (/\/video\//.test(location.href)) {
                log('url change -> re-init');
                setTimeout(init, 1200);
            }
        }
    }, 1000);

    // MutationObserver – jeśli kt_player pojawi się później, spróbuj ponownie
    const mo = new MutationObserver(() => {
        if (!document.getElementById('p4f-downloader')) {
            const s = getAllSources();
            if (s.length && !sourcesCache.length) {
                sourcesCache = s; cacheTime = Date.now();
                buildPanel(s);
            }
        }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    GM_registerMenuCommand('Porn4Fans: pokaż źródła (debug)', async () => {
        const s = await getFreshSources();
        if (!s.length) notify('Brak źródeł', 'error');
        else {
            const txt = s.map(x => `${x.label}: ${x.url}`).join('\n');
            log('Źródła:', s);
            // spróbuj skopiować debug
            try { await navigator.clipboard.writeText(txt); notify('Źródła skopiowane do schowka + konsola', 'success'); }
            catch { notify(txt.slice(0, 300), 'info', 6000); }
            console.log(txt);
        }
    });

    GM_registerMenuCommand('Porn4Fans: pobierz najlepszą jakość', async () => {
        const s = await getFreshSources();
        if (!s.length) { notify('Brak źródeł', 'error'); return; }
        handleDownloadClick(s[0]);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 800));
    } else {
        setTimeout(init, 800);
    }
})();
