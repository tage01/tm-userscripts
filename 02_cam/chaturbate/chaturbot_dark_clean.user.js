// ==UserScript==
// @name         Chaturbot - Ciemny motyw (grayscale) - CLEAN
// @namespace    http://tampermonkey.net/
// @version      1.5
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/02_cam/chaturbate/chaturbot_dark_clean.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/02_cam/chaturbate/chaturbot_dark_clean.user.js
// @description  Ciemna, grayscale szata graficzna dla chaturbot.co
// @author       You
// @match        http://chaturbot.co/*
// @match        https://chaturbot.co/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle([
        'html, body { background:#121212 !important; color:#ccc !important; }',

        '.navbar, .navbar-default, .navbar-static-top, .navcontainer { background:#1e1e1e !important; border-color:#333 !important; }',
        '.navbar-brand { color:#ccc !important; }',
        '.navbar-nav > li > a, .navbar-default .navbar-nav > li > a { color:#bbb !important; }',
        '.navbar-nav > li > a:hover, .navbar-nav > li > a:focus { color:#fff !important; }',
        '.navbar-nav > .open > a, .navbar-nav > .open > a:hover { background:#333 !important; }',
        '.navbar-collapse { border-color:#333 !important; }',
        '.navbar-toggle { border-color:#444 !important; background:#333 !important; }',
        '.navbar-toggle .icon-bar { background:#888 !important; }',
        '.navbar-default .navbar-nav > .open > a, .navbar-default .navbar-nav > .open > a:hover { background:#333 !important; }',
        '.navbar-default .navbar-nav > .dropdown > a .caret { border-color:#bbb transparent !important; }',
        '.navbar-default .navbar-brand { color:#ccc !important; }',

        '.dropdown-menu { background:#1e1e1e !important; border-color:#444 !important; }',
        '.dropdown-menu > li > a { color:#bbb !important; }',
        '.dropdown-menu > li > a:hover, .dropdown-menu > li > a:focus { background:#333 !important; color:#fff !important; }',
        '.dropdown-menu .divider { background-color:#333 !important; }',

        '.container { background:#121212 !important; }',
        '.row { background:transparent !important; }',
        '#main { background:#121212 !important; }',

        '.col-sm-9, .col-sm-3, .col-sm-6, .col-md-4, .col-md-6, .col-md-3, .col-md-2, .col-md-8, .col-md-10 { background:#121212 !important; }',

        '.topSectionWrapper { background:#121212 !important; }',
        '.topSectionWrapper, .topSection, .sectionContent { background:#121212 !important; color:#bbb !important; }',
        '.topSectionWrapper a, .topSection a, .sectionContent a { color:#aaa !important; }',
        '.topSectionWrapper a:hover, .topSection a:hover, .sectionContent a:hover { color:#fff !important; }',

        '.leftcol { background:#121212 !important; }',
        '.left-outerbox { background:#1e1e1e !important; border:1px solid #333 !important; }',
        '.left-innerbox { background:#1a1a1a !important; border:1px solid #333 !important; }',
        '.cap { color:#aaa !important; background:#222 !important; }',
        '.left-info { background:#1e1e1e !important; border-color:#333 !important; color:#bbb !important; }',
        '.preferences, .index-icons, .center { background:#1e1e1e !important; color:#bbb !important; }',
        '.preferences a { color:#aaa !important; }',

        '.browsebtn { color:#fff !important; }',
        '.browsebtn:hover, .browsebtn:active, .browsebtn:focus, .browsebtn:visited { color:#fff !important; }',
        '.btn-pink, .btn-blue, .btn-green, .btn-yellow { background:#555 !important; border-color:#444 !important; color:#ccc !important; }',
        '.btn-pink:hover, .btn-green:hover, .btn-blue:hover, .btn-yellow:hover { color:#fff !important; background:#666 !important; }',
        '.browsebtn:hover { background:#666 !important; }',
        '.btn-blue, .btn-yellow { display:none !important; }',

        '.cell { background:#1e1e1e !important; border:1px solid #333 !important; }',
        '.caption { color:#ccc !important; }',
        '.viewers { color:#777 !important; }',
        '.imgholder { background:#0a0a0a !important; }',

        '.pagelinks { padding:10px 0 !important; }',
        '.pagelink { color:#bbb !important; background:#222 !important; border:1px solid #444 !important; padding:6px 12px !important; }',
        '.pagelink:hover { background:#444 !important; color:#fff !important; }',
        '.page-selected { background:#666 !important; color:#fff !important; border-color:#666 !important; }',

        '.columnheaders { background:#1a1a1a !important; color:#bbb !important; border-bottom:1px solid #333 !important; padding:8px !important; }',
        '.colheader { color:#777 !important; }',
        '.column-60, .column-10, .column-40, .column-15 { background:transparent !important; }',

        '.searchfrm { color:#bbb !important; }',
        '.searchfrm a { color:#aaa !important; }',
        '.form-control { background:#1e1e1e !important; border:1px solid #444 !important; color:#ccc !important; }',
        '.form-control:focus { border-color:#888 !important; box-shadow:none !important; }',
        '#searchholder { background:transparent !important; }',
        '#searchmsgholder { background:transparent !important; }',
        '#addmsg { color:#bbb !important; }',

        'a, a:link { color:#aaa !important; }',
        'a:hover { color:#fff !important; }',
        'a:visited { color:#888 !important; }',

        '.framewrapper { background:#000 !important; }',
        '.cblink { background:#1e1e1e !important; border-top:1px solid #333 !important; }',
        '#chromemsg { display:none !important; }',
        '.main { background:#121212 !important; }',
        '.main > div, .main > div > div, .main > section, .main > article { background:#121212 !important; color:#bbb !important; }',
        '.main a { color:#aaa !important; }',
        '.main a:hover { color:#fff !important; }',

        '.alert, .alert-info { background:#1e1e1e !important; border:1px solid #444 !important; color:#bbb !important; }',
        '.alert-success, .alert-warning, .alert-danger, .alert-grey { background:#1e1e1e !important; border:1px solid #444 !important; color:#bbb !important; }',
        '.modellist { background:#1e1e1e !important; }',
        '.modellist.alert-success { background:#1e1e1e !important; border:1px solid #444 !important; color:#bbb !important; }',

        '.glyphicon { color:#888 !important; }',
        '.glyphicon-star, .glyphicon-star-empty, .glyphicon-star:hover { color:#f0c040 !important; }',
        '#followbutton { color:#f0c040 !important; background:#3a3520 !important; border:1px solid #5a5030 !important; }',
        '#followbutton:hover { background:#4a4530 !important; color:#ffd700 !important; }',
        '.sorticon { color:#777 !important; }',
        '.sorticon:hover { color:#bbb !important; }',
        '.activeicon { color:#ccc !important; }',

        '.btn-default { background:#1e1e1e !important; border:1px solid #444 !important; color:#bbb !important; }',
        '.btn-default:hover { background:#444 !important; color:#fff !important; }',
        '.btn-success { background:#4a4a4a !important; border:1px solid #555 !important; color:#eee !important; }',
        '.btn-success:hover { background:#5a5a5a !important; }',
        '.btn-danger { background:#5a3a3a !important; border:1px solid #6a4a4a !important; }',
        '.btn-info { background:#3a4a4a !important; border:1px solid #4a5a5a !important; }',
        '.btn-primary { background:#4a4a4a !important; border:1px solid #5a5a5a !important; }',

        '#lefttop, #righttop { background:transparent !important; }',
        '#announcement { background:#1e1e1e !important; color:#bbb !important; padding:6px !important; }',
        '#announcement a { color:#aaa !important; }',
        '#addbtn { background:#4a4a4a !important; border:1px solid #555 !important; color:#eee !important; }',

        'input, textarea, select { background:#1a1a1a !important; border:1px solid #444 !important; color:#ccc !important; }',
        'input:focus, textarea:focus { border-color:#888 !important; outline:none !important; }',
        'label { color:#bbb !important; }',
        '#autocomplete { background:#1e1e1e !important; }',

        '.footer-holder { background:#1e1e1e !important; border-top:1px solid #333 !important; }',

        'hr { border-color:#333 !important; }',
        'h1, h2, h3, h4, h5, h6 { color:#ddd !important; }',
        'p, li, .text-muted { color:#bbb !important; }',

        '.rss-icon { filter:invert(0.5) !important; }',

        '.data { background:transparent !important; }',

        '::-webkit-scrollbar { width:10px; }',
        '::-webkit-scrollbar-track { background:#121212; }',
        '::-webkit-scrollbar-thumb { background:#444; border-radius:5px; }',
        '::-webkit-scrollbar-thumb:hover { background:#666; }'
    ].join('\n'));

    function fixLights() {
        var dark = '#1e1e1e';
        document.querySelectorAll('div, section, header, footer, aside, nav, form, table, td, th, tr, ul, ol, li, p, span, h1, h2, h3, h4, h5, h6').forEach(function(el) {
            if (el.id === 'video-container' || el.id === 'toggle-btn' || el.id === 'screenshot-btn' || el.closest('.dropdown-menu')) return;
            var s = el.style;
            var inline = s.backgroundColor || s.background;
            if (!inline || inline === 'transparent' || inline.indexOf('rgba(0,0,0,0)') > -1 || inline.indexOf('transparent') > -1) return;
            var m = inline.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!m) return;
            if (parseInt(m[1]) > 200 && parseInt(m[2]) > 200 && parseInt(m[3]) > 200) {
                el.style.setProperty('background-color', dark, 'important');
            }
        });
    }

    function injectLate() {
        var s = document.createElement('style');
        s.textContent = [
            'html { background:#121212 !important }',
            'body { background:#121212 !important }',
            'nav.navbar.navbar-default.navbar-static-top { background:#1e1e1e !important; border-color:#333 !important }',
            'div.columnheaders { background:#1a1a1a !important; border-bottom:1px solid #333 !important }',
            'div.left-innerbox { background:#1a1a1a !important; border:1px solid #333 !important }',
            'div.left-outerbox { background:#1e1e1e !important; border:1px solid #333 !important }',
            'div.alert.alert-info.left-info { background:#1e1e1e !important; border:1px solid #444 !important }',
            'div.modellist.alert.alert-grey { background:#1e1e1e !important; border:1px solid #444 !important }',
            'div.col-sm-3.leftcol { background:#121212 !important }',
            'div.col-sm-9 { background:#121212 !important }',
            'div.col-md-10 { background:#121212 !important }',
            'div.container { background:#121212 !important }',
            'div.navcontainer { background:#1e1e1e !important }',
            'input#autocomplete.form-control { background:#1e1e1e !important; border:1px solid #444 !important; color:#ccc !important }',
            'button#addbtn.btn-success { background:#4a4a4a !important; border:1px solid #555 !important; color:#eee !important }',
            'div#searchholder { background:transparent !important }',
            'a.btn-pink.browsebtn, a.btn-green.browsebtn { color:#fff !important }',
            'div.cell { background:#1e1e1e !important; border:1px solid #333 !important }',
            'div.imgholder { background:#0a0a0a !important }',
            'div.caption { color:#ccc !important }',
            'div.caption a { color:#aaa !important }',
            'div.viewers { color:#777 !important }',
            'div.pagelinks a.pagelink { color:#bbb !important; background:#222 !important; border:1px solid #444 !important }',
            'div.pagelinks a.pagelink.page-selected { background:#666 !important; color:#fff !important }',
            'div.pagelinks a.pagelink:hover { background:#444 !important; color:#fff !important }',
            'a.pagelink.arrow { color:#bbb !important }',
            'div.pagelinks input, div.pagelinks select { background:#1e1e1e !important; color:#ccc !important; border:1px solid #444 !important }',
            'div.pagelinks { color:#bbb !important }',
            'div.pagelinks a { color:#bbb !important }',
            'ul.pagination > li > a, ul.pagination > li > span { background:#222 !important; border:1px solid #444 !important; color:#bbb !important }',
            'ul.pagination > li.active > a, ul.pagination > li.active > span { background:#666 !important; color:#fff !important; border-color:#555 !important }',
            'ul.pagination > li > a:hover, ul.pagination > li > span:hover { background:#444 !important; color:#fff !important }',
            'div.pagelinks b, div.pagelinks strong { color:#ddd !important }',
            'div.topSectionWrapper { background:#121212 !important; border:none !important }',
            'div.topSectionWrapper > div, div.topSectionWrapper > div > div, div.topSectionWrapper > div > div > div { background:#121212 !important; color:#bbb !important }',
            'div.topSectionWrapper a, div.topSectionWrapper a:link, div.topSectionWrapper a:visited { color:#aaa !important }',
            'div.topSection, div.sectionContent { background:#121212 !important; color:#bbb !important }',
            'div.topSectionWrapper button:not(.btn-success):not(.btn-primary) { background:#444 !important; color:#ccc !important; border:1px solid #555 !important }',
            'div.topSectionWrapper button:hover { background:#555 !important; color:#fff !important }',
            'div.main { background:#121212 !important }',
            'div.main > div { background:#121212 !important; color:#bbb !important }',
            'div.main a { color:#aaa !important }',
            'span.glyphicon-star, span.glyphicon-star-empty { color:#f0c040 !important }',
            'button#followbutton { color:#f0c040 !important; background:#3a3520 !important; border:1px solid #5a5030 !important }',
            'button#followbutton:hover { background:#4a4530 !important; color:#ffd700 !important }'
        ].join('\n');
        document.head.appendChild(s);
    }

    function darkenDynamic() {
        var selectors = '.topSectionWrapper, .topSectionWrapper *, .main, .main > div, .main > section, .main > article, div.main, div.main > div, div.main > section';
        var targets = document.querySelectorAll(selectors);
        for (var i = 0; i < targets.length; i++) {
            var el = targets[i];
            if (el.tagName === 'IFRAME' || el.tagName === 'VIDEO' || el.tagName === 'IMG') continue;
            el.style.setProperty('background', '#121212', 'important');
            el.style.setProperty('background-image', 'none', 'important');
            el.style.setProperty('color', '#bbb', 'important');
        }
        var linkSelectors = '.topSectionWrapper a, .main a, div.main a';
        var links = document.querySelectorAll(linkSelectors);
        for (var i = 0; i < links.length; i++) {
            links[i].style.setProperty('color', '#aaa', 'important');
        }
        var cols = document.querySelectorAll('.col-md-10');
        for (var i = 0; i < cols.length; i++) {
            cols[i].style.setProperty('background', '#121212', 'important');
            cols[i].style.setProperty('background-image', 'none', 'important');
        }
    }

    function onReady() {
        fixLights();
        injectLate();
        document.body.style.setProperty('background-color', '#121212', 'important');
        document.documentElement.style.setProperty('background-color', '#121212', 'important');
        darkenDynamic();
        var observer = new MutationObserver(function() {
            darkenDynamic();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: false });
        setInterval(darkenDynamic, 1000);
        setTimeout(darkenDynamic, 3000);
        setTimeout(darkenDynamic, 5000);
    }

    if (document.readyState === 'complete') onReady();
    else window.addEventListener('load', onReady);
})();
