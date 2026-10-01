import http.client
import json
import os
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))
os.environ['JETLAG_DATA'] = tempfile.mkdtemp()
import app  # noqa: E402
import core  # noqa: E402

JPEG = b'\xff\xd8\xff' + b'1' * 400


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = app.make_server('127.0.0.1', 0, core.Store(os.path.join(os.environ['JETLAG_DATA'], 'h.json')))
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def call(self, method, path, body=None, token=None, raw=None):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        h = {'X-Token': token} if token else {}
        data = raw
        if body is not None:
            data, h['Content-Type'] = json.dumps(body), 'application/json'
        c.request(method, path, data, h)
        r = c.getresponse()
        b = r.read()
        c.close()
        try:
            return r.status, json.loads(b)
        except ValueError:
            return r.status, b

    def test_race_upload_and_acl_and_admin(self):
        s, g = self.call('POST', '/api/games', {'mode': 'race', 'name': 'Test race', 'adminName': 'Boss', 'adminPin': '1234', 'adminPlays': False, 'settings': {'useWindow': False}})
        self.assertEqual(s, 201)
        code, key, admin = g['code'], g['adminKey'], g['token']
        s, a = self.call('POST', f'/api/games/{code}/join', {'name': 'Anna', 'pin': '1111', 'role': 'player'})
        s, b = self.call('POST', f'/api/games/{code}/join', {'name': 'Bob', 'pin': '1111', 'role': 'player'})
        s, sp = self.call('POST', f'/api/games/{code}/join', {'name': 'Spec', 'pin': '1111', 'role': 'spectator'})
        self.assertEqual(s, 200)
        # spectator cannot act / upload
        s, e = self.call('POST', f'/api/games/{code}/action', {'type': 'team_create', 'payload': {'name': 'X'}}, sp['token'])
        self.assertEqual(s, 400)
        s, e = self.call('POST', f'/api/games/{code}/upload', token=sp['token'], raw=JPEG)
        self.assertEqual(s, 400)
        # players cannot start; unauthenticated state is refused
        s, e = self.call('POST', f'/api/games/{code}/action', {'type': 'start'}, a['token'])
        self.assertEqual(s, 403)
        self.assertEqual(self.call('GET', f'/api/games/{code}/state')[0], 401)
        # upload + read ACL
        s, up = self.call('POST', f'/api/games/{code}/upload', token=a['token'], raw=JPEG)
        self.assertEqual(s, 200)
        self.assertEqual(self.call('GET', f'/api/games/{code}/file/{up["fid"]}?t={b["token"]}')[0], 200)
        self.assertEqual(self.call('GET', f'/api/games/{code}/file/{up["fid"]}')[0], 401)
        s, _ = self.call('POST', f'/api/games/{code}/upload', token=a['token'], raw=b'<svg onload=alert(1)>' + b'x' * 200)
        self.assertEqual(s, 400)
        # admin re-login revokes the old admin token (single admin)
        s, _ = self.call('POST', f'/api/games/{code}/admin-login', {'key': 'WRONG'})
        self.assertEqual(s, 400)
        s, n = self.call('POST', f'/api/games/{code}/admin-login', {'key': key})
        self.assertEqual(s, 200)
        self.assertEqual(self.call('GET', f'/api/games/{code}/state', token=admin)[0], 401)
        s, st = self.call('GET', f'/api/games/{code}/state', token=n['token'])
        self.assertEqual(s, 200)
        self.assertTrue(st['chainOk'])
        # state for a player never contains token hashes or pins
        blob = json.dumps(self.call('GET', f'/api/games/{code}/state', token=a['token'])[1])
        self.assertNotIn('tokenHash', blob)
        self.assertNotIn('pinHash', blob)
        self.assertNotIn('adminKeyHash', blob)

    def test_static_and_traversal(self):
        s, body = self.call('GET', '/')
        self.assertEqual(s, 200)
        self.assertIn(b'Jet Lag', body)
        s, body = self.call('GET', '/..%2f..%2fserver%2fgame.py')
        self.assertNotIn(b'def create_game', body if isinstance(body, bytes) else b'')
        s, body = self.call('GET', '/api/geo/municipalities')
        self.assertEqual(body['type'], 'FeatureCollection')

    def test_sse_pushes_version(self):
        s, g = self.call('POST', '/api/games', {'mode': 'tag', 'name': 'SSE game', 'adminName': 'Boss', 'adminPin': '1234', 'adminPlays': True})
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        c.request('GET', f'/api/games/{g["code"]}/events?t={g["token"]}')
        r = c.getresponse()
        self.assertEqual(r.getheader('Content-Type'), 'text/event-stream')
        first = r.fp.readline()
        self.assertTrue(first.startswith(b'data: '))
        self.call('POST', f'/api/games/{g["code"]}/action', {'type': 'announce', 'payload': {'text': 'hello'}}, g['token'])
        second = b''
        for _ in range(10):  # skip keep-alive pings / blank lines
            line = r.fp.readline()
            if line.startswith(b'data: '):
                second = line
                break
        self.assertTrue(second.startswith(b'data: '))
        self.assertNotEqual(first, second)
        c.close()


if __name__ == '__main__':
    unittest.main()
