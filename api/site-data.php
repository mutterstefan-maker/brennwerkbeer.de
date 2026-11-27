<?php
declare(strict_types=1);

function defaultSiteContent(): array {
    return [
        'business_name' => 'Brennwerk Beer',
        'page_title' => 'Michael Beer – Anhängerverleih & Brennholz in Freising',
        'meta_description' => 'Kipper und Planenanhänger tageweise mieten und gespaltenes Brennholz liefern lassen – Michael Beer, Freising.',
        'home_title' => 'Brennwerk Beer · Anhänger & Brennholz in Freising',
        'trailer_eyebrow' => 'Anhängerverleih',
        'trailer_title' => 'Wähl deinen Anhänger.',
        'trailer_intro' => 'Tageweise mieten, in Freising abholen – Lieferung auf Anfrage.',
        'trailer_terms' => 'Preise inkl. Versicherung · mehrere Tage auf Anfrage · 150 € Kaution und gültiger Ausweis bei Abholung · Lieferung auf Anfrage · auch für Gewerbe.',
        'wood_eyebrow' => 'Brennholz',
        'wood_title' => 'Holz bestellen. Abladen lassen.',
        'wood_intro' => 'Weich- oder Hartholz in deiner Scheitlänge – wir liefern und kippen direkt bei dir ab.',
        'wood_soft_name' => 'Weichholz',
        'wood_soft_species' => 'Fichte / Kiefer, gespalten',
        'wood_soft_description' => 'Brennt schnell an und gibt rasch Wärme – gut zum Anheizen und für die Übergangszeit.',
        'wood_soft_lengths' => '1 m, 50 cm, 33 cm, 25 cm',
        'wood_soft_srm' => '65',
        'wood_soft_ster' => '85',
        'wood_hard_name' => 'Hartholz',
        'wood_hard_species' => 'Buche, Eiche, Esche, Ahorn, gespalten',
        'wood_hard_description' => 'Hoher Heizwert und lange Brenndauer – das klassische Brennholz für Kaminofen und Heizkamin.',
        'wood_hard_lengths' => '33 cm, 25 cm',
        'wood_hard_srm' => '100',
        'wood_hard_ster' => '140',
        'wood_terms' => 'Lieferkosten nach Entfernung (pro km) · max. 8 Schüttraummeter pro Lieferung · das Holz wird abgekippt, nicht eingeräumt.',
        'handover_title' => 'Die Übergabe machen wir persönlich.',
        'handover_text_1' => 'Du holst den Anhänger bei Michael Beer in der Kepserstraße 81 in Freising ab. Den Termin stimmen wir vorher mit dir ab. Bring deinen Ausweis und 150 € Kaution mit.',
        'handover_text_2' => 'Brennholz liefern wir zu dir und kippen es ab. Liefertermin und Kosten klären wir bei deiner Anfrage; eingeräumt wird das Holz nicht.',
        'handover_note' => 'Deine Anfrage ist erst bestätigt, wenn Michael sich bei dir gemeldet hat – in der Regel innerhalb von 24 Stunden.',
        'contact_title' => 'Michael Beer in Freising',
        'contact_intro' => 'Am schnellsten erreichst du Michael telefonisch.',
        'contact_name' => 'Michael Beer',
        'contact_street' => 'Kepserstraße 81',
        'contact_postal' => '85356',
        'contact_city' => 'Freising',
        'contact_phone' => '+49 171 2015568',
        'contact_email' => 'info@brennwerkbeer.de',
        'whatsapp_number' => '491712015568',
        'footer_description' => 'Anhängerverleih & Brennholz · Kepserstraße 81 · 85356 Freising',
    ];
}

