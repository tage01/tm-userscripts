// ==UserScript==
// @name         Girlstop – masowy downloader modelki (models.php → wszystkie galerie)
// @namespace    https://github.com/opencode-test/galeria-girlstop
// @version      1.6
// @downloadURL  https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/gallery-downloaders/girlstop/girlstop-model-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/tage01/tm-userscripts/main/01_downloaders/gallery-downloaders/girlstop/girlstop-model-downloader.user.js
// @description  Pobiera WSZYSTKIE galerie ze strony modelki (models.php?name=...) bez otwierania każdej ręcznie. Zdjęcia pobierane SEKWENCYJNIE (jeden plik naraz, GM_download) do tej samej hierarchii co skrypt pojedynczej galerii: [modelka]/[nazwa setu]/obraz
// @match        *://en.girlstop.info/models.php*
// @match        *://www.girlstop.info/models.php*
// @match        *://girlstop.info/models.php*
// @match        *://me.girlstop.info/models.php*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
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
    // Konfiguracja (te same zasady co w girlstop-downloader.user.js)
    // ------------------------------------------------------------------
    var CFG = {
        przerwaMiedzyPlikamiMs: 400,  // pauza między plikami w galerii
        przerwaMiedzyGaleriamiMs: 800 // pauza między galeriami (grzeczność dla serwera)
    };

    var stan = {
        wTrakcie: false,
        anulowano: false,
        galerie: [],       // [{id, url, tytulMiniaturki}]
        odIndeksu: 0,
        zrobionePliki: 0,
        bledyPlikow: 0,
        pominieteGalerie: 0,
        pominieteJakoPobrane: 0,
        gotoweGalerie: 0
    };

    // ------------------------------------------------------------------
    // Historia pobrań (obejście braku dostępu do dysku)
    //
    // Przeglądarka NIE pozwala userscriptowi sprawdzić, czy folder galerii
    // już istnieje na dysku. Dlatego skrypt zapamiętuje w swoim magazynie
    // (GM_setValue, per modelka) id galerii, które SAM pobrał do końca,
    // i na tej podstawie pomija duplikaty. Galerie pobrane wcześniej
    // (starszą wersją skryptu / innym narzędziem) dopisz ręcznie przyciskiem
    // "Oznacz zaznaczone jako pobrane".
    // ------------------------------------------------------------------
    var KLUCZ_HISTORII = 'gs-historia-pobran';

    function wczytajHistorie() {
        try {
            var surowe = (typeof GM_getValue === 'function') ? GM_getValue(KLUCZ_HISTORII, '{}') : '{}';
            var dane = JSON.parse(surowe || '{}');
            return (dane && typeof dane === 'object') ? dane : {};
        } catch (e) {
            return {};
        }
    }

    function zapiszHistorie(historia) {
        try {
            if (typeof GM_setValue === 'function') GM_setValue(KLUCZ_HISTORII, JSON.stringify(historia || {}));
        } catch (e) { /* brak magazynu = brak historii, pobieramy wszystko */ }
    }

    function czyPobrana(historia, id) {
        return !!(historia && historia[String(id)]);
    }

    function oznaczJakoPobrana(id, nazwaSetu) {
        var historia = wczytajHistorie();
        historia[String(id)] = { set: nazwaSetu || '', data: new Date().toISOString().slice(0, 10) };
        zapiszHistorie(historia);
        oznaczWierszJakoPobrany(id);
    }

    // ------------------------------------------------------------------
    // Pomocnicze: sanityzacja nazw (IDENTYCZNA jak w skrypcie pojedynczej galerii)
    // ------------------------------------------------------------------
    function oczyscNazwe(nazwa, maks) {
        maks = maks || 100;
        if (!nazwa) return 'bez-nazwy';
        var w = String(nazwa)
            .replace(/[<>:\"\/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, ' ')
            .replace(/[. ]+$/g, '')
            .trim();
        if (!w) w = 'bez-nazwy';
        if (w.length > maks) w = w.slice(0, maks).trim();
        return w;
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
    // Odczyt modelki ze strony models.php (folder nadrzędny)
    // ------------------------------------------------------------------
    function odczytajModelkeZeStrony() {
        // Priorytet 1: link z nazwą modelki w nawigacji (All models / C / Cara Mell)
        var kotwica = document.querySelector('#models_navdiv a.nounderline');
        if (kotwica && kotwica.textContent.trim()) return kotwica.textContent.trim();
        // Priorytet 2: <h1 class="index">Cara Mell - nude galleries (232)</h1> -> część przed " - "
        var h1 = document.querySelector('h1.index');
        if (h1 && h1.textContent.trim()) {
            var t = h1.textContent.trim().split(' - ')[0].trim();
            if (t) return t;
        }
        // Priorytet 3: parametr ?name=Cara-Mell z adresu URL
        var m = location.search.match(/[?&]name=([^&]+)/);
        if (m) return decodeURIComponent(m[1].replace(/\+/g, ' ')).replace(/-/g, ' ');
        return 'nieznana-modelka';
    }

    // ------------------------------------------------------------------
    // Zbieranie galerii z bieżącej strony (div.thumb -> psto.php?id=...)
    // ------------------------------------------------------------------
    function zbierzGalerie() {
        var kotwice = Array.prototype.slice.call(
            document.querySelectorAll('div.thumb a[href*="psto.php?id="], strong.post_title a[href*="psto.php?id="]')
        );
        var widziane = {};
        var wynik = [];
        kotwice.forEach(function (a) {
            var href = a.getAttribute('href') || '';
            var m = href.match(/psto\.php\?id=(\d+)/);
            if (!m) return;
            var id = m[1];
            if (widziane[id]) return;
            widziane[id] = true;
            // Tytuł setu z miniaturki (fallback, gdy pobranie strony galerii się nie uda)
            var tytul = '';
            var box = a.closest ? a.closest('div.thumb') : null;
            if (box) {
                var t = box.querySelector('strong.post_title a');
                if (t && t.textContent.trim()) tytul = t.textContent.trim();
            }
            if (!tytul && a.textContent.trim()) tytul = a.textContent.trim();
            var url = new URL(href, location.href).href;
            wynik.push({ id: id, url: url, tytulMiniaturki: tytul || ('galeria-' + id) });
        });
        return wynik;
    }

    // ------------------------------------------------------------------
    // Pobranie i sparsowanie strony pojedynczej galerii (bez jej otwierania)
    // Zwraca: { modelka, set, obrazy[] } — logika nazw IDENTYCZNA jak w girlstop-downloader
    // ------------------------------------------------------------------
    function pobierzDaneGalerii(galeria, modelkaDomyslna, cbOk, cbBlad) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: galeria.url,
            onload: function (resp) {
                try {
                    if (resp.status !== 200 || !resp.responseText) {
                        cbBlad('HTTP ' + resp.status);
                        return;
                    }
                    var doc = new DOMParser().parseFromString(resp.responseText, 'text/html');
                    // Modelka: tak samo jak w skrypcie pojedynczym (meta-row, potem h1)
                    var modelka = modelkaDomyslna;
                    var linkModelki = doc.querySelector('.meta-row a[href*="models.php?name="]');
                    if (linkModelki && linkModelki.textContent.trim()) {
                        modelka = linkModelki.textContent.trim();
                    } else {
                        var h1m = doc.querySelector('h1');
                        if (h1m) {
                            var cz = h1m.textContent.split(/—|–|-/);
                            if (cz.length > 1) modelka = cz[cz.length - 1].trim();
                        }
                    }
                    // Set: h1 po odcięciu sufiksu " — Modelka" (jak w skrypcie pojedynczym)
                    var h1 = doc.querySelector('h1');
                    var tytul = h1 ? h1.textContent.trim() : galeria.tytulMiniaturki;
                    var set = tytul;
                    if (modelka && tytul) {
                        var bez = tytul.replace(new RegExp('\\s*[—–-]\\s*' + modelka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'), '');
                        if (bez && bez !== tytul) set = bez.trim();
                    }
                    if (!set) set = galeria.tytulMiniaturki;
                    // Pełne obrazy: tylko a.fullimg (miniaturki /thumbs/ ignorujemy)
                    var kotwice = Array.prototype.slice.call(doc.querySelectorAll('a.fullimg[href]'));
                    var adresy = kotwice
                        .map(function (a) { return a.getAttribute('href'); })
                        .filter(function (u) { return u && /^https?:\/\//i.test(u); });
                    var widziane = {};
                    adresy = adresy.filter(function (u) {
                        if (widziane[u]) return false;
                        widziane[u] = true;
                        return true;
                    });
                    cbOk({
                        modelka: oczyscNazwe(modelka),
                        set: oczyscNazwe(set),
                        obrazy: adresy
                    });
                } catch (e) {
                    cbBlad(String((e && e.message) || e));
                }
            },
            onerror: function () { cbBlad('blad-sieci'); },
            ontimeout: function () { cbBlad('timeout'); }
        });
    }

    // ------------------------------------------------------------------
    // Pobieranie SEKWENCYJNE jednej galerii przez GM_download (łańcuch onload -> next)
    // ------------------------------------------------------------------
    function pobierzObrazySekwencyjnie(dane, galeriaNr, galeriiRazem, done) {
        var razem = dane.obrazy.length;
        var szer = Math.max(2, String(razem).length);
        var i = 0;

        function pobierzJeden() {
            if (stan.anulowano) { done(false); return; }
            if (i >= razem) { done(true); return; }

            var url = dane.obrazy[i];
            var idx = i;
            i++;
            var ext = rozszerzenieZUrla(url);
            var baza = bazowaZUrla(url);
            var numer = String(idx + 1).padStart(szer, '0');
            // Ta sama hierarchia co skrypt pojedynczej galerii: Model/Set/NN_baza.ext
            var nazwa = dane.modelka + '/' + dane.set + '/' + numer + '_' + baza;
            if (!/\.[a-z0-9]{2,5}$/i.test(nazwa)) nazwa += '.' + ext;

            ustawStatus('Galeria ' + galeriaNr + '/' + galeriiRazem + ' [' + dane.set + ']: plik ' + (idx + 1) + '/' + razem);
            ustawPostepGalerii(idx, razem);

            try {
                GM_download({
                    url: url,
                    name: nazwa,
                    saveAs: false,
                    onload: function () {
                        stan.zrobionePliki++;
                        ustawPostepCalkowity();
                        setTimeout(pobierzJeden, CFG.przerwaMiedzyPlikamiMs);
                    },
                    onerror: function (err) {
                        stan.zrobionePliki++;
                        stan.bledyPlikow++;
                        ustawPostepCalkowity();
                        dopiszLog('Błąd pliku ' + baza + ' w galerii [' + dane.set + ']: ' + ((err && err.error) || 'nieznany') + ' — jadę dalej.');
                        setTimeout(pobierzJeden, CFG.przerwaMiedzyPlikamiMs);
                    },
                    ontimeout: function () {
                        stan.zrobionePliki++;
                        stan.bledyPlikow++;
                        ustawPostepCalkowity();
                        setTimeout(pobierzJeden, CFG.przerwaMiedzyPlikamiMs);
                    }
                });
            } catch (e) {
                stan.zrobionePliki++;
                stan.bledyPlikow++;
                ustawPostepCalkowity();
                setTimeout(pobierzJeden, CFG.przerwaMiedzyPlikamiMs);
            }
        }

        pobierzJeden();
    }

    // ------------------------------------------------------------------
    // Główna pętla: galeria po galerii (każda: XHR parsowanie -> pliki sekwencyjnie)
    // ------------------------------------------------------------------
    function przetworzKolejnaGalerie(modelkaDomyslna, wybrane) {
        if (stan.odIndeksu >= wybrane.length || stan.anulowano) {
            zakoncz(modelkaDomyslna, wybrane.length);
            return;
        }
        var g = wybrane[stan.odIndeksu];
        var nr = stan.odIndeksu + 1;
        ustawStatus('Czytam galerię ' + nr + '/' + wybrane.length + ': ' + g.tytulMiniaturki + ' (id ' + g.id + ')…');
        odznaczWierszJakoAktywny(g.id);

        pobierzDaneGalerii(g, modelkaDomyslna,
            function (dane) {
                if (!dane.obrazy.length) {
                    stan.pominieteGalerie++;
                    dopiszLog('Pusto (brak a.fullimg), pomijam: ' + g.tytulMiniaturki + ' [id ' + g.id + '].');
                    oznaczWierszJakoGotowy(g.id, 'pusto');
                    stan.odIndeksu++;
                    setTimeout(function () { przetworzKolejnaGalerie(modelkaDomyslna, wybrane); }, CFG.przerwaMiedzyGaleriamiMs);
                    return;
                }
                pobierzObrazySekwencyjnie(dane, nr, wybrane.length, function () {
                    if (stan.anulowano) { zakoncz(modelkaDomyslna, wybrane.length); return; }
                    stan.gotoweGalerie++;
                    oznaczJakoPobrana(g.id, dane.set);
                    oznaczWierszJakoGotowy(g.id, 'ok (' + dane.obrazy.length + ')');
                    stan.odIndeksu++;
                    setTimeout(function () { przetworzKolejnaGalerie(modelkaDomyslna, wybrane); }, CFG.przerwaMiedzyGaleriamiMs);
                });
            },
            function (blad) {
                stan.pominieteGalerie++;
                dopiszLog('Nie udało się odczytać galerii ' + g.tytulMiniaturki + ' [id ' + g.id + ']: ' + blad + ' — jadę dalej.');
                oznaczWierszJakoGotowy(g.id, 'błąd');
                stan.odIndeksu++;
                setTimeout(function () { przetworzKolejnaGalerie(modelkaDomyslna, wybrane); }, CFG.przerwaMiedzyGaleriamiMs);
            });
    }

    function zakoncz(modelkaDomyslna, razemGalerii) {
        stan.wTrakcie = false;
        if (elStart) elStart.disabled = false;
        if (elStartWszystkie) elStartWszystkie.disabled = false;
        if (elAnuluj) elAnuluj.disabled = true;
        odswiezEtykietePomijania();
        var komunikat = stan.anulowano
            ? 'Przerwano po galerii ' + stan.odIndeksu + '/' + razemGalerii + '.'
            : 'Gotowe: galerie ' + stan.gotoweGalerie + '/' + razemGalerii +
              ' (pominięte: ' + stan.pominieteGalerie +
              ', w tym już pobrane: ' + stan.pominieteJakoPobrane +
              '), pliki z błędami: ' + stan.bledyPlikow + '.';
        ustawStatus(komunikat + ' Folder: ' + oczyscNazwe(modelkaDomyslna) + '/');
        // Ułatwienie przy 400+ galeriach: po udanej partii od razu zaznacz następne 10
        // (trafiają do historii dopiero po pobraniu, więc partia ich już nie zawiera)
        if (!stan.anulowano && stan.gotoweGalerie > 0) {
            var nastepna = zaznaczNastepnaPartie();
            dopiszLog(nastepna || 'To była ostatnia partia — cała lista odhaczona.');
        }
    }

    // ------------------------------------------------------------------
    // Panel (pływający, nie rusza layoutu; odporny na późny DOM)
    // ------------------------------------------------------------------
    var elStatus, elPasekCalosc, elPasekGaleria, elStart, elStartWszystkie, elAnuluj, elLista, elLicznik, elWybor, elPomijaj, elMini, elPartiaInfo;

    // Partie po 10 (przy 400+ galeriach na stronie klikanie całości na raz nie ma sensu)
    var ROZMIAR_PARTII = 10;
    var partiaPoczatek = 0; // indeks pierwszego wiersza bieżącej partii (w kolejności listy)
    var partiaStart = 0;    // kursor: indeks, od którego szuka następnej partii

    function zbudujPanel(galerie, modelka) {
        if (document.getElementById('gs-model-panel')) return;

        var panel = document.createElement('div');
        panel.id = 'gs-model-panel';
        panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:999999;' +
            'background:#1e1e1e;color:#eee;font:13px/1.5 Arial,sans-serif;' +
            'border:1px solid #555;border-radius:8px;padding:10px 12px;width:300px;' +
            'box-shadow:0 2px 12px rgba(0,0,0,.5);max-height:90vh;display:flex;flex-direction:column;';

        var naglowek = document.createElement('div');
        naglowek.id = 'gs-model-naglowek';
        naglowek.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:bold;margin-bottom:2px;' +
            'cursor:move;user-select:none;-webkit-user-select:none;touch-action:none;';
        var tytul = document.createElement('span');
        tytul.style.cssText = 'flex:1;';
        tytul.textContent = 'Girlstop: cała modelka';
        naglowek.appendChild(tytul);
        elMini = document.createElement('button');
        elMini.title = 'Zwiń panel do zakładki przy krawędzi';
        elMini.style.cssText = 'padding:0 8px;cursor:pointer;font-size:13px;line-height:1.6;';
        elMini.addEventListener('click', function () {
            var panel = document.getElementById('gs-model-panel');
            ustawMini(!(panel && panel.dataset.mini === '1'));
        });
        naglowek.appendChild(elMini);
        panel.appendChild(naglowek);

        elLicznik = document.createElement('div');
        elLicznik.style.cssText = 'font-size:12px;color:#aaa;margin-bottom:6px;';
        elLicznik.textContent = modelka + ' — galerii na stronie: ' + galerie.length;
        panel.appendChild(elLicznik);

        elLista = document.createElement('div');
        elLista.style.cssText = 'overflow-y:auto;max-height:220px;border:1px solid #444;border-radius:4px;' +
            'padding:4px 6px;margin-bottom:6px;font-size:12px;';
        var historiaStartowa = wczytajHistorie();
        galerie.forEach(function (g, idx) {
            var wiersz = document.createElement('label');
            wiersz.style.cssText = 'display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;';
            wiersz.dataset.gid = g.id;
            wiersz.title = g.tytulMiniaturki + ' [id ' + g.id + ']';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            // Startowo NIC nie jest zaznaczone: pierwszą partię dobiera automat
            // na końcu zbudujPanel. (Dawniej wszystko startowało zahaczone i jeden
            // przypadkowy klik „Pobierz zaznaczone” ściągał całą, 400-elementową listę.)
            cb.checked = false;
            cb.dataset.gid = g.id;
            cb.style.cssText = 'margin-right:6px;';
            cb.addEventListener('change', odswiezLicznikWyboru);
            wiersz.appendChild(cb);
            // Numer porządkowy ułatwia orientację przy 400+ galeriach i partiach po 10
            wiersz.appendChild(document.createTextNode((idx + 1) + '. ' + g.tytulMiniaturki + ' [id ' + g.id + ']'));
            elLista.appendChild(wiersz);
            if (czyPobrana(historiaStartowa, g.id)) oznaczWierszJakoPobrany(g.id);
        });
        panel.appendChild(elLista);

        // Pasek narzędzi wyboru: zaznacz / odznacz wszystkie + licznik
        var pasekWyboru = document.createElement('div');
        pasekWyboru.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
        var btnZaznacz = document.createElement('button');
        btnZaznacz.textContent = '☑ Zaznacz wszystkie';
        btnZaznacz.style.cssText = 'flex:1;padding:4px;cursor:pointer;font-size:12px;';
        btnZaznacz.addEventListener('click', function () { ustawWszystkieCheckboxy(true); });
        pasekWyboru.appendChild(btnZaznacz);
        var btnOdznacz = document.createElement('button');
        btnOdznacz.textContent = '☐ Odznacz wszystkie';
        btnOdznacz.style.cssText = 'flex:1;padding:4px;cursor:pointer;font-size:12px;';
        btnOdznacz.addEventListener('click', function () { ustawWszystkieCheckboxy(false); });
        pasekWyboru.appendChild(btnOdznacz);
        panel.appendChild(pasekWyboru);

        // Partie po 10: przy kilkuset galeriach zaznaczasz jedną partię,
        // pobierasz, a po zakończeniu następna partia zaznacza się sama
        var pasekPartii = document.createElement('div');
        pasekPartii.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
        var btnPoprz = document.createElement('button');
        btnPoprz.textContent = '◀ Poprzednie 10';
        btnPoprz.title = 'Zaznacz poprzednie 10 galerii (z historią: pomija już pobrane)';
        btnPoprz.style.cssText = 'flex:1;padding:4px;cursor:pointer;font-size:12px;';
        btnPoprz.addEventListener('click', function () {
            var info = zaznaczPoprzedniaPartie();
            ustawStatus(info || 'To już początek listy — brak wcześniejszych galerii do pobrania.');
        });
        pasekPartii.appendChild(btnPoprz);
        var btnNast = document.createElement('button');
        btnNast.textContent = 'Następne 10 ▶';
        btnNast.title = 'Zaznacz kolejne 10 galerii (z historią: pomija już pobrane)';
        btnNast.style.cssText = 'flex:1;padding:4px;cursor:pointer;font-size:12px;';
        btnNast.addEventListener('click', function () {
            var info = zaznaczNastepnaPartie();
            ustawStatus(info || 'Koniec listy — brak więcej galerii do pobrania od kursora. Kliknij „◀ Poprzednie 10”, aby wrócić.');
        });
        pasekPartii.appendChild(btnNast);
        panel.appendChild(pasekPartii);

        elPartiaInfo = document.createElement('div');
        elPartiaInfo.style.cssText = 'font-size:12px;color:#aaa;margin-bottom:4px;';
        panel.appendChild(elPartiaInfo);

        elWybor = document.createElement('div');
        elWybor.style.cssText = 'font-size:12px;color:#aaa;margin-bottom:4px;';
        panel.appendChild(elWybor);

        // Ochrona przed duplikatami: pomijanie galerii z historii + ręczne dopisywanie
        var wierszPomijaj = document.createElement('label');
        wierszPomijaj.style.cssText = 'display:block;font-size:12px;margin-bottom:4px;cursor:pointer;';
        elPomijaj = document.createElement('input');
        elPomijaj.type = 'checkbox';
        elPomijaj.checked = true;
        elPomijaj.style.cssText = 'margin-right:6px;';
        elPomijaj.addEventListener('change', function () { odswiezEtykietePomijania(); odswiezInfoPartii(); });
        wierszPomijaj.appendChild(elPomijaj);
        var elPomijajTekst = document.createElement('span');
        elPomijajTekst.id = 'gs-pomijaj-tekst';
        wierszPomijaj.appendChild(elPomijajTekst);
        panel.appendChild(wierszPomijaj);

        var pasekHistorii = document.createElement('div');
        pasekHistorii.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
        var btnDopisz = document.createElement('button');
        btnDopisz.textContent = '✔ Oznacz zaznaczone jako pobrane';
        btnDopisz.title = 'Dopisz zaznaczone galerie do historii (np. pobrane wcześniej innym sposobem)';
        btnDopisz.style.cssText = 'flex:1;padding:4px;cursor:pointer;font-size:12px;';
        btnDopisz.addEventListener('click', function () {
            var historia = wczytajHistorie();
            var ile = 0;
            Array.prototype.forEach.call(elLista.querySelectorAll('input[type="checkbox"]'), function (cb) {
                if (cb.checked && !historia[String(cb.dataset.gid)]) {
                    var w = elLista.querySelector('label[data-gid="' + cb.dataset.gid + '"]');
                    historia[String(cb.dataset.gid)] = {
                        set: w ? w.title : '',
                        data: new Date().toISOString().slice(0, 10)
                    };
                    ile++;
                    oznaczWierszJakoPobrany(cb.dataset.gid);
                }
            });
            zapiszHistorie(historia);
            odswiezEtykietePomijania();
            ustawStatus('Dopisano do historii: ' + ile + ' galerii.');
        });
        pasekHistorii.appendChild(btnDopisz);
        var btnCzysc = document.createElement('button');
        btnCzysc.textContent = '🗑 Wyczyść historię';
        btnCzysc.title = 'Usuwa całą historię pobrań (od następnego startu pobiera wszystko jak dawniej)';
        btnCzysc.style.cssText = 'flex:1;padding:4px;cursor:pointer;font-size:12px;';
        btnCzysc.addEventListener('click', function () {
            if (!window.confirm('Wyczyścić całą historię pobranych galerii?')) return;
            zapiszHistorie({});
            if (elLista) {
                Array.prototype.forEach.call(elLista.querySelectorAll('label[data-gid]'), function (w) {
                    w.style.color = '';
                    var badge = w.querySelector('.gs-badge-pobrano');
                    if (badge) badge.remove();
                });
            }
            odswiezEtykietePomijania();
            ustawStatus('Historia wyczyszczona.');
        });
        pasekHistorii.appendChild(btnCzysc);
        panel.appendChild(pasekHistorii);

        odswiezLicznikWyboru();
        odswiezEtykietePomijania();

        elStart = document.createElement('button');
        elStart.textContent = '⬇ Pobierz zaznaczone';
        elStart.style.cssText = 'width:100%;padding:6px;cursor:pointer;margin-bottom:6px;';
        elStart.addEventListener('click', function () { start(false); });
        panel.appendChild(elStart);

        elStartWszystkie = document.createElement('button');
        elStartWszystkie.textContent = '⬇⬇ Pobierz WSZYSTKIE ze strony';
        elStartWszystkie.style.cssText = 'width:100%;padding:6px;cursor:pointer;margin-bottom:6px;';
        elStartWszystkie.addEventListener('click', function () { start(true); });
        panel.appendChild(elStartWszystkie);

        elAnuluj = document.createElement('button');
        elAnuluj.textContent = '✖ Anuluj (po bieżącym pliku)';
        elAnuluj.disabled = true;
        elAnuluj.style.cssText = 'width:100%;padding:6px;cursor:pointer;margin-bottom:6px;';
        elAnuluj.addEventListener('click', function () {
            stan.anulowano = true;
            ustawStatus('Anulowanie po bieżącym pliku…');
        });
        panel.appendChild(elAnuluj);

        var opisC = document.createElement('div');
        opisC.style.cssText = 'font-size:11px;color:#aaa;';
        opisC.textContent = 'Całość:';
        panel.appendChild(opisC);

        var torC = document.createElement('div');
        torC.style.cssText = 'background:#444;border-radius:4px;height:10px;overflow:hidden;margin-bottom:4px;';
        elPasekCalosc = document.createElement('div');
        elPasekCalosc.style.cssText = 'background:#4caf50;height:100%;width:0%;transition:width .2s;';
        torC.appendChild(elPasekCalosc);
        panel.appendChild(torC);

        var opisG = document.createElement('div');
        opisG.style.cssText = 'font-size:11px;color:#aaa;';
        opisG.textContent = 'Bieżąca galeria:';
        panel.appendChild(opisG);

        var torG = document.createElement('div');
        torG.style.cssText = 'background:#444;border-radius:4px;height:10px;overflow:hidden;margin-bottom:6px;';
        elPasekGaleria = document.createElement('div');
        elPasekGaleria.style.cssText = 'background:#2196f3;height:100%;width:0%;transition:width .2s;';
        torG.appendChild(elPasekGaleria);
        panel.appendChild(torG);

        elStatus = document.createElement('div');
        elStatus.style.cssText = 'font-size:12px;color:#ccc;word-break:break-word;max-height:90px;overflow-y:auto;';
        elStatus.textContent = 'Przygotowanie…';
        panel.appendChild(elStatus);

        document.body.appendChild(panel);

        // Przeciąganie panelu za nagłówek + przywrócenie zapisanej pozycji
        udragnijPanel(panel, naglowek);
        przywrocPozycjePanelu(panel);

        // Przywróć poprzedni stan zwinięcia (zanim schowasz panel, pobieranie działa dalej w tle)
        var miniStart = false;
        try {
            miniStart = (typeof GM_getValue === 'function') && GM_getValue(KLUCZ_MINI, '') === '1';
        } catch (e) { miniStart = false; }
        ustawMini(!!miniStart);

        // Startowo zaznacz od razu pierwszą partię (z historią: pomija już pobrane),
        // żeby „⬇ Pobierz zaznaczone” od pierwszego kliknięcia brało tylko 10
        if (!galerie.length) {
            ustawStatus('Nie znaleziono galerii na stronie (div.thumb a → psto.php?id=…).');
        } else {
            var pierwsza = zaznaczNastepnaPartie();
            ustawStatus(pierwsza ||
                'Wszystkie galerie z tej strony są już pobrane (historia). Odznacz „Pomijaj już pobrane”, aby pobrać je ponownie.');
        }
    }

    // ------------------------------------------------------------------
    // Przeciąganie panelu za nagłówek (mysz + dotyk, bez ruszania layoutu strony)
    // Pozycja zapisywana między przeładowaniami; dwuklik nagłówka wraca do rogu.
    // ------------------------------------------------------------------
    var KLUCZ_POZYCJI = 'gs-panel-pozycja';

    function przywrocPozycjePanelu(panel) {
        try {
            if (typeof GM_getValue !== 'function') return;
            var surowe = GM_getValue(KLUCZ_POZYCJI, '');
            if (!surowe) return;
            var poz = JSON.parse(surowe);
            if (typeof poz.left !== 'number' || typeof poz.top !== 'number') return;
            // Wepnij w widoczny obszar (np. po zmianie rozmiaru okna)
            var maxL = Math.max(0, window.innerWidth - 60);
            var maxT = Math.max(0, window.innerHeight - 30);
            panel.style.left = Math.min(Math.max(0, poz.left), maxL) + 'px';
            panel.style.top = Math.min(Math.max(0, poz.top), maxT) + 'px';
            panel.style.right = 'auto';
            panel.dataset.przeciagniety = '1';
        } catch (e) { /* brak pozycji = domyślny róg */ }
    }

    function udragnijPanel(panel, uchwyt) {
        var startX = 0, startY = 0, startL = 0, startT = 0, wTrakcie = false;

        function pozycjaStartowa(clientX, clientY) {
            var r = panel.getBoundingClientRect();
            // Przełącz z kotwiczenia do prawej na współrzędne left/top
            panel.style.left = r.left + 'px';
            panel.style.top = r.top + 'px';
            panel.style.right = 'auto';
            startX = clientX;
            startY = clientY;
            startL = r.left;
            startT = r.top;
            wTrakcie = true;
        }

        function przesunDo(clientX, clientY) {
            if (!wTrakcie) return;
            var maxL = Math.max(0, window.innerWidth - 60);
            var maxT = Math.max(0, window.innerHeight - 30);
            var l = Math.min(Math.max(0, startL + clientX - startX), maxL);
            var t = Math.min(Math.max(0, startT + clientY - startY), maxT);
            panel.style.left = l + 'px';
            panel.style.top = t + 'px';
            panel.dataset.przeciagniety = '1';
        }

        function zakonczPrzeciaganie() {
            if (!wTrakcie) return;
            wTrakcie = false;
            try {
                if (typeof GM_setValue === 'function') {
                    GM_setValue(KLUCZ_POZYCJI, JSON.stringify({
                        left: parseFloat(panel.style.left) || 0,
                        top: parseFloat(panel.style.top) || 0
                    }));
                }
            } catch (e) { /* brak magazynu = brak pamiętania pozycji */ }
        }

        uchwyt.addEventListener('mousedown', function (e) {
            // Klik w przycisk zwijania to nie początek przeciągania
            if (e.target && e.target.closest && e.target.closest('button')) return;
            if (e.button !== 0) return;
            e.preventDefault();
            pozycjaStartowa(e.clientX, e.clientY);
            document.addEventListener('mousemove', naRuchMyszy);
            document.addEventListener('mouseup', naPuszczenieMyszy, { once: true });
        });

        function naRuchMyszy(e) { przesunDo(e.clientX, e.clientY); }
        function naPuszczenieMyszy() {
            document.removeEventListener('mousemove', naRuchMyszy);
            zakonczPrzeciaganie();
        }

        // Ekrany dotykowe
        uchwyt.addEventListener('touchstart', function (e) {
            if (e.target && e.target.closest && e.target.closest('button')) return;
            if (!e.touches || e.touches.length !== 1) return;
            pozycjaStartowa(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        uchwyt.addEventListener('touchmove', function (e) {
            if (!wTrakcie || !e.touches || e.touches.length !== 1) return;
            if (e.cancelable) e.preventDefault();
            przesunDo(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });
        uchwyt.addEventListener('touchend', zakonczPrzeciaganie);

        // Dwuklik nagłówka = powrót do domyślnego rogu
        uchwyt.addEventListener('dblclick', function (e) {
            if (e.target && e.target.closest && e.target.closest('button')) return;
            panel.style.left = '';
            panel.style.top = '';
            panel.style.right = '12px';
            panel.dataset.przeciagniety = '';
            try {
                if (typeof GM_setValue === 'function') GM_setValue(KLUCZ_POZYCJI, '');
            } catch (err) { /* ignoruj */ }
            if (panel.dataset.mini === '1') ustawMini(true); // dociągnij zakładkę do krawędzi
        });
    }

    // ------------------------------------------------------------------
    // Minimalizacja panelu do zakładki przy prawej krawędzi
    // (stan zapamiętywany między przeładowaniami strony)
    // ------------------------------------------------------------------
    var KLUCZ_MINI = 'gs-panel-mini';

    function ustawMini(zminimalizowany) {
        var panel = document.getElementById('gs-model-panel');
        if (!panel) return;
        panel.dataset.mini = zminimalizowany ? '1' : '';
        Array.prototype.forEach.call(panel.children, function (dziecko) {
            if (dziecko.id !== 'gs-model-naglowek') dziecko.style.display = zminimalizowany ? 'none' : '';
        });
        // Zwinięty = wąska zakładka; rozwinięty = pełny panel.
        // Gdy użytkownik sam ustawił pozycję (przeciągnięcie), zostaje ona na miejscu.
        panel.style.width = zminimalizowany ? 'auto' : '300px';
        panel.style.padding = zminimalizowany ? '4px 6px' : '10px 12px';
        panel.style.borderRadius = zminimalizowany ? '8px 0 0 8px' : '8px';
        if (panel.dataset.przeciagniety === '1') {
            panel.style.right = 'auto'; // nie ściągaj z powrotem do krawędzi
        } else {
            panel.style.right = zminimalizowany ? '0' : '12px';
        }
        if (elMini) {
            elMini.textContent = zminimalizowany ? '▸' : '—';
            elMini.title = zminimalizowany ? 'Rozwiń panel' : 'Zwiń panel do zakładki przy krawędzi';
        }
        try {
            if (typeof GM_setValue === 'function') GM_setValue(KLUCZ_MINI, zminimalizowany ? '1' : '');
        } catch (e) { /* brak magazynu = brak pamiętania */ }
    }

    function ustawWszystkieCheckboxy(wartosc) {
        if (!elLista) return;
        Array.prototype.forEach.call(elLista.querySelectorAll('input[type="checkbox"]'), function (cb) {
            cb.checked = wartosc;
        });
        odswiezLicznikWyboru();
    }

    // ------------------------------------------------------------------
    // Partie po 10 — zaznaczanie kolejnego kawałka długiej listy
    // Szanuje historię: przy włączonym „Pomijaj już pobrane” już pobrane
    // galerie wypadają z partii (nie zjadają miejsc w dziesiątce).
    // ------------------------------------------------------------------
    function checkboxyWKolejnosci() {
        if (!elLista) return [];
        return Array.prototype.slice.call(elLista.querySelectorAll('input[type="checkbox"]'));
    }

    function kwalifikujeSieDoPartii(cb, historia) {
        if (elPomijaj && elPomijaj.checked && czyPobrana(historia, cb.dataset.gid)) return false;
        return true;
    }

    function numerWiersza(boxy, cb) {
        return boxy.indexOf(cb) + 1;
    }

    function przewinDoWiersza(gid) {
        try {
            var wiersz = elLista && elLista.querySelector('label[data-gid="' + gid + '"]');
            if (wiersz && wiersz.scrollIntoView) wiersz.scrollIntoView({ block: 'nearest' });
        } catch (e) { /* brak przewijania = brak problemu */ }
    }

    // Zaznacza kolejną partię od kursora; zwraca opis do statusu albo null, gdy brak.
    function zaznaczNastepnaPartie() {
        var boxy = checkboxyWKolejnosci();
        if (!boxy.length) return null;
        var historia = wczytajHistorie();
        var zebrane = [];
        var i = partiaStart;
        while (i < boxy.length && zebrane.length < ROZMIAR_PARTII) {
            if (kwalifikujeSieDoPartii(boxy[i], historia)) zebrane.push(boxy[i]);
            i++;
        }
        if (!zebrane.length) return null;
        boxy.forEach(function (cb) { cb.checked = false; });
        zebrane.forEach(function (cb) { cb.checked = true; });
        partiaPoczatek = numerWiersza(boxy, zebrane[0]) - 1;
        partiaStart = numerWiersza(boxy, zebrane[zebrane.length - 1]); // kursor za ostatnim
        odswiezLicznikWyboru();
        przewinDoWiersza(zebrane[0].dataset.gid);
        return 'Zaznaczono partię ' + numerWiersza(boxy, zebrane[0]) + '–' +
            numerWiersza(boxy, zebrane[zebrane.length - 1]) +
            ' (' + zebrane.length + '). Kliknij „⬇ Pobierz zaznaczone”.';
    }

    // Zaznacza partię przed bieżącą; zwraca opis do statusu albo null, gdy brak.
    function zaznaczPoprzedniaPartie() {
        var boxy = checkboxyWKolejnosci();
        if (!boxy.length) return null;
        var historia = wczytajHistorie();
        var zebrane = [];
        var i = partiaPoczatek - 1;
        while (i >= 0 && zebrane.length < ROZMIAR_PARTII) {
            if (kwalifikujeSieDoPartii(boxy[i], historia)) zebrane.unshift(boxy[i]);
            i--;
        }
        if (!zebrane.length) return null;
        boxy.forEach(function (cb) { cb.checked = false; });
        zebrane.forEach(function (cb) { cb.checked = true; });
        partiaPoczatek = numerWiersza(boxy, zebrane[0]) - 1;
        partiaStart = numerWiersza(boxy, zebrane[zebrane.length - 1]); // „następne” wróci tu, skąd przyszło
        odswiezLicznikWyboru();
        przewinDoWiersza(zebrane[0].dataset.gid);
        return 'Zaznaczono partię ' + numerWiersza(boxy, zebrane[0]) + '–' +
            numerWiersza(boxy, zebrane[zebrane.length - 1]) +
            ' (' + zebrane.length + '). Kliknij „⬇ Pobierz zaznaczone”.';
    }

    function odswiezInfoPartii() {
        if (!elPartiaInfo || !elLista) return;
        var boxy = checkboxyWKolejnosci();
        if (!boxy.length) { elPartiaInfo.textContent = ''; return; }
        var historia = wczytajHistorie();
        var doPobrania = boxy.filter(function (cb) { return kwalifikujeSieDoPartii(cb, historia); }).length;
        elPartiaInfo.textContent = 'Partie po ' + ROZMIAR_PARTII + ' — do pobrania: ' + doPobrania +
            '/' + boxy.length + ', kursor: ' + (Math.min(partiaStart + 1, boxy.length)) + '/' + boxy.length;
    }

    function odswiezLicznikWyboru() {
        if (!elWybor || !elLista) return;
        var wszystkie = elLista.querySelectorAll('input[type="checkbox"]');
        var zaznaczone = elLista.querySelectorAll('input[type="checkbox"]:checked');
        elWybor.textContent = 'Zaznaczono: ' + zaznaczone.length + '/' + wszystkie.length;
        odswiezInfoPartii();
    }

    function ustawStatus(txt) {
        if (elStatus) elStatus.textContent = txt;
    }

    function dopiszLog(txt) {
        if (!elStatus) return;
        elStatus.textContent += '\n' + txt;
    }

    function ustawPostepGalerii(zrobione, razem) {
        if (elPasekGaleria) elPasekGaleria.style.width = (razem ? (zrobione / razem * 100).toFixed(1) : 0) + '%';
    }

    function ustawPostepCalkowity() {
        if (!elPasekCalosc) return;
        var przetworzoneGalerie = stan.odIndeksu;
        var calosc = stan.galerie.length || 1;
        elPasekCalosc.style.width = (przetworzoneGalerie / calosc * 100).toFixed(1) + '%';
        if (elLicznik) {
            elLicznik.textContent = 'Galeria ' + Math.min(przetworzoneGalerie + 1, calosc) + '/' + calosc +
                ' — plików pobranych: ' + stan.zrobionePliki + ' (błędy: ' + stan.bledyPlikow + ')';
        }
    }

    function oznaczWierszJakoPobrany(id) {
        var w = elLista && elLista.querySelector('label[data-gid="' + id + '"]');
        if (!w || w.querySelector('.gs-badge-pobrano')) return;
        var badge = document.createElement('span');
        badge.className = 'gs-badge-pobrano';
        badge.style.cssText = 'color:#8bc34a;margin-left:4px;';
        badge.textContent = '✓ pobrano';
        w.appendChild(badge);
        // Odznacz, żeby ponowny start nie dublował folderu
        var cb = w.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = false;
        odswiezLicznikWyboru();
    }

    function odswiezEtykietePomijania() {
        var tekst = document.getElementById('gs-pomijaj-tekst');
        if (!tekst) return;
        var ile = 0;
        try {
            ile = Object.keys(wczytajHistorie()).length;
        } catch (e) { ile = 0; }
        tekst.textContent = 'Pomijaj już pobrane (historia: ' + ile + ')';
    }

    function odznaczWierszJakoAktywny(id) {
        var w = elLista && elLista.querySelector('label[data-gid="' + id + '"]');
        if (w) w.style.color = '#ffeb3b';
    }

    function oznaczWierszJakoGotowy(id, info) {
        var w = elLista && elLista.querySelector('label[data-gid="' + id + '"]');
        if (w) {
            w.style.color = '#8bc34a';
            w.title = w.title + ' — ' + info;
        }
    }

    // ------------------------------------------------------------------
    // Start
    // ------------------------------------------------------------------
    function start(wszystkie) {
        if (stan.wTrakcie) return;
        stan.galerie = zbierzGalerie();
        if (!stan.galerie.length) {
            ustawStatus('Nie znaleziono galerii (div.thumb a → psto.php?id=…).');
            return;
        }
        // Bezpiecznik przeciw przypadkowemu ściągnięciu setek galerii jednym klikiem
        // (przycisk „WSZYSTKIE” leży tuż pod „Pobierz zaznaczone”): powyżej jednej partii pytamy.
        if (wszystkie && stan.galerie.length > ROZMIAR_PARTII) {
            var pytanie = 'Pobrać WSZYSTKIE ' + stan.galerie.length + ' galerii ze strony?\n\n' +
                'Przy długich listach bezpieczniej iść partiami po ' + ROZMIAR_PARTII +
                ': „Następne 10 ▶” + „⬇ Pobierz zaznaczone”.';
            var zgoda = false;
            try {
                zgoda = (typeof window.confirm === 'function') ? window.confirm(pytanie) : true;
            } catch (e) { zgoda = true; }
            if (!zgoda) {
                ustawStatus('Anulowano pobieranie WSZYSTKICH. Zaznacz partię i kliknij „⬇ Pobierz zaznaczone”.');
                return;
            }
        }
        var modelkaDomyslna = odczytajModelkeZeStrony();

        var wybrane;
        if (wszystkie) {
            wybrane = stan.galerie.slice();
            if (elLista) {
                Array.prototype.forEach.call(elLista.querySelectorAll('input[type="checkbox"]'), function (cb) {
                    cb.checked = true;
                });
            }
        } else {
            var zaznaczone = {};
            if (elLista) {
                Array.prototype.forEach.call(elLista.querySelectorAll('input[type="checkbox"]'), function (cb) {
                    if (cb.checked) zaznaczone[cb.dataset.gid] = true;
                });
            }
            wybrane = stan.galerie.filter(function (g) { return zaznaczone[g.id]; });
        }

        if (!wybrane.length) {
            ustawStatus('Nic nie zaznaczono.');
            return;
        }

        // Ochrona przed duplikatami: odfiltruj galerie z historii pobrań
        stan.pominieteJakoPobrane = 0;
        if (elPomijaj && elPomijaj.checked) {
            var historia = wczytajHistorie();
            var przedFiltrem = wybrane.length;
            wybrane = wybrane.filter(function (g) { return !czyPobrana(historia, g.id); });
            stan.pominieteJakoPobrane = przedFiltrem - wybrane.length;
            if (!wybrane.length) {
                ustawStatus('Wszystkie zaznaczone galerie są już pobrane (historia: ' + przedFiltrem + '). Odznacz „Pomijaj już pobrane”, aby pobrać je ponownie (pliki zostaną nadpisane).');
                return;
            }
        }

        stan.wTrakcie = true;
        stan.anulowano = false;
        stan.odIndeksu = 0;
        stan.zrobionePliki = 0;
        stan.bledyPlikow = 0;
        stan.pominieteGalerie = 0;
        stan.gotoweGalerie = 0;
        if (elStart) elStart.disabled = true;
        if (elStartWszystkie) elStartWszystkie.disabled = true;
        if (elAnuluj) elAnuluj.disabled = false;
        ustawPostepCalkowity();
        var infoStart = 'Start: ' + oczyscNazwe(modelkaDomyslna) + ', galerii do pobrania: ' + wybrane.length;
        if (stan.pominieteJakoPobrane) infoStart += ' (pominięto już pobrane: ' + stan.pominieteJakoPobrane + ')';
        ustawStatus(infoStart);

        przetworzKolejnaGalerie(modelkaDomyslna, wybrane);
    }

    // ------------------------------------------------------------------
    // Inicjalizacja: czekamy na miniaturki (odporność na późny DOM)
    // ------------------------------------------------------------------
    function init() {
        var proby = 0;
        var timer = setInterval(function () {
            proby++;
            var galerie = zbierzGalerie();
            if (galerie.length || proby > 20) {
                clearInterval(timer);
                var modelka = odczytajModelkeZeStrony();
                zbudujPanel(galerie, modelka);
                if (typeof GM_registerMenuCommand === 'function') {
                    GM_registerMenuCommand('⬇ Pobierz WSZYSTKIE galerie modelki (' + galerie.length + ')', function () { start(true); });
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
