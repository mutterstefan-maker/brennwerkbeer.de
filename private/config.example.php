<?php
return [
    'username' => 'Admin',
    // Erzeugen: php -r "echo password_hash('DEIN-LANGES-PASSWORT', PASSWORD_DEFAULT), PHP_EOL;"
    'password_hash' => '',
    // Vorläufiger Absender. Mailversand und Zustellung auf dem Webspace prüfen.
    'mail_from' => 'mutter.stefan@hotmail.com',
    // Öffentliche URL des Website-Verzeichnisses für persönliche Stornierungslinks.
    'site_url' => 'https://brennwerkbeer.de',
    // Optional: zusätzlicher Schutz vor automatisierten Anfragen.
    'max_requests_per_hour' => 20,
];
