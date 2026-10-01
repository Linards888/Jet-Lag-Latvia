"""Web Push (RFC 8030 + 8291 aes128gcm + VAPID RFC 8292) in pure standard-library Python.

Lets the server notify a phone even when the page is closed. Needs HTTPS (the Tailscale Funnel address) and, on iPhone,
the app added to the Home Screen. Crypto (P-256, ECDSA, AES-128-GCM) is implemented here so the project keeps zero
dependencies; tests/test_push.py verifies it against the `cryptography` package when that is installed.
"""
import base64
import hashlib
import hmac
import json
import os
import queue
import secrets
import struct
import threading
import time
import urllib.error
import urllib.request

import core

# ---------------------------------------------------------------- P-256
P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
A = P - 3
B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b
N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
G = (0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296,
     0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5)


def _add(p1, p2):
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    (x1, y1), (x2, y2) = p1, p2
    if x1 == x2:
        if (y1 + y2) % P == 0:
            return None
        lam = (3 * x1 * x1 + A) * pow(2 * y1, -1, P) % P
    else:
        lam = (y2 - y1) * pow(x2 - x1, -1, P) % P
    x3 = (lam * lam - x1 - x2) % P
    return x3, (lam * (x1 - x3) - y1) % P


def _mul(k, pt=G):
    r, add = None, pt
    while k:
        if k & 1:
            r = _add(r, add)
        add = _add(add, add)
        k >>= 1
    return r


def pub_bytes(priv):
    x, y = _mul(priv)
    return b'\x04' + x.to_bytes(32, 'big') + y.to_bytes(32, 'big')


def _parse_pub(b):
    if len(b) != 65 or b[0] != 4:
        raise ValueError('bad public key')
    x, y = int.from_bytes(b[1:33], 'big'), int.from_bytes(b[33:], 'big')
    if (y * y - (x * x * x + A * x + B)) % P != 0:
        raise ValueError('point not on curve')
    return x, y


def ecdh(priv, pub):
    return _mul(priv, _parse_pub(pub))[0].to_bytes(32, 'big')


def ecdsa_sign(priv, msg):
    z = int.from_bytes(hashlib.sha256(msg).digest(), 'big')
    while True:
        k = secrets.randbelow(N - 1) + 1
        r = _mul(k)[0] % N
        if r == 0:
            continue
        s = pow(k, -1, N) * (z + r * priv) % N
        if s:
            return r.to_bytes(32, 'big') + s.to_bytes(32, 'big')


# ---------------------------------------------------------------- AES-128-GCM
def _make_sbox():
    sbox = [0] * 256
    p = q = 1
    while True:
        p = p ^ ((p << 1) & 0xFF) ^ (0x1B if p & 0x80 else 0)
        q ^= (q << 1) & 0xFF
        q ^= (q << 2) & 0xFF
        q ^= (q << 4) & 0xFF
        if q & 0x80:
            q ^= 0x09
        rot = lambda v, n: ((v << n) | (v >> (8 - n))) & 0xFF
        sbox[p] = q ^ rot(q, 1) ^ rot(q, 2) ^ rot(q, 3) ^ rot(q, 4) ^ 0x63
        if p == 1:
            break
    sbox[0] = 0x63
    return sbox


SBOX = _make_sbox()


def _xt(a):
    return ((a << 1) ^ 0x1B) & 0xFF if a & 0x80 else a << 1


def _expand(key):
    w = [list(key[i:i + 4]) for i in range(0, 16, 4)]
    rcon = 1
    for i in range(4, 44):
        t = list(w[i - 1])
        if i % 4 == 0:
            t = [SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]
            rcon = _xt(rcon)
        w.append([a ^ b for a, b in zip(w[i - 4], t)])
    return [sum(w[r * 4:r * 4 + 4], []) for r in range(11)]


def _aes_block(rks, block):
    s = [b ^ k for b, k in zip(block, rks[0])]
    for rnd in range(1, 11):
        s = [SBOX[b] for b in s]
        s = [s[(i + 4 * (i % 4)) % 16] for i in range(16)]  # ShiftRows (column-major state)
        if rnd != 10:
            out = []
            for c in range(4):
                a0, a1, a2, a3 = s[c * 4:c * 4 + 4]
                out += [_xt(a0) ^ (_xt(a1) ^ a1) ^ a2 ^ a3, a0 ^ _xt(a1) ^ (_xt(a2) ^ a2) ^ a3,
                        a0 ^ a1 ^ _xt(a2) ^ (_xt(a3) ^ a3), (_xt(a0) ^ a0) ^ a1 ^ a2 ^ _xt(a3)]
            s = out
        s = [b ^ k for b, k in zip(s, rks[rnd])]
    return bytes(s)


def _gmul(x, y):
    z, v = 0, y
    for i in range(127, -1, -1):
        if (x >> i) & 1:
            z ^= v
        v = (v >> 1) ^ (0xE1 << 120) if v & 1 else v >> 1
    return z


