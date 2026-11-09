// ==UserScript==
// @name         Google Search – filtr wyników
// @namespace    opencode.google-search-filter
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/05_narzedzia/google-search-filter/google-search-filter.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/05_narzedzia/google-search-filter/google-search-filter.user.js
// @description  Ukrywa wyniki z wybranych domen i oferuje skróty wyszukiwania site:.
// @match        https://www.google.com/search*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const KEYS = {
    domains: 'gsf_blocked_domains',
    ai: 'gsf_hide_ai_overview',
    ads: 'gsf_hide_ads'
  };
  const hiddenDisplay = new WeakMap();
  const AI_HEADING_RE = /^(?:AI Overview|Przegląd AI|Odpowiedź trybu AI|AI Mode|Tryb AI):?$/i;
  let scanTimer = 0;

  function readDomains() {
    const stored = GM_getValue(KEYS.domains, []);
    return Array.isArray(stored) ? [...new Set(stored.map(normalizeDomain).filter(Boolean))] : [];
  }

  function normalizeDomain(value) {
    const input = String(value || '').trim().toLowerCase();
    if (!input) return '';
    try {
      const host = new URL(input.includes('://') ? input : `https://${input}`).hostname
        .replace(/^www\./, '')
        .replace(/\.$/, '');
      return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? host : '';
    } catch (_) {
      return '';
    }
  }

  function addDomain() {
    const answer = prompt('Podaj domenę do zablokowania (np. spam.example):');
    if (answer === null) return;
    const domain = normalizeDomain(answer);
    if (!domain) {
      alert('Nieprawidłowa domena.');
      return;
    }
    const domains = readDomains();
    if (!domains.includes(domain)) domains.push(domain);
    GM_setValue(KEYS.domains, domains);
    scheduleScan();
  }

  function removeDomain() {
    const domains = readDomains();
    if (!domains.length) {
      alert('Lista blokowanych domen jest pusta.');
      return;
    }
    const answer = prompt(`Wpisz domenę do usunięcia:\n${domains.join('\n')}`);
    if (answer === null) return;
    const domain = normalizeDomain(answer);
    GM_setValue(KEYS.domains, domains.filter(item => item !== domain));
    scheduleScan();
  }

  function getCurrentQuery() {
    const input = document.querySelector('textarea[name="q"], input[name="q"]');
    return (input && input.value) || new URL(location.href).searchParams.get('q') || '';
  }

  function searchOnSite(site) {
    let query = getCurrentQuery().trim();
    if (!query) query = (prompt('Wpisz szukane hasło:') || '').trim();
    if (!query) return;
    const siteFilter = `site:${site}`;
    if (!query.split(/\s+/).some(token => token.toLowerCase() === siteFilter.toLowerCase())) {
      query = `${query} ${siteFilter}`;
    }
    const url = new URL('/search', location.origin);
    url.searchParams.set('q', query);
    location.assign(url.href);
  }

  function searchOnForums() {
    const domain = normalizeDomain(prompt('Podaj domenę forum (np. forum.example):'));
    if (domain) searchOnSite(domain);
  }

  GM_registerMenuCommand('Dodaj domenę do blokady…', addDomain);
  GM_registerMenuCommand('Usuń domenę z blokady…', removeDomain);
  GM_registerMenuCommand('Przełącz ukrywanie AI Overview / Przeglądu AI', () => {
    GM_setValue(KEYS.ai, !GM_getValue(KEYS.ai, false));
    scheduleScan();
  });
  GM_registerMenuCommand('Przełącz ukrywanie reklam sponsorowanych', () => {
    GM_setValue(KEYS.ads, !GM_getValue(KEYS.ads, false));
    scheduleScan();
  });
  GM_registerMenuCommand('Szukaj tylko na forach…', searchOnForums);
  GM_registerMenuCommand('Szukaj tylko na Reddit', () => searchOnSite('reddit.com'));
  GM_registerMenuCommand('Szukaj tylko na GitHub', () => searchOnSite('github.com'));

  function getResultCards() {
    const search = document.querySelector('#search');
    if (!search) return [];

    const cards = new Set();
    // `div.g` to starszy kontener, `[data-hveid]` – nowszy. Wybieramy najbliższą kartę,
    // aby nie ukryć większego modułu zawierającego kilka wyników.
    search.querySelectorAll('h3').forEach(heading => {
      if (AI_HEADING_RE.test((heading.innerText || heading.textContent || '').trim())) return;
      const card = heading.closest('div.g, [data-hveid]') || heading.closest('a[href]')?.parentElement;
      if (card && search.contains(card) && card.querySelector('a[href]')) cards.add(card);
    });
    return [...cards];
  }

  function hostFromHref(href) {
    if (!href) return '';
    try {
      const url = new URL(href, location.href);
      if (url.hostname !== location.hostname) return url.hostname.toLowerCase().replace(/^www\./, '');
      // Klasyczne Google redirecty; nowy /goto z tokenem jest nieprzezroczysty i wymaga fallbacku.
      if (url.pathname === '/url') {
        const destination = url.searchParams.get('q') || url.searchParams.get('url');
        if (destination) return new URL(destination).hostname.toLowerCase().replace(/^www\./, '');
      }
    } catch (_) {
      return '';
    }
    return '';
  }

  function hostFromVisibleText(text) {
    // Wyświetlany adres (np. https://example.com) jest fallbackiem dla zaszyfrowanych /goto.
    const match = String(text || '').match(/(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})(?::\d+)?(?:\/[^\s]*)?/i);
    return match ? match[1].toLowerCase().replace(/^www\./, '') : '';
  }

  function cardDomain(card) {
    const heading = card.querySelector('h3');
    const titleLink = heading && heading.closest('a[href]');
    const directHost = titleLink && hostFromHref(titleLink.getAttribute('href'));
    if (directHost) return directHost;
    const cardText = card.innerText || card.textContent || '';
    return hostFromVisibleText(cardText);
  }

  function hide(element) {
    if (!element || !hiddenDisplay.has(element)) {
      if (element) {
        hiddenDisplay.set(element, {
          value: element.style.getPropertyValue('display'),
          priority: element.style.getPropertyPriority('display')
        });
      }
    }
    if (element) element.style.display = 'none';
  }

  function show(element) {
    if (!element || !hiddenDisplay.has(element)) return;
    const original = hiddenDisplay.get(element);
    if (original.value) element.style.setProperty('display', original.value, original.priority);
    else element.style.removeProperty('display');
    hiddenDisplay.delete(element);
  }

  function matchesBlockedDomain(host, domains) {
    return !!host && domains.some(domain => host === domain || host.endsWith(`.${domain}`));
  }

  function findAiBlocks() {
    const search = document.querySelector('#search');
    if (!search) return [];
    const blocks = new Set();
    // Nagłówki AI są zależne od języka; kontener `[data-hveid]` jest zmienny i opisany jako wrażliwy.
    search.querySelectorAll('h1, h2, h3, [role="heading"]').forEach(heading => {
      if (!AI_HEADING_RE.test((heading.innerText || heading.textContent || '').trim())) return;
      const block = heading.closest('[data-hveid]') || heading.parentElement?.parentElement;
      if (block && search.contains(block)) blocks.add(block);
    });
    return [...blocks];
  }

  function scan() {
    const domains = readDomains().map(normalizeDomain).filter(Boolean);
    getResultCards().forEach(card => {
      if (matchesBlockedDomain(cardDomain(card), domains)) hide(card);
      else show(card);
    });

    const hideAi = !!GM_getValue(KEYS.ai, false);
    findAiBlocks().forEach(block => hideAi ? hide(block) : show(block));

    const hideAds = !!GM_getValue(KEYS.ads, false);
    // ID-y reklam są stabilniejsze niż klasy, ale mogą zmienić się w nowym layoucie Google.
    document.querySelectorAll('#tads, #bottomads').forEach(block => hideAds ? hide(block) : show(block));
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 180);
  }

  scan();
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
