<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli' || !stream_isatty(STDIN)) {
    fwrite(STDERR, "Bitte interaktiv in PuTTY mit docker run -it ausführen.\n");
    exit(1);
}
$path = getenv('BRENNWERK_CONFIG_FILE') ?: '/var/lib/brennwerk/config.php';
$config = is_file($path) ? require $path : [];
function secret(string $prompt): string {
    fwrite(STDOUT, $prompt);
    system('stty -echo', $status);
    if ($status !== 0) throw new RuntimeException('Die verdeckte Eingabe konnte nicht aktiviert werden.');
    try { $value = fgets(STDIN); }
    finally { system('stty echo'); fwrite(STDOUT, "\n"); }
    if ($value === false) throw new RuntimeException('Eingabe abgebrochen.');
    return rtrim($value, "\r\n");
}
try {
    echo "Brennwerk Beer - nur diese Anwendung wird konfiguriert.\n";
    echo "Admin-Benutzer: Admin | Absender und Empfang: info@brennwerkbeer.de\n";
    $password = secret('Admin-Passwort (mindestens 12 Zeichen' . (!empty($config['password_hash']) ? ', Enter behält es bei' : '') . '): ');
    if ($password !== '') {
        if (strlen($password) < 12) throw new RuntimeException('Das Admin-Passwort benötigt mindestens 12 Zeichen.');
        if (!hash_equals($password, secret('Admin-Passwort wiederholen: '))) throw new RuntimeException('Die Admin-Passwörter stimmen nicht überein.');
        $config['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
    }
    unset($password);
    if (empty($config['password_hash'])) throw new RuntimeException('Ein Admin-Passwort wird benötigt.');
    $smtpPassword = secret('IONOS-Postfachpasswort für info@brennwerkbeer.de' . (!empty($config['smtp_password']) ? ' (Enter behält es bei)' : '') . ': ');
    if ($smtpPassword !== '') $config['smtp_password'] = $smtpPassword;
    unset($smtpPassword);
    if (empty($config['smtp_password'])) throw new RuntimeException('Das Postfachpasswort wird benötigt.');
    $config = array_replace($config, [
        'username' => 'Admin', 'mail_from' => 'info@brennwerkbeer.de', 'mail_to' => 'info@brennwerkbeer.de',
        'site_url' => 'https://brennwerkbeer.de', 'max_requests_per_hour' => 20,
        'smtp_host' => 'smtp.ionos.de', 'smtp_port' => 465, 'smtp_security' => 'ssl', 'smtp_user' => 'info@brennwerkbeer.de',
    ]);
    $temporary = tempnam(dirname($path), 'brennwerk-config-');
    if ($temporary === false) throw new RuntimeException('Die Konfigurationsdatei konnte nicht angelegt werden.');
    chmod($temporary, 0600);
    if (file_put_contents($temporary, "<?php\nreturn " . var_export($config, true) . ";\n") === false) throw new RuntimeException('Die Konfiguration konnte nicht gespeichert werden.');
    chown($temporary, 'www-data'); chgrp($temporary, 'www-data');
    if (!rename($temporary, $path)) throw new RuntimeException('Die Konfiguration konnte nicht aktiviert werden.');
    echo "Brennwerk-Konfiguration gespeichert. Es wurden keine E-Mails versendet.\n";
} catch (Throwable $error) {
    if (isset($temporary) && is_file($temporary)) unlink($temporary);
    fwrite(STDERR, $error->getMessage() . "\nEs wurde keine neue Konfiguration aktiviert.\n");
    exit(1);
}
