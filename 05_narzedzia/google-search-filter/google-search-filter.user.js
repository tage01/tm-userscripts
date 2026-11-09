// ==UserScript==
// @name         Google Search – filtr wyników
// @namespace    opencode.google-search-filter
// @version      1.1.0
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
  let refreshPanel = () => {};

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

  function addBlockedDomain(value) {
    const domain = normalizeDomain(value);
    if (!domain) return false;
    const domains = readDomains();
    if (!domains.includes(domain)) domains.push(domain);
    GM_setValue(KEYS.domains, domains);
    scheduleScan();
    return true;
  }

  function removeBlockedDomain(value) {
    const domain = normalizeDomain(value);
    if (!domain) return;
    GM_setValue(KEYS.domains, readDomains().filter(item => item !== domain));
    scheduleScan();
  }

  function addDomain() {
    const answer = prompt('Podaj domenę do zablokowania (np. spam.example):');
    if (answer === null) return;
    if (!addBlockedDomain(answer)) alert('Nieprawidłowa domena.');
  }

  function removeDomain() {
    const domains = readDomains();
    if (!domains.length) {
      alert('Lista blokowanych domen jest pusta.');
      return;
    }
    const answer = prompt(`Wpisz domenę do usunięcia:\n${domains.join('\n')}`);
    if (answer === null) return;
    removeBlockedDomain(answer);
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

  function createPanel() {
    const host = document.createElement('div');
    host.id = 'gsf-panel-host';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; color: #202124; font: 14px/1.4 system-ui, sans-serif; }
      *, *::before, *::after { box-sizing: border-box; }
      .shell { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
      .launcher, button { font: inherit; cursor: pointer; }
      .launcher { border: 0; border-radius: 999px; padding: 10px 15px; color: #fff; background: #1a73e8; box-shadow: 0 2px 10px #0004; font-weight: 600; }
      .launcher:hover { background: #1558b0; }
      .panel { width: min(350px, calc(100vw - 32px)); max-height: min(76vh, 700px); overflow: auto; padding: 14px; border: 1px solid #dadce0; border-radius: 12px; background: #fff; color: #202124; box-shadow: 0 4px 24px #0003; }
      .panel[hidden] { display: none !important; }
      .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
      h2 { margin: 0; font-size: 16px; }
      h3 { margin: 14px 0 7px; font-size: 13px; }
      .close { border: 0; background: transparent; color: #5f6368; font-size: 20px; line-height: 1; padding: 3px 7px; }
      .toggle { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
      input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: #1a73e8; }
      .entry { display: flex; gap: 6px; }
      input[type="text"] { min-width: 0; flex: 1; padding: 7px 8px; border: 1px solid #dadce0; border-radius: 6px; color: #202124; background: #fff; font: inherit; }
      .action { padding: 7px 9px; border: 1px solid #dadce0; border-radius: 6px; color: #202124; background: #f8f9fa; }
      .action:hover { background: #eef2f7; }
      .primary { border-color: #1a73e8; color: #fff; background: #1a73e8; }
      .primary:hover { background: #1558b0; }
      .domain-list { display: grid; gap: 4px; max-height: 128px; overflow: auto; margin: 7px 0 0; padding: 0; list-style: none; }
      .domain-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 6px; border-radius: 5px; background: #f8f9fa; }
      .domain-name { min-width: 0; overflow-wrap: anywhere; }
      .remove { flex: none; border: 0; border-radius: 4px; padding: 2px 7px; color: #5f6368; background: transparent; }
      .remove:hover { color: #b3261e; background: #fce8e6; }
      .search-buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
      .hint, .status { margin: 6px 0 0; color: #5f6368; font-size: 12px; }
      .status { min-height: 1em; }
      button:focus-visible, input:focus-visible { outline: 2px solid #1a73e8; outline-offset: 2px; }
    `;

    const shell = document.createElement('div');
    shell.className = 'shell';
    shell.innerHTML = `
      <section class="panel" id="panel" aria-labelledby="panel-title" hidden>
        <div class="header">
          <h2 id="panel-title">Filtr Google Search</h2>
          <button class="close" type="button" aria-label="Zamknij panel">×</button>
        </div>
        <label class="toggle"><input id="toggle-ai" type="checkbox"> Ukrywaj AI Overview / Przegląd AI</label>
        <label class="toggle"><input id="toggle-ads" type="checkbox"> Ukrywaj reklamy sponsorowane</label>
        <h3>Blokowane domeny</h3>
        <form class="entry" id="domain-form">
          <input id="domain-input" type="text" placeholder="np. spam.example" aria-label="Domena do zablokowania">
          <button class="action primary" type="submit">Dodaj</button>
        </form>
        <ul class="domain-list" id="domain-list" aria-label="Lista blokowanych domen"></ul>
        <p class="status" id="panel-status" aria-live="polite"></p>
        <h3>Szukaj tylko na</h3>
        <form class="entry" id="forum-form">
          <input id="forum-domain" type="text" placeholder="Domena forum" aria-label="Domena forum">
          <button class="action" type="submit">Forum</button>
        </form>
        <div class="search-buttons">
          <button class="action" id="search-reddit" type="button">Reddit</button>
          <button class="action" id="search-github" type="button">GitHub</button>
        </div>
        <p class="hint">Filtr site: zostanie dopisany do bieżącego zapytania.</p>
      </section>
      <button class="launcher" id="launcher" type="button" aria-expanded="false" aria-controls="panel">Filtr Google</button>
    `;
    shadow.append(style, shell);
    document.documentElement.appendChild(host);

    const panel = shadow.querySelector('#panel');
    const launcher = shadow.querySelector('#launcher');
    const status = shadow.querySelector('#panel-status');
    const domainInput = shadow.querySelector('#domain-input');
    const forumDomain = shadow.querySelector('#forum-domain');
    const domainList = shadow.querySelector('#domain-list');

    function renderDomains() {
      domainList.replaceChildren();
      readDomains().forEach(domain => {
        const item = document.createElement('li');
        item.className = 'domain-item';
        const name = document.createElement('span');
        name.className = 'domain-name';
        name.textContent = domain;
        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.type = 'button';
        remove.textContent = 'Usuń';
        remove.setAttribute('aria-label', `Usuń domenę ${domain}`);
        remove.addEventListener('click', () => {
          removeBlockedDomain(domain);
          status.textContent = `Usunięto ${domain}.`;
        });
        item.append(name, remove);
        domainList.appendChild(item);
      });
    }

    refreshPanel = () => {
      shadow.querySelector('#toggle-ai').checked = !!GM_getValue(KEYS.ai, false);
      shadow.querySelector('#toggle-ads').checked = !!GM_getValue(KEYS.ads, false);
      renderDomains();
    };

    launcher.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      launcher.setAttribute('aria-expanded', String(!panel.hidden));
    });
    shadow.querySelector('.close').addEventListener('click', () => {
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      launcher.focus();
    });
    shadow.querySelector('#toggle-ai').addEventListener('change', event => {
      GM_setValue(KEYS.ai, event.currentTarget.checked);
      scheduleScan();
    });
    shadow.querySelector('#toggle-ads').addEventListener('change', event => {
      GM_setValue(KEYS.ads, event.currentTarget.checked);
      scheduleScan();
    });
    shadow.querySelector('#domain-form').addEventListener('submit', event => {
      event.preventDefault();
      const domain = normalizeDomain(domainInput.value);
      if (!domain) {
        status.textContent = 'Wpisz prawidłową domenę.';
        return;
      }
      addBlockedDomain(domain);
      domainInput.value = '';
      status.textContent = `Dodano ${domain}.`;
    });
    shadow.querySelector('#forum-form').addEventListener('submit', event => {
      event.preventDefault();
      const domain = normalizeDomain(forumDomain.value);
      if (!domain) {
        status.textContent = 'Wpisz domenę forum, np. forum.example.';
        forumDomain.focus();
        return;
      }
      searchOnSite(domain);
    });
    shadow.querySelector('#search-reddit').addEventListener('click', () => searchOnSite('reddit.com'));
    shadow.querySelector('#search-github').addEventListener('click', () => searchOnSite('github.com'));
    refreshPanel();
  }

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
    scanTimer = setTimeout(() => {
      scan();
      refreshPanel();
    }, 180);
  }

  createPanel();
  scan();
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
