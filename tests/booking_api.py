"""Integrationstest mit isolierter Datenbank: python tests/booking_api.py PFAD_ZU_PHP"""
import concurrent.futures
from email import policy
from email.parser import BytesParser
import http.cookiejar
import io
import json
from pathlib import Path
import shutil
import socket
import socketserver
import sqlite3
import subprocess
import sys
import tempfile
import time
import threading
import urllib.error
import urllib.request
from pypdf import PdfReader

php = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parents[1]
class MailSink(socketserver.StreamRequestHandler):
    reject = False
    messages = []
    def handle(self):
        self.wfile.write(b'220 localhost test SMTP\r\n')
        in_data = False
        message = bytearray()
        for line in self.rfile:
            if in_data:
                if line == b'.\r\n':
                    in_data = False
                    self.messages.append(bytes(message))
                    message.clear()
                    self.wfile.write(b'250 accepted\r\n')
                else:
                    message.extend(line[1:] if line.startswith(b'..') else line)
            elif line.upper().startswith(b'DATA'):
                in_data = True
                self.wfile.write(b'354 end with dot\r\n')
            elif self.reject and line.upper().startswith(b'MAIL'):
                self.wfile.write(b'550 test failure\r\n')
            elif line.upper().startswith(b'QUIT'):
                self.wfile.write(b'221 bye\r\n')
                break
            else:
                self.wfile.write(b'250 ok\r\n')
