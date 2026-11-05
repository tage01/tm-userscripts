// ==UserScript==
// @name         Reddit UX Tweaks - Shreddit (www.reddit.com)
// @namespace    https://github.com/opencode/reddit-ux-tweaks
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-ux-tweaks.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-ux-tweaks.user.js
// @description  Drobne usprawnienia: przełącznik old/new reddit, auto-inline galerii, kontrola autoplay video, ukrywanie visited, kompaktowy feed.
// @author       opencode
// @match        https://www.reddit.com/*
// @match        https://*.reddit.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const CFG = {
    oldSwitch: GM_getValue('rux_oldSwitch', true),
    inlineGallery: GM_getValue('rux_inlineGallery', true),
    pauseAutoplay: GM_getValue('rux_pauseAutoplay', false),
    dimVisited: GM_getValue('rux_dimVisited', false),
    compactFeed: GM_getValue('rux_compactFeed', false),
  };

  // --- 1. Przełącznik old ↔ new reddit ---
  function addOldSwitch() {
    if (!CFG.oldSwitch) return;
    if (document.getElementById('rux-old-switch')) return;
    const btn = document.createElement('a');
    btn.id = 'rux-old-switch';
    const isOld = location.hostname.startsWith('old.');
    const targetHost = isOld ? 'www.reddit.com' : 'old.reddit.com';
    const targetUrl = 'https://' + targetHost + location.pathname + location.search + location.hash;
    btn.href = targetUrl;
    btn.textContent = isOld ? '→ www.reddit' : '→ old.reddit';
    btn.title = 'Przełącz na ' + targetHost;
    btn.style.cssText = 'position:fixed;top:10px;right:16px;z-index:2147483646;padding:4px 8px;border-radius:999px;border:1px solid #343536;background:#1a1a1b;color:#d7dadc;font:11px -apple-system,sans-serif;text-decoration:none;opacity:0.85;';
    btn.onmouseenter = () => btn.style.opacity = '1';
    btn.onmouseleave = () => btn.style.opacity = '0.85';
    document.body.appendChild(btn);
  }

  // --- 2. Auto-inline galerii: usuń max-height, pokaż wszystkie slajdy ---
  function inlineGalleries() {
    if (!CFG.inlineGallery) return;
    document.querySelectorAll('gallery-carousel').forEach(car => {
      if (car.dataset.ruxInline === '1') return;
      car.dataset.ruxInline = '1';
      // usuń ograniczenia wysokości
      car.style.maxHeight = 'none';
      // w shadowRoot pager może mieć overflow hidden
      try {
        const shadow = car.shadowRoot;
        if (shadow) {
          const style = document.createElement('style');
          style.textContent = ':host { max-height: none !important; } ul { max-height: none !important; }';
          shadow.appendChild(style);
        }
      } catch {}
      // lazy-load: wymuś załadowanie obrazów
      car.querySelectorAll('img[data-lazy-src]').forEach(img => {
        if (!img.src) img.src = img.getAttribute('data-lazy-src');
      });
    });
  }

  // --- 3. Kontrola autoplay video ---
  function handleAutoplay() {
    if (!CFG.pauseAutoplay) return;
    document.querySelectorAll('shreddit-player, shreddit-player-2').forEach(player => {
      if (player.dataset.ruxPaused === '1') return;
      player.dataset.ruxPaused = '1';
      // spróbuj znaleźć video w shadowRoot
      const findVideo = () => {
        let v = player.querySelector('video');
        if (v) return v;
        try {
          if (player.shadowRoot) {
            v = player.shadowRoot.querySelector('video');
            if (v) return v;
            // vds-hls
            const hls = player.shadowRoot.querySelector('vds-hls, video');
            if (hls) return hls;
          }
        } catch {}
        return null;
      };
      const vid = findVideo();
      if (vid) {
        try { vid.pause(); vid.autoplay = false; } catch {}
      }
      // dodaj przycisk play overlay
      if (!player.querySelector('.rux-play')) {
        const btn = document.createElement('button');
        btn.className = 'rux-play';
        btn.textContent = '▶ Odtwarzaj';
        btn.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2;padding:8px 14px;border-radius:999px;border:none;background:rgba(0,0,0,0.7);color:#fff;font:13px sans-serif;cursor:pointer;';
        btn.onclick = () => {
          const v = findVideo();
          if (v) { try { v.play(); } catch {} }
          btn.remove();
        };
        player.style.position = 'relative';
        player.appendChild(btn);
      }
    });
  }

  // --- 4. Przyciemnij visited (tytuły już odwiedzonych postów) ---
  let visitedStyle = null;
  function applyVisitedDim() {
    if (visitedStyle) visitedStyle.remove();
    if (!CFG.dimVisited) return;
    visitedStyle = document.createElement('style');
    visitedStyle.id = 'rux-visited-style';
    visitedStyle.textContent = `
      shreddit-post:visited, shreddit-post a:visited,
      a[href*="/comments/"]:visited { opacity: 0.55 !important; }
      /* Shreddit oznacza visited via data-visited lub klasa, fallback: */
      shreddit-post[data-visited="true"] { opacity: 0.55; }
    `;
    document.documentElement.appendChild(visitedStyle);
    // oznacz visited heurystycznie: link w historii
    document.querySelectorAll('shreddit-post[permalink]').forEach(post => {
      const a = post.querySelector('a[href*="/comments/"]');
      if (a) {
        // sprawdź :visited pośrednio - nie da się odczytać, więc użyj localStorage z feed-filter
        // tu tylko CSS
      }
    });
  }

  // --- 5. Kompaktowy feed (mniejsze odstępy) ---
  let compactStyle = null;
  function applyCompact() {
    if (compactStyle) compactStyle.remove();
    if (!CFG.compactFeed) return;
    compactStyle = document.createElement('style');
    compactStyle.id = 'rux-compact-style';
    compactStyle.textContent = `
      shreddit-feed article { margin-bottom: 8px !important; }
      shreddit-post { --post-padding: 8px !important; }
      [slot="post-media-container"] { max-height: 520px !important; }
      gallery-carousel { max-height: 480px !important; }
    `;
    document.documentElement.appendChild(compactStyle);
  }

  // --- Panel ---
  function togglePanel() {
    let p = document.getElementById('rux-panel');
    if (p) { p.remove(); return; }
    p = document.createElement('div');
    p.id = 'rux-panel';
    p.style.cssText = 'position:fixed;top:60px;right:16px;z-index:2147483647;background:#0e1113;color:#d7dadc;border:1px solid #343536;border-radius:8px;padding:14px 16px;min-width:280px;box-shadow:0 8px 24px rgba(0,0,0,0.6);font:13px -apple-system,sans-serif;';
    p.appendChild(Object.assign(document.createElement('div'), { textContent: 'UX Tweaks — ustawienia', style: 'font-weight:700;margin-bottom:10px;font-size:14px;' }));
    const items = [
      ['oldSwitch', 'Przycisk old ↔ www reddit'],
      ['inlineGallery', 'Auto-inline galerii (pełna wysokość)'],
      ['pauseAutoplay', 'Pauzuj autoplay video (pokaż ▶)'],
      ['dimVisited', 'Przyciemnij odwiedzone posty'],
      ['compactFeed', 'Kompaktowy feed (mniejsze odstępy)'],
    ];
    items.forEach(([key, label]) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer;';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!CFG[key];
      cb.onchange = () => {
        CFG[key] = cb.checked;
        GM_setValue('rux_' + key, cb.checked);
        if (key === 'dimVisited') applyVisitedDim();
        if (key === 'compactFeed') applyCompact();
        if (key === 'oldSwitch') { if (cb.checked) addOldSwitch(); else document.getElementById('rux-old-switch')?.remove(); }
      };
      const sp = document.createElement('span'); sp.textContent = label;
      row.appendChild(cb); row.appendChild(sp); p.appendChild(row);
    });
    const close = document.createElement('button');
    close.textContent = 'Zamknij';
    close.style.cssText = 'margin-top:10px;width:100%;padding:6px;border-radius:6px;border:1px solid #343536;background:#1a1a1b;color:#d7dadc;cursor:pointer;';
    close.onclick = () => p.remove();
    p.appendChild(close);
    document.body.appendChild(p);
  }

  try { GM_registerMenuCommand('Reddit UX: ustawienia', togglePanel); } catch {}
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'u') { e.preventDefault(); togglePanel(); }
  });

  // --- Init ---
  addOldSwitch();
  inlineGalleries();
  handleAutoplay();
  applyVisitedDim();
  applyCompact();

  const obs = new MutationObserver(() => {
    inlineGalleries();
    handleAutoplay();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => { inlineGalleries(); handleAutoplay(); addOldSwitch(); }, 1000);
  setTimeout(() => { inlineGalleries(); handleAutoplay(); }, 3000);
})();
