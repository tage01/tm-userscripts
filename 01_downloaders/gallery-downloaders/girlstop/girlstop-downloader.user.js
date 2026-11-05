// ==UserScript==
// @name         Girlstop – sekwencyjny downloader galerii
// @namespace    https://github.com/opencode-test/galeria-girlstop
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/gallery-downloaders/girlstop/girlstop-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/gallery-downloaders/girlstop/girlstop-downloader.user.js
// @description  Pobiera pełne obrazy z galerii girlstop.info (psto.php) SEKWENCYJNIE (jeden po drugim, bez ładowania wszystkiego do pamięci) do folderów: [modelka]/[nazwa setu]/obraz
// @match        *://en.girlstop.info/psto.php*
// @match        *://www.girlstop.info/psto.php*
// @match        *://girlstop.info/psto.php*
// @match        *://me.girlstop.info/psto.php*
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @connect      girlstop.top
// @connect      en.girlstop.info
// @connect      www.girlstop.info
// @connect      girlstop.info
// @connect      me.girlstop.info
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // ------------------------------------------------------------------
    // Konfiguracja
    // ------------------------------------------------------------------
    var CFG = {
        przerwaMiedzyPlikamiMs: 400 // pauza między kolejnymi plikami (grzeczność dla serwera)
    };

    var stan = {
        wTrakcie: false,
        anulowano: false,
        zakonczone: 0,
        bledy: 0
    };

    // ------------------------------------------------------------------
    // Pomocnicze: sanityzacja nazw plików/folderów (Windows)
    // ------------------------------------------------------------------
    function oczyscNazwe(nazwa, maks) {
        maks = maks || 100;
        if (!nazwa) return 'bez-nazwy';
        var w = String(nazwa)
            .replace(/[<>:\"\/\\|?*\x00-\x1F]/g, '_') // znaki zabronione w Windows
            .replace(/\s+/g, ' ')                     // wielokrotne spacje -> jedna
            .replace(/[. ]+$/g, '')                   // Windows ucina kropki/spacje na końcu
            .trim();
        if (!w) w = 'bez-nazwy';
        if (w.length > maks) w = w.slice(0, maks).trim();
        return w;
    }

    // ------------------------------------------------------------------
    // Odczyt metadanych galerii ze strony
    // ------------------------------------------------------------------
    function odczytajModelke() {
        // Priorytet 1: link do profilu modelki w meta-info
        var link = document.querySelector('.meta-row a[href*="models.php?name="]');
        if (link && link.textContent.trim()) return link.textContent.trim();
        // Priorytet 2: ostatnia część <h1> po myślniku (np. "Impeccable Diva — Cara Mell")
        var h1 = document.querySelector('h1');
        if (h1) {
            var czesci = h1.textContent.split(/—|–|-/);
            if (czesci.length > 1) return czesci[czesci.length - 1].trim();
            return h1.textContent.trim();
        }
        return 'nieznana-modelka';
    }

    function odczytajNazweSetu(modelka) {
        var h1 = document.querySelector('h1');
        var tytul = h1 ? h1.textContent.trim() : document.title;
        // <h1> ma format "Nazwa setu — Modelka" -> odcinamy sufiks z modelką
        if (modelka && tytul) {
            var bezSufiksu = tytul.replace(new RegExp('\\s*[—–-]\\s*' + modelka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'), '');
            if (bezSufiksu && bezSufiksu !== tytul) return bezSufiksu.trim();
        }
        return tytul || 'galeria';
    }

    function odczytajIdGalerii() {
        var m = location.search.match(/[?&]id=(\d+)/);
        return m ? m[1] : 'bez-id';
    }

    // ------------------------------------------------------------------
    // Zbieranie URL-i PEŁNYCH obrazów (nie miniaturek!)
    // ------------------------------------------------------------------
    function zbierzObrazy() {
        // Linki <a class="fullimg" href=".../p.avif"> prowadzą do pełnych plików (6K AVIF).
        // Miniaturki siedzą w <img>/thumbs/ i celowo ich NIE ruszamy.
        var kotwice = Array.prototype.slice.call(document.querySelectorAll('a.fullimg[href]'));
        var adresy = kotwice.map(function (a) { return a.href; })
            .filter(function (u) { return u && /^https?:\/\//i.test(u); });
        // Odfiltruj duplikaty, zachowując kolejność ze strony
        var widziane = {};
        return adresy.filter(function (u) {
            if (widziane[u]) return false;
            widziane[u] = true;
            return true;
        });
    }

    function rozszerzenieZUrla(url) {
        var czysty = url.split('?')[0].split('#')[0];
        var bazowa = czysty.substring(czysty.lastIndexOf('/') + 1);
        var m = bazowa.match(/\.([a-z0-9]{2,5})$/i);
        return m ? m[1].toLowerCase() : 'avif';
    }

    function bazowaZUrla(url) {
        var czysty = url.split('?')[0].split('#')[0];
        var b = czysty.substring(czysty.lastIndexOf('/') + 1);
        return b.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'obraz';
    }

    // ------------------------------------------------------------------
    // Panel (pływający, nie rusza layoutu strony)
    // ------------------------------------------------------------------
    var elStatus, elPasek, elPrzycisk, elAnuluj;

    function zbudujPanel(ile) {
        if (document.getElementById('gs-dl-panel')) return;

        var panel = document.createElement('div');
        panel.id = 'gs-dl-panel';
        panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:999999;' +
            'background:#1e1e1e;color:#eee;font:13px/1.5 Arial,sans-serif;' +
            'border:1px solid #555;border-radius:8px;padding:10px 12px;width:250px;' +
            'box-shadow:0 2px 12px rgba(0,0,0,.5);';

        var naglowek = document.createElement('div');
        naglowek.style.cssText = 'font-weight:bold;margin-bottom:6px;';
        naglowek.textContent = 'Girlstop downloader (' + ile + ' zdjęć)';
        panel.appendChild(naglowek);

        elPrzycisk = document.createElement('button');
        elPrzycisk.textContent = '⬇ Pobierz sekwencyjnie';
        elPrzycisk.style.cssText = 'width:100%;padding:6px;cursor:pointer;margin-bottom:6px;';
        elPrzycisk.addEventListener('click', start);
        panel.appendChild(elPrzycisk);

        elAnuluj = document.createElement('button');
        elAnuluj.textContent = '✖ Anuluj';
        elAnuluj.disabled = true;
        elAnuluj.style.cssText = 'width:100%;padding:6px;cursor:pointer;margin-bottom:6px;';
        elAnuluj.addEventListener('click', function () {
            stan.anulowano = true;
            ustawStatus('Anulowanie po bieżącym pliku…');
        });
        panel.appendChild(elAnuluj);

        var tor = document.createElement('div');
        tor.style.cssText = 'background:#444;border-radius:4px;height:10px;overflow:hidden;margin-bottom:6px;';
        elPasek = document.createElement('div');
        elPasek.style.cssText = 'background:#4caf50;height:100%;width:0%;transition:width .2s;';
        tor.appendChild(elPasek);
        panel.appendChild(tor);

        elStatus = document.createElement('div');
        elStatus.style.cssText = 'font-size:12px;color:#ccc;word-break:break-word;';
        elStatus.textContent = 'Gotowy.';
        panel.appendChild(elStatus);

        document.body.appendChild(panel);
    }

    function ustawStatus(txt) {
        if (elStatus) elStatus.textContent = txt;
    }

    function ustawPostep(zrobione, razem) {
        if (elPasek) elPasek.style.width = (razem ? (zrobione / razem * 100).toFixed(1) : 0) + '%';
    }

    // ------------------------------------------------------------------
    // Pobieranie SEKWENCYJNE przez GM_download (łańcuch onload -> next)
    //
    // Dlaczego tak: GM_download zleca zapis bezpośrednio przeglądarce,
    // więc w pamięci JS nie trzymamy ŻADNEGO bloba ani kolejki fetchy.
    // W danym momencie aktywny jest dokładnie JEDEN plik.
    // ------------------------------------------------------------------
    function start() {
        if (stan.wTrakcie) return;

        var modelka = oczyscNazwe(odczytajModelke());
        var set = oczyscNazwe(odczytajNazweSetu(odczytajModelke()));
        var obrazy = zbierzObrazy();

        if (!obrazy.length) {
            ustawStatus('Nie znaleziono obrazów (a.fullimg).');
            return;
        }

        stan.wTrakcie = true;
        stan.anulowano = false;
        stan.zakonczone = 0;
        stan.bledy = 0;
        elPrzycisk.disabled = true;
        elAnuluj.disabled = false;

        var razem = obrazy.length;
        // Szerokość numeracji: min. 2 cyfry (01, 02 …), więcej przy dużych galeriach
        var szer = Math.max(2, String(razem).length);

        ustawStatus('Start: ' + modelka + ' / ' + set + ' (' + razem + ')');

        function pobierzJeden(indeks) {
            // Koniec kolejki lub anulowanie
            if (indeks >= razem || stan.anulowano) {
                stan.wTrakcie = false;
                elPrzycisk.disabled = false;
                elPrzycisk.textContent = '⬇ Pobierz sekwencyjnie';
                elAnuluj.disabled = true;
                var komunikat = stan.anulowano
                    ? 'Przerwano: ' + stan.zakonczone + '/' + razem + ' (błędy: ' + stan.bledy + ').'
                    : 'Gotowe: ' + stan.zakonczone + '/' + razem + ' (błędy: ' + stan.bledy + ').';
                ustawStatus(komunikat + ' Folder: ' + modelka + '/' + set + '/');
                return;
            }

            var url = obrazy[indeks];
            var ext = rozszerzenieZUrla(url);
            var baza = bazowaZUrla(url);
            var numer = String(indeks + 1).padStart(szer, '0');
            // GM_download tworzy podfoldery z separatora "/" w nazwie
            // (względem domyślnego folderu pobierania przeglądarki).
            var nazwa = modelka + '/' + set + '/' + numer + '_' + baza;
            if (!/\.[a-z0-9]{2,5}$/i.test(nazwa)) nazwa += '.' + ext;

            ustawStatus('Pobieranie ' + (indeks + 1) + '/' + razem + ': ' + baza);
            elPrzycisk.textContent = '⏳ ' + (indeks + 1) + '/' + razem + '…';

            try {
                GM_download({
                    url: url,
                    name: nazwa,
                    saveAs: false, // false = bez okna dialogowego przy każdym pliku (41 dialogów!)
                    onload: function () {
                        stan.zakonczone++;
                        ustawPostep(stan.zakonczone, razem);
                        // Dopiero PO zakończeniu bieżącego pliku bierzemy następny
                        setTimeout(function () { pobierzJeden(indeks + 1); }, CFG.przerwaMiedzyPlikamiMs);
                    },
                    onerror: function (err) {
                        stan.bledy++;
                        stan.zakonczone++;
                        ustawPostep(stan.zakonczone, razem);
                        ustawStatus('Błąd ' + (indeks + 1) + '/' + razem + ' (' + (err && err.error || 'nieznany') + ') – jadę dalej…');
                        setTimeout(function () { pobierzJeden(indeks + 1); }, CFG.przerwaMiedzyPlikamiMs);
                    },
                    ontimeout: function () {
                        stan.bledy++;
                        stan.zakonczone++;
                        ustawPostep(stan.zakonczone, razem);
                        setTimeout(function () { pobierzJeden(indeks + 1); }, CFG.przerwaMiedzyPlikamiMs);
                    }
                });
            } catch (e) {
                stan.bledy++;
                stan.zakonczone++;
                ustawPostep(stan.zakonczone, razem);
                setTimeout(function () { pobierzJeden(indeks + 1); }, CFG.przerwaMiedzyPlikamiMs);
            }
        }

        pobierzJeden(0);
    }

    // ------------------------------------------------------------------
    // Inicjalizacja: czekamy na galerię (odporność na późny DOM)
    // ------------------------------------------------------------------
    function init() {
        var proby = 0;
        var timer = setInterval(function () {
            proby++;
            var obrazy = zbierzObrazy();
            if (obrazy.length || proby > 20) {
                clearInterval(timer);
                zbudujPanel(obrazy.length);
                if (typeof GM_registerMenuCommand === 'function') {
                    GM_registerMenuCommand('⬇ Pobierz galerię sekwencyjnie (' + obrazy.length + ')', start);
                }
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
