"""Builds server/geodata/municipalities.geojson + country.json from raw geoBoundaries files.
Run once (raw files are in tools/raw, not needed at runtime). Data: geoBoundaries (CC BY 4.0, VZD)."""
import json, re, unicodedata, os
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw'); OUT = os.path.join(HERE, '..', 'server', 'geodata')

def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def dp(pts, tol):
    if len(pts) < 4: return pts
    keep = [False]*len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts)-1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2-x1, y2-y1; L = dx*dx+dy*dy; mx, mi = 0, -1
        for i in range(a+1, b):
            x, y = pts[i]
            if L == 0: d = (x-x1)**2+(y-y1)**2
            else:
                t = max(0, min(1, ((x-x1)*dx+(y-y1)*dy)/L)); d = (x-x1-t*dx)**2+(y-y1-t*dy)**2
            if d > mx: mx, mi = d, i
        if mx > tol*tol: keep[mi] = True; stack.append((a, mi)); stack.append((mi, b))
    return [p for p, k in zip(pts, keep) if k]

def simp(geom, tol):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    out = []
    for poly in polys:
        rings = []
        for r in poly:
            s = dp(r[:-1], tol)
            if len(s) >= 3: rings.append([[round(x, 4), round(y, 4)] for x, y in s] + [[round(s[0][0], 4), round(s[0][1], 4)]])
        if rings: out.append(rings)
    return {'type': 'Polygon', 'coordinates': out[0]} if len(out) == 1 else {'type': 'MultiPolygon', 'coordinates': out}

# default territories (historic regions): west -> east race
T = {
 'kurzeme': ['ventspils','ventspils-novads','liepajas','dienvidkurzemes-novads','kuldigas-novads','saldus-novads','talsu-novads','tukuma-novads'],
 'zemgale': ['jelgavas','jelgavas-novads','dobeles-novads','bauskas-novads','aizkraukles-novads','jekabpils-novads'],
 'pieriga': ['riga','jurmalas','marupes-novads','kekavas-novads','olaines-novads','salaspils-novads','ogres-novads','adazu-novads','ropazu-novads','saulkrastu-novads','siguldas-novads'],
 'vidzeme': ['limbazu-novads','valmieras-novads','cesu-novads','smiltenes-novads','valkas-novads','aluksnes-novads','gulbenes-novads','madonas-novads'],
 'latgale': ['rezeknes','rezeknes-novads','daugavpils','augsdaugavas-novads','kraslavas-novads','ludzas-novads','balvu-novads','preilu-novads','livanu-novads','varakl-anu-novads'],
}
rev = {m: t for t, ms in T.items() for m in ms}
d = json.load(open(os.path.join(RAW, 'ADM1.geojson'), encoding='utf8'))
feats, seen = [], set()
for f in d['features']:
    name = f['properties']['shapeName']; sid = slug(name)
    if sid == 'varak-lanu-novads': sid = 'varak-anu-novads'
    cand = [sid, sid.replace('varak-anu', 'varak-l-anu')]
    tid = next((rev[c] for c in cand if c in rev), None)
    if tid is None and 'varak' in sid: tid = 'latgale'
    feats.append({'type': 'Feature', 'properties': {'id': sid, 'name': name, 'territory': tid}, 'geometry': simp(f['geometry'], 0.0012)})
missing = [f['properties']['id'] for f in feats if not f['properties']['territory']]
print('unassigned:', missing)
os.makedirs(OUT, exist_ok=True)
json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(OUT, 'municipalities.geojson'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
c = json.load(open(os.path.join(RAW, 'ADM0.geojson'), encoding='utf8'))['features'][0]['geometry']
json.dump(simp(c, 0.004), open(os.path.join(OUT, 'country.json'), 'w'), separators=(',', ':'))
for n in ('municipalities.geojson', 'country.json'): print(n, os.path.getsize(os.path.join(OUT, n)))
