// ==UserScript==
// @name         HBO Max – ukryj Gradient
// @namespace    https://github.com/opencode-test/hbo
// @version      1.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/hbo/hbomax-topgradient-hide.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/hbo/hbomax-topgradient-hide.user.js
// @description  Chowa warstwę gradientu (klasy Gradient-Fuse-Web-Play__sc) na play.hbomax.com
// @author       opencode
// @match        https://play.hbomax.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // Selektor: łapie bazową klasę styled-components oraz warianty z hashem,
    // np. Gradient-Fuse-Web-Play__sc-abc123 (także TopGradient-...). Celowo pełna nazwa, nie ogólny prefiks.
    var SELECTOR = '[class*="Gradient-Fuse-Web-Play__sc"]';

    var CSS = SELECTOR + ' { display: none !important; visibility: hidden !important; pointer-events: none !important; }';

    // 1. Wstrzyknij styl jak najwcześniej (documentElement), żeby ukryć zanim JS strony zdąży przemalować.
    function injectStyle() {
        try {
            if (typeof GM_addStyle === 'function') {
                GM_addStyle(CSS);
                return;
            }
        } catch (e) { /* spadnij do ręcznego <style> */ }
        var style = document.createElement('style');
        style.setAttribute('data-hbo-hide', 'gradient');
        style.textContent = CSS;
        var root = document.documentElement || document.head;
        if (root) {
            root.appendChild(style);
        } else {
            // DOM jeszcze nie gotowy — spróbuj przy pierwszym starcie skanowania
            document.addEventListener('DOMContentLoaded', function onReady() {
                document.removeEventListener('DOMContentLoaded', onReady);
                (document.head || document.documentElement).appendChild(style);
            });
        }
    }

    // 2. Skan awaryjny: gdyby strona nadpisywała style inline, wymuś ukrycie wprost.
    // CSS z !important zwykle wystarcza, to jest pas bezpieczeństwa pod SPA.
    function scan() {
        var els;
        try {
            els = document.querySelectorAll(SELECTOR);
        } catch (e) {
            return;
        }
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (el.dataset.hboHidden === '1') { continue; }
            el.dataset.hboHidden = '1';
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
        }
    }

    injectStyle();
    scan();

    // 3. Ponowne skany — HBO to SPA, gradient może wrócić po nawigacji bez przeładowania.
    var timers = [500, 1000, 2000, 3000, 5000, 8000, 12000, 20000];
    timers.forEach(function (t) { setTimeout(scan, t); });

    // 4. Obserwator zmian DOM z debounce (podmiany widoków w playerze).
    var scanTimer = null;
    function scheduleScan() {
        if (scanTimer) { clearTimeout(scanTimer); }
        scanTimer = setTimeout(scan, 250);
    }

    function startObserver() {
        var target = document.body || document.documentElement;
        if (!target) {
            setTimeout(startObserver, 200);
            return;
        }
        new MutationObserver(scheduleScan).observe(target, { childList: true, subtree: true });
    }
    startObserver();

    window.addEventListener('scroll', scheduleScan, { passive: true });
})();
