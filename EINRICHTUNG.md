# Buchungsverwaltung auf IONOS

## Voraussetzungen

PHP 8.1 oder neuer, PDO_SQLite, PHP-Sessions, für PDFs zusätzlich `mbstring` und `zlib`, Apache mit aktiven `.htaccess`-Regeln und ein beschreibbares Verzeichnis `private/`. Die Website muss über HTTPS laufen. Reines statisches Hosting und VS-Code-Live-Server reichen nicht mehr für Buchungen aus.

## Einrichtung

1. `private/config.example.php` nach `private/config.php` kopieren. Die echte Konfiguration bleibt außerhalb von Git.
2. Einen Passwort-Hash mit `php -r "echo password_hash('DEIN-LANGES-PASSWORT', PASSWORD_DEFAULT), PHP_EOL;"` erzeugen und als `password_hash` eintragen. Das Passwort selbst nicht in der Datei hinterlegen.
3. `mail_from` auf eine gültige Absenderadresse der eigenen Domain setzen. PHP `mail()` muss auf dem Server für diese Adresse eingerichtet sein. Falls der IONOS-Tarif ausschließlich authentifiziertes SMTP erlaubt, muss vor Inbetriebnahme ein SMTP-Transport ergänzt werden. `site_url` auf die öffentliche URL des Website-Verzeichnisses setzen (Standard: `https://brennwerkbeer.de`), damit persönliche Stornierungslinks auf die richtige Website zeigen.
4. Website inklusive `api/`, `private/.htaccess`, `private/vendor/tfpdf/` mit beiden Schriftdateien und Lizenzen, `admin.html`, CSS und JavaScript hochladen. Die Datenbank wird beim ersten Aufruf erstellt. `private/` nur für den PHP-Prozess beschreibbar machen, keine pauschalen 777-Rechte setzen. PDF-Bibliothek und Schriften sind mitgeliefert; Composer und externe PDF-Dienste sind nicht erforderlich.
5. **Vor echten Kundendaten:** `https://DEINE-DOMAIN/private/config.php` und `/private/bookings.sqlite` aufrufen. Der Server muss den direkten Zugriff mit 403 sperren. Bei Nginx ist eine entsprechende serverseitige Sperre erforderlich; `.htaccess` allein wirkt dort nicht.
6. `/admin.html` öffnen und anmelden. Unter „Einstellungen“ manuelle oder automatische Bestätigung wählen. Standard ist manuell. Der Modus gilt ausschließlich für neue Anfragen.
7. Testreservierung mit eigener E-Mail anlegen, Freigabe und Stornierung prüfen. Beide E-Mails, Absender, Spamordner und Kalender auf einem zweiten Gerät kontrollieren. Eine Annahme durch `mail()` garantiert keine Postfachzustellung. Fehlgeschlagene Übergaben stehen im Adminbereich und lassen sich erneut anstoßen.

## Verhalten

