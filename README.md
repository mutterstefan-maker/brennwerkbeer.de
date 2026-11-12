# Michael Beer – Anhängerverleih & Holzhandel

Website für Michael Beer, Langenbach (Bayern).

## Leistungen
- Anhängerverleih (tagesbasiert, Online-Buchung)
- Holzhandel mit Lieferservice

## Technik
- Reines HTML / CSS / JavaScript
- AOS-Animationen
- Responsive Design

## Entwicklung
Für die statische Ansicht `index.html` im Browser öffnen. Buchungen und Adminbereich benötigen PHP und SQLite. Einrichtung und Betrieb: [EINRICHTUNG.md](EINRICHTUNG.md).

Adminbereich: `/admin.html`. Enthält Reservierungsfreigabe, Stornierung, eigene Terminblockierungen und die Umschaltung zwischen manueller und automatischer Bestätigung.

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

Zum lokalen Entwickeln `npm run dev` starten und `/src/dev.html` öffnen.
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
