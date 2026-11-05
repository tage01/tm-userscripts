# tm-userscripts

Skrypty Tampermonkey. Każdy plik `.user.js` ma nagłówki `@downloadURL` i `@updateURL`,
więc Tampermonkey sam sprawdza i pobiera nowe wersje z tego repo.

## Instalacja

Otwórz w przeglądarce link raw do wybranego skryptu, np.:

https://raw.githubusercontent.com/tage01/tm-userscripts/main/03_filmweb/naglowki/anti-clickbait.user.js

Tampermonkey zaproponuje instalację. Aktualizacje przychodzą automatycznie.

## Wersjonowanie

Żeby aktualizacja została wykryta, podbij `@version` w nagłówku skryptu przed commitem.

## Struktura

Katalogi odpowiadają strukturze z repo `opencode-test` (`01_downloaders/`, `02_cam/`,
`03_filmweb/`, `04_reddit/`, `05_narzedzia/`, `hbo/`).
