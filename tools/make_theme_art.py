"""Generates the original SVG scenery used behind the themes (public/img/bg/*.svg). Nothing here is traced from existing artwork.
Run: python tools/make_theme_art.py"""
import math
import os
import random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img', 'bg')
W, H = 1600, 900


def svg(body, defs=''):
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" preserveAspectRatio="xMidYMax slice"><defs>%s</defs>%s</svg>\n' % (W, H, defs, body)


def pines(seed, base, n, h_min, h_max, color, op=1, wmul=0.36):
    """A row of pine silhouettes (stacked triangles on a trunk) standing on y=base."""
    r = random.Random(seed)
    out = []
    for _ in range(n):
        x, h = r.uniform(-40, W + 40), r.uniform(h_min, h_max)
        w, y = h * wmul, base
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>' % (x - w * 0.06, y - h * 0.18, w * 0.12, h * 0.2, color))
        for k in range(4):
            top = y - h + k * h * 0.2
            bot = top + h * 0.38
            ww = w * (0.45 + k * 0.2)
            out.append('<polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="%s"/>' % (x, top, x - ww / 2, bot, x + ww / 2, bot, color))
    return '<g opacity="%s">%s</g>' % (op, ''.join(out))


def wave(y, amp, length, phase, color, op, step=20):
    pts = ['M0 %d' % H]
    for x in range(0, W + step, step):
        pts.append('L%d %.1f' % (x, y + amp * math.sin(x / length * 2 * math.pi + phase)))
    pts.append('L%d %d Z' % (W, H))
    return '<path d="%s" fill="%s" opacity="%s"/>' % (' '.join(pts), color, op)


def burst(cx, cy, r, color, n=18, seed=0):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = i / n * 2 * math.pi
        r1, r2 = r * 0.35, r * rnd.uniform(0.85, 1.0)
        out.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="4" stroke-linecap="round"/>' % (cx + r1 * math.cos(a), cy + r1 * math.sin(a), cx + r2 * math.cos(a), cy + r2 * math.sin(a), color))
        out.append('<circle cx="%.1f" cy="%.1f" r="5" fill="%s"/>' % (cx + r2 * 1.12 * math.cos(a), cy + r2 * 1.12 * math.sin(a), color))
    out.append('<circle cx="%d" cy="%d" r="9" fill="%s"/>' % (cx, cy, color))
    return '<g>%s</g>' % ''.join(out)


FILES = {}

# Latvian forest: misty pine ridges in three greens
FILES['mezs'] = svg(
    '<rect width="%d" height="%d" fill="url(#sky)"/><circle cx="1180" cy="260" r="120" fill="#fff7d6" opacity=".7"/>' % (W, H)
    + pines(1, 640, 34, 150, 230, '#b9d6b2', .8) + '<rect y="520" width="%d" height="380" fill="url(#mist)"/>' % W
    + pines(2, 760, 30, 200, 320, '#8cba8a', .9) + '<rect y="640" width="%d" height="260" fill="url(#mist2)"/>' % W
    + pines(3, 900, 22, 300, 470, '#5b9567', 1),
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf5e3" stop-opacity="0"/><stop offset="1" stop-color="#dcefd3" stop-opacity=".7"/></linearGradient>'
    '<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef7ea" stop-opacity="0"/><stop offset="1" stop-color="#eef7ea" stop-opacity=".75"/></linearGradient>'
    '<linearGradient id="mist2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3f1de" stop-opacity="0"/><stop offset="1" stop-color="#e3f1de" stop-opacity=".6"/></linearGradient>')

# Baltic sea: dusk, layered waves, a lighthouse on a spit
FILES['okeans'] = svg(
    '<rect width="%d" height="%d" fill="url(#sea)"/><circle cx="1240" cy="300" r="70" fill="#e8fff9" opacity=".55"/><rect x="1196" y="372" width="90" height="12" rx="6" fill="#e8fff9" opacity=".25"/>' % (W, H)
    + wave(520, 10, 260, 0, '#1b6f7a', .55) + wave(580, 14, 200, 1.2, '#14606c', .65) + wave(650, 18, 320, 2.4, '#0f4f5c', .8) + wave(740, 22, 240, 0.6, '#0a3d49', .9) + wave(830, 20, 400, 3.1, '#062c37', 1)
    + '<g fill="#04202a"><polygon points="214,560 246,560 238,330 222,330"/><rect x="216" y="316" width="28" height="16"/><polygon points="212,316 248,316 230,292"/><rect x="224" y="300" width="12" height="16" fill="#ffd479"/></g>'
    + '<path d="M0 600 Q120 560 260 585 T520 600 L520 640 L0 640Z" fill="#04202a"/>' + pines(4, 612, 9, 60, 110, '#04202a'),
    '<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2c3d" stop-opacity="0"/><stop offset=".5" stop-color="#14566a" stop-opacity=".5"/><stop offset="1" stop-color="#2a8a96" stop-opacity=".6"/></linearGradient>')

# Sunset over the dunes
FILES['saulriets'] = svg(
    '<rect width="%d" height="%d" fill="url(#sky)"/><circle cx="800" cy="610" r="210" fill="url(#sun)"/>' % (W, H)
    + '<g stroke="#fff3d6" stroke-width="3" opacity=".5"><line x1="560" y1="760" x2="1040" y2="760"/><line x1="620" y1="790" x2="980" y2="790"/><line x1="680" y1="820" x2="920" y2="820"/></g>'
    + '<path d="M0 700 Q200 640 420 690 T860 700 T1260 660 T1600 700 L1600 900 L0 900Z" fill="#e0895a" opacity=".8"/>'
    + '<path d="M0 780 Q260 720 520 770 T1040 770 T1600 760 L1600 900 L0 900Z" fill="#b95f3f" opacity=".9"/>' + pines(5, 900, 10, 120, 220, '#6d3326'),
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd2c2" stop-opacity="0"/><stop offset=".55" stop-color="#ffb482" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a5a" stop-opacity=".7"/></linearGradient>'
    '<radialGradient id="sun"><stop offset="0" stop-color="#fff6c8"/><stop offset=".55" stop-color="#ffc45a"/><stop offset="1" stop-color="#ff8a4a"/></radialGradient>')

