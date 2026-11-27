<?php
declare(strict_types=1);
require_once __DIR__ . '/booking-email.php';
require_once __DIR__ . '/mail-message.php';
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
    $configPath = getenv('BRENNWERK_CONFIG_FILE') ?: dirname(__DIR__) . '/private/config.php';
    if (!is_file($configPath)) fail('Die Buchungsverwaltung ist noch nicht eingerichtet.', 503);
    $config = require $configPath;
    if (empty($config['password_hash'])) fail('Die Serverkonfiguration ist unvollständig.', 503);
    if (!extension_loaded('pdo_sqlite')) fail('Die PHP-Erweiterung PDO_SQLite fehlt. Bitte auf dem Server aktivieren.', 503);
    $dataDirectory = getenv('BRENNWERK_DATA_DIR') ?: dirname(__DIR__) . '/private';
    if (!is_dir($dataDirectory) || !is_writable($dataDirectory)) fail('Das Buchungsverzeichnis ist für PHP nicht beschreibbar. Bitte die Serverrechte prüfen.', 503);
    $db = new PDO('sqlite:' . $dataDirectory . '/bookings.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec('PRAGMA busy_timeout = 5000');
    $db->exec("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL);
        INSERT OR IGNORE INTO settings VALUES (1, 'manual');
        CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, trailer TEXT NOT NULL, date_from TEXT NOT NULL, date_to TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY, booking_id TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, sent_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, claimed_until INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS outbox_html (mail_id INTEGER PRIMARY KEY, content TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox_attachments (mail_id INTEGER PRIMARY KEY, filename TEXT NOT NULL, content BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS cancellation_key (id INTEGER PRIMARY KEY CHECK(id=1), secret TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);");
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET', 'POST'], true)) fail('Methode nicht erlaubt.', 405);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 12000) fail('Anfrage zu groß.', 413);
    $input = $method === 'POST' ? json_decode(file_get_contents('php://input'), true) : [];
    if (!is_array($input)) fail('Ungültige Anfrage.');
    session_name('beer_admin');
    $trustProxy = getenv('BRENNWERK_TRUST_PROXY') === '1';
    $secureRequest = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($trustProxy && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $clientAddress = $_SERVER['REMOTE_ADDR'] ?? '';
    if ($trustProxy && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $forwarded = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        $forwardedAddress = trim(end($forwarded));
        if (filter_var($forwardedAddress, FILTER_VALIDATE_IP)) $clientAddress = $forwardedAddress;
    }
    session_set_cookie_params(['httponly' => true, 'secure' => $secureRequest, 'samesite' => 'Strict', 'path' => '/']);
    function throttle(PDO $db, string $scope, int $maximum): void {
        global $clientAddress;
        $key = hash('sha256', $scope . $clientAddress . date('YmdH'));
        $db->exec('DELETE FROM limits WHERE expires < ' . time());
        $q = $db->prepare('INSERT INTO limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1');
        $q->execute([$key, time() + 3600]);
        $q = $db->prepare('SELECT count FROM limits WHERE key=?'); $q->execute([$key]);
        if ((int)$q->fetchColumn() > $maximum) fail('Zu viele Versuche. Bitte später erneut versuchen.', 429);
    }
    function cancellationToken(PDO $db, string $id): string {
        $secret = $db->query('SELECT secret FROM cancellation_key WHERE id=1')->fetchColumn();
        if ($secret === false) {
            $q = $db->prepare('INSERT OR IGNORE INTO cancellation_key VALUES (1,?)');
            $q->execute([bin2hex(random_bytes(32))]);
            $secret = $db->query('SELECT secret FROM cancellation_key WHERE id=1')->fetchColumn();
        }
        return hash_hmac('sha256', 'cancel:' . $id, $secret);
    }
    function queueMail(PDO $db, array $b, string $status, array $config, ?string $attachment = null): int {
        $url = $status === 'cancelled' ? null
            : rtrim($config['site_url'] ?? 'https://brennwerkbeer.de', '/') . '/#stornierung=' . $b['id'] . '.' . cancellationToken($db, $b['id']);
        $message = bookingEmail($b, $status, $url, $attachment !== null);
        $q = $db->prepare('INSERT INTO outbox (booking_id,recipient,subject,body) VALUES (?,?,?,?)');
        $q->execute([$b['id'], $b['email'], $message['subject'], $message['text']]);
        $mailId = (int)$db->lastInsertId();
        $q = $db->prepare('INSERT INTO outbox_html VALUES (?,?)');
        $q->execute([$mailId, $message['html']]);
        if ($attachment !== null) {
            $q = $db->prepare('INSERT INTO outbox_attachments VALUES (?,?,?)');
            $q->bindValue(1, $mailId, PDO::PARAM_INT);
            $q->bindValue(2, bookingDocumentFilename($b));
            $q->bindValue(3, $attachment, PDO::PARAM_LOB);
            $q->execute();
        }
        return $mailId;
    }
    function deliver(PDO $db, array $config): void {
        foreach ($db->query('SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT 20')->fetchAll(PDO::FETCH_ASSOC) as $mail) {
            $claim = $db->prepare('UPDATE outbox SET claimed_until=? WHERE id=? AND sent_at IS NULL AND claimed_until < ?');
            $claim->execute([time() + 600, $mail['id'], time()]);
            if (!$claim->rowCount()) continue;
            try {
                $q = $db->prepare('SELECT content FROM outbox_html WHERE mail_id=?');
                $q->execute([$mail['id']]); $html = $q->fetchColumn();
                $q = $db->prepare('SELECT filename,content FROM outbox_attachments WHERE mail_id=?');
                $q->execute([$mail['id']]); $attachment = $q->fetch(PDO::FETCH_ASSOC);
                $message = mailMessage($mail['body'], $html === false ? null : $html, $attachment ?: null);
                $headers = ['From' => 'Brennwerk Beer <' . $config['mail_from'] . '>', 'MIME-Version' => '1.0'] + $message['headers'];
                $subject = function_exists('mb_encode_mimeheader') ? mb_encode_mimeheader($mail['subject'], 'UTF-8', 'B', "\r\n")
                    : '=?UTF-8?B?' . base64_encode($mail['subject']) . '?=';
                $ok = function_exists('mail') && @mail($mail['recipient'], $subject, $message['body'], $headers);
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
    if ($action === 'inquiry' && $method === 'POST') {
        $recipient = $config['mail_to'] ?? 'info@brennwerkbeer.de';
        if (!filter_var($config['mail_from'] ?? '', FILTER_VALIDATE_EMAIL) || !filter_var($recipient, FILTER_VALIDATE_EMAIL)
            || preg_match('/[\r\n]/', $recipient)) fail('Online-Anfragen sind momentan nicht verfügbar. Bitte telefonisch melden: +49 171 2015568.', 503);
        throttle($db, 'inquiry', (int)($config['max_requests_per_hour'] ?? 20));
        $kind = field($input, 'kind', 20);
        $name = field($input, 'name');
        if ($kind === 'contact') {
            $email = field($input, 'email', 254);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $email)) fail('Bitte eine gültige E-Mail-Adresse eingeben.');
            $message = field($input, 'message', 4000);
            $subject = 'Neue Kontaktanfrage – Brennwerk Beer';
            $body = "Kontaktanfrage über brennwerkbeer.de\n\nName: $name\nE-Mail: $email\n\nNachricht:\n$message\n";
        } elseif ($kind === 'wood') {
            $phone = field($input, 'phone', 80); $address = field($input, 'address', 400);
            $type = field($input, 'wood_type', 10); $length = field($input, 'length', 10); $unit = field($input, 'unit', 10);
            $amount = field($input, 'amount', 6); $note = field($input, 'note', 2000, false);
            $wood = ['weich' => ['name' => 'Weichholz (Fichte / Kiefer)', 'lengths' => ['1 m', '50 cm', '33 cm', '25 cm']],
                'hart' => ['name' => 'Hartholz (Buche, Eiche, Esche, Ahorn)', 'lengths' => ['33 cm', '25 cm']]];
            if (!isset($wood[$type]) || !in_array($length, $wood[$type]['lengths'], true) || !in_array($unit, ['srm', 'ster'], true)
                || !preg_match('/^[1-9][0-9]*$/', $amount) || ($unit === 'srm' && (int)$amount > 8)) fail('Bitte Holzsorte, Scheitlänge und Menge korrekt auswählen.');
            $unitLabel = $unit === 'srm' ? 'Schüttraummeter (SRM)' : 'Ster';
            $subject = 'Neue Brennholzanfrage – Brennwerk Beer';
            $body = "Brennholzanfrage über brennwerkbeer.de\n\nName: $name\nTelefon: $phone\nLieferadresse: $address\n\nHolzsorte: {$wood[$type]['name']}\nScheitlänge: $length\nMenge: $amount $unitLabel\n\nAnmerkungen:\n$note\n";
        } else {
            fail('Ungültige Anfrage.');
        }
        $q = $db->prepare('INSERT INTO outbox (booking_id,recipient,subject,body) VALUES (?,?,?,?)');
        $q->execute(['inquiry-' . bin2hex(random_bytes(8)), $recipient, $subject, $body]);
        $mailId = (int)$db->lastInsertId();
        deliver($db, $config);
        $q = $db->prepare('SELECT sent_at FROM outbox WHERE id=?'); $q->execute([$mailId]);
        reply(['ok' => true, 'sent' => (bool)$q->fetchColumn()], 201);
    }
    if ($action === 'login' && $method === 'POST') {
        throttle($db, 'login', 10);
        $username = field($input, 'username', 100);
        $passwordValid = password_verify(field($input, 'password', 1000), $config['password_hash']);
        if (!hash_equals($config['username'] ?? 'Admin', $username) || !$passwordValid) fail('Anmeldung fehlgeschlagen.', 401);
        session_start();
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
        queueMail($db, $b, 'pending', $config);
        if ($b['status'] === 'confirmed') queueMail($db, $b, 'confirmed', $config);
        $db->exec('COMMIT'); deliver($db, $config);
        reply(['id' => $b['id'], 'status' => $b['status'], 'cancellation_token' => cancellationToken($db, $b['id'])], 201);
    }
    if (in_array($action, ['cancellation-details', 'cancel'], true)) {
        if ($method !== 'POST') fail('Methode nicht erlaubt.', 405);
        throttle($db, 'cancellation', 60);
        $id = field($input, 'id', 32); $token = field($input, 'token', 64);
        $q = $db->prepare('SELECT * FROM bookings WHERE id=?'); $q->execute([$id]); $b = $q->fetch(PDO::FETCH_ASSOC);
        if (!$b || !$b['email'] || !in_array($b['status'], ['pending', 'confirmed', 'cancelled'], true)
            || !hash_equals(cancellationToken($db, $id), $token)) fail('Dieser Stornierungslink ist ungültig. Bitte den vollständigen Link aus deiner E-Mail öffnen.', 404);
        if ($action === 'cancellation-details') reply(array_intersect_key($b, array_flip(['id', 'trailer', 'date_from', 'date_to', 'status'])));
        $db->exec('BEGIN IMMEDIATE');
        $q = $db->prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND status IN ('pending','confirmed')");
        $q->execute([$id]);
        $alreadyCancelled = $q->rowCount() === 0;
        if ($alreadyCancelled) {
            $q = $db->prepare('SELECT status FROM bookings WHERE id=?'); $q->execute([$id]);
            if ($q->fetchColumn() !== 'cancelled') { $db->exec('ROLLBACK'); fail('Diese Reservierung kann nicht zurückgenommen werden.', 409); }
        } else {
            queueMail($db, $b, 'cancelled', $config);
        }
        $db->exec('COMMIT');
        if (!$alreadyCancelled) deliver($db, $config);
        reply(['id' => $id, 'status' => 'cancelled', 'already_cancelled' => $alreadyCancelled]);
    }
    // Public booking actions above neither create nor resume an admin session.
    if (empty($_COOKIE[session_name()])) fail('Bitte anmelden.', 401);
    session_start();
    $admin = !empty($_SESSION['admin']) && ($_SESSION['active'] ?? 0) > time() - 3600;
    if (!$admin) fail('Bitte anmelden.', 401);
    $_SESSION['active'] = time();
    if ($method === 'POST' && !hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) fail('Sitzung ungültig. Bitte neu anmelden.', 403);
    if ($action === 'admin' && $method === 'GET') reply(['csrf' => $_SESSION['csrf'], 'mode' => $db->query('SELECT mode FROM settings WHERE id=1')->fetchColumn(), 'bookings' => $db->query('SELECT * FROM bookings ORDER BY date_from, created_at')->fetchAll(PDO::FETCH_ASSOC), 'unsent' => (int)$db->query('SELECT COUNT(*) FROM outbox WHERE sent_at IS NULL')->fetchColumn()]);
    if (($action === 'document' && $method === 'GET') || ($action === 'email-document' && $method === 'POST')) {
        $id = field($method === 'GET' ? $_GET : $input, 'id', 32);
        $q = $db->prepare('SELECT * FROM bookings WHERE id=?'); $q->execute([$id]); $b = $q->fetch(PDO::FETCH_ASSOC);
        if (!$b || !$b['email']) fail('Keine Kundenreservierung gefunden.', 404);
        if (!extension_loaded('mbstring')) fail('Für PDF-Dateien bitte die PHP-Erweiterung mbstring auf dem Server aktivieren.', 503);
        if ($action === 'email-document') {
            if (!filter_var($config['mail_from'] ?? '', FILTER_VALIDATE_EMAIL)) fail('Der E-Mail-Versand ist noch nicht eingerichtet.', 503);
            throttle($db, 'document-mail', 20);
        }
        require_once __DIR__ . '/booking-pdf.php';
        $pdf = bookingPdf($b);
        if ($action === 'document') {
            header('Content-Type: application/pdf');
            header('Content-Disposition: ' . (($_GET['inline'] ?? '') === '1' ? 'inline' : 'attachment') . '; filename="' . bookingDocumentFilename($b) . '"');
            header('Content-Length: ' . strlen($pdf));
            echo $pdf; exit;
        }
        $db->exec('BEGIN IMMEDIATE');
        $mailId = queueMail($db, $b, $b['status'], $config, $pdf);
        $db->exec('COMMIT'); deliver($db, $config);
        $q = $db->prepare('SELECT sent_at FROM outbox WHERE id=?'); $q->execute([$mailId]);
        reply(['ok' => true, 'sent' => (bool)$q->fetchColumn(), 'recipient' => $b['email']]);
    }
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
        if ($b['email']) queueMail($db, $b, $status, $config);
        $db->exec('COMMIT'); deliver($db, $config); reply(['ok' => true]);
    }
    if ($action === 'retry-mail' && $method === 'POST') { deliver($db, $config); reply(['ok' => true]); }
    fail('Nicht gefunden.', 404);
} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log('Booking API: ' . $e->getMessage());
    fail('Serverfehler. Bitte später erneut versuchen oder telefonisch melden.', 500);
}
