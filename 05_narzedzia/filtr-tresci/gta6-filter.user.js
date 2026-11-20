// ==UserScript==
// @name         Filtr treści – GTA 6
// @namespace    https://github.com/tage01/opencode-test
// @version      1.0.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/05_narzedzia/filtr-tresci/gta6-filter.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/05_narzedzia/filtr-tresci/gta6-filter.user.js
// @description  Ukrywa posty, artykuły, wyniki i karty związane z GTA 6.
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @noframes
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'gta6ContentFilter.enabled';
    const HIDDEN_CLASS = 'gta6-content-filter-hidden';
    const enabled = { value: GM_getValue(STORAGE_KEY, true) };
    const hiddenElements = new Set();

    // Obsługujemy popularne karty i posty, a także semantyczne elementy HTML.
    const SEMANTIC_CARD_SELECTOR = [
        'article',
        '[role="article"]',
        'shreddit-post',
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-reel-item-renderer',
        '[data-testid*="post"]',
        '[data-testid*="tweet"]',
        '[data-testid*="video"]',
        '[data-testid*="result"]'
    ].join(',');

    const GENERIC_CARD_SELECTOR = [
        '[class*="feed-item"]',
        '[class*="post-card"]',
        '[class*="PostCard"]',
        '[class*="video-card"]',
        '[class*="VideoCard"]',
        '[class*="search-result"]',
        '[class*="story-card"]',
        '[class*="tweet"]',
        '[class*="card"]',
        '[class*="Card"]',
        '[class*="result"]',
        '[class*="Result"]'
    ].join(',');

    const CARD_SELECTOR = `${SEMANTIC_CARD_SELECTOR},${GENERIC_CARD_SELECTOR}`;
    const TEXT_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,[role="heading"],a';
    const METADATA_SELECTOR = '[title],[aria-label],[alt],a[href]';
    const EXCLUDED_SELECTOR = 'script,style,noscript,nav,header,footer,menu,button,input,textarea,select';

    // Obejmuje m.in. GTA6, GTA 6, GTA VI, GrandTheftAuto6 i popularne dopiski.
    const GTA6_PATTERN = /\b(?:GTA\s*[-:._]?\s*(?:6|VI)|Grand\s*Theft\s*Auto\s*[-:._]?\s*(?:6|VI))(?:\s*(?:leaks?|trailer|news|spoilers?|gameplay|release|online))?(?![A-Z0-9])/i;

    GM_addStyle(`.${HIDDEN_CLASS}{display:none!important}`);

    function textOf(element) {
        return (element?.textContent || element?.innerText || '').replace(/\s+/g, ' ').trim();
    }

    function ownMetadataOf(element) {
        if (!(element instanceof Element)) return '';
        return [
            element.getAttribute('title'),
            element.getAttribute('aria-label'),
            element.getAttribute('alt'),
            element.getAttribute('href'),
            element.getAttribute('data-title')
        ].filter(Boolean).join(' ');
    }

    function containsGTA6(element) {
        return GTA6_PATTERN.test(`${textOf(element)} ${ownMetadataOf(element)}`);
    }

    function isUsableCard(element, semantic) {
        if (!(element instanceof HTMLElement) || element.matches(EXCLUDED_SELECTOR)) return false;
        const length = textOf(element).length;
        // Artykuły mogą być długie; ogólne klasy „card” muszą pozostać małe,
        // żeby przypadkiem nie ukryć całego feedu.
        return semantic ? length <= 50000 : length <= 3500 && element.children.length <= 50;
    }

    function nearestCard(element) {
        let current = element;
        while (current && current !== document.body && current !== document.documentElement) {
            if (current.matches?.(SEMANTIC_CARD_SELECTOR) && isUsableCard(current, true)) return current;
            if (current.matches?.(GENERIC_CARD_SELECTOR) && isUsableCard(current, false)) return current;
            current = current.parentElement;
        }
        return null;
    }

    function fallbackTarget(element) {
        let smallContainer = null;
        let current = element;
        for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
            if (current === document.body || current === document.documentElement) break;
            if (current.matches?.(EXCLUDED_SELECTOR)) return null;
            if (current.matches?.('p,h1,h2,h3,h4,h5,h6,li,a,[role="heading"]')
                && textOf(current).length <= 1200) {
                return current;
            }
            if (current.matches?.('div,span')
                && textOf(current).length <= 1200
                && current.children.length <= 8) {
                smallContainer = current;
            }
        }
        return smallContainer;
    }

    function setHidden(element, shouldHide) {
        if (!(element instanceof HTMLElement)) return;
        if (shouldHide) {
            if (!element.classList.contains(HIDDEN_CLASS)) {
                element.classList.add(HIDDEN_CLASS);
                hiddenElements.add(element);
            }
        } else if (element.classList.contains(HIDDEN_CLASS)) {
            element.classList.remove(HIDDEN_CLASS);
            hiddenElements.delete(element);
        }
    }

    function elementAndDescendants(root, selector) {
        const found = [];
        if (root instanceof Element && root.matches(selector)) found.push(root);
        if (root?.querySelectorAll) found.push(...root.querySelectorAll(selector));
        return found;
    }

    function scanRoot(root) {
        if (!enabled.value || !root) return;

        // Karty zawierają zwykle zarówno tytuł, jak i opis. Gdy pasuje zagnieżdżona
        // karta, chowamy ją zamiast większego kontenera feedu.
        const cards = elementAndDescendants(root, CARD_SELECTOR);
        const matchingCards = new Set(cards.filter(card => isUsableCard(
            card,
            card.matches(SEMANTIC_CARD_SELECTOR)
        ) && containsGTA6(card)));

        const matchingAncestors = new Set();
        matchingCards.forEach(card => {
            let ancestor = card.parentElement;
            while (ancestor && ancestor !== root.parentElement) {
                if (matchingCards.has(ancestor)) matchingAncestors.add(ancestor);
                ancestor = ancestor.parentElement;
            }
        });
        const leafMatches = [...matchingCards].filter(card => !matchingAncestors.has(card));
        leafMatches.forEach(card => setHidden(card, true));

        // Fallback dla stron bez rozpoznawalnych kontenerów oraz dla tekstu
        // zapisanego wyłącznie w title, aria-label, alt albo adresie linku.
        const textElements = elementAndDescendants(root, TEXT_BLOCK_SELECTOR);
        const metadataElements = elementAndDescendants(root, METADATA_SELECTOR);
        const candidates = new Set([...textElements, ...metadataElements]);

        candidates.forEach(element => {
            if (element.closest(EXCLUDED_SELECTOR) || !containsGTA6(element)) return;
            const target = nearestCard(element) || fallbackTarget(element);
            if (target) setHidden(target, true);
        });

        // Ostatni fallback dla serwisów, które umieszczają tytuł bezpośrednio
        // w div/span zamiast w nagłówku lub akapicie.
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let textNode;
        while ((textNode = walker.nextNode())) {
            if (!GTA6_PATTERN.test(textNode.nodeValue || '')) continue;
            const element = textNode.parentElement;
            if (!element || element.closest(EXCLUDED_SELECTOR)) continue;
            const target = nearestCard(element) || fallbackTarget(element);
            if (target) setHidden(target, true);
        }

        // Karty w SPA bywają ponownie wykorzystywane z inną treścią. Odkryj
        // wcześniej ukryty element, jeśli po aktualizacji przestał pasować.
        hiddenElements.forEach(element => {
            if (!element.isConnected) {
                hiddenElements.delete(element);
                return;
            }
            if ((root === element || root.contains?.(element)) && !containsGTA6(element)) {
                setHidden(element, false);
            }
        });
    }

    function scanPage() {
        if (document.body) scanRoot(document.body);
    }

    function isNearViewport(element) {
        if (!(element instanceof HTMLElement) || element.classList.contains(HIDDEN_CLASS)) return false;
        const rect = element.getBoundingClientRect();
        const margin = Math.max(500, window.innerHeight * 0.75);
        return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
    }

    function scanViewport() {
        if (!enabled.value || !document.body) return;

        const visibleCards = elementAndDescendants(document.body, CARD_SELECTOR).filter(card =>
            isNearViewport(card) && isUsableCard(card, card.matches(SEMANTIC_CARD_SELECTOR))
        );
        const visibleCardSet = new Set(visibleCards);

        // Skanuj tylko zewnętrzne karty w zasięgu scrolla; ich poddrzewa obejmują
        // również zagnieżdżone tytuły i metadane.
        const cardRoots = visibleCards.filter(card => {
            let ancestor = card.parentElement;
            while (ancestor && ancestor !== document.body) {
                if (visibleCardSet.has(ancestor)) return false;
                ancestor = ancestor.parentElement;
            }
            return true;
        });
        cardRoots.forEach(scanRoot);

        // Awaryjnie obsłuż strony bez rozpoznawalnych kart, ale tylko w pobliżu
        // widoku, żeby nie skanować całej strony przy każdym scrollu.
        const fallbackElements = elementAndDescendants(
            document.body,
            `${TEXT_BLOCK_SELECTOR},${METADATA_SELECTOR}`
        );
        fallbackElements.forEach(element => {
            if (!isNearViewport(element)
                || element.closest(EXCLUDED_SELECTOR)
                || !containsGTA6(element)) return;
            const target = nearestCard(element) || fallbackTarget(element);
            if (target) setHidden(target, true);
        });
    }

    function clearHidden() {
        hiddenElements.forEach(element => {
            if (element.isConnected) element.classList.remove(HIDDEN_CLASS);
        });
        hiddenElements.clear();
    }

    function toggleFilter() {
        enabled.value = !enabled.value;
        GM_setValue(STORAGE_KEY, enabled.value);
        if (enabled.value) {
            scanPage();
            console.info('[Filtr GTA 6] Ukrywanie włączone.');
        } else {
            clearHidden();
            console.info('[Filtr GTA 6] Ukrywanie wyłączone.');
        }
    }

    GM_registerMenuCommand('Włącz / wyłącz ukrywanie GTA 6', toggleFilter);

    let scanTimer = 0;
    const pendingRoots = new Set();
    let scrollScanTimer = 0;
    let lastScrollScanAt = 0;
    const SCROLL_SCAN_INTERVAL = 650;

    function scheduleScan(root) {
        if (root) pendingRoots.add(root);
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
            if (pendingRoots.size > 80) {
                pendingRoots.clear();
                scanPage();
                return;
            }
            pendingRoots.forEach(scanRoot);
            pendingRoots.clear();
        }, 300);
    }

    function mutationRoot(node) {
        const element = node instanceof Element ? node : node?.parentElement;
        if (!element) return document.body;
        return nearestCard(element) || element;
    }

    function scheduleScrollScan() {
        if (!enabled.value || scrollScanTimer) return;
        const delay = Math.max(0, SCROLL_SCAN_INTERVAL - (Date.now() - lastScrollScanAt));
        scrollScanTimer = setTimeout(() => {
            scrollScanTimer = 0;
            lastScrollScanAt = Date.now();
            scanViewport();
        }, delay);
    }

    function start() {
        const observeRoot = document.documentElement || document;
        const observer = new MutationObserver(records => {
            if (!enabled.value) return;
            records.forEach(record => {
                if (record.type === 'childList') {
                    record.addedNodes.forEach(node => scheduleScan(mutationRoot(node)));
                } else {
                    scheduleScan(mutationRoot(record.target));
                }
            });
        });

        observer.observe(observeRoot, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['title', 'aria-label', 'alt', 'href', 'data-title']
        });

        window.addEventListener('scroll', scheduleScrollScan, { passive: true });
        document.addEventListener('scroll', scheduleScrollScan, { passive: true, capture: true });

        scanPage();
        [800, 2500, 6000].forEach(delay => setTimeout(scanPage, delay));
    }

    if (document.documentElement) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    }
})();
