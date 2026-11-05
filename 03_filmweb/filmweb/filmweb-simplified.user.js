// ==UserScript==
// @name         Filmweb - Uproszczony widok filmu
// @namespace    http://tampermonkey.net/
// @version      1.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/03_filmweb/filmweb/filmweb-simplified.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/03_filmweb/filmweb/filmweb-simplified.user.js
// @description  Czyści stronę filmu na Filmwebie z reklam, zostawiając tylko istotne info + nawigację
// @author       You
// @match        https://www.filmweb.pl/film/*
// @icon         https://www.filmweb.pl/favicon.ico
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    function hideAd(sel) {
        const el = document.querySelector(sel);
        if (el) el.style.display = 'none';
    }

    function hideAllAds() {
        // Ad containers - specific classes only, NOT fa__wrapper (that's the main content!)
        const adSelectors = [
            'div.faMobileInterstitial',
            'div.faDesktopInterstitial',
            'div.faDesktopSponsoring',
            'div.faMobileBillboardTop',
            'div.faMobileBillboardBottom',
            'div.faDesktopBillboard',
            'div.faWebCoverPhotoBanner',
            'div.faDesktopSkyTop',
            'div.faDesktopSkyBottom',
            'div.faDesktopBaseBar',
            'div.faMobileRectangleTop',
            'div.faDesktopRectangleTop',
            'div.faMobileRectangleBottom',
            'div.faMobileSponsoring',
            'div.faMobileBaseBar',
            'div.faWebBannerPromoFilmsFirst',
            'div.faWebBannerPromoFilmsSecond',
            'div.faWebBannerPromoSerialsFirst',
            'div.faWebBannerPromoSerialsSecond',
            'div.faWebBannerPromoVod',
            'div.rc',
            'div.hqrilbu',
            'div.advertButtonWrapper',
            'div.menu__placements',
            'div.siteFooterSection__appDownload',
        ];

        adSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                el.style.display = 'none';
            });
        });

        // Hide empty ad placeholders
        document.querySelectorAll('[class*="fa"]').forEach(el => {
            if (!el.classList.contains('fa__wrapper') && !el.classList.contains('page__content') && el.children.length === 0 && el.textContent.trim() === '') {
                el.style.display = 'none';
            }
        });
    }

    function simplify() {
        hideAllAds();
    }

    function addStyles() {
        GM_addStyle(`
            /* reduce gap between cover and content */
            div[data-group="g2"] {
                margin-top: -20px !important;
            }
            /* remove forced huge min-heights */
            .filmCoverSection__wrapper {
                min-height: auto !important;
                padding-bottom: 1rem !important;
            }
            .page__wrapper, .page__content {
                min-height: auto !important;
            }
            /* plot - show full text */
            .filmPosterSection__plot.clamped {
                -webkit-line-clamp: unset !important;
                max-height: none !important;
            }
            /* spacing for where-to-watch */
            .filmPosterSection__whereToWatchInMedia {
                margin-top: 16px !important;
            }
            .filmPosterSection__info.filmInfo {
                margin-top: 16px !important;
            }
            /* compact opinions */
            .opinionBoxNew {
                padding: 12px !important;
            }
        `);
    }

    function run() {
        addStyles();
        setTimeout(simplify, 500);
        const obs = new MutationObserver(simplify);
        obs.observe(document.body, { childList: true, subtree: true });
    }

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', run)
        : run();
})();
