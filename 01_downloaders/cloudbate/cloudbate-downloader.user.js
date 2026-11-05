// ==UserScript==
// @name         Cloudbate Downloader
// @namespace    cloudbate.downloader
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/cloudbate/cloudbate-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/cloudbate/cloudbate-downloader.user.js
// @description  Pobieranie filmów z cloudbate.com – wybór jakości, postęp, anulowanie, kopiowanie URL
// @match        https://www.cloudbate.com/video/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      www.cloudbate.com
// @connect      cloudbate.com
// @connect      gordafen.top
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    var SUBDIR = 'cloudbate'; // podfolder w domyślnym folderze pobierania

    // ---------- Ekstrakcja danych filmu ----------

    // Odczytuje konfigurację playera KVS (kt_player) ze skryptów inline na stronie.
    // Zmienna ma losową nazwę (np. ta005624d74), więc parsujemy po kluczach, nie po nazwie obiektu.
    function extractSources() {
        var scripts = document.querySelectorAll('script:not([src])');
        var html = '';
        for (var i = 0; i < scripts.length; i++) html += scripts[i].textContent;

        var map = {};   // klucz -> url (video_url, video_alt_url2 ...)
        var txt = {};   // klucz -> etykieta jakości (video_alt_url_text ...)

        var reUrl = /(video_url|video_alt_url\d*)\s*:\s*'((?:\\.|[^'\\])*)'/g;
        var reTxt = /(video_url|video_alt_url\d*)_text\s*:\s*'((?:\\.|[^'\\])*)'/g;
        var m;
        while ((m = reUrl.exec(html)) !== null) map[m[1]] = unescapeJs(m[2]);
        while ((m = reTxt.exec(html)) !== null) txt[m[1] === 'video_url' ? 'video_url' : m[1]] = unescapeJs(m[2]);

        // Fallback: już zainicjalizowany element <video> (rozwiązany URL, pomijamy blob:)
        var v = document.querySelector('video');
        if (v && !map.video_url) {
            var u = v.currentSrc || (v.src && v.src.indexOf('blob:') !== 0 ? v.src : '');
            if (!u) {
                var s = v.querySelector('source');
                if (s) u = s.getAttribute('src') || '';
            }
            if (u && u.indexOf('blob:') !== 0) {
                map.video_url = u;
                txt.video_url = qualityFromUrl(u);
            }
        }

        var list = [];
        Object.keys(map).forEach(function (key) {
            var url = map[key];
            if (!url || url.indexOf('http') !== 0) return;
            var label = txt[key + '_text'] || txt[key] || qualityFromUrl(url);
            list.push({ key: key, url: url, label: label });
        });
        return list;
    }

    function unescapeJs(s) {
        return s.replace(/\\(['"\\/])/g, '$1').replace(/\\u([0-9a-fA-F]{4})/g,
            function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
    }

    // Jakość z nazwy pliku w URL, np. "..._720p.mp4" -> "720p"
    function qualityFromUrl(url) {
        var q = url.match(/_(\d{3,4}p)\.\w{3,4}/);
        return q ? q[1] : 'oryginał';
    }

    function getVideoId() {
        var m = location.pathname.match(/\/video\/(\d+)\//);
        return m ? m[1] : '';
    }

    function getTitle() {
        var m = (document.body.innerHTML || '').match(/video_title\s*:\s*'((?:\\.|[^'\\])*)'/);
        var t = m ? unescapeJs(m[1]) : '';
        if (!t) {
            var h1 = document.querySelector('h1');
            t = h1 ? h1.textContent.trim() : '';
        }
        if (!t) t = document.title.trim() || ('cloudbate_' + getVideoId());
        return sanitizeName(t);
    }

    function sanitizeName(name) {
        return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 200);
    }

    function buildFileName(label) {
        var base = getTitle();
        return SUBDIR + '/' + base + (label && label !== 'oryginał' ? ' [' + label + ']' : '') + '.mp4';
    }

    // ---------- Stan pobierania / uchwyt do anulowania ----------

    var state = { busy: false, request: null, blobUrl: null };

    // ---------- Pobieranie ----------

    // Schemat spadkowy: 1) GM_download bezpośrednio na URL (bez RAM, postęp w menedżerze
    // przeglądarki) -> 2) blob przez GM_xmlhttpRequest (postęp na stronie, można anulować)
    // -> 3) <a download> -> 4) otwórz w nowej karcie.
    function startDownload(src) {
        if (state.busy) return;
        state.busy = true;
        setStatus('⏳ Zapis przez menedżer pobierania…', true);

        var saved = false;
        function finish(ok, msg) {
            if (saved) return;
            saved = true;
            state.busy = false;
            if (ok) setStatus('✅ Gotowe', false);
            else setStatus(msg || '', false);
        }

        try {
            GM_download({
                url: src.url,
                name: buildFileName(src.label),
                onerror: function () { blobDownload(src); },
                ontimeout: function () { blobDownload(src); },
                onload: function () { finish(true); }
            });
            // GM_download nie daje callbacku "w trakcie" – po chwili oznaczamy jako przekazane,
            // żeby użytkownik widział, że plik leci w menedżerze pobierania.
            setTimeout(function () {
                if (state.busy) { state.busy = false; setStatus('⏳ Plik w menedżerze pobierania…', false); }
            }, 1500);
        } catch (e) {
            blobDownload(src);
        }
    }

    // Krok 2: blob w RAM przez GM_xmlhttpRequest – prawdziwy pasek postępu + ANULUJ
    function blobDownload(src) {
        setStatus('⏳ Pobieranie… 0%', true);
        showCancel(true);
        state.request = GM_xmlhttpRequest({
            method: 'GET',
            url: src.url,
            responseType: 'blob',
            headers: { 'Referer': location.origin + '/' },
            timeout: 600000,
            onprogress: function (e) {
                if (e.total > 0) {
                    var pct = Math.round(e.loaded / e.total * 100);
                    setProgress(pct);
                    setStatus('⏳ Pobieranie… ' + pct + '%', true);
                } else {
                    setStatus('⏳ Pobrano ' + (e.loaded / 1048576).toFixed(1) + ' MB', true);
                }
            },
            onload: function (res) {
                showCancel(false);
                if (res.status >= 400) {
                    setStatus('❌ Błąd HTTP ' + res.status + ' – token mógł wygasnąć, odśwież stronę', false);
                    state.busy = false;
                    return;
                }
                var blob = res.response;
                state.blobUrl = URL.createObjectURL(blob);
                var name = buildFileName(src.label).replace(SUBDIR + '/', '');
                var done = false;
                function afterSave(ok) {
                    if (done) return;
                    done = true;
                    state.busy = false;
                    if (ok) setStatus('✅ Zapisano', false);
                    else offerTab(src);
                    setTimeout(function () {
                        if (state.blobUrl) { URL.revokeObjectURL(state.blobUrl); state.blobUrl = null; }
                    }, 60000);
                }
                try {
                    GM_download({
                        url: state.blobUrl, name: SUBDIR + '/' + name,
                        onerror: function () { saveViaAnchor(state.blobUrl, name); afterSave(true); },
                        onload: function () { afterSave(true); }
                    });
                } catch (e) {
                    saveViaAnchor(state.blobUrl, name);
                    afterSave(true);
                }
            },
            onerror: function () { showCancel(false); state.busy = false; setStatus('❌ Błąd sieci – spróbuj ponownie', false); },
            ontimeout: function () { showCancel(false); state.busy = false; setStatus('❌ Przekroczono czas pobierania', false); }
        });
    }

    function cancelDownload() {
        if (state.request) { try { state.request.abort(); } catch (e) {} }
        if (state.blobUrl) { try { URL.revokeObjectURL(state.blobUrl); } catch (e) {} state.blobUrl = null; }
        showCancel(false);
        state.busy = false;
        setStatus('Anulowano', false);
    }

    function saveViaAnchor(blobUrl, name) {
        var a = document.createElement('a');
        a.href = blobUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function offerTab(src) {
        setStatus('', false);
        var btn = document.getElementById('cbd-status-link');
        btn.textContent = '↗ Kliknij tutaj, aby otworzyć plik w nowej karcie';
        btn.style.display = 'inline';
        btn.onclick = function () { openInTab(src.url); };
    }

    function openInTab(url) {
        var win = window.open('about:blank');
        if (win) win.location.href = url;
    }

    function copyUrl(text) {
        function ok() { setStatus('📋 Skopiowano URL', false); setTimeout(clearStatus, 2500); }
        function fail() {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); ok(); } catch (e) { setStatus('❌ Nie udało się skopiować', false); }
            ta.remove();
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(ok, fail);
        } else fail();
    }

    // ---------- Interfejs ----------

    function setStatus(txt, progress) {
        var s = document.getElementById('cbd-status');
        if (s) s.textContent = txt;
        var barWrap = document.getElementById('cbd-barwrap');
        if (barWrap) barWrap.style.display = progress ? 'block' : 'none';
        var link = document.getElementById('cbd-status-link');
        if (link) { link.style.display = 'none'; link.onclick = null; }
    }

    function clearStatus() {
        var s = document.getElementById('cbd-status');
        if (s) s.textContent = '';
    }

    function setProgress(pct) {
        var bar = document.getElementById('cbd-bar');
        if (bar) bar.style.width = pct + '%';
    }

    function showCancel(show) {
        var c = document.getElementById('cbd-cancel');
        if (c) c.style.display = show ? 'inline-block' : 'none';
    }

    function injectPanel() {
        if (document.getElementById('cbd-panel')) return true;

        var host = document.querySelector('.player-wrap') ||
                   document.querySelector('.player-holder') ||
                   document.querySelector('.single-video-player .container');
        if (!host) return false;

        var style = document.createElement('style');
        style.textContent =
            '#cbd-panel{position:absolute;top:8px;right:8px;z-index:99999;background:rgba(15,15,15,.88);' +
            'color:#eee;border:1px solid #444;border-radius:6px;padding:6px 8px;font:12px/1.5 Arial,sans-serif;' +
            'max-width:340px;box-shadow:0 2px 8px rgba(0,0,0,.6)}' +
            '#cbd-panel button,#cbd-panel select{font:12px Arial,sans-serif;margin-left:4px;border-radius:4px;' +
            'border:1px solid #555;background:#2b2b2b;color:#eee;padding:3px 8px;cursor:pointer}' +
            '#cbd-panel button:hover{background:#3d3d3d}' +
            '#cbd-download{background:#1e7d32!important;border-color:#2e9e44!important;font-weight:bold}' +
            '#cbd-download:hover{background:#28953f!important}' +
            '#cbd-barwrap{height:5px;background:#333;border-radius:3px;margin-top:5px;display:none;overflow:hidden}' +
            '#cbd-bar{height:100%;width:0;background:#4caf50;transition:width .2s}' +
            '#cbd-status{margin-right:6px}' +
            '#cbd-status-link{display:none;color:#7fbfff;cursor:pointer;text-decoration:underline;margin-left:4px}';
        document.head.appendChild(style);

        var panel = document.createElement('div');
        panel.id = 'cbd-panel';

        var sel = document.createElement('select');
        sel.id = 'cbd-quality';
        sel.title = 'Wybór jakości';

        var btnDl = document.createElement('button');
        btnDl.id = 'cbd-download';
        btnDl.textContent = '⬇ POBIERZ';

        var btnTab = document.createElement('button');
        btnTab.id = 'cbd-tab';
        btnTab.textContent = '↗ Karta';

        var btnCopy = document.createElement('button');
        btnCopy.id = 'cbd-copy';
        btnCopy.textContent = '⧉ Kopiuj';

        var btnCancel = document.createElement('button');
        btnCancel.id = 'cbd-cancel';
        btnCancel.textContent = 'ANULUJ';
        btnCancel.style.display = 'none';

        var status = document.createElement('span');
        status.id = 'cbd-status';

        var link = document.createElement('span');
        link.id = 'cbd-status-link';

        var barWrap = document.createElement('div');
        barWrap.id = 'cbd-barwrap';
        var bar = document.createElement('div');
        bar.id = 'cbd-bar';
        barWrap.appendChild(bar);

        panel.appendChild(sel);
        panel.appendChild(btnDl);
        panel.appendChild(btnTab);
        panel.appendChild(btnCopy);
        panel.appendChild(btnCancel);
        panel.appendChild(document.createElement('br'));
        panel.appendChild(status);
        panel.appendChild(link);
        panel.appendChild(barWrap);
        host.appendChild(panel);
        return true;
    }

    // ---------- Start ----------

    function init(retries) {
        var sources = extractSources();
        if (!sources.length || !injectPanel()) {
            if (retries > 0) setTimeout(function () { init(retries - 1); }, 500);
            return;
        }

        var sel = document.getElementById('cbd-quality');
        sel.innerHTML = '';
        sources.forEach(function (src, i) {
            var opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = src.label;
            sel.appendChild(opt);
        });

        document.getElementById('cbd-download').onclick = function () {
            startDownload(sources[parseInt(sel.value, 10) || 0]);
        };
        document.getElementById('cbd-tab').onclick = function () {
            openInTab(sources[parseInt(sel.value, 10) || 0].url);
        };
        document.getElementById('cbd-copy').onclick = function () {
            copyUrl(sources[parseInt(sel.value, 10) || 0].url);
        };
        document.getElementById('cbd-cancel').onclick = cancelDownload;

        GM_registerMenuCommand('Pobierz wideo', function () {
            startDownload(sources[parseInt(sel.value, 10) || 0]);
        });
    }

    init(40); // polling co 500 ms, max 20 s – odporność na wolne ładowanie playera
})();
