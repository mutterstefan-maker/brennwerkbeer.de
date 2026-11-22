<?php
declare(strict_types=1);
date_default_timezone_set('Europe/Berlin');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
ini_set('display_errors', '0');
function reply(array $data, int $status = 200): never {
    http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit;
}
function fail(string $message, int $status = 400): never { reply(['error' => $message], $status); }
function field(array $data, string $key, int $max = 200, bool $required = true): string {
    $value = $data[$key] ?? '';
    if (!is_string($value) || strlen($value) > $max || ($required && trim($value) === '')) fail('Bitte alle Angaben vollständig und korrekt ausfüllen.');
    return trim($value);
}
function period(array $data): array {
    $trailer = field($data, 'trailer');
    if (!in_array($trailer, ['1', '2'], true)) fail('Ungültiger Anhänger.');
    $dates = [];
    foreach (['date_from', 'date_to'] as $key) {
        $value = field($data, $key, 10);
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (!$date || $date->format('Y-m-d') !== $value) fail('Ungültiges Datum.');
        $dates[] = $value;
    }
    if ($dates[0] < date('Y-m-d') || $dates[1] < $dates[0] || $dates[1] > date('Y-m-d', strtotime('+2 years'))) fail('Bitte einen gültigen Zeitraum ab heute innerhalb der nächsten zwei Jahre wählen.');
    return [$trailer, ...$dates];
}
try {
    $configPath = dirname(__DIR__) . '/private/config.php';
    if (!is_file($configPath)) fail('Die Buchungsverwaltung ist noch nicht eingerichtet.', 503);
    $config = require $configPath;
    if (empty($config['password_hash'])) fail('Die Serverkonfiguration ist unvollständig.', 503);
    if (!extension_loaded('pdo_sqlite')) fail('Die PHP-Erweiterung PDO_SQLite fehlt. Bitte auf dem Server aktivieren.', 503);
    if (!is_writable(dirname(__DIR__) . '/private')) fail('Das Verzeichnis private ist für PHP nicht beschreibbar. Bitte die Serverrechte prüfen.', 503);
    $db = new PDO('sqlite:' . dirname(__DIR__) . '/private/bookings.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec('PRAGMA busy_timeout = 5000');
    $db->exec("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL);
        INSERT OR IGNORE INTO settings VALUES (1, 'manual');
        CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, trailer TEXT NOT NULL, date_from TEXT NOT NULL, date_to TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY, booking_id TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, sent_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, claimed_until INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);");
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET', 'POST'], true)) fail('Methode nicht erlaubt.', 405);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 12000) fail('Anfrage zu groß.', 413);
    $input = $method === 'POST' ? json_decode(file_get_contents('php://input'), true) : [];
    if (!is_array($input)) fail('Ungültige Anfrage.');
    session_name('beer_admin');
    session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Strict', 'path' => '/']);
    session_start();
    $admin = !empty($_SESSION['admin']) && ($_SESSION['active'] ?? 0) > time() - 3600;
    if ($admin) $_SESSION['active'] = time();
    function throttle(PDO $db, string $scope, int $maximum): void {
        $key = hash('sha256', $scope . ($_SERVER['REMOTE_ADDR'] ?? '') . date('YmdH'));
        $db->exec('DELETE FROM limits WHERE expires < ' . time());
        $q = $db->prepare('INSERT INTO limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1');
        $q->execute([$key, time() + 3600]);
        $q = $db->prepare('SELECT count FROM limits WHERE key=?'); $q->execute([$key]);
        if ((int)$q->fetchColumn() > $maximum) fail('Zu viele Versuche. Bitte später erneut versuchen.', 429);
    }
    function queueMail(PDO $db, array $b, string $status): void {
        $labels = ['pending' => 'Reservierung eingegangen', 'confirmed' => 'Buchung bestätigt', 'cancelled' => 'Reservierung / Buchung storniert'];
        $trailer = $b['trailer'] === '1' ? '3-Seitenkipper 3,5 t' : 'Planenanhänger 2,7 t';
        $text = "Hallo {$b['name']},\n\n{$labels[$status]}.\nAnhänger: $trailer\nZeitraum: {$b['date_from']} bis {$b['date_to']} (beide Tage einschließlich)\nReferenz: {$b['id']}\n\n";
        $text .= $status === 'pending' ? "Die Tage sind für dich reserviert. Deine Buchung wird nach manueller Prüfung separat bestätigt.\n" : '';
        $text .= "\nBei Fragen: +49 171 2015568\nMichael Beer";
        $q = $db->prepare('INSERT INTO outbox (booking_id,recipient,subject,body) VALUES (?,?,?,?)');
        $q->execute([$b['id'], $b['email'], $labels[$status] . ' – Michael Beer', $text]);
    }
    function deliver(PDO $db, array $config): void {
        foreach ($db->query('SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT 20')->fetchAll(PDO::FETCH_ASSOC) as $mail) {
            $claim = $db->prepare('UPDATE outbox SET claimed_until=? WHERE id=? AND sent_at IS NULL AND claimed_until < ?');
            $claim->execute([time() + 600, $mail['id'], time()]);
            if (!$claim->rowCount()) continue;
            try {
                $ok = function_exists('mail') && @mail($mail['recipient'], '=?UTF-8?B?' . base64_encode($mail['subject']) . '?=', $mail['body'], ['From' => $config['mail_from'], 'Content-Type' => 'text/plain; charset=UTF-8']);
            } catch (Throwable $error) {
                error_log('Booking mail transport failed.');
                $ok = false;
            }
            $q = $db->prepare('UPDATE outbox SET attempts=attempts+1, sent_at=?, claimed_until=0 WHERE id=?');
            $q->execute([$ok ? date(DATE_ATOM) : null, $mail['id']]);
        }
    }
    if ($action === 'availability' && $method === 'GET') {
        $rows = $db->query("SELECT trailer,date_from,date_to FROM bookings WHERE status IN ('pending','confirmed','blocked') AND date_to >= date('now','-1 day')")->fetchAll(PDO::FETCH_ASSOC);
        reply([
            'periods' => $rows,
            'mode' => $db->query('SELECT mode FROM settings WHERE id=1')->fetchColumn(),
            'booking_enabled' => (bool)filter_var($config['mail_from'] ?? '', FILTER_VALIDATE_EMAIL),
            'today' => date('Y-m-d'),
            'max_date' => date('Y-m-d', strtotime('+2 years')),
        ]);
    }
    if ($action === 'login' && $method === 'POST') {
        throttle($db, 'login', 10);
        $username = field($input, 'username', 100);
        $passwordValid = password_verify(field($input, 'password', 1000), $config['password_hash']);
        if (!hash_equals($config['username'] ?? 'Admin', $username) || !$passwordValid) fail('Anmeldung fehlgeschlagen.', 401);
        session_regenerate_id(true); $_SESSION = ['admin' => true, 'active' => time(), 'csrf' => bin2hex(random_bytes(32))];
        reply(['csrf' => $_SESSION['csrf']]);
    }
    if ($action === 'reserve' && $method === 'POST') {
        if (!filter_var($config['mail_from'] ?? '', FILTER_VALIDATE_EMAIL)) fail('Der E-Mail-Versand ist noch nicht eingerichtet. Bitte telefonisch reservieren.', 503);
        throttle($db, 'reserve', (int)($config['max_requests_per_hour'] ?? 20));
        [$trailer, $from, $to] = period($input);
        $name = field($input, 'name'); $email = field($input, 'email', 254); $phone = field($input, 'phone', 80); $note = field($input, 'note', 2000, false);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $email)) fail('Bitte eine gültige E-Mail-Adresse eingeben.');
        $db->exec('BEGIN IMMEDIATE');
        $q = $db->prepare("SELECT COUNT(*) FROM bookings WHERE trailer=? AND status IN ('pending','confirmed','blocked') AND date_from <= ? AND date_to >= ?");
        $q->execute([$trailer, $to, $from]);
        if ($q->fetchColumn()) { $db->exec('ROLLBACK'); fail('Dieser Zeitraum wurde inzwischen belegt. Bitte andere Tage wählen.', 409); }
        $mode = $db->query('SELECT mode FROM settings WHERE id=1')->fetchColumn();
        $b = ['id' => bin2hex(random_bytes(8)), 'trailer' => $trailer, 'date_from' => $from, 'date_to' => $to, 'name' => $name, 'email' => $email, 'phone' => $phone, 'note' => $note, 'status' => $mode === 'automatic' ? 'confirmed' : 'pending', 'created_at' => date(DATE_ATOM)];
        $q = $db->prepare('INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?,?)'); $q->execute(array_values($b));
        queueMail($db, $b, 'pending');
        if ($b['status'] === 'confirmed') queueMail($db, $b, 'confirmed');
        $db->exec('COMMIT'); deliver($db, $config);
        reply(['id' => $b['id'], 'status' => $b['status']], 201);
    }
    if (!$admin) fail('Bitte anmelden.', 401);
    if ($method === 'POST' && !hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) fail('Sitzung ungültig. Bitte neu anmelden.', 403);
    if ($action === 'admin' && $method === 'GET') reply(['csrf' => $_SESSION['csrf'], 'mode' => $db->query('SELECT mode FROM settings WHERE id=1')->fetchColumn(), 'bookings' => $db->query('SELECT * FROM bookings ORDER BY date_from, created_at')->fetchAll(PDO::FETCH_ASSOC), 'unsent' => (int)$db->query('SELECT COUNT(*) FROM outbox WHERE sent_at IS NULL')->fetchColumn()]);
    if ($action === 'logout' && $method === 'POST') { $_SESSION = []; session_destroy(); reply(['ok' => true]); }
    if ($action === 'settings' && $method === 'POST') {
        $mode = field($input, 'mode'); if (!in_array($mode, ['manual', 'automatic'], true)) fail('Ungültiger Modus.');
        $q = $db->prepare('UPDATE settings SET mode=? WHERE id=1'); $q->execute([$mode]); reply(['ok' => true]);
    }
    if ($action === 'block' && $method === 'POST') {
        [$trailer, $from, $to] = period($input); $note = field($input, 'note', 2000, false);
        $db->exec('BEGIN IMMEDIATE');
        $q = $db->prepare("SELECT COUNT(*) FROM bookings WHERE trailer=? AND status IN ('pending','confirmed','blocked') AND date_from <= ? AND date_to >= ?"); $q->execute([$trailer, $to, $from]);
        if ($q->fetchColumn()) { $db->exec('ROLLBACK'); fail('Der Zeitraum überschneidet sich mit einer bestehenden Belegung.', 409); }
        $q = $db->prepare("INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,'blocked',?)");
        $q->execute([bin2hex(random_bytes(8)), $trailer, $from, $to, 'Eigene Blockierung', '', '', $note, date(DATE_ATOM)]);
        $db->exec('COMMIT'); reply(['ok' => true], 201);
    }
    if ($action === 'status' && $method === 'POST') {
        $id = field($input, 'id'); $status = field($input, 'status');
        if (!in_array($status, ['confirmed', 'cancelled'], true)) fail('Ungültiger Status.');
        $db->exec('BEGIN IMMEDIATE');
        $q = $db->prepare('SELECT * FROM bookings WHERE id=?'); $q->execute([$id]); $b = $q->fetch(PDO::FETCH_ASSOC);
        if (!$b) { $db->exec('ROLLBACK'); fail('Eintrag nicht gefunden.', 404); }
        if (!($status === 'confirmed' && $b['status'] === 'pending') && !($status === 'cancelled' && in_array($b['status'], ['pending','confirmed','blocked'], true))) { $db->exec('ROLLBACK'); fail('Dieser Statuswechsel ist nicht mehr möglich.', 409); }
        $q = $db->prepare('UPDATE bookings SET status=? WHERE id=?'); $q->execute([$status, $id]);
        if ($b['email']) queueMail($db, $b, $status);
        $db->exec('COMMIT'); deliver($db, $config); reply(['ok' => true]);
    }
    if ($action === 'retry-mail' && $method === 'POST') { deliver($db, $config); reply(['ok' => true]); }
    fail('Nicht gefunden.', 404);
} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log('Booking API: ' . $e->getMessage());
    fail('Serverfehler. Bitte später erneut versuchen oder telefonisch melden.', 500);
}
