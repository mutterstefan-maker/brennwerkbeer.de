<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/api/booking-email.php';
require_once dirname(__DIR__) . '/api/mail-message.php';

$directory = $argv[1] ?? dirname(__DIR__) . '/.runtime/mail-preview';
if (!is_dir($directory) && !mkdir($directory, 0755, true)) throw new RuntimeException('Preview directory unavailable.');
$booking = ['id' => 'VORSCHAU-12345678', 'trailer' => '2', 'name' => 'Anna Beispiel', 'date_from' => '2026-12-12', 'date_to' => '2026-12-14'];
foreach (['reservierung' => 'pending', 'bestaetigung' => 'confirmed', 'stornierung' => 'cancelled', 'pdf-begleitmail' => 'confirmed'] as $filename => $status) {
    $message = bookingEmail($booking + ['status' => $status], $status, $status === 'cancelled' ? null : 'https://brennwerkbeer.de/#stornierung=VORSCHAU.KEIN-ECHTER-LINK', $filename === 'pdf-begleitmail');
    file_put_contents($directory . '/' . $filename . '.html', $message['html']);
    $mime = mailMessage($message['text'], $message['html']);
    $eml = "From: Brennwerk Beer <info@brennwerkbeer.de>\r\nTo: Anna Beispiel <anna@example.com>\r\nSubject: =?UTF-8?B?" . base64_encode($message['subject']) . "?=\r\nMIME-Version: 1.0\r\n";
    foreach ($mime['headers'] as $name => $value) $eml .= $name . ': ' . $value . "\r\n";
    file_put_contents($directory . '/' . $filename . '.eml', $eml . "\r\n" . $mime['body']);
    echo $filename . ".html und .eml erstellt (nur Beispieldaten, kein Versand).\n";
}
