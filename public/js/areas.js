// "Where can the hider be?" - combines every answered question into a picture. Runs in the browser on a grid over Latvia:
// radar rings, thermometer half-planes, matching (region / municipality / nearest town), measuring (closer to a city) and tentacles.
import { META } from './api.js';
import { muniAt } from './ui.js';

const S = 55.65, N = 58.1, W = 20.9, E = 28.3, COLS = 230, ROWS = 136;
const D2R = Math.PI / 180, KM_LAT = 111.195;

function d2(a, b, c, d) {  // distance in km (equirectangular - plenty accurate at this scale)
  const x = (c - b) * Math.cos(((a + d) / 2) * D2R), y = a - d;
  return Math.sqrt(x * x + y * y) * KM_LAT * (1);
}
function dist(lat1, lng1, lat2, lng2) { const x = (lng2 - lng1) * D2R * Math.cos(((lat1 + lat2) / 2) * D2R), y = (lat2 - lat1) * D2R; return Math.sqrt(x * x + y * y) * 6371; }

function nearest(lat, lng, republic) {
  let best = null, bd = 1e9;
  for (const c of META.cities) { if (republic && !c.republic) continue; const d = dist(lat, lng, c.lat, c.lng); if (d < bd) { bd = d; best = c; } }
  return [best, bd];
}

const cache = { key: '', res: null };

export function computeArea(questions) {
  const cons = [];
  for (const q of questions) {
    if (q.status !== 'answered' || !q.answer || !q.params) continue;
    const p = q.qid.split(':'), c = q.params.center, a = q.answer;
    if (q.cat === 'radar' && c) cons.push({ k: 'radar', c, km: +p[1], hit: a.hit });
    else if (q.cat === 'thermo' && q.params.start && q.params.end) cons.push({ k: 'thermo', s: q.params.start, e: q.params.end, hot: a.hot });
    else if (q.cat === 'matching' && c) cons.push({ k: 'match', kind: p[1], c, same: a.same });
    else if (q.cat === 'measuring' && c && p[1] === 'c') cons.push({ k: 'mcity', city: META.byId[p[2]], c, closer: a.closer });
    else if (q.cat === 'measuring' && c && p[1] === 'city') cons.push({ k: 'mnear', c, closer: a.closer });
    else if (q.cat === 'tentacles' && c) cons.push({ k: 'tent', c, km: +p[2], pool: p[1], city: a.city, outside: a.outside });
  }
  const key = JSON.stringify(cons) + (META.munis ? 'm' : '');
  if (cache.key === key) return cache.res;
  if (!cons.length || !META.munis) { cache.key = key; cache.res = null; return null; }

  // properties of the asker's own position (needed for matching questions)
  for (const k of cons) if (k.k === 'match') { const m = muniAt(META.munis, k.c.lat, k.c.lng); k.mp = m; k.cityA = nearest(k.c.lat, k.c.lng, false)[0]; k.repA = nearest(k.c.lat, k.c.lng, true)[0]; }
  const cv = document.createElement('canvas'); cv.width = COLS; cv.height = ROWS;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(COLS, ROWS);
  const ok = new Uint8Array(COLS * ROWS), possibleMunis = new Set();
  let possible = 0;
  for (let j = 0; j < ROWS; j++) {
    const lat = N - ((j + 0.5) / ROWS) * (N - S);
    for (let i = 0; i < COLS; i++) {
      const lng = W + ((i + 0.5) / COLS) * (E - W);
      let good = true, props;
      for (const k of cons) {
        if (k.k === 'radar') good = (dist(lat, lng, k.c.lat, k.c.lng) <= k.km) === k.hit;
        else if (k.k === 'thermo') good = (dist(lat, lng, k.e.lat, k.e.lng) < dist(lat, lng, k.s.lat, k.s.lng)) === k.hot;
        else if (k.k === 'mcity' && k.city) good = (dist(lat, lng, k.city.lat, k.city.lng) < dist(k.c.lat, k.c.lng, k.city.lat, k.city.lng)) === k.closer;
        else if (k.k === 'mnear') good = (nearest(lat, lng, false)[1] < nearest(k.c.lat, k.c.lng, false)[1]) === k.closer;
        else if (k.k === 'tent') {
          const inside = dist(lat, lng, k.c.lat, k.c.lng) <= k.km;
          good = k.outside ? !inside : inside && nearest(lat, lng, k.pool === 'republic')[0].id === k.city;
        } else if (k.k === 'match') {
          if (k.kind === 'region' || k.kind === 'municipality') {
            props = props || muniAt(META.munis, lat, lng);
            const a = props && (k.kind === 'region' ? props.territory : props.id), b = k.mp && (k.kind === 'region' ? k.mp.territory : k.mp.id);
            good = (a === b && a != null) === k.same;
          } else if (k.kind === 'nearest_city') good = (nearest(lat, lng, false)[0].id === k.cityA.id) === k.same;
          else good = (nearest(lat, lng, true)[0].id === k.repA.id) === k.same;
        }
        if (!good) break;
      }
      if (good) {
        props = props || muniAt(META.munis, lat, lng);   // the hider must be inside Latvia
        if (!props) good = false; else possibleMunis.add(props.id);
      }
      const o = (j * COLS + i) * 4;
      ok[j * COLS + i] = good ? 1 : 0;
      if (good) possible++;
      img.data[o] = 12; img.data[o + 1] = 8; img.data[o + 2] = 20; img.data[o + 3] = good ? 0 : 150;
    }
  }
  ctx.putImageData(img, 0, 0);
  const res = { url: cv.toDataURL('image/png'), bounds: [[S, W], [N, E]], key: String(key.length) + ':' + possible, possibleMunis, percent: Math.round((possible / (COLS * ROWS)) * 100), count: cons.length };
  cache.key = key; cache.res = res;
  return res;
}