smtp = socketserver.ThreadingTCPServer(('127.0.0.1', 0), MailSink)
smtp.daemon_threads = True
threading.Thread(target=smtp.serve_forever, daemon=True).start()
with tempfile.TemporaryDirectory() as directory:
    work = Path(directory)
    (work / 'api').mkdir()
    (work / 'private').mkdir()
    (work / 'scripts').mkdir()
    shutil.copy(root / 'api/index.php', work / 'api/index.php')
    shutil.copy(root / 'api/booking-pdf.php', work / 'api/booking-pdf.php')
    shutil.copytree(root / 'private/vendor', work / 'private/vendor')
    shutil.copy(root / 'scripts/router.php', work / 'scripts/router.php')
    password_hash = subprocess.check_output([str(php), '-r', "echo password_hash('integration-test-password', PASSWORD_DEFAULT);"], text=True)
    config = "<?php return ['password_hash'=>'" + password_hash + "','mail_from'=>'booking@example.com'];"
    (work / 'private/config.php').write_text(config, encoding='utf-8')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    command = [str(php), '-d', f'session.save_path={work}', '-d', 'default_socket_timeout=1', '-d', 'SMTP=127.0.0.1', '-d', f'smtp_port={smtp.server_address[1]}']
    if sys.platform == 'win32':
        command += ['-d', f'extension_dir={php.parent / "ext"}', '-d', 'extension=pdo_sqlite', '-d', 'extension=mbstring']
    command += ['-S', f'127.0.0.1:{port}', '-t', str(work), str(work / 'scripts/router.php')]
    with (work / 'server.log').open('w') as log:
        server = subprocess.Popen(command, stdout=log, stderr=log)
        try:
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            def request(action, data=None, token=None, client=opener, binary=False):
                headers = {'Content-Type': 'application/json'}
                if token:
                    headers['X-CSRF-Token'] = token
                req = urllib.request.Request(f'http://127.0.0.1:{port}/api/index.php?action={action}', data=json.dumps(data).encode() if data is not None else None, headers=headers)
                try:
                    with client.open(req, timeout=4) as response:
                        return response.status, ({'body': response.read(), 'headers': response.headers} if binary else json.load(response))
                except urllib.error.HTTPError as error:
                    return error.code, json.load(error)
            for attempt in range(50):
                try:
                    status, data = request('availability')
                    break
                except urllib.error.URLError:
                    time.sleep(.1)
            assert status == 200 and data['mode'] == 'manual', (status, data)
            assert data['booking_enabled'] is True
            assert data['today'] < data['max_date']
            for path in ('/private/config.php', '/private/bookings.sqlite', '/scripts/router.php', '/.git/config', '/.runtime/php/php.exe'):
                try:
                    urllib.request.urlopen(f'http://127.0.0.1:{port}{path}', timeout=4)
                    raise AssertionError(f'Privater Pfad erreichbar: {path}')
                except urllib.error.HTTPError as error:
                    assert error.code == 403, (path, error.code)
            (work / 'private/config.php').write_text(config.replace('booking@example.com', ''), encoding='utf-8')
            assert request('availability')[1]['booking_enabled'] is False
            assert request('reserve', {})[0] == 503
            (work / 'private/config.php').write_text(config, encoding='utf-8')
            assert request('availability')[1]['booking_enabled'] is True
            assert request('admin')[0] == 401
            assert request('document&id=unknown')[0] == 401
            assert request('email-document', {'id': 'unknown'})[0] == 401
            assert request('login', {'username': 'Admin', 'password': 'wrong'})[0] == 401
            assert request('login', {'username': 'Andere', 'password': 'integration-test-password'})[0] == 401
            status, data = request('login', {'username': 'Admin', 'password': 'integration-test-password'})
            assert status == 200
            csrf = data['csrf']
            assert request('settings', {'mode': 'automatic'})[0] == 403
            from datetime import datetime, timedelta
            day = (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
            booking = dict(trailer='1', date_from=day, date_to=day, name='Testkunde', email='test@example.com', phone='012345', note='<script>test</script>')
            status, reserved = request('reserve', booking)
            assert status == 201 and reserved['status'] == 'pending', (status, reserved)
            assert len(reserved['cancellation_token']) == 64
            status, pdf = request(f"document&id={reserved['id']}", binary=True)
            assert status == 200 and pdf['body'].startswith(b'%PDF-')
            assert pdf['headers']['Content-Type'] == 'application/pdf'
            assert pdf['headers']['Content-Disposition'].startswith('attachment;')
            assert 'no-store' in pdf['headers']['Cache-Control']
            pending_text = ''.join(page.extract_text() for page in PdfReader(io.BytesIO(pdf['body'])).pages)
            assert all(value in pending_text for value in ['Buchungsübersicht', 'Testkunde', 'test@example.com', '012345', reserved['id'], 'Reserviert - noch nicht bestätigt', '<script>test</script>'])
            assert request(f"document&id={reserved['id']}", client=urllib.request.build_opener())[0] == 401
            assert request('document&id=unknown')[0] == 404
            customer = urllib.request.build_opener()
            credentials = {'id': reserved['id'], 'token': reserved['cancellation_token']}
            assert request('cancel')[0] == 405
            assert request('cancel', {'id': reserved['id'], 'token': '0' * 64}, client=customer)[0] == 404
            status, details = request('cancellation-details', credentials, client=customer)
            assert status == 200 and details['status'] == 'pending'
            assert set(details) == {'id', 'trailer', 'date_from', 'date_to', 'status'}
            assert request('reserve', booking)[0] == 409
            assert request('block', {'trailer': '1', 'date_from': day, 'date_to': day}, csrf)[0] == 409
            assert len(request('availability')[1]['periods']) == 1
            assert request('status', {'id': reserved['id'], 'status': 'confirmed'}, csrf)[0] == 200
            assert request('cancellation-details', credentials, client=customer)[1]['status'] == 'confirmed'
            confirmed_pdf = request(f"document&id={reserved['id']}&inline=1", binary=True)[1]
            assert confirmed_pdf['headers']['Content-Disposition'].startswith('inline;')
            assert 'Bestätigte Buchung' in ''.join(page.extract_text() for page in PdfReader(io.BytesIO(confirmed_pdf['body'])).pages)
            with sqlite3.connect(work / 'private/bookings.sqlite') as database:
                messages = database.execute('SELECT body FROM outbox WHERE booking_id=? ORDER BY id', (reserved['id'],)).fetchall()
                cancellation_link = f"https://brennwerkbeer.de/#stornierung={reserved['id']}.{reserved['cancellation_token']}"
                assert len(messages) == 2 and all(cancellation_link in row[0] for row in messages)
            database.close()
            assert request('status', {'id': reserved['id'], 'status': 'confirmed'}, csrf)[0] == 409
            assert request('status', {'id': reserved['id'], 'status': 'cancelled'}, csrf)[0] == 200
            assert request('cancel', credentials, client=customer)[1]['already_cancelled'] is True
            assert request('block', {'trailer': '1', 'date_from': day, 'date_to': day, 'note': 'Wartung'}, csrf)[0] == 201
            assert request('reserve', booking)[0] == 409
            pending = request('reserve', {**booking, 'trailer': '2'})[1]
            pending_credentials = {'id': pending['id'], 'token': pending['cancellation_token']}
            assert request('cancel', {**pending_credentials, 'token': reserved['cancellation_token']}, client=customer)[0] == 404
            assert request('reserve', {**booking, 'trailer': '2'})[0] == 409
            assert request('cancel', pending_credentials, client=customer)[1]['already_cancelled'] is False
            assert request('cancellation-details', pending_credentials, client=customer)[1]['status'] == 'cancelled'
            assert request('settings', {'mode': 'automatic'}, csrf)[0] == 200
            booking['trailer'] = '2'
            def competing_request(_):
                return request('reserve', booking, client=urllib.request.build_opener())
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(competing_request, range(2)))
            assert sorted(r[0] for r in results) == [201, 409], results
            auto = next(r[1] for r in results if r[0] == 201)
            assert auto['status'] == 'confirmed'
            assert request('reserve', {**booking, 'date_from': '2026-02-30'})[0] == 400
            assert request('reserve', {**booking, 'email': 'bad\r\nBcc:bad@example.com'})[0] == 400
            public = request('availability')[1]
            assert all(set(row) == {'trailer', 'date_from', 'date_to'} for row in public['periods'])
            with sqlite3.connect(work / 'private/bookings.sqlite') as database:
                assert database.execute('SELECT COUNT(*) FROM outbox WHERE booking_id=?', (auto['id'],)).fetchone()[0] == 2
                assert database.execute('SELECT COUNT(*) FROM outbox WHERE sent_at IS NULL').fetchone()[0] == 0
            database.close()
            auto_credentials = {'id': auto['id'], 'token': auto['cancellation_token']}
            def concurrent_cancellation(_):
                return request('cancel', auto_credentials, client=urllib.request.build_opener())
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                cancellations = list(pool.map(concurrent_cancellation, range(2)))
            assert all(result[0] == 200 for result in cancellations), cancellations
            assert sorted(result[1]['already_cancelled'] for result in cancellations) == [False, True]
            assert not any(row['trailer'] == '2' and row['date_from'] == day for row in request('availability')[1]['periods'])
            assert next(row for row in request('admin')[1]['bookings'] if row['id'] == auto['id'])['status'] == 'cancelled'
            with sqlite3.connect(work / 'private/bookings.sqlite') as database:
                assert database.execute('SELECT COUNT(*) FROM outbox WHERE booking_id=?', (auto['id'],)).fetchone()[0] == 3
                assert database.execute('SELECT body FROM outbox WHERE booking_id=? ORDER BY id DESC LIMIT 1', (auto['id'],)).fetchone()[0].find('#stornierung=') == -1
            database.close()
            assert request('email-document', {'id': auto['id']})[0] == 403
            blocked = next(row for row in request('admin')[1]['bookings'] if row['status'] == 'blocked')
            assert request(f"document&id={blocked['id']}")[0] == 404
            assert request('email-document', {'id': blocked['id']}, csrf)[0] == 404
            assert request('email-document', {'id': auto['id'], 'recipient': 'someone-else@example.com'}, csrf)[1] == {'ok': True, 'sent': True, 'recipient': booking['email']}
            mime = BytesParser(policy=policy.default).parsebytes(MailSink.messages[-1])
            assert mime['To'] == booking['email']
            attachments = list(mime.iter_attachments())
            assert len(attachments) == 1 and attachments[0].get_content_type() == 'application/pdf'
            assert attachments[0].get_filename() == f"Brennwerk-Beer-{auto['id']}.pdf"
            attached_pdf = attachments[0].get_payload(decode=True)
            attached_text = ''.join(page.extract_text() for page in PdfReader(io.BytesIO(attached_pdf)).pages)
            assert all(value in attached_text for value in [booking['name'], booking['phone'], booking['email'], auto['id'], 'Storniert'])
            assert next(row for row in request('admin')[1]['bookings'] if row['id'] == auto['id'])['status'] == 'cancelled'
            MailSink.reject = True
            assert request('email-document', {'id': auto['id']}, csrf)[1]['sent'] is False
            assert request('admin')[1]['unsent'] == 1
            with sqlite3.connect(work / 'private/bookings.sqlite') as database:
                queued_pdf = database.execute('SELECT content FROM outbox_attachments ORDER BY mail_id DESC LIMIT 1').fetchone()[0]
                assert queued_pdf.startswith(b'%PDF-')
            database.close()
            MailSink.reject = False
            assert request('retry-mail', {}, csrf)[0] == 200
            assert request('admin')[1]['unsent'] == 0
            retry_mime = BytesParser(policy=policy.default).parsebytes(MailSink.messages[-1])
            assert next(retry_mime.iter_attachments()).get_payload(decode=True) == queued_pdf
            MailSink.reject = True
            next_day = (datetime.now() + timedelta(days=31)).strftime('%Y-%m-%d')
            assert request('reserve', {**booking, 'date_from': next_day, 'date_to': next_day})[0] == 201
            assert request('admin')[1]['unsent'] == 2
            MailSink.reject = False
            assert request('retry-mail', {}, csrf)[0] == 200
            assert request('admin')[1]['unsent'] == 0
            assert request('logout', {}, csrf)[0] == 200
            assert request('admin')[0] == 401
            print('PASS: Kalenderbereitschaft, geschuetzte Vorschau, Login, CSRF, Tagesreservierung, Konflikte, Freigabe, Storno, Kundenstorno mit persoenlichem Link, wiederholter und konkurrierender Storno, Blockierung, automatischer Modus, konkurrierende Anfragen, geschuetzte PDF-Dateien, PDF-Anhang mit gespeichertem Empfaenger, Versandwiederholung mit identischem Anhang, E-Mail-Warteschlange, Datenschutz, Logout')
        finally:
            server.terminate()
            server.wait(timeout=10)
