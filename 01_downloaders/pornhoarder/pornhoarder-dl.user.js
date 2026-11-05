// ==UserScript==
// @name         PornHoarder Download Helper
// @namespace    http://tampermonkey.net/
// @version      1.10.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pornhoarder/pornhoarder-dl.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/pornhoarder/pornhoarder-dl.user.js
// @description  Pobiera filmy z PornHoarder.gd bez opuszczania strony - wyciaga zrodlo wideo z playera
// @author       You
// @match        https://pornhoarder.gd/pornvideo/*
// @match        https://pornhoarder.net/*
// @match        *://*.playmogo.com/*
// @match        *://*.streamtape.com/*
// @match        *://*.streamtape.to/*
// @match        *://*.doodstream.com/*
// @match        *://*.dood.re/*
// @match        *://*.lulustream.com/*
// @match        *://*.luluvdo.com/*
// @match        *://*.luluvido.com/*
// @match        *://*.luluvid.com/*
// @match        *://*.filemoon.to/*
// @match        *://*.filemoon.sx/*
// @match        *://*.streamwish.to/*
// @match        *://*.vidguard.com/*
// @match        *://*.voe.sx/*
// @match        *://*.mixdrop.co/*
// @match        *://*.mixdrop.to/*
// @match        *://*.bigwarp.io/*
// @match        *://*.netu.tv/*
// @match        *://*.veev.to/*
// @match        *://*.vidhide.com/*
// @match        *://*.vidnest.gg/*
// @icon         https://pornhoarder.gd/favicon-32x32.png
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      pornhoarder.net
// @connect      pornhoarder.gd
// @connect      streamtape.com
// @connect      streamtape.to
// @connect      doodstream.com
// @connect      doodcdn.co
// @connect      cloudatacdn.com
// @connect      playmogo.com
// @connect      lulustream.com
// @connect      luluvdo.com
// @connect      luluvido.com
// @connect      luluvid.com
// @connect      filemoon.to
// @connect      filemoon.sx
// @connect      streamwish.to
// @connect      vidguard.com
// @connect      voe.sx
// @connect      mixdrop.co
// @connect      mixdrop.to
// @connect      bigwarp.io
// @connect      netu.tv
// @connect      veev.to
// @connect      vidhide.com
// @connect      vidnest.gg
// @connect      *
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const KNOWN = ['streamtape', 'dood', 'playmogo', 'lulustream', 'luluvdo', 'luluvido', 'luluvid',
        'filemoon', 'streamwish', 'vidguard', 'voe', 'mixdrop', 'bigwarp', 'netu', 'veev', 'vidhide', 'vidnest'];

    function qs(s, c) { return (c || document).querySelector(s); }

    // ==================== RAMKA (player.php / strony providerow) ====================
    // Ten sam userscript uruchamia sie w kazdej ramce pasujacej do @match.
    // Obserwujemy DOM ramki: gdy pojawi sie iframe providera lub <video> ze zrodlem,
    // wysylamy jego URL do strony glownej (window.top) - bez redirectow i popupow.
    if (window.top !== window) {
        const sendTop = o => {
            console.log('[PH] ramka', location.hostname, 'wysyla', o.__ph, o.url || '');
            try { window.top.postMessage(o, '*'); } catch (e) {}
        };
        const isHttp = s => typeof s === 'string' && /^https?:\/\//i.test(s);

        const pushIframe = f => {
            const s = f.getAttribute('src') || f.src;
            if (isHttp(s)) sendTop({ __ph: 'provider', url: s });
        };
        const pushVideo = v => {
            const s = v.currentSrc || v.getAttribute('src');
            if (isHttp(s)) sendTop({ __ph: 'video', url: s });
        };
        const clickPlay = () => {
            const pb = document.getElementById('play-button');
            if (pb) { try { pb.click(); } catch (e) {} }
        };

        const startObserve = () => {
            sendTop({ __ph: 'report' });
            document.querySelectorAll('iframe').forEach(pushIframe);
            document.querySelectorAll('video').forEach(pushVideo);
            new MutationObserver(muts => {
                muts.forEach(m => m.addedNodes.forEach(n => {
                    if (n.nodeType !== 1) return;
                    if (n.tagName === 'IFRAME') pushIframe(n);
                    if (n.tagName === 'VIDEO') pushVideo(n);
                    if (n.querySelectorAll) {
                        n.querySelectorAll('iframe').forEach(pushIframe);
                        n.querySelectorAll('video').forEach(pushVideo);
                    }
                }));
            }).observe(document.documentElement, { childList: true, subtree: true });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(startObserve, 400));
        } else {
            setTimeout(startObserve, 400);
        }

        window.addEventListener('message', e => {
            if (!e.data || e.data.__ph === undefined) return;
            if (e.data.__ph === 'activate') clickPlay();
            else if (e.data.__ph === 'report') {
                const r = { __ph: 'sources', iframes: [], videos: [] };
                document.querySelectorAll('iframe').forEach(f => {
                    const s = f.getAttribute('src') || '';
                    if (isHttp(s)) r.iframes.push(s);
                });
                document.querySelectorAll('video').forEach(v => {
                    const s = v.currentSrc || v.getAttribute('src') || '';
                    if (isHttp(s)) r.videos.push(s);
                });
                sendTop(r);
            }
        });
        return;
    }

    // ==================== STRONA PORN HOARDER (.gd) ====================
    if (location.hostname.indexOf('pornhoarder.gd') !== -1) {
        pageMain();
        return;
    }

    // ============================================================

    function pageMain() {
        GM_addStyle(`
            .ph-wrap { margin: 10px 0 15px; }
            .ph-btn {
                display: inline-flex; align-items: center; gap: 6px;
                padding: 8px 18px; border: none; border-radius: 8px; cursor: pointer;
                font-size: 13px; font-weight: 600; font-family: Arial, sans-serif;
                text-transform: uppercase; text-decoration: none; color: #fff;
                background: linear-gradient(135deg, #fb7b00, #e06a00);
                box-shadow: 0 2px 12px rgba(251,123,0,.4); transition: all .2s;
            }
            .ph-btn:hover { transform: scale(1.05); }
            .ph-btn:active { transform: scale(.95); }
            .ph-btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
            .ph-btn .spin {
                display: none; width: 14px; height: 14px;
                border: 2px solid rgba(255,255,255,.3);
                border-top-color: #fff; border-radius: 50%;
                animation: phsp .6s linear infinite;
            }
            .ph-btn.loading .spin { display: inline-block; }
            @keyframes phsp { to { transform: rotate(360deg); } }
            .ph-prog-card {
                position: fixed; z-index: 999999; top: 20px; right: 20px; width: 320px;
                background: #1a1a2e; color: #fff; padding: 12px 20px; border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,.8); font-size: 13px;
                font-family: Arial, sans-serif; transition: opacity .4s;
            }
            .ph-prog-head { margin-bottom: 6px; word-break: break-all; }
            .ph-prog-text { font-size: 11px; color: #aaa; margin-bottom: 4px; }
            .ph-prog-bar {
                width: 100%; height: 6px; background: #333;
                border-radius: 3px; overflow: hidden;
            }
            .ph-prog-fill {
                height: 100%; width: 0%; background: linear-gradient(90deg, #fb7b00, #ff9a3d);
                border-radius: 3px; transition: width .2s;
            }
            .ph-btn-cancel {
                margin-top: 8px; padding: 4px 12px; border: 1px solid #555;
                border-radius: 4px; cursor: pointer; font-size: 11px; color: #ccc; background: #333;
            }
            .ph-btn-cancel:hover { background: #555; color: #fff; }
        `);

        const src = { provider: null, video: null };
        let videoFromProvider = null;

        const BAD = ['bingebang', 'wpadmngr', 'pornhoarder.pics', 'exoclick', 'adsterra',
            'propellerads', 'popads', 'doubleclick', 'googlesyndication', 'cloudflare'];

        const looksProvider = url => {
            try {
                const u = new URL(url);
                const h = u.hostname;
                if (BAD.some(b => h.indexOf(b) !== -1)) return false;
                if (KNOWN.some(k => h.indexOf(k) !== -1)) return true;
                if (/\.(mp4|m3u8|webm)([?#]|$)/i.test(u.pathname)) return true;
                // Sciezki embed (/e/, /d/, /v/, /embed/) to typowe providery - akceptujemy
                // nawet gdy host nie jest jeszcze w KNOWN (przyszlosciowe nowe domeny).
                if (/(\/e\/|\/d\/|\/v\/|\/embed\/|\/download\/)/i.test(u.pathname)) return true;
                return false;
            } catch (e) { return false; }
        };

        // URL z elementu <video> w ramce providera - akceptujemy kazdy http(s) poza reklamami.
        // Doodstream serwuje tokenizowane URL-e CDN (cloudatacdn.com) bez rozszerzenia w sciezce.
        const looksVideo = url => {
            if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
            try {
                const h = new URL(url).hostname;
                if (BAD.some(b => h.indexOf(b) !== -1)) return false;
                return true;
            } catch (e) { return false; }
        };

        window.addEventListener('message', e => {
            if (!e.data || e.data.__ph === undefined) return;
            if (e.data.__ph === 'provider') {
                console.log('[PH] STRONA: msg provider', e.data.url, '| looksProvider =', looksProvider(e.data.url));
                if (looksProvider(e.data.url) && !src.provider) {
                    src.provider = e.data.url;
                    console.log('[PH] STRONA: provider =', e.data.url);
                }
            } else if (e.data.__ph === 'video') {
                console.log('[PH] STRONA: msg video', e.data.url, '| looksVideo =', looksVideo(e.data.url), '| looksProvider =', looksProvider(e.data.url));
                if (e.data.url && looksVideo(e.data.url) && !src.video) {
                    src.video = e.data.url;
                    console.log('[PH] STRONA: video =', e.data.url);
                }
            } else if (e.data.__ph === 'sources') {
                (e.data.iframes || []).forEach(u => { if (looksProvider(u) && !src.provider) { src.provider = u; console.log('[PH] STRONA: provider(z raportu) =', u); } });
                (e.data.videos || []).forEach(u => { if (looksVideo(u) && !src.video) { src.video = u; console.log('[PH] STRONA: video(z raportu) =', u); } });
            }
        });

        const playerIframe = () =>
            qs('.video-player iframe') ||
            document.querySelector('iframe[src*="pornhoarder.net"]');

        const poke = () => {
            const f = playerIframe();
            if (f && f.contentWindow) {
                console.log('[PH] STRONA: poke -> playera', f.src || '(brak src)');
                try { f.contentWindow.postMessage({ __ph: 'activate' }, '*'); } catch (e) { console.log('[PH] STRONA: akt no?', e); }
                try { f.contentWindow.postMessage({ __ph: 'report' }, '*'); } catch (e) { console.log('[PH] STRONA: raport no?', e); }
            } else {
                console.log('[PH] STRONA: brak ramki playera!');
            }
        };

        // Gdyby player sam nawigowal do providera (src iframe ulega zmianie):
        new MutationObserver(() => {
            document.querySelectorAll('iframe').forEach(f => {
                const s = f.getAttribute('src');
                if (s && looksProvider(s) && !src.provider) src.provider = s;
            });
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

        const sleep = ms => new Promise(r => setTimeout(r, ms));

        function fetchProvPage(url) {
            return new Promise((ok, fail) => {
                GM_xmlhttpRequest({
                    method: 'GET', url: url,
                    onload: r => ok(r.responseText),
                    onerror: () => fail('błąd pobierania strony providera')
                });
            });
        }

        async function resolveProvider(providerUrl) {
            if (/\.(mp4|m3u8|webm)([?#]|$)/i.test(providerUrl)) return providerUrl;
            const html = await fetchProvPage(providerUrl);
            const url = extractVidUrl(html, providerUrl);
            if (!url) throw new Error('Nie znaleziono URL wideo u providera');
            return url;
        }

        async function getSourceUrl() {
            poke();
            const t0 = Date.now();
            while (Date.now() - t0 < 25000) {
                console.log('[PH] STRONA: petla -', { video: src.video || null, provider: src.provider || null });
                if (src.video) return { url: src.video, prov: src.provider };
                if (src.provider && !videoFromProvider) {
                    const p = src.provider;
                    try {
                        videoFromProvider = await resolveProvider(p);
                        console.log('[PH] STRONA: z providera ->', videoFromProvider);
                    } catch (e) {
                        console.log('[PH] STRONA: resolveProvider blad:', (e && e.message) || e);
                    }
                }
                if (videoFromProvider) return { url: videoFromProvider, prov: src.provider };
                await sleep(500);
                poke();
            }
            throw new Error('Nie wykryto źródła video. Naciśnij Play w playerze (lub rozwiąż captchę) i spróbuj ponownie. (- szczegóły w konsoli [PH])');
        }

        function extractVidUrl(html, provUrl) {
            const host = new URL(provUrl).hostname;
            let url = null;

            // Deobfuskuj Dean Edwards packer (uzywany przez luluvdo/JW Player)
            const cleanHtml = deobfuscatePacked(html);

            // Streamtape
            if (host.includes('streamtape')) {
                const m = html.match(/<div[^>]*id="norobotlink"[^>]*>([^<]+)<\/div>/);
                if (m) url = 'https:' + m[1].trim();
                if (!url) {
                    const m2 = html.match(/<div[^>]*id="ideoooolink"[^>]*>([^<]+)<\/div>/);
                    if (m2) url = 'https:' + m2[1].trim();
                }

            // Doodstream / Dood
            } else if (host.includes('dood')) {
                const m = html.match(/href="(\/download\/[^"]+)"/);
                if (m) { const p = new URL(provUrl); url = p.protocol + '//' + p.hostname + m[1]; }
                if (!url) {
                    const m2 = html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/);
                    if (m2) url = m2[1];
                }

            // Lulustream / Luluvdo / Luluvido (JW Player, czesto Dean Edwards packed)
            } else if (host.includes('lulustream') || host.includes('luluvdo') ||
                       host.includes('luluvido') || host.includes('luluvid')) {
                const m = cleanHtml.match(/var\s+durl\s*=\s*"([^"]+)"/);
                if (m) { try { url = atob(m[1]); } catch(e) {} }
                if (!url) {
                    const m2 = cleanHtml.match(/["']?(?:source|file|hls|playlist)["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"']*)/i);
                    if (m2) url = m2[1];
                }
                if (!url) {
                    const m3 = cleanHtml.match(/["']?file["']?\s*:\s*["'](https?:\/\/[^"']+\.(mp4|m3u8)[^"']*)/i);
                    if (m3) url = m3[1];
                }
                if (!url) {
                    const m4 = cleanHtml.match(/(https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*)/);
                    if (m4) url = m4[1];
                }

            // Filemoon / Veev
            } else if (host.includes('filemoon') || host.includes('veev')) {
                const m = html.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/);
                if (m) url = m[1];
                if (!url) {
                    const m2 = html.match(/src\s*:\s*["'](https?:\/\/[^"']+\.(mp4|m3u8)[^"']*)/);
                    if (m2) url = m2[1];
                }

            // Streamwish
            } else if (host.includes('streamwish')) {
                const m = html.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/);
                if (m) url = m[1];
                if (!url) {
                    const m2 = html.match(/sources\s*:\s*\[\s*\{\s*["']?file["']?\s*:\s*["'](https?:\/\/[^"']+)/);
                    if (m2) url = m2[1];
                }

            // VidGuard
            } else if (host.includes('vidguard')) {
                const m = html.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/);
                if (m) url = m[1];
                if (!url) {
                    const m2 = html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/);
                    if (m2) url = m2[1];
                }

            // VOE
            } else if (host.includes('voe')) {
                const m = html.match(/var\s+sources?\s*=\s*\{[^}]*["']?file["']?\s*:\s*["'](https?:\/\/[^"']+)/);
                if (m) url = m[1];
                if (!url) {
                    const m2 = html.match(/["']?(video_url|file)["']?\s*:\s*["'](https?:\/\/[^"']+)/);
                    if (m2) url = m2[1];
                }

            // Mixdrop
            } else if (host.includes('mixdrop')) {
                const m = html.match(/MDCore\.Wiz\.url\s*=\s*["']([^"']+)/);
                if (m) url = m[1];
                if (!url) {
                    const m2 = html.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/);
                    if (m2) url = m2[1];
                }

            // Bigwarp
            } else if (host.includes('bigwarp')) {
                const m = html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/);
                if (m) url = m[1];
                if (!url) {
                    const m2 = html.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/);
                    if (m2) url = m2[1];
                }

            // Netu
            } else if (host.includes('netu')) {
                const m = html.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/);
                if (m) url = m[1];

            // Vidhide
            } else if (host.includes('vidhide')) {
                const m = html.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/);
                if (m) url = m[1];
                if (!url) {
                    const m2 = html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/);
                    if (m2) url = m2[1];
                }

            // Vidnest
            } else if (host.includes('vidnest')) {
                const m = html.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/);
                if (m) url = m[1];
                if (!url) {
                    const m2 = html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/);
                    if (m2) url = m2[1];
                }

            // Playmogo (doodstream embed proxy)
            } else if (host.includes('playmogo')) {
                const m = html.match(/href="(\/download\/[^"]+)"/);
                if (m) { const p = new URL(provUrl); url = p.protocol + '//' + p.hostname + m[1]; }
                if (!url) {
                    const m2 = html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/);
                    if (m2) url = m2[1];
                }

            // Generyczny fallback - szukaj m3u8/mp4 w calej stronie (z deobfuskacja)
            } else {
                const m = html.match(/<source[^>]+src="([^"]+)"/);
                if (m) url = m[1].startsWith('http') ? m[1] : 'https:' + m[1];
            }

            // Ostateczny fallback: szukaj m3u8/mp4 w calym HTML (niezaleznie od providera)
            if (!url) url = extractGenericUrl(cleanHtml);

            return url;
        }

        function getTitle() {
            const h1 = qs('.video-detail-content h1');
            return h1 ? h1.textContent.trim() : 'video';
        }

        function fmtSize(b) {
            if (!b) return '?';
            const u = ['B','KB','MB','GB'];
            let i = 0;
            let s = b;
            while (s >= 1024 && i < 3) { s /= 1024; i++; }
            return s.toFixed(i > 0 ? 1 : 0) + ' ' + u[i];
        }

        // Czytelny opis bledu z obiektu event (GM nie daje go w .message).
        const errMsg = e => {
            if (!e) return 'błąd pobierania';
            if (typeof e === 'string') return e;
            if (e.message) return String(e.message);
            if (e.error) return String(e.error) + (e.details ? ' (' + e.details + ')' : '');
            if (e.details) return String(e.details);
            if (e.status) return 'HTTP ' + e.status;
            return JSON.stringify(e);
        };

        // Dynamiczny Referer per provider - doodstream CDN sprawdza Referer,
        // uzywamy adresu ramki providera, przy ktorym wideo odtwarzalo sie w przegladarce.
        const dlHeadersFor = prov => ({ Referer: prov || 'https://playmogo.com/' });

        // Pobieranie HLS - master.m3u8 → najwyzszy wariant → segmenty → sklejony blob.
        // Obsluguje szyfrowanie AES-128 (EXT-X-KEY, IV z atrybutu lub numeru sekwencji)
        // oraz segmenty inicjujace EXT-X-MAP (fMP4) - wowczas wynik zapisujemy jako .mp4.
        async function downloadHls(masterUrl, fname, prov) {
            phCancelled = false;
            phShowProg(fname, prov);
            const headers = dlHeadersFor(prov);

            // Linki HLS z tokenem (np. cdn-tnmr.org) wygasaja po kilku minutach - czytelny blad.
            const dlerr = e => {
                const m = errMsg(e);
                if (/403|410/.test(m)) return new Error('Link HLS wygasl (HTTP ' + (m.match(/40[13]/) || ['403'])[0] + ') - odswiez strone/player i sprobuj ponownie');
                return null;
            };

            let masterText;
            try {
                masterText = await gmFetch(masterUrl, { headers });
            } catch (e) {
                throw dlerr(e) || new Error('Blad pobierania master.m3u8: ' + errMsg(e));
            }

            // Pobierz wariant (jezeli jest)
            let mediaUrl = masterUrl;
            const variants = parseMaster(masterText, masterUrl);
            if (variants.length) mediaUrl = variants[0].uri;

            let mediaText;
            try {
                mediaText = await gmFetch(mediaUrl, { headers });
            } catch (e) {
                throw dlerr(e) || new Error('Blad pobierania m3u8: ' + errMsg(e));
            }

            // Playlista z kluczami/IV per segment (klucz moze sie zmieniac w trakcie)
            const playlist = parseMediaPlaylist(mediaText, mediaUrl);
            const segments = playlist.segments;
            if (!segments.length) throw new Error('Brak segmentow w m3u8');

            const keyCache = new Map();

            // Pobierz jeden zasob HLS i odszyfruj go, jesli jest zaszyfrowany.
            const fetchPart = async item => {
                const buf = await gmFetchBin(item.url, { headers });
                if (!item.key) return buf;
                const key = await importAesKey(item.key.uri, headers, keyCache);
                try {
                    return await hlsDecrypt(buf, key, hlsIv(item));
                } catch (e) {
                    throw new Error('Odszyfrowanie AES-128 nieudane (' + String(item.url).slice(-48) + ')');
                }
            };

            // Init segment (EXT-X-MAP) - dla fMP4 musi byc na poczatku pliku.
            let initPart = null;
            if (playlist.map && playlist.map.uri) {
                const mapItem = {
                    url: playlist.map.uri,
                    key: playlist.map.key,
                    // Bez IV w EXT-X-KEY obowiazuje numer sekwencji pierwszego segmentu.
                    seq: playlist.map.key && playlist.map.key.iv ? 0 : segments[0].seq
                };
                try {
                    initPart = await fetchPart(mapItem);
                } catch (e) {
                    throw new Error('Blad pobierania EXT-X-MAP: ' + errMsg(e));
                }
            }

            // Pobierz segmenty (binary, z odszyfrowaniem AES-128)
            const CONCURRENCY = 5;
            const parts = new Array(segments.length);
            let downloaded = 0;
            let totalBytes = 0;
            let expired = false;
            const queue = segments.map((s, i) => ({ s, i }));
            const worker = async () => {
                while (queue.length && !phCancelled) {
                    const { s, i } = queue.shift();
                    try {
                        const buf = await fetchPart(s);
                        parts[i] = buf;
                        downloaded++;
                        totalBytes += buf.byteLength;
                        const pct = (downloaded / segments.length) * 90;
                        phUpdProg(pct, totalBytes, 0);
                    } catch (e) {
                        const m = errMsg(e);
                        if (/40[13]|HTTP 403/.test(m)) expired = true;
                        console.log('[PH] HLS segment', i, 'blad:', m);
                    }
                }
            };
            const workers = [];
            for (let w = 0; w < Math.min(CONCURRENCY, segments.length); w++) workers.push(worker());
            await Promise.all(workers);
            if (phCancelled) throw new Error('Anulowano');
            if (downloaded < segments.length) {
                if (expired) throw new Error('Link HLS wygasl (HTTP 403) - odswiez strone/player i sprobuj ponownie');
                throw new Error('Pobrano ' + downloaded + '/' + segments.length + ' segmentow');
            }

            // Sklej w oryginalnej kolejnosci; fMP4 wymaga init segmentu na poczatku.
            const isFmp4 = !!initPart;
            const merged = new Blob((isFmp4 ? [initPart] : []).concat(parts),
                { type: isFmp4 ? 'video/mp4' : 'video/mp2t' });
            const outFname = fname.replace(/\.m3u8$/i, '') + (isFmp4 ? '.mp4' : '.ts');
            phUpdProg(100, merged.size, merged.size);
            saveBlob(merged, outFname);
            phCloseProg(false);
            phNotify('Pobrano HLS! Zapis: ' + outFname, 'success');
        }

        function phNotify(msg, type) {
            const colors = { info: '#2196F3', success: '#4CAF50', error: '#f44336' };
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;opacity:1;transition:opacity .4s;font-family:Arial,sans-serif;pointer-events:none;';
            el.innerHTML = '<div style="background:' + colors[type] + ';color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.4);font-size:14px;">' + msg + '</div>';
            document.body.appendChild(el);
            setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 4000);
        }

        let phReqs = [];       // aktywne requesty pobierania (do abort - tablica)
        let phProg = null;     // karta postępu
        let phCancelled = false;

        const phShowProg = (fname, prov) => {
            phCloseProg(true);
            phProg = document.createElement('div');
            phProg.className = 'ph-prog-card';
            phProg.innerHTML = '<div class="ph-prog-head">Pobieranie: <strong>' + fname + '</strong></div>' +
                '<div class="ph-prog-text">0% · 0 B / ?</div>' +
                '<div class="ph-prog-bar"><div class="ph-prog-fill"></div></div>' +
                '<div><button class="ph-btn-cancel">Anuluj</button></div>';
            phProg.querySelector('.ph-btn-cancel').addEventListener('click', () => {
                phCancelled = true;
                phReqs.forEach(r => { try { r.abort(); } catch (e) {} });
                phReqs = [];
            });
            document.body.appendChild(phProg);
        };

        const phUpdProg = (pct, loaded, total) => {
            if (!phProg) return;
            const fill = phProg.querySelector('.ph-prog-fill');
            const text = phProg.querySelector('.ph-prog-text');
            if (fill) fill.style.width = Math.min(pct, 100) + '%';
            if (text) text.textContent = Math.round(pct) + '% · ' + fmtSize(loaded) + ' / ' + (total ? fmtSize(total) : '?');
        };

        const phCloseProg = instant => {
            if (!phProg) return;
            const p = phProg;
            phProg = null;
            if (instant) { p.remove(); return; }
            p.style.opacity = '0';
            setTimeout(() => p.remove(), 400);
        };

        // Pobieranie blob do pamieci - z postepem i przyciskiem Anuluj.
        async function dlWithProgress(url, fname, prov) {
            phCancelled = false;
            phShowProg(fname, prov);
            const blob = await new Promise((ok, fail) => {
                const req = GM_xmlhttpRequest({
                    method: 'GET', url: url, responseType: 'blob',
                    headers: dlHeadersFor(prov),
                    onprogress: p => {
                        if (p.total > 0) phUpdProg((p.loaded / p.total) * 100, p.loaded, p.total);
                        else phUpdProg(0, p.loaded, 0);
                    },
                    onload: r => {
                        phReqs = phReqs.filter(x => x !== req);
                        if (r.status && r.status !== 200) fail('HTTP ' + r.status);
                        else ok(r.response);
                    },
                    onerror: e => { phReqs = phReqs.filter(x => x !== req); fail(errMsg(e)); },
                    ontimeout: () => { phReqs = phReqs.filter(x => x !== req); fail('Timeout pobierania'); }
                });
                phReqs.push(req);
            });
            if (!blob) throw new Error('Brak danych');
            if (blob.type && blob.type.includes('text/html')) throw new Error('Serwer zwrócił HTML zamiast video');
            phUpdProg(100, blob.size, blob.size);
            saveBlob(blob, fname);
            phCloseProg(false);
            phNotify('Pobrano! Zapis: ' + fname, 'success');
        }

        // Zapis blob przez <a download> - zgodny z blob-fetch
        function saveBlob(blob, fname) {
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = fname;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { a.remove(); URL.revokeObjectURL(objUrl); }, 5000);
        }

        // Pobieranie tekstu przez GM_xmlhttpRequest (omija CORS)
        function gmFetch(url, opts) {
            return new Promise((ok, fail) => {
                const req = GM_xmlhttpRequest({
                    method: 'GET', url: url,
                    headers: opts && opts.headers || {},
                    onload: r => {
                        phReqs = phReqs.filter(x => x !== req);
                        if (r.status && r.status !== 200) fail('HTTP ' + r.status);
                        else ok(r.responseText);
                    },
                    onerror: e => { phReqs = phReqs.filter(x => x !== req); fail(errMsg(e)); },
                    ontimeout: () => { phReqs = phReqs.filter(x => x !== req); fail('Timeout'); }
                });
                if (opts && opts.track !== false) phReqs.push(req);
            });
        }

        // Pobieranie BINARNYCH danych (segmenty .ts / fMP4 / klucz AES) jako ArrayBuffer.
        // ArrayBuffer (a nie blob) jest potrzebny do odszyfrowania przez WebCrypto.
        function gmFetchBin(url, opts) {
            return new Promise((ok, fail) => {
                const req = GM_xmlhttpRequest({
                    method: 'GET', url: url, responseType: 'arraybuffer',
                    headers: opts && opts.headers || {},
                    onload: r => {
                        phReqs = phReqs.filter(x => x !== req);
                        if (r.status && r.status !== 200) fail('HTTP ' + r.status);
                        else if (!r.response) fail('Brak danych');
                        else ok(r.response);
                    },
                    onerror: e => { phReqs = phReqs.filter(x => x !== req); fail(errMsg(e)); },
                    ontimeout: () => { phReqs = phReqs.filter(x => x !== req); fail('Timeout'); }
                });
                if (opts && opts.track !== false) phReqs.push(req);
            });
        }

        // Pobieranie BINARNYCH danych (segmenty .ts) jako blob
        function gmFetchBlob(url, opts) {
            return new Promise((ok, fail) => {
                const req = GM_xmlhttpRequest({
                    method: 'GET', url: url, responseType: 'blob',
                    headers: opts && opts.headers || {},
                    onload: r => {
                        phReqs = phReqs.filter(x => x !== req);
                        if (r.status && r.status !== 200) fail('HTTP ' + r.status);
                        else ok(r.response);
                    },
                    onerror: e => { phReqs = phReqs.filter(x => x !== req); fail(errMsg(e)); },
                    ontimeout: () => { phReqs = phReqs.filter(x => x !== req); fail('Timeout'); }
                });
                if (opts && opts.track !== false) phReqs.push(req);
            });
        }

        // Dereference URL wzgledem bazy
        const absHls = (rel, base) => {
            try { return new URL(rel, base).href; } catch (e) { return rel; }
        };

        // Ustal host z URL providera do Referer (np. playmogo.com)
        const originOf = u => {
            try { return new URL(u).origin; } catch (e) { return ''; }
        };

        // Parsuj master.m3u8 → [{bandwidth, uri}], wybierz najwyzszy
        const parseMaster = (text, base) => {
            const lines = text.split(/\r?\n/);
            const variants = [];
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/BANDWIDTH=(\d+)/);
                if (m && i + 1 < lines.length) {
                    const uri = lines[i + 1].trim();
                    if (uri && !uri.startsWith('#')) variants.push({ bandwidth: parseInt(m[1]), uri: absHls(uri, base) });
                }
            }
            variants.sort((a, b) => b.bandwidth - a.bandwidth);
            return variants;
        };

        // ==================== HLS: atrybuty, AES-128, EXT-X-MAP ====================

        // Parsuj liste atrybutow HLS: KEY=VALUE, VALUE moze byc w cudzyslowie.
        const hlsAttrs = line => {
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

        // "0x0123..." → Uint8Array; null gdy zapis nieprawidlowy.
        const hexToBytes = hex => {
            const h = String(hex).replace(/^0x/i, '');
            if (!h.length || h.length % 2 || !/^[0-9a-f]+$/i.test(h)) return null;
            const out = new Uint8Array(h.length / 2);
            for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
            return out;
        };

        // IV segmentu: atrybut IV z EXT-X-KEY albo numer sekwencji (128-bit big-endian).
        const hlsIv = seg => {
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

        // Odszyfrowanie segmentu AES-128-CBC (WebCrypto zdejmuje padding PKCS#7).
        const hlsDecrypt = (buf, key, iv) => {
            const c = (typeof window !== 'undefined' && window.crypto) || (typeof crypto !== 'undefined' ? crypto : null);
            if (!c || !c.subtle) return Promise.reject(new Error('Brak WebCrypto (crypto.subtle) - nie mozna odszyfrowac'));
            return c.subtle.decrypt({ name: 'AES-CBC', iv: iv }, key, buf);
        };

        // Klucz AES-128 z URI (cache - ten sam klucz bywa uzywany przez wszystkie segmenty).
        const importAesKey = async (uri, headers, cache) => {
            if (cache.has(uri)) return cache.get(uri);
            const c = (typeof window !== 'undefined' && window.crypto) || (typeof crypto !== 'undefined' ? crypto : null);
            if (!c || !c.subtle) throw new Error('Brak WebCrypto (crypto.subtle) - nie mozna odszyfrowac');
            const buf = await gmFetchBin(uri, { headers, track: false });
            if (!buf || buf.byteLength !== 16) {
                throw new Error('Klucz AES-128: oczekiwano 16 B, otrzymano ' + (buf ? buf.byteLength : 0) + ' B');
            }
            const k = await c.subtle.importKey('raw', buf, { name: 'AES-CBC' }, false, ['decrypt']);
            cache.set(uri, k);
            return k;
        };

        // Parsuj media.m3u8 → segmenty z kluczem/IV kazdego z nich + init segment (EXT-X-MAP).
        // { segments: [{url, seq, key}], map: {uri, key} | null }
        const parseMediaPlaylist = (text, base) => {
            const out = { segments: [], map: null };
            const lines = text.split(/\r?\n/);
            let seq = 0;
            let key = null;
            for (const raw of lines) {
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
                    else if (method === 'AES-128') key = { method: method, uri: absHls(a.URI || '', base), iv: a.IV || null };
                    else throw new Error('HLS z szyfrowaniem ' + method + ' - obslugiwane tylko AES-128');
                    continue;
                }
                if (line.startsWith('#EXT-X-MAP:')) {
                    const a = hlsAttrs(line);
                    if (a.URI) out.map = { uri: absHls(a.URI, base), key: key };
                    continue;
                }
                if (line.startsWith('#')) continue;
                out.segments.push({ url: absHls(line, base), seq: seq, key: key });
                seq++;
            }
            return out;
        };

        // Dekoduj Dean Edwards packer - wariant prosty (uzywany przez luluvdo/JW Player):
// eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\b'+c.toString(a)+'\\b','g'),k[c]);return p}('PAYLOAD',A,C,'K0|K1'.split('|')))  (4-arg) lub ...,'K0|K1'.split('|'),0,{}))  (6-arg)
// bez eval: scanner stringow (escape-aware) + petla n=c-1..0 (najdluzsze symbole pierwsze).
        const deobfuscatePacked = html => {
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
                // (depth 1 = jestesmy w nawiasie wywolania). Formy:
                //   ...split('|')))                          - 4 argumenty
                //   ...split('|'),0,{}))                    - 6 argumentow
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
                const toBase = n => {
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
                console.log('[PH] deobfuscatePacked: rozlozono packer (a=' + a + ', c=' + c + ')');
            }
            return text;
        };

        // Uniwersalny parser URL-wideo z dowolnego HTML (po deobfuskacji).
        // Szuka m3u8/mp4/webm; pomija domeny reklamowe.
        function extractGenericUrl(html) {
            const patterns = [
                /["']?(?:src|file|source|url|stream|link|hls|playlist)["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+\.(m3u8|mp4|webm)[^"'\s]*)/gi,
                /(https?:\/\/[^"'\s]+\.(m3u8|mp4|webm)(\?[^"'\s]*)?)/gi
            ];
            for (const pat of patterns) {
                const m = pat.exec(html);
                if (m) {
                    const u = m[1];
                    try { const h = new URL(u).hostname; if (!BAD.some(b => h.indexOf(b) !== -1)) return u; } catch (e) {}
                }
            }
            return null;
        }

        function makeBtn(label, container, getUrl) {
            const wrap = document.createElement('div');
            wrap.className = 'ph-wrap';

            const btn = document.createElement('button');
            btn.className = 'ph-btn';
            btn.innerHTML = '<span class="spin"></span><span>' + label + '</span>';
            wrap.appendChild(btn);
            container.appendChild(wrap);

            btn.addEventListener('click', async function() {
                if (btn.disabled) return;
                btn.disabled = true;
                btn.classList.add('loading');
                const span = btn.querySelector('span:last-child');

                try {
                    span.textContent = 'Szukanie źródła...';
                    const { url: vidUrl, prov } = await getSourceUrl();
                    const ext = vidUrl.match(/\.(m3u8|mp4|webm)(\?|$)/i);
                    const fname = getTitle().replace(/[^a-zA-Z0-9\-_ ]/g, '').substring(0, 80) + (ext ? '.' + ext[1] : '.mp4');
                    if (/\.m3u8(\?|$)/i.test(vidUrl)) {
                        span.textContent = 'Pobieranie HLS...';
                        await downloadHls(vidUrl, fname, prov);
                    } else {
                        span.textContent = 'Pobieranie...';
                        await dlWithProgress(vidUrl, fname, prov);
                    }
                } catch(e) {
                    console.log('[PH] blad:', errMsg(e));
                    if (phCancelled) {
                        phCancelled = false;
                        phCloseProg(true);
                        phNotify('Anulowano', 'info');
                    } else {
                        phCloseProg(true);
                        phNotify('Błąd: ' + errMsg(e), 'error');
                    }
                }

                span.textContent = label;
                btn.classList.remove('loading');
                btn.disabled = false;
            });
        }

        function init() {
            if (!playerIframe()) return;
            const c = qs('.video-detail-options');
            if (!c) return;
            const w = document.createElement('div');
            w.className = 'ph-wrap';
            makeBtn('Pobierz', w, getSourceUrl);
            c.appendChild(w);
        }

        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(init, 500);
        } else {
            document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
        }
    }
})();