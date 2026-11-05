// ==UserScript==
// @name         Filmweb Cenzor – Filtrowanie tonu wypowiedzi (LLM)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/03_filmweb/filmweb2/filmweb-censor.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/03_filmweb/filmweb2/filmweb-censor.user.js
// @description  Automatycznie ukrywa komentarze o agresywnym, wulgarnym lub nienawistnym tonie na Filmwebie. Używa darmowego LLM (Hugging Face Inference API).
// @author       You
// @match        https://filmweb.pl/*
// @match        https://www.filmweb.pl/*
// @icon         https://www.filmweb.pl/favicon.ico
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        hfModel: 'unitary/toxic-bert',
        thresholds: {
            toxic: 0.75,
            severe_toxic: 0.5,
            insult: 0.6,
            threat: 0.4,
            identity_hate: 0.4,
            obscene: 0.7,
        },
        maxCacheSize: 500,
        hfDelayMs: 1200,
        defaultMode: 'llm',
    };

    // Sekcja komentarzy – kontener znany z HTML Filmwebu
    const CONTAINER_SELECTOR = [
        '.commentSection',
        '.CommentSection',
        '[class*="CommentSection"]',
        '[data-entity-name$="Comment" i]',
        '[data-entity-name$="comment" i]',
        '.commentSection--news',
        '.commentSection--film',
    ].join(', ');

    // Dodatkowe selektory dla elementów wewnątrz sekcji (różne wersje GWT)
    const FALLBACK_ITEM_SELECTORS = [
        '[class*="commentItem"]',
        '[class*="CommentItem"]',
        '[class*="commentListItem"]',
        '[class*="comment"] [class*="text"]',
        '[class*="comment"] [class*="Text"]',
        '[class*="comment"] [class*="content"]',
        '[class*="comment"] [class*="Content"]',
        '[class*="review"]',
        '[class*="Review"]',
        '[class*="forumPost"]',
    ].join(', ');

    // Elementy, które na pewno nie są komentarzami
    const SKIP_TAGS = new Set([
        'SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'IFRAME',
        'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'IMG',
        'SVG', 'PATH', 'USE', 'A', 'NAV', 'HEADER', 'FOOTER',
    ]);

    let observer = null;
    let mode = CONFIG.defaultMode;
    let llmQueue = [];
    let llmRunning = false;
    let llmCache = new Map();

    // ── Style ──
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .fw-censor-hidden {
                opacity: 0.3 !important;
                filter: blur(2px) !important;
                pointer-events: none;
                user-select: none;
                transition: opacity 0.3s ease, filter 0.3s ease;
            }
            .fw-censor-hidden.fw-censor-revealed {
                opacity: 1 !important;
                filter: none !important;
                pointer-events: auto;
                user-select: auto;
            }
            .fw-censor-badge {
                display: inline-block;
                background: #e74c3c;
                color: #fff;
                font-size: 11px;
                padding: 2px 8px;
                border-radius: 10px;
                cursor: pointer;
                margin-left: 8px;
                user-select: none;
                pointer-events: auto;
                transition: background 0.2s;
            }
            .fw-censor-badge:hover {
                background: #c0392b;
            }
            .fw-censor-llm-pending {
                border-left: 3px solid #f39c12 !important;
            }
        `;
        document.head.appendChild(style);
    }

    // ── Znajdowanie sekcji komentarzy ──
    function findCommentContainers() {
        const containers = document.querySelectorAll(CONTAINER_SELECTOR);
        // Jeśli nie znaleziono – szukaj po tekście
        if (containers.length === 0) {
            // Poszukaj sekcji zawierającej "komentarz" lub "Komentarze" w nagłówku
            const allSections = document.querySelectorAll('.page__section, section, [class*="section"]');
            for (const section of allSections) {
                const text = section.textContent.trim();
                if (/komentarz|Komentarze|comment|Comment/i.test(text) && text.length < 200) {
                    // To może być sekcja komentarzy – weź rodzica
                    const parent = section.closest('.page__section, .page__group, [class*="section"]') || section;
                    if (!containers.length || !Array.from(containers).includes(parent)) {
                        // Nie mamy jeszcze tej sekcji
                        return [parent];
                    }
                }
            }
        }
        return Array.from(containers);
    }

    // ── Znajdowanie elementów z tekstem komentarza (generic) ──
    function findCommentElements(container) {
        const results = [];
        const seen = new Set();

        // Metoda 1: znane selektory wewnątrz kontenera
        try {
            const items = container.querySelectorAll(FALLBACK_ITEM_SELECTORS);
            items.forEach(el => {
                if (el.offsetParent !== null || el.getBoundingClientRect) { } // visible check
                const text = (el.textContent || '').trim();
                if (text.length > 20 && !SKIP_TAGS.has(el.tagName)) {
                    // Sprawdź, czy to nie kontener zawierający inne dopasowane elementy
                    const hasChildMatch = Array.from(items).some(other =>
                        other !== el && el.contains(other) && other !== el
                    );
                    if (!hasChildMatch) {
                        results.push(el);
                        seen.add(el);
                    }
                }
            });
        } catch { }

        // Metoda 2: TreeWalker – wszystkie węzły tekstowe > 40 znaków
        try {
            const walker = document.createTreeWalker(
                container,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent.trim();
                if (text.length <= 40) continue;

                let parent = node.parentElement;
                if (!parent || seen.has(parent)) continue;
                if (SKIP_TAGS.has(parent.tagName)) continue;

                // Ignoruj elementy w menu/nawigacji/footerze/headerze
                const skipAncestor = parent.closest(
                    'nav, header, footer, [class*="nav"], [class*="menu"], [class*="header"], [class*="footer"]'
                );
                if (skipAncestor) continue;

                // Ignoruj bardzo małe elementy (prawdopodobnie nie są komentarzami)
                const rect = parent.getBoundingClientRect();
                if (rect.width < 50 || rect.height < 15) continue;

                // Znajdź najbliższy element "komentarzopodobny"
                let target = parent;
                const commentLike = parent.closest(
                    '[class*="comment"], [class*="Comment"], [class*="review"], [class*="Review"], ' +
                    '[class*="post"], [class*="Post"], [class*="message"], [class*="Message"], ' +
                    '[class*="item"], [class*="Item"], [class*="entry"], [class*="Entry"]'
                );
                if (commentLike && container.contains(commentLike)) {
                    target = commentLike;
                }

                if (!seen.has(target)) {
                    results.push(target);
                    seen.add(target);
                }
            }
        } catch { }

        return results;
    }

    // ── Cache LLM ──
    function getCached(text) {
        return llmCache.get(text.toLowerCase().slice(0, 200));
    }
    function setCached(text, result) {
        const key = text.toLowerCase().slice(0, 200);
        llmCache.set(key, result);
        if (llmCache.size > CONFIG.maxCacheSize) {
            const first = llmCache.keys().next().value;
            llmCache.delete(first);
        }
    }

    // ── Zapytanie do HF ──
    async function analyzeTone(text) {
        const cached = getCached(text);
        if (cached !== undefined) return cached;

        try {
            const res = await fetch(
                'https://api-inference.huggingface.co/models/' + CONFIG.hfModel,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inputs: text }),
                }
            );
            if (!res.ok) return null;

            const data = await res.json();
            const predictions = Array.isArray(data) ? data[0] : data;
            if (!Array.isArray(predictions)) return null;

            for (const p of predictions) {
                const threshold = CONFIG.thresholds[p.label];
                if (threshold !== undefined && p.score >= threshold) {
                    setCached(text, true);
                    return true;
                }
            }
            setCached(text, false);
            return false;
        } catch {
            return null;
        }
    }

    // ── Kolejka LLM ──
    async function processLLMQueue() {
        if (llmRunning || llmQueue.length === 0) return;
        llmRunning = true;

        while (llmQueue.length > 0) {
            const { el, text } = llmQueue.shift();
            if (!document.body.contains(el)) continue;
            if (el.dataset.fwLlmDone === 'true') continue;

            try {
                const isToxic = await analyzeTone(text);
                if (isToxic === true) {
                    el.classList.add('fw-censor-hidden');
                    addToggleButton(el);
                }
            } catch { }

            el.dataset.fwLlmDone = 'true';
            el.classList.remove('fw-censor-llm-pending');
            updateCount();

            if (llmQueue.length > 0) {
                await new Promise(r => setTimeout(r, CONFIG.hfDelayMs));
            }
        }

        llmRunning = false;
    }

    function enqueueLLM(el, text) {
        if (el.dataset.fwLlmDone === 'true') return;
        llmQueue.push({ el, text: text.slice(0, 500) });
        el.classList.add('fw-censor-llm-pending');
        processLLMQueue();
    }

    // ── Przycisk pokaż/ukryj ──
    function addToggleButton(el) {
        if (el.querySelector('.fw-censor-badge')) return;
        const badge = document.createElement('span');
        badge.className = 'fw-censor-badge';
        badge.textContent = 'pokaż';
        badge.dataset.action = 'reveal';
        badge.addEventListener('click', function (e) {
            e.stopPropagation();
            if (this.dataset.action === 'reveal') {
                el.classList.add('fw-censor-revealed');
                this.textContent = 'ukryj';
                this.dataset.action = 'hide';
            } else {
                el.classList.remove('fw-censor-revealed');
                this.textContent = 'pokaż';
                this.dataset.action = 'reveal';
            }
        });
        const target = el.lastElementChild || el;
        target.appendChild(badge);
    }

    // ── Przetwarzanie komentarza ──
    function processElement(el) {
        if (el.dataset.fwDone === 'true') return;
        el.dataset.fwDone = 'true';

        const text = (el.textContent || '').trim().slice(0, 500);
        if (!text || text.length < 15) return;

        enqueueLLM(el, text);
    }

    // ── Skanowanie wszystkich sekcji komentarzy ──
    function scanAll() {
        const containers = findCommentContainers();
        if (containers.length === 0) {
            // Fallback: szukaj w całym dokumencie
            const body = document.body;
            const elements = findCommentElements(body);
            elements.forEach(processElement);
            return;
        }

        containers.forEach(container => {
            const elements = findCommentElements(container);
            elements.forEach(processElement);
        });
    }

    // ── Interceptowanie fetch/XHR ──
    let interceptedData = [];

    function interceptFetch() {
        const origFetch = window.fetch;
        if (origFetch.__fwPatched) return;
        window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : input?.url;
            if (url && /comment|Comment/i.test(url)) {
                return origFetch.apply(this, arguments).then(async response => {
                    try {
                        const clone = response.clone();
                        const text = await clone.text();
                        interceptedData.push({ url, data: text });
                        // Po otrzymaniu danych, zeskanuj DOM ponownie
                        setTimeout(scanAll, 500);
                    } catch { }
                    return response;
                });
            }
            return origFetch.apply(this, arguments);
        };
        window.fetch.__fwPatched = true;
    }

    function interceptXHR() {
        const origOpen = XMLHttpRequest.prototype.open;
        if (origOpen.__fwPatched) return;
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url && /comment|Comment/i.test(url)) {
                this.addEventListener('load', function () {
                    interceptedData.push({ url, data: this.responseText });
                    setTimeout(scanAll, 500);
                });
            }
            return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.open.__fwPatched = true;
    }

    // ── Observer na całym dokumencie ze skupieniem na sekcji komentarzy ──
    function startObserver() {
        if (observer) observer.disconnect();

        let scanTimer = null;

        observer = new MutationObserver(muts => {
            // Czy zmiana dotyczy sekcji komentarzy?
            let relevant = false;
            for (const m of muts) {
                const target = m.target;
                if (target.closest && (
                    target.closest(CONTAINER_SELECTOR) ||
                    target.closest('[class*="comment" i]') ||
                    target.closest('[class*="review" i]') ||
                    target.classList?.contains('page__group')
                )) {
                    relevant = true;
                    break;
                }
                // Sprawdź dodane węzły
                for (const added of m.addedNodes) {
                    if (added.nodeType === 1 && (
                        added.querySelector?.(CONTAINER_SELECTOR) ||
                        added.closest?.(CONTAINER_SELECTOR)
                    )) {
                        relevant = true;
                        break;
                    }
                }
                if (relevant) break;
            }

            if (relevant) {
                clearTimeout(scanTimer);
                scanTimer = setTimeout(() => {
                    scanAll();
                }, 300);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    // ── Panel sterowania ──
    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'fw-censor-panel';
        panel.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 99999;
            background: #2c3e50; color: #ecf0f1; padding: 10px 16px;
            border-radius: 8px; font: 13px/1.4 Arial, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            cursor: move; user-select: none;
            display: flex; align-items: center; gap: 10px;
            opacity: 0.92; flex-wrap: wrap;
        `;

        const modeLabel = document.createElement('span');
        modeLabel.textContent = 'Cenzor:';

        const modeSelect = document.createElement('select');
        Object.assign(modeSelect.style, {
            background: '#34495e', color: '#ecf0f1', border: 'none',
            padding: '3px 6px', borderRadius: '4px', fontSize: '12px',
            cursor: 'pointer',
        });

        [
            { value: 'llm', label: 'LLM (ton wypowiedzi)' },
        ].forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.value;
            opt.textContent = m.label;
            if (m.value === mode) opt.selected = true;
            modeSelect.appendChild(opt);
        });

        modeSelect.addEventListener('change', function () {
            mode = this.value;
            document.querySelectorAll('[class*="fw-censor"]').forEach(el => {
                el.classList.remove('fw-censor-hidden', 'fw-censor-revealed', 'fw-censor-llm-pending');
                const b = el.querySelector('.fw-censor-badge');
                if (b) b.remove();
                delete el.dataset.fwDone;
                delete el.dataset.fwLlmDone;
            });
            llmQueue = [];
            scanAll();
        });

        const countSpan = document.createElement('span');
        countSpan.id = 'fw-censor-count';
        countSpan.textContent = 'Ukryte: 0';
        Object.assign(countSpan.style, { fontSize: '11px', opacity: '0.8' });

        panel.append(modeLabel, modeSelect, countSpan);
        document.body.appendChild(panel);

        // Przeciąganie
        let dragging = false, ox, oy;
        panel.addEventListener('mousedown', e => {
            if (e.target.tagName === 'SELECT') return;
            dragging = true;
            ox = e.clientX - panel.getBoundingClientRect().left;
            oy = e.clientY - panel.getBoundingClientRect().top;
            panel.style.cursor = 'grabbing';
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            panel.style.left = (e.clientX - ox) + 'px';
            panel.style.top = (e.clientY - oy) + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => {
            dragging = false;
            panel.style.cursor = 'move';
        });
    }

    // ── Licznik ──
    function updateCount() {
        const el = document.getElementById('fw-censor-count');
        if (!el) return;
        const hidden = document.querySelectorAll('.fw-censor-hidden:not(.fw-censor-revealed)').length;
        const pending = document.querySelectorAll('.fw-censor-llm-pending').length;
        const parts = ['Ukryte: ' + hidden];
        if (pending) parts.push('Analiza: ' + pending);
        el.textContent = parts.join(' | ');
    }

    // ── Init ──
    function init() {
        injectStyles();
        createControlPanel();
        interceptFetch();
        interceptXHR();

        // Skanuj natychmiast i powtarzaj
        scanAll();
        startObserver();

        // Powtarzaj skanowanie z opóźnieniem (na wypadek dynamicznego ładowania GWT)
        const delays = [500, 1000, 2000, 3000, 5000, 8000, 12000, 20000];
        delays.forEach(d => setTimeout(scanAll, d));

        document.addEventListener('scroll', () => setTimeout(scanAll, 400), { passive: true });
        setInterval(updateCount, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
