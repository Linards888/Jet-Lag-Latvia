import { useState, useEffect, useRef, useCallback } from '/vendor/preact.js';
import { te, getLang } from './i18n.js';

// ---------------------------------------------------------------- saved sessions (this browser only)
export const saved = {
  all() { try { return JSON.parse(localStorage.getItem('jll.games') || '{}'); } catch { return {}; } },
  get(code) { return this.all()[code]; },
  set(code, v) { const a = this.all(); a[code] = { ...a[code], ...v }; try { localStorage.setItem('jll.games', JSON.stringify(a)); } catch {} },
  remove(code) { const a = this.all(); delete a[code]; try { localStorage.setItem('jll.games', JSON.stringify(a)); } catch {} },
};

// ---------------------------------------------------------------- toasts (errors / confirmations)
const toastSubs = new Set();
export function toast(msg, ok = false) { toastSubs.forEach((f) => f({ msg, ok, id: Math.random() })); }
export function useToasts() {
  const [t, setT] = useState(null);
  useEffect(() => {
    let timer;
    const f = (x) => { setT(x); clearTimeout(timer); timer = setTimeout(() => setT(null), 4500); };
    toastSubs.add(f);
    return () => { toastSubs.delete(f); clearTimeout(timer); };
  }, []);
  return t;
}

export async function api(method, path, body, token, raw) {
  const headers = {};
  if (token) headers['X-Token'] = token;
  if (body && !raw) headers['Content-Type'] = 'application/json';
  let res;
  try { res = await fetch('/api' + path, { method, headers, body: raw ? body : body ? JSON.stringify(body) : undefined }); }
  catch { const e = new Error('Cannot reach the server'); e.status = 0; throw e; }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error(te(data.error || 'Request failed (' + res.status + ')')); e.status = res.status; throw e; }
  return data;
}

// ---------------------------------------------------------------- static meta (cities, question menu, effect catalogue)
export const META = { cities: [], byId: {}, munis: null, questions: [], cats: [], effects: {}, shop: [] };
let geoPromise = null;
export async function loadMeta() {
  const m = await api('GET', '/meta');
  Object.assign(META, { cities: m.cities, byId: Object.fromEntries(m.cities.map((c) => [c.id, c])), questions: m.questions, cats: m.cats, effects: m.effects, shop: m.shop });
}
// the territory polygons are the biggest download, so they load in the background and maps redraw when they arrive
export function loadGeo() {
  if (!geoPromise) geoPromise = api('GET', '/geo/municipalities').then((g) => { META.munis = g; window.dispatchEvent(new Event('jll-geo')); }).catch(() => { geoPromise = null; });
  return geoPromise;
}
export function useGeo() {
  const [, tick] = useState(0);
  useEffect(() => { loadGeo(); const f = () => tick((x) => x + 1); window.addEventListener('jll-geo', f); return () => window.removeEventListener('jll-geo', f); }, []);
  return META.munis;
}
export const cityName = (id) => (META.byId[id] ? META.byId[id].name : id);

