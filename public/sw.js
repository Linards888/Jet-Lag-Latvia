/* Jet Lag: Latvia service worker. The server substitutes the version hash and the file list below.
   1) instant repeat loads: the app shell, scripts, styles and languages are cached; fonts and map data are cached on first use
   2) web push: shows a notification (with vibration) even when the page is closed */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const APP = 'app-' + VERSION, RUNTIME = 'rt-v1';
importScripts('/i18n/en.js', '/i18n/lv.js', '/i18n/ru.js', '/i18n/uk.js');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== APP && k !== RUNTIME).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function swr(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const net = fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}
async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r && r.ok) cache.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;                       // map tiles etc. go straight to the network
  if (u.pathname === '/api/meta' || u.pathname === '/api/geo/municipalities') return e.respondWith(swr(req));
  if (u.pathname.startsWith('/api/') || u.pathname === '/sw.js') return;
  if (u.pathname.startsWith('/vendor/fonts/') || u.pathname.startsWith('/vendor/images/')) return e.respondWith(cacheFirst(req));
  if (req.mode === 'navigate' && u.pathname !== '/') return;      // unknown paths show the server's 404 page
  e.respondWith(caches.open(APP).then((c) => c.match(req.mode === 'navigate' ? '/' : req, { ignoreSearch: true })).then((hit) => hit || fetch(req)));
});

// ---------------------------------------------------------------- push
function render(d) {
  const L = self.JLL_LOCALES || {};
  const tpl = (L[d.lang] && L[d.lang]['n.' + d.key]) || (L.en && L.en['n.' + d.key]) || d.key;
  const a = d.args || {};
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (a[k] != null ? a[k] : ''));
}
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch (err) { d = { key: 'announce', args: { text: e.data ? e.data.text() : '' } }; }
  e.waitUntil(self.registration.showNotification(d.game || 'Jet Lag: Latvia', {
    body: render(d), tag: 'jll-' + (d.code || 'x') + '-' + (d.id || ''), renotify: true, vibrate: [220, 100, 220, 100, 320],
    icon: '/icon-192.png', badge: '/icon-192.png', data: { code: d.code },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = '/#/g/' + ((e.notification.data && e.notification.data.code) || '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { c.navigate && c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
