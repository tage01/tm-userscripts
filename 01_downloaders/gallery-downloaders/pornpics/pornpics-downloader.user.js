// ==UserScript==
// @name         PornPics – sekwencyjny downloader galerii
// @namespace    https://github.com/opencode-test/gallery-downloaders
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/gallery-downloaders/pornpics/pornpics-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/gallery-downloaders/pornpics/pornpics-downloader.user.js
// @description  Pobiera pełne obrazy z galerii pornpics.com (/galleries/...) SEKWENCYJNIE (jeden po drugim, bez ładowania wszystkiego do pamięci) do folderów: [modelka]/[nazwa setu]/obraz
// @match        *://www.pornpics.com/galleries/*
// @match        *://pornpics.com/galleries/*
// @match        *://www.pornpics.com/*/galleries/*
// @match        *://pornpics.com/*/galleries/*
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @connect      cdni.pornpics.com
// @connect      www.pornpics.com
// @connect      pornpics.com
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
    //
    // Modelka na pornpics to ZWYKŁY TEKST (span, bez linku do profilu):
    //   .gallery-info span.disactive > span  (np. "Cara Mell")
    // Kanał (np. "Met Art") służy tylko jako fallback, gdy brak modelek.
    // ------------------------------------------------------------------
    function odczytajModelki() {
        var pozycje = Array.prototype.slice.call(
            document.querySelectorAll('.gallery-info .gallery-info__item'));
        var modele = [];
        pozycje.forEach(function (el) {
            var tytul = el.querySelector('.gallery-info__title');
            if (tytul && /models?/i.test(tytul.textContent)) {
                var spany = el.querySelectorAll('span.disactive > span, span.disactive');
                Array.prototype.forEach.call(spany, function (s) {
                    // Pomijamy zagnieżdżony span.disactive (brałby tekst podwójnie)
                    if (s.classList.contains('disactive') && s.querySelector('span')) return;
                    var t = s.textContent.trim();
                    if (t && modele.indexOf(t) === -1) modele.push(t);
                });
            }
        });
        if (modele.length) return modele;
        // Fallback: kanał (np. "Met Art")
        var kanal = document.querySelector('.gallery-info a[href*="/channels/"]');
        if (kanal && kanal.textContent.trim()) return [kanal.textContent.trim()];
        return ['nieznana-modelka'];
    }

    function odczytajNazweSetu() {
        var h1 = document.querySelector('.gallery-title h1, h1');
        var tytul = h1 ? h1.textContent.trim() : document.title.replace(/\s*-\s*PornPics\.com\s*$/i, '');
        return tytul || 'galeria';
    }

    // ------------------------------------------------------------------
    // Zbieranie URL-i PEŁNYCH obrazów (nie miniaturek!)
    //
    // Pełne:  <a class="rel-link" href="https://cdni.pornpics.com/1280/...jpg">
    // Miniaturki: img[data-src] → https://cdni.pornpics.com/460/...jpg (lazy-load!)
    // Celowo bierzemy TYLKO href kotwic (pełna rozdzielczość).
    // ------------------------------------------------------------------
    function zbierzObrazy() {
        var kotwice = Array.prototype.slice.call(
            document.querySelectorAll('ul#tiles a.rel-link[href], a.rel-link[href*="cdni.pornpics.com"]'));
        var adresy = kotwice.map(function (a) {
            var u = a.href;
            // Awaryjnie: gdyby href wskazywał miniaturkę /460/, podbij do /1280/
            if (/cdni\.pornpics\.com\/460\//.test(u)) u = u.replace('/460/', '/1280/');
            return u;
        }).filter(function (u) { return u && /^https?:\/\//i.test(u); });
        // Odfiltruj duplikaty, zachowując kolejność ze strony
        var widziane = {};
        return adresy.filter(function (u) {
            if (widziane[u]) return false;
            widziane[u] = true;
            return true;
        });
    }

    function bazowaZUrla(url) {
        var czysty = url.split('?')[0].split('#')[0];
        var b = czysty.substring(czysty.lastIndexOf('/') + 1);
        return (b.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'obraz');
    }

    // ------------------------------------------------------------------
    // Panel (pływający, nie rusza layoutu strony)
    // ------------------------------------------------------------------
    var elStatus, elPasek, elPrzycisk, elAnuluj;

    function zbudujPanel(ile) {
        if (document.getElementById('pp-dl-panel')) return;

        var panel = document.createElement('div');
        panel.id = 'pp-dl-panel';
        panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:999999;' +
            'background:#1e1e1e;color:#eee;font:13px/1.5 Arial,sans-serif;' +
            'border:1px solid #555;border-radius:8px;padding:10px 12px;width:250px;' +
            'box-shadow:0 2px 12px rgba(0,0,0,.5);';

        var naglowek = document.createElement('div');
        naglowek.style.cssText = 'font-weight:bold;margin-bottom:6px;';
        naglowek.textContent = 'PornPics downloader (' + ile + ' zdjęć)';
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
        elPasek.style.cssText = 'background:#eb008b;height:100%;width:0%;transition:width .2s;';
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

        var modelki = odczytajModelki().map(function (m) { return oczyscNazwe(m, 60); });
        var modelka = modelki.join(' & ');
        var set = oczyscNazwe(odczytajNazweSetu());
        var obrazy = zbierzObrazy();

        if (!obrazy.length) {
            ustawStatus('Nie znaleziono obrazów (a.rel-link).');
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

        ustawStatus('Start: ' + modelka + ' / ' + set.slice(0, 50) + ' (' + razem + ')');

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
                ustawStatus(komunikat + ' Folder: ' + modelka + '/' + set.slice(0, 50) + '/');
                return;
            }

            var url = obrazy[indeks];
            var baza = bazowaZUrla(url);
            var numer = String(indeks + 1).padStart(szer, '0');
            // GM_download tworzy podfoldery z separatora "/" w nazwie
            // (względem domyślnego folderu pobierania przeglądarki).
            var nazwa = modelka + '/' + set + '/' + numer + '_' + baza;

            ustawStatus('Pobieranie ' + (indeks + 1) + '/' + razem + ': ' + baza);
            elPrzycisk.textContent = '⏳ ' + (indeks + 1) + '/' + razem + '…';

            try {
                GM_download({
                    url: url,
                    name: nazwa,
                    saveAs: false, // false = bez okna dialogowego przy każdym pliku
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
    // Inicjalizacja: czekamy na kafelki (odporność na późny/lazy DOM)
    // ------------------------------------------------------------------
    function init() {
        // Tylko strony galerii
        if (!/\/galleries\//.test(location.pathname)) return;
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
