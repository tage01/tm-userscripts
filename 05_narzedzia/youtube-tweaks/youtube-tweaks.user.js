// ==UserScript==
// @name         YouTube – Shorts i porządki w interfejsie
// @namespace    https://github.com/tage01/opencode-test
// @version      1.0.4
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
        speeds: 'ytTweaks.channelSpeeds'
    };

    const settings = {
        shorts: GM_getValue(KEYS.shorts, true),
        ads: GM_getValue(KEYS.ads, false),
        explore: GM_getValue(KEYS.explore, false),
        history: GM_getValue(KEYS.history, false)
    };

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
        const anchor = card.querySelector('a#thumbnail[href*="/watch"], a[href*="/watch?v="]');
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
        button.textContent = isQueued ? '✓ W kolejce' : '＋ Do obejrzenia';
        button.setAttribute('aria-label', isQueued ? 'Usuń z kolejki do obejrzenia' : 'Dodaj do kolejki do obejrzenia');
        button.dataset.queued = String(isQueued);
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

    function nativeClickTarget(element) {
        if (!element) return null;
        if (element.matches('button, [role="button"], tp-yt-paper-item')) return element;
        return element.querySelector('button, [role="button"], tp-yt-paper-item') || element;
    }

    function isActuallyVisible(element) {
        if (!element?.isConnected || element.closest('[hidden], [aria-hidden="true"]')) return false;
        for (let ancestor = element; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.01) return false;
        }
        const target = nativeClickTarget(element);
        const rect = target.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0
            && rect.bottom > 0 && rect.right > 0
            && rect.top < window.innerHeight && rect.left < window.innerWidth;
    }

    function visibleMenuItem(action) {
        const selector = 'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, tp-yt-paper-item, [role="menuitem"]';
        const popup = document.querySelector('ytd-popup-container');
        const roots = popup ? [popup, document] : [document];
        const seen = new Set();
        for (const root of roots) {
            for (const item of root.querySelectorAll(selector)) {
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
        const menu = card.querySelector('ytd-menu-renderer');
        if (!menu) return null;
        const candidates = [...menu.querySelectorAll('button[aria-label], [role="button"][aria-label], yt-icon-button[aria-label], #button')];
        const actionMenu = candidates.find(element => {
            const label = (element.getAttribute('aria-label') || '').toLocaleLowerCase();
            return /action menu|more actions|more options|menu|więcej|działania|opcji/.test(label);
        });
        return nativeClickTarget(actionMenu || candidates.find(isActuallyVisible) || candidates[0]);
    }

    async function runRecommendationAction(card, button, action) {
        if (button.disabled) return;
        const menuButton = cardMenuButton(card);
        if (!menuButton) {
            button.title = `Menu niedostępne — ${action.label}`;
            button.setAttribute('aria-label', `Menu niedostępne — ${action.label}`);
            setTimeout(() => {
                if (button.isConnected) {
                    button.title = action.label;
                    button.setAttribute('aria-label', action.label);
                }
            }, 1600);
            return;
        }

        button.disabled = true;
        button.title = `Otwieram menu — ${action.label}`;
        button.setAttribute('aria-label', `Otwieram menu — ${action.label}`);
        try {
            menuButton.click();
            const menuItem = await waitForMenuItem(action);
            if (!menuItem) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                button.title = `Opcja niedostępna — ${action.label}`;
                button.setAttribute('aria-label', `Opcja niedostępna — ${action.label}`);
            } else {
                nativeClickTarget(menuItem)?.click();
                button.title = `Wykonano — ${action.label}`;
                button.setAttribute('aria-label', `Wykonano — ${action.label}`);
            }
        } catch (error) {
            console.warn('[YouTube Tweaks] Nie udało się wykonać akcji rekomendacji.', error);
            button.title = `Nie udało się — ${action.label}`;
            button.setAttribute('aria-label', `Nie udało się — ${action.label}`);
        } finally {
            setTimeout(() => {
                if (!button.isConnected) return;
                button.disabled = false;
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
            let toolbar = info.anchor.querySelector('.yt-tweaks-card-actions');
            if (!toolbar) {
                toolbar = document.createElement('div');
                toolbar.className = 'yt-tweaks-card-actions';
                info.anchor.appendChild(toolbar);
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
        const video = document.querySelector('video.html5-main-video, ytd-player video, video');
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
        document.querySelectorAll('video.html5-main-video, ytd-player video, video').forEach(video => {
            if (video.dataset.ytTweaksRateBound) return;
            video.dataset.ytTweaksRateBound = '1';
            ['loadstart', 'emptied', 'loadedmetadata', 'loadeddata', 'canplay', 'playing'].forEach(type => {
                video.addEventListener(type, () => scheduleRateApply(video));
            });
            scheduleRateApply(video);
        });
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

    document.addEventListener('yt-navigate-finish', () => {
        scheduleScan();
        document.querySelectorAll('video').forEach(scheduleRateApply);
    });

    const observer = new MutationObserver(scheduleScan);
    const observeRoot = document.body || document.documentElement;
    if (observeRoot) observer.observe(observeRoot, { childList: true, subtree: true });
})();
