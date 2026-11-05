// ==UserScript==
// @name         Reddit Comments Enhancer - Shreddit (www.reddit.com)
// @namespace    https://github.com/opencode/reddit-comments
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-comments.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/04_reddit/reddit/reddit-comments.user.js
// @description  Ulepsza komentarze: auto-rozwijanie, wyróżnij OP, nawigacja J/K, podświetl nowe, zwijanie wątków, skrót do sortowania.
// @author       opencode
// @match        https://www.reddit.com/r/*/comments/*
// @match        https://*.reddit.com/r/*/comments/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const CFG = {
    highlightOP: GM_getValue('rce_highlightOP', true),
    autoExpand: GM_getValue('rce_autoExpand', false), // domyślnie OFF - może być ciężkie
    navKeys: GM_getValue('rce_navKeys', true),
    highlightNew: GM_getValue('rce_highlightNew', true),
    collapseButton: GM_getValue('rce_collapseButton', true),
  };

  const SEL = {
    comment: 'shreddit-comment',
    tree: 'shreddit-comment-tree',
    post: 'shreddit-post',
  };

  // --- Pomoc: znajdź ciało komentarza scope-safe (gotcha Shreddit) ---
  function getCommentBodyEl(commentEl) {
    // shreddit-comment zawiera potomków - wybierz tylko bezpośrednie dziecko
    const candidates = [...commentEl.querySelectorAll('[slot="comment"] .md')];
    return candidates.find(n => n.closest(SEL.comment) === commentEl) || null;
  }

  // --- 1. Wyróżnij OP ---
  function highlightOP() {
    if (!CFG.highlightOP) return;
    const post = document.querySelector(SEL.post);
    const op = (post?.getAttribute('author') || '').toLowerCase();
    if (!op) return;
    document.querySelectorAll(SEL.comment).forEach(c => {
      const author = (c.getAttribute('author') || '').toLowerCase();
      if (author && author === op) {
        c.style.setProperty('--rce-op', '1');
        // dodaj badge jeśli brak
        if (c.querySelector('.rce-op-badge')) return;
        const meta = c.querySelector('[slot="commentMeta"]') || c;
        const badge = document.createElement('span');
        badge.className = 'rce-op-badge';
        badge.textContent = 'OP';
        badge.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 5px;border-radius:4px;background:#0a84ff;color:#fff;font:10px/1.2 sans-serif;font-weight:700;vertical-align:middle;';
        // wstaw obok autora
        const authorNode = c.querySelector('a[href*="/user/"]') || meta;
        try { authorNode.insertAdjacentElement('afterend', badge); } catch { meta.appendChild(badge); }
        // ramka
        c.style.outline = '1px solid rgba(10,132,255,0.35)';
        c.style.borderRadius = '6px';
      }
    });
  }

  // --- 2. Auto-rozwijanie "more replies" ---
  let autoExpandRunning = false;
  async function autoExpandAll() {
    if (autoExpandRunning) return;
    autoExpandRunning = true;
    let rounds = 0;
    while (rounds < 20) {
      rounds++;
      // Shreddit używa faceplate-partial i przycisków "Show X more replies"
      const btns = [...document.querySelectorAll('button')].filter(b => {
        const t = (b.textContent || '').toLowerCase();
        return /more replies|show more|pokaż więcej|continue this thread|kontynuuj/i.test(t) && b.offsetParent !== null;
      });
      // oraz faceplate-partial
      const partials = [...document.querySelectorAll('faceplate-partial[loading]')];
      if (btns.length === 0 && partials.length === 0) break;
      for (const b of btns.slice(0, 5)) {
        try { b.click(); } catch {}
        await new Promise(r => setTimeout(r, 600));
      }
      for (const p of partials.slice(0, 3)) {
        try { if (typeof p.loadContent === 'function') p.loadContent(); } catch {}
      }
      await new Promise(r => setTimeout(r, 900));
    }
    autoExpandRunning = false;
  }

  // --- 3. Nawigacja J/K między komentarzami na tym samym poziomie ---
  let currentIdx = -1;
  function getVisibleComments() {
    return [...document.querySelectorAll(SEL.comment)].filter(el => el.offsetParent !== null);
  }
  function focusComment(idx) {
    const list = getVisibleComments();
    if (!list.length) return;
    idx = Math.max(0, Math.min(idx, list.length - 1));
    currentIdx = idx;
    const el = list[idx];
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // highlight
    list.forEach(x => x.style.boxShadow = '');
    el.style.boxShadow = '0 0 0 2px #0a84ff inset';
    setTimeout(() => { el.style.boxShadow = ''; }, 1800);
  }

  function setupNavKeys() {
    if (!CFG.navKeys) return;
    document.addEventListener('keydown', (e) => {
      // ignoruj gdy pisanie
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        focusComment(currentIdx + 1);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        focusComment(currentIdx - 1);
      } else if (e.key === 'c' || e.key === 'C') {
        // zwin/rozwiń aktualny
        const list = getVisibleComments();
        const el = list[currentIdx];
        if (el) toggleCollapse(el);
      }
    });
  }

  // --- 4. Zwijanie wątków ---
  function toggleCollapse(commentEl) {
    const isCollapsed = commentEl.dataset.rceCollapsed === '1';
    // Shreddit komentarze mają details/slot - zwijamy dzieci
    // znajdź wszystkie komentarze potomne (depth większy i w DOM po tym elemencie aż do depth <= current)
    const all = [...document.querySelectorAll(SEL.comment)];
    const idx = all.indexOf(commentEl);
    if (idx === -1) return;
    const curDepth = parseInt(commentEl.getAttribute('depth') || '0', 10);
    if (isCollapsed) {
      // rozwiń
      delete commentEl.dataset.rceCollapsed;
      commentEl.style.opacity = '';
      for (let i = idx + 1; i < all.length; i++) {
        const d = parseInt(all[i].getAttribute('depth') || '0', 10);
        if (d <= curDepth) break;
        all[i].style.display = '';
      }
    } else {
      commentEl.dataset.rceCollapsed = '1';
      commentEl.style.opacity = '0.7';
      for (let i = idx + 1; i < all.length; i++) {
        const d = parseInt(all[i].getAttribute('depth') || '0', 10);
        if (d <= curDepth) break;
        all[i].style.display = 'none';
      }
    }
  }

  function addCollapseButtons() {
    if (!CFG.collapseButton) return;
    document.querySelectorAll(SEL.comment + ':not([data-rce-cbtn])').forEach(c => {
      c.dataset.rceCbtn = '1';
      const depth = parseInt(c.getAttribute('depth') || '0', 10);
      // tylko komentarze z potencjalnymi dziećmi (depth < max lub mają następcy z większym depth)
      const btn = document.createElement('button');
      btn.textContent = '−';
      btn.title = 'Zwiń/rozwiń wątek (skrót: c)';
      btn.style.cssText = 'margin-right:6px;padding:0 4px;border-radius:4px;border:1px solid #343536;background:#1a1a1b;color:#818384;cursor:pointer;font:12px/1 sans-serif;min-width:18px;';
      btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleCollapse(c); btn.textContent = c.dataset.rceCollapsed === '1' ? '+' : '−'; };
      // wstaw przed meta
      const meta = c.querySelector('[slot="commentMeta"]') || c.firstElementChild;
      try { meta?.insertAdjacentElement('beforebegin', btn); } catch { c.prepend(btn); }
    });
  }

  // --- 5. Podświetl nowe komentarze (od ostatniej wizyty) ---
  const VISIT_KEY_PREFIX = 'rce_visit_';
  function postId() {
    const post = document.querySelector(SEL.post);
    return post?.getAttribute('id') || location.pathname;
  }
  function markVisit() {
    const pid = postId();
    GM_setValue(VISIT_KEY_PREFIX + pid, Date.now());
  }
  function highlightNewComments() {
    if (!CFG.highlightNew) return;
    const pid = postId();
    const last = GM_getValue(VISIT_KEY_PREFIX + pid, 0);
    if (!last) { markVisit(); return; }
    document.querySelectorAll(SEL.comment).forEach(c => {
      const created = c.getAttribute('created') || c.getAttribute('created-timestamp') || '';
      if (!created) return;
      const ts = Date.parse(created);
      if (!isNaN(ts) && ts > last) {
        // nowy
        const body = getCommentBodyEl(c);
        if (body) body.style.background = 'rgba(255, 193, 7, 0.12)';
        c.style.borderLeft = '3px solid #ffc107';
      }
    });
  }

  // --- Panel + pływający pasek ---
  function addFloatingBar() {
    if (document.getElementById('rce-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'rce-bar';
    bar.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483646;display:flex;gap:6px;background:#1a1a1b;border:1px solid #343536;border-radius:999px;padding:6px 10px;box-shadow:0 4px 12px rgba(0,0,0,0.4);font:12px -apple-system,BlinkMacSystemFont,sans-serif;';
    const mk = (label, title, onClick) => {
      const b = document.createElement('button');
      b.textContent = label; b.title = title;
      b.style.cssText = 'padding:4px 8px;border-radius:999px;border:1px solid #343536;background:#272729;color:#d7dadc;cursor:pointer;';
      b.onclick = onClick;
      return b;
    };
    bar.appendChild(mk('J ↓', 'Następny komentarz (J)', () => focusComment(currentIdx + 1)));
    bar.appendChild(mk('K ↑', 'Poprzedni (K)', () => focusComment(currentIdx - 1)));
    bar.appendChild(mk('Rozwiń', 'Auto-rozwijanie wątków', () => autoExpandAll()));
    bar.appendChild(mk('OP', 'Przewiń do komentarzy OP', () => {
      const firstOP = [...document.querySelectorAll(SEL.comment)].find(c => (c.getAttribute('author')||'').toLowerCase() === (document.querySelector(SEL.post)?.getAttribute('author')||'').toLowerCase());
      if (firstOP) firstOP.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    // autohide gdy nie na stronie komentarzy
    if (!location.pathname.includes('/comments/')) bar.style.display = 'none';
    document.body.appendChild(bar);
  }

  function togglePanel() {
    let p = document.getElementById('rce-panel');
    if (p) { p.remove(); return; }
    p = document.createElement('div');
    p.id = 'rce-panel';
    p.style.cssText = 'position:fixed;top:60px;right:16px;z-index:2147483647;background:#0e1113;color:#d7dadc;border:1px solid #343536;border-radius:8px;padding:14px 16px;min-width:280px;box-shadow:0 8px 24px rgba(0,0,0,0.6);font:13px -apple-system,sans-serif;';
    p.appendChild(Object.assign(document.createElement('div'), { textContent: 'Komentarze — ustawienia', style: 'font-weight:700;margin-bottom:10px;font-size:14px;' }));
    const opts = [
      ['highlightOP', 'Wyróżnij komentarze OP'],
      ['highlightNew', 'Podświetl nowe od ostatniej wizyty'],
      ['collapseButton', 'Przyciski zwijania wątków'],
      ['navKeys', 'Nawigacja J/K/C'],
      ['autoExpand', 'Auto-rozwijanie przy wejściu (eksperymentalne)'],
    ];
    opts.forEach(([key, label]) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer;';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!CFG[key];
      cb.onchange = () => { CFG[key] = cb.checked; GM_setValue('rce_' + key, cb.checked); };
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

  // --- Observer i init ---
  function scan() {
    highlightOP();
    addCollapseButtons();
    highlightNewComments();
  }

  try { GM_registerMenuCommand('Reddit Comments: ustawienia', togglePanel); } catch {}

  addFloatingBar();
  scan();
  setupNavKeys();
  // auto-expand jeśli włączone
  if (CFG.autoExpand) setTimeout(autoExpandAll, 1200);
  // oznacz wizytę po 5s (by nowe zdążyły się podświetlić)
  setTimeout(markVisit, 5000);

  const obs = new MutationObserver((muts) => {
    let hit = false;
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches?.(SEL.comment) || n.querySelector?.(SEL.comment)) { hit = true; break; }
    }
    if (hit) setTimeout(scan, 300);
  });
  obs.observe(document.body, { childList: true, subtree: true });

  setTimeout(scan, 800);
  setTimeout(scan, 2500);
})();
