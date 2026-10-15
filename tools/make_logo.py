"""Draws the app logo (an original retro jet over sunset trails on a navy tile) as public/icon.svg and the PNG icons
(icon-192.png, icon-512.png, icon-maskable-512.png). Run: python tools/make_logo.py   (needs pillow)"""
import math
import os

from PIL import Image, ImageDraw

PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
NAVY, CREAM = '#1f2d4d', '#fdf3e3'
TRAILS = [('#9e1b32', 26), ('#f06d3c', 32.2), ('#f2b84b', 38.4)]  # carmine, coral, amber: inner to outer radius
CX, CY, DISC = 64, 62, 46      # the cream disc
TC = (64, 57)                  # centre of the trail arcs
A0, A1 = 28, 152               # trails sweep the lower half (degrees, y down)
W = 5.6
PLANE = [  # fuselage, wings and tailplane (right half; the left half is mirrored)
    [(64, 16), (66.4, 20.5), (67.2, 28), (67.2, 60), (66, 68), (64, 72)],
    [(67, 35), (94, 57), (94, 60.8), (67, 49.5)],
    [(66.6, 60.5), (77.5, 67.5), (77.5, 70.2), (66.6, 66.8)],
]


def mirrored(poly):
    return [(128 - x, y) for x, y in reversed(poly)]


def plane_polys():
    body = PLANE[0] + mirrored(PLANE[0])[1:-1]
    return [body] + [p for q in PLANE[1:] for p in (q, mirrored(q))]


def arc_pts(r, a0=A0, a1=A1, n=60):
    return [(TC[0] + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), TC[1] + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def ring(r):
    """A band of width W along the arc of radius r, as one polygon (outer edge there, inner edge back)."""
    return arc_pts(r + W / 2) + arc_pts(r - W / 2)[::-1]


def svg(rounded=True):
    trails = ''.join('<polygon points="%s" fill="%s"/>' % (' '.join('%.2f,%.2f' % p for p in ring(r)), c) for c, r in TRAILS)
    plane = ''.join('<polygon points="%s"/>' % ' '.join('%.1f,%.1f' % p for p in poly) for poly in plane_polys())
    tile = '<rect width="128" height="128" rx="30" fill="%s"/>' % NAVY if rounded else '<rect width="128" height="128" fill="%s"/>' % NAVY
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">%s<circle cx="%d" cy="%d" r="%d" fill="%s"/>%s<g fill="%s">%s</g></svg>' % (tile, CX, CY, DISC, CREAM, trails, NAVY, plane)


def png(size, pad=0.0, rounded=True):
    S = 4  # supersampling
    k = size * S / 128
    im = Image.new('RGBA', (size * S, size * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    inner = 1 - pad * 2
    off = size * S * pad
    T = lambda p: (off + p[0] * k * inner, off + p[1] * k * inner)
    if pad:
        d.rectangle([0, 0, size * S, size * S], fill=NAVY)  # maskable: the whole square is background
    elif rounded:
        d.rounded_rectangle([0, 0, size * S - 1, size * S - 1], radius=30 * k, fill=NAVY)
    else:
        d.rectangle([0, 0, size * S, size * S], fill=NAVY)
    c = T((CX, CY)); r = DISC * k * inner
    d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=CREAM)
    for col, rad in TRAILS:
        d.polygon([T(p) for p in ring(rad)], fill=col)
    for poly in plane_polys():
        d.polygon([T(p) for p in poly], fill=NAVY)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    open(os.path.join(PUB, 'icon.svg'), 'w', encoding='utf-8').write(svg())
    png(512).save(os.path.join(PUB, 'icon-512.png'), optimize=True)
    png(192).save(os.path.join(PUB, 'icon-192.png'), optimize=True)
    png(512, pad=0.1).convert('RGB').save(os.path.join(PUB, 'icon-maskable-512.png'), optimize=True)
    print('logo written')
