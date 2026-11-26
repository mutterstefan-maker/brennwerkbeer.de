<?php
declare(strict_types=1);

// sendmail-compatible transport; credentials stay in the application data volume.
$path = getenv('BRENNWERK_CONFIG_FILE') ?: '/var/lib/brennwerk/config.php';
$config = is_file($path) ? require $path : [];
$keys = ['smtp_host', 'smtp_user', 'smtp_password', 'mail_from'];
foreach ($keys as $key) {
    if (!is_string($config[$key] ?? null) || $config[$key] === '' || preg_match('/[\r\n\x00]/', $config[$key])) {
        error_log('Brennwerk SMTP configuration is incomplete.');
        exit(78);
    }
}
$quote = static fn(string $value): string => '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $value) . '"';
$port = (int)($config['smtp_port'] ?? 465);
if ($port < 1 || $port > 65535 || !in_array($config['smtp_security'] ?? 'ssl', ['ssl', 'starttls'], true)) exit(78);
$temporary = tempnam(sys_get_temp_dir(), 'brennwerk-smtp-');
if ($temporary === false) exit(73);
chmod($temporary, 0600);
$status = 69;
try {
    $settings = "defaults\nauth on\ntls on\ntls_trust_file /etc/ssl/certs/ca-certificates.crt\ntimeout 15\naccount default\n";
    $settings .= 'host ' . $quote($config['smtp_host']) . "\nport $port\n";
    $settings .= 'tls_starttls ' . (($config['smtp_security'] ?? 'ssl') === 'ssl' ? 'off' : 'on') . "\n";
    $settings .= 'user ' . $quote($config['smtp_user']) . "\npasswordeval /usr/local/bin/php /usr/local/bin/brennwerk-smtp-password.php < /dev/null\n";
    $settings .= 'from ' . $quote($config['mail_from']) . "\n";
    if (file_put_contents($temporary, $settings) === false) throw new RuntimeException('SMTP configuration could not be written.');
    unset($settings, $config);
    $process = proc_open(['/usr/bin/msmtp', '--file=' . $temporary, '-t'], [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
    if (!is_resource($process)) throw new RuntimeException('SMTP transport could not start.');
    stream_copy_to_stream(STDIN, $pipes[0]);
    fclose($pipes[0]);
    $status = proc_close($process);
    if ($status !== 0) error_log('Brennwerk SMTP transport failed. The message remains queued.');
} catch (Throwable $error) {
    error_log('Brennwerk SMTP transport failed. The message remains queued.');
} finally {
    unlink($temporary);
}
exit($status === 0 ? 0 : 69);
