// ==UserScript==
// @name         Reddit Perf - szybsze scrollowanie (Shreddit)
// @namespace    https://github.com/opencode/reddit-perf
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-perf.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-perf.user.js
// @description  Przyspiesza scrollowanie reddita i ogranicza zawieszanie strony: content-visibility na postach/komentarzach, pauzowanie wideo poza ekranem, opcjonalne przycinanie DOM feedu, leniwe obrazki, tanie efekty CSS.
// @author       opencode
// @match        https://www.reddit.com/*
// @match        https://*.reddit.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // --- Konfiguracja (GM storage) ---
  const DEFAULTS = {
    cv: true,          // content-visibility: auto -> przeglądarka pomija renderowanie offscreen
    pauseOff: true,    // pauza wideo spoza viewportu (mniej dekodowania = mniej zacięć)
    lazyImg: true,     // wymuś loading=lazy na obrazkach postów
    cheapFx: false,    // wyłącz drogie efekty CSS w feedzie (backdrop-filter, transition)
    trimDom: false,    // przycinanie DOM: chowaj posty daleko nad viewportem (z placeholders)
    keepPosts: 80,     // ile postów trzymać w DOM przy trimDom
  };

  function loadCfg() {
    const cfg = {};
    for (const k in DEFAULTS) {
      const v = GM_getValue('rp_' + k, null);
      cfg[k] = v === null ? DEFAULTS[k] : v;
    }
    return cfg;
  }
  let CFG = loadCfg();
  function saveCfg(k) { GM_setValue('rp_' + k, CFG[k]); }

  // --- Style (jeden blok, funkcje przełączane klasami na <html>) ---
  // content-visibility: auto = pomijamy layout/paint/style postów poza ekranem.
  // contain-intrinsic-size: auto Xpx = zapamiętuje realny rozmiar po pierwszym renderze,
  // dzięki czemu scrollbar nie skacze.
  GM_addStyle(`
    html.rperf-cv shreddit-post,
    html.rperf-cv shreddit-comment {
      content-visibility: auto;
      contain-intrinsic-size: auto 620px;
    }
    html.rperf-fx shreddit-feed,
    html.rperf-fx shreddit-feed *,
    html.rperf-fx shreddit-comments-page,
    html.rperf-fx shreddit-comments-page * {
      transition-duration: 0.001s !important;
      animation-duration: 0.001s !important;
      animation-iteration-count: 1 !important;
    }
    html.rperf-fx header,
    html.rperf-fx shreddit-sidebar,
    html.rperf-fx [class*="backdrop"] {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    .rperf-ph {
      position: relative;
      overflow: hidden;
      background: transparent !important;
    }
    /* nie chowaj pro-grid gallery (#rg-overlay) ani niczego zostawionego przez inne skrypty */
    html.rperf-cv #rg-overlay,
    html.rperf-cv #rg-overlay * {
      content-visibility: visible;
      contain-intrinsic-size: none;
    }
    /* tanie efekty CSS nie mogą łamać overlayu galerii (sticky #rg-top) */
    html.rperf-fx #rg-overlay, html.rperf-fx #rg-overlay * {
      transition-duration: revert !important;
      animation-duration: revert !important;
      animation-iteration-count: revert !important;
    }
    .rperf-ph-note {
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      padding: 3px 10px;
      border: 1px dashed #343536;
      border-radius: 999px;
      color: #818384;
      font: 11px/1.4 -apple-system, "Segoe UI", sans-serif;
      opacity: 0.7;
      pointer-events: none;
    }
  `);

  function applyClasses() {
    const h = document.documentElement;
    h.classList.toggle('rperf-cv', !!CFG.cv);
    h.classList.toggle('rperf-fx', !!CFG.cheapFx);
  }

  // zbiór wideo, które sami zapauzowaliśmy - żeby nie wznowić czegoś, co użytkownik
  // (albo inny skrypt) świadomie zatrzymał
  const pausedByUs = new Set();

  // wznowienie pojedynczego wideo, z zachowaniem jego stanu początkowego
  function resumeOne(v) {
    pausedByUs.delete(v);
    if (v.dataset.rperfPaused !== '1') return;
    v.dataset.rperfPaused = '0';
    // nie wznawiaj "w ciemno" - tylko jeśli wideo grało przed pauzą (użytkownik go nie zatrzymał)
    if (v.dataset.rperfWasPlaying !== '1') return;
    v.dataset.rperfWasPlaying = '0';
    try { v.play().catch(() => {}); } catch {}
  }

  // wznów wszystkie wideo zapauzowane przez skrypt (po wyłączeniu opcji)
  function resumeAllVideos() {
    for (const v of Array.from(pausedByUs)) resumeOne(v);
  }

  // --- 1. Wideo: pauza poza ekranem, wznów po powrocie ---
  const vio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      try {
        // funkcja wyłączona? wróć do stanu użytkownika (tylko to, co sami zapauzowaliśmy)
        if (!CFG.pauseOff) { resumeOne(v); continue; }
        if (e.isIntersecting) {
          resumeOne(v);
        } else if (!v.paused) {
          // zapamiętaj, że wideo naprawdę grało (a nie stoi na pauzie użytkownika)
          v.dataset.rperfWasPlaying = '1';
          v.dataset.rperfPaused = '1';
          pausedByUs.add(v);
          v.pause();
        }
      } catch {}
    }
  }, { rootMargin: '100% 0px' });

  function regVideo(v) {
    if (!(v instanceof HTMLVideoElement)) return;
    if (v.dataset.rperfReg === '1') return;
    v.dataset.rperfReg = '1';
    vio.observe(v);
  }

  function collectVideos() {
    document.querySelectorAll('video').forEach(regVideo);
    // shreddit-player trzyma <video> w shadowRoot (nieprzenikalny dla zwykłego query)
    document.querySelectorAll('shreddit-player, shreddit-player-2, shreddit-player-embed, [is-embed]').forEach(p => {
      p.querySelectorAll && p.querySelectorAll('video').forEach(regVideo);
      try {
        if (p.shadowRoot) p.shadowRoot.querySelectorAll('video').forEach(regVideo);
      } catch {}
    });
  }

  // --- 2. Przycinanie DOM feedu (opcjonalne) ---
  // Posty daleko nad viewportem zamieniane na placeholder o tej samej wysokości
  // (scrollbar nie skacze), przywracane przy przewinięciu w ich okolicę.
  function removePost(p) {
    const h = p.getBoundingClientRect().height;
    // odeślij wideo z usuwanego posta (inaczej observer trzyma je w pamięci)
    const unreg = (v) => vio.unobserve(v);
    p.querySelectorAll && p.querySelectorAll('video').forEach(unreg);
    p.querySelectorAll && p.querySelectorAll('shreddit-player, shreddit-player-2').forEach(pl => {
      pl.querySelectorAll && pl.querySelectorAll('video').forEach(unreg);
      try { if (pl.shadowRoot) pl.shadowRoot.querySelectorAll('video').forEach(unreg); } catch {}
    });
    const ph = document.createElement('div');
    ph.className = 'rperf-ph';
    ph.dataset.rperfPh = '1';
    ph.style.height = Math.max(Math.round(h), 48) + 'px';
    ph._html = p.outerHTML; // treść trzymamy w sesji (SPA nie czyści naszych placeholderów)
    ph.innerHTML = '<div class="rperf-ph-note">post schowany (perf)</div>';
    p.replaceWith(ph);
  }

  function trimDom() {
    if (!CFG.trimDom) return;
    const posts = document.querySelectorAll('shreddit-post');
    if (posts.length <= CFG.keepPosts) return;
    let excess = posts.length - CFG.keepPosts;
    const vh = window.innerHeight;
    for (const p of posts) {
      if (excess <= 0) break;
      if (p.dataset.rperfPh === '1') continue;
      const r = p.getBoundingClientRect();
      // idziemy od góry listy: przerywamy, gdy post jest już blisko/pod viewportem
      // (próg -2vh daje histeresę z przywracaniem w 1.5vh - bez pętli remove/restore)
      if (r.bottom > -2 * vh) break;
      removePost(p);
      excess--;
    }
  }

  function restoreNear() {
    const phs = document.querySelectorAll('.rperf-ph[data-rperf-ph]');
    if (!phs.length) return;
    const vh = window.innerHeight;
    for (const ph of phs) {
      const r = ph.getBoundingClientRect();
      if (r.top < vh * 1.5 && r.bottom > -vh * 1.5) {
        if (!ph._html) continue;
        const tmp = document.createElement('div');
        tmp.innerHTML = ph._html;
        const el = tmp.firstElementChild;
        if (el) ph.replaceWith(el);
      }
    }
  }

  // --- 3. Leniwe obrazki (gdy klasa CSS nie wystarczy) ---
  function lazyImgs() {
    if (!CFG.lazyImg) return;
    document.querySelectorAll('shreddit-post img:not([loading])').forEach(img => {
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    });
  }

  // --- Skan (debounce) ---
  function scan() {
    collectVideos();
    lazyImgs();
    trimDom();
  }

  let scanTimer = null;
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 300);
  }

  // --- Scroll: rAF-throttled, przywracanie + okresowe przycinanie ---
  let ticking = false;
  let scrollFrames = 0;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      restoreNear();
      if (++scrollFrames % 30 === 0) trimDom();
    });
  }

  // --- Start ---
  applyClasses(); // od razu (document-start), żeby CSS działał przed pierwszym paintem
  function start() {
    scan();
    new MutationObserver(scheduleScan)
      .observe(document.body, { childList: true, subtree: true });
    // leniwa hydratacja shreddit-async-loader - dodatkowe skany
    [800, 2500, 6000, 12000].forEach(t => setTimeout(scan, t));
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', scheduleScan, { passive: true });
  }

  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start, { once: true });

  // --- Menu Tampermonkey ---
  const TOGGLES = [
    ['cv', 'content-visibility (renderowanie offscreen)'],
    ['pauseOff', 'pauza wideo poza ekranem'],
    ['lazyImg', 'leniwe obrazki'],
    ['cheapFx', 'tanie efekty CSS (bez backdrop-filter/animacji)'],
    ['trimDom', 'przycinanie DOM feedu (placeholders)'],
  ];
  TOGGLES.forEach(([k, label]) => {
    GM_registerMenuCommand(
      (CFG[k] ? '[✓] ' : '[ ] ') + label,
      () => {
        CFG[k] = !CFG[k];
        saveCfg(k);
        applyClasses();
        if (k === 'trimDom' && !CFG.trimDom) restoreAll();
        else if (k === 'trimDom') trimDom();
        else {
          if (k === 'pauseOff' && !CFG.pauseOff) resumeAllVideos();
          scan();
        }
      }
    );
  });
  GM_registerMenuCommand('Reddit Perf: przywróć wszystkie schowane posty', () => {
    CFG.trimDom = false;
    saveCfg('trimDom');
    restoreAll();
  });

  function restoreAll() {
    document.querySelectorAll('.rperf-ph[data-rperf-ph]').forEach(ph => {
      if (!ph._html) return;
      const tmp = document.createElement('div');
      tmp.innerHTML = ph._html;
      const el = tmp.firstElementChild;
      if (el) ph.replaceWith(el);
    });
    scan();
  }
})();
