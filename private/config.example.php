<?php
return [
    'username' => 'Admin',
    // Erzeugen: php -r "echo password_hash('DEIN-LANGES-PASSWORT', PASSWORD_DEFAULT), PHP_EOL;"
    'password_hash' => '',
    // Absenderadresse der eigenen Domain verwenden (IONOS-Mailkonfiguration beachten).
    'mail_from' => 'buchung@deine-domain.de',
    // Optional: zusätzlicher Schutz vor automatisierten Anfragen.
    'max_requests_per_hour' => 20,
];
