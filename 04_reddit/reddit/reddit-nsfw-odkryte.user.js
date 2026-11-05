// ==UserScript==
// @name         Reddit - zawsze odkryte NSFW
// @namespace    https://github.com/opencode/reddit-nsfw
// @version      1.0.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-nsfw-odkryte.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-nsfw-odkryte.user.js
// @description  Automatycznie odkrywa wszystkie treści NSFW na Reddicie — usuwa blur, overlaye i blokady (sh.reddit.com / www.reddit.com / old.reddit.com). Działa bez logowania.
// @author       opencode
// @match        *://*.reddit.com/*
// @match        *://reddit.com/*
// @match        *://*.reddittorjg6rue252oqsxryoxengawnmo46qy4kyii5wtqnwfj4ooad.onion/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// ==/UserScript==

/*
  Reddit - zawsze odkryte NSFW
  - Usuwa blur z postów, miniaturek i wyników wyszukiwania
  - Usuwa modale/blokady xpromo, backdrop-filter i scroll-lock
  - Automatycznie ustawia cookie over18=1 (wyniki NSFW w wyszukiwarce)
  - Obsługuje sh.reddit.com (Shreddit) oraz old.reddit.com
  - Odporny na SPA: MutationObserver + atrybuty + interwał

  Bazuje na logice z andradeatdev/Reddit-NSFW-Unblur (MIT) i UniverseDevCode/Reddit Bypass Enhancer.
*/

