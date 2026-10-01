import os
import struct
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))
import push  # noqa: E402

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    HAVE = True
except ImportError:  # the project itself has no dependencies; these checks need the library
    HAVE = False


@unittest.skipUnless(HAVE, 'cryptography not installed')
class PushCryptoTests(unittest.TestCase):
    def test_aes_gcm_matches_reference(self):
        for n in (0, 1, 15, 16, 17, 100, 250):
            key, iv, pt = os.urandom(16), os.urandom(12), os.urandom(n)
            self.assertEqual(push.aes_gcm_encrypt(key, iv, pt), AESGCM(key).encrypt(iv, pt, None))

    def test_public_key_and_ecdh_match(self):
        priv = push.secrets.randbelow(push.N - 1) + 1
        ref = ec.derive_private_key(priv, ec.SECP256R1())
        self.assertEqual(push.pub_bytes(priv), ref.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
        peer = ec.generate_private_key(ec.SECP256R1())
        peer_pub = peer.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        self.assertEqual(push.ecdh(priv, peer_pub), ref.exchange(ec.ECDH(), peer.public_key()))

    def test_signature_verifies(self):
        priv = push.secrets.randbelow(push.N - 1) + 1
        pub = ec.derive_private_key(priv, ec.SECP256R1()).public_key()
        msg = b'hello vapid'
        sig = push.ecdsa_sign(priv, msg)
        pub.verify(encode_dss_signature(int.from_bytes(sig[:32], 'big'), int.from_bytes(sig[32:], 'big')), msg, ec.ECDSA(hashes.SHA256()))

    def test_full_message_decrypts_like_a_browser(self):
        ua = ec.generate_private_key(ec.SECP256R1())
        ua_pub = ua.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        auth = os.urandom(16)
        payload = '{"key":"card_played","args":{"card":"Līgo!"}}'.encode('utf8')
        msg = push.encrypt(payload, push.b64u(ua_pub), push.b64u(auth))
        # receiver side (RFC 8291 section 3.4)
        salt, rs, idlen = msg[:16], struct.unpack('>I', msg[16:20])[0], msg[20]
        as_pub, ct = msg[21:21 + idlen], msg[21 + idlen:]
        self.assertEqual((rs, idlen), (4096, 65))
        secret = ua.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_pub))
        ikm = push._hmac(push._hmac(auth, secret), b'WebPush: info\x00' + ua_pub + as_pub + b'\x01')
        prk = push._hmac(salt, ikm)
        cek = push._hmac(prk, b'Content-Encoding: aes128gcm\x00\x01')[:16]
        nonce = push._hmac(prk, b'Content-Encoding: nonce\x00\x01')[:12]
        plain = AESGCM(cek).decrypt(nonce, ct, None)
        self.assertEqual(plain, payload + b'\x02')

    def test_vapid_jwt_verifies(self):
        import tempfile
        v = push.Vapid(os.path.join(tempfile.mkdtemp(), 'vapid.json'))
        h = v.headers('https://fcm.googleapis.com/fcm/send/abc')['Authorization']
        jwt = h.split('t=')[1].split(',')[0]
        head, claims, sig = jwt.split('.')
        pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), push.b64d(v.pub))
        raw = push.b64d(sig)
        pub.verify(encode_dss_signature(int.from_bytes(raw[:32], 'big'), int.from_bytes(raw[32:], 'big')), ('%s.%s' % (head, claims)).encode(), ec.ECDSA(hashes.SHA256()))
        self.assertIn('fcm.googleapis.com', push.b64d(claims).decode())


if __name__ == '__main__':
    unittest.main()
