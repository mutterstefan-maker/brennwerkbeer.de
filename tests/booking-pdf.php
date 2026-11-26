<?php
// Isolierte PDF-Beispiele: php -d extension=mbstring tests/booking-pdf.php AUSGABEORDNER
declare(strict_types=1);
date_default_timezone_set('Europe/Berlin');
require_once dirname(__DIR__) . '/api/booking-pdf.php';
$output = $argv[1] ?? dirname(__DIR__) . '/.runtime/pdf-qa';
if (!is_dir($output)) mkdir($output, 0775, true);
$booking = ['id' => 'TEST-2026-001', 'trailer' => '1', 'date_from' => '2026-12-10', 'date_to' => '2026-12-12',
    'name' => 'Jörg Müller-Öztürk', 'email' => 'joerg.mueller@example.com', 'phone' => '+49 171 1234567',
    'note' => 'Abholung am Vormittag. Bitte kurz vorher anrufen.', 'status' => 'pending', 'created_at' => '2026-11-26T15:30:00+01:00'];
file_put_contents($output . '/booking-short.pdf', bookingPdf($booking));
$booking['id'] = 'TEST-2026-002';
$booking['name'] = 'Jörg Müller-Öztürk und Małgorzata Łącka';
$booking['status'] = 'confirmed';
$booking['note'] = str_repeat("Längere Anmerkung zur Abholung und Rückgabe: Bitte die Zufahrt freihalten und vor der Ankunft telefonisch Bescheid geben.\n", 15);
file_put_contents($output . '/booking-long.pdf', bookingPdf($booking));
echo "PDF-Beispiele erzeugt.\n";
