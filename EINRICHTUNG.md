# Buchungsverwaltung: Coolify und IONOS

## Betrieb im eigenen Coolify-Container

Das `Dockerfile` erzeugt ein eigenständiges PHP-8.4-/Apache-Image mit SQLite, PDF-Unterstützung und IONOS-SMTP. Es kopiert ausschließlich Website-Dateien und Bibliotheken. Git-Verzeichnis, Testdaten, Archive und lokale Zugangsdaten gelangen nicht in das Image.

1. Ausschließlich die vorhandene Brennwerk-Anwendung in Coolify konfigurieren: Build Pack `Dockerfile`, Repository `https://github.com/mutterstefan-maker/brennwerkbeer.de.git`, Branch `main`, Commit-Auswahl `HEAD`, Basisverzeichnis `/` und Dockerfile `/Dockerfile`. Den aktuellen Stand von `main` bereitstellen. Der interne HTTP-Port ist `80`; keine öffentlichen Host-Ports neben dem vorhandenen Coolify-Proxy anlegen. Der Build Pack `Docker Image` verlangt in dieser Coolify-Version eine erreichbare Registry und lädt ein nur lokal gebautes Image nicht direkt.
2. Einen ausschließlich für Brennwerk verwendeten persistenten Ordner nach `/var/lib/brennwerk` einbinden. Dort liegen `config.php`, die SQLite-Datenbank, die Versandwarteschlange und der Schlüssel für Stornierungslinks. Das Verzeichnis muss für `www-data` beschreibbar sein und darf nicht mit anderen Websites geteilt werden.
3. Die interaktive Einrichtung aus dem Image ausführen: `docker run --rm -it --network none -v DEIN_BRENNWERK_DATENORDNER:/var/lib/brennwerk --entrypoint php DEIN_IMAGE /usr/local/bin/brennwerk-configure.php`. Passwörter werden verdeckt eingegeben. Die Einrichtung schreibt ausschließlich in diesen Datenordner. Der Administrator heißt `Admin`.
4. Absender und Empfänger für Website-Anfragen sind `info@brennwerkbeer.de`. Der Container übergibt E-Mails mit TLS an `smtp.ionos.de:465`; Zugangsdaten werden nicht in Kommandozeilen oder öffentliche Dateien geschrieben. Die sichere Passwortübergabe an msmtp erhält auch Sonderzeichen unverändert.
5. Den im Dockerfile enthaltenen PHP-Healthcheck übernehmen. Er prüft intern auf Port `80` die Buchungs-API `/api/index.php?action=availability` einschließlich ihrer Datenbankverbindung. Der HTTP-Healthcheck-Parser dieser Coolify-Version unterstützt kein `?` im Pfad. Erst nach erfolgreichem Start die Domain mit dem Server verbinden und HTTPS für `brennwerkbeer.de` und `www.brennwerkbeer.de` in dieser Coolify-Anwendung aktivieren.

Die Umgebungsvariablen `BRENNWERK_CONFIG_FILE` und `BRENNWERK_DATA_DIR` erlauben externe Konfigurations- und Datenverzeichnisse. Der Container setzt `BRENNWERK_TRUST_PROXY=1`, da ausschließlich der vorgeschaltete Coolify-Proxy auf ihn zugreifen soll. So erhalten HTTPS-Sitzungen sichere Cookies; Anfragelimits verwenden die vom Proxy weitergegebene Clientadresse. Diese Vertrauenseinstellung nur hinter einem entsprechend konfigurierten Proxy aktivieren.

Beim Umstellen der Website-DNS-Einträge bestehende MX- und SPF-Einträge für IONOS-Mail erhalten. Andere Anwendungen, Proxy-Grundeinstellungen und deren Datenträger gehören nicht zum Brennwerk-Deployment. Datenordner und Schlüssel bei Updates und Backups erhalten.

Für automatische Updates in derselben Coolify-Anwendung unter **Git Source** die vorhandene GitHub-App mit dem Repository `mutterstefan-maker/brennwerkbeer.de` verbinden. Branch `main` und Commit-Auswahl `HEAD` beibehalten. Unter **Advanced** muss **Auto Deploy** aktiviert sein. Die GitHub-App muss für dieses Repository installiert sein und Push-Ereignisse an Coolify übermitteln können.

Nach erfolgreicher Einrichtung genügt ein Push nach `main`; Coolify startet die Bereitstellung automatisch. Die Einrichtung mit einem echten Push prüfen: Ohne manuellen Redeploy muss ein neues Deployment mit genau diesem Commit erscheinen und erfolgreich mit einem gesunden Container enden. Im Bereitstellungsprotokoll den tatsächlich verwendeten Commit kontrollieren. Die gespeicherten Passwörter und Buchungen bleiben im eingebundenen Datenordner erhalten; die Passworteinrichtung ist bei einem Update nicht erneut nötig.

