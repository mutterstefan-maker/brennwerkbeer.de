FROM php:8.4-apache-bookworm

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates libonig-dev libsqlite3-dev msmtp \
    && docker-php-ext-install -j2 mbstring pdo_sqlite \
    && a2enmod headers \
    && rm -rf /var/lib/apt/lists/*

ENV BRENNWERK_CONFIG_FILE=/var/lib/brennwerk/config.php \
    BRENNWERK_DATA_DIR=/var/lib/brennwerk \
    BRENNWERK_TRUST_PROXY=1

COPY docker/apache.conf /etc/apache2/conf-available/brennwerk.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/brennwerk.ini
COPY docker/sendmail.php /usr/local/bin/brennwerk-sendmail.php
COPY docker/smtp-password.php /usr/local/bin/brennwerk-smtp-password.php
COPY docker/configure.php /usr/local/bin/brennwerk-configure.php
COPY docker/entrypoint.sh /usr/local/bin/brennwerk-entrypoint
RUN a2enconf brennwerk && chmod 755 /usr/local/bin/brennwerk-entrypoint

WORKDIR /var/www/html
COPY index.html admin.html impressum.html datenschutz.html ./
COPY css/ ./css/
COPY js/ ./js/
COPY img/ ./img/
COPY fonts/ ./fonts/
COPY carousel-assets/ ./carousel-assets/
COPY api/ ./api/
COPY private/vendor/ ./private/vendor/
COPY private/.htaccess ./private/.htaccess

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["php", "-r", "$data = json_decode(@file_get_contents('http://127.0.0.1/api/index.php?action=availability') ?: '{}', true); exit(isset($data['periods']) && is_array($data['periods']) ? 0 : 1);"]
ENTRYPOINT ["brennwerk-entrypoint"]
CMD ["apache2-foreground"]
