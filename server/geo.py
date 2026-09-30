"""Geometry helpers + Latvian geodata (municipalities = territory building blocks)."""
import json
import math
import os

_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'geodata')
with open(os.path.join(_DIR, 'cities.json'), encoding='utf8') as f:
    CITIES = json.load(f)
CITY_BY_ID = {c['id']: c for c in CITIES}
with open(os.path.join(_DIR, 'municipalities.geojson'), encoding='utf8') as f:
    MUNI_GEOJSON = json.load(f)
with open(os.path.join(_DIR, 'country.json'), encoding='utf8') as f:
    COUNTRY = json.load(f)

R_EARTH = 6371008.8


def haversine(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(min(1, math.sqrt(a)))


def _in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _polys(geom):
    return [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']


def _bbox(geom):
    xs = [p[0] for poly in _polys(geom) for p in poly[0]]
    ys = [p[1] for poly in _polys(geom) for p in poly[0]]
    return min(xs), min(ys), max(xs), max(ys)


def in_geom(lat, lng, geom):
    for poly in _polys(geom):
        if _in_ring(lng, lat, poly[0]) and not any(_in_ring(lng, lat, h) for h in poly[1:]):
            return True
    return False


MUNIS = []
for _f in MUNI_GEOJSON['features']:
    MUNIS.append((_f['properties']['id'], _f['properties'], _f['geometry'], _bbox(_f['geometry'])))
MUNI_BY_ID = {m[0]: m[1] for m in MUNIS}
DEFAULT_MUNI_TERRITORY = {m[0]: m[1]['territory'] for m in MUNIS}


def muni_at(lat, lng):
    """id of the municipality/administrative unit containing the point, or None (outside Latvia)."""
    for mid, _p, geom, (x0, y0, x1, y1) in MUNIS:
        if x0 <= lng <= x1 and y0 <= lat <= y1 and in_geom(lat, lng, geom):
            return mid
    return None


def in_latvia(lat, lng):
    return muni_at(lat, lng) is not None


def territory_at(lat, lng, muni_territory):
    m = muni_at(lat, lng)
    return muni_territory.get(m) if m else None


def nearest_city(lat, lng, republic_only=False):
    best, bd = None, 1e18
    for c in CITIES:
        if republic_only and not c['republic']:
            continue
        d = haversine(lat, lng, c['lat'], c['lng'])
        if d < bd:
            best, bd = c, d
    return best, bd


def dist_to_border(lat, lng):
    """Metres from the point to Latvia's outline (land border + coast)."""
    k = math.cos(math.radians(lat))
    best = 1e18
    for poly in _polys(COUNTRY):
        for ring in poly:
            for i in range(len(ring) - 1):
                (x1, y1), (x2, y2) = ring[i], ring[i + 1]
                ax, ay = (x1 - lng) * k, y1 - lat
                bx, by = (x2 - lng) * k, y2 - lat
                dx, dy = bx - ax, by - ay
                L = dx * dx + dy * dy
                t = 0 if L == 0 else max(0, min(1, -(ax * dx + ay * dy) / L))
                px, py = ax + t * dx, ay + t * dy
                d = math.hypot(px, py)
                if d < best:
                    best = d
    return best * 111195.0
