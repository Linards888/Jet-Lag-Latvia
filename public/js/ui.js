import { html, useState, useEffect } from '/vendor/preact.js';
import { useToasts } from './api.js';
import { getLocale, t } from './i18n.js';

// ---------------------------------------------------------------- icons (inline SVG, no emoji)
const PATHS = {
  back: 'M15 5l-7 7 7 7', close: 'M6 6l12 12M18 6L6 18', check: 'M5 12.5l4.5 4.5L19 7.5', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  palette: 'M12 3a9 9 0 100 18c1.4 0 2-1 1.6-2-.5-1.2.3-2.5 1.7-2.5H17a4 4 0 004-4c0-5-4-9.5-9-9.5zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01',
  book: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h10',
  copy: 'M9 9h10v11H9zM5 15V4h10', pin: 'M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4', trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};
export function Ico({ n, size = 18 }) {
  return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${PATHS[n]} /></svg>`;
}

// ---------------------------------------------------------------- mascot: a little mochi
export function Mochi({ size = 96, mood = 'happy' }) {
  const eyes = mood === 'sleepy'
    ? html`<path d="M34 54q5 5 10 0M56 54q5 5 10 0" stroke="#3e2432" stroke-width="3.2" fill="none" stroke-linecap="round" />`
    : html`<circle cx="39" cy="54" r="4.2" fill="#3e2432" /><circle cx="61" cy="54" r="4.2" fill="#3e2432" /><circle cx="40.4" cy="52.6" r="1.4" fill="#fff" /><circle cx="62.4" cy="52.6" r="1.4" fill="#fff" />`;
  return html`<svg class="mochi" width=${size} height=${size} viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="50" cy="90" rx="30" ry="5" fill="#000" opacity=".08" />
    <path d="M14 62c0-24 15-40 36-40s36 16 36 40c0 14-12 24-36 24S14 76 14 62z" fill="#fff" stroke="var(--line2)" stroke-width="2.5" />
    <path d="M42 26c4-9 12-11 18-8-1 8-9 12-18 8z" fill="var(--accent)" /><path d="M50 24c-2-7 2-12 7-14" stroke="var(--accent-deep)" stroke-width="2.5" fill="none" stroke-linecap="round" />
    ${eyes}
    <ellipse cx="29" cy="64" rx="6" ry="4" fill="var(--accent)" opacity=".35" /><ellipse cx="71" cy="64" rx="6" ry="4" fill="var(--accent)" opacity=".35" />
    <path d="M45 65q5 5 10 0" stroke="#3e2432" stroke-width="3" fill="none" stroke-linecap="round" />
  </svg>`;
}

export function Empty({ children, mood }) { return html`<div class="empty"><${Mochi} size=${72} mood=${mood || 'sleepy'} /><div>${children}</div></div>`; }

// ---------------------------------------------------------------- basics
export function Toasts() {
  const t = useToasts();
  return t ? html`<div class="toast ${t.ok ? 'ok' : ''}" key=${t.id}>${t.msg}</div>` : null;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const f = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { window.removeEventListener('keydown', f); document.body.style.overflow = prev; }; }, []);
  return html`<div class="modal-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-h"><h2>${title}</h2><button class="ghost icon" onClick=${onClose} aria-label=${t('close')}><${Ico} n="close" /></button></div>${children}</div></div>`;
}

// a card with a title row (and optional controls on the right)
export function Section({ title, right, children, cls = '', id }) {
  return html`<section class="card ${cls}" id=${id}>${(title || right) && html`<div class="sec-h"><h2>${title}</h2>${right}</div>`}${children}</section>`;
}
// a collapsible card
export function Fold({ title, children, open, cls = '' }) {
  return html`<details class="card sec ${cls}" open=${open}><summary><h2>${title}</h2></summary><div class="mt">${children}</div></details>`;
}

export const Chip = ({ color, children, cls = '' }) =>
  html`<span class="chip ${cls}">${color && html`<i class="dot" style=${{ background: color }}></i>`}${children}</span>`;

export function Field({ label, children }) { return html`<div><label>${label}</label>${children}</div>`; }

export function Switch({ checked, onChange, children }) {
  return html`<label class="switch"><input type="checkbox" checked=${checked} onChange=${(e) => onChange(e.target.checked)} /><span class="tr"></span><span>${children}</span></label>`;
}

export function Seg({ options, value, onChange }) {
  return html`<div class="seg">${options.map(([v, l]) => html`<button class=${value === v ? 'on' : ''} onClick=${() => onChange(v)} key=${v}>${l}</button>`)}</div>`;
}

export function Dots({ n, max = 6 }) { return html`<span class="dots" title=${n + ' of ' + max}>${Array.from({ length: max }, (_, i) => html`<i class=${i < n ? 'on' : ''}></i>`)}</span>`; }

// a <button> that runs an async handler and disables itself meanwhile
export function AsyncBtn({ onClick, children, confirm, ...rest }) {
  const [busy, setBusy] = useState(false);
  return html`<button ...${rest} disabled=${busy || rest.disabled} onClick=${async () => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); try { await onClick(); } finally { setBusy(false); }
  }}>${children}</button>`;
}

// ---------------------------------------------------------------- formatting & geo
export function fmtDur(ms, secs) {
  ms = Math.max(0, ms | 0);
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (secs || h === 0) return h ? `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s` : `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Riga' });
export const fmtDateTime = (ts) => new Date(ts).toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Riga' });
export const fmtKm = (m) => (m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km');

export function dist(a, b) {
  const R = 6371008.8, p = Math.PI / 180;
  const dLat = (b.lat - a.lat) * p, dLng = (b.lng - a.lng) * p;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function useLocalState(key, init) {
  const [v, setV] = useState(() => { try { const s = sessionStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; } });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

export function copy(text) { try { navigator.clipboard.writeText(text); return true; } catch { return false; } }

// which municipality is a point in?  (client-side point-in-polygon on the same geodata the server uses)
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
