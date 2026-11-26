<?php
declare(strict_types=1);

/** MIME alternatives stay inside the mixed message when a PDF is attached. */
function mailMessage(string $text, ?string $html = null, ?array $attachment = null): array {
    $encode = static fn(string $content): string => chunk_split(base64_encode($content), 76, "\r\n");
    $textContent = static fn(string $content): string => str_replace("\n", "\r\n", str_replace(["\r\n", "\r"], "\n", $content));
    $headers = ['Content-Type' => 'text/plain; charset=UTF-8', 'Content-Transfer-Encoding' => 'base64'];
    $body = $encode($textContent($text));
    if ($html !== null) {
        $alternative = '=_Brennwerk_Alternative_' . bin2hex(random_bytes(12));
        $headers = ['Content-Type' => 'multipart/alternative; boundary="' . $alternative . '"'];
        $body = '--' . $alternative . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . $body;
        $body .= '--' . $alternative . "\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . $encode($textContent($html));
        $body .= '--' . $alternative . "--\r\n";
    }
    if ($attachment !== null) {
        $mixed = '=_Brennwerk_Mixed_' . bin2hex(random_bytes(12));
        $part = '';
        foreach ($headers as $name => $value) $part .= $name . ': ' . $value . "\r\n";
        $filename = addcslashes(str_replace(["\r", "\n"], '', $attachment['filename']), "\\\"");
        $body = '--' . $mixed . "\r\n" . $part . "\r\n" . $body
            . '--' . $mixed . "\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename=\"" . $filename . "\"\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . $encode($attachment['content']) . '--' . $mixed . "--\r\n";
        $headers = ['Content-Type' => 'multipart/mixed; boundary="' . $mixed . '"'];
    }
    return ['headers' => $headers, 'body' => $body];
}
