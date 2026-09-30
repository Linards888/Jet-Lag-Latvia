import { html, useState, useEffect } from '/vendor/preact.js';
import { useToasts } from './api.js';

export function Toasts() {
  const t = useToasts();
  return t ? html`<div class="toast ${t.ok ? 'ok' : ''}" key=${t.id}>${t.msg}</div>` : null;
}

export function Modal({ title, onClose, children }) {
  return html`<div class="modal-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="modal"><div class="row sp"><h2>${title}</h2><button class="sec sm" onClick=${onClose}>Close</button></div>${children}</div></div>`;
}

export const Chip = ({ color, children, cls = '' }) =>
  html`<span class="chip ${cls}">${color && html`<i class="dot" style=${{ background: color }}></i>`}${children}</span>`;

export function fmtDur(ms, secs) {
  ms = Math.max(0, ms | 0);
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (secs || h === 0) return h ? `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s` : `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
export const fmtTime = (t) => new Date(t).toLocaleTimeString('lv-LV', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Riga' });
export const fmtDateTime = (t) => new Date(t).toLocaleString('lv-LV', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Riga' });
export const fmtKm = (m) => (m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km');

export function dist(a, b) {
  const R = 6371008.8, p = Math.PI / 180;
  const dLat = (b.lat - a.lat) * p, dLng = (b.lng - a.lng) * p;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// a <button> that runs an async handler and disables itself meanwhile
export function AsyncBtn({ onClick, children, confirm, ...rest }) {
  const [busy, setBusy] = useState(false);
  return html`<button ...${rest} disabled=${busy || rest.disabled} onClick=${async () => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); try { await onClick(); } finally { setBusy(false); }
  }}>${children}</button>`;
}

export function Field({ label, help, children }) {
  return html`<div><label>${label}</label>${children}${help && html`<div class="help">${help}</div>`}</div>`;
}

export function useLocalState(key, init) {
  const [v, setV] = useState(() => { try { const s = sessionStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; } });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

export function copy(text) {
  try { navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// which territory (and municipality) is a point in?  (client side point-in-polygon on the same geodata as the server)
export function muniAt(geo, lat, lng) {
  const inRing = (ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
  for (const f of geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) if (inRing(poly[0]) && !poly.slice(1).some(inRing)) return f.properties;
  }
  return null;
}

export const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
