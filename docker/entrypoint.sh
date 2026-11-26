#!/bin/sh
set -eu
mkdir -p /var/lib/brennwerk
chown www-data:www-data /var/lib/brennwerk
exec docker-php-entrypoint "$@"
