<?php
return [
    'username' => 'Admin',
    // Erzeugen: php -r "echo password_hash('DEIN-LANGES-PASSWORT', PASSWORD_DEFAULT), PHP_EOL;"
    'password_hash' => '',
    // Eigenes Postfach; bei leerem Absender sind Online-Reservierungen gesperrt.
    'mail_from' => '',
    'mail_to' => 'info@brennwerkbeer.de',
    // SMTP wird im Docker-Container für den Versand verwendet.
    'smtp_host' => 'smtp.ionos.de',
    'smtp_port' => 465,
    'smtp_security' => 'ssl',
    'smtp_user' => 'info@brennwerkbeer.de',
    'smtp_password' => '',
    // Öffentliche URL des Website-Verzeichnisses für persönliche Stornierungslinks.
    'site_url' => 'https://brennwerkbeer.de',
    // Optional: zusätzlicher Schutz vor automatisierten Anfragen.
    'max_requests_per_hour' => 20,
];
