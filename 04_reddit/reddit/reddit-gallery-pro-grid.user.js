// ==UserScript==
// @name         Reddit Image Gallery (Pro Grid Version)
// @namespace    https://tampermonkey.net/
// @version      6.2
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-gallery-pro-grid.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-gallery-pro-grid.user.js
// @match        https://www.reddit.com/*
// @connect      i.redd.it
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const LOAD_CONCURRENCY = 4;
    // Maks. odległość Hamminga (z 64 bitów dHash), przy której obrazy uznajemy za duplikat
    const NEAR_DUP_MAX = 10;
    // true = w konsoli (F12) wypisuje najbliższą odległość pHash każdego obrazu
    const DEBUG_DUP = false;
    // Skala centralnego kadru: pełny obraz oraz wersje przycięte, żeby łapać lekkie kadrowanie
    const PHASH_CROPS = [1, 0.92, 0.85];
    const IMG_EXT = { jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp' };

    function getTargetUser() {
        const path = location.pathname.split("/");
        return (path[1] === "user" || path[1] === "u") ? path[2] : null;
    }

    GM_addStyle(`
        #rg-overlay { position: fixed; inset: 0; background: #0b0b0b; z-index: 999999; overflow: auto; font-family: system-ui, sans-serif; color: #eee; }
        #rg-top { position: sticky; top: 0; background: #181818; padding: 12px 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; z-index: 1000; border-bottom: 1px solid #282828; }
        #rg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; padding: 20px; }

        .rg-card { background: #151515; border: 1px solid #252525; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; position: relative; }
        .rg-card:hover { border-color: #ff4500; }
        .rg-card img { width: 100%; height: 180px; object-fit: cover; border-radius: 4px; background: #000; }

        .rg-meta { font-size: 11px; color: #aaa; display: flex; justify-content: space-between; }
        .rg-title { font-size: 11px; line-height: 1.3; flex-grow: 1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .rg-select { display: flex; gap: 8px; font-size: 11px; cursor: pointer; font-weight: bold; }

        .rg-btn { background: #333; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 500; }
        .rg-btn:hover { background: #444; }
        .rg-btn-primary { background: #ff4500; font-weight: bold; }
        .rg-btn-primary:hover { background: #e03d00; }
        .rg-btn-success { background: #2f9e44; }

        .rg-filter { background: #222; border: 1px solid #444; color: white; padding: 5px 8px; border-radius: 4px; width: 75px; font-size: 12px; }
        .rg-badge { position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; font-size: 10px; font-family: monospace; }
    `);

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function extFromMime(mime) {
        return IMG_EXT[(mime || "").split("/")[1]?.toLowerCase()] || null;
    }

    function extFromUrl(url) {
        const m = url.split("?")[0].match(/\.(jpe?g|png|gif|webp)$/i);
        return m ? IMG_EXT[m[1].toLowerCase()] : null;
    }

    // Klucz identyfikujący grafikę na i.redd.it niezależnie od rozszerzenia i query string
    function mediaKey(url) {
        const clean = url.split("?")[0];
        const id = clean.match(/i\.redd\.it\/([A-Za-z0-9]+)/);
        return id ? id[1] : clean;
    }

    function injectLauncher() {
        const user = getTargetUser();
        if (!user || document.getElementById("rg-launcher")) return;

        const btn = document.createElement("button");
        btn.id = "rg-launcher";
        btn.className = "rg-btn rg-btn-primary";
        btn.textContent = "🖼️ Gallery";
        Object.assign(btn.style, { position: "fixed", top: "75px", right: "20px", zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" });

        btn.onclick = async () => {
            if (btn.disabled) return;
            btn.disabled = true;
            btn.textContent = "⏳ Scraping...";
            const data = await scrapeUserMedia(user, (count) => btn.textContent = `⏳ Found: ${count}`);
            btn.textContent = "🖼️ Gallery";
            btn.disabled = false;

            if (!data.length) return alert("No media found.");
            openGallery(data, user);
        };

        document.body.appendChild(btn);
    }

    async function scrapeUserMedia(username, onProgress) {
        let after = null, posts = [];
        do {
            try {
                const res = await fetch(`https://www.reddit.com/user/${username}/submitted.json?limit=100${after ? '&after='+after : ''}`);
                if (!res.ok) break;
                const json = await res.json();
                const children = json.data.children.map(c => c.data);
                posts.push(...children);
                onProgress(posts.length);
                after = json.data.after;
                if (after) await new Promise(r => setTimeout(r, 150)); // Anty-429 Rate Limit
            } catch (e) { break; }
        } while (after);

        const media = [];

        posts.forEach(p => {
            if (p.url && (extFromUrl(p.url) || p.url.startsWith("https://i.redd.it/"))) {
                media.push({ url: p.url, ext: extFromUrl(p.url), title: p.title, sub: p.subreddit, link: p.permalink });
            }
            if (p.gallery_data?.items) {
                p.gallery_data.items.forEach(item => {
                    const m = p.media_metadata?.[item.media_id];
                    const ext = extFromMime(m?.m); // pomija wideo i nieznane typy
                    if (!ext) return;
                    media.push({
                        url: `https://i.redd.it/${item.media_id}.${ext}`, ext,
                        title: p.title, sub: p.subreddit, link: p.permalink
                    });
                });
            }
        });

        // Deduplikacja po kluczu grafiki (ta sama grafika może mieć różne rozszerzenia lub query)
        const seen = new Set();
        return media.filter(m => {
            const key = mediaKey(m.url);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function fetchBlob(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url,
                responseType: "blob",
                timeout: 30000,
                onload: r => r.status === 200 ? resolve(r.response) : reject(new Error(`HTTP ${r.status}`)),
                onerror: () => reject(new Error("network")),
                ontimeout: () => reject(new Error("timeout")),
            });
        });
    }

    async function sha256(buffer) {
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    }

    // dHash 64 bity zapisany jako dwie liczby 32-bitowe [lo, hi]
    let phCanvas = null;
    function dHash(bitmap, scale) {
        if (!phCanvas) {
            phCanvas = document.createElement("canvas");
            phCanvas.width = 9;
            phCanvas.height = 8;
        }
        const ctx = phCanvas.getContext("2d", { willReadFrequently: true });
        const sw = Math.round(bitmap.width * scale), sh = Math.round(bitmap.height * scale);
        const sx = Math.round((bitmap.width - sw) / 2), sy = Math.round((bitmap.height - sh) / 2);
        ctx.imageSmoothingQuality = "high";
        ctx.clearRect(0, 0, 9, 8);
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, 9, 8);
        const d = ctx.getImageData(0, 0, 9, 8).data;
        const gray = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

        const out = [0, 0];
        let bit = 0;
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (gray((y * 9 + x) * 4) > gray((y * 9 + x + 1) * 4)) {
                    out[bit >> 5] |= 1 << (bit & 31);
                }
                bit++;
            }
        }
        return out;
    }

    // Hashe dla pełnego obrazu i kilku wersji przyciętych
    async function perceptualHashes(blob) {
        const bitmap = await createImageBitmap(blob);
        try {
            return PHASH_CROPS.map(scale => dHash(bitmap, scale));
        } finally {
            bitmap.close();
        }
    }

    function popcount32(x) {
        x = x - ((x >>> 1) & 0x55555555);
        x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
        return Math.imul((x + (x >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24;
    }

    function hamming(a, b) {
        return popcount32((a[0] ^ b[0]) >>> 0) + popcount32((a[1] ^ b[1]) >>> 0);
    }

    function minDistance(cur, seenList) {
        let best = Infinity;
        seenList.forEach(prev => prev.forEach(a => cur.forEach(b => {
            best = Math.min(best, hamming(a, b));
        })));
        return best;
    }

    function isNearDuplicate(cur, seenList) {
        return minDistance(cur, seenList) <= NEAR_DUP_MAX;
    }

    function openGallery(images, username) {
        const overlay = document.createElement("div");
        overlay.id = "rg-overlay";
        overlay.innerHTML = `
            <div id="rg-top">
                <button class="rg-btn" id="rg-all">Select All</button>
                <button class="rg-btn" id="rg-none">Select None</button>
                <button class="rg-btn rg-btn-success" id="rg-dl">Download (0)</button>

                <div style="display:flex; gap:6px; align-items:center; margin-left: 10px;">
                    <span style="font-size:12px; color:#aaa;">Min Size:</span>
                    <input id="rg-minw" class="rg-filter" type="number" placeholder="Width">
                    <span>×</span>
                    <input id="rg-minh" class="rg-filter" type="number" placeholder="Height">
                </div>

                <span id="rg-counter" style="margin-left:auto; font-size:12px; color:#aaa;"></span>
                <button class="rg-btn" id="rg-close" style="background:#c92a2a; color:white;">✕ Close</button>
            </div>
            <div id="rg-grid"></div>
        `;

        document.body.appendChild(overlay);

        const grid = overlay.querySelector("#rg-grid");
        const dlBtn = overlay.querySelector("#rg-dl");
        const counter = overlay.querySelector("#rg-counter");
        const selectedUrls = new Map(); // url -> item
        const objectUrls = [];
        const seenHashes = new Set();
        const seenPhashes = [];
        let total = images.length;
        let dupCount = 0;

        function updateStats() {
            const visibleCards = grid.querySelectorAll('.rg-card:not([style*="display: none"])');
            dlBtn.textContent = `Download (${selectedUrls.size})`;
            const dupInfo = dupCount ? ` · duplikaty usunięte: ${dupCount}` : "";
            counter.textContent = `Showing ${visibleCards.length} of ${total}${dupInfo}`;
        }

        function testCardVisibility(card) {
            const minW = parseInt(overlay.querySelector("#rg-minw").value || 0);
            const minH = parseInt(overlay.querySelector("#rg-minh").value || 0);
            const w = parseInt(card.dataset.w || 0);
            const h = parseInt(card.dataset.h || 0);

            // Ukryj jeśli wymiar jest za mały (karty bez wczytanego wymiaru nie są filtrowane)
            if (card.dataset.loaded === "true" && (w < minW || h < minH)) {
                card.style.display = 'none';
                const cb = card.querySelector('input[type="checkbox"]');
                if (cb.checked) { cb.checked = false; selectedUrls.delete(card.dataset.url); }
            } else {
                card.style.display = '';
            }
        }

        function markError(card, item) {
            const cb = card.querySelector('input[type="checkbox"]');
            card.dataset.loaded = "error";
            cb.checked = false;
            cb.disabled = true;
            selectedUrls.delete(item.url);
            card.querySelector(".rg-badge").textContent = "✖ błąd";
            updateStats();
        }

        function buildCard(item) {
            const card = el("div", "rg-card");
            card.dataset.url = item.url;
            card.dataset.loaded = "false";

            const label = el("label", "rg-select");
            const cb = el("input");
            cb.type = "checkbox";
            label.append(cb, " Select");

            const img = el("img");
            img.alt = "";
            const badge = el("span", "rg-badge", "⏳");

            const sub = el("span", null, `r/${item.sub}`);
            sub.style.color = "#ff4500";
            const thread = el("a", null, "Thread ↗");
            thread.href = `https://reddit.com${item.link}`;
            thread.target = "_blank";
            thread.style.cssText = "color:#4dabf7; text-decoration:none;";
            const meta = el("div", "rg-meta", null);
            meta.append(sub, thread);

            const title = el("div", "rg-title", item.title);
            title.title = item.title;

            card.rgItem = item;
            card.append(label, img, badge, meta, title);

            img.onload = () => {
                card.dataset.w = img.naturalWidth;
                card.dataset.h = img.naturalHeight;
                card.dataset.loaded = "true";
                badge.textContent = `${img.naturalWidth}×${img.naturalHeight}`;
                testCardVisibility(card);
                updateStats();
            };
            img.onerror = () => markError(card, item);

            cb.onchange = () => {
                cb.checked ? selectedUrls.set(item.url, item) : selectedUrls.delete(item.url);
                updateStats();
            };

            return card;
        }

        // Pobiera obraz raz: wykrywa duplikaty po zawartości (SHA-256) i używa tego samego blobu jako miniatury
        async function loadCard(card, item) {
            try {
                const blob = await fetchBlob(item.url);
                const hash = await sha256(await blob.arrayBuffer());
                if (!overlay.isConnected) return;

                const phashes = await perceptualHashes(blob);
                if (!overlay.isConnected) return;

                if (DEBUG_DUP) {
                    console.log(`[rg] ${item.url} najbliższy=${minDistance(phashes, seenPhashes)} (próg ${NEAR_DUP_MAX})`);
                }

                if (seenHashes.has(hash) || isNearDuplicate(phashes, seenPhashes)) {
                    selectedUrls.delete(item.url);
                    card.remove();
                    total--;
                    dupCount++;
                    updateStats();
                    return;
                }
                seenHashes.add(hash);
                seenPhashes.push(phashes);

                item.ext = extFromMime(blob.type) || item.ext || "jpg";
                const objUrl = URL.createObjectURL(blob);
                objectUrls.push(objUrl);
                card.querySelector("img").src = objUrl;
            } catch (e) {
                markError(card, item);
            }
        }

        const cards = images.map(item => {
            const card = buildCard(item);
            grid.appendChild(card);
            return card;
        });

        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < images.length && overlay.isConnected) {
                const i = nextIndex++;
                await loadCard(cards[i], images[i]);
            }
        };
        Array.from({ length: LOAD_CONCURRENCY }, worker);

        // Event Listenery
        overlay.querySelector("#rg-close").onclick = () => {
            overlay.remove();
            objectUrls.forEach(u => URL.revokeObjectURL(u));
        };

        const filterInputs = overlay.querySelectorAll(".rg-filter");
        filterInputs.forEach(inp => inp.oninput = () => {
            grid.querySelectorAll('.rg-card').forEach(testCardVisibility);
            updateStats();
        });

        overlay.querySelector("#rg-all").onclick = () => {
            grid.querySelectorAll('.rg-card:not([style*="display: none"])').forEach(card => {
                const cb = card.querySelector('input[type="checkbox"]');
                if (cb.disabled) return;
                cb.checked = true;
                selectedUrls.set(card.rgItem.url, card.rgItem);
            });
            updateStats();
        };

        overlay.querySelector("#rg-none").onclick = () => {
            selectedUrls.clear();
            grid.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            updateStats();
        };

        dlBtn.onclick = () => {
            if (!selectedUrls.size) return;
            let i = 1;
            selectedUrls.forEach(item => {
                const ext = item.ext || "jpg";
                GM_download({ url: item.url, name: `${username}_${String(i++).padStart(3, '0')}.${ext}` });
            });
        };

        updateStats();
    }

    // Strażnik nawigacji SPA
    setInterval(() => {
        const u = getTargetUser();
        const b = document.getElementById("rg-launcher");
        if (u && !b) injectLauncher();
        else if (!u && b) b.remove();
    }, 1000);

})();
