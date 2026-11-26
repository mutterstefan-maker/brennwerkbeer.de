<?php
declare(strict_types=1);

// Called only by msmtp; the password is passed through its private command pipe.
$path = getenv('BRENNWERK_CONFIG_FILE') ?: '/var/lib/brennwerk/config.php';
$config = is_file($path) ? require $path : [];
$password = $config['smtp_password'] ?? '';
if (!is_string($password) || $password === '' || preg_match('/[\r\n\x00]/', $password)) exit(78);
echo $password;