// ---------------------------------------------------------------- live game state
export function useGame(code) {
  const tokenRef = useRef((saved.get(code) || {}).token);
  const token = tokenRef.current;
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  const [conn, setConn] = useState(navigator.onLine === false ? 'off' : 'wait');
  const skew = useRef(0);
  const busy = useRef(false);
  const cat = useRef({ v: null, data: null });   // the catalogue (cards, tasks, territories) is fetched only when its version changes
  const load = useCallback(async () => {
    if (!token || busy.current) return;
    busy.current = true;
    try {
      const d = await api('GET', `/games/${code}/state?cv=${cat.current.v ?? ''}`, null, token);
      if (d.catalog) cat.current = { v: d.catV, data: d.catalog };
      d.settings = { ...d.settings, ...(cat.current.data || {}) };
      skew.current = d.now - Date.now();
      setSt(d); setErr(null); setConn('ok');
    } catch (e) {
      if (e.status === 0) setConn('off');
      else { setConn('ok'); setErr(e.status === 401 ? 'auth' : e.status === 404 ? 'gone' : e.message); }
    }
    busy.current = false;
  }, [code, token]);
  useEffect(() => {
    load();
    let es;
    try {
      es = new EventSource(`/api/games/${code}/events?t=${encodeURIComponent(token || '')}`);
      es.onmessage = () => load();
      es.onopen = () => setConn('ok');
      es.onerror = () => setConn(navigator.onLine === false ? 'off' : 'wait');
    } catch {}
    const iv = setInterval(() => { if (!document.hidden) load(); }, 8000);
    const vis = () => { if (!document.hidden) load(); };
    const on = () => { setConn('wait'); load(); };
    const off = () => setConn('off');
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { es && es.close(); clearInterval(iv); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [code, token]);
  const act = useCallback(async (type, payload, okMsg) => {
    try { await api('POST', `/games/${code}/action`, { type, payload }, token); if (okMsg) toast(okMsg, true); await load(); return true; }
    catch (e) { toast(e.message); load(); return false; }
  }, [code, token, load]);
  return { st, err, conn, act, load, skew, token };
}

export function useClock(skew) {
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  return Date.now() + (skew.current || 0);
}

// ---------------------------------------------------------------- GPS sharing
export function useLocation(code, token, enabled) {
  const [info, setInfo] = useState({ status: enabled ? 'waiting' : 'off', pos: null });
  const last = useRef({ pos: null, sent: 0 });
  useEffect(() => {
    if (!enabled) { setInfo({ status: 'off', pos: null }); return; }
    if (!navigator.geolocation) { setInfo({ status: 'error', msg: 'no-gps' }); return; }
    if (!window.isSecureContext) { setInfo({ status: 'error', msg: 'https' }); return; }
    let wake;
    const getWake = async () => { try { if (navigator.wakeLock && !document.hidden) wake = await navigator.wakeLock.request('screen'); } catch {} };
    getWake();
    const vis = () => { if (!document.hidden) getWake(); };
    document.addEventListener('visibilitychange', vis);
    const send = async (p) => {
      last.current.sent = Date.now();
      try { await api('POST', `/games/${code}/loc`, { lat: p.lat, lng: p.lng, acc: p.acc }, token); } catch {}
    };
    const onPos = (g) => {
      const p = { lat: g.coords.latitude, lng: g.coords.longitude, acc: g.coords.accuracy || 0, t: Date.now() };
      last.current.pos = p;
      setInfo({ status: 'ok', pos: p });
      if (Date.now() - last.current.sent > 12000) send(p);
    };
    const onErr = (e) => setInfo({ status: e.code === 1 ? 'denied' : 'waiting', msg: e.message, pos: last.current.pos });
    const id = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 4000, timeout: 30000 });
    const keep = setInterval(() => {
      const p = last.current.pos;
      if (p && Date.now() - last.current.sent > 18000 && Date.now() - p.t < 90000) send(p);
      else if (!p || Date.now() - p.t >= 90000) navigator.geolocation.getCurrentPosition(onPos, () => {}, { enableHighAccuracy: true, timeout: 20000 });
    }, 10000);
    return () => { navigator.geolocation.clearWatch(id); clearInterval(keep); document.removeEventListener('visibilitychange', vis); try { wake && wake.release(); } catch {} };
  }, [code, token, enabled]);
  return info;
}

// ---------------------------------------------------------------- pop-up notices (card played, answer ready ...)
export function useNotices(st) {
  const lastId = useRef(null);
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!st) return;
    const list = st.notices || [];
    const max = list.length ? list[list.length - 1].id : 0;
    if (lastId.current === null) { lastId.current = max; return; }  // do not replay history on first load
    const fresh = list.filter((n) => n.id > lastId.current);
    lastId.current = Math.max(lastId.current, max);
    if (!fresh.length) return;
    setItems((cur) => [...cur, ...fresh].slice(-3));
    fresh.forEach((n) => setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== n.id)), 6500));
    try { if (navigator.vibrate && fresh.some((n) => ['card', 'curse', 'question', 'answer', 'tag', 'round'].includes(n.kind))) navigator.vibrate([120, 60, 120]); } catch {}
  }, [st && st.notices && st.notices.length && st.notices[st.notices.length - 1].id]);
  return [items, (id) => setItems((cur) => cur.filter((x) => x.id !== id))];
}

// ---------------------------------------------------------------- photo upload (resized in the browser first)
export async function uploadPhoto(code, token, file) {
  const bmp = await new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => res(img); img.onerror = () => rej(new Error('Could not read that image')); img.src = url;
  });
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  const d = await api('POST', `/games/${code}/upload`, blob, token, true);
  return d.fid;
}
export const fileUrl = (code, token, fid) => `/api/games/${code}/file/${fid}?t=${encodeURIComponent(token)}`;

// ---------------------------------------------------------------- web push (notifications when the page is closed)
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
const b64ToBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
export async function pushStatus() {
  if (!pushSupported()) return { supported: false };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { supported: true, permission: Notification.permission, subscribed: !!sub };
}
export async function enablePush(code, token) {
  if (!pushSupported()) throw new Error('unsupported');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await api('GET', '/push/key');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  }
  await api('POST', `/games/${code}/push`, { subscription: sub.toJSON(), lang: getLang() }, token);
}
export async function disablePush(code, token) {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) { try { await api('POST', `/games/${code}/push/off`, { endpoint: sub.endpoint }, token); } catch {} await sub.unsubscribe(); }
}
// keep the server's record fresh (language, new device) whenever a game is opened with permission already granted
export async function refreshPush(code, token) {
  try { if (pushSupported() && Notification.permission === 'granted') await enablePush(code, token); } catch {}
}
export function localAlert(text) {   // used for in-page alerts (e.g. leaving the hiding zone) - vibrates and notifies even if the tab is in the background
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch {}
  try {
    if (document.hidden && pushSupported() && Notification.permission === 'granted') navigator.serviceWorker.ready.then((r) => r.showNotification('Jet Lag: Latvia', { body: text, vibrate: [200, 100, 200], icon: '/icon-192.png', tag: 'jll-local' }));
  } catch {}
}
