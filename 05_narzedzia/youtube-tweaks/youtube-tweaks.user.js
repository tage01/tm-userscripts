// ==UserScript==
// @name         YouTube – Shorts i porządki w interfejsie
// @namespace    https://github.com/tage01/opencode-test
// @version      1.0.11
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/05_narzedzia/youtube-tweaks/youtube-tweaks.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/05_narzedzia/youtube-tweaks/youtube-tweaks.user.js
// @description  Porządkuje interfejs YouTube, obsługuje rekomendacje i kolejkę do obejrzenia.
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const KEYS = {
        shorts: 'ytTweaks.hideShorts',
        ads: 'ytTweaks.hideAds',
        explore: 'ytTweaks.hideExplore',
        history: 'ytTweaks.hideHistory',
        queue: 'ytTweaks.watchQueue',
        speeds: 'ytTweaks.channelSpeeds',
        diagnostics: 'ytTweaks.diagnostics'
    };

    const settings = {
        shorts: GM_getValue(KEYS.shorts, true),
        ads: GM_getValue(KEYS.ads, false),
        explore: GM_getValue(KEYS.explore, false),
        history: GM_getValue(KEYS.history, false)
    };

    let diagnosticsEnabled = GM_getValue(KEYS.diagnostics, false);
    const diagnosticBuffer = [];
    const DIAGNOSTIC_SELECTOR = [
        '.yt-tweaks-card-action',
        'a#thumbnail',
        'ytd-thumbnail',
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-rich-grid-media',
        '.yt-tweaks-card-actions',
        'ytd-menu-renderer',
        'button[aria-label]',
        '[role="button"][aria-label]',
        'yt-icon-button[aria-label]',
        'ytd-menu-popup-renderer',
        'ytd-menu-service-item-renderer',
        'ytd-menu-navigation-item-renderer',
        'tp-yt-paper-item',
        '[role="menuitem"]'
    ].join(',');
    const HOVER_DIAGNOSTIC_SELECTOR = [
        'a#thumbnail',
        'ytd-thumbnail',
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-rich-grid-media',
        '.yt-tweaks-card-actions',
        '.yt-tweaks-card-action'
    ].join(',');

    function safeDiagnosticLabel(value) {
        const label = (value || '').replace(/\s+/g, ' ').trim();
        const normalized = label.toLocaleLowerCase().replace(/[’‘]/g, "'");
        return /^(action menu|more actions|more options|menu akcji|więcej działań|więcej opcji|not interested|nie interesuje mnie|nie jestem zainteresowany|don't recommend channel|nie polecaj (tego )?kanału)$/i.test(normalized)
            ? label.slice(0, 80)
            : undefined;
    }

    function diagnosticNodeSummary(element) {
        if (!(element instanceof Element)) return { type: typeof element };
        const summary = {
            tag: element.tagName.toLocaleLowerCase(),
            role: element.getAttribute('role') || undefined
        };
        const ownAction = element.matches('.yt-tweaks-card-action')
            ? (element.getAttribute('aria-label') || '').slice(0, 80)
            : safeDiagnosticLabel(element.getAttribute('aria-label'));
        if (ownAction) summary.label = ownAction;
        if (element.matches('ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, tp-yt-paper-item, [role="menuitem"]')) {
            const menuText = safeDiagnosticLabel(element.innerText || element.textContent);
            if (menuText) summary.menuText = menuText;
        }
        return summary;
    }

    function diagnosticLog(eventName, details = {}) {
        if (!diagnosticsEnabled) return;
        const entry = { time: new Date().toISOString(), event: eventName, ...details };
        diagnosticBuffer.push(entry);
        if (diagnosticBuffer.length > 250) diagnosticBuffer.shift();
        console.info('[YT Tweaks][diag]', JSON.stringify(entry));
    }

    function captureDiagnosticEvent(event) {
        if (!diagnosticsEnabled) return;
        const path = event.composedPath().filter(node => node instanceof Element);
        const relevant = path.filter(node => node.matches(DIAGNOSTIC_SELECTOR));
        if (!relevant.length) return;

        if (/^(pointerover|pointerout|mouseover|mouseout)$/.test(event.type)) {
            const hoverBoundary = path.find(node => node.matches(HOVER_DIAGNOSTIC_SELECTOR));
            if (!hoverBoundary) return;
            const related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
            const relatedBoundary = related?.closest(HOVER_DIAGNOSTIC_SELECTOR) || null;
            // Pomijamy przejścia między dziećmi tego samego obszaru, aby log nie rósł przy ruchu kursora.
            if (relatedBoundary === hoverBoundary) return;
            diagnosticLog('hover-event', {
                type: event.type,
                isTrusted: event.isTrusted,
                pointerType: event.pointerType || undefined,
                boundary: diagnosticNodeSummary(hoverBoundary),
                relatedBoundary: relatedBoundary ? diagnosticNodeSummary(relatedBoundary) : undefined,
                target: diagnosticNodeSummary(path[0]),
                relevantPath: relevant.slice(0, 8).map(diagnosticNodeSummary)
            });
            return;
        }

        diagnosticLog('dom-event', {
            type: event.type,
            isTrusted: event.isTrusted,
            detail: event.detail || 0,
            button: Number.isInteger(event.button) ? event.button : undefined,
            target: diagnosticNodeSummary(path[0]),
            relevantPath: relevant.slice(0, 8).map(diagnosticNodeSummary)
        });
    }

    function toggleDiagnostics() {
        diagnosticsEnabled = !diagnosticsEnabled;
        GM_setValue(KEYS.diagnostics, diagnosticsEnabled);
        if (diagnosticsEnabled) diagnosticBuffer.length = 0;
        console.info(`[YT Tweaks][diag] Logowanie ${diagnosticsEnabled ? 'włączone' : 'wyłączone'}.`);
    }

    function dumpDiagnostics() {
        console.info('[YT Tweaks][diag] Pełny bufor:', JSON.stringify(diagnosticBuffer));
    }

    // Tagi rendererów i endpointy są stabilniejsze od klas, ale YouTube może je zmienić.
    // Teksty etykiet są fallbackiem zależnym od języka interfejsu.
    const SELECTORS = {
        shelves: 'ytd-rich-shelf-renderer, ytd-reel-shelf-renderer',
        shortsCards: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer',
        queueCards: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer',
        ads: 'ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-promoted-video-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer'
    };

    GM_addStyle(`
        .yt-tweaks-card-actions {
            position: absolute; inset-block-start: 8px; inset-inline-end: 8px; z-index: 20;
            display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: flex-start;
            gap: 4px; max-width: calc(100% - 16px);
        }
        .yt-tweaks-thumbnail-controls-host { position: relative; }
        .yt-tweaks-card-action {
            border: 0; border-radius: 18px; padding: 7px 10px; color: #fff;
            background: rgba(20, 20, 20, .88); font: 500 12px Roboto, Arial, sans-serif;
            cursor: pointer; opacity: .94; white-space: nowrap;
        }
        .yt-tweaks-card-action:hover { background: #303030; }
        .yt-tweaks-card-action:disabled { cursor: progress; opacity: .8; }
        .yt-tweaks-card-action.yt-tweaks-recommendation-button {
            display: inline-flex; align-items: center; justify-content: center;
            width: 32px; height: 32px; padding: 0;
        }
        .yt-tweaks-recommendation-button svg { width: 18px; height: 18px; display: block; }
        .yt-tweaks-recommendation-button[data-action-result="success"] { background: #245b37; }
        .yt-tweaks-recommendation-button[data-action-result="unavailable"],
        .yt-tweaks-recommendation-button[data-action-result="error"] { background: #6b2828; }
        #yt-tweaks-queue-panel {
            position: fixed; inset: 72px 20px auto auto; z-index: 2147483647;
            width: min(420px, calc(100vw - 32px)); max-height: min(70vh, 620px);
            overflow: auto; padding: 16px; box-sizing: border-box; color: #f1f1f1;
            background: #212121; border: 1px solid #444; border-radius: 12px;
            box-shadow: 0 8px 30px #0008; font: 14px Roboto, Arial, sans-serif;
        }
        #yt-tweaks-queue-panel a { color: #fff; text-decoration: none; }
        #yt-tweaks-queue-panel a:hover { text-decoration: underline; }
        #yt-tweaks-queue-panel .yt-tweaks-queue-row {
            display: flex; align-items: center; gap: 12px; padding: 10px 0;
            border-top: 1px solid #444;
        }
        #yt-tweaks-queue-panel .yt-tweaks-queue-title { flex: 1; min-width: 0; }
        #yt-tweaks-queue-panel button {
            border: 0; border-radius: 16px; padding: 6px 10px; color: #fff;
            background: #383838; cursor: pointer;
        }
    `);

    function readQueue() {
        const queue = GM_getValue(KEYS.queue, []);
        return Array.isArray(queue) ? queue.filter(item => item && typeof item.url === 'string') : [];
    }

    function writeQueue(queue) {
        GM_setValue(KEYS.queue, queue);
    }

    function canonicalVideoUrl(rawUrl) {
        try {
            const url = new URL(rawUrl, location.href);
            if (url.hostname !== 'www.youtube.com' && url.hostname !== 'm.youtube.com') return null;
            const videoId = url.searchParams.get('v');
            return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null;
        } catch (_) {
            return null;
        }
    }

    function hideForReason(element, reason, shouldHide) {
        if (!(element instanceof HTMLElement)) return;
        const reasons = new Set((element.getAttribute('data-yt-tweaks-reasons') || '').split(',').filter(Boolean));
        if (shouldHide) {
            if (!reasons.size) {
                element.setAttribute('data-yt-tweaks-display', element.style.getPropertyValue('display'));
                element.setAttribute('data-yt-tweaks-display-priority', element.style.getPropertyPriority('display'));
            }
            reasons.add(reason);
            element.setAttribute('data-yt-tweaks-reasons', [...reasons].join(','));
            element.style.setProperty('display', 'none', 'important');
        } else if (reasons.delete(reason)) {
            if (reasons.size) {
                element.setAttribute('data-yt-tweaks-reasons', [...reasons].join(','));
            } else {
                element.removeAttribute('data-yt-tweaks-reasons');
                const originalDisplay = element.getAttribute('data-yt-tweaks-display') || '';
                const originalPriority = element.getAttribute('data-yt-tweaks-display-priority') || '';
                element.style.setProperty('display', originalDisplay, originalPriority);
                if (!originalDisplay) element.style.removeProperty('display');
                element.removeAttribute('data-yt-tweaks-display');
                element.removeAttribute('data-yt-tweaks-display-priority');
            }
        }
    }

    function normalizedText(element) {
        return (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    }

    function shelfLooksLikeShorts(shelf) {
        if (shelf.matches('ytd-reel-shelf-renderer')) return true;
        const heading = shelf.querySelector('#title, h2, [role="heading"]');
        const title = normalizedText(heading);
        return /(^|\b)shorts?(\b|$)/i.test(title) || !!shelf.querySelector('a[href*="/shorts/"]');
    }

    function shortsTarget(anchor) {
        return anchor.closest(SELECTORS.shortsCards)
            || anchor.closest('ytd-tab-renderer, tp-yt-paper-tab, yt-tab-shape, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer')
            || anchor;
    }

    function applyShorts() {
        const enabled = settings.shorts;
        document.querySelectorAll(SELECTORS.shelves).forEach(shelf => {
            hideForReason(shelf, 'shorts', enabled && shelfLooksLikeShorts(shelf));
        });
        document.querySelectorAll('a[href*="/shorts/"], a[href$="/shorts"], a[href^="/shorts?"]').forEach(anchor => {
            hideForReason(shortsTarget(anchor), 'shorts', enabled);
        });
        document.querySelectorAll('yt-tab-shape, ytd-tab-renderer, tp-yt-paper-tab').forEach(tab => {
            hideForReason(tab, 'shorts', enabled && normalizedText(tab) === 'shorts');
        });
        document.querySelectorAll('[is-shorts]').forEach(item => {
            hideForReason(item.closest(SELECTORS.shortsCards) || item, 'shorts', enabled);
        });
    }

    const EXPLORE_LABELS = /^(explore|przeglądaj|odkrywaj|trending|na czasie|shopping|zakupy|music|muzyka|movies? ?&? ?tv|filmy i tv|gaming|gry|news|wiadomości|sports|sport|learning|nauka)$/i;
    const HISTORY_LABELS = /^(history|historia|watched|oglądane|oglądana historia)$/i;

    function guideLabel(entry) {
        const label = entry.querySelector('#endpoint, a, [role="link"]');
        return normalizedText(label || entry).replace(/\s+/g, ' ');
    }

    function applyExplore() {
        document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer').forEach(entry => {
            const label = guideLabel(entry);
            const href = entry.querySelector('a[href]')?.getAttribute('href') || '';
            const isExploreEndpoint = /\/(feed\/explore|feed\/trending)(?:[/?]|$)/i.test(href);
            hideForReason(entry, 'explore', settings.explore && (EXPLORE_LABELS.test(label) || isExploreEndpoint));
        });
        document.querySelectorAll('ytd-guide-section-renderer').forEach(section => {
            const heading = normalizedText(section.querySelector('#guide-section-title, h3, [role="heading"]'));
            hideForReason(section, 'explore', settings.explore && /^(explore|przeglądaj|odkrywaj)$/.test(heading));
        });
    }

    function applyHistory() {
        document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer').forEach(entry => {
            const href = entry.querySelector('a[href]')?.getAttribute('href') || '';
            const isHistoryEndpoint = /\/feed\/history(?:[/?]|$)/i.test(href);
            hideForReason(entry, 'history', settings.history && (HISTORY_LABELS.test(guideLabel(entry)) || isHistoryEndpoint));
        });
    }

    function adTarget(ad) {
        return ad.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-promoted-video-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer') || ad;
    }

    function applyAds() {
        document.querySelectorAll(SELECTORS.ads).forEach(ad => {
            hideForReason(adTarget(ad), 'ads', settings.ads);
        });
    }

    function getCardVideo(card) {
        // Najpierw wybierz właściwy link miniatury, niezależnie od kolejności linków w karcie.
        const anchor = card.querySelector('a#thumbnail[href*="/watch"]')
            || card.querySelector('a[href*="/watch?v="]');
        if (!anchor) return null;
        const url = canonicalVideoUrl(anchor.getAttribute('href'));
        if (!url) return null;
        const videoId = new URL(url).searchParams.get('v');
        const titleElement = card.querySelector('#video-title, a#video-title, [aria-label][href*="/watch"]');
        const title = (titleElement?.getAttribute('title') || titleElement?.getAttribute('aria-label') || titleElement?.textContent || '').trim()
            || anchor.getAttribute('title')
            || videoId;
        return { anchor, url, videoId, title };
    }

    function setQueueButton(button, isQueued) {
        const text = isQueued ? '✓ W kolejce' : '＋ Do obejrzenia';
        const label = isQueued ? 'Usuń z kolejki do obejrzenia' : 'Dodaj do kolejki do obejrzenia';
        const queued = String(isQueued);

        // Nie wymieniaj węzła tekstowego przy każdym skanie MutationObservera.
        if (button.textContent !== text) button.textContent = text;
        if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
        if (button.dataset.queued !== queued) button.dataset.queued = queued;
    }

    const RECOMMENDATION_ACTIONS = {
        notInterested: {
            key: 'notInterested',
            label: 'Nie interesuje mnie',
            icon: 'thumb-down',
            matches: text => /not interested|nie interesuje mnie|nie jestem zainteresowany/i.test(text)
        },
        noChannel: {
            key: 'noChannel',
            label: 'Nie polecaj kanału',
            icon: 'person-off',
            matches: text => /don't recommend channel|don’t recommend channel|nie polecaj (tego )?kanału/i.test(text)
        }
    };

    function createRecommendationIcon(name) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('d', name === 'thumb-down'
            ? 'M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z'
            : 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.42 0-8 2.24-8 5v1h10.2a6 6 0 0 1-.2-1.5c0-1.54.58-2.94 1.53-4.01A15.5 15.5 0 0 0 12 14zm8.3.3 1.4 1.4-1.8 1.8 1.8 1.8-1.4 1.4-1.8-1.8-1.8 1.8-1.4-1.4 1.8-1.8-1.8-1.8 1.4-1.4 1.8 1.8 1.8-1.8z');
        svg.appendChild(path);
        return svg;
    }

    function queryAllOpenRoots(root, selector) {
        const found = new Set();
        const visited = new Set();
        const visit = currentRoot => {
            if (!currentRoot?.querySelectorAll || visited.has(currentRoot)) return;
            visited.add(currentRoot);
            let descendants;
            try {
                descendants = currentRoot.querySelectorAll('*');
                currentRoot.querySelectorAll(selector).forEach(element => found.add(element));
            } catch (_) {
                return;
            }
            descendants.forEach(element => {
                if (element.shadowRoot) visit(element.shadowRoot);
            });
        };
        visit(root);
        return [...found];
    }

    function nativeClickTarget(element) {
        if (!element) return null;
        if (element.matches('button, [role="button"], tp-yt-paper-item')) return element;
        return queryAllOpenRoots(element, 'button, [role="button"], tp-yt-paper-item')[0] || element;
    }

    function isActuallyVisible(element) {
        if (!element?.isConnected) return false;
        let ancestor = element;
        while (ancestor) {
            if (ancestor.hasAttribute?.('hidden') || ancestor.getAttribute?.('aria-hidden') === 'true') return false;
            const style = getComputedStyle(ancestor);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.01) return false;
            if (ancestor.parentElement) {
                ancestor = ancestor.parentElement;
            } else {
                const root = ancestor.getRootNode?.();
                ancestor = root?.host || null;
            }
        }
        const target = nativeClickTarget(element);
        const rect = target.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0
            && rect.bottom > 0 && rect.right > 0
            && rect.top < window.innerHeight && rect.left < window.innerWidth;
    }

    function visibleMenuItem(action) {
        const selector = 'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, tp-yt-paper-item, [role="menuitem"]';
        const popup = document.querySelector('ytd-popup-container') || queryAllOpenRoots(document, 'ytd-popup-container')[0];
        const roots = popup ? [popup, document] : [document];
        const seen = new Set();
        for (const root of roots) {
            for (const item of queryAllOpenRoots(root, selector)) {
                if (seen.has(item)) continue;
                seen.add(item);
                if (action.matches(normalizedText(item)) && isActuallyVisible(item)) return item;
            }
        }
        return null;
    }

    function waitForMenuItem(action, timeoutMs = 2500) {
        const existing = visibleMenuItem(action);
        if (existing) return Promise.resolve(existing);

        return new Promise(resolve => {
            let finished = false;
            const finish = item => {
                if (finished) return;
                finished = true;
                observer.disconnect();
                clearInterval(poll);
                clearTimeout(timeout);
                resolve(item);
            };
            const check = () => {
                const item = visibleMenuItem(action);
                if (item) finish(item);
            };
            const observer = new MutationObserver(check);
            observer.observe(document.body, { childList: true, subtree: true });
            // Krótki polling jest fallbackiem dla popupów renderowanych wewnątrz Shadow DOM.
            const poll = setInterval(check, 100);
            const timeout = setTimeout(() => finish(null), timeoutMs);
            check();
        });
    }

    function cardMenuButton(card) {
        const selector = 'button[aria-label], button[title], [role="button"][aria-label], [role="button"][title], yt-icon-button[aria-label], yt-icon-button[title], ytd-menu-renderer #button';
        const candidates = queryAllOpenRoots(card, selector);
        const menuLabel = /action menu|actions? menu|more actions|more options|^more$|^options?$|^menu$|^więcej$|menu akcji|więcej.*(działań|opcji)|działania|działań|opcji/i;
        const actionMenu = candidates.find(element => {
            const label = (element.getAttribute('aria-label') || element.getAttribute('title') || '').trim();
            return menuLabel.test(label);
        });
        if (actionMenu) return nativeClickTarget(actionMenu);

        const menuHosts = queryAllOpenRoots(card, 'ytd-menu-renderer');
        for (const menu of menuHosts) {
            const controls = queryAllOpenRoots(menu, 'button, [role="button"], yt-icon-button, #button');
            const control = controls.find(isActuallyVisible);
            if (control) return nativeClickTarget(control);
        }
        return null;
    }

    async function runRecommendationAction(card, button, action) {
        if (button.disabled) return;
        const menuButton = cardMenuButton(card);
        diagnosticLog('shortcut-activated', { action: action.key });
        if (!menuButton) {
            const labeledControls = queryAllOpenRoots(card, 'button[aria-label], [role="button"][aria-label], yt-icon-button[aria-label]');
            diagnosticLog('card-menu-control-not-found', {
                action: action.key,
                cardTag: card.tagName.toLocaleLowerCase(),
                menuRendererCount: queryAllOpenRoots(card, 'ytd-menu-renderer').length,
                controls: labeledControls.slice(0, 12).map(diagnosticNodeSummary)
            });
            button.disabled = true;
            button.dataset.actionResult = 'unavailable';
            button.title = `Menu niedostępne — ${action.label}`;
            button.setAttribute('aria-label', `Menu niedostępne — ${action.label}`);
            setTimeout(() => {
                if (button.isConnected) {
                    button.disabled = false;
                    delete button.dataset.actionResult;
                    button.title = action.label;
                    button.setAttribute('aria-label', action.label);
                }
            }, 1600);
            return;
        }

        button.disabled = true;
        button.dataset.actionResult = 'pending';
        button.title = `Otwieram menu — ${action.label}`;
        button.setAttribute('aria-label', `Otwieram menu — ${action.label}`);
        try {
            diagnosticLog('script-click', { stage: 'card-menu-control', target: diagnosticNodeSummary(menuButton) });
            menuButton.click();
            const menuItem = await waitForMenuItem(action);
            diagnosticLog('menu-option-result', {
                action: action.key,
                found: Boolean(menuItem),
                target: menuItem ? diagnosticNodeSummary(menuItem) : undefined
            });
            if (!menuItem) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                button.dataset.actionResult = 'unavailable';
                button.title = `Opcja niedostępna — ${action.label}`;
                button.setAttribute('aria-label', `Opcja niedostępna — ${action.label}`);
            } else {
                const clickTarget = nativeClickTarget(menuItem);
                diagnosticLog('script-click', { stage: 'menu-option', target: diagnosticNodeSummary(clickTarget) });
                clickTarget?.click();
                button.dataset.actionResult = 'success';
                button.title = `Wykonano — ${action.label}`;
                button.setAttribute('aria-label', `Wykonano — ${action.label}`);
            }
        } catch (error) {
            console.warn('[YouTube Tweaks] Nie udało się wykonać akcji rekomendacji.', error);
            diagnosticLog('script-error', { action: action.key, message: String(error).slice(0, 180) });
            button.dataset.actionResult = 'error';
            button.title = `Nie udało się — ${action.label}`;
            button.setAttribute('aria-label', `Nie udało się — ${action.label}`);
        } finally {
            setTimeout(() => {
                if (!button.isConnected) return;
                button.disabled = false;
                delete button.dataset.actionResult;
                button.title = action.label;
                button.setAttribute('aria-label', action.label);
            }, 1500);
        }
    }

    function makeRecommendationButton(action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'yt-tweaks-card-action yt-tweaks-recommendation-button';
        button.dataset.ytAction = action.key;
        button.title = action.label;
        button.setAttribute('aria-label', action.label);
        button.appendChild(createRecommendationIcon(action.icon));
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const card = button.closest(SELECTORS.queueCards);
            if (!card) return;
            runRecommendationAction(card, button, action);
        });
        return button;
    }

    function updateQueueButtons() {
        const queued = new Set(readQueue().map(item => item.videoId));
        document.querySelectorAll(SELECTORS.queueCards).forEach(card => {
            const info = getCardVideo(card);
            if (!info) return;
            // Przyciski są rodzeństwem linku miniatury, nie jego dziećmi — YouTube
            // używa granic linku do sterowania podglądem po najechaniu.
            const toolbarHost = info.anchor.parentElement || card;
            if (getComputedStyle(toolbarHost).position === 'static') {
                toolbarHost.classList.add('yt-tweaks-thumbnail-controls-host');
            }
            let toolbar = [...toolbarHost.children].find(child => child.classList.contains('yt-tweaks-card-actions'));
            if (!toolbar) {
                // Przenieś pasek z poprzedniej wersji, jeśli skrypt zaktualizował się bez przeładowania.
                toolbar = info.anchor.querySelector('.yt-tweaks-card-actions');
                if (toolbar) toolbarHost.appendChild(toolbar);
            }
            if (!toolbar) {
                toolbar = document.createElement('div');
                toolbar.className = 'yt-tweaks-card-actions';
                toolbarHost.appendChild(toolbar);
                diagnosticLog('card-controls-added', {
                    cardTag: card.tagName.toLocaleLowerCase(),
                    anchorTag: info.anchor.tagName.toLocaleLowerCase(),
                    hostTag: toolbarHost.tagName.toLocaleLowerCase(),
                    outsideLink: toolbar.parentElement !== info.anchor
                });
            }

            let button = toolbar.querySelector('.yt-tweaks-queue-button');
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'yt-tweaks-card-action yt-tweaks-queue-button';
                button.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const currentQueue = readQueue();
                    const existing = currentQueue.findIndex(item => item.videoId === button.dataset.videoId);
                    if (existing >= 0) currentQueue.splice(existing, 1);
                    else currentQueue.unshift({ videoId: button.dataset.videoId, url: button.dataset.url, title: button.dataset.title });
                    writeQueue(currentQueue.slice(0, 100));
                    updateQueueButtons();
                    if (document.getElementById('yt-tweaks-queue-panel')) renderQueuePanel();
                });
                toolbar.appendChild(button);
            }

            Object.values(RECOMMENDATION_ACTIONS).forEach(action => {
                const exists = [...toolbar.querySelectorAll('.yt-tweaks-recommendation-button')]
                    .some(candidate => candidate.dataset.ytAction === action.key);
                if (!exists) toolbar.appendChild(makeRecommendationButton(action));
            });

            button.dataset.videoId = info.videoId;
            button.dataset.url = info.url;
            button.dataset.title = info.title;
            setQueueButton(button, queued.has(info.videoId));
        });
    }

    function renderQueuePanel() {
        const panel = document.getElementById('yt-tweaks-queue-panel');
        if (!panel) return;
        panel.replaceChildren();

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px';
        const heading = document.createElement('strong');
        heading.textContent = `Do obejrzenia (${readQueue().length})`;
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = 'Zamknij';
        close.addEventListener('click', () => panel.remove());
        header.append(heading, close);
        panel.appendChild(header);

        const queue = readQueue();
        if (!queue.length) {
            const empty = document.createElement('p');
            empty.textContent = 'Kolejka jest pusta. Dodaj film przyciskiem na jego karcie.';
            panel.appendChild(empty);
            return;
        }

        queue.forEach(item => {
            const row = document.createElement('div');
            row.className = 'yt-tweaks-queue-row';
            const link = document.createElement('a');
            link.className = 'yt-tweaks-queue-title';
            link.href = item.url;
            link.textContent = item.title || item.videoId || 'Film';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = 'Usuń';
            remove.addEventListener('click', () => {
                writeQueue(readQueue().filter(entry => entry.videoId !== item.videoId));
                renderQueuePanel();
                updateQueueButtons();
            });
            row.append(link, remove);
            panel.appendChild(row);
        });
    }

    function showQueuePanel() {
        let panel = document.getElementById('yt-tweaks-queue-panel');
        if (!panel) {
            panel = document.createElement('section');
            panel.id = 'yt-tweaks-queue-panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-label', 'Kolejka do obejrzenia');
            document.body.appendChild(panel);
        }
        renderQueuePanel();
    }

    function channelKey() {
        if (location.pathname !== '/watch') return null;
        const owner = document.querySelector('ytd-watch-metadata ytd-channel-name, ytd-video-owner-renderer ytd-channel-name, ytd-channel-name');
        const anchor = owner?.querySelector('a[href]') || document.querySelector('ytd-watch-metadata a[href^="/@"], ytd-watch-metadata a[href^="/channel/"]');
        if (anchor) {
            const path = new URL(anchor.href, location.href).pathname.replace(/\/$/, '');
            const id = path.match(/^\/(channel\/[^/]+|@[^/]+|user\/[^/]+)/i)?.[1];
            if (id) return id.startsWith('@') || id.startsWith('user/') ? id.toLocaleLowerCase() : id;
        }
        const name = (owner?.textContent || '').replace(/\s+/g, ' ').trim();
        return name ? `name:${name.toLocaleLowerCase()}` : null;
    }

    function readSpeeds() {
        const speeds = GM_getValue(KEYS.speeds, {});
        return speeds && typeof speeds === 'object' && !Array.isArray(speeds) ? speeds : {};
    }

    function saveCurrentChannelSpeed() {
        const video = document.querySelector('ytd-player video.html5-main-video, video.html5-main-video, ytd-player video');
        const key = channelKey();
        if (!video || !key) {
            console.info('[YouTube Tweaks] Otwórz film, aby zapisać prędkość kanału.');
            return;
        }
        const speeds = readSpeeds();
        speeds[key] = video.playbackRate;
        GM_setValue(KEYS.speeds, speeds);
        console.info(`[YouTube Tweaks] Zapisano prędkość ${video.playbackRate}× dla kanału ${key}.`);
    }

    function applySavedRate(video) {
        const key = channelKey();
        if (!key || !video?.isConnected) return;
        const rate = Number(readSpeeds()[key]);
        if (Number.isFinite(rate) && rate >= 0.25 && rate <= 2 && video.playbackRate !== rate) {
            video.playbackRate = rate;
        }
    }

    const rateRetries = new WeakMap();
    function scheduleRateApply(video) {
        if (!video) return;
        (rateRetries.get(video) || []).forEach(clearTimeout);
        const timers = [150, 500, 1200, 2400, 5000];
        const ids = timers.map(delay => setTimeout(() => applySavedRate(video), delay));
        ids.push(setTimeout(() => rateRetries.delete(video), timers[timers.length - 1] + 50));
        rateRetries.set(video, ids);
    }

    function watchVideoRate() {
        // Nie dotykaj wideo podglądowego kart; pamięć prędkości dotyczy playera głównego.
        const video = document.querySelector('ytd-player video.html5-main-video, video.html5-main-video, ytd-player video');
        if (!video || video.dataset.ytTweaksRateBound) return;
        video.dataset.ytTweaksRateBound = '1';
        ['loadstart', 'emptied', 'loadedmetadata', 'loadeddata', 'canplay', 'playing'].forEach(type => {
            video.addEventListener(type, () => scheduleRateApply(video));
        });
        scheduleRateApply(video);
    }

    function registerMenus() {
        const toggles = [
            ['shorts', 'Shorts'],
            ['ads', 'Reklamy-kafelki w feedzie'],
            ['explore', 'Sekcja Przeglądaj / Explore'],
            ['history', 'Pozycje Oglądane w sidebarze']
        ];
        toggles.forEach(([key, label]) => {
            GM_registerMenuCommand(`${settings[key] ? '✓' : '□'} ${label}: ${settings[key] ? 'ukryte' : 'widoczne'}`, () => {
                settings[key] = !settings[key];
                GM_setValue(KEYS[key], settings[key]);
                scanPage();
            });
        });
        GM_registerMenuCommand('Pokaż kolejkę „Do obejrzenia”', showQueuePanel);
        GM_registerMenuCommand('Zapisz bieżącą prędkość dla kanału', saveCurrentChannelSpeed);
        GM_registerMenuCommand('Włącz / wyłącz diagnostykę interakcji', toggleDiagnostics);
        GM_registerMenuCommand('Pokaż bufor diagnostyczny w konsoli', dumpDiagnostics);
    }

    function scanPage() {
        applyShorts();
        applyAds();
        applyExplore();
        applyHistory();
        updateQueueButtons();
        watchVideoRate();
    }

    let scanTimer = 0;
    function scheduleScan() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scanPage, 260);
    }

    registerMenus();
    scanPage();

    ['pointerover', 'pointerout', 'mouseover', 'mouseout', 'pointerdown', 'pointerup', 'click'].forEach(type => {
        document.addEventListener(type, captureDiagnosticEvent, true);
    });

    document.addEventListener('yt-navigate-finish', () => {
        scheduleScan();
        scheduleRateApply(document.querySelector('ytd-player video.html5-main-video, video.html5-main-video, ytd-player video'));
    });

    const observer = new MutationObserver(scheduleScan);
    const observeRoot = document.body || document.documentElement;
    if (observeRoot) observer.observe(observeRoot, { childList: true, subtree: true });
})();
