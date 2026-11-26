<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/private/vendor/tfpdf/font/unifont/ttfonts.php';
require_once dirname(__DIR__) . '/private/vendor/tfpdf/tfpdf.php';

final class BookingPdf extends tFPDF {
    public function Header() {
        $this->SetTextColor(35, 46, 52);
        $this->SetFont('DejaVu', 'B', 21);
        $this->Cell(110, 9, 'BRENNWERK BEER');
        $this->SetFont('DejaVu', '', 9);
        $this->SetXY(132, 18);
        $this->MultiCell(60, 5, "Michael Beer\nKepserstraße 81\n85356 Freising\n+49 171 2015568", 0, 'R');
        $this->SetXY(18, 29);
        $this->SetFont('DejaVu', '', 10);
        $this->Cell(105, 7, 'Anhängerverleih & Brennholz');
        $this->SetDrawColor(221, 107, 24);
        $this->SetLineWidth(.7);
        $this->Line(18, 43, 192, 43);
        $this->SetY(51);
    }

    public function Footer() {
        $this->SetY(-20);
        $this->SetDrawColor(210, 216, 220);
        $this->SetLineWidth(.2);
        $this->Line(18, $this->GetY(), 192, $this->GetY());
        $this->SetFont('DejaVu', '', 8);
        $this->SetTextColor(87, 98, 106);
        $this->Cell(140, 8, 'Michael Beer | Kepserstraße 81 | 85356 Freising');
        $this->Cell(34, 8, 'Seite ' . $this->PageNo(), 0, 0, 'R');
    }

    public function section(string $title): void {
        if ($this->GetY() > 248) $this->AddPage();
        $this->Ln(5);
        $this->SetFont('DejaVu', 'B', 12);
        $this->SetTextColor(35, 46, 52);
        $this->Cell(0, 9, $title, 0, 1);
    }

    public function detail(string $label, string $value): void {
        if ($this->GetY() > 253) $this->AddPage();
        $this->SetFont('DejaVu', '', 10);
        $this->SetTextColor(87, 98, 106);
        $this->Cell(40, 6, $label);
        $this->SetTextColor(35, 46, 52);
        $this->MultiCell(134, 6, $value !== '' ? $value : '-', 0, 'L');
        $this->Ln(1);
    }
}

function bookingDocumentFilename(array $booking): string {
    return 'Brennwerk-Beer-' . preg_replace('/[^a-zA-Z0-9-]/', '', $booking['id']) . '.pdf';
}

function bookingPdf(array $booking): string {
    $pdf = new BookingPdf('P', 'mm', 'A4');
    $pdf->SetMargins(18, 18, 18);
    $pdf->SetAutoPageBreak(true, 25);
    $pdf->AddFont('DejaVu', '', 'DejaVuSansCondensed.ttf', true);
    $pdf->AddFont('DejaVu', 'B', 'DejaVuSansCondensed-Bold.ttf', true);
    $pdf->SetTitle('Buchungsübersicht ' . $booking['id'], true);
    $pdf->SetAuthor('Michael Beer', true);
    $pdf->SetCreator('Brennwerk Beer', true);
    $pdf->AddPage();
    $pdf->SetFont('DejaVu', 'B', 20);
    $pdf->Cell(0, 11, 'Buchungsübersicht', 0, 1);
    $pdf->SetFont('DejaVu', '', 9);
    $pdf->SetTextColor(87, 98, 106);
    $pdf->Cell(0, 6, 'Erstellt am ' . date('d.m.Y H:i') . ' Uhr', 0, 1);
    $labels = ['pending' => 'Reserviert - noch nicht bestätigt', 'confirmed' => 'Bestätigte Buchung', 'cancelled' => 'Storniert'];
    $formatDate = static fn(string $date): string => (new DateTimeImmutable($date))->format('d.m.Y');
    $days = (new DateTimeImmutable($booking['date_from']))->diff(new DateTimeImmutable($booking['date_to']))->days + 1;
    $pdf->section('Buchung');
    $pdf->detail('Referenz', $booking['id']);
    $pdf->detail('Status', $labels[$booking['status']] ?? $booking['status']);
    $pdf->detail('Anhänger', $booking['trailer'] === '1' ? '3-Seitenkipper 3,5 t' : 'Planenanhänger 2,7 t');
    $pdf->detail('Mietbeginn', $formatDate($booking['date_from']));
    $pdf->detail('Mietende', $formatDate($booking['date_to']));
    $pdf->detail('Mietdauer', $days . ' ' . ($days === 1 ? 'Tag' : 'Tage') . ' (beide Grenztage einschließlich)');
    $pdf->detail('Eingegangen', (new DateTimeImmutable($booking['created_at']))->setTimezone(new DateTimeZone('Europe/Berlin'))->format('d.m.Y H:i') . ' Uhr');
    $pdf->section('Kundendaten');
    $pdf->detail('Name', $booking['name']);
    $pdf->detail('Telefon', $booking['phone']);
    $pdf->detail('E-Mail', $booking['email']);
    $pdf->section('Anmerkungen');
    $pdf->SetFont('DejaVu', '', 10);
    $pdf->MultiCell(0, 6, trim($booking['note']) !== '' ? $booking['note'] : 'Keine Anmerkungen.', 0, 'L');
    $pdf->Ln(6);
    $pdf->SetFont('DejaVu', '', 9);
    $pdf->SetTextColor(87, 98, 106);
    $pdf->MultiCell(0, 5, $booking['status'] === 'pending'
        ? 'Diese Übersicht dokumentiert deine Reservierung. Die Buchung wird nach Prüfung separat bestätigt.'
        : ($booking['status'] === 'cancelled' ? 'Diese Reservierung / Buchung wurde storniert.' : 'Deine Buchung ist bestätigt.'), 0, 'L');
    return $pdf->Output('S');
}