## Voraussetzungen

PHP 8.1 oder neuer, PDO_SQLite, PHP-Sessions, für PDFs zusätzlich `mbstring` und `zlib`, Apache mit aktiven `.htaccess`-Regeln und ein beschreibbares Verzeichnis `private/`. Die Website muss über HTTPS laufen. Reines statisches Hosting und VS-Code-Live-Server reichen nicht mehr für Buchungen aus.

## Einrichtung

1. `private/config.example.php` nach `private/config.php` kopieren. Die echte Konfiguration bleibt außerhalb von Git.
2. Einen Passwort-Hash mit `php -r "echo password_hash('DEIN-LANGES-PASSWORT', PASSWORD_DEFAULT), PHP_EOL;"` erzeugen und als `password_hash` eintragen. Das Passwort selbst nicht in der Datei hinterlegen.
3. `mail_from` auf eine gültige Absenderadresse der eigenen Domain setzen, `mail_to` bestimmt den Empfänger von Kontakt- und Holzanfragen. PHP `mail()` muss auf dem Webspace für diese Adresse eingerichtet sein. Der oben beschriebene Docker-Container enthält bereits den SMTP-Transport. `site_url` auf die öffentliche URL des Website-Verzeichnisses setzen (Standard: `https://brennwerkbeer.de`), damit persönliche Stornierungslinks auf die richtige Website zeigen.
4. Website inklusive `api/`, `private/.htaccess`, `private/vendor/tfpdf/` mit beiden Schriftdateien und Lizenzen, `admin.html`, CSS und JavaScript hochladen. Die Datenbank wird beim ersten Aufruf erstellt. `private/` nur für den PHP-Prozess beschreibbar machen, keine pauschalen 777-Rechte setzen. PDF-Bibliothek und Schriften sind mitgeliefert; Composer und externe PDF-Dienste sind nicht erforderlich.
5. **Vor echten Kundendaten:** `https://DEINE-DOMAIN/private/config.php` und `/private/bookings.sqlite` aufrufen. Der Server muss den direkten Zugriff mit 403 sperren. Bei Nginx ist eine entsprechende serverseitige Sperre erforderlich; `.htaccess` allein wirkt dort nicht.
6. `/admin.html` öffnen und anmelden. Unter „Einstellungen“ manuelle oder automatische Bestätigung wählen. Standard ist manuell. Der Modus gilt ausschließlich für neue Anfragen.
7. Testreservierung mit eigener E-Mail anlegen, Freigabe und Stornierung prüfen. Beide E-Mails, Absender, Spamordner und Kalender auf einem zweiten Gerät kontrollieren. Eine Annahme durch `mail()` garantiert keine Postfachzustellung. Fehlgeschlagene Übergaben stehen im Adminbereich und lassen sich erneut anstoßen.

## Verhalten