def aes_gcm_encrypt(key, iv, plaintext):
    """AES-128-GCM, 12-byte IV, no AAD. Returns ciphertext || 16-byte tag."""
    rks = _expand(key)
    h = int.from_bytes(_aes_block(rks, bytes(16)), 'big')
    ctr0 = int.from_bytes(iv, 'big') << 32 | 1
    ct = bytearray()
    for i in range(0, len(plaintext), 16):
        ks = _aes_block(rks, ((ctr0 + 1 + i // 16) & ((1 << 128) - 1)).to_bytes(16, 'big'))
        ct += bytes(a ^ b for a, b in zip(plaintext[i:i + 16], ks))
    ghash = 0
    padded = bytes(ct) + bytes((-len(ct)) % 16)
    for i in range(0, len(padded), 16):
        ghash = _gmul(ghash ^ int.from_bytes(padded[i:i + 16], 'big'), h)
    ghash = _gmul(ghash ^ (len(ct) * 8), h)  # lengths block: len(AAD)=0 || len(C) in bits
    tag = int.from_bytes(_aes_block(rks, ctr0.to_bytes(16, 'big')), 'big') ^ ghash
    return bytes(ct) + tag.to_bytes(16, 'big')


# ---------------------------------------------------------------- Web Push message encryption (RFC 8291)
def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def b64d(s):
    s = str(s)
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def _hmac(key, msg):
    return hmac.new(key, msg, hashlib.sha256).digest()


def encrypt(payload, p256dh, auth, salt=None, as_priv=None):
    ua_pub, auth_secret = b64d(p256dh), b64d(auth)
    as_priv = as_priv or secrets.randbelow(N - 1) + 1
    as_pub = pub_bytes(as_priv)
    ikm = _hmac(_hmac(auth_secret, ecdh(as_priv, ua_pub)), b'WebPush: info\x00' + ua_pub + as_pub + b'\x01')
    salt = salt or os.urandom(16)
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b'Content-Encoding: aes128gcm\x00\x01')[:16]
    nonce = _hmac(prk, b'Content-Encoding: nonce\x00\x01')[:12]
    body = aes_gcm_encrypt(cek, nonce, payload + b'\x02')
    return salt + struct.pack('>I', 4096) + bytes([65]) + as_pub + body


# ---------------------------------------------------------------- VAPID
class Vapid:
    def __init__(self, path):
        self.priv = None
        try:
            with open(path) as f:
                self.priv = int(json.load(f)['priv'], 16)
        except (OSError, ValueError, KeyError):
            pass
        if not self.priv:
            self.priv = secrets.randbelow(N - 1) + 1
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w') as f:
                json.dump({'priv': '%064x' % self.priv}, f)
        self.pub = b64u(pub_bytes(self.priv))

    def headers(self, endpoint, subject='mailto:admin@jetlag.local'):
        from urllib.parse import urlparse
        u = urlparse(endpoint)
        head = b64u(json.dumps({'typ': 'JWT', 'alg': 'ES256'}, separators=(',', ':')).encode())
        claims = b64u(json.dumps({'aud': '%s://%s' % (u.scheme, u.netloc), 'exp': int(time.time()) + 12 * 3600, 'sub': subject}, separators=(',', ':')).encode())
        sig = ecdsa_sign(self.priv, ('%s.%s' % (head, claims)).encode())
        return {'Authorization': 'vapid t=%s.%s.%s, k=%s' % (head, claims, b64u(sig), self.pub)}


# ---------------------------------------------------------------- delivery worker
class Pusher:
    def __init__(self, store, vapid, enabled=True):
        self.store, self.vapid, self.enabled = store, vapid, enabled
        self.q = queue.Queue(maxsize=500)
        self.sent = self.failed = 0
        if enabled:
            threading.Thread(target=self._run, daemon=True).start()

    def hook(self, game, n):
        """Called for every new notice (inside the game lock): queue a push for members who are not looking at the app."""
        if not self.enabled or n['kind'] == 'info' and n['key'] in ('paused', 'resumed'):
            return
        now = core.now_ms()
        for m in game['members'].values():
            if not m.get('push') or (n['to'] is not None and m['id'] not in n['to']):
                continue
            if now - m['lastSeen'] < 20000:   # the open page already shows it
                continue
            for sub in m['push']:
                data = json.dumps({'key': n['key'], 'args': n['args'], 'kind': n['kind'], 'game': game['name'], 'code': game['code'],
                                   'lang': sub.get('lang', 'en'), 'id': n['id']}, ensure_ascii=False).encode()
                try:
                    self.q.put_nowait((game['code'], m['id'], sub, data))
                except queue.Full:
                    return

    def _run(self):
        while True:
            code, mid, sub, data = self.q.get()
            try:
                self._send(sub, data)
                self.sent += 1
            except urllib.error.HTTPError as e:
                self.failed += 1
                if e.code in (404, 410):
                    self._drop(code, mid, sub['endpoint'])
            except Exception:
                self.failed += 1

    def _send(self, sub, data):
        body = encrypt(data, sub['p256dh'], sub['auth'])
        h = {'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'TTL': '86400', 'Urgency': 'high'}
        h.update(self.vapid.headers(sub['endpoint']))
        req = urllib.request.Request(sub['endpoint'], data=body, headers=h, method='POST')
        urllib.request.urlopen(req, timeout=10).read()

    def _drop(self, code, mid, endpoint):
        with core.LOCK:
            g = self.store.games.get(code)
            m = g and g['members'].get(mid)
            if m:
                m['push'] = [x for x in m.get('push', []) if x['endpoint'] != endpoint]
                self.store.mark()


def init(store, data_dir):
    vapid = Vapid(os.path.join(data_dir, 'vapid.json'))
    pusher = Pusher(store, vapid, enabled=os.environ.get('JETLAG_PUSH', 'on') != 'off')
    core.PUSH_HOOK = pusher.hook
    return vapid, pusher
