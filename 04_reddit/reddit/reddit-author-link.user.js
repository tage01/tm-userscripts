// ==UserScript==
// @name         Reddit - link do profilu autora + obserwuj (Shreddit)
// @namespace    https://github.com/opencode/reddit-author-link
// @version      1.1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-author-link.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-author-link.user.js
// @description  Przy tytule posta: przycisk u/autor (zakładka Posts) i przycisk Obserwuj ze stanem (sprawdzanym w ukrytym iframe profilu). Odporny na SPA, nie niszczy layoutu.
// @author       opencode
// @match        https://www.reddit.com/*
// @match        https://*.reddit.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // w ukrytych iframe (profil autora) skrypt nic nie robi - sterowanie idzie z góry
  if (window.top !== window.self) return;

  const CLASS = 'rual-author';
  const CLASS_FOLLOW = 'rual-follow';
  // Selektory Shreddit (edytuj tylko tutaj przy zmianie frontendu)
  const SEL_POST = 'shreddit-post';
  const SEL_TITLE = '[slot="title"], h1, h3';
  const SEL_FOLLOW_BTN = 'follow-button [data-testid="follow-button"]';
  const CACHE_MS = 10 * 60 * 1000;
  const PROBE_TIMEOUT = 15000;
  const ACTION_TIMEOUT = 20000;

  const LABELS = { unknown: '…', busy: '…', on: '✓ Obserwujesz', off: '+ Obserwuj', error: 'Obserwuj ↗' };

  // --- Style (jeden blok, dziedziczy kolor - działa w jasnym i ciemnym motywie) ---
  function injectCSS() {
    if (document.getElementById('rual-style')) return;
    const st = document.createElement('style');
    st.id = 'rual-style';
    st.textContent = `
      .${CLASS}, .${CLASS_FOLLOW} {
        display: inline-block;
        margin-left: 8px;
        padding: 2px 10px;
        border: 1px solid rgba(128, 128, 128, 0.5);
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        line-height: 18px;
        color: inherit;
        white-space: nowrap;
        vertical-align: middle;
        cursor: pointer;
        /* ponad "stretched link" Shreddita (overlay tytułu na całej karcie posta) */
        position: relative;
        z-index: 2;
      }
      .${CLASS} { text-decoration: none; }
      .${CLASS}:hover, .${CLASS_FOLLOW}:hover {
        background: rgba(128, 128, 128, 0.2);
        border-color: rgba(128, 128, 128, 0.8);
        text-decoration: none;
      }
      .${CLASS_FOLLOW} { background: transparent; font-family: inherit; }
      .${CLASS_FOLLOW}[data-state="on"] { background: rgba(128, 128, 128, 0.25); }
      .${CLASS_FOLLOW}[data-state="unknown"], .${CLASS_FOLLOW}[data-state="busy"] { opacity: 0.5; cursor: wait; }
    `;
    document.documentElement.appendChild(st);
  }

  // --- Kolejka sekwencyjna (jeden ukryty iframe naraz + przerwa między zadaniami) ---
  let queue = Promise.resolve();
  function enqueue(task) {
    const run = queue.then(task);
    queue = run.catch(() => {}).then(() => sleep(700));
    return run;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // pred zwraca undefined, dopóki warunek nie jest spełniony
  function waitFor(pred, timeout) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        let v;
        try { v = pred(); } catch { v = undefined; }
        if (v !== undefined) return resolve(v);
        if (Date.now() - start > timeout) return resolve(undefined);
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  // --- Odczyt / kliknięcie przycisku Obserwuj w profilu ---
  // Na profilu w DOM są dwa przyciski: widoczny (Follow albo Unfollow) i ukryty drugi (wysokość 0).
  // Klikamy i czytamy tylko widoczny - ukryty kliknięcie nic nie robi.
  function getVisibleBtn(doc) {
    return [...doc.querySelectorAll(SEL_FOLLOW_BTN)].find((b) => b.getBoundingClientRect().height > 0) || null;
  }

  // Stan: wyłącznie atrybut is-followed na <follow-button> (potwierdzony na spez i AutoModerator).
  // Etykieta/ikona/klasa nie są wiarygodne. Atrybut aktualizuje się po odpowiedzi serwera.
  // Pusta etykieta widocznego przycisku = jeszcze się nie wyrenderował.
  function readFollowing(doc) {
    const btn = getVisibleBtn(doc);
    if (!btn) return undefined;
    const label = (btn.querySelector('.button-text') || btn).textContent.trim();
    if (!label) return undefined;
    const host = btn.closest('follow-button');
    return !!(host && host.hasAttribute('is-followed'));
  }

  // otwiera profil autora w ukrytym iframe (sesja użytkownika), wykonuje fn(doc), sprząta
  function withProfile(author, fn) {
    return new Promise((resolve) => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;visibility:hidden;';
      f.src = `/user/${encodeURIComponent(author)}/`;
      document.body.appendChild(f);
      const doc = () => { try { return f.contentDocument; } catch { return null; } };
      const ready = () => {
        const d = doc();
        return d && readFollowing(d) !== undefined ? true : undefined;
      };
      waitFor(ready, PROBE_TIMEOUT)
        .then((ok) => (ok ? fn(doc()) : null))
        .catch(() => null)
        .then((res) => { f.remove(); resolve(res); });
    });
  }

  const stateCache = new Map(); // autor -> { following, t }
  const inflight = new Map();   // autor -> Promise

  function getFollowing(author) {
    const c = stateCache.get(author);
    if (c && Date.now() - c.t < CACHE_MS) return Promise.resolve(c.following);
    if (inflight.has(author)) return inflight.get(author);
    // stan potwierdzamy po chwili - pierwszy odczyt bywa przed danymi o obserwowaniu
    const p = enqueue(() => withProfile(author, async (d) => {
      const first = readFollowing(d);
      await sleep(1500);
      const second = readFollowing(d);
      return first === second ? second : undefined;
    }))
      .then((v) => {
        if (typeof v === 'boolean') stateCache.set(author, { following: v, t: Date.now() });
        return v;
      })
      .finally(() => inflight.delete(author));
    inflight.set(author, p);
    return p;
  }

  function toggleFollow(author) {
    return enqueue(() => withProfile(author, async (d) => {
      // krótka przerwa: kliknięcie tuż po wyrenderowaniu bywa ignorowane (Reddit dopina obsługę)
      await sleep(1500);
      const before = readFollowing(d);
      const labelBefore = getVisibleBtn(d).textContent.trim();
      getVisibleBtn(d).click();
      // po kliknięciu widoczny przycisk zmienia etykietę (Follow <-> Unfollow)
      const changed = await waitFor(() => {
        const b = getVisibleBtn(d);
        const l = b ? b.textContent.trim() : '';
        return l && l !== labelBefore ? true : undefined;
      }, ACTION_TIMEOUT);
      if (changed === undefined) return undefined;
      // iframe musi żyć, aż żądanie dojdzie do serwera - inaczej zmiana się nie zapisze
      await sleep(4000);
      return !before;
    })).then((v) => {
      if (typeof v === 'boolean') stateCache.set(author, { following: v, t: Date.now() });
      return v;
    });
  }

  // --- Przyciski przy poście ---
  function paintFollow(btn, state) {
    btn.dataset.state = state;
    btn.textContent = LABELS[state];
    btn.disabled = state === 'busy';
    btn.title = state === 'error'
      ? 'Nie udało się sprawdzić stanu. Kliknij, aby otworzyć profil.'
      : (state === 'on' ? 'Kliknij, aby przestać obserwować' : 'Obserwuj ten profil');
  }

  // force=true nadpisuje też 'busy' (wynik kliknięcia musi zdjąć blokadę z klikniętego przycisku)
  function syncAuthor(author, state, force = false) {
    document.querySelectorAll(`.${CLASS_FOLLOW}`).forEach((b) => {
      if (b.dataset.author === author && (force || b.dataset.state !== 'busy')) paintFollow(b, state);
    });
  }

  function loadState(btn) {
    const author = btn.dataset.author;
    getFollowing(author).then((v) => {
      if (typeof v === 'boolean') syncAuthor(author, v ? 'on' : 'off');
      else syncAuthor(author, 'error');
    });
  }

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          io.unobserve(en.target);
          loadState(en.target);
        }
      }, { rootMargin: '300px 0px' })
    : null;

  // stan sprawdzamy dopiero, gdy przycisk zbliży się do ekranu (nie odpalaj iframe dla całego feedu)
  function observeFollow(btn) {
    if (io) io.observe(btn);
    else loadState(btn);
  }

  function onFollowClick(e, author) {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget;
    if (btn.dataset.state === 'busy') return;
    if (btn.dataset.state === 'error') {
      // otwarcie w tym samym kliknięciu - bez blokady popupów
      window.open(`/user/${encodeURIComponent(author)}/`, '_blank');
      return;
    }
    paintFollow(btn, 'busy');
    syncAuthor(author, 'busy');
    toggleFollow(author).then((res) => {
      syncAuthor(author, typeof res === 'boolean' ? (res ? 'on' : 'off') : 'error', true);
    });
  }

  // --- Dodanie linków do pojedynczego posta ---
  function addLink(post) {
    if (post.querySelector('.' + CLASS)) return;
    const author = post.getAttribute('author');
    if (!author || author === '[deleted]') return;

    const titleEl = post.querySelector(SEL_TITLE);
    if (!titleEl) return;

    // jeśli tytuł siedzi w linku, wstawiamy po zewnętrznym <a> (unikamy zagnieżdżonych linków)
    let anchor = titleEl;
    const outerA = titleEl.parentElement && titleEl.parentElement.closest('a');
    if (outerA) anchor = outerA;

    const link = document.createElement('a');
    link.className = CLASS;
    link.href = `/user/${encodeURIComponent(author)}/submitted/`;
    link.textContent = `u/${author}`;
    link.title = `Posty użytkownika u/${author}`;
    // klik ma otwierać profil, a nie permalink posta (Shreddit nasłuchuje na shreddit-post)
    link.addEventListener('click', (e) => e.stopPropagation());

    const follow = document.createElement('button');
    follow.type = 'button';
    follow.className = CLASS_FOLLOW;
    follow.dataset.author = author;
    follow.addEventListener('click', (e) => onFollowClick(e, author));
    paintFollow(follow, 'unknown');

    anchor.insertAdjacentElement('afterend', link);
    link.insertAdjacentElement('afterend', follow);
    observeFollow(follow);
  }

  function scan() {
    document.querySelectorAll(SEL_POST).forEach(addLink);
  }

  // --- MutationObserver dla SPA (infinite scroll, lazy hydratacja tytułów) ---
  let debounceTimer = null;
  function scheduleScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scan, 300);
  }

  function startObserver() {
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) { scheduleScan(); return; }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // --- Inicjalizacja ---
  injectCSS();
  scan();
  startObserver();
  // dodatkowe skany dla leniwego hydratowania Shreddit
  setTimeout(scan, 1000);
  setTimeout(scan, 3000);
})();
