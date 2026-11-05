// ==UserScript==
// @name         Nudogram – sekwencyjny downloader galerii modelki
// @namespace    https://github.com/opencode-test/gallery-downloaders
// @version      1.2
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/gallery-downloaders/nudogram/nudogram-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/gallery-downloaders/nudogram/nudogram-downloader.user.js
// @description  Pobiera wszystkie zdjęcia modelki z nudogram.com (/models/<model>/, /s2/ … /sN/) SEKWENCYJNIE. Parsuje listę i strony zdjęć (img.img-content → /1000/), zapisuje <model>/<id>.jpg, ma zakres stron, historię pobrań, anulowanie i fallback blob z Referer.
// @match        *://nudogram.com/models/*
// @match        *://*.nudogram.com/models/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @connect      nudogram.com
// @connect      *.nudogram.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    console.log('[Nudogram] skrypt załadowany, adres:', location.href);

    // ==================================================================
    // KONFIGURACJA
    //
    // Fakty zweryfikowane 2026-11-03 na /models/miss-dxxx-1/:
    //  - lista jest paginowana: / , /s2/ … /s20/ (48 zdjęć na stronę),
    //  - kafelek prowadzi do /models/<model>/<id>/,
    //  - pełny obraz to <img class="img-content"> (opakowany w <a href>),
    //  - pełny plik ma ścieżkę /contents/<x>/<y>/<model>/1000/<model>_<id>.jpg,
    //  - /2000/, /1500/, /1200/, /orig/ zwracają 404 — bierzemy /1000/,
    //  - miniatury listy mają sufiks _280.jpg i NIE są pełnym obrazem.
    // ==================================================================
    var CFG = {
        // Pauzy dobrane tak, by nie prowokować rate-limitu (jeden plik naraz).
        przerwaStronaHtmlMs: 350,   // między stronami listy (paginacja)
        przerwaPlikMs: 500,         // między pobraniami plików
        przerwaBladMs: 2500,        // po błędzie (dłuższa przerwa)
        przerwaRetryHtmlMs: 1500,   // pierwszy retry HTML
        timeoutHtmlMs: 45000,
        timeoutPlikMs: 120000,
        maksStron: 500,             // bezpiecznik: nie pobieraj przypadkiem 5000 stron
        szacunekNaStrone: 48        // tylko do komunikatu przed startem
    };

    var KLUCZ_HISTORII = 'ndg-historia-pobran';
    var KLUCZ_POZYCJI = 'ndg-panel-pozycja';
    var KLUCZ_MINI = 'ndg-panel-mini';
    var KLUCZ_POMIJAJ = 'ndg-pomijaj-pobrane';
    var KLUCZ_AUTOSTART = 'ndg-autostart';

    // ==================================================================
    // STAN
    // ==================================================================
    var stan = {
        wTrakcie: false,
        anulowano: false,
        model: '',              // slug z URL, np. miss-dxxx-1
        modelFolder: '',        // slug po sanityzacji (folder na dysku)
        nazwaModelki: '',       // czytelna nazwa z nagłówka (tylko UI)
        maksStron: 1,
        biezacaStrona: 1,
        linkStron: {},          // nr strony -> URL z paginacji
        strony: [],             // [{nr, url}] wybrany zakres
        zdjecia: [],            // [{id, url, tytul, miniatura}]
        doPobrania: [],
        indeks: 0,
        pobrane: 0,
        pominiete: 0,
        bledy: 0,
        fallbacki: 0,
        biezacyXhr: null
    };

    // Uchwyty UI
    var elPanel, elNaglowek, elMini, elInfo, elLicznik, elOd, elDo,
        elStartAll, elStartRange, elAnuluj, elPomijaj, elPomijajTekst,
        elWyczysc, elStatus, elLog, elPasekStron, elPasekZdjec, elPasekPliku,
        elOpisStron, elOpisZdjec, elOpisPliku;

    // ==================================================================
    // MAŁE POMOCNIKI: magazyn, tekst, adresy
    // ==================================================================
    function gmGet(klucz, domyslna) {
        try {
            return (typeof GM_getValue === 'function') ? GM_getValue(klucz, domyslna) : domyslna;
        } catch (e) {
            return domyslna;
        }
    }

    function gmSet(klucz, wartosc) {
        try {
            if (typeof GM_setValue === 'function') GM_setValue(klucz, wartosc);
        } catch (e) { /* brak magazynu = brak pamięci ustawień */ }
    }

    function dekoduj(s) {
        try { return decodeURIComponent(s); } catch (e) { return s; }
    }

    // Sanityzacja nazw folderów/plików pod Windows.
    function oczyscNazwe(nazwa, maks) {
        maks = maks || 100;
        var w = String(nazwa == null ? '' : nazwa)
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, ' ')
            .replace(/[. ]+$/g, '')
            .trim();
        if (!w) w = 'bez-nazwy';
        if (w.length > maks) w = w.slice(0, maks).trim();
        return w;
    }

    function rozszerzenieZUrla(url) {
        var czysty = String(url || '').split('?')[0].split('#')[0];
        var m = czysty.match(/\.([a-z0-9]{2,5})$/i);
        return m ? m[1].toLowerCase() : '';
    }

    function urlStrony(model, nr) {
        var sciezka = '/models/' + encodeURIComponent(model) + '/';
        if (nr > 1) sciezka += 's' + nr + '/';
        return new URL(sciezka, location.origin).href;
    }

    // Zwraca {typ:'galeria'|'zdjecie', model, strona?, id?} albo null.
    function analizujSciezke() {
        var segmenty = location.pathname.split('/').filter(Boolean);
        if (segmenty.length < 2 || segmenty[0] !== 'models') return null;
        var model = dekoduj(segmenty[1]);
        if (!model) return null;

        if (segmenty.length === 2) {
            return { typ: 'galeria', model: model, strona: 1 };
        }
        if (segmenty.length === 3) {
            var mStrona = segmenty[2].match(/^s(\d+)$/i);
            if (mStrona) {
                return { typ: 'galeria', model: model, strona: parseInt(mStrona[1], 10) };
            }
            if (/^\d+$/.test(segmenty[2])) {
                return { typ: 'zdjecie', model: model, id: segmenty[2] };
            }
        }
        return null;
    }

    // Numer strony z linku paginacji; null, gdy to nie jest strona tej modelki.
    function numerStronyZUrl(href, model) {
        try {
            var u = new URL(href, location.href);
            var segmenty = u.pathname.split('/').filter(Boolean);
            if (segmenty.length < 2 || segmenty[0] !== 'models') return null;
            if (dekoduj(segmenty[1]) !== model) return null;
            if (segmenty.length === 2) return 1;
            if (segmenty.length === 3) {
                var m = segmenty[2].match(/^s(\d+)$/i);
                if (m) return parseInt(m[1], 10);
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    // Id zdjęcia z linku kafelka; null, gdy to nie jest zdjęcie tej modelki.
    function numerZdjeciaZUrl(href, model) {
        try {
            var u = new URL(href, location.href);
            var segmenty = u.pathname.split('/').filter(Boolean);
            if (segmenty.length !== 3 || segmenty[0] !== 'models') return null;
            if (dekoduj(segmenty[1]) !== model) return null;
            if (!/^\d+$/.test(segmenty[2])) return null;
            return { id: segmenty[2], url: u.href };
        } catch (e) {
            return null;
        }
    }

    // ==================================================================
    // HISTORIA POBRAŃ (GM_setValue)
    //
    // Userscript nie ma dostępu do dysku, więc „już pobrane” to wyłącznie
    // własna historia. Klucz wpisu: "<model>/<id>". Historia jest wspólna
    // dla wszystkich subdomen językowych (np. de.nudogram.com).
    // ==================================================================
    function wczytajHistorie() {
        try {
            var surowe = gmGet(KLUCZ_HISTORII, '{}');
            var dane = (typeof surowe === 'string') ? JSON.parse(surowe || '{}') : surowe;
            if (dane && typeof dane === 'object' && !Array.isArray(dane)) return dane;
            return {};
        } catch (e) {
            return {};
        }
    }

    function zapiszHistorie(historia) {
        gmSet(KLUCZ_HISTORII, JSON.stringify(historia || {}));
    }

    function kluczHistorii(model, id) {
        return model + '/' + id;
    }

    function czyPobrane(historia, model, id) {
        return !!(historia && historia[kluczHistorii(model, id)]);
    }

    function ileWHistorii(model) {
        var historia = wczytajHistorie();
        var prefiks = model + '/';
        var ile = 0;
        Object.keys(historia).forEach(function (k) {
            if (k.indexOf(prefiks) === 0) ile++;
        });
        return ile;
    }

    function oznaczPobrane(model, id, nazwa) {
        var historia = wczytajHistorie();
        historia[kluczHistorii(model, id)] = {
            data: new Date().toISOString().slice(0, 10),
            plik: nazwa
        };
        zapiszHistorie(historia);
        odswiezEtykietePomijania();
        odswiezLicznik();
    }

    function wyczyscHistorieModelu() {
        if (!stan.model) return;
        var ile = ileWHistorii(stan.model);
        if (!ile) {
            ustawStatus('Historia tej modelki jest już pusta.');
            return;
        }
        var zgoda = true;
        try {
            zgoda = window.confirm('Usunąć z historii ' + ile + ' zdjęć modelki ' + stan.model +
                '?\n\nPo usunięciu ponowne pobranie nadpisze pliki.');
        } catch (e) { zgoda = true; }
        if (!zgoda) return;

        var historia = wczytajHistorie();
        var prefiks = stan.model + '/';
        var usunieto = 0;
        Object.keys(historia).forEach(function (k) {
            if (k.indexOf(prefiks) === 0) {
                delete historia[k];
                usunieto++;
            }
        });
        zapiszHistorie(historia);
        odswiezEtykietePomijania();
        ustawStatus('Usunięto z historii: ' + usunieto + ' zdjęć modelki ' + stan.model + '.');
        dopiszLog('Wyczyszczono historię modelki (' + usunieto + ').');
    }

    // ==================================================================
    // ODCZYT STRONY: nazwa modelki, paginacja, kafelki
    // ==================================================================
    function odczytajNazweModelki(doc) {
        var naglowek = doc.querySelector('.headline h2, .headline h1, h1');
        var tekst = naglowek ? naglowek.textContent.replace(/\s+/g, ' ').trim() : '';
        tekst = tekst.replace(/\s+Nude Leaks OnlyFans.*$/i, '').trim();
        return tekst;
    }

    function odczytajPaginacje(doc, model) {
        var maks = 1;
        var biezaca = 1;
        var linki = {};

        var kotwice = doc.querySelectorAll('.pagination a[href], div.pagination a[href]');
        Array.prototype.forEach.call(kotwice, function (a) {
            var href = a.getAttribute('href');
            var nr = numerStronyZUrl(href, model);
            if (nr === null) return;
            if (nr > maks) maks = nr;
            if (!linki[nr]) {
                try {
                    linki[nr] = new URL(href, location.href).href;
                } catch (e) { /* niepoprawny href pomijamy */ }
            }
        });

        // Bieżąca strona: <li class="page"><span>5</span></li>
        var aktywna = doc.querySelector('.pagination li.page span, .pagination li.active span');
        if (aktywna) {
            var t = aktywna.textContent.trim();
            if (/^\d+$/.test(t)) {
                biezaca = parseInt(t, 10);
                if (biezaca > maks) maks = biezaca;
            }
        }

        // Numer z adresu (np. /s5/) jest pewniejszy niż dowolny span.
        var zAdresu = numerStronyZUrl(location.href, model);
        if (zAdresu !== null) {
            biezaca = zAdresu;
            if (biezaca > maks) maks = biezaca;
        }

        if (maks > CFG.maksStron) maks = CFG.maksStron;
        return { maks: maks, biezaca: biezaca, linki: linki };
    }

    function zbierzZdjecia(doc, model) {
        var wynik = [];
        var widziane = {};

        var kontener = doc.querySelector('#list_videos_common_videos_list_items') ||
                       doc.querySelector('.list-videos') ||
                       null;
        var kotwice = kontener ? Array.prototype.slice.call(kontener.querySelectorAll('a[href]')) : [];
        // Fallback: gdy strona ma inny kontener, skanujemy wszystkie linki,
        // ale i tak przepuszczamy je przez filtr dokładnej ścieżki /models/<model>/<id>/.
        if (!kotwice.length) {
            kotwice = Array.prototype.slice.call(doc.querySelectorAll('a[href]'));
        }

        kotwice.forEach(function (a) {
            var dane = numerZdjeciaZUrl(a.getAttribute('href'), model);
            if (!dane || widziane[dane.id]) return;
            widziane[dane.id] = true;

            var miniatura = '';
            var img = a.querySelector('img[src], img[data-src]');
            if (img) {
                var zrodloMiniatury = img.getAttribute('src') || img.getAttribute('data-src') || '';
                try {
                    miniatura = zrodloMiniatury ? new URL(zrodloMiniatury, location.origin).href : '';
                } catch (e) { miniatura = ''; }
            }

            var tytul = (a.getAttribute('title') || a.textContent || '').replace(/\s+/g, ' ').trim();
            wynik.push({ id: dane.id, url: dane.url, tytul: tytul, miniatura: miniatura });
        });

        return wynik;
    }

    // ==================================================================
    // PEŁNY URL OBRAZU
    //
    // Bierzemy <img class="img-content"> (lub <a href> wokół niego), a nie
    // miniaturę _280. Dodatkowo wymuszamy segment /1000/, bo wyższe
    // rozmiary (/2000/, /1500/, /1200/) zwracają 404.
    // ==================================================================
    function normalizujUrlObrazu(url) {
        if (!url) return '';
        try {
            var u = new URL(url, location.origin);
            if (!/\/contents\//.test(u.pathname)) return '';

            var segmenty = u.pathname.split('/');
            var plik = (segmenty[segmenty.length - 1] || '').replace(/_280(\.[a-z0-9]{2,5})$/i, '$1');
            if (!/\.[a-z0-9]{2,5}$/i.test(plik)) return '';

            // /contents/<x>/<y>/<model>/<rozmiar>/<plik>
            if (segmenty.length >= 6 && segmenty[1] === 'contents' && /^\d+$/.test(segmenty[segmenty.length - 2])) {
                segmenty[segmenty.length - 2] = '1000';
            }
            segmenty[segmenty.length - 1] = plik;
            u.pathname = segmenty.join('/');
            return u.href;
        } catch (e) {
            return '';
        }
    }

    // Źródło obrazu treści — na części stron TM obrazek ma tylko data-src.
    function zrodloImgContent(doc) {
        var img = doc.querySelector('img.img-content');
        if (!img) return '';
        return img.getAttribute('src') || img.getAttribute('data-src') || '';
    }

    function wyciagnijPelnyUrl(doc, zdjecie) {
        var img = doc.querySelector('img.img-content');
        var url = '';

        // Najpierw anchor wokół obrazu — często to dokładnie ten sam plik.
        if (img && img.closest) {
            var rodzic = img.closest('a[href]');
            var href = rodzic ? rodzic.getAttribute('href') : '';
            if (href && /\/contents\//.test(href)) url = href;
        }
        if (!url) url = zrodloImgContent(doc);
        if (!url) {
            var a = doc.querySelector('a[href*="/contents/"]');
            if (a) url = a.getAttribute('href') || '';
        }

        var pelny = normalizujUrlObrazu(url);
        if (!pelny && zdjecie && zdjecie.miniatura) {
            pelny = pelnyUrlZMiniatury(zdjecie.miniatura);
        }
        return pelny;
    }

    // Miniaturka listy ma /1000/..._280.jpg — po zdjęciu sufiksu otrzymujemy
    // ten sam pełny plik. To fallback, gdy strona zdjęcia nie odpowie.
    function pelnyUrlZMiniatury(src) {
        if (!src) return '';
        return normalizujUrlObrazu(String(src).replace(/_280(\.[a-z0-9]{2,5})(\?.*)?$/i, '$1$2'));
    }

    function czyWyzwanie(html) {
        return /Just a moment|cf-browser-verification|Attention Required|__cf_chl|challenge-platform/i
            .test(html || '');
    }

    // ==================================================================
    // XHR: HTML i BLOB
    // ==================================================================
    function xhrHtml(url, referer, cb) {
        var req = null;
        var zakonczone = false;

        // GM_xmlhttpRequest teoretycznie woła tylko jeden finał, ale przy
        // abort/error/timeout w niektórych wersjach TM lepiej zabezpieczyć się
        // przed podwójnym wywołaniem łańcucha.
        function odpowiedz(blad, html, resp) {
            if (zakonczone) return;
            zakonczone = true;
            cb(blad, html, resp);
        }

        try {
            req = GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': referer || location.href
                },
                timeout: CFG.timeoutHtmlMs,
                onload: function (resp) {
                    if (stan.biezacyXhr === req) stan.biezacyXhr = null;
                    if (resp && resp.status >= 200 && resp.status < 300) {
                        odpowiedz(null, resp.responseText || '', resp);
                    } else {
                        odpowiedz('HTTP ' + (resp ? resp.status : '?'), '', resp);
                    }
                },
                onerror: function () {
                    if (stan.biezacyXhr === req) stan.biezacyXhr = null;
                    odpowiedz('błąd sieci', '', null);
                },
                ontimeout: function () {
                    if (stan.biezacyXhr === req) stan.biezacyXhr = null;
                    odpowiedz('timeout', '', null);
                },
                onabort: function () {
                    if (stan.biezacyXhr === req) stan.biezacyXhr = null;
                    odpowiedz('przerwano', '', null);
                }
            });
            stan.biezacyXhr = req;
        } catch (e) {
            odpowiedz('wyjątek XHR: ' + ((e && e.message) || e), '', null);
        }
        return req;
    }

    // Dwa retry z rosnącym opóźnieniem. 404/410 nie ponawiamy.
    function pobierzHtmlZRetry(url, referer, cb, proby) {
        proby = (typeof proby === 'number') ? proby : 0;
        xhrHtml(url, referer, function (blad, html) {
            if (stan.anulowano) {
                cb('przerwano', '');
                return;
            }
            if (!blad && html) {
                cb(null, html);
                return;
            }
            if (blad && /HTTP (404|410)/.test(blad)) {
                cb(blad, '');
                return;
            }
            if (proby < 2) {
                // Przy 429/503 dajemy serwerowi wyraźnie więcej czasu.
                var czyLimit = /HTTP (429|503)/.test(blad || '');
                var baza = czyLimit ? 5000 : CFG.przerwaRetryHtmlMs;
                var opoznienie = baza * Math.pow(2, proby);
                ustawStatus('Ponawiam za ' + Math.round(opoznienie / 1000) + ' s (' + (blad || 'pusta odpowiedź') + ')…');
                setTimeout(function () {
                    pobierzHtmlZRetry(url, referer, cb, proby + 1);
                }, opoznienie);
                return;
            }
            cb(blad || 'pusta odpowiedź', '');
        });
    }

    function pobierzBlobem(url, nazwa, referer, cb) {
        var zakonczone = false;
        var req = null;

        function koniec(ok, info) {
            if (zakonczone) return;
            zakonczone = true;
            cb(ok, info);
        }

        function sprzatajBlob(blobUrl) {
            // Nie zwalniamy od razu — przeglądarka musi zdążyć zapisać plik.
            setTimeout(function () {
                try { URL.revokeObjectURL(blobUrl); } catch (e) { /* ignoruj */ }
            }, 30000);
        }

        try {
            req = GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Referer': referer || location.href,
                    'Accept': 'image/avif,image/webp,image/jpeg,image/*,*/*;q=0.8'
                },
                responseType: 'blob',
                timeout: CFG.timeoutPlikMs,
                onload: function (resp) {
                    if (stan.biezacyXhr === req) stan.biezacyXhr = null;

                    if (!resp || resp.status < 200 || resp.status >= 300) {
                        koniec(false, 'HTTP ' + (resp ? resp.status : '?'));
                        return;
                    }
                    var blob = resp.response;
                    if (!blob || !blob.size) {
                        koniec(false, 'pusty blob');
                        return;
                    }
                    // Ochrona przed zapisaniem strony błędu jako .jpg
                    if (blob.type && /^(text\/html|text\/plain|application\/json)/i.test(blob.type)) {
                        koniec(false, 'serwer zwrócił ' + blob.type + ' zamiast obrazu');
                        return;
                    }

                    var blobUrl = URL.createObjectURL(blob);
                    try {
                        GM_download({
                            url: blobUrl,
                            name: nazwa,
                            saveAs: false,
                            conflictAction: 'overwrite',
                            timeout: CFG.timeoutPlikMs,
                            onload: function () {
                                sprzatajBlob(blobUrl);
                                koniec(true, 'blob');
                            },
                            onerror: function (err) {
                                sprzatajBlob(blobUrl);
                                var opis = err && (err.error || err.details) ? (err.error || err.details) : 'nieznany';
                                koniec(false, 'blob GM_download: ' + opis);
                            },
                            ontimeout: function () {
                                sprzatajBlob(blobUrl);
                                koniec(false, 'blob timeout');
                            }
                        });
                    } catch (e) {
                        // Ostateczność: zwykły link download. Traci podfolder,
                        // ale ratuje plik, gdy TM odmówi zapisu blob URL.
                        try {
                            var a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = String(nazwa).replace(/^.*\//, '');
                            a.style.display = 'none';
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(function () {
                                try { a.remove(); } catch (e2) { /* ignoruj */ }
                            }, 1000);
                            sprzatajBlob(blobUrl);
                            koniec(true, 'anchor');
                        } catch (e3) {
                            sprzatajBlob(blobUrl);
                            koniec(false, 'blob: ' + ((e3 && e3.message) || e3));
                        }
                    }
                },
                onerror: function () {
                    if (stan.biezacyXhr === req) stan.biezacyXhr = null;
                    koniec(false, 'błąd sieci');
                },
                ontimeout: function () {
                    if (stan.biezacyXhr === req) stan.biezacyXhr = null;
                    koniec(false, 'timeout');
                },
                onabort: function () {
                    if (stan.biezacyXhr === req) stan.biezacyXhr = null;
                    koniec(false, 'przerwano');
                }
            });
            stan.biezacyXhr = req;
        } catch (e) {
            koniec(false, 'wyjątek XHR: ' + ((e && e.message) || e));
        }
    }

    // ==================================================================
    // POBIERANIE JEDNEGO PLIKU
    //
    // 1) GM_download (bez ładowania do RAM),
    // 2) przy błędzie/403: GM_xmlhttpRequest jako blob z Referer,
    // 3) ostateczność: <a download> (bez podfolderu).
    // ==================================================================
    function pobierzPlik(url, nazwa, referer, cb) {
        var zakonczone = false;

        function koniec(ok, info) {
            if (zakonczone) return;
            zakonczone = true;
            cb(ok, info);
        }

        function fallback(powod) {
            dopiszLog('GM_download: ' + powod + ' — fallback blob z Referer…');
            ustawStatus('Fallback blob: ' + String(nazwa).split('/').pop());
            pobierzBlobem(url, nazwa, referer, function (ok, info) {
                if (ok) stan.fallbacki++;
                koniec(ok, ok ? 'blob' : ('blob: ' + info));
            });
        }

        try {
            GM_download({
                url: url,
                name: nazwa,
                saveAs: false,                    // bez dialogu przy każdym pliku
                conflictAction: 'overwrite',      // powtórka nadpisuje stary plik
                timeout: CFG.timeoutPlikMs,
                onload: function () {
                    ustawPostepPliku(100);
                    koniec(true, 'gm');
                },
                onprogress: function (e) {
                    if (e && e.total > 0 && e.loaded >= 0) {
                        ustawPostepPliku(e.loaded / e.total * 100);
                    }
                },
                onerror: function (err) {
                    var opis = 'nieznany';
                    if (err) {
                        opis = err.error || err.details || 'nieznany';
                        if (err.error && err.details) opis += ' / ' + err.details;
                    }
                    fallback('błąd ' + opis);
                },
                ontimeout: function () {
                    fallback('timeout');
                }
            });
        } catch (e) {
            fallback('wyjątek: ' + ((e && e.message) || e));
        }
    }

    // ==================================================================
    // ETAP 1: CZYTANIE STRON LISTY I ZBIERANIE ID ZDJĘĆ
    // ==================================================================
    function etapZbierania(cb) {
        stan.zdjecia = [];
        var widziane = {};
        var indeks = 0;
        var bledneStrony = 0;

        function nastepnaStrona() {
            if (stan.anulowano) {
                cb(false);
                return;
            }
            if (indeks >= stan.strony.length) {
                if (bledneStrony) dopiszLog('Strony z błędami: ' + bledneStrony + '.');
                cb(true);
                return;
            }

            var strona = stan.strony[indeks];
            ustawStatus('Etap 1/2 — czytam stronę ' + strona.nr + ' (' + (indeks + 1) + '/' + stan.strony.length + ')…');
            ustawPostepStron(indeks, stan.strony.length);

            function przetworzHtml(doc, zrodlo) {
                var zdjecia = [];
                try {
                    zdjecia = zbierzZdjecia(doc, stan.model);
                } catch (e) {
                    dopiszLog('Błąd parsowania strony ' + strona.nr + ': ' + ((e && e.message) || e));
                }

                var nowe = 0;
                zdjecia.forEach(function (z) {
                    if (widziane[z.id]) return;
                    widziane[z.id] = true;
                    stan.zdjecia.push(z);
                    nowe++;
                });

                dopiszLog('Strona ' + strona.nr + ' (' + zrodlo + '): ' + zdjecia.length +
                    ' zdjęć, nowych: ' + nowe + ', razem: ' + stan.zdjecia.length + '.');
                indeks++;
                ustawPostepStron(indeks, stan.strony.length);
                ustawLicznik();
                setTimeout(nastepnaStrona, CFG.przerwaStronaHtmlMs);
            }

            // Bieżącą stronę (jeśli jest w zakresie) mamy już w DOM — oszczędzamy XHR.
            if (strona.nr === stan.biezacaStrona &&
                document.querySelector('#list_videos_common_videos_list_items .item, .list-videos .item')) {
                przetworzHtml(document, 'DOM');
                return;
            }

            pobierzHtmlZRetry(strona.url, location.href, function (blad, html) {
                if (stan.anulowano) {
                    cb(false);
                    return;
                }
                if (blad || !html) {
                    bledneStrony++;
                    dopiszLog('Błąd strony ' + strona.nr + ': ' + (blad || 'pusta odpowiedź') + ' — pomijam.');
                    indeks++;
                    ustawPostepStron(indeks, stan.strony.length);
                    setTimeout(nastepnaStrona, CFG.przerwaStronaHtmlMs);
                    return;
                }
                if (czyWyzwanie(html)) {
                    dopiszLog('Strona ' + strona.nr + ': wygląda na wyzwanie Cloudflare. ' +
                        'Otwórz ją w karcie i spróbuj ponownie.');
                }
                var doc;
                try {
                    doc = new DOMParser().parseFromString(html, 'text/html');
                } catch (e) {
                    bledneStrony++;
                    dopiszLog('Nie udało się sparsować strony ' + strona.nr + ': ' + ((e && e.message) || e));
                    indeks++;
                    ustawPostepStron(indeks, stan.strony.length);
                    setTimeout(nastepnaStrona, CFG.przerwaStronaHtmlMs);
                    return;
                }
                przetworzHtml(doc, 'XHR');
            });
        }

        nastepnaStrona();
    }

    // ==================================================================
    // ETAP 2: SEKWENCYJNE POBIERANIE (strona zdjęcia → plik → następne)
    // ==================================================================
    function etapPobierania() {
        var historia = wczytajHistorie();
        var pomijaj = !elPomijaj || elPomijaj.checked;

        stan.doPobrania = [];
        stan.pominiete = 0;
        stan.zdjecia.forEach(function (z) {
            if (pomijaj && czyPobrane(historia, stan.model, z.id)) {
                stan.pominiete++;
            } else {
                stan.doPobrania.push(z);
            }
        });

        ustawLicznik();
        if (!stan.doPobrania.length) {
            zakoncz('Wszystkie zdjęcia z zakresu są już w historii (' + stan.pominiete + ').');
            return;
        }

        dopiszLog('Do pobrania: ' + stan.doPobrania.length +
            ', pominięto z historii: ' + stan.pominiete + '.');
        stan.indeks = 0;
        ustawPostepZdjec(0, stan.doPobrania.length);
        pobierzKolejne();
    }

    function zakonczZdjecie(ok, opis) {
        if (ok) {
            stan.pobrane++;
            dopiszLog('OK ' + (opis || ''));
        } else {
            stan.bledy++;
            dopiszLog('BŁĄD: ' + (opis || 'nieznany'));
        }
        stan.indeks++;
        ustawPostepZdjec(stan.indeks, stan.doPobrania.length);
        ustawLicznik();
        // Po błędzie dajemy serwerowi odetchnąć, po sukcesie zwykła pauza.
        setTimeout(pobierzKolejne, ok ? CFG.przerwaPlikMs : CFG.przerwaBladMs);
    }

    function pobierzKolejne() {
        if (!stan.wTrakcie) return;
        if (stan.anulowano) {
            zakoncz('Przerwano przez użytkownika.');
            return;
        }
        if (stan.indeks >= stan.doPobrania.length) {
            zakoncz('Gotowe.');
            return;
        }

        var z = stan.doPobrania[stan.indeks];
        var nr = stan.indeks + 1;
        var razem = stan.doPobrania.length;

        ustawStatus('Etap 2/2 — zdjęcie ' + nr + '/' + razem + ': czytam stronę /' + z.id + '/…');
        ustawPostepPliku(0);

        pobierzHtmlZRetry(z.url, location.href, function (blad, html) {
            if (!stan.wTrakcie) return;
            if (stan.anulowano) {
                zakoncz('Przerwano przez użytkownika.');
                return;
            }

            var urlPliku = '';
            var zrodlo = '';

            if (!blad && html) {
                try {
                    urlPliku = wyciagnijPelnyUrl(new DOMParser().parseFromString(html, 'text/html'), z);
                    if (urlPliku) zrodlo = 'img-content';
                } catch (e) {
                    dopiszLog('Błąd parsowania /' + z.id + '/: ' + ((e && e.message) || e));
                }
                if (!urlPliku && czyWyzwanie(html)) {
                    dopiszLog('Cloudflare na /' + z.id + '/ — próbuję URL z miniatury.');
                }
            }

            // Fallback: pełny URL da się odtworzyć z miniatury (_280 → pełny).
            if (!urlPliku) {
                urlPliku = pelnyUrlZMiniatury(z.miniatura);
                if (urlPliku) zrodlo = 'miniatura';
            }

            if (!urlPliku) {
                zakonczZdjecie(false, 'id ' + z.id + ' — brak img.img-content (' +
                    (blad || 'pusta strona') + '), brak miniatury do fallbacku');
                return;
            }
            if (zrodlo === 'miniatura') {
                dopiszLog('Zdjęcie ' + z.id + ': źródło = miniatura (strona nie dała img.img-content).');
            }

            var ext = rozszerzenieZUrla(urlPliku) || 'jpg';
            var nazwa = stan.modelFolder + '/' + z.id + '.' + ext;

            ustawStatus('Etap 2/2 — zdjęcie ' + nr + '/' + razem + ': pobieram ' + z.id + '.' + ext + '…');
            pobierzPlik(urlPliku, nazwa, z.url, function (ok, info) {
                if (!stan.wTrakcie) return;
                if (stan.anulowano) {
                    zakoncz('Przerwano przez użytkownika.');
                    return;
                }
                if (ok) {
                    oznaczPobrane(stan.model, z.id, nazwa);
                    zakonczZdjecie(true, nazwa + (info && info !== 'gm' ? ' (' + info + ')' : ''));
                } else {
                    zakonczZdjecie(false, nazwa + ' — ' + info);
                }
            });
        });
    }

    // ==================================================================
    // PANEL
    // ==================================================================
    function zrobPrzycisk(tekst, tytul, wyrozniony) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = tekst;
        b.title = tytul || '';
        b.style.cssText = 'padding:6px 8px;cursor:pointer;border:1px solid #5a5a5a;border-radius:5px;' +
            'background:' + (wyrozniony ? '#2f5d34' : '#2f2f2f') + ';color:#eee;' +
            'font:12px Arial,sans-serif;';
        return b;
    }

    function zrobPasek(kolor) {
        var tor = document.createElement('div');
        tor.style.cssText = 'background:#333;border:1px solid #3d3d3d;border-radius:4px;' +
            'height:10px;overflow:hidden;';
        var wypelnienie = document.createElement('div');
        wypelnienie.style.cssText = 'background:' + kolor + ';height:100%;width:0%;transition:width .2s;';
        tor.appendChild(wypelnienie);
        return { tor: tor, wypelnienie: wypelnienie };
    }

    function zbudujPanel() {
        if (document.getElementById('ndg-panel')) return;

        var panel = document.createElement('div');
        panel.id = 'ndg-panel';
        panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;' +
            'background:#161616;color:#eee;font:13px/1.45 Arial,sans-serif;' +
            'border:1px solid #4a4a4a;border-radius:8px;padding:10px 12px;width:340px;' +
            'max-height:92vh;box-sizing:border-box;box-shadow:0 4px 18px rgba(0,0,0,.65);' +
            'display:flex;flex-direction:column;gap:6px;color-scheme:dark;';
        elPanel = panel;

        // Nagłówek (uchwyt przeciągania)
        var naglowek = document.createElement('div');
        naglowek.id = 'ndg-naglowek';
        naglowek.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:bold;' +
            'cursor:move;user-select:none;-webkit-user-select:none;touch-action:none;';
        var tytul = document.createElement('span');
        tytul.style.cssText = 'flex:1;';
        tytul.textContent = 'Nudogram — galeria modelki';
        naglowek.appendChild(tytul);

        elMini = document.createElement('button');
        elMini.type = 'button';
        elMini.title = 'Zwiń panel do zakładki';
        elMini.textContent = '—';
        elMini.style.cssText = 'padding:0 8px;cursor:pointer;font-size:13px;line-height:1.6;' +
            'border:1px solid #5a5a5a;border-radius:4px;background:#2f2f2f;color:#eee;';
        naglowek.appendChild(elMini);
        panel.appendChild(naglowek);
        elNaglowek = naglowek;

        elMini.addEventListener('click', function () {
            ustawMini(!(panel.dataset.mini === '1'));
        });

        // Informacje o modelce
        elInfo = document.createElement('div');
        elInfo.style.cssText = 'font-size:12px;color:#bbb;word-break:break-word;';
        elInfo.textContent = stan.modelFolder +
            (stan.nazwaModelki ? ' — ' + stan.nazwaModelki : '') +
            ' · stron: ' + stan.maksStron;
        panel.appendChild(elInfo);

        // Wybór zakresu stron
        var wierszZakresu = document.createElement('div');
        wierszZakresu.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:12px;';

        var etykieta = document.createElement('span');
        etykieta.textContent = 'Strony:';
        wierszZakresu.appendChild(etykieta);

        function zrobPoleLiczbowe(wartosc) {
            var i = document.createElement('input');
            i.type = 'number';
            i.min = '1';
            i.max = String(stan.maksStron);
            i.value = String(wartosc);
            i.style.cssText = 'width:52px;padding:2px 4px;background:#262626;color:#eee;' +
                'border:1px solid #555;border-radius:4px;font:12px Arial,sans-serif;';
            return i;
        }

        elOd = zrobPoleLiczbowe(1);
        elDo = zrobPoleLiczbowe(stan.maksStron);
        wierszZakresu.appendChild(elOd);
        var myslnik = document.createElement('span');
        myslnik.textContent = '–';
        wierszZakresu.appendChild(myslnik);
        wierszZakresu.appendChild(elDo);

        var zMaks = document.createElement('span');
        zMaks.style.cssText = 'color:#999;';
        zMaks.textContent = 'z ' + stan.maksStron;
        wierszZakresu.appendChild(zMaks);
        panel.appendChild(wierszZakresu);

        // Skróty zakresu
        var wierszSkrotow = document.createElement('div');
        wierszSkrotow.style.cssText = 'display:flex;gap:6px;';

        var btnCaly = zrobPrzycisk('Cały zakres', 'Ustaw 1–' + stan.maksStron);
        btnCaly.style.flex = '1';
        btnCaly.addEventListener('click', function () {
            if (elOd) elOd.value = '1';
            if (elDo) elDo.value = String(stan.maksStron);
        });
        wierszSkrotow.appendChild(btnCaly);

        var btnBiezaca = zrobPrzycisk('Bieżąca strona', 'Ustaw tylko stronę, na której jesteś');
        btnBiezaca.style.flex = '1';
        btnBiezaca.addEventListener('click', function () {
            var nr = stan.biezacaStrona || 1;
            if (elOd) elOd.value = String(nr);
            if (elDo) elDo.value = String(nr);
        });
        wierszSkrotow.appendChild(btnBiezaca);
        panel.appendChild(wierszSkrotow);

        // Przyciski startu
        elStartAll = zrobPrzycisk('⬇ Pobierz wszystko (1–' + stan.maksStron + ')',
            'Pobierz całą galerię modelki', true);
        elStartAll.style.width = '100%';
        elStartAll.addEventListener('click', function () { start(true, false); });
        panel.appendChild(elStartAll);

        elStartRange = zrobPrzycisk('⬇ Pobierz zakres stron', 'Pobierz tylko wybrane strony', false);
        elStartRange.style.width = '100%';
        elStartRange.addEventListener('click', function () { start(false, false); });
        panel.appendChild(elStartRange);

        elAnuluj = zrobPrzycisk('✖ Anuluj (po bieżącym żądaniu)', 'Przerywa kolejkę i bieżący XHR', false);
        elAnuluj.style.width = '100%';
        elAnuluj.disabled = true;
        elAnuluj.style.opacity = '.5';
        elAnuluj.addEventListener('click', anuluj);
        panel.appendChild(elAnuluj);

        // Historia / pomijanie duplikatów
        var wierszPomijaj = document.createElement('label');
        wierszPomijaj.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;';
        elPomijaj = document.createElement('input');
        elPomijaj.type = 'checkbox';
        elPomijaj.checked = gmGet(KLUCZ_POMIJAJ, '1') !== '0';
        elPomijaj.addEventListener('change', function () {
            gmSet(KLUCZ_POMIJAJ, elPomijaj.checked ? '1' : '0');
            odswiezEtykietePomijania();
        });
        wierszPomijaj.appendChild(elPomijaj);
        elPomijajTekst = document.createElement('span');
        wierszPomijaj.appendChild(elPomijajTekst);
        panel.appendChild(wierszPomijaj);

        elWyczysc = zrobPrzycisk('🗑 Wyczyść historię tej modelki', 'Usuwa wpisy tej modelki z historii', false);
        elWyczysc.style.width = '100%';
        elWyczysc.addEventListener('click', wyczyscHistorieModelu);
        panel.appendChild(elWyczysc);

        // Pasek: strony listy
        elOpisStron = document.createElement('div');
        elOpisStron.style.cssText = 'font-size:11px;color:#aaa;';
        elOpisStron.textContent = 'Lista zdjęć (strony): 0/0';
        panel.appendChild(elOpisStron);
        elPasekStron = zrobPasek('#2196f3').tor;
        panel.appendChild(elPasekStron);

        // Pasek: zdjęcia
        elOpisZdjec = document.createElement('div');
        elOpisZdjec.style.cssText = 'font-size:11px;color:#aaa;';
        elOpisZdjec.textContent = 'Pobieranie: 0/0';
        panel.appendChild(elOpisZdjec);
        elPasekZdjec = zrobPasek('#4caf50').tor;
        panel.appendChild(elPasekZdjec);

        // Pasek: bieżący plik
        elOpisPliku = document.createElement('div');
        elOpisPliku.style.cssText = 'font-size:11px;color:#aaa;';
        elOpisPliku.textContent = 'Bieżący plik: –';
        panel.appendChild(elOpisPliku);
        elPasekPliku = zrobPasek('#ff9800').tor;
        panel.appendChild(elPasekPliku);

        // Licznik i status
        elLicznik = document.createElement('div');
        elLicznik.style.cssText = 'font-size:11px;color:#9ccc65;';
        elLicznik.textContent = 'Pobrane: 0 · pominięte: 0 · błędy: 0';
        panel.appendChild(elLicznik);

        elStatus = document.createElement('div');
        elStatus.style.cssText = 'font-size:12px;color:#ddd;word-break:break-word;';
        elStatus.textContent = 'Gotowy.';
        panel.appendChild(elStatus);

        elLog = document.createElement('div');
        elLog.style.cssText = 'font-size:11px;color:#999;white-space:pre-wrap;overflow-y:auto;' +
            'max-height:96px;border-top:1px solid #333;padding-top:4px;';
        panel.appendChild(elLog);

        var stopka = document.createElement('div');
        stopka.style.cssText = 'font-size:10px;color:#777;';
        stopka.textContent = 'Zapis: ' + stan.modelFolder + '/<id>.jpg (folder pobierania przeglądarki)';
        panel.appendChild(stopka);

        document.body.appendChild(panel);

        // Przeciąganie + przywrócenie pozycji i stanu zwinięcia
        udragnijPanel(panel, naglowek);
        przywrocPozycjePanelu(panel);
        ustawMini(gmGet(KLUCZ_MINI, '') === '1');

        odswiezEtykietePomijania();
        odswiezLicznik();
        ustawPostepStron(0, 0);
        ustawPostepZdjec(0, 0);
        ustawPostepPliku(0);
    }

    // ------------------------------------------------------------------
    // Przeciąganie panelu za nagłówek (mysz + dotyk) i zapamiętanie pozycji
    // ------------------------------------------------------------------
    function przywrocPozycjePanelu(panel) {
        try {
            var surowe = gmGet(KLUCZ_POZYCJI, '');
            if (!surowe) return;
            var poz = JSON.parse(surowe);
            if (typeof poz.left !== 'number' || typeof poz.top !== 'number') return;
            var maxL = Math.max(0, window.innerWidth - 60);
            var maxT = Math.max(0, window.innerHeight - 30);
            panel.style.left = Math.min(Math.max(0, poz.left), maxL) + 'px';
            panel.style.top = Math.min(Math.max(0, poz.top), maxT) + 'px';
            panel.style.right = 'auto';
            panel.dataset.przeciagniety = '1';
        } catch (e) { /* brak zapisanej pozycji = domyślny róg */ }
    }

    function udragnijPanel(panel, uchwyt) {
        var startX = 0, startY = 0, startL = 0, startT = 0, trwa = false;

        function start(clientX, clientY) {
            var r = panel.getBoundingClientRect();
            panel.style.left = r.left + 'px';
            panel.style.top = r.top + 'px';
            panel.style.right = 'auto';
            startX = clientX;
            startY = clientY;
            startL = r.left;
            startT = r.top;
            trwa = true;
        }

        function ruch(clientX, clientY) {
            if (!trwa) return;
            var maxL = Math.max(0, window.innerWidth - 60);
            var maxT = Math.max(0, window.innerHeight - 30);
            var l = Math.min(Math.max(0, startL + clientX - startX), maxL);
            var t = Math.min(Math.max(0, startT + clientY - startY), maxT);
            panel.style.left = l + 'px';
            panel.style.top = t + 'px';
            panel.dataset.przeciagniety = '1';
        }

        function zapisz() {
            if (!trwa) return;
            trwa = false;
            try {
                gmSet(KLUCZ_POZYCJI, JSON.stringify({
                    left: parseFloat(panel.style.left) || 0,
                    top: parseFloat(panel.style.top) || 0
                }));
            } catch (e) { /* brak magazynu */ }
        }

        uchwyt.addEventListener('mousedown', function (e) {
            if (e.target && e.target.closest && e.target.closest('button')) return;
            if (e.button !== 0) return;
            e.preventDefault();
            start(e.clientX, e.clientY);
            document.addEventListener('mousemove', naRuch);
            document.addEventListener('mouseup', naPuszczenie, { once: true });
        });

        function naRuch(e) { ruch(e.clientX, e.clientY); }
        function naPuszczenie() {
            document.removeEventListener('mousemove', naRuch);
            zapisz();
        }

        uchwyt.addEventListener('touchstart', function (e) {
            if (e.target && e.target.closest && e.target.closest('button')) return;
            if (!e.touches || e.touches.length !== 1) return;
            start(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        uchwyt.addEventListener('touchmove', function (e) {
            if (!trwa || !e.touches || e.touches.length !== 1) return;
            if (e.cancelable) e.preventDefault();
            ruch(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        uchwyt.addEventListener('touchend', zapisz);

        // Dwuklik nagłówka = powrót do prawego górnego rogu
        uchwyt.addEventListener('dblclick', function (e) {
            if (e.target && e.target.closest && e.target.closest('button')) return;
            panel.style.left = '';
            panel.style.top = '';
            panel.style.right = '12px';
            panel.dataset.przeciagniety = '';
            gmSet(KLUCZ_POZYCJI, '');
            if (panel.dataset.mini === '1') ustawMini(true);
        });
    }

    function ustawMini(zminimalizowany) {
        var panel = document.getElementById('ndg-panel');
        if (!panel) return;
        panel.dataset.mini = zminimalizowany ? '1' : '';
        Array.prototype.forEach.call(panel.children, function (dziecko) {
            if (dziecko.id !== 'ndg-naglowek') dziecko.style.display = zminimalizowany ? 'none' : '';
        });
        panel.style.width = zminimalizowany ? 'auto' : '340px';
        panel.style.padding = zminimalizowany ? '4px 8px' : '10px 12px';
        if (panel.dataset.przeciagniety === '1') {
            panel.style.right = 'auto';
        } else {
            panel.style.right = zminimalizowany ? '0' : '12px';
        }
        if (elMini) {
            elMini.textContent = zminimalizowany ? '▸' : '—';
            elMini.title = zminimalizowany ? 'Rozwiń panel' : 'Zwiń panel do zakładki';
        }
        gmSet(KLUCZ_MINI, zminimalizowany ? '1' : '');
    }

    // ------------------------------------------------------------------
    // Aktualizacja UI
    // ------------------------------------------------------------------
    function ustawStatus(txt) {
        if (elStatus) elStatus.textContent = txt;
    }

    function dopiszLog(txt) {
        var linia = '[' + new Date().toLocaleTimeString() + '] ' + txt;
        try { console.log('[Nudogram] ' + txt); } catch (e) { /* ignoruj */ }
        if (!elLog) return;
        elLog.textContent += (elLog.textContent ? '\n' : '') + linia;
        var linie = elLog.textContent.split('\n');
        if (linie.length > 60) {
            elLog.textContent = linie.slice(-60).join('\n');
        }
        elLog.scrollTop = elLog.scrollHeight;
    }

    function ustawPostepStron(zrobione, razem) {
        var procent = razem > 0 ? (zrobione / razem * 100) : 0;
        if (elPasekStron) elPasekStron.firstChild.style.width = procent.toFixed(1) + '%';
        if (elOpisStron) elOpisStron.textContent = 'Lista zdjęć (strony): ' + zrobione + '/' + razem;
    }

    function ustawPostepZdjec(zrobione, razem) {
        var procent = razem > 0 ? (zrobione / razem * 100) : 0;
        if (elPasekZdjec) elPasekZdjec.firstChild.style.width = procent.toFixed(1) + '%';
        if (elOpisZdjec) elOpisZdjec.textContent = 'Pobieranie: ' + zrobione + '/' + razem;
    }

    function ustawPostepPliku(procent) {
        procent = Math.max(0, Math.min(100, Number(procent) || 0));
        if (elPasekPliku) elPasekPliku.firstChild.style.width = procent.toFixed(1) + '%';
        if (elOpisPliku) {
            elOpisPliku.textContent = 'Bieżący plik: ' +
                (procent > 0 ? procent.toFixed(0) + '%' : '–');
        }
    }

    function ustawLicznik() {
        if (!elLicznik) return;
        var txt = 'Pobrane: ' + stan.pobrane + ' · pominięte: ' + stan.pominiete +
            ' · błędy: ' + stan.bledy;
        if (stan.fallbacki) txt += ' · fallback: ' + stan.fallbacki;
        elLicznik.textContent = txt;
    }

    function odswiezLicznik() {
        ustawLicznik();
    }

    function odswiezEtykietePomijania() {
        if (!elPomijajTekst) return;
        var ile = stan.model ? ileWHistorii(stan.model) : 0;
        elPomijajTekst.textContent = 'Pomijaj już pobrane (historia: ' + ile + ')';
    }

    function ustawPrzyciski(aktywny) {
        if (elStartAll) {
            elStartAll.disabled = aktywny;
            elStartAll.style.opacity = aktywny ? '.5' : '1';
        }
        if (elStartRange) {
            elStartRange.disabled = aktywny;
            elStartRange.style.opacity = aktywny ? '.5' : '1';
        }
        if (elAnuluj) {
            elAnuluj.disabled = !aktywny;
            elAnuluj.style.opacity = aktywny ? '1' : '.5';
        }
        if (elOd) elOd.disabled = aktywny;
        if (elDo) elDo.disabled = aktywny;
    }

    // ------------------------------------------------------------------
    // Start / anulowanie / zakończenie
    // ------------------------------------------------------------------
    function pobierzZakresZUI() {
        var od = parseInt(elOd ? elOd.value : '1', 10);
        var doNr = parseInt(elDo ? elDo.value : String(stan.maksStron), 10);

        if (!isFinite(od) || od < 1) od = 1;
        if (!isFinite(doNr) || doNr < 1) doNr = stan.maksStron;
        // Najpierw przytnij do rzeczywistego zakresu, potem zamień strony,
        // inaczej np. od=100, do=200 przy 20 stronach dałoby odwrócony zakres.
        if (od > stan.maksStron) od = stan.maksStron;
        if (doNr > stan.maksStron) doNr = stan.maksStron;
        if (od > doNr) {
            var tmp = od;
            od = doNr;
            doNr = tmp;
        }
        if (doNr - od + 1 > CFG.maksStron) doNr = od + CFG.maksStron - 1;
        return { od: od, do: doNr };
    }

    function start(wszystkie, cicho) {
        if (stan.wTrakcie || !stan.model) return;

        var zakres = wszystkie ? { od: 1, do: stan.maksStron } : pobierzZakresZUI();
        if (elOd) elOd.value = String(zakres.od);
        if (elDo) elDo.value = String(zakres.do);

        var ileStron = zakres.do - zakres.od + 1;
        var szacunek = ileStron * CFG.szacunekNaStrone;

        // Bezpiecznik przy „Pobierz wszystko”: setki plików jednym klikiem.
        if (!cicho && wszystkie && ileStron > 2) {
            var zgoda = true;
            try {
                zgoda = window.confirm('Pobrać całą galerię modelki ' + stan.model + '?\n\n' +
                    'Strony: ' + zakres.od + '–' + zakres.do + ' (' + ileStron + '), ' +
                    'szacunkowo do ' + szacunek + ' zdjęć.\n\n' +
                    'Pliki zapiszą się w folderze „' + stan.modelFolder + '/” ' +
                    '(w folderze pobierania przeglądarki).');
            } catch (e) { zgoda = true; }
            if (!zgoda) {
                ustawStatus('Anulowano start.');
                return;
            }
        }

        // Reset liczników
        stan.wTrakcie = true;
        stan.anulowano = false;
        stan.pobrane = 0;
        stan.pominiete = 0;
        stan.bledy = 0;
        stan.fallbacki = 0;
        stan.indeks = 0;
        stan.zdjecia = [];
        stan.doPobrania = [];
        stan.strony = zbudujListeStron(zakres);
        stan.biezacyXhr = null;

        ustawPrzyciski(true);
        ustawPostepStron(0, stan.strony.length);
        ustawPostepZdjec(0, 0);
        ustawPostepPliku(0);
        ustawLicznik();
        ustawStatus('Start: ' + stan.modelFolder + ', strony ' + zakres.od + '–' + zakres.do + '…');
        dopiszLog('START — model: ' + stan.model + ', zakres stron: ' + zakres.od + '–' + zakres.do +
            ' (' + ileStron + ').');

        etapZbierania(function (ok) {
            if (!ok || stan.anulowano) {
                zakoncz('Przerwano podczas zbierania listy zdjęć.');
                return;
            }
            if (!stan.zdjecia.length) {
                zakoncz('Nie znaleziono zdjęć w wybranym zakresie stron.');
                return;
            }
            dopiszLog('Zebrano ' + stan.zdjecia.length + ' unikalnych zdjęć.');
            etapPobierania();
        });
    }

    function zbudujListeStron(zakres) {
        var wynik = [];
        for (var nr = zakres.od; nr <= zakres.do; nr++) {
            wynik.push({
                nr: nr,
                url: stan.linkStron[nr] || urlStrony(stan.model, nr)
            });
        }
        return wynik;
    }

    function anuluj() {
        if (!stan.wTrakcie) return;
        stan.anulowano = true;
        ustawStatus('Anulowanie… przerywam bieżące żądanie.');
        dopiszLog('Kliknięto Anuluj.');
        if (elAnuluj) {
            elAnuluj.disabled = true;
            elAnuluj.style.opacity = '.5';
        }
        if (stan.biezacyXhr) {
            try { stan.biezacyXhr.abort(); } catch (e) { /* ignoruj */ }
            stan.biezacyXhr = null;
        }
        // Jeśli akurat trwa GM_download (bez uchwytu abort), kolejka zatrzyma
        // się po jego zakończeniu — dlatego przycisk mówi „po bieżącym żądaniu”.
    }

    function zakoncz(powod) {
        if (!stan.wTrakcie) return;
        stan.wTrakcie = false;
        stan.anulowano = false;
        stan.biezacyXhr = null;
        ustawPrzyciski(false);
        ustawPostepPliku(0);

        var podsumowanie = 'pobrane: ' + stan.pobrane +
            ', pominięte: ' + stan.pominiete +
            ', błędy: ' + stan.bledy +
            (stan.fallbacki ? ', fallback blob: ' + stan.fallbacki : '');
        ustawStatus((powod ? powod + ' ' : '') + 'Podsumowanie — ' + podsumowanie + '.');
        dopiszLog('KONIEC — ' + podsumowanie + '.');
        odswiezEtykietePomijania();

        try {
            if (typeof GM_notification === 'function' && stan.pobrane > 0) {
                GM_notification({
                    title: 'Nudogram — ' + stan.model,
                    text: 'Pobrano ' + stan.pobrane + ' zdjęć' +
                        (stan.bledy ? ' (błędy: ' + stan.bledy + ')' : '') + '.',
                    timeout: 5000
                });
            }
        } catch (e) { /* powiadomienia opcjonalne */ }
    }

    // ==================================================================
    // MENU TAMPERMONKEY + DIAGNOSTYKA
    // ==================================================================
    function diagnostyka() {
        var info = analizujSciezke();
        var linie = [];
        linie.push('host: ' + location.host);
        linie.push('adres: ' + location.href);

        if (!info) {
            linie.push('Nie rozpoznano ścieżki /models/<model>/…');
        } else {
            linie.push('model: ' + info.model + ', typ: ' + info.typ);
            if (info.typ === 'galeria') {
                var pag = odczytajPaginacje(document, info.model);
                var zd = zbierzZdjecia(document, info.model);
                linie.push('paginacja: bieżąca=' + pag.biezaca + ', maks=' + pag.maks +
                    ', linków=' + Object.keys(pag.linki).length);
                linie.push('zdjęć na bieżącej stronie: ' + zd.length);
                linie.push('pierwsze zdjęcie: ' + (zd[0] ? zd[0].id + ' → ' + zd[0].url : 'brak'));
                linie.push('miniatura → pełny: ' + (zd[0] ? (pelnyUrlZMiniatury(zd[0].miniatura) || 'brak') : 'brak'));
            } else {
                var a = document.querySelector('a[href*="/contents/"]');
                linie.push('id zdjęcia: ' + info.id);
                linie.push('img.img-content: ' + (zrodloImgContent(document) || 'brak'));
                linie.push('a[href*="/contents/"]: ' + (a ? a.getAttribute('href') : 'brak'));
                linie.push('znormalizowany pełny URL: ' +
                    (wyciagnijPelnyUrl(document, { id: info.id, miniatura: '' }) || 'brak'));
            }
        }

        var tekst = linie.join('\n');
        try { console.log('[Nudogram] diagnostyka:\n' + tekst); } catch (e) { /* ignoruj */ }
        if (elLog) {
            linie.forEach(function (l) { dopiszLog(l); });
            ustawStatus('Diagnostyka wypisana w konsoli i logu panelu.');
        } else {
            try { window.alert('Nudogram — diagnostyka:\n\n' + tekst); } catch (e) { /* ignoruj */ }
        }
    }

    function rejestrujMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        GM_registerMenuCommand('⬇ Pobierz całą galerię (' + stan.maksStron + ' stron)', function () {
            start(true, false);
        });
        GM_registerMenuCommand('⬇ Pobierz zakres stron…', function () {
            start(false, false);
        });
        GM_registerMenuCommand('🧹 Wyczyść historię tej modelki', wyczyscHistorieModelu);
        GM_registerMenuCommand('🔍 Diagnostyka strony', diagnostyka);
    }

    // ==================================================================
    // STRONA POJEDYNCZEGO ZDJĘCIA
    //
    // Panelu nie wstrzykujemy (to nie galeria), ale dajemy mały przycisk
    // i komendę menu: przejdź do galerii modelki i zacznij pobierać.
    // ==================================================================
    function przejdzDoGalerii(model) {
        gmSet(KLUCZ_AUTOSTART, JSON.stringify({ model: model, czas: Date.now() }));
        location.href = urlStrony(model, 1);
    }

    function initStronaZdjecia(info) {
        stan.model = info.model;
        stan.modelFolder = oczyscNazwe(info.model, 80);
        rejestrujMenuZdjecia(info);

        if (document.getElementById('ndg-btn-gallery')) return;
        var b = document.createElement('button');
        b.id = 'ndg-btn-gallery';
        b.type = 'button';
        b.textContent = '⬇ Galeria modelki';
        b.title = 'Otwórz galerię modelki i pobierz wszystkie zdjęcia';
        b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483646;' +
            'padding:8px 12px;border:1px solid #5a5a5a;border-radius:6px;' +
            'background:#1e1e1e;color:#eee;font:12px Arial,sans-serif;cursor:pointer;' +
            'box-shadow:0 2px 10px rgba(0,0,0,.5);';
        b.addEventListener('click', function () { przejdzDoGalerii(info.model); });
        document.body.appendChild(b);
    }

    function rejestrujMenuZdjecia(info) {
        if (typeof GM_registerMenuCommand !== 'function') return;
        GM_registerMenuCommand('⬇ Otwórz galerię modelki i pobierz wszystko', function () {
            przejdzDoGalerii(info.model);
        });
        GM_registerMenuCommand('🔍 Diagnostyka strony', diagnostyka);
    }

    // ==================================================================
    // INICJALIZACJA
    // ==================================================================
    function init() {
        try {
        var info = analizujSciezke();
        console.log('[Nudogram] analizujSciezke:', info);
        if (!info) {
            console.log('[Nudogram] nie rozpoznano ścieżki /models/<model>/ — panel nie będzie pokazany.');
            return;
        }

        if (info.typ === 'zdjecie') {
            initStronaZdjecia(info);
            return;
        }

        stan.model = info.model;
        stan.modelFolder = oczyscNazwe(info.model, 80);
        stan.biezacaStrona = info.strona || 1;

        // Odporność na późny DOM: czekamy na listę albo paginację.
        var proby = 0;
        var timer = setInterval(function () {
            proby++;
            var maListe = !!document.querySelector(
                '#list_videos_common_videos_list_items .item, .list-videos .item');
            var maPaginacje = !!document.querySelector('.pagination a[href], .pagination span');

            if ((maListe || maPaginacje) || proby > 20) {
                clearInterval(timer);
                console.log('[Nudogram] DOM gotowy po', proby, 'próbach; maListe=', maListe, 'maPaginacje=', maPaginacje);

                var pag = odczytajPaginacje(document, stan.model);
                stan.maksStron = Math.max(1, pag.maks || 1);
                stan.biezacaStrona = pag.biezaca || stan.biezacaStrona;
                stan.linkStron = pag.linki || {};
                stan.nazwaModelki = odczytajNazweModelki(document);

                zbudujPanel();
                console.log('[Nudogram] panel zbudowany, #ndg-panel w DOM:', !!document.getElementById('ndg-panel'));
                rejestrujMenu();

                if (!maListe) {
                    dopiszLog('Nie widzę kafelków w DOM — spróbuję przez XHR.');
                }

                // Autostart po kliknięciu „Galeria modelki” na stronie zdjęcia.
                var auto = gmGet(KLUCZ_AUTOSTART, '');
                if (auto) {
                    try {
                        var dane = JSON.parse(auto);
                        if (dane && dane.model === stan.model && (Date.now() - dane.czas) < 120000) {
                            gmSet(KLUCZ_AUTOSTART, '');
                            dopiszLog('Autostart po przejściu ze strony zdjęcia.');
                            setTimeout(function () { start(true, true); }, 800);
                        } else if (dane && (dane.model !== stan.model || (Date.now() - dane.czas) >= 120000)) {
                            // Nieautorski/stary znacznik — nie może odpalić pobierania innej modelki.
                            gmSet(KLUCZ_AUTOSTART, '');
                        }
                    } catch (e) {
                        gmSet(KLUCZ_AUTOSTART, '');
                    }
                }
            }
        }, 400);
        } catch (e) {
            console.error('[Nudogram] błąd inicjalizacji:', e && (e.stack || e.message) || e);
            try { window.alert('Nudogram — błąd inicjalizacji:\n' + ((e && e.message) || e)); } catch (e2) { /* ignoruj */ }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
