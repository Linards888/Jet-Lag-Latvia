"""Draws the app icon (pink tile with a little mochi) as PNG files - needed for push notifications and the home screen."""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
PINK, WHITE, INK, BLUSH = (226, 69, 127), (255, 255, 255), (62, 36, 50), (226, 69, 127)


def shapes(u):
    """Returns a function color(x, y) in unit coordinates [0,1]."""
    def rrect(x, y, r):
        dx, dy = max(abs(x - .5) - (.5 - r), 0), max(abs(y - .5) - (.5 - r), 0)
        return dx * dx + dy * dy <= r * r

    def ell(x, y, cx, cy, rx, ry):
        return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

    def f(x, y):
        if not rrect(x, y, .23):
            return None
        c = PINK
        if ell(x, y, .5, .6, .31, .27) or ell(x, y, .5, .5, .28, .3):
            c = WHITE
            if ell(x, y, .39, .56, .035, .04) or ell(x, y, .61, .56, .035, .04):
                c = INK
            elif ell(x, y, .31, .66, .055, .035) or ell(x, y, .69, .66, .055, .035):
                c = tuple(int(WHITE[i] * .6 + BLUSH[i] * .4) for i in range(3))
            elif .035 > abs(math.hypot(x - .5, (y - .625) * 1.4) - .055) and y > .64:
                c = INK
            elif ell(x, y, .5, .245, .09, .045) and y < .27:
                c = INK
        return c
    return f


def png(size):
    f, rows, ss = shapes(size), [], 3
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc, n = [0, 0, 0], 0
            for sy in range(ss):
                for sx in range(ss):
                    c = f((px + (sx + .5) / ss) / size, (py + (sy + .5) / ss) / size)
                    if c:
                        n += 1
                        for i in range(3):
                            acc[i] += c[i]
            row += bytes([acc[i] // n if n else 0 for i in range(3)] + [255 * n // (ss * ss)])
        rows.append(bytes(row))
    raw = b''.join(rows)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


for s in (192, 512):
    with open(os.path.join(OUT, 'icon-%d.png' % s), 'wb') as fh:
        fh.write(png(s))
    print('icon-%d.png written' % s)
