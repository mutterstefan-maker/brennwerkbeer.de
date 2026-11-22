"""Integrationstest mit isolierter Datenbank: python tests/booking_api.py PFAD_ZU_PHP"""
import concurrent.futures
import http.cookiejar
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

php = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parents[1]
class MailSink(socketserver.StreamRequestHandler):
    reject = False
    def handle(self):
        self.wfile.write(b'220 localhost test SMTP\r\n')
        in_data = False
        for line in self.rfile:
            if in_data:
                if line == b'.\r\n':
                    in_data = False
                    self.wfile.write(b'250 accepted\r\n')
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
    shutil.copy(root / 'scripts/router.php', work / 'scripts/router.php')
    password_hash = subprocess.check_output([str(php), '-r', "echo password_hash('integration-test-password', PASSWORD_DEFAULT);"], text=True)
    config = "<?php return ['password_hash'=>'" + password_hash + "','mail_from'=>'booking@example.com'];"
    (work / 'private/config.php').write_text(config, encoding='utf-8')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    command = [str(php), '-d', f'session.save_path={work}', '-d', 'default_socket_timeout=1', '-d', 'SMTP=127.0.0.1', '-d', f'smtp_port={smtp.server_address[1]}']
    if sys.platform == 'win32':
        command += ['-d', f'extension_dir={php.parent / "ext"}', '-d', 'extension=pdo_sqlite']
    command += ['-S', f'127.0.0.1:{port}', '-t', str(work), str(work / 'scripts/router.php')]
    with (work / 'server.log').open('w') as log:
        server = subprocess.Popen(command, stdout=log, stderr=log)
        try:
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            def request(action, data=None, token=None, client=opener):
                headers = {'Content-Type': 'application/json'}
                if token:
                    headers['X-CSRF-Token'] = token
                req = urllib.request.Request(f'http://127.0.0.1:{port}/api/index.php?action={action}', data=json.dumps(data).encode() if data is not None else None, headers=headers)
                try:
                    with client.open(req, timeout=4) as response:
                        return response.status, json.load(response)
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
            assert request('reserve', booking)[0] == 409
            assert request('block', {'trailer': '1', 'date_from': day, 'date_to': day}, csrf)[0] == 409
            assert len(request('availability')[1]['periods']) == 1
            assert request('status', {'id': reserved['id'], 'status': 'confirmed'}, csrf)[0] == 200
            assert request('status', {'id': reserved['id'], 'status': 'confirmed'}, csrf)[0] == 409
            assert request('status', {'id': reserved['id'], 'status': 'cancelled'}, csrf)[0] == 200
            assert request('block', {'trailer': '1', 'date_from': day, 'date_to': day, 'note': 'Wartung'}, csrf)[0] == 201
            assert request('reserve', booking)[0] == 409
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
            MailSink.reject = True
            next_day = (datetime.now() + timedelta(days=31)).strftime('%Y-%m-%d')
            assert request('reserve', {**booking, 'date_from': next_day, 'date_to': next_day})[0] == 201
            assert request('admin')[1]['unsent'] == 2
            MailSink.reject = False
            assert request('retry-mail', {}, csrf)[0] == 200
            assert request('admin')[1]['unsent'] == 0
            assert request('logout', {}, csrf)[0] == 200
            assert request('admin')[0] == 401
            print('PASS: Kalenderbereitschaft, geschuetzte Vorschau, Login, CSRF, Tagesreservierung, Konflikte, Freigabe, Storno, Blockierung, automatischer Modus, konkurrierende Anfragen, E-Mail-Warteschlange, Datenschutz, Logout')
        finally:
            server.terminate()
            server.wait(timeout=10)
