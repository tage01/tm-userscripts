// ==UserScript==
// @name         Chaturbate Location Spoof & Age Gate Bypass
// @namespace    http://tampermonkey.net/
// @version      1.1
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/02_cam/chatu/chaturbate-geo-spoof.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/02_cam/chatu/chaturbate-geo-spoof.user.js
// @description  Spoofs geolocation, timezone, language, blocks geo-detection, bypasses age verification on Chaturbate
// @author       You
// @match        https://chaturbot.co/*
// @match        https://chaturbate.com/*
// @match        https://*.chaturbate.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var TZ = 'America/New_York';
    var LANG = 'en-US';
    var LAT = 40.7128;
    var LON = -74.0060;

    // 1. Override Intl timezone first (runs before anything else)
    var origResolved = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function() {
        var base = origResolved.call(this);
        base.timeZone = TZ;
        return base;
    };

    // 2. Override navigator properties
    var navProps = {
        language: LANG,
        languages: [LANG, 'en'],
        platform: 'Win32',
        cookieEnabled: true,
        doNotTrack: 'unspecified'
    };

    Object.keys(navProps).forEach(function(key) {
        try {
            Object.defineProperty(Navigator.prototype, key, {
                get: function() { return navProps[key]; },
                configurable: true,
                enumerable: true
            });
        } catch(e) {
            try {
                Object.defineProperty(navigator, key, {
                    get: function() { return navProps[key]; },
                    configurable: true,
                    enumerable: true
                });
            } catch(e2) {}
        }
    });

    // 3. Override geolocation
    var fakePosition = {
        coords: {
            latitude: LAT,
            longitude: LON,
            altitude: null,
            accuracy: 10,
            altitudeAccuracy: null,
            heading: null,
            speed: null
        },
        timestamp: Date.now()
    };

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = function(success, error, options) {
            setTimeout(function() {
                if (success) success(fakePosition);
            }, 0);
        };
        navigator.geolocation.watchPosition = function(success, error, options) {
            setTimeout(function() {
                if (success) success(fakePosition);
            }, 0);
            return Math.floor(Math.random() * 100000);
        };
    }

    // 4. Override Permissions API to auto-grant geolocation
    if (navigator.permissions && navigator.permissions.query) {
        var origQuery = navigator.permissions.query;
        navigator.permissions.query = function(desc) {
            if (desc && desc.name === 'geolocation') {
                return Promise.resolve({ state: 'granted', onchange: null });
            }
            return origQuery.call(navigator.permissions, desc);
        };
    }

    // 5. Override Date.getTimezoneOffset to match US Eastern (-05:00)
    Date.prototype.getTimezoneOffset = function() {
        return 300;
    };

    // 6. Intercept XHR to add age-gate bypass header
    var XHR = XMLHttpRequest.prototype;
    var origXHROpen = XHR.open;
    XHR.open = function(method, url) {
        var xhr = this;
        var origSend = xhr.send;
        xhr.send = function(body) {
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            return origSend.call(xhr, body);
        };
        return origXHROpen.apply(xhr, arguments);
    };

    // 7. Intercept fetch to add bypass header
    var origFetch = window.fetch;
    if (origFetch) {
        window.fetch = function(url, opts) {
            opts = opts || {};
            opts.credentials = 'include';
            opts.headers = opts.headers || {};
            if (typeof opts.headers.append === 'function') {
                opts.headers.set('X-Requested-With', 'XMLHttpRequest');
            } else {
                opts.headers['X-Requested-With'] = 'XMLHttpRequest';
            }
            return origFetch.call(window, url, opts);
        };
    }

    // 8. Block WebRTC IP leak
    if (window.RTCPeerConnection) {
        var origPC = window.RTCPeerConnection;
        window.RTCPeerConnection = function() {
            var pc = new origPC();
            pc.createDataChannel('');
            var origCreateOffer = pc.createOffer;
            pc.createOffer = function() {
                return origCreateOffer.apply(pc, arguments).then(function(offer) {
                    offer.sdp = offer.sdp.replace(/c=IN IP4\s+\d+\.\d+\.\d+\.\d+/g, 'c=IN IP4 0.0.0.0');
                    return offer;
                });
            };
            return pc;
        };
        window.RTCPeerConnection.prototype = origPC.prototype;
    }

    // 9. On chaturbot.co: find and ensure iframe loads
    if (location.hostname.indexOf('chaturbot') !== -1) {
        var observer = new MutationObserver(function(muts) {
            muts.forEach(function(mut) {
                [].forEach.call(mut.addedNodes, function(node) {
                    if (node.tagName === 'IFRAME') {
                        var src = node.src || '';
                        if (src.indexOf('chaturbate.com') !== -1) {
                            node.src = src;
                        }
                    }
                });
            });
        });
        if (document.documentElement) {
            observer.observe(document.documentElement, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                observer.observe(document.documentElement, { childList: true, subtree: true });
            });
        }
    }

    // 10. On chaturbate.com: auto-click age gate
    if (location.hostname.indexOf('chaturbate.com') !== -1) {
        document.addEventListener('DOMContentLoaded', function() {
            var tries = 0;
            var interval = setInterval(function() {
                tries++;
                // Try various selectors for age verification buttons
                var btns = document.querySelectorAll(
                    'input[value="I Agree"], input[value="I AGREE"], ' +
                    'button:not([disabled]), a[href*="agree"], ' +
                    '.agree-btn, #age_confirm, [onclick*="agree"], ' +
                    '.age-verification button, .age-gate button'
                );
                for (var i = 0; i < btns.length; i++) {
                    var text = (btns[i].textContent || btns[i].value || '').toUpperCase();
                    if (text.indexOf('AGREE') !== -1 || text.indexOf('YES') !== -1 ||
                        text.indexOf('ENTER') !== -1 || text.indexOf('CONTINUE') !== -1) {
                        btns[i].click();
                        clearInterval(interval);
                        return;
                    }
                }
                if (tries > 100) clearInterval(interval);
            }, 100);

            // Also auto-scroll to bottom if there's a terms page
            window.scrollTo(0, document.body.scrollHeight);
        });
    }

    console.log('[Geo Spoof] Active - spoofing to', TZ, LANG, LAT, LON);
})();
