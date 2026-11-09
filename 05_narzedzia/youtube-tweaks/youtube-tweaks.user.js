// ==UserScript==
// @name         YouTube – Shorts i porządki w interfejsie
// @namespace    https://github.com/tage01/opencode-test
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/05_narzedzia/youtube-tweaks/youtube-tweaks.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/05_narzedzia/youtube-tweaks/youtube-tweaks.user.js
// @description  Ukrywa wybrane elementy YouTube, pamięta prędkość kanałów i prowadzi kolejkę do obejrzenia.
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
        .yt-tweaks-queue-button {
            position: absolute; inset-block-start: 8px; inset-inline-end: 8px; z-index: 20;
            border: 0; border-radius: 18px; padding: 7px 10px; color: #fff;
            background: rgba(20, 20, 20, .88); font: 500 12px Roboto, Arial, sans-serif;
            cursor: pointer; opacity: .94;
        }
        .yt-tweaks-queue-button:hover { background: #303030; }
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

    function updateQueueButtons() {
        const queued = new Set(readQueue().map(item => item.videoId));
        document.querySelectorAll(SELECTORS.queueCards).forEach(card => {
            const info = getCardVideo(card);
            if (!info) return;
            let button = info.anchor.querySelector(':scope > .yt-tweaks-queue-button');
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'yt-tweaks-queue-button';
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
                info.anchor.appendChild(button);
            }
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
