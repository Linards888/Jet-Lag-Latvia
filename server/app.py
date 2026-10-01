#!/usr/bin/env python3
"""Jet Lag: Latvia - zero-dependency server (Python 3.8+). Run:  python3 server/app.py  [--port 8080]"""
import argparse
import gzip
import hashlib
import json
import mimetypes
import os
import re
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cards  # noqa: E402
import core  # noqa: E402
import game as G  # noqa: E402
import geo  # noqa: E402
import hide  # noqa: E402
import push  # noqa: E402
import tag as tag_mode  # noqa: E402
from core import GameError, LOCK  # noqa: E402

PUBLIC = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public'))
STORE = None
VAPID = PUSHER = None
BUS = threading.Condition()
GZ_CACHE = {}
RATE = {}
META_CACHE = {}
SW_CACHE = {}


def notify():
    with BUS:
        BUS.notify_all()


def rate_ok(key, limit, per):
    now = time.time()
    hits = [t for t in RATE.get(key, []) if now - t < per]
    if len(hits) >= limit:
        RATE[key] = hits
        return False
    hits.append(now)
    RATE[key] = hits
    return True


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'JetLagLatvia/1.0'

    def log_message(self, fmt, *args):
        if os.environ.get('JETLAG_VERBOSE'):
            sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    # ------------------------------------------------------------ plumbing
    def ip(self):
        return self.headers.get('CF-Connecting-IP') or self.headers.get('X-Forwarded-For', '').split(',')[0].strip() or self.client_address[0]

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'")
        super().end_headers()

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf8')
        gz = len(body) > 2000 and 'gzip' in self.headers.get('Accept-Encoding', '')
        if gz:
            body = gzip.compress(body, 5)
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        if gz:
            self.send_header('Content-Encoding', 'gzip')
        self.end_headers()
        self.wfile.write(body)

    def read_body(self, limit):
        n = int(self.headers.get('Content-Length') or 0)
        if n > limit:
            raise GameError('Request too large', 413)
        return self.rfile.read(n) if n else b''

    def json_body(self):
        raw = self.read_body(1_000_000)
        try:
            return json.loads(raw.decode('utf8')) if raw else {}
        except ValueError:
            raise GameError('Bad JSON')

    def token(self, q=None):
        return self.headers.get('X-Token') or (q or {}).get('t', [None])[0]

    def dispatch(self, method):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path.startswith('/api/'):
                self.api(method, u.path[5:].strip('/').split('/'), q)
            elif method == 'GET':
                self.static(u.path)
            else:
                raise GameError('Not found', 404)
        except GameError as e:
            self.send_json({'error': str(e)}, e.status)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # pragma: no cover
            import traceback
            traceback.print_exc()
            try:
                self.send_json({'error': 'Server error: %r' % e}, 500)
            except Exception:
                pass

    def do_GET(self):
        self.dispatch('GET')

    def do_POST(self):
        self.dispatch('POST')

    # ------------------------------------------------------------ static
    def static(self, path):
        if path == '/sw.js':
            return self.service_worker()
        spa = path in ('/', '', '/index.html')
        full = os.path.realpath(os.path.join(PUBLIC, ('index.html' if spa else path.lstrip('/'))))
        status = 200
        if os.path.commonpath([full, PUBLIC]) != PUBLIC or not os.path.isfile(full):
            full, status = os.path.join(PUBLIC, '404.html'), 404
        ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
        if full.endswith('.js'):
            ctype = 'text/javascript'
        st = os.stat(full)
        etag = '"%x-%x"' % (st.st_mtime_ns, st.st_size)
        if status == 200 and self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag', etag)
            self.end_headers()
            return
        with open(full, 'rb') as f:
            body = f.read()
        rel = os.path.relpath(full, PUBLIC).replace(os.sep, '/')
        self._send_blob(body, ctype, rel.startswith('vendor/'), full, status, etag if status == 200 else None)

    def service_worker(self):
        """sw.js is generated: its cache name is a hash of all public files, so every update refreshes the offline cache."""
        files, h = [], hashlib.sha1()
        for root, _dirs, names in sorted(os.walk(PUBLIC)):
            for n in sorted(names):
                full = os.path.join(root, n)
                rel = os.path.relpath(full, PUBLIC).replace(os.sep, '/')
                if rel in ('sw.js', '404.html') or rel.startswith('vendor/fonts/') or rel.startswith('vendor/images/'):
                    continue
                st = os.stat(full)
                h.update(('%s%d%d' % (rel, st.st_mtime_ns, st.st_size)).encode())
                files.append('/' + rel if rel != 'index.html' else '/')
        version = h.hexdigest()[:12]
        if version not in SW_CACHE:
            with open(os.path.join(PUBLIC, 'sw.js'), encoding='utf8') as f:
                tpl = f.read()
            SW_CACHE.clear()
            SW_CACHE[version] = tpl.replace('__VERSION__', version).replace('__PRECACHE__', json.dumps(files)).encode('utf8')
        body = SW_CACHE[version]
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Service-Worker-Allowed', '/')
        self.end_headers()
        self.wfile.write(body)

    def _send_blob(self, body, ctype, immutable, cache_key=None, status=200, etag=None):
        gz = 'gzip' in self.headers.get('Accept-Encoding', '') and len(body) > 1500 and not ctype.startswith('image/') and not ctype.startswith('font/')
        if gz:
            key = (cache_key, len(body))
            body = GZ_CACHE.get(key) if cache_key and key in GZ_CACHE else gzip.compress(body, 6)
            if cache_key:
                GZ_CACHE[key] = body
        self.send_response(status)
        self.send_header('Content-Type', ctype + ('; charset=utf-8' if ctype.startswith('text/') or 'json' in ctype else ''))
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'public, max-age=604800' if immutable else 'no-cache')
        if etag:
            self.send_header('ETag', etag)
        self.send_header('Vary', 'Accept-Encoding')
        if gz:
            self.send_header('Content-Encoding', 'gzip')
        self.end_headers()
        self.wfile.write(body)

    # ------------------------------------------------------------ API
    def api(self, method, parts, q):
        if parts == ['health']:
            return self.send_json({'ok': True, 'games': len(STORE.games), 'push': {'sent': PUSHER.sent, 'failed': PUSHER.failed} if PUSHER else None})
        if parts == ['push', 'key'] and method == 'GET':
            return self.send_json({'key': VAPID.pub if VAPID else None})
        if parts == ['meta'] and method == 'GET':
            if 'meta' not in META_CACHE:
                META_CACHE['meta'] = json.dumps({'cities': geo.CITIES, 'modes': list(G.MODES), 'questions': hide.QUESTIONS, 'cats': hide.CATS,
                                                 'effects': cards.effects_public(), 'shop': list(tag_mode.SHOP)}, ensure_ascii=False, separators=(',', ':')).encode('utf8')
            return self._send_blob(META_CACHE['meta'], 'application/json', False, 'meta')
        if parts == ['geo', 'municipalities'] and method == 'GET':
            if 'geo' not in META_CACHE:
                META_CACHE['geo'] = json.dumps(geo.MUNI_GEOJSON, ensure_ascii=False, separators=(',', ':')).encode('utf8')
            return self._send_blob(META_CACHE['geo'], 'application/json', True, 'muni', 200, '"muni-v1"')
        if parts == ['games'] and method == 'POST':
            if not rate_ok(('create', self.ip()), 20, 3600):
                raise GameError('Too many games created from this address', 429)
            b = self.json_body()
            with LOCK:
                g, key, token, member = G.create_game(STORE, b.get('mode'), b.get('name'), b.get('adminName'), b.get('adminPin'),
                                                      b.get('adminPlays'), b.get('settings'))
            notify()
            return self.send_json({'code': g['code'], 'adminKey': key, 'token': token, 'memberId': member['id']}, 201)
        if len(parts) >= 2 and parts[0] == 'games':
            return self.game_api(method, parts[1].upper(), parts[2:], q)
        raise GameError('Not found', 404)

    def game_api(self, method, code, rest, q):
        with LOCK:
            g = G.get_game(STORE, code)
        sub = rest[0] if rest else ''
        if not rest and method == 'GET':
            with LOCK:
                return self.send_json(G.public_info(g))
        if sub in ('join', 'rejoin', 'admin-login') and method == 'POST':
            if not rate_ok((sub, self.ip()), 40, 600):
                raise GameError('Too many attempts - wait a few minutes', 429)
            b = self.json_body()
            with LOCK:
                if sub == 'join':
                    m, tok = G.join(STORE, g, b.get('name'), b.get('role'), b.get('pin'))
                elif sub == 'rejoin':
                    m, tok = G.rejoin(STORE, g, b.get('name'), b.get('pin'))
                else:
                    m, tok = G.admin_login(STORE, g, b.get('key'))
                G.bump(STORE, g)
            notify()
            return self.send_json({'token': tok, 'memberId': m['id'], 'role': m['role']})
        # everything below needs a member token
        with LOCK:
            me = G.authenticate(STORE, g, self.token(q))
        if not me:
            raise GameError('Not signed in to this game', 401)
        if sub == 'state' and method == 'GET':
            try:
                cv = int((q.get('cv') or [''])[0])
            except ValueError:
                cv = None
            with LOCK:
                G.touch(g, me)
                return self.send_json(G.view(g, me, cv))
        if sub == 'push' and method == 'POST':
            b = self.json_body()
            with LOCK:
                if len(rest) > 1 and rest[1] == 'off':
                    G.remove_push(me, b.get('endpoint'))
                else:
                    G.add_push(g, me, b.get('subscription'), b.get('lang'))
                STORE.mark()
            return self.send_json({'ok': True})
        if sub == 'events' and method == 'GET':
            return self.sse(g, me)
        if sub == 'loc' and method == 'POST':
            b = self.json_body()
            with LOCK:
                G.update_loc(g, me, b.get('lat'), b.get('lng'), b.get('acc'))
                STORE.mark()
            return self.send_json({'ok': True})
        if sub == 'action' and method == 'POST':
            b = self.json_body()
            with LOCK:
                before = g['version']
                G.do_action(STORE, g, me, b.get('type'), b.get('payload'))
                if g['version'] == before:
                    G.bump(STORE, g)
                G.touch(g, me)
            notify()
            return self.send_json({'ok': True})
        if sub == 'upload' and method == 'POST':
            data = self.read_body(8 * 1024 * 1024)
            with LOCK:
                if not G.plays(g, me):
                    raise GameError('Only players upload photos')
                fid = G.put_file(STORE, g, me, data, 'members' if g['mode'] == 'race' else [me['id']])
                STORE.mark()
            return self.send_json({'fid': fid})
        if sub == 'file' and len(rest) == 2 and method == 'GET':
            with LOCK:
                f = g['files'].get(rest[1])
                if not f or not G.can_read_file(g, me, f) or not re.fullmatch(r'[0-9a-f]+', rest[1]):
                    raise GameError('No such file', 404)
                path, mime = os.path.join(STORE.dir, 'uploads', g['code'], rest[1]), f['mime']
            with open(path, 'rb') as fh:
                body = fh.read()
            return self._send_blob(body, mime, True)
        if sub == 'log' and method == 'GET':
            with LOCK:
                if not G.admin_active(g, me):
                    raise GameError('The log is for the admin', 403)
                return self.send_json({'log': g['log'], 'chainOk': core.verify_log(g), 'code': g['code']})
        raise GameError('Not found', 404)

    def sse(self, g, me):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Accel-Buffering', 'no')
        self.send_header('Connection', 'keep-alive')
        self.end_headers()
        last = -1
        try:
            while True:
                with LOCK:
                    v = g['version']
                if v != last:
                    self.wfile.write(('data: %d\n\n' % v).encode())
                    last = v
                else:
                    self.wfile.write(b': ping\n\n')
                self.wfile.flush()
                with BUS:
                    BUS.wait(timeout=20)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        self.close_connection = True


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64


