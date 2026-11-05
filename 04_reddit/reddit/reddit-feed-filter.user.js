// ==UserScript==
// @name         Reddit Feed Filter - Shreddit (www.reddit.com)
// @namespace    https://github.com/opencode/reddit-feed-filter
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-feed-filter.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-feed-filter.user.js
// @description  Filtruje feed: blacklist subredditów, keywords w tytule (regex), próg score, NSFW, przeczytane. Licznik + cofnij. SPA odporny.
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

  const STORE_KEY = 'rff_config_v1';
  const VISITED_KEY = 'rff_visited_v1';

  const DEFAULTS = {
    blockedSubs: [],        // ["pics", "funny"]
    blockedKeywords: [],    // ["meme", "/shitpost/i", "regex"]
    minScore: null,         // np. 100 -> ukryj <100
    hideNSFW: false,
    hideVisited: false,
    blockedAuthors: [],     // ["user123"]
  };

  function loadConfig() {
    try {
      const raw = GM_getValue(STORE_KEY, null);
      if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch {}
    return Object.assign({}, DEFAULTS);
  }
  function saveConfig(cfg) { GM_setValue(STORE_KEY, JSON.stringify(cfg)); }

  let CFG = loadConfig();

  // visited - prosta pamięć w GM storage (max 2000)
  function loadVisited() {
    try { return new Set(JSON.parse(GM_getValue(VISITED_KEY, '[]'))); } catch { return new Set(); }
  }
  let visitedSet = loadVisited();
  function saveVisited() {
    const arr = [...visitedSet].slice(-2000);
    GM_setValue(VISITED_KEY, JSON.stringify(arr));
  }
  function markVisited(id) { visitedSet.add(id); saveVisited(); }

  // --- Selektory ---
  const SEL = { post: 'shreddit-post' };

  function getMeta(postEl) {
    return {
      id: postEl.getAttribute('id') || '',
      title: (postEl.getAttribute('post-title') || '').trim(),
      sub: (postEl.getAttribute('subreddit-name') || postEl.getAttribute('subreddit-prefixed-name') || '').replace(/^r\//i, '').toLowerCase(),
      author: (postEl.getAttribute('author') || '').toLowerCase(),
      score: parseInt(postEl.getAttribute('score') || '0', 10),
      nsfw: postEl.getAttribute('nsfw') !== null, // "" = true, null = false (gotcha Shreddit)
      permalink: postEl.getAttribute('permalink') || '',
    };
  }

  // --- Keyword matching: plain lub /regex/flags ---
  function keywordMatches(title, pattern) {
    const t = title.toLowerCase();
    const p = pattern.trim();
    if (!p) return false;
    // regex literal: /foo/i
    if (p.startsWith('/') && p.lastIndexOf('/') > 0) {
      const last = p.lastIndexOf('/');
      const body = p.slice(1, last);
      const flags = p.slice(last + 1);
      try {
        const re = new RegExp(body, flags.includes('i') ? flags : flags + 'i');
        return re.test(title);
      } catch { return t.includes(p.toLowerCase()); }
    }
    // zwykły substring (case-insensitive)
    // obsługa "!" negacji niepotrzebna
    return t.includes(p.toLowerCase());
  }

  function shouldHide(postEl) {
    const m = getMeta(postEl);
    if (!m.id) return { hide: false };

    // subreddit blacklist
    if (CFG.blockedSubs.length && m.sub) {
      const subLow = m.sub.toLowerCase();
      if (CFG.blockedSubs.some(s => s.toLowerCase() === subLow)) return { hide: true, reason: 'sub:r/' + m.sub };
    }
    // author blacklist
    if (CFG.blockedAuthors.length && m.author) {
      if (CFG.blockedAuthors.some(a => a.toLowerCase() === m.author)) return { hide: true, reason: 'autor:' + m.author };
    }
    // keywords
    if (CFG.blockedKeywords.length && m.title) {
      for (const kw of CFG.blockedKeywords) {
        if (keywordMatches(m.title, kw)) return { hide: true, reason: 'keyword:' + kw };
      }
    }
    // score próg
    if (CFG.minScore !== null && CFG.minScore !== '' && !isNaN(CFG.minScore)) {
      const thr = parseInt(CFG.minScore, 10);
      if (!isNaN(thr) && m.score < thr) return { hide: true, reason: 'score<' + thr + ' (' + m.score + ')' };
    }
    // NSFW
    if (CFG.hideNSFW && m.nsfw) return { hide: true, reason: 'NSFW' };
    // visited
    if (CFG.hideVisited && visitedSet.has(m.id)) return { hide: true, reason: 'przeczytane' };

    return { hide: false };
  }

  // --- Ukrywanie + licznik ---
  let hiddenCount = 0;
  const hiddenMap = new Map(); // id -> {el, reason}

  function applyFilter() {
    hiddenCount = 0;
    document.querySelectorAll(SEL.post).forEach(el => {
      // reklamy nie filtrujemy - robi to cleaner
      if (el.closest('shreddit-ad-post')) return;
      const { hide, reason } = shouldHide(el);
      // kontener article jest rodzicem shreddit-post w feedzie - ukrywamy cały article dla czystości
      const wrapper = el.closest('article') || el;
      if (hide) {
        wrapper.style.display = 'none';
        wrapper.dataset.rffHidden = '1';
        wrapper.dataset.rffReason = reason || '';
        hiddenCount++;
        if (el.getAttribute('id')) hiddenMap.set(el.getAttribute('id'), { el: wrapper, reason });
      } else {
        if (wrapper.dataset.rffHidden === '1') {
          wrapper.style.display = '';
          delete wrapper.dataset.rffHidden;
        }
      }
    });
    updateBadge();
  }

  // --- Badge licznika ---
  let badgeEl = null;
  function ensureBadge() {
    if (badgeEl && document.body.contains(badgeEl)) return badgeEl;
    badgeEl = document.createElement('div');
    badgeEl.id = 'rff-badge';
    badgeEl.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483646;background:#1a1a1b;color:#d7dadc;border:1px solid #343536;border-radius:999px;padding:6px 12px;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:none;align-items:center;gap:8px;';
    document.body.appendChild(badgeEl);
    return badgeEl;
  }
  function updateBadge() {
    const b = ensureBadge();
    if (hiddenCount > 0) {
      b.style.display = 'inline-flex';
      b.innerHTML = '';
      const txt = document.createElement('span');
      txt.textContent = 'Ukryto ' + hiddenCount + ' postów';
      const undo = document.createElement('button');
      undo.textContent = 'Pokaż';
      undo.style.cssText = 'padding:2px 8px;border-radius:999px;border:1px solid #343536;background:#272729;color:#d7dadc;cursor:pointer;font:12px inherit;';
      undo.onclick = () => {
        document.querySelectorAll('[data-rff-hidden="1"]').forEach(w => { w.style.display = ''; delete w.dataset.rffHidden; });
        hiddenCount = 0;
        updateBadge();
      };
      const cfgBtn = document.createElement('button');
      cfgBtn.textContent = '⚙';
      cfgBtn.title = 'Ustawienia filtra';
      cfgBtn.style.cssText = 'padding:2px 6px;border-radius:6px;border:1px solid #343536;background:#272729;color:#d7dadc;cursor:pointer;';
      cfgBtn.onclick = togglePanel;
      b.appendChild(txt); b.appendChild(undo); b.appendChild(cfgBtn);
    } else {
      b.style.display = 'none';
    }
  }

  // --- Panel konfiguracji ---
  function togglePanel() {
    let p = document.getElementById('rff-panel');
    if (p) { p.remove(); return; }
    p = document.createElement('div');
    p.id = 'rff-panel';
    p.style.cssText = 'position:fixed;top:60px;right:16px;z-index:2147483647;background:#0e1113;color:#d7dadc;border:1px solid #343536;border-radius:8px;padding:16px;min-width:360px;max-width:420px;box-shadow:0 8px 24px rgba(0,0,0,0.6);font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-height:85vh;overflow:auto;';

    const h = (t, mt = '14px') => {
      const e = document.createElement('div');
      e.textContent = t;
      e.style.cssText = `font-weight:700;margin-top:${mt};margin-bottom:6px;font-size:13px;`;
      return e;
    };
    const inpStyle = 'width:100%;padding:6px 8px;border-radius:6px;border:1px solid #343536;background:#1a1a1b;color:#d7dadc;font:13px inherit;box-sizing:border-box;';
    const helpStyle = 'color:#818384;font-size:11px;margin-top:4px;';

    p.appendChild(Object.assign(document.createElement('div'), { textContent: 'Reddit Feed Filter — filtry', style: 'font-weight:700;font-size:15px;margin-bottom:10px;' }));

    // subreddity
    p.appendChild(h('Zablokowane subreddity', '0'));
    const subInp = document.createElement('textarea');
    subInp.rows = 2; subInp.style.cssText = inpStyle;
    subInp.placeholder = 'np. pics, funny, memes  (oddziel przecinkami lub enterem)';
    subInp.value = CFG.blockedSubs.join(', ');
    p.appendChild(subInp);
    const subHelp = document.createElement('div'); subHelp.style.cssText = helpStyle; subHelp.textContent = 'Bez "r/", małe/duże litery bez znaczenia.';
    p.appendChild(subHelp);

    // keywords
    p.appendChild(h('Słowa kluczowe w tytule'));
    const kwInp = document.createElement('textarea');
    kwInp.rows = 3; kwInp.style.cssText = inpStyle;
    kwInp.placeholder = 'np. meme, giveaway, /shitpost/i, /\\bAI\\b/';
    kwInp.value = CFG.blockedKeywords.join(', ');
    p.appendChild(kwInp);
    const kwHelp = document.createElement('div'); kwHelp.style.cssText = helpStyle;
    kwHelp.textContent = 'Plain = substring case-insensitive. Regex = /wzorzec/flag (np. /foo/i).';
    p.appendChild(kwHelp);

    // autorzy
    p.appendChild(h('Zablokowani autorzy'));
    const authInp = document.createElement('input');
    authInp.type = 'text'; authInp.style.cssText = inpStyle;
    authInp.placeholder = 'np. AutoModerator, user123';
    authInp.value = CFG.blockedAuthors.join(', ');
    p.appendChild(authInp);

    // score
    p.appendChild(h('Minimalny score (ukryj poniżej)'));
    const scoreInp = document.createElement('input');
    scoreInp.type = 'number'; scoreInp.style.cssText = inpStyle;
    scoreInp.placeholder = 'np. 100 (puste = wyłączone)';
    scoreInp.value = CFG.minScore ?? '';
    p.appendChild(scoreInp);

    // checkboxy
    const cb = (label, key) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0;cursor:pointer;';
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!CFG[key];
      c.addEventListener('change', () => { CFG[key] = c.checked; });
      const s = document.createElement('span'); s.textContent = label;
      row.appendChild(c); row.appendChild(s);
      return row;
    };
    p.appendChild(h('Przełączniki'));
    p.appendChild(cb('Ukryj NSFW', 'hideNSFW'));
    const visitedRow = cb('Ukryj przeczytane (po kliknięciu)', 'hideVisited');
    p.appendChild(visitedRow);
    // przycisk wyczyść przeczytane
    const clearVisited = document.createElement('button');
    clearVisited.textContent = 'Wyczyść historię przeczytanych (' + visitedSet.size + ')';
    clearVisited.style.cssText = 'margin:4px 0 0 24px;padding:4px 8px;border-radius:6px;border:1px solid #343536;background:#1a1a1b;color:#818384;cursor:pointer;font:11px inherit;';
    clearVisited.onclick = () => { visitedSet.clear(); saveVisited(); clearVisited.textContent = 'Wyczyszczono!'; setTimeout(() => clearVisited.textContent = 'Wyczyść historię przeczytanych (0)', 1200); applyFilter(); };
    p.appendChild(clearVisited);

    // przyciski
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:14px;';
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Zapisz i filtruj';
    saveBtn.style.cssText = 'flex:1;padding:8px;border-radius:6px;border:none;background:#0a84ff;color:#fff;cursor:pointer;font-weight:600;';
    saveBtn.onclick = () => {
      const parseList = (s) => s.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
      CFG.blockedSubs = parseList(subInp.value);
      CFG.blockedKeywords = parseList(kwInp.value);
      CFG.blockedAuthors = parseList(authInp.value);
      const v = scoreInp.value.trim();
      CFG.minScore = v === '' ? null : parseInt(v, 10);
      saveConfig(CFG);
      applyFilter();
      p.remove();
    };
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Anuluj';
    cancelBtn.style.cssText = 'padding:8px 14px;border-radius:6px;border:1px solid #343536;background:#1a1a1b;color:#d7dadc;cursor:pointer;';
    cancelBtn.onclick = () => p.remove();
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Przywróć domyślne';
    resetBtn.style.cssText = 'padding:8px 10px;border-radius:6px;border:1px solid #343536;background:#1a1a1b;color:#818384;cursor:pointer;';
    resetBtn.onclick = () => {
      CFG = Object.assign({}, DEFAULTS);
      saveConfig(CFG);
      applyFilter();
      p.remove();
    };
    btnRow.appendChild(saveBtn); btnRow.appendChild(cancelBtn); btnRow.appendChild(resetBtn);
    p.appendChild(btnRow);

    // szybkie dodawanie: klik PPM na poście -> blokuj sub/autora
    const tip = document.createElement('div');
    tip.style.cssText = helpStyle + 'margin-top:10px;border-top:1px solid #343536;padding-top:8px;';
    tip.textContent = 'Wskazówka: kliknij PPM na tytule posta i użyj menu kontekstowego (jeśli masz rozszerzenie) lub wpisz ręcznie powyżej.';
    p.appendChild(tip);

    document.body.appendChild(p);
  }

  // --- Śledzenie przeczytanych (klik w post-title) ---
  function hookVisited() {
    document.addEventListener('click', (e) => {
      const post = e.target.closest('shreddit-post');
      if (!post) return;
      const a = e.target.closest('a[href*="/comments/"]');
      // klik w tytuł lub w post - oznacz jako przeczytany
      if (a || e.target.closest('[slot="title"]')) {
        const id = post.getAttribute('id');
        if (id) { markVisited(id); if (CFG.hideVisited) setTimeout(applyFilter, 400); }
      }
    }, true);
  }

  // --- Szybkie akcje: dodaj przycisk Blokuj na poście ---
  function addBlockButtons() {
    document.querySelectorAll('shreddit-post:not([data-rff-btn])').forEach(post => {
      post.dataset.rffBtn = '1';
      const sub = (post.getAttribute('subreddit-name') || '').trim();
      if (!sub) return;
      // mały przycisk w credit-bar
      const bar = post.querySelector('[slot="credit-bar"]') || post;
      const btn = document.createElement('button');
      btn.textContent = '⦸';
      btn.title = 'Zablokuj r/' + sub + ' (Feed Filter)';
      btn.style.cssText = 'margin-left:6px;padding:0 4px;border-radius:4px;border:1px solid #343536;background:transparent;color:#818384;cursor:pointer;font:11px/1 sans-serif;opacity:0.5;';
      btn.onmouseenter = () => btn.style.opacity = '1';
      btn.onmouseleave = () => btn.style.opacity = '0.5';
      btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const low = sub.toLowerCase();
        if (!CFG.blockedSubs.some(s => s.toLowerCase() === low)) {
          CFG.blockedSubs.push(sub);
          saveConfig(CFG);
          applyFilter();
        }
      };
      try { bar.appendChild(btn); } catch {}
    });
  }

  // --- Observer ---
  let timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(() => { applyFilter(); addBlockButtons(); }, 250); }
  function startObserver() {
    const obs = new MutationObserver((muts) => {
      let hit = false;
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('shreddit-post') || n.querySelector?.('shreddit-post')) { hit = true; break; }
      }
      if (hit) schedule();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  try { GM_registerMenuCommand('Reddit Filter: ustawienia', togglePanel); } catch {}
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); togglePanel(); }
  });

  applyFilter();
  addBlockButtons();
  hookVisited();
  startObserver();
  setTimeout(() => { applyFilter(); addBlockButtons(); }, 800);
  setTimeout(() => { applyFilter(); addBlockButtons(); }, 3000);
})();
