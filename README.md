# Michael Beer – Anhängerverleih & Holzhandel

Website für Michael Beer, Freising (Bayern).

## Leistungen
- Anhängerverleih (tagesbasiert, Online-Buchung)
- Holzhandel mit Lieferservice

## Technik
- Reines HTML / CSS / JavaScript
- React-/GSAP-Carousel
- Responsive Design
- Lokal ausgelieferte Schriftarten
- Separates PHP-/Apache-Docker-Image für Coolify mit persistenten Buchungsdaten und IONOS-SMTP

## Entwicklung
Für den funktionsfähigen Buchungskalender `npm start` ausführen und `http://127.0.0.1:8080/` öffnen. Der Startbefehl verwendet installiertes PHP oder die lokale Laufzeit unter `.runtime/php/php.exe` und aktiviert PDO_SQLite. Mit `BRENNWERK_PHP` kann eine andere PHP-Datei gewählt werden; `BRENNWERK_PORT` ändert den Port. Einrichtung und Betrieb: [EINRICHTUNG.md](EINRICHTUNG.md).

Adminbereich: `/admin.html`. Enthält Reservierungsfreigabe, Stornierung, eigene Terminblockierungen, Kunden-PDFs zum Herunterladen und Drucken, PDF-Versand an die gespeicherte Kundenadresse und die Umschaltung zwischen manueller und automatischer Bestätigung. Die PDF-Erzeugung nutzt die mitgelieferte PHP-Bibliothek und benötigt mbstring und zlib.

Produktivbetrieb über das `Dockerfile`: eigener persistenter Datenordner unter `/var/lib/brennwerk`, Konfiguration über die verdeckte Eingabe in `docker/configure.php`, interner Port 80 und Weiterleitung ausschließlich über den vorhandenen Coolify-Proxy. Kontakt- und Holzanfragen sowie Buchungs-E-Mails verwenden das konfigurierte IONOS-Postfach. Einzelheiten und Update-Hinweise stehen in [EINRICHTUNG.md](EINRICHTUNG.md).

## Kalender und Verwaltung vorführen

Kundensicht: [Kalender-Demo](https://mutterstefan-maker.github.io/brennwerkbeer.de/index.html?demo=kalender).
Verwaltung: [Demo-Adminbereich](https://mutterstefan-maker.github.io/brennwerkbeer.de/admin.html?demo=kalender).

Beide Links im selben Browser öffnen. In der Kundensicht sind Testkontaktdaten ausgefüllt und Beispielbelegungen sichtbar. Freie Tage wählen und „Demo-Buchung testen“ anklicken. Die Buchung erscheint sofort als Reservierung in der Demo-Verwaltung. Über „Reservierung zurücknehmen“ kann der Kunde seine Anfrage selbst zurücknehmen; der Link zeigt zuerst eine Rückfrage. In der Verwaltung kann die Reservierung bestätigt oder storniert werden. Storno gibt die Tage wieder frei. Eigene Blockierungen und automatische Bestätigung können ebenfalls vorgeführt werden.

Auf GitHub Pages ist die Demo automatisch aktiv. Auf dem PHP-Webspace wird sie ausschließlich mit `?demo=kalender` eingeschaltet. Sie benötigt kein PHP und keinen Adminzugang, versendet keine E-Mails und verändert die echte Buchungsdatenbank nicht. Demo-Daten werden getrennt im Browser gespeichert; bitte nur Testdaten eingeben. „Demo zurücksetzen“ stellt die Beispielbelegungen wieder her. An einem neuen Tag startet die Demo frisch.

In der Demo lassen sich Kundendokumente drucken und über „Als PDF speichern“ im Druckdialog sichern. Der PDF-Mailversand wird dort ausdrücklich nur vorgeführt. Im Echtbetrieb erzeugt der PHP-Server die PDF zum direkten Download und versendet sie auf Anforderung als Anhang. Fehlgeschlagene Übergaben bleiben einschließlich PDF in der Versandwarteschlange und können erneut versucht werden.

## Webdesign
[ChefBlick](https://chefblick.de) – Stefan Mutter

## React Orbit Carousel

Die Startseite verwendet das Orbit-Carousel für Anhänger und Brennholz (`src/home.tsx`).
Die ursprüngliche Restaurant-Demo bleibt separat unter `/orbit-demo.html` erreichbar.
Nur die separate Demo enthält Restaurant-Beispieldaten.
Die bestehende HTML/PHP-Website läuft weiterhin unabhängig von React.

Einrichtung und Build (Node.js 20.19+ oder 22.12+):

```sh
npm install
npm run build
```

Zum lokalen Entwickeln `npm run dev` starten. Die Startseite und die Buchungsverwaltung verwenden dann ebenfalls den automatisch gestarteten PHP-Buchungsserver. Die separate React-Vorschau ist unter `/src/dev.html` erreichbar. Private Konfiguration, Datenbank und Laufzeitdateien sind in beiden lokalen Vorschauen gesperrt.
Für die Veröffentlichung `orbit-demo.html` und den erzeugten Ordner `carousel-assets/`
zusammen mit der bestehenden Website auf den PHP-Webspace kopieren.

- Wiederverwendbare TSX-Komponente: `components/ui/dish-orbit-carousel.tsx`.
- Beispieldaten und mitgelieferte, eingebettete Bilder: `src/demo.tsx`.
- Tailwind-v4-Einstieg und Theme: `src/carousel.css`.
- TypeScript und der Alias `@/` sind in `tsconfig.json` und `vite.config.ts` eingerichtet.
- `components.json` definiert die shadcn-Verzeichnisstruktur. `components/ui` hält
  wiederverwendbare UI-Bausteine getrennt von Seiten und passt zu den Importen der Vorlage.
  Weitere shadcn-Komponenten können bei Bedarf mit `npx shadcn@latest add button` ergänzt werden.
- GSAP steuert die Animationen, Lucide liefert die Aktionssymbole. Kein Context-Provider nötig.
- Die Demo nutzt `loop={false}`, damit Besucher die Sektion verlassen können.
  Optionale Video-/Bestellaktionen erscheinen erst bei gesetzten Callbacks.
- Likes sind lokaler React-Zustand und werden nicht gespeichert.