def background(stop):
    last_flush, seen = 0, None
    while not stop.wait(2):
        G.tick(STORE, core.now_ms())
        versions = sum(g['version'] for g in STORE.games.values())
        if versions != seen:
            seen = versions
            notify()
        if STORE.due(time.time(), last_flush):
            STORE.flush()
            last_flush = time.time()


def make_server(host, port, store=None):
    global STORE, VAPID, PUSHER
    STORE = store or core.Store()
    VAPID, PUSHER = push.init(STORE, STORE.dir)
    return Server((host, port), Handler)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default=os.environ.get('HOST', '0.0.0.0'))
    ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', 8080)))
    a = ap.parse_args()
    srv = make_server(a.host, a.port)
    stop = threading.Event()
    threading.Thread(target=background, args=(stop,), daemon=True).start()

    def bye(*_):
        stop.set()
        STORE.flush(force=True)
        print('\nSaved. Bye.')
        os._exit(0)

    signal.signal(signal.SIGINT, bye)
    if hasattr(signal, 'SIGTERM'):
        signal.signal(signal.SIGTERM, bye)
    print('Jet Lag: Latvia running on http://%s:%d  (data: %s, %d games loaded)' % (a.host, a.port, os.path.realpath(STORE.dir), len(STORE.games)))
    srv.serve_forever()


if __name__ == '__main__':
    main()
