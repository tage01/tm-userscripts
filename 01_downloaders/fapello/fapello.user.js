// ==UserScript==
// @name         Fapello Gallery Downloader
// @namespace    http://tampermonkey.net/
// @version      2.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/fapello/fapello.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/fapello/fapello.user.js
// @description  Przeglądaj, filtruj i pobieraj pełnowymiarowe zdjęcia z Fapello
// @author       You
// @match        https://*.fapello.com/*/
// @grant        GM_download
// @grant        GM_addStyle
// @icon         https://fapello.com/assets/favicon/favicon-32x32.png
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        .fap-btn {
            display: inline-block !important;
            margin: 10px auto !important;
            padding: 10px 24px !important;
            background: #be185d !important;
            color: #fff !important;
            border: none !important;
            border-radius: 6px !important;
            cursor: pointer !important;
            font-size: 15px !important;
            font-weight: 700 !important;
            line-height: 1.4 !important;
            transition: background .2s !important;
        }
        .fap-btn:hover { background: #db2777 !important; }
        .fap-btn:disabled { opacity: .5; cursor: not-allowed; }

        .fap-overlay {
            position: fixed; inset: 0; z-index: 999999;
            background: rgba(0,0,0,.85);
            display: flex; flex-direction: column;
            overflow: hidden;
            height: 100vh;
        }
        .fap-overlay-inner {
            display: flex; flex-direction: column;
            flex: 1; min-height: 0;
            margin: 20px; border-radius: 8px; overflow: hidden;
        }
        .fap-overlay.hidden { display: none; }

        .fap-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; background: #1f2937; border-radius: 8px 8px 0 0;
            flex-shrink: 0;
        }
        .fap-header h2 {
            margin: 0; color: #fff; font-size: 18px; font-weight: 700;
        }
        .fap-close {
            background: none; border: none; color: #9ca3af; font-size: 24px;
            cursor: pointer; padding: 0 8px; line-height: 1;
        }
        .fap-close:hover { color: #fff; }

        .fap-filters {
            display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
            padding: 10px 16px; background: #374151; flex-shrink: 0;
        }
        .fap-filters label { color: #d1d5db; font-size: 13px; font-weight: 600; }
        .fap-filters input {
            width: 70px; padding: 4px 8px; border-radius: 4px; border: 1px solid #4b5563;
            background: #1f2937; color: #fff; font-size: 13px;
        }
        .fap-filters input:focus { outline: none; border-color: #be185d; }
        .fap-filters .fap-btn { margin: 0 !important; padding: 5px 14px !important; font-size: 13px !important; }

        .fap-gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            grid-auto-rows: auto; gap: 12px; padding: 16px;
            overflow-y: auto; flex: 1 1 0; min-height: 0;
            align-content: start; background: #111827;
        }
        .fap-item {
            position: relative; background: #1f2937; border-radius: 6px;
            overflow: hidden; border: 2px solid transparent; transition: border-color .2s;
            min-height: 180px; break-inside: avoid;
        }
        .fap-item.selected { border-color: #be185d; }
        .fap-item img {
            width: 100%; height: 180px; min-height: 180px; object-fit: cover; display: block;
            background: #374151;
        }
        .fap-item-info {
            padding: 6px 8px; font-size: 11px; color: #9ca3af;
            display: flex; justify-content: space-between; align-items: center;
        }
        .fap-item-info .dim { white-space: nowrap; }
        .fap-item-check {
            position: absolute; top: 6px; left: 6px; z-index: 2;
            width: 20px; height: 20px; cursor: pointer; accent-color: #be185d;
        }

        .fap-footer {
            display: flex; align-items: center; justify-content: space-between;
            gap: 12px; padding: 10px 16px; background: #1f2937;
            border-radius: 0 0 8px 8px; flex-shrink: 0;
        }
        .fap-footer-actions { display: flex; gap: 8px; }
        .fap-footer .fap-btn { margin: 0 !important; padding: 8px 20px !important; font-size: 14px !important; }
        .fap-footer .fap-btn-sm {
            margin: 0 !important; padding: 6px 12px !important;
            font-size: 12px !important; background: #4b5563 !important;
        }
        .fap-footer .fap-btn-sm:hover { background: #6b7280 !important; }
        .fap-footer .count { color: #d1d5db; font-size: 14px; font-weight: 600; }
        .fap-spinner {
            display: inline-block; width: 16px; height: 16px;
            border: 2px solid #be185d; border-top-color: transparent;
            border-radius: 50%; animation: fap-spin .6s linear infinite;
            vertical-align: middle; margin-right: 6px;
        }
        @keyframes fap-spin { to { transform: rotate(360deg); } }
    `);

    // --- button on page ---
    const btn = document.createElement('button');
    btn.className = 'fap-btn';
    btn.textContent = '📷 Przeglądaj i pobierz';
    const target = document.querySelector('.pro-container') ||
                   document.querySelector('.container.m-auto') ||
                   document.querySelector('.container');
    if (target) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'text-align:center;padding:12px 0;';
        wrap.appendChild(btn);
        target.insertBefore(wrap, target.firstChild);
    }

    // --- derive folder name from URL ---
    const modelName = window.location.pathname.replace(/\/$/,'').split('/').pop();

    // --- collect URLs ---
    function collectUrls() {
        const content = document.querySelector('#content');
        if (!content) return [];
        const set = new Set();
        content.querySelectorAll('a').forEach(a => {
            const img = a.querySelector('img[src*="_300px.jpg"]');
            if (img) set.add(img.src.replace('_300px.jpg', '.jpg'));
        });
        return [...set];
    }

    // --- modal ---
    let overlay, gallery, selectAllBtn, deselectAllBtn, dlBtn, countEl, filterW, filterH;
    let items = [];

    function buildModal() {
        overlay = document.createElement('div');
        overlay.className = 'fap-overlay hidden';

        overlay.innerHTML = `
            <div class="fap-overlay-inner">
                <div class="fap-header">
                    <h2>📷 Wybierz zdjęcia do pobrania</h2>
                    <button class="fap-close">&times;</button>
                </div>
                <div class="fap-filters">
                    <label>Min. szerokość:</label>
                    <input type="number" id="fap-fw" placeholder="np. 800" min="0">
                    <label>Min. wysokość:</label>
                    <input type="number" id="fap-fh" placeholder="np. 800" min="0">
                    <button class="fap-btn" id="fap-apply">Filtruj</button>
                </div>
                <div class="fap-gallery"></div>
                <div class="fap-footer">
                    <div class="fap-footer-actions">
                        <button class="fap-btn fap-btn-sm" id="fap-selall">Zaznacz wszystkie</button>
                        <button class="fap-btn fap-btn-sm" id="fap-desel">Odznacz wszystkie</button>
                    </div>
                    <div>
                        <span class="count" id="fap-count">0 zaznaczonych</span>
                        <button class="fap-btn" id="fap-dl">⬇ Pobierz (0)</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        gallery = overlay.querySelector('.fap-gallery');
        selectAllBtn = overlay.querySelector('#fap-selall');
        deselectAllBtn = overlay.querySelector('#fap-desel');
        dlBtn = overlay.querySelector('#fap-dl');
        countEl = overlay.querySelector('#fap-count');
        filterW = overlay.querySelector('#fap-fw');
        filterH = overlay.querySelector('#fap-fh');

        overlay.querySelector('.fap-close').onclick = () => overlay.classList.add('hidden');
        overlay.onclick = e => { if (e.target === overlay) overlay.classList.add('hidden'); };
        selectAllBtn.onclick = () => setAllCheckboxes(true);
        deselectAllBtn.onclick = () => setAllCheckboxes(false);
        overlay.querySelector('#fap-apply').onclick = applyFilter;
        filterW.oninput = applyFilter;
        filterH.oninput = applyFilter;
    }

    function setAllCheckboxes(val) {
        gallery.querySelectorAll('.fap-item').forEach(el => {
            if (el.style.display === 'none') return;
            const cb = el.querySelector('.fap-item-check');
            cb.checked = val;
            el.classList.toggle('selected', val);
        });
        updateCount();
    }

    function updateCount() {
        const checked = gallery.querySelectorAll('.fap-item-check:checked').length;
        countEl.textContent = `${checked} zaznaczonych`;
        dlBtn.textContent = `⬇ Pobierz (${checked})`;
        dlBtn.disabled = checked === 0;
    }

    function applyFilter() {
        const mw = parseInt(filterW.value) || 0;
        const mh = parseInt(filterH.value) || 0;
        gallery.querySelectorAll('.fap-item').forEach(el => {
            const w = parseInt(el.dataset.w) || 0;
            const h = parseInt(el.dataset.h) || 0;
            const pass = w >= mw && h >= mh;
            el.style.display = pass ? '' : 'none';
        });
        updateCount();
    }

    // --- load images into gallery ---
    async function loadGallery(urls) {
        gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9ca3af;">Ładowanie zdjęć...</div>';

        // load in batches so UI stays responsive
        const batchSize = 12;
        const allItems = [];

        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(url => loadOneItem(url)));
            allItems.push(...results.filter(Boolean));

            // render incremental
            renderItems(allItems);
        }
        items = allItems;
        updateCount();
    }

    function loadOneItem(url) {
        return new Promise(resolve => {
            const img = new Image();
            let resolved = false;
            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve({ url, w: 0, h: 0, name: url.split('/').pop() });
                }
            }, 15000);

            img.onload = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve({ url, w: img.naturalWidth, h: img.naturalHeight, name: url.split('/').pop() });
                }
            };
            img.onerror = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve({ url, w: 0, h: 0, name: url.split('/').pop() });
                }
            };
            img.src = url;
        });
    }

    function renderItems(allItems) {
        gallery.innerHTML = '';
        allItems.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'fap-item selected';
            div.dataset.w = item.w;
            div.dataset.h = item.h;

            div.innerHTML = `
                <input type="checkbox" class="fap-item-check" checked data-idx="${idx}">
                <img src="${item.url}" alt="${item.name}" loading="lazy">
                <div class="fap-item-info">
                    <span>${item.name}</span>
                    <span class="dim">${item.w > 0 ? item.w + '×' + item.h : '???'}</span>
                </div>
            `;
            div.querySelector('.fap-item-check').onchange = function() {
                div.classList.toggle('selected', this.checked);
                updateCount();
            };
            // click on item toggles checkbox
            div.onclick = e => {
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'IMG') return;
                if (e.target.tagName === 'IMG') {
                    const cb = div.querySelector('.fap-item-check');
                    cb.checked = !cb.checked;
                    div.classList.toggle('selected', cb.checked);
                    updateCount();
                }
            };
            gallery.appendChild(div);
        });
        // re-apply filter
        applyFilter();
    }

    // --- download selected ---
    async function downloadSelected() {
        const checked = gallery.querySelectorAll('.fap-item-check:checked');
        const urls = [];
        checked.forEach(cb => {
            const img = cb.closest('.fap-item').querySelector('img');
            if (img) urls.push(img.src);
        });
        if (!urls.length) return;

        dlBtn.disabled = true;
        dlBtn.textContent = '⬇ Pobieranie...';

        for (let i = 0; i < urls.length; i++) {
            dlBtn.textContent = `⬇ Pobieranie ${i + 1}/${urls.length}...`;
            try {
                await new Promise((resolve, reject) => {
                    // Użyj względnej ścieżki — pliki trafią do podfolderu modelu.
                    // Ustaw w przeglądarce domyślny folder pobierania na:
                    //   E:\Pozostałe\stuff\new\fapello\
                    // aby całość działała automatycznie.
                    GM_download({
                        url: urls[i],
                        name: modelName + '/' + urls[i].split('/').pop(),
                        onload: resolve,
                        onerror: reject,
                    });
                });
            } catch (e) {
                console.warn('Błąd:', urls[i], e);
            }
        }

        dlBtn.textContent = '✓ Gotowe';
        setTimeout(() => {
            dlBtn.disabled = false;
            dlBtn.textContent = `⬇ Pobierz (${urls.length})`;
        }, 2000);
    }

    // --- init ---
    buildModal();
    dlBtn.onclick = downloadSelected;

    btn.onclick = async () => {
        const urls = collectUrls();
        if (!urls.length) {
            alert('Nie znaleziono zdjęć.\nUpewnij się, że jesteś na stronie galerii (np. pl.fapello.com/model/), a nie na pojedynczym zdjęciu.');
            return;
        }
        overlay.classList.remove('hidden');
        await loadGallery(urls);
    };

})();
