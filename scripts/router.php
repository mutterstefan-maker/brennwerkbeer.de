<?php
// Router ausschließlich für die lokale PHP-Vorschau; schützt auch ohne Apache/.htaccess.
declare(strict_types=1);
$path = str_replace('\\', '/', rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/'));
if (preg_match('~(?:^|/)(?:\.[^/]*|private|scripts|tests|node_modules)(?:/|$)~i', $path)) {
    http_response_code(403);
    exit('Zugriff verweigert.');
}
if ($path === '/api/index.php') {
    require dirname(__DIR__) . '/api/index.php';
    return true;
}
if ($path === '/' || preg_match('~^/(?:index|admin|impressum|datenschutz|orbit-demo)\.html$~', $path)
    || preg_match('~^/(?:css|js|img|carousel-assets)/~', $path) && !preg_match('~\.php(?:/|$)~i', $path)) {
    return false;
}
http_response_code(404);
exit('Nicht gefunden.');