# Northern lights above a snowy pine edge
rnd = random.Random(7)
stars = ''.join('<circle cx="%d" cy="%d" r="%.1f" fill="#fff" opacity="%.2f"/>' % (rnd.randint(0, W), rnd.randint(0, 500), rnd.uniform(.8, 2.2), rnd.uniform(.4, 1)) for _ in range(120))
FILES['aurora'] = svg(
    '<rect width="%d" height="%d" fill="url(#night)"/>' % (W, H) + stars
    + '<g filter="url(#blur)"><path d="M-100 380 C200 120 420 520 700 260 S1180 100 1700 340 L1700 480 C1300 300 1100 520 760 400 S260 640 -100 520Z" fill="url(#a1)" opacity=".85"/>'
      '<path d="M-100 300 C240 60 500 420 820 180 S1260 20 1700 260 L1700 340 C1260 140 1020 380 800 280 S300 500 -100 400Z" fill="url(#a2)" opacity=".7"/></g>'
    + pines(8, 900, 26, 160, 300, '#041018') + '<rect y="760" width="%d" height="140" fill="#e6f3ff" opacity=".12"/>' % W,
    '<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04101c" stop-opacity=".0"/><stop offset="1" stop-color="#0a2a3a" stop-opacity=".55"/></linearGradient>'
    '<linearGradient id="a1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#34f5b0"/><stop offset=".5" stop-color="#3ad0ff"/><stop offset="1" stop-color="#9a6bff"/></linearGradient>'
    '<linearGradient id="a2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6bff"/><stop offset=".5" stop-color="#34f5b0"/><stop offset="1" stop-color="#3ad0ff"/></linearGradient>'
    '<filter id="blur"><feGaussianBlur stdDeviation="22"/></filter>')

# Hanabi: festival fireworks and paper lanterns
lanterns = ''.join('<g><line x1="%d" y1="640" x2="%d" y2="%d" stroke="#2a1a3a" stroke-width="3"/><ellipse cx="%d" cy="%d" rx="34" ry="44" fill="#ff5f7a" stroke="#ffd479" stroke-width="3"/><rect x="%d" y="%d" width="28" height="8" fill="#2a1a3a"/><line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#ffd479" stroke-width="2" opacity=".7"/></g>' % (x, x, y - 44, x, y, x - 14, y + 40, x - 12, y - 30, x - 12, y + 30) for x, y in ((140, 720), (420, 780), (1180, 740), (1480, 790), (800, 800)))
FILES['hanabi'] = svg(
    '<rect width="%d" height="%d" fill="url(#night)"/>' % (W, H)
    + burst(380, 300, 190, '#ff5fa8', 22, 1) + burst(900, 220, 150, '#ffd166', 18, 2) + burst(1260, 380, 210, '#7ad0ff', 24, 3) + burst(640, 470, 110, '#c58bff', 16, 4) + burst(1480, 170, 100, '#ff9ecb', 16, 5)
    + lanterns + '<path d="M0 900 L0 820 L120 820 L120 780 L240 780 L240 830 L420 830 L420 790 L560 790 L560 840 L900 840 L900 800 L1060 800 L1060 830 L1300 830 L1300 790 L1440 790 L1440 840 L1600 840 L1600 900Z" fill="#12081e"/>',
    '<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0a24" stop-opacity="0"/><stop offset="1" stop-color="#3a1240" stop-opacity=".55"/></linearGradient>')

# Neon stage for the K-pop theme: spotlights over a perspective floor
beams = ''.join('<polygon points="%d,0 %d,0 %d,720 %d,720" fill="url(#beam)" opacity="%.2f"/>' % (x - 18, x + 18, x + dx + 110, x + dx - 110, op) for x, dx, op in ((260, -120, .7), (560, 60, .5), (900, -40, .6), (1240, 140, .7), (1460, -60, .5)))
floor = ''.join('<line x1="800" y1="640" x2="%d" y2="900" stroke="#ff3df2" stroke-width="2" opacity=".55"/>' % x for x in range(-1200, 2800, 160))
floor += ''.join('<line x1="0" y1="%d" x2="%d" y2="%d" stroke="#3df2ff" stroke-width="2" opacity=".5"/>' % (y, W, y) for y in (680, 730, 790, 860))
FILES['arcade'] = svg(
    '<rect width="%d" height="%d" fill="url(#bg)"/>' % (W, H) + beams + '<rect y="640" width="%d" height="260" fill="#0b0716" opacity=".6"/>' % W + floor
    + '<g fill="#ffe23d" opacity=".9"><polygon points="120,160 132,196 170,196 140,218 152,254 120,232 88,254 100,218 70,196 108,196"/><polygon points="1450,110 1458,134 1484,134 1463,149 1471,174 1450,159 1429,174 1437,149 1416,134 1442,134"/></g>',
    '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0a3a" stop-opacity=".0"/><stop offset="1" stop-color="#5a1a8a" stop-opacity=".5"/></linearGradient>'
    '<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6cf6" stop-opacity=".9"/><stop offset="1" stop-color="#3df2ff" stop-opacity="0"/></linearGradient>')

os.makedirs(OUT, exist_ok=True)
for name, content in FILES.items():
    with open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8') as f:
        f.write(content)
print('wrote', ', '.join(sorted(FILES)))
