<?php
declare(strict_types=1);

/** Render once when queuing so retries keep the same booking details and links. */
function bookingEmail(array $booking, string $status, ?string $cancellationUrl, bool $hasDocument = false, array $site = []): array {
    $labels = ['pending' => 'Reservierung eingegangen', 'confirmed' => 'Buchung bestätigt', 'cancelled' => 'Reservierung / Buchung storniert'];
    if (!isset($labels[$status])) throw new InvalidArgumentException('Unknown booking email status.');
    $escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $from = new DateTimeImmutable($booking['date_from']);
    $to = new DateTimeImmutable($booking['date_to']);
    $days = (int)$from->diff($to)->days + 1;
    $duration = $days . ($days === 1 ? ' Miettag' : ' Miettage');
    $dateFrom = $from->format('d.m.Y');
    $dateTo = $to->format('d.m.Y');
    $trailer = $booking['trailer_name'] ?? ($booking['trailer'] === '1' ? '3-Seitenkipper 3,5 t' : 'Planenanhänger 2,7 t');
    $contactName = (string)($site['contact_name'] ?? 'Michael Beer');
    $contactStreet = (string)($site['contact_street'] ?? 'Kepserstraße 81');
    $contactLocation = trim((string)($site['contact_postal'] ?? '85356') . ' ' . (string)($site['contact_city'] ?? 'Freising'));
    $contactPhone = (string)($site['contact_phone'] ?? '+49 171 2015568');
    $contactEmail = (string)($site['contact_email'] ?? 'info@brennwerkbeer.de');
    $contactNameHtml = $escape($contactName); $contactStreetHtml = $escape($contactStreet); $contactLocationHtml = $escape($contactLocation);
    $contactPhoneHtml = $escape($contactPhone); $contactEmailHtml = $escape($contactEmail);
    $contactPhoneHref = preg_replace('/[^+0-9]/', '', $contactPhone);
    $mapsUrl = 'https://www.google.com/maps/search/?api=1&amp;query=' . rawurlencode($contactStreet . ', ' . $contactLocation);
    $headline = $hasDocument ? 'Deine Buchungsübersicht.' : [
        'pending' => 'Reservierung eingegangen.',
        'confirmed' => 'Deine Buchung ist bestätigt.',
        'cancelled' => 'Stornierung bestätigt.',
    ][$status];
    $description = [
        'pending' => ($booking['status'] ?? 'pending') === 'confirmed'
            ? 'Die Tage sind für dich reserviert. Deine Buchungsbestätigung erhältst du in einer separaten E-Mail.'
            : 'Die Tage sind für dich reserviert. Nach manueller Prüfung erhältst du eine separate Buchungsbestätigung.',
        'confirmed' => 'Dein Anhänger ist für den unten genannten Zeitraum gebucht. Wir freuen uns auf dich!',
        'cancelled' => 'Deine Reservierung bzw. Buchung wurde storniert. Der Zeitraum wurde wieder freigegeben.',
    ][$status];
    $documentText = $hasDocument ? 'Deine Buchungsübersicht als PDF findest du im Anhang dieser E-Mail.' : '';
    $badge = ['pending' => 'Reserviert', 'confirmed' => 'Bestätigt', 'cancelled' => 'Storniert'][$status];
    $badgeBackground = ['pending' => '#FFF1D9', 'confirmed' => '#E7F2EB', 'cancelled' => '#EEEEF0'][$status];
    $badgeColor = ['pending' => '#87500C', 'confirmed' => '#24613D', 'cancelled' => '#55555D'][$status];
    $nameHtml = $escape($booking['name']);
    $trailerHtml = $escape($trailer);
    $referenceHtml = $escape($booking['id']);
    $headlineHtml = $escape($headline);
    $descriptionHtml = $escape($description);
    $preheaderHtml = $escape(($hasDocument ? 'Deine Buchungsübersicht als PDF' : $labels[$status]) . ' · ' . $trailer . ' · ' . $dateFrom . ' bis ' . $dateTo);
    $documentHtml = $hasDocument
        ? '<p style="margin:0 0 24px;padding:14px 16px;background:#FFF1D9;border-left:3px solid #FF9D21;color:#39352F;font-size:15px;line-height:24px;">' . $escape($documentText) . '</p>'
        : '';

    $pickupText = '';
    $pickupHtml = '';
    if ($status !== 'cancelled') {
        $pickupText = "\nAbholung\n$contactName\n$contactStreet\n$contactLocation\nDen genauen Abholtermin stimmen wir vorher mit dir ab.\n\nBitte mitbringen:\n- 150 € Kaution\n- Gültigen Führerschein\n- Gültigen Ausweis\n";
        $pickupHtml = <<<HTML
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:24px;background:#F6F4F0;border:1px solid #E8E3DB;border-radius:4px;">
  <tr><td style="padding:22px 22px 18px;">
    <h2 style="margin:0 0 12px;color:#202023;font-size:19px;line-height:25px;">Deine Abholung</h2>
    <p style="margin:0 0 8px;color:#39393F;font-size:15px;line-height:23px;"><strong>$contactNameHtml</strong><br>$contactStreetHtml<br>$contactLocationHtml</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:22px;"><a href="$mapsUrl" style="color:#7B4708;text-decoration:underline;">Route zur Abholung öffnen</a></p>
    <p style="margin:0;color:#606068;font-size:14px;line-height:22px;">Den genauen Abholtermin stimmen wir vorher mit dir ab.</p>
  </td></tr>
  <tr><td style="padding:18px 22px 22px;border-top:1px solid #E8E3DB;">
    <h3 style="margin:0 0 12px;color:#202023;font-size:16px;line-height:23px;">Bitte mitbringen</h3>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="color:#39393F;font-size:15px;line-height:24px;">
      <tr><td valign="top" width="20" style="width:20px;color:#9A5807;">&bull;</td><td><strong>150 € Kaution</strong></td></tr>
      <tr><td valign="top" style="color:#9A5807;">&bull;</td><td>Gültigen Führerschein</td></tr>
      <tr><td valign="top" style="color:#9A5807;">&bull;</td><td>Gültigen Ausweis</td></tr>
    </table>
  </td></tr>
</table>
HTML;
    }

    $actionText = '';
    $actionHtml = '';
    if ($status !== 'cancelled' && $cancellationUrl !== null) {
        $button = $status === 'confirmed' ? 'Buchung zurücknehmen' : 'Reservierung zurücknehmen';
        $urlHtml = $escape($cancellationUrl);
        $buttonHtml = $escape($button);
        $actionText = "\nDu kannst deine Reservierung oder Buchung selbst zurücknehmen:\n$cancellationUrl\nErst nach deiner Bestätigung auf der Website werden die Tage wieder freigegeben. Bitte diesen persönlichen Link nicht weitergeben.\n";
        $actionHtml = <<<HTML
<h2 style="margin:28px 0 8px;color:#202023;font-size:19px;line-height:26px;">Deine Pläne haben sich geändert?</h2>
<p style="margin:0 0 18px;color:#606068;font-size:15px;line-height:24px;">Über deinen persönlichen Link kannst du die Reservierung oder Buchung selbst zurücknehmen.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FF9D21" style="background:#FF9D21;border-radius:4px;text-align:center;mso-padding-alt:14px 22px;">
  <a href="$urlHtml" style="display:inline-block;padding:14px 22px;border:1px solid #FF9D21;border-radius:4px;color:#17110A;font-size:15px;font-weight:bold;line-height:22px;text-decoration:none;">$buttonHtml</a>
</td></tr></table>
<p style="margin:12px 0 0;color:#6A6A72;font-size:12px;line-height:19px;">Erst nach deiner Bestätigung auf der Website werden die Tage wieder freigegeben. Bitte diesen persönlichen Link nicht weitergeben.</p>
HTML;
    }

    $text = "Hallo {$booking['name']},\n\n" . ($hasDocument ? $documentText . "\n" : '') . $labels[$status] . ".\n$description\n\nAnhänger: $trailer\nZeitraum: $dateFrom bis $dateTo (beide Tage einschließlich)\nMietdauer: $duration\nReferenz: {$booking['id']}\n";
    $text .= $pickupText . $actionText . "\nBei Fragen zur Buchung oder Abholung:\n$contactPhone\n$contactEmail\n\n$contactName · Brennwerk Beer\n$contactStreet · $contactLocation\nhttps://brennwerkbeer.de\n";
    $html = <<<HTML
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>$headlineHtml</title>
  <style>
    body,table,td,a { font-family:Arial,Helvetica,sans-serif; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    @media screen and (max-width:600px) {
      .mail-outside { padding:12px 8px!important; }
      .mail-padding { padding:24px 20px!important; }
      .mail-title { font-size:26px!important; line-height:32px!important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background:#F0EEEA;color:#39393F;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;">$preheaderHtml</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F0EEEA" style="width:100%;background:#F0EEEA;">
<tr><td class="mail-outside" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #E5E1DA;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td class="mail-padding" bgcolor="#151516" style="padding:28px 32px;background:#151516;border-top:4px solid #FF9D21;">
    <a href="https://brennwerkbeer.de" style="color:#FFFFFF;font-size:24px;font-weight:bold;letter-spacing:1px;line-height:30px;text-decoration:none;">BRENNWERK <span style="color:#FF9D21;">BEER</span></a>
    <p style="margin:6px 0 0;color:#BDBDC3;font-size:11px;letter-spacing:1px;line-height:18px;">ANHÄNGERVERLEIH &amp; BRENNHOLZ &nbsp;&middot;&nbsp; FREISING</p>
  </td></tr>
  <tr><td class="mail-padding" style="padding:32px;">
    <span style="display:inline-block;padding:6px 10px;background:$badgeBackground;color:$badgeColor;border-radius:3px;font-size:12px;font-weight:bold;line-height:18px;">$badge</span>
    <h1 class="mail-title" style="margin:16px 0 22px;color:#202023;font-size:30px;line-height:37px;letter-spacing:-0.5px;">$headlineHtml</h1>
    <p style="margin:0 0 12px;color:#39393F;font-size:16px;line-height:25px;">Hallo $nameHtml,</p>
    <p style="margin:0 0 24px;color:#606068;font-size:15px;line-height:24px;">$descriptionHtml</p>
    $documentHtml
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #E2E2E5;border-radius:4px;">
      <tr><td colspan="2" style="padding:18px 20px;border-bottom:1px solid #E2E2E5;">
        <p style="margin:0 0 5px;color:#6A6A72;font-size:11px;letter-spacing:1px;line-height:17px;">DEIN ANHÄNGER</p>
        <p style="margin:0;color:#202023;font-size:18px;font-weight:bold;line-height:25px;">$trailerHtml</p>
      </td></tr>
      <tr>
        <td width="50%" valign="top" style="width:50%;padding:16px 20px;">
          <p style="margin:0 0 5px;color:#6A6A72;font-size:11px;letter-spacing:0.5px;line-height:17px;">ERSTER MIETTAG</p>
          <p style="margin:0;color:#202023;font-size:17px;font-weight:bold;line-height:24px;">$dateFrom</p>
        </td>
        <td width="50%" valign="top" style="width:50%;padding:16px 20px;">
          <p style="margin:0 0 5px;color:#6A6A72;font-size:11px;letter-spacing:0.5px;line-height:17px;">LETZTER MIETTAG</p>
          <p style="margin:0;color:#202023;font-size:17px;font-weight:bold;line-height:24px;">$dateTo</p>
        </td>
      </tr>
      <tr><td colspan="2" style="padding:12px 20px 16px;">
        <p style="margin:0;color:#606068;font-size:13px;line-height:20px;">$duration &nbsp;&middot;&nbsp; Abhol- und Rückgabetag eingeschlossen.</p>
      </td></tr>
      <tr><td colspan="2" style="padding:12px 20px;background:#FAFAFB;border-top:1px solid #E2E2E5;">
        <span style="color:#6A6A72;font-size:12px;line-height:20px;">Referenz:</span> <span style="color:#39393F;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:20px;">$referenceHtml</span>
      </td></tr>
    </table>
    $pickupHtml
    $actionHtml
    <p style="margin:28px 0 0;color:#39393F;font-size:15px;line-height:24px;">Viele Grüße<br><strong>$contactNameHtml</strong></p>
  </td></tr>
  <tr><td class="mail-padding" style="padding:22px 32px;background:#F7F7F8;border-top:1px solid #E5E5E8;">
    <p style="margin:0 0 6px;color:#39393F;font-size:14px;font-weight:bold;line-height:22px;">Fragen zur Buchung oder Abholung?</p>
    <p style="margin:0;color:#606068;font-size:14px;line-height:24px;"><a href="tel:$contactPhoneHref" style="color:#39393F;text-decoration:underline;">$contactPhoneHtml</a><br><a href="mailto:$contactEmailHtml" style="color:#39393F;text-decoration:underline;">$contactEmailHtml</a></p>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:20px 0 0;color:#777780;font-size:11px;line-height:19px;text-align:center;">$contactNameHtml &nbsp;&middot;&nbsp; $contactStreetHtml &nbsp;&middot;&nbsp; $contactLocationHtml<br><a href="https://brennwerkbeer.de/impressum.html" style="color:#606068;text-decoration:underline;">Impressum</a> &nbsp;&middot;&nbsp; <a href="https://brennwerkbeer.de/datenschutz.html" style="color:#606068;text-decoration:underline;">Datenschutz</a></p>
</td></tr></table>
</body>
</html>
HTML;
    return [
        'subject' => ($hasDocument ? 'Deine Buchungsübersicht' : $labels[$status]) . ' – Brennwerk Beer',
        'text' => $text,
        'html' => $html,
    ];
}
