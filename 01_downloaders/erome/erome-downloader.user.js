// ==UserScript==
// @name         EroMe Gallery Downloader
// @namespace    http://tampermonkey.net/
// @version      1.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/erome/erome-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/erome/erome-downloader.user.js
// @description  Pobieranie zdjec i wideo z galerii EroMe (erome.com/a/...) - pojedynczo i zbiorczo, z wyborem plikow (fix wideo)
// @author       opencode
// @match        *://*.erome.com/a/*
// @match        *://erome.com/a/*
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      erome.com
// @connect      *.erome.com
// @connect      s79.erome.com
// @connect      v79.erome.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ---------- style ----------
    GM_addStyle(`
        .erome-dl-main-btn {
            position: fixed; top: 70px; right: 18px; z-index: 99999;
            padding: 11px 18px; background: #e85d8a; color: #fff;
            border: none; border-radius: 8px; font-size: 14px; font-weight: 700;
            cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.35);
            font-family: Arial, sans-serif; line-height: 1.2;
            transition: background 0.2s, transform 0.15s;
        }
        .erome-dl-main-btn:hover { background: #d14a77; transform: scale(1.03); }
        .erome-dl-main-btn:disabled { opacity: 0.6; cursor: wait; }
        .erome-dl-panel {
            position: fixed; top: 118px; right: 18px; z-index: 99999;
            width: 340px; max-height: 52vh; overflow-y: auto;
            background: rgba(18,18,22,0.96); color: #eee;
            border-radius: 10px; padding: 14px 16px;
            font-family: Arial, sans-serif; font-size: 12.5px; line-height: 1.6;
            box-shadow: 0 6px 24px rgba(0,0,0,0.5); display: none;
            border: 1px solid #333;
        }
        .erome-dl-panel::-webkit-scrollbar { width: 6px; }
        .erome-dl-panel::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
        .erome-dl-panel .ok { color: #4ade80; }
        .erome-dl-panel .fail { color: #f87171; }
        .erome-dl-panel .info { color: #93c5fd; }
        .erome-dl-panel .done { color: #fbbf24; font-weight: 700; }
        .erome-dl-panel .muted { color: #999; font-size: 11px; }
        .erome-dl-panel-head {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #333;
        }
        .erome-dl-panel-head b { font-size: 13px; }
        .erome-dl-panel-actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
        .erome-dl-small-btn {
            padding: 6px 10px; border: 1px solid #555; border-radius: 6px;
            background: #2a2a30; color: #ddd; font-size: 11.5px; cursor: pointer;
        }
        .erome-dl-small-btn:hover { background: #3a3a44; color: #fff; }
        .erome-dl-small-btn.primary {
            background: #e85d8a; border-color: #e85d8a; color: #fff; font-weight: 700;
        }
        .erome-dl-small-btn.primary:hover { background: #d14a77; }
        .erome-dl-progress-bar {
            width: 100%; height: 5px; background: #2b2b33; border-radius: 3px; overflow: hidden; margin: 8px 0;
        }
        .erome-dl-progress-fill {
            height: 100%; width: 0%; background: linear-gradient(90deg, #e85d8a, #a855f7); transition: width 0.25s;
        }
        .erome-dl-item-btn {
            position: absolute; top: 8px; right: 8px; z-index: 500;
            padding: 5px 9px; background: rgba(232,93,138,0.92); color: #fff;
            border: none; border-radius: 6px; font-size: 11px; font-weight: 700;
            cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            font-family: Arial, sans-serif; backdrop-filter: blur(4px);
        }
        .erome-dl-item-btn:hover { background: #d14a77; }
        .erome-dl-overlay {
            position: fixed; inset: 0; z-index: 999999;
            background: rgba(0,0,0,0.86); display: flex; flex-direction: column;
            overflow: hidden; height: 100vh;
        }
        .erome-dl-overlay.hidden { display: none; }
        .erome-dl-overlay-inner {
            display: flex; flex-direction: column;
            flex: 1; min-height: 0; margin: 18px; border-radius: 10px; overflow: hidden;
            border: 1px solid #333; background: #111827;
        }
        .erome-dl-ov-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; background: #1f2937; flex-shrink: 0;
        }
        .erome-dl-ov-header h2 { margin: 0; color: #fff; font-size: 16px; font-weight: 700; font-family: Arial, sans-serif; }
        .erome-dl-ov-close {
            background: none; border: none; color: #9ca3af; font-size: 26px; cursor: pointer; line-height: 1; padding: 0 6px;
        }
        .erome-dl-ov-close:hover { color: #fff; }
        .erome-dl-ov-gallery {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(180px,1fr));
            gap: 10px; padding: 16px; overflow-y: auto; flex: 1 1 0; min-height: 0; align-content: start;
        }
        .erome-dl-ov-item {
            position: relative; background: #1f2937; border-radius: 8px; overflow: hidden;
            border: 2px solid transparent; transition: border-color 0.2s; cursor: pointer;
        }
        .erome-dl-ov-item.selected { border-color: #e85d8a; }
        .erome-dl-ov-item img, .erome-dl-ov-item video {
            width: 100%; height: 160px; object-fit: cover; display: block; background: #111;
        }
        .erome-dl-ov-item .badge {
            position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.75); color: #fff;
            font-size: 10px; padding: 2px 6px; border-radius: 4px; font-family: Arial, sans-serif;
        }
        .erome-dl-ov-item .ov-check {
            position: absolute; top: 6px; left: 6px; width: 18px; height: 18px; accent-color: #e85d8a; cursor: pointer;
        }
        .erome-dl-ov-info {
            padding: 6px 8px; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between;
            font-family: Arial, sans-serif;
        }
        .erome-dl-ov-footer {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 10px 16px; background: #1f2937; flex-shrink: 0; flex-wrap: wrap;
        }
        .erome-dl-ov-footer .left { display: flex; gap: 6px; }
        .erome-dl-ov-footer .count { color: #d1d5db; font-size: 13px; font-weight: 600; font-family: Arial, sans-serif; }
    `);

    // ---------- helpers ----------
    function sanitize(str) {
        return str.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'erome';
    }

    function getAlbumInfo() {
        let title = '';
        const h1 = document.querySelector('h1');
        if (h1 && h1.textContent.trim()) title = h1.textContent.trim();
        if (!title) {
            const og = document.querySelector('meta[property="og:title"]');
            if (og && og.content) title = og.content.trim();
        }
        if (!title) {
            title = document.title.replace(/\s*-\s*Porno\s*-\s*EroMe.*$/i, '').trim();
        }
        const albumId = location.pathname.split('/').filter(Boolean).pop() || 'album';
        const safeTitle = sanitize(title);
        const folderBase = (safeTitle && !/^[_?]+$/.test(safeTitle) && safeTitle.length > 1) ? `${safeTitle}_${albumId}` : albumId;
        const folder = sanitize(folderBase);
        return { title: title || albumId, albumId, folder };
    }

    function cleanUrl(url) {
        return url.split('?')[0];
    }

    function collectMedia() {
        const seen = new Set();
        const items = [];
        const imgDivs = document.querySelectorAll('div.img[data-src]');
        imgDivs.forEach(div => {
            const raw = div.getAttribute('data-src');
            if (!raw) return;
            if (div.hasAttribute('data-html')) return;
            if (!raw.match(/\.(jpe?g|png|webp|gif)(\?|$)/i)) return;
            const url = raw.trim();
            const key = cleanUrl(url).toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            const id = cleanUrl(url).split('/').pop().replace(/\.[^.]+$/, '');
            const ext = cleanUrl(url).split('.').pop().toLowerCase();
            const safeExt = ext.match(/^(jpg|jpeg|png|webp|gif)$/) ? ext : 'jpg';
            items.push({ url, cleanUrl: cleanUrl(url), type: 'image', id, ext: safeExt });
        });
        if (items.length === 0) {
            document.querySelectorAll('img.img-front[src*="erome.com"]').forEach(img => {
                const url = img.src;
                const key = cleanUrl(url).toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                const id = cleanUrl(url).split('/').pop().replace(/\.[^.]+$/, '');
                const ext = cleanUrl(url).split('.').pop().toLowerCase();
                items.push({ url, cleanUrl: cleanUrl(url), type: 'image', id, ext: ext || 'jpg' });
            });
        }
        const sources = document.querySelectorAll('video source[src]');
        sources.forEach(s => {
            const url = s.src || s.getAttribute('src');
            if (!url || !url.includes('.mp4')) return;
            const key = cleanUrl(url).toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            const base = cleanUrl(url).split('/').pop();
            const id = base.replace(/\.mp4$/i, '');
            items.push({ url, cleanUrl: cleanUrl(url), type: 'video', id, ext: 'mp4' });
        });
        items.forEach(it => {
            if (it.type === 'video') {
                const rawId = it.id.split('_')[0];
                const v = document.querySelector(`video[data-poster*="${rawId}"]`) || document.querySelector(`video[poster*="${rawId}"]`);
                if (v) it.thumb = v.getAttribute('data-poster') || v.getAttribute('poster') || '';
            } else {
                it.thumb = it.url;
            }
        });
        return items;
    }

    // ---------- download core ----------
    const activeRequests = new Map();
    let reqSeq = 0;
    let cancelled = false;

    function gmFetchBlob(url) {
        return new Promise((resolve, reject) => {
            const id = ++reqSeq;
            const handle = GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                headers: { Referer: location.href },
                timeout: 0,
                onload: (resp) => {
                    activeRequests.delete(id);
                    if (resp.status >= 200 && resp.status < 300) resolve(resp.response);
                    else reject(new Error('HTTP ' + resp.status));
                },
                onerror: () => { activeRequests.delete(id); reject(new Error('network')); },
                ontimeout: () => { activeRequests.delete(id); reject(new Error('timeout')); },
            });
            activeRequests.set(id, handle);
        });
    }

    function gmDownloadBlobUrl(blobUrl, filename) {
        return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) { settled = true; console.warn('[erome] GM_download timeout', filename); resolve(false); }
            }, 15000);
            try {
                GM_download({
                    url: blobUrl,
                    name: filename,
                    saveAs: false,
                    onload: () => { if (!settled) { clearTimeout(timer); settled = true; resolve(true); } },
                    onerror: (e) => { if (!settled) { clearTimeout(timer); settled = true; console.warn('[erome] GM_download error', e); resolve(false); } },
                    ontimeout: () => { if (!settled) { clearTimeout(timer); settled = true; resolve(false); } },
                });
            } catch (e) {
                clearTimeout(timer);
                console.warn('[erome] GM_download throw', e);
                resolve(false);
            }
        });
    }

    function anchorFallback(blobUrl, filename) {
        try {
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename.split('/').pop();
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => a.remove(), 1200);
            return true;
        } catch (e) {
            console.warn('[erome] anchor fallback error', e);
            return false;
        }
    }

    async function downloadViaBlob(url, filename) {
        const isVideo = filename.toLowerCase().endsWith('.mp4') || url.includes('.mp4');
        // obrazy: najpierw szybki direct GM_download (nie wymaga Referer)
        if (!isVideo) {
            const directOk = await new Promise((resolve) => {
                let settled = false;
                const t = setTimeout(() => { if (!settled) { settled = true; resolve(false); } }, 8000);
                try {
                    GM_download({
                        url, name: filename, saveAs: false,
                        onload: () => { if (!settled) { clearTimeout(t); settled = true; resolve(true); } },
                        onerror: () => { if (!settled) { clearTimeout(t); settled = true; resolve(false); } },
                        ontimeout: () => { if (!settled) { clearTimeout(t); settled = true; resolve(false); } },
                    });
                } catch { clearTimeout(t); resolve(false); }
            });
            if (directOk) return true;
        }
        // wideo (wymaga Referer) lub fallback obrazu: blob z Referer
        try {
            const blob = await gmFetchBlob(url);
            if (cancelled) return false;
            if (!blob || blob.size === 0) {
                console.warn('[erome] pusty blob', url, blob);
                return false;
            }
            const blobUrl = URL.createObjectURL(blob);
            const ok = await gmDownloadBlobUrl(blobUrl, filename);
            if (ok) {
                setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                return true;
            }
            console.warn('[erome] GM_download blob fail, proba anchor', filename);
            const anchorOk = anchorFallback(blobUrl, filename);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
            return anchorOk;
        } catch (e) {
            console.warn('[erome] blob fetch fail', url, e && e.message);
            return false;
        }
    }

    function buildFilename(item, index, total, folder) {
        const pad = String(total).length;
        const num = String(index).padStart(pad, '0');
        const safeId = sanitize(item.id);
        return `${folder}/${num}_${safeId}.${item.ext}`;
    }

    // ---------- UI ----------
    const album = getAlbumInfo();
    let mediaCache = [];
    function refreshCache() {
        mediaCache = collectMedia();
        return mediaCache;
    }
    const mainBtn = document.createElement('button');
    mainBtn.className = 'erome-dl-main-btn';
    mainBtn.textContent = 'EroMe';
    document.body.appendChild(mainBtn);
    const panel = document.createElement('div');
    panel.className = 'erome-dl-panel';
    document.body.appendChild(panel);

    function renderPanel() {
        const items = refreshCache();
        const imgCount = items.filter(i => i.type === 'image').length;
        const vidCount = items.filter(i => i.type === 'video').length;
        mainBtn.textContent = `\u2B07 EroMe: ${imgCount} foto + ${vidCount} wideo`;
        panel.innerHTML = '';
        const head = document.createElement('div');
        head.className = 'erome-dl-panel-head';
        head.innerHTML = `<b>${album.title}</b><span class="muted">${album.albumId}</span>`;
        panel.appendChild(head);
        const info = document.createElement('div');
        info.className = 'muted';
        info.textContent = `Znaleziono ${items.length} plikow (${imgCount} zdjec, ${vidCount} wideo) -> folder "${album.folder}/"`;
        panel.appendChild(info);
        const bar = document.createElement('div');
        bar.className = 'erome-dl-progress-bar';
        bar.innerHTML = `<div class="erome-dl-progress-fill"></div>`;
        bar.style.display = 'none';
        panel.appendChild(bar);
        const progText = document.createElement('div');
        progText.className = 'muted';
        progText.style.display = 'none';
        panel.appendChild(progText);
        const actions = document.createElement('div');
        actions.className = 'erome-dl-panel-actions';
        actions.innerHTML = `
            <button class="erome-dl-small-btn primary" data-act="all">\u2B07 Pobierz wszystko</button>
            <button class="erome-dl-small-btn" data-act="pick">Wybierz z podgladem</button>
            <button class="erome-dl-small-btn" data-act="images">Tylko zdjecia</button>
            <button class="erome-dl-small-btn" data-act="videos">Tylko wideo</button>
            <button class="erome-dl-small-btn" data-act="cancel" style="display:none">Anuluj</button>
        `;
        panel.appendChild(actions);
        const logBox = document.createElement('div');
        logBox.style.marginTop = '8px';
        panel.appendChild(logBox);
        function log(msg, cls = '') {
            const el = document.createElement('div');
            if (cls) el.className = cls;
            el.textContent = msg;
            logBox.appendChild(el);
            panel.scrollTop = panel.scrollHeight;
        }
        function setProgress(pct, text) {
            bar.style.display = pct != null ? 'block' : 'none';
            progText.style.display = pct != null ? 'block' : 'none';
            const fill = bar.querySelector('.erome-dl-progress-fill');
            if (fill) fill.style.width = (pct || 0) + '%';
            if (text) progText.textContent = text;
        }
        let isRunning = false;
        async function runDownload(filterFn) {
            if (isRunning) return;
            const all = refreshCache().filter(filterFn || (() => true));
            if (!all.length) { log('Brak plikow do pobrania.', 'fail'); return; }
            if (!confirm(`EroMe: pobrac ${all.length} plikow do folderu "${album.folder}/"?`)) return;
            isRunning = true; cancelled = false;
            actions.querySelector('[data-act="cancel"]').style.display = '';
            mainBtn.disabled = true;
            logBox.innerHTML = '';
            log(`Start: ${all.length} plikow -> ${album.folder}/`, 'info');
            bar.style.display = 'block';
            for (let i = 0; i < all.length; i++) {
                if (cancelled) { log('Anulowano.', 'done'); break; }
                const it = all[i];
                const filename = buildFilename(it, i + 1, all.length, album.folder);
                const label = `${i + 1}/${all.length} ${it.id}.${it.ext}`;
                log(`... ${label}`, 'muted');
                setProgress(Math.round((i / all.length) * 100), `${i + 1}/${all.length} - ${it.id}`);
                const ok = await Promise.race([
                    downloadViaBlob(it.url, filename),
                    new Promise(res => setTimeout(() => { console.warn('[erome] per-file timeout', label); res(false); }, 90000))
                ]);
                if (cancelled) { log('Anulowano.', 'done'); break; }
                if (!ok) log(`ERR ${label} - sprawdz konsole (F12) i @connect`, 'fail');
                else log(`OK ${label}`, 'ok');
                setProgress(Math.round(((i + 1) / all.length) * 100), `${i + 1}/${all.length}`);
                await new Promise(r => setTimeout(r, 400));
            }
            if (!cancelled) { log('Gotowe!', 'done'); setProgress(100, 'Gotowe'); }
            actions.querySelector('[data-act="cancel"]').style.display = 'none';
            mainBtn.disabled = false; isRunning = false;
        }
        actions.querySelector('[data-act="all"]').onclick = () => runDownload();
        actions.querySelector('[data-act="images"]').onclick = () => runDownload(x => x.type === 'image');
        actions.querySelector('[data-act="videos"]').onclick = () => runDownload(x => x.type === 'video');
        actions.querySelector('[data-act="pick"]').onclick = () => { panel.style.display = 'none'; openPicker(); };
        actions.querySelector('[data-act="cancel"]').onclick = () => {
            cancelled = true;
            for (const [, h] of activeRequests) try { h.abort(); } catch {}
            activeRequests.clear();
            log('Anulowanie...', 'done');
            setProgress(null);
            actions.querySelector('[data-act="cancel"]').style.display = 'none';
            mainBtn.disabled = false; isRunning = false;
        };
    }
    mainBtn.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'block' : 'none';
        if (panel.style.display === 'block') renderPanel();
    });

    function injectItemButtons() {
        const groups = document.querySelectorAll('.media-group');
        if (!groups.length) return;
        groups.forEach(g => {
            if (g.querySelector('.erome-dl-item-btn')) return;
            let url = null, type = null, id = null;
            const divImg = g.querySelector('div.img[data-src]');
            if (divImg && !divImg.hasAttribute('data-html')) {
                url = divImg.getAttribute('data-src');
                type = 'image';
                id = cleanUrl(url).split('/').pop().replace(/\.[^.]+$/, '');
            } else {
                const srcEl = g.querySelector('video source[src]');
                if (srcEl) {
                    url = srcEl.src || srcEl.getAttribute('src');
                    type = 'video';
                    id = cleanUrl(url).split('/').pop().replace(/\.mp4$/i, '');
                }
            }
            if (!url) return;
            const ext = type === 'video' ? 'mp4' : cleanUrl(url).split('.').pop().toLowerCase();
            const style = getComputedStyle(g);
            if (style.position === 'static') g.style.position = 'relative';
            const btn = document.createElement('button');
            btn.className = 'erome-dl-item-btn';
            btn.textContent = type === 'video' ? 'wideo' : 'foto';
            btn.title = id + '.' + ext;
            btn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const filename = `${album.folder}/${sanitize(id)}.${ext}`;
                btn.textContent = '...';
                btn.disabled = true;
                downloadViaBlob(url, filename).then(ok => {
                    btn.textContent = ok ? 'OK' : 'ERR';
                    setTimeout(() => { btn.textContent = type === 'video' ? 'wideo' : 'foto'; btn.disabled = false; }, 1800);
                });
            });
            g.appendChild(btn);
        });
    }

    let picker = null, pickerGallery = null;
    function openPicker() {
        const items = refreshCache();
        if (!items.length) { alert('Nie znaleziono mediow na tej stronie.'); return; }
        if (!picker) buildPicker();
        picker.classList.remove('hidden');
        renderPicker(items);
    }
    function buildPicker() {
        picker = document.createElement('div');
        picker.className = 'erome-dl-overlay hidden';
        picker.innerHTML = `
            <div class="erome-dl-overlay-inner">
                <div class="erome-dl-ov-header">
                    <h2>Wybierz pliki - ${album.title}</h2>
                    <button class="erome-dl-ov-close">&times;</button>
                </div>
                <div class="erome-dl-ov-gallery"></div>
                <div class="erome-dl-ov-footer">
                    <div class="left">
                        <button class="erome-dl-small-btn" data-a="all">Zaznacz wszystkie</button>
                        <button class="erome-dl-small-btn" data-a="none">Odznacz</button>
                        <button class="erome-dl-small-btn" data-a="img">Tylko foto</button>
                        <button class="erome-dl-small-btn" data-a="vid">Tylko wideo</button>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="count">0 zaznaczonych</span>
                        <button class="erome-dl-small-btn primary" data-a="dl">Pobierz (0)</button>
                        <button class="erome-dl-small-btn" data-a="close">Zamknij</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(picker);
        pickerGallery = picker.querySelector('.erome-dl-ov-gallery');
        picker.querySelector('.erome-dl-ov-close').onclick = () => picker.classList.add('hidden');
        picker.querySelector('[data-a="close"]').onclick = () => picker.classList.add('hidden');
        picker.addEventListener('click', e => { if (e.target === picker) picker.classList.add('hidden'); });
        picker.querySelector('[data-a="all"]').onclick = () => setPickerSel(true);
        picker.querySelector('[data-a="none"]').onclick = () => setPickerSel(false);
        picker.querySelector('[data-a="img"]').onclick = () => setPickerFilter('image');
        picker.querySelector('[data-a="vid"]').onclick = () => setPickerFilter('video');
        picker.querySelector('[data-a="dl"]').onclick = downloadPickerSelection;
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && picker && !picker.classList.contains('hidden')) picker.classList.add('hidden');
        });
    }
    function renderPicker(items) {
        pickerGallery.innerHTML = '';
        items.forEach((it, idx) => {
            const div = document.createElement('div');
            div.className = 'erome-dl-ov-item selected';
            div.dataset.type = it.type;
            div.dataset.idx = idx;
            const isVid = it.type === 'video';
            const thumb = it.thumb || it.url;
            div.innerHTML = `
                <input type="checkbox" class="ov-check" checked>
                <span class="badge">${isVid ? 'VIDEO' : 'FOTO'}</span>
                <img src="${thumb}" alt="${it.id}" loading="lazy" onerror="this.style.background='#222'">
                <div class="erome-dl-ov-info"><span>${it.id}.${it.ext}</span><span>${isVid ? 'mp4' : it.ext}</span></div>
            `;
            const cb = div.querySelector('.ov-check');
            cb.addEventListener('change', () => { div.classList.toggle('selected', cb.checked); updatePickerCount(); });
            div.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                cb.checked = !cb.checked;
                div.classList.toggle('selected', cb.checked);
                updatePickerCount();
            });
            pickerGallery.appendChild(div);
        });
        updatePickerCount();
    }
    function setPickerSel(val) {
        pickerGallery.querySelectorAll('.erome-dl-ov-item').forEach(el => {
            const cb = el.querySelector('.ov-check');
            cb.checked = val;
            el.classList.toggle('selected', val);
        });
        updatePickerCount();
    }
    function setPickerFilter(type) {
        pickerGallery.querySelectorAll('.erome-dl-ov-item').forEach(el => {
            const isType = el.dataset.type === type;
            const cb = el.querySelector('.ov-check');
            cb.checked = isType;
            el.classList.toggle('selected', isType);
        });
        updatePickerCount();
    }
    function updatePickerCount() {
        if (!picker) return;
        const n = picker.querySelectorAll('.ov-check:checked').length;
        picker.querySelector('.count').textContent = `${n} zaznaczonych`;
        const btn = picker.querySelector('[data-a="dl"]');
        btn.textContent = `Pobierz (${n})`;
        btn.disabled = n === 0;
    }
    async function downloadPickerSelection() {
        const checks = [...picker.querySelectorAll('.erome-dl-ov-item')].filter(el => el.querySelector('.ov-check').checked);
        if (!checks.length) return;
        const items = refreshCache();
        const selected = checks.map(el => items[parseInt(el.dataset.idx, 10)]).filter(Boolean);
        const total = selected.length;
        const btn = picker.querySelector('[data-a="dl"]');
        btn.disabled = true;
        cancelled = false;
        for (let i = 0; i < selected.length; i++) {
            if (cancelled) break;
            const it = selected[i];
            const filename = buildFilename(it, i + 1, total, album.folder);
            btn.textContent = `${i + 1}/${total}...`;
            await Promise.race([
                downloadViaBlob(it.url, filename),
                new Promise(res => setTimeout(() => res(false), 90000))
            ]);
            await new Promise(r => setTimeout(r, 400));
        }
        btn.textContent = cancelled ? 'Anulowano' : 'Gotowe';
        setTimeout(() => { btn.disabled = false; btn.textContent = `Pobierz (${selected.length})`; updatePickerCount(); }, 1800);
    }

    function init() {
        renderPanel();
        injectItemButtons();
        const mo = new MutationObserver(() => injectItemButtons());
        mo.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 900));
    else setTimeout(init, 900);

    GM_registerMenuCommand('Pobierz wszystko (EroMe)', () => {
        const items = refreshCache();
        if (!items.length) { alert('Brak mediow.'); return; }
        panel.style.display = 'block';
        renderPanel();
        setTimeout(() => {
            const b = panel.querySelector('[data-act="all"]');
            if (b) b.click();
        }, 200);
    });
    GM_registerMenuCommand('Wybierz pliki (EroMe)', () => openPicker());

})();