function defaultTrailers(): array {
    return [
        [
            'id' => '1', 'name' => '3-Seitenkipper 3,5 t', 'price' => '60',
            'description' => 'Für Schüttgut, Erde, Kies, Sand, Grünabfall und Baustellenmaterial. Kippt nach rechts, links und hinten.',
            'specs' => [['label' => 'Gesamtgewicht', 'value' => '3,5 t'], ['label' => 'Nutzlast', 'value' => '2,5 t'], ['label' => 'Ladefläche', 'value' => '4 × 2 m'], ['label' => 'Höhe mit Gitter', 'value' => '0,95 m']],
            'images' => ['img/anhaenger/3-seitenkipper-seite.avif', 'img/anhaenger/3-seitenkipper-vorne.avif'],
        ],
        [
            'id' => '2', 'name' => 'Planenanhänger 2,7 t', 'price' => '50',
            'description' => 'Mit Planenaufbau – für alles, was geschützt und trocken transportiert werden soll.',
            'specs' => [['label' => 'Gesamtgewicht', 'value' => '2,7 t'], ['label' => 'Nutzlast', 'value' => '2,0 t'], ['label' => 'Ladefläche', 'value' => '3,3 × 1,8 m'], ['label' => 'Innenhöhe', 'value' => '1,8 m']],
            'images' => ['img/anhaenger/planenanhaenger-seite.avif', 'img/anhaenger/planenanhaenger-hinten.avif', 'img/anhaenger/planenanhaenger-vorne.avif'],
        ],
    ];
}

function ensureSiteData(PDO $db, array $config): void {
    $db->exec("CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS site_content (
            id INTEGER PRIMARY KEY CHECK(id=1),
            content TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trailers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            price TEXT NOT NULL,
            description TEXT NOT NULL,
            specs TEXT NOT NULL,
            images TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        );");

    if ((int)$db->query('SELECT COUNT(*) FROM admin_users')->fetchColumn() === 0) {
        $q = $db->prepare('INSERT INTO admin_users (username,password_hash,created_at) VALUES (?,?,?)');
        $q->execute([$config['username'] ?? 'Admin', $config['password_hash'], date(DATE_ATOM)]);
    }
    $q = $db->prepare('INSERT OR IGNORE INTO site_content VALUES (1,?,?)');
    $q->execute([json_encode(defaultSiteContent(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), date(DATE_ATOM)]);
    if ((int)$db->query('SELECT COUNT(*) FROM trailers')->fetchColumn() === 0) {
        $q = $db->prepare('INSERT INTO trailers (id,name,price,description,specs,images,active,sort_order,updated_at) VALUES (?,?,?,?,?,?,1,?,?)');
        foreach (defaultTrailers() as $index => $trailer) {
            $q->execute([$trailer['id'], $trailer['name'], $trailer['price'], $trailer['description'], json_encode($trailer['specs'], JSON_UNESCAPED_UNICODE), json_encode($trailer['images'], JSON_UNESCAPED_SLASHES), $index, date(DATE_ATOM)]);
        }
    }
}

function siteContent(PDO $db): array {
    $raw = $db->query('SELECT content FROM site_content WHERE id=1')->fetchColumn();
    $saved = is_string($raw) ? json_decode($raw, true) : [];
    return array_replace(defaultSiteContent(), is_array($saved) ? $saved : []);
}

function siteTrailers(PDO $db, bool $activeOnly = false): array {
    $where = $activeOnly ? ' WHERE active=1' : '';
    $rows = $db->query('SELECT id,name,price,description,specs,images,active,sort_order FROM trailers' . $where . ' ORDER BY sort_order,name')->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static function (array $row): array {
        $row['active'] = (bool)$row['active'];
        $row['sort_order'] = (int)$row['sort_order'];
        $row['specs'] = json_decode($row['specs'], true) ?: [];
        $row['images'] = json_decode($row['images'], true) ?: [];
        return $row;
    }, $rows);
}

function trailerName(PDO $db, string $id): string {
    $q = $db->prepare('SELECT name FROM trailers WHERE id=?');
    $q->execute([$id]);
    $name = $q->fetchColumn();
    return is_string($name) && $name !== '' ? $name : $id;
}

