// ==UserScript==
// @name         Anti-Clickbait News
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/03_filmweb/naglowki/anti-clickbait.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/03_filmweb/naglowki/anti-clickbait.user.js
// @description  Zastępuje clickbaitowe tytuły newsów rzeczowymi opisami przy użyciu AI
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.openai.com
// @connect      api.anthropic.com
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // KONFIGURACJA - dostosuj pod siebie
    // ============================================================
    const CONFIG = {
        // Provider: "openai", "anthropic", "ollama"
        provider: GM_getValue('ac_provider', 'ollama'),

        // OpenAI
        openai: {
            apiKey: GM_getValue('ac_openai_key', ''),
            model: 'gpt-4o-mini',
            baseUrl: 'https://api.openai.com/v1',
        },

        // Anthropic
        anthropic: {
            apiKey: GM_getValue('ac_anthropic_key', ''),
            model: 'claude-3-haiku-20240307',
            baseUrl: 'https://api.anthropic.com/v1',
        },

        // Ollama (lokalny)
        ollama: {
            model: 'llama3',
            baseUrl: 'http://localhost:11434',
        },

        // Selektory nagłówków na stronach (dopasuj do ulubionych portali)
        selectors: [
            'h1', 'h2', 'h3',
            'article h2', 'article h3',
            '.entry-title', '.post-title', '.article-title',
            '.headline', '.news-title',
            '[class*="title"]', '[class*="headline"]',
            '[class*="tytul"]',
        ],

        // Maksymalna długość tytułu do wysłania do AI
        maxTitleLength: 150,

        // Cache
        cacheTTL: 24 * 60 * 60 * 1000, // 24h
    };

    // ============================================================
    // CACHE
    // ============================================================
    function safeB64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }
    const cache = {
        get(key) {
            const raw = GM_getValue('ac_cache_' + safeB64(key), null);
            if (!raw) return null;
            try {
                const entry = JSON.parse(raw);
                if (Date.now() - entry.ts > CONFIG.cacheTTL) return null;
                return entry.value;
            } catch { return null; }
        },
        set(key, value) {
            const entry = JSON.stringify({ value, ts: Date.now() });
            GM_setValue('ac_cache_' + safeB64(key), entry);
        }
    };

    // ============================================================
    // STYLE
    // ============================================================
    GM_addStyle(`
        .ac-replaced {
            position: relative;
            cursor: help;
        }
        .ac-replaced::after {
            content: "✏️";
            font-size: 0.7em;
            margin-left: 4px;
            opacity: 0.6;
        }
        .ac-replaced:hover::before {
            content: attr(data-original);
            position: absolute;
            bottom: 100%;
            left: 0;
            background: #333;
            color: #fff;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            white-space: nowrap;
            z-index: 9999;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .ac-processing {
            opacity: 0.5;
            transition: opacity 0.3s;
        }
        .ac-processed {
            opacity: 1;
            transition: opacity 0.3s;
        }
        .ac-badge {
            display: inline-block;
            background: #e74c3c;
            color: white;
            font-size: 0.6em;
            padding: 1px 5px;
            border-radius: 3px;
            margin-left: 4px;
            vertical-align: middle;
        }
    `);

    // ============================================================
    // LLM API
    // ============================================================
    function gmFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: options.method || 'GET',
                url: url,
                headers: options.headers || {},
                data: options.body,
                responseType: 'json',
                onload: (resp) => {
                    if (resp.status >= 200 && resp.status < 300) {
                        resolve(resp);
                    } else {
                        const detail = resp.response?.error?.message || resp.responseText || resp.statusText;
                        reject(new Error(`HTTP ${resp.status}: ${detail}`));
                    }
                },
                onerror: (err) => reject(new Error(err?.message || 'Network error')),
                ontimeout: () => reject(new Error('Request timed out')),
                timeout: options.timeout || 30000,
            });
        });
    }

    async function callLLM(systemPrompt, userPrompt) {
        const { provider } = CONFIG;

        if (provider === 'openai') {
            const cfg = CONFIG.openai;
            if (!cfg.apiKey) throw new Error('Brak klucza API OpenAI. Skonfiguruj w menu skryptu.');
            const resp = await gmFetch(`${cfg.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
                body: JSON.stringify({
                    model: cfg.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 300,
                })
            });
            const data = resp.response;
            if (data.error) throw new Error(data.error.message);
            return data.choices[0].message.content.trim();

        } else if (provider === 'anthropic') {
            const cfg = CONFIG.anthropic;
            if (!cfg.apiKey) throw new Error('Brak klucza API Anthropic. Skonfiguruj w menu skryptu.');
            const resp = await gmFetch(`${cfg.baseUrl}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({
                    model: cfg.model,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userPrompt }],
                    temperature: 0.3,
                    max_tokens: 300,
                })
            });
            const data = resp.response;
            if (data.error) throw new Error(data.error.message);
            return data.content[0].text.trim();

        } else if (provider === 'ollama') {
            const cfg = CONFIG.ollama;
            const resp = await gmFetch(`${cfg.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: cfg.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.3,
                    stream: false,
                })
            });
            const data = resp.response;
            if (data.error) throw new Error(data.error.message);
            return data.message.content.trim();

        } else {
            throw new Error(`Nieznany provider: ${provider}`);
        }
    }

    async function analyzeHeadline(title) {
        const systemPrompt = `Jesteś dziennikarzem, który zamienia clickbaitowe tytuły newsów w rzeczowe, informacyjne nagłówki.`;

        const userPrompt = `Przepisz poniższy clickbaitowy tytuł na rzeczowy, informacyjny nagłówek, który oddaje sedno sprawy. Odpowiedz TYLKO nowym tytułem, bez żadnych dodatkowych wyjaśnień ani cudzysłowu.

Clickbaitowy tytuł: "${title}"

Nowy tytuł:`;

        const result = await callLLM(systemPrompt, userPrompt);
        return result.replace(/^["']|["']$/g, '').trim();
    }

    // ============================================================
    // GŁÓWNA LOGIKA
    // ============================================================
    async function processHeadlines() {
        const processed = new Set();
        const headlines = [];

        // Zbierz wszystkie nagłówki
        for (const sel of CONFIG.selectors) {
            try {
                const elements = document.querySelectorAll(sel);
                elements.forEach(el => {
                    if (processed.has(el)) return;
                    // Pomiń bardzo małe elementy (prawdopodobnie nie są nagłówkami)
                    const text = el.textContent.trim();
                    if (text.length < 10 || text.length > CONFIG.maxTitleLength) return;
                    // Pomiń jeśli już zostało przetworzone
                    if (el.classList.contains('ac-replaced') || el.classList.contains('ac-processing')) return;
                    // Pomiń linki, które są wewnątrz nagłówków (obsłużymy je przez element nadrzędny)
                    if (el.closest('.ac-replaced') || el.closest('.ac-processing')) return;
                    // Pomiń widoczne elementy UI skryptu
                    if (el.closest('.ac-badge')) return;

                    processed.add(el);
                    headlines.push(el);
                });
            } catch (e) {
                // niektóre selektory mogą być nieprawidłowe
            }
        }

        if (headlines.length === 0) return;

        // Przetwarzaj nagłówki jeden po drugim
        for (const el of headlines) {
            const original = el.textContent.trim();

            // Sprawdź cache
            const cached = cache.get(original);
            if (cached) {
                if (cached !== original && cached.length > 0) {
                    replaceHeadline(el, original, cached);
                }
                continue;
            }

            // Oznacz jako przetwarzany
            el.classList.add('ac-processing');

            try {
                const rewritten = await analyzeHeadline(original);
                cache.set(original, rewritten);

                if (rewritten !== original && rewritten.length > 0) {
                    replaceHeadline(el, original, rewritten);
                }
            } catch (err) {
                console.warn('[Anti-Clickbait] Błąd:', err);
            } finally {
                el.classList.remove('ac-processing');
            }
        }
    }

    function replaceHeadline(el, original, rewritten) {
        // Zachowaj strukturę HTML, zmień tylko tekst
        el.dataset.original = original;
        el.classList.add('ac-replaced');
        el.classList.remove('ac-processed');
        el.classList.add('ac-processed');

        // Jeśli element zawiera tylko tekst (bez dzieci), podmieniamy całość
        const childCount = el.children.length;
        if (childCount === 0) {
            el.textContent = rewritten;
        } else {
            // Znajdź pierwszy węzeł tekstowy lub link
            const textNode = Array.from(el.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);
            if (textNode) {
                textNode.textContent = textNode.textContent.replace(original, rewritten);
            } else {
                // Jeśli nie ma bezpośredniego węzła tekstowego, podmieniamy tekst pierwszego dziecka
                const firstChild = el.children[0];
                if (firstChild) {
                    firstChild.dataset.original = original;
                    firstChild.textContent = rewritten;
                }
            }
        }
    }

    // ============================================================
    // KONFIGURACJA PRZEZ MENU
    // ============================================================
    function setupMenu() {
        GM_registerMenuCommand('⚙️ Ustaw provider (obecnie: ' + CONFIG.provider + ')', () => {
            const choice = prompt('Wybierz provider: openai, anthropic, ollama', CONFIG.provider);
            if (choice && ['openai', 'anthropic', 'ollama'].includes(choice)) {
                GM_setValue('ac_provider', choice);
                CONFIG.provider = choice;
                alert('Ustawiono provider: ' + choice);
            }
        });

        GM_registerMenuCommand('🔑 Ustaw klucz API OpenAI', () => {
            const key = prompt('Podaj klucz API OpenAI:', CONFIG.openai.apiKey);
            if (key) {
                GM_setValue('ac_openai_key', key);
                CONFIG.openai.apiKey = key;
                alert('Klucz API OpenAI zapisany.');
            }
        });

        GM_registerMenuCommand('🔑 Ustaw klucz API Anthropic', () => {
            const key = prompt('Podaj klucz API Anthropic:', CONFIG.anthropic.apiKey);
            if (key) {
                GM_setValue('ac_anthropic_key', key);
                CONFIG.anthropic.apiKey = key;
                alert('Klucz API Anthropic zapisany.');
            }
        });

        GM_registerMenuCommand('🔁 Przetwórz nagłówki od nowa', () => {
            document.querySelectorAll('.ac-replaced').forEach(el => {
                el.classList.remove('ac-replaced', 'ac-processed');
                if (el.dataset.original) {
                    el.textContent = el.dataset.original;
                    delete el.dataset.original;
                }
            });
            processHeadlines();
        });

        GM_registerMenuCommand('🗑️ Wyczyść cache', () => {
            const keys = Object.keys(localStorage).filter(k => k.startsWith('ac_cache_'));
            keys.forEach(k => localStorage.removeItem(k));
            alert('Cache wyczyszczony.');
        });
    }

    // ============================================================
    // WYKONAJ
    // ============================================================
    setupMenu();

    // Uruchom po załadowaniu DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', processHeadlines);
    } else {
        processHeadlines();
    }

    // Obserwuj zmiany w DOM (dla stron dynamicznych)
    const observer = new MutationObserver(debounce(() => {
        processHeadlines();
    }, 1000));

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    // ============================================================
    // POMOCNICZE
    // ============================================================
    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // Menu konfiguracyjne na stronie (przycisk)
    function addConfigButton() {
        const btn = document.createElement('div');
        btn.id = 'ac-config-btn';
        btn.innerHTML = '⚙️';
        btn.title = 'Anti-Clickbait - konfiguracja';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            zIndex: '999999',
            background: '#2c3e50',
            color: 'white',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '18px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            opacity: '0.6',
        });
        btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
        btn.addEventListener('mouseleave', () => btn.style.opacity = '0.6');
        btn.addEventListener('click', () => {
            const info = [
                '=== Anti-Clickbait ===',
                'Provider: ' + CONFIG.provider,
                '',
                'OPENAI:',
                'Klucz: ' + (CONFIG.openai.apiKey ? '✓ ustawiony' : '✗ brak'),
                'Model: ' + CONFIG.openai.model,
                '',
                'ANTHROPIC:',
                'Klucz: ' + (CONFIG.anthropic.apiKey ? '✓ ustawiony' : '✗ brak'),
                'Model: ' + CONFIG.anthropic.model,
                '',
                'OLLAMA (lokalnie):',
                'URL: ' + CONFIG.ollama.baseUrl,
                'Model: ' + CONFIG.ollama.model,
                '',
                'Użyj menu Tampermonkey (⚙️) aby skonfigurować.',
            ].join('\n');
            alert(info);
        });
        document.body.appendChild(btn);
    }

    // Dodaj przycisk po chwili (nie blokuj ładowania strony)
    setTimeout(addConfigButton, 2000);
})();