- Jeder Anhänger wird getrennt verwaltet. Beide Grenztage zählen vollständig, ein einzelner Tag ist zulässig.
- Reserviert, bestätigt und intern blockiert verhindern weitere Reservierungen für den Zeitraum. Überschneidungen werden in einer SQLite-Schreibtransaktion geprüft, auch bei konkurrierenden Anfragen.
- Manuell: Reservierungs-E-Mail sofort; Buchungs-E-Mail nach Freigabe. Automatisch: beide Nachrichten werden direkt in die Versandwarteschlange geschrieben und der Versand versucht.
- Kunden-E-Mails enthalten eine gestaltete HTML-Version und eine vollständige Textversion. Reservierungs- und Buchungsbestätigungen nennen die Abholung in der Kepserstraße 81, 85356 Freising, die vorherige Terminabstimmung sowie 150 € Kaution, Führerschein und Ausweis. Stornierungen enthalten keine Abholaufforderung. Der persönliche Stornierungslink erscheint in HTML als Button.
- HTML-Inhalt und gegebenenfalls PDF-Anhang werden mit der Nachricht geschützt gespeichert und bei Versandwiederholungen unverändert verwendet. Bereits vorhandene Textnachrichten in der Warteschlange bleiben versendbar. Für eine lokale Vorschau ohne Versand `php scripts/preview-booking-email.php` ausführen; die HTML- und EML-Beispiele liegen unter `.runtime/mail-preview/`.
- Offene Reservierungen laufen nicht automatisch ab. Michael bestätigt oder lehnt sie im Adminbereich ab.
- Ablehnung und Storno geben den Zeitraum frei und lösen eine Storno-E-Mail aus. Blockierungen haben keine Kunden-E-Mail.
- Kunden können Reservierungen und bestätigte Buchungen über den persönlichen Link in der Reservierungs- und Buchungs-E-Mail selbst zurücknehmen. Der Link erscheint auch direkt nach der Reservierung. Erst der Bestätigungsknopf auf der Website storniert; das Öffnen des Links allein ändert nichts. Mehrfaches Bestätigen versendet keine zusätzlichen Storno-E-Mails und verändert keine späteren Neubuchungen.
- Stornierungslinks sind mit einem zufälligen, in der geschützten Datenbank gespeicherten Schlüssel signiert. Der Schlüssel muss bei Backups und Umzügen erhalten bleiben. Die öffentliche Belegungsanzeige gibt ausschließlich Anhänger und belegte Zeiträume aus. Nur mit dem persönlichen Link sind zusätzlich Referenz und Status der jeweiligen Reservierung abrufbar; Kontaktdaten und interne Notizen bleiben geschützt.
- Jeder Kundeneintrag im Adminbereich bietet „PDF herunterladen“, „Drucken“ und „PDF per E-Mail senden“. Die A4-Übersicht enthält Kontaktdaten, Referenz, Anhänger, Mietzeitraum, aktuellen Status und Anmerkungen. Der PDF-Abruf erfordert eine aktive Admin-Sitzung. Interne Blockierungen erhalten kein Kundendokument.
- Der PDF-Mailversand erfolgt auf Knopfdruck an die gespeicherte Kundenadresse und ändert den Buchungsstatus nicht. Der genaue PDF-Anhang wird in der geschützten Versandwarteschlange gespeichert, sodass ein fehlgeschlagener Versand mit derselben Datei wiederholt werden kann. Normale Reservierungs- und Status-E-Mails bleiben Textnachrichten.
- Die bisherigen Beispieldaten aus `js/belegung.js` werden nicht mehr verwendet. Echte vorhandene Belegungen vor dem Start im Adminbereich blockieren.
- Kontakt- und Holzanfragen werden serverseitig geprüft und an die konfigurierte Empfangsadresse gesendet. Fehlgeschlagene Übergaben bleiben in der Versandwarteschlange und sind über den Adminbereich erneut versendbar. Die öffentliche Antwort verrät keine Kundendaten. Die GitHub-Demo zeigt ausdrücklich eine Vorführung ohne Versand.

## Betrieb und Grenzen

Die Datenbank `bookings.sqlite` im Datenverzeichnis enthält Kundendaten, die E-Mail-Warteschlange und gegebenenfalls PDF-Anhänge in `outbox_attachments`. Beim klassischen Webspace liegt sie unter `private/`, im Container im externen Datenordner. Regelmäßige geschützte Backups und ein Löschkonzept für alte Kundendaten einschließlich Anhängen einrichten. Angaben zum Anbieter und rechtliche Pflichtangaben mit dem Betreiber abstimmen; die Umsatzsteuer-ID bleibt bis zur Rückmeldung offen.

Die erste Version bietet einen Adminzugang, keine Benutzerverwaltung oder Passwort-zurücksetzen-Funktion. Das Passwort kann über einen neuen Hash in `private/config.php` geändert werden. Nach einer Stunde Inaktivität muss man sich neu anmelden. Ein Versandversuch erfolgt bei Reservierung, Statusänderung und auf Knopfdruck; ein automatischer Hintergrundversand per Cron ist noch nicht eingerichtet. Die SQLite-Datenbank muss auf einer lokalen Serverplatte liegen.

## Lokal prüfen

PHP mit PDO_SQLite und mbstring installieren, Konfiguration wie oben anlegen und im Projekt `npm start` starten. Der Startbefehl aktiviert die Erweiterungen bei Bedarf aus der lokalen PHP-Installation. Die Seite läuft dann unter `http://127.0.0.1:8080/`, die Verwaltung unter `/admin.html`. `npm run dev` startet zusätzlich die Vite-Entwicklungsansicht mit angebundener PHP-API. Beide Startbefehle sperren den direkten Zugriff auf private Konfiguration und Datenbank. Nur lokal verwenden, niemals öffentlich betreiben.

Eine leere oder ungültige `mail_from`-Adresse lässt die Belegungsanzeige zu, sperrt aber das Absenden neuer Reservierungen. Nach Einrichtung der Absenderadresse genügt es, das Buchungsfenster erneut zu öffnen. Die Bestätigung bleibt standardmäßig manuell; automatische Buchungsbestätigung kann im Adminbereich eingestellt werden.

Isolierte API-Integrationstests ohne Änderung der Projekt-Datenbank: `python tests/booking_api.py PFAD_ZU_PHP` (für die PDF-Inhaltsprüfung vorher `python -m pip install pypdf`). Die Tests legen einen temporären Webroot an und prüfen auch die echten MIME-Anhänge gegen einen lokalen Test-Mailserver. PDF-Layoutbeispiele mit synthetischen Kundendaten: `php tests/booking-pdf.php .runtime/pdf-qa` bei aktivem mbstring. JavaScript-Syntax: `node --check js/main.js`, `node --check js/admin.js` und `node --check js/booking-document.js`.
