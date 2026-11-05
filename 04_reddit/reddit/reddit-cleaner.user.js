// ==UserScript==
// @name         Reddit Cleaner - Shreddit (www.reddit.com)
// @namespace    https://github.com/opencode/reddit-cleaner
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-cleaner.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-cleaner.user.js
// @description  Ukrywa reklamy, promowane posty, premium upsell, zbędne sidebary i elementy Shreddit. Lekki, odporny na SPA, nie niszczy layoutu.
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

  // --- Konfiguracja (zapis w GM storage) ---
  const DEFAULTS = {
    hideAds: true,              // shreddit-ad-post i pokrewne
    hidePromoted: true,         // posty z atrybutem promoted
    hidePremium: true,          // banner premium/pro
    hidePopular: false,         // sekcja Popular w sidebarze
    hideRecentPosts: true,      // "Recent posts"
    hideCreatePost: false,      // przycisk Create Post
    hideJoinButtons: false,     // przyciski Join w feedzie
    hideSidebarAds: true,       // sidebar_ad loader
    hideNsfwBlur: false,        // czy wyłączyć blur NSFW (false = zostaw blur)
  };

  function loadCfg() {
    const cfg = {};
    for (const k in DEFAULTS) {
      const v = GM_getValue('rc_' + k, null);
      cfg[k] = v === null ? DEFAULTS[k] : v;
    }
    return cfg;
  }
  let CFG = loadCfg();
  function saveCfg() {
    for (const k in CFG) GM_setValue('rc_' + k, CFG[k]);
  }

  // --- Selektory Shreddit (centralny kontrakt - edytuj tylko tutaj) ---
  const SEL = {
    adPosts: 'shreddit-ad-post, shreddit-comments-page-ad, shreddit-comment-tree-ad, [data-testid="ad-post"]',
    promotedAttr: 'shreddit-post[data-shreddit-promoted="true"], shreddit-post[is-promoted], shreddit-post[promoted]',
    premium: [
      '[data-testid="premium-banner"]',
      'shreddit-premium-banner',
      'faceplate-tracker[source="premium"]',
      '#premium-banner',
      'a[href*="/premium"]',
    ].join(', '),
    sidebarAds: 'shreddit-async-loader[bundlename="sidebar_ad"], shreddit-async-loader[bundlename="feed_announcement"], div[data-before-content="advertisement"]',
    popular: 'a[href="/r/popular"], a[href*="/r/popular/"]',
    recentPosts: '#recent-posts, [id*="recent-posts"], shreddit-async-loader[bundlename*="recent"]',
    createPost: 'a[href*="/submit"], button:has-text("Create Post"), faceplate-tracker[source="create_post"]',
    joinButtons: 'shreddit-join-button, button[join], faceplate-tracker[source="join"]',
  };

  // Dodatkowe heurystyki dla reklam (gdy brak tagu shreddit-ad-post)
  function isPromotedFallback(el) {
    // tekst Promoted w light DOM lub link alb.reddit.com
    try {
      const txt = (el.textContent || '').toLowerCase();
      if (txt.includes('promoted')) return true;
      if (el.querySelector('a[href*="alb.reddit.com/cr"], a[href*="out.reddit.com"]')) return true;
    } catch {}
    return false;
  }

  // --- CSS injection (szybkie, przed MutationObserver) ---
  let styleEl = null;
  function injectCSS() {
    if (styleEl) styleEl.remove();
    styleEl = document.createElement('style');
    styleEl.id = 'reddit-cleaner-style';
    const css = [];
    if (CFG.hideAds) css.push(`${SEL.adPosts} { display: none !important; }`);
    if (CFG.hidePromoted) css.push(`${SEL.promotedAttr} { display: none !important; }`);
    if (CFG.hidePremium) css.push(`${SEL.premium} { display: none !important; }`);
    if (CFG.hideSidebarAds) css.push(`${SEL.sidebarAds} { display: none !important; }`);
    // popular/recent - ukrywamy kontener rodzica jeśli to link w sidebarze
    if (CFG.hidePopular) css.push(`aside a[href="/r/popular"] { display: none !important; }`);
    if (CFG.hideCreatePost) css.push(`a[href*="/submit"] { display: none !important; }`);
    if (CFG.hideJoinButtons) css.push(`${SEL.joinButtons} { display: none !important; }`);
    styleEl.textContent = css.join('\n');
    document.documentElement.appendChild(styleEl);
  }

  // --- Proceduralne czyszczenie (dla elementów bez stabilnego selektora) ---
  function cleanOnce() {
    // 1. shreddit-ad-post - zawsze chowaj (nawet gdy hideAds=false, to reklama)
    if (CFG.hideAds) {
      document.querySelectorAll(SEL.adPosts).forEach(el => { el.style.display = 'none'; });
    }
    // 2. promowane posty via atrybut
    if (CFG.hidePromoted) {
      document.querySelectorAll(SEL.promotedAttr).forEach(el => { el.style.display = 'none'; });
      // fallback: przeszukaj shreddit-post
      document.querySelectorAll('shreddit-post').forEach(el => {
        if (isPromotedFallback(el)) el.style.display = 'none';
      });
    }
    // 3. premium
    if (CFG.hidePremium) {
      document.querySelectorAll(SEL.premium).forEach(el => {
        // dla linków premium chowamy najbliższy kontener bannera, nie cały post
        const banner = el.closest('div, section, header') || el;
        if (banner.textContent && /premium|pro/i.test(banner.textContent.slice(0, 200))) {
          el.style.display = 'none';
        } else {
          el.style.display = 'none';
        }
      });
    }
    // 4. sidebar ads
    if (CFG.hideSidebarAds) {
      document.querySelectorAll(SEL.sidebarAds).forEach(el => { el.style.display = 'none'; });
    }
    // 5. Recent posts
    if (CFG.hideRecentPosts) {
      document.querySelectorAll(SEL.recentPosts).forEach(el => { el.style.display = 'none'; });
      // heurystyka tekstowa
      document.querySelectorAll('h2, h3, span').forEach(el => {
        if (/recent posts/i.test(el.textContent.trim()) && el.textContent.trim().length < 30) {
          const box = el.closest('div, section, aside');
          if (box && box.querySelector('a[href*="/r/"]')) box.style.display = 'none';
        }
      });
    }
    // 6. Popular
    if (CFG.hidePopular) {
      document.querySelectorAll(SEL.popular).forEach(el => {
        const row = el.closest('li, div, faceplate-tracker');
        if (row) row.style.display = 'none';
        else el.style.display = 'none';
      });
    }
    // 7. Create post
    if (CFG.hideCreatePost) {
      document.querySelectorAll('a[href*="/submit"]').forEach(el => {
        if (/create/i.test(el.textContent)) el.style.display = 'none';
      });
    }
    // 8. Join buttons
    if (CFG.hideJoinButtons) {
      document.querySelectorAll(SEL.joinButtons).forEach(el => { el.style.display = 'none'; });
    }
  }

  // --- MutationObserver dla SPA (infinite scroll) ---
  let debounceTimer = null;
  function scheduleClean() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(cleanOnce, 250);
  }

  function startObserver() {
    const obs = new MutationObserver((muts) => {
      let should = false;
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches && (n.matches('shreddit-post, shreddit-ad-post, aside, header, shreddit-async-loader') || n.querySelector('shreddit-post, shreddit-ad-post'))) {
            should = true; break;
          }
        }
        if (should) break;
      }
      if (should) scheduleClean();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // --- Panel konfiguracji (GM menu + pływający przycisk) ---
  function togglePanel() {
    let p = document.getElementById('rc-config-panel');
    if (p) { p.remove(); return; }
    p = document.createElement('div');
    p.id = 'rc-config-panel';
    p.style.cssText = 'position:fixed;top:60px;right:16px;z-index:2147483647;background:#0e1113;color:#d7dadc;border:1px solid #343536;border-radius:8px;padding:14px 16px;min-width:280px;max-width:360px;box-shadow:0 8px 24px rgba(0,0,0,0.6);font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    const title = document.createElement('div');
    title.textContent = 'Reddit Cleaner — ustawienia';
    title.style.cssText = 'font-weight:700;margin-bottom:10px;font-size:15px;';
    p.appendChild(title);

    const labels = {
      hideAds: 'Ukryj reklamy (shreddit-ad-post)',
      hidePromoted: 'Ukryj Promoted posty',
      hidePremium: 'Ukryj Premium / Pro upsell',
      hideSidebarAds: 'Ukryj sidebar ads',
      hideRecentPosts: 'Ukryj Recent posts',
      hidePopular: 'Ukryj Popular',
      hideCreatePost: 'Ukryj Create Post',
      hideJoinButtons: 'Ukryj przyciski Join',
    };
    for (const k in DEFAULTS) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer;user-select:none;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!CFG[k];
      cb.addEventListener('change', () => {
        CFG[k] = cb.checked;
        saveCfg();
        injectCSS();
        cleanOnce();
      });
      const span = document.createElement('span');
      span.textContent = labels[k] || k;
      row.appendChild(cb);
      row.appendChild(span);
      p.appendChild(row);
    }
    const close = document.createElement('button');
    close.textContent = 'Zamknij';
    close.style.cssText = 'margin-top:10px;padding:6px 12px;border-radius:6px;border:1px solid #343536;background:#1a1a1b;color:#d7dadc;cursor:pointer;width:100%;';
    close.onclick = () => p.remove();
    p.appendChild(close);
    document.body.appendChild(p);
  }

  // --- Inicjalizacja ---
  injectCSS();
  cleanOnce();
  startObserver();
  // dodatkowe skany dla leniwego hydratowania Shreddit
  setTimeout(cleanOnce, 800);
  setTimeout(cleanOnce, 2500);
  setTimeout(cleanOnce, 6000);

  try {
    GM_registerMenuCommand('Reddit Cleaner: ustawienia', togglePanel);
  } catch {}
  // skrót klawiszowy Alt+Shift+C
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      togglePanel();
    }
  });

})();