- Jeder Anhänger wird getrennt verwaltet. Beide Grenztage zählen vollständig, ein einzelner Tag ist zulässig.
- Reserviert, bestätigt und intern blockiert verhindern weitere Reservierungen für den Zeitraum. Überschneidungen werden in einer SQLite-Schreibtransaktion geprüft, auch bei konkurrierenden Anfragen.
- Manuell: Reservierungs-E-Mail sofort; Buchungs-E-Mail nach Freigabe. Automatisch: beide Nachrichten werden direkt in die Versandwarteschlange geschrieben und der Versand versucht.
- Offene Reservierungen laufen nicht automatisch ab. Michael bestätigt oder lehnt sie im Adminbereich ab.
- Ablehnung und Storno geben den Zeitraum frei und lösen eine Storno-E-Mail aus. Blockierungen haben keine Kunden-E-Mail.
- Kunden können Reservierungen und bestätigte Buchungen über den persönlichen Link in der Reservierungs- und Buchungs-E-Mail selbst zurücknehmen. Der Link erscheint auch direkt nach der Reservierung. Erst der Bestätigungsknopf auf der Website storniert; das Öffnen des Links allein ändert nichts. Mehrfaches Bestätigen versendet keine zusätzlichen Storno-E-Mails und verändert keine späteren Neubuchungen.
- Stornierungslinks sind mit einem zufälligen, in der geschützten Datenbank gespeicherten Schlüssel signiert. Der Schlüssel muss bei Backups und Umzügen erhalten bleiben. Die öffentliche Belegungsanzeige gibt ausschließlich Anhänger und belegte Zeiträume aus. Nur mit dem persönlichen Link sind zusätzlich Referenz und Status der jeweiligen Reservierung abrufbar; Kontaktdaten und interne Notizen bleiben geschützt.
- Jeder Kundeneintrag im Adminbereich bietet „PDF herunterladen“, „Drucken“ und „PDF per E-Mail senden“. Die A4-Übersicht enthält Kontaktdaten, Referenz, Anhänger, Mietzeitraum, aktuellen Status und Anmerkungen. Der PDF-Abruf erfordert eine aktive Admin-Sitzung. Interne Blockierungen erhalten kein Kundendokument.
- Der PDF-Mailversand erfolgt auf Knopfdruck an die gespeicherte Kundenadresse und ändert den Buchungsstatus nicht. Der genaue PDF-Anhang wird in der geschützten Versandwarteschlange gespeichert, sodass ein fehlgeschlagener Versand mit derselben Datei wiederholt werden kann. Normale Reservierungs- und Status-E-Mails bleiben Textnachrichten.
- Die bisherigen Beispieldaten aus `js/belegung.js` werden nicht mehr verwendet. Echte vorhandene Belegungen vor dem Start im Adminbereich blockieren.
- Kontakt- und Holzformulare sind weiterhin der bisherige Platzhalter und haben noch keinen echten Versand.

## Betrieb und Grenzen

Die Datenbank `private/bookings.sqlite` enthält Kundendaten, die E-Mail-Warteschlange und gegebenenfalls PDF-Anhänge in `outbox_attachments`. Regelmäßige geschützte Backups und ein Löschkonzept für alte Kundendaten einschließlich Anhängen einrichten. Die Datenschutzerklärung vor Inbetriebnahme an die zentrale Speicherung und den Mailversand anpassen.

Die erste Version bietet einen Adminzugang, keine Benutzerverwaltung oder Passwort-zurücksetzen-Funktion. Das Passwort kann über einen neuen Hash in `private/config.php` geändert werden. Nach einer Stunde Inaktivität muss man sich neu anmelden. Ein Versandversuch erfolgt bei Reservierung, Statusänderung und auf Knopfdruck; ein automatischer Hintergrundversand per Cron ist noch nicht eingerichtet. Die SQLite-Datenbank muss auf einer lokalen Serverplatte liegen.

## Lokal prüfen

PHP mit PDO_SQLite und mbstring installieren, Konfiguration wie oben anlegen und im Projekt `npm start` starten. Der Startbefehl aktiviert die Erweiterungen bei Bedarf aus der lokalen PHP-Installation. Die Seite läuft dann unter `http://127.0.0.1:8080/`, die Verwaltung unter `/admin.html`. `npm run dev` startet zusätzlich die Vite-Entwicklungsansicht mit angebundener PHP-API. Beide Startbefehle sperren den direkten Zugriff auf private Konfiguration und Datenbank. Nur lokal verwenden, niemals öffentlich betreiben.

Eine leere oder ungültige `mail_from`-Adresse lässt die Belegungsanzeige zu, sperrt aber das Absenden neuer Reservierungen. Nach Einrichtung der Absenderadresse genügt es, das Buchungsfenster erneut zu öffnen. Die Bestätigung bleibt standardmäßig manuell; automatische Buchungsbestätigung kann im Adminbereich eingestellt werden.

Isolierte API-Integrationstests ohne Änderung der Projekt-Datenbank: `python tests/booking_api.py PFAD_ZU_PHP` (für die PDF-Inhaltsprüfung vorher `python -m pip install pypdf`). Die Tests legen einen temporären Webroot an und prüfen auch die echten MIME-Anhänge gegen einen lokalen Test-Mailserver. PDF-Layoutbeispiele mit synthetischen Kundendaten: `php tests/booking-pdf.php .runtime/pdf-qa` bei aktivem mbstring. JavaScript-Syntax: `node --check js/main.js`, `node --check js/admin.js` und `node --check js/booking-document.js`.