(function () {
  'use strict';

  // ---------- konfiguracja ----------
  const CFG = {
    nsfw: GM_getValue ? GM_getValue('nsfw', true) : true,
    spoiler: GM_getValue ? GM_getValue('spoiler', false) : false,
    placeholder: false,
    debug: false,
  };

  const log = (...a) => CFG.debug && console.log('[reddit-nsfw]', ...a);

  // ---------- 1. CSS wstrzykiwany natychmiast (document-start) ----------
  const CSS = `
    /* ukryj modale/blokady NSFW (nie ruszamy body/html ani overlayów lightboxa) */
    #blocking-modal,
    #nsfw-qr-dialog,
    #configured-xpromo-blocking_xpromo_nsfw_blocking,
    #configured-xpromo-blocking_xpromo_nsfw_blocking_desktop,
    #configured-xpromo-blocking_xpromo_nsfw_blocking_desktop_cms,
    shreddit-async-loader[bundlename*="nsfw_blocking"],
    xpromo-nsfw-blocking-container { display: none !important; }
    /* awaryjnie: zdejmij filtr blur jeśli JS nie zdąży ustawić el.blurred=false */
    shreddit-blurred-container[reason="nsfw"] { --blur: none !important; }
    shreddit-blurred-container[reason="nsfw"] [style*="blur"] { filter: none !important; backdrop-filter: none !important; }
    .thumbnail-blur, .blurred { filter: none !important; backdrop-filter: none !important; }
    /* old.reddit.com — miniatury NSFW */
    .over18 .thumbnail img { filter: none !important; }
  `;

  try {
    if (typeof GM_addStyle === 'function') GM_addStyle(CSS);
    else {
      const s = document.createElement('style');
      s.textContent = CSS;
      (document.documentElement || document.head).appendChild(s);
    }
  } catch (e) {}

  // fallback: wstrzyknij <style> gdy <head> jeszcze nie istnieje — obserwuj documentElement
  const injectStyle = () => {
    if (document.documentElement && !document.getElementById('reddit-nsfw-unblur-style')) {
      const s = document.createElement('style');
      s.id = 'reddit-nsfw-unblur-style';
      s.textContent = CSS;
      document.documentElement.appendChild(s);
    }
  };
  injectStyle();

  // ---------- 2. Cookie over18 — wyniki NSFW w wyszukiwarce ----------
  try {
    // document.cookie działa nawet w document-start
    document.cookie = 'over18=1; path=/; max-age=31536000';
    // dla domen .reddit.com (zadziała po załadowaniu DOM)
    if (window.cookieStore && cookieStore.set) {
      cookieStore.set({ name: 'over18', value: '1', path: '/', domain: 'reddit.com' }).catch(() => {});
      cookieStore.set({ name: 'over18', value: '1', path: '/', domain: '.reddit.com' }).catch(() => {});
    }
  } catch (e) {}

  // ---------- 3. Prototype trick — wymuś __blurred = false (jak uBO trusted-set) ----------
  try {
    // niektóry kod reddita sprawdza HTMLElement.prototype.__blurred
    Object.defineProperty(HTMLElement.prototype, '__blurred', {
      configurable: true,
      get() { return false; },
      set(v) { /* ignoruj próby ustawienia true */ },
    });
  } catch (e) {
    // jeśli defineProperty się nie uda, spróbuj zwykłego przypisania
    try { HTMLElement.prototype.__blurred = false; } catch (_) {}
  }

  // ---------- helpers ----------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // ---------- 4. Usuwanie overlayy/blocking ----------
  function removeOverlays() {
    // selektory jak w addon/content.js
    const selectors = [
      '#blocking-modal',
      '#nsfw-qr-dialog',
      '#configured-xpromo-blocking_xpromo_nsfw_blocking',
      '#configured-xpromo-blocking_xpromo_nsfw_blocking_desktop',
      '#configured-xpromo-blocking_xpromo_nsfw_blocking_desktop_cms',
      'shreddit-async-loader[bundlename*="nsfw_blocking"]',
      'shreddit-async-loader[bundlename*="nsfw_blocking_modal"]',
    ];
    for (const el of $$(selectors.join(','))) {
      el.remove();
      log('usunięto overlay', el);
    }

    // xpromo shadowRoot prompt
    for (const promo of $$('xpromo-nsfw-blocking-container')) {
      try {
        const shadow = promo.shadowRoot;
        if (shadow) {
          const prompt = shadow.querySelector('.prompt');
          if (prompt) prompt.remove();
          // dodatkowo wstrzyknij style do shadowRoot jeśli jeszcze nie ma
          if (!shadow.querySelector('style[data-nsfw]')) {
            const st = document.createElement('style');
            st.setAttribute('data-nsfw', '1');
            st.textContent = '.prompt{display:none !important}';
            shadow.appendChild(st);
          }
        } else {
          // jeśli shadowRoot jeszcze nie podpięty — patch attachShadow na przyszłość
          if (!promo._nsfwPatched && promo.attachShadow) {
            const orig = promo.attachShadow;
            promo.attachShadow = function (init) {
              const sh = orig.call(this, init);
              const st = document.createElement('style');
              st.setAttribute('data-nsfw', '1');
              st.textContent = '.prompt{display:none !important}';
              sh.appendChild(st);
              return sh;
            };
            promo._nsfwPatched = true;
          }
        }
      } catch (e) {}
      // ukryj cały kontener awaryjnie
      promo.style.display = 'none';
    }

    // embedy czasem wymagają ręcznego setup
    for (const embed of $$('shreddit-embed')) {
      try { if (!embed.mounted && typeof embed.setupEmbed === 'function') embed.setupEmbed(); } catch (e) {}
    }
  }

  // ---------- 5. Zdejmowanie blur ----------
  function removeBlur() {
    // główny mechanizm Shreddit — ustawienie właściwości .blurred = false
    const blurredEls = $$('shreddit-blurred-container[reason][blurred]');
    for (const el of blurredEls) {
      const reason = el.getAttribute('reason'); // "nsfw" | "spoiler"
      const shouldUnblur = (reason === 'nsfw' && CFG.nsfw) || (reason === 'spoiler' && CFG.spoiler);
      if (shouldUnblur) {
        try {
          el.blurred = false;
          el.removeAttribute('blurred');
          // dla pewności usuń też atrybut mode który chowa slot revealed
          if (el.hasAttribute('mode')) el.removeAttribute('mode');
        } catch (e) {}
      }
    }

    // nawet bez atrybutu [blurred] — niektóre kontenery mają blurred jako property
    const allBlurred = $$('shreddit-blurred-container[reason="nsfw"], shreddit-blurred-container[reason="spoiler"]');
    for (const el of allBlurred) {
      const reason = el.getAttribute('reason');
      const shouldUnblur = (reason === 'nsfw' && CFG.nsfw) || (reason === 'spoiler' && CFG.spoiler);
      if (shouldUnblur && el.blurred) {
        try { el.blurred = false; } catch (e) {}
      }
      // richtext content — zamień na revealed slot
      if (shouldUnblur && el.hasAttribute('is-richtext-content')) {
        const inner = el.querySelector("[property='schema:articleBody']");
        if (inner) {
          try { el.replaceWith(inner); } catch (e) {}
        }
      }
    }

    // community highlight cards
    for (const hl of $$('community-highlight-card[blurred]:is([nsfw], [spoiler])')) {
      if ((hl.hasAttribute('nsfw') && CFG.nsfw) || (hl.hasAttribute('spoiler') && CFG.spoiler)) {
        hl.removeAttribute('blurred');
      }
    }

    // miniatury w right rail (PDP)
    for (const t of $$("reddit-pdp-right-rail-post [data-testid='post-thumbnail']:has([icon-name='nsfw-fill'], [icon-name='caution-fill'])")) {
      const svg = $('[icon-name]', t);
      const type = svg?.getAttribute('icon-name');
      if ((type === 'nsfw-fill' && CFG.nsfw) || (type === 'caution-fill' && CFG.spoiler)) {
        $('img', t)?.style.removeProperty('filter');
        $('.thumbnail-shadow', t)?.remove();
        t.classList.remove('thumbnail-blur');
      }
    }

    // wyniki wyszukiwania — .thumbnail-blur
    for (const s of $$(`search-telemetry-tracker:is([data-faceplate-tracking-context*='"nsfw":true'], [data-faceplate-tracking-context*='"spoiler":true']):has(.thumbnail-blur)`)) {
      const ctx = s.getAttribute('data-faceplate-tracking-context') || '';
      const isNsfw = ctx.includes('"nsfw":true');
      const isSpoiler = ctx.includes('"spoiler":true');
      if ((isNsfw && CFG.nsfw) || (isSpoiler && CFG.spoiler)) {
        $('.thumbnail-blur', s)?.classList.remove('thumbnail-blur');
        // awaryjnie usuń filtr z img
        for (const img of $$('img', s)) img.style.removeProperty('filter');
      }
    }

    // spoilery inline
    for (const sp of $$('shreddit-spoiler:not([data-revealed])')) {
      if (CFG.spoiler) {
        sp.dataset.revealed = '';
        try { sp.revealed = true; } catch (e) {}
      }
    }

    // fallback CSS — wszystkie elementy z inline blur
    // (bezpieczne: tylko gdy reason=nsfw w przodku)
    for (const el of $$('shreddit-blurred-container[reason="nsfw"] [style*="blur"], shreddit-blurred-container[reason="nsfw"] [style*="filter"]')) {
      el.style.removeProperty('filter');
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('-webkit-filter');
    }

    // stary reddit — usuń klasę blur z miniaturek
    for (const img of $$('.over18 .thumbnail img[style*="blur"], .nsfw .thumbnail img')) {
      img.style.removeProperty('filter');
    }

    // kliknij przycisk "Click to see NSFW" wewnątrz shadowRoot jeśli istnieje
    for (const c of $$('shreddit-blurred-container')) {
      try {
        if (c.shadowRoot) {
          const btn = c.shadowRoot.querySelector('button, [role="button"]');
          // klik tylko gdy to NSFW i CFG.nsfw
          const reason = c.getAttribute('reason');
          if (btn && ((reason === 'nsfw' && CFG.nsfw) || (reason === 'spoiler' && CFG.spoiler))) {
            // sharddit-blurred-container odsłania po kliknięciu pierwszego dziecka
            // ale bezpieczniej kliknąć sam button
            if (!c._nsfwClicked) {
              c._nsfwClicked = true;
              btn.click();
            }
          }
        } else if (c.firstElementChild) {
          const reason = c.getAttribute('reason');
          if ((reason === 'nsfw' && CFG.nsfw) || (reason === 'spoiler' && CFG.spoiler)) {
            // niektóre wersje wymagają kliknięcia kontenera
            if (!c._nsfwClicked && c.shadowRoot === null) {
              // nie klikaj jeśli już odkryte
              if (c.hasAttribute('blurred') || c.blurred) {
                c._nsfwClicked = true;
                try { c.firstElementChild.click(); } catch (e) {}
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  // ---------- 6. Główna pętla ----------
  function tick() {
    injectStyle();
    removeOverlays();
    if (CFG.nsfw || CFG.spoiler) removeBlur();
  }

  // a) MutationObserver — serce skryptu (odporność na SPA)
  const observer = new MutationObserver(tick);
  // obserwuj jak najwcześniej documentElement, potem przełącz na body
  const startObserve = () => {
    const target = document.body || document.documentElement;
    if (target) {
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['blurred', 'reason'],
      });
    }
  };
  startObserve();

  // b) uruchom od razu i po DOMContentLoaded / load
  tick();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { startObserve(); tick(); }, { once: true });
  }
  window.addEventListener('load', tick, { once: true });

  // c) interwał awaryjny — pierwsze 15s co 400ms (łapie późno renderowane shreddit)
  let n = 0;
  const iv = setInterval(() => {
    tick();
    if (++n > 38) clearInterval(iv); // ~15s
  }, 400);

  // d) nasłuchuj nawigacji SPA (pushState)
  const _push = history.pushState;
  history.pushState = function () { const r = _push.apply(this, arguments); tick(); return r; };
  window.addEventListener('popstate', tick);
  // Reddit używa też custom eventów — reaguj na każdy tick observera więc popstate wystarczy jako dodatek

  // e) body pojawi się później przy document-start — podłącz observer ponownie
  new MutationObserver(() => {
    if (document.body && !document.body._nsfwObserved) {
      document.body._nsfwObserved = true;
      startObserve();
      tick();
    }
  }).observe(document.documentElement, { childList: true });

  // ---------- 7. Menu Tampermonkey ----------
  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand(
        (CFG.nsfw ? '✓' : '✗') + ' NSFW zawsze odkryte (klik aby przełączyć)',
        () => {
          CFG.nsfw = !CFG.nsfw;
          GM_setValue('nsfw', CFG.nsfw);
          alert('NSFW zawsze odkryte: ' + (CFG.nsfw ? 'WŁĄCZONE' : 'WYŁĄCZONE') + '\nOdśwież stronę jeśli potrzeba.');
          tick();
        }
      );
      GM_registerMenuCommand(
        (CFG.spoiler ? '✓' : '✗') + ' Spoilery zawsze odkryte',
        () => {
          CFG.spoiler = !CFG.spoiler;
          GM_setValue('spoiler', CFG.spoiler);
          alert('Spoilery odkryte: ' + (CFG.spoiler ? 'WŁĄCZONE' : 'WYŁĄCZONE'));
          tick();
        }
      );
    }
  } catch (e) {}

  log('załadowano, nsfw=', CFG.nsfw, 'spoiler=', CFG.spoiler);
})();
