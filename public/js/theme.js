import { html, useState, useEffect } from '/vendor/preact.js';
import { t } from './i18n.js';
import { Seg, Switch } from './ui.js';
import { useAccount, ownedSet, equip, accountToken } from './account.js';

// Each theme is a complete look (shape, type, background) - see css/style.css. The preview shows its personality.
export const THEMES = [
  { id: 'sakura', name: 'Sakura', pv: { bg: '#fff3f6', card: '#ffffff', ac: '#e2457f', line: '#f6d3de', r: 14, pill: 99, font: "'M PLUS Rounded 1c',sans-serif" } },
  { id: 'sora', name: 'Sora', pv: { bg: 'linear-gradient(160deg,#bfe0fb,#f6fbff)', card: 'rgba(255,255,255,.7)', ac: '#2e83d0', line: '#fff', r: 18, pill: 99, font: "'Comfortaa',sans-serif" } },
  { id: 'latvija', name: 'Latvija', pv: { bg: '#f7efe3', card: '#fffaf1', ac: '#9e3039', line: '#c8a98a', r: 1, pill: 1, font: "'Cormorant Garamond',serif" } },
  { id: 'kintsugi', name: 'Kintsugi', pv: { bg: '#141210', card: '#1d1a16', ac: '#d9ab3f', line: '#8a6d2c', r: 2, pill: 2, font: "'Cormorant Garamond',serif", glow: true } },
  { id: 'mezs', name: 'Me\u017cs', pv: { bg: '#eef5ea', card: '#fbfdf8', ac: '#3d7a4a', line: '#a6c79a', r: 8, pill: 8, font: "'Lora',serif" } },
  { id: 'okeans', name: 'Oke\u0101ns', pv: { bg: '#08222b', card: '#0e303b', ac: '#2ec4b6', line: '#2a6c7e', r: 14, pill: 99, font: "'Comfortaa',sans-serif", glow: true } },
  { id: 'saulriets', name: 'Saulriets', pv: { bg: 'linear-gradient(160deg,#ffe9d2,#ffc2d6)', card: '#fffaf5', ac: '#e85d3f', line: '#eba98a', r: 18, pill: 99, font: "'Comfortaa',sans-serif" } },
  { id: 'arcade', name: 'Arcade', pv: { bg: '#0b0716', card: '#150d2a', ac: '#ff3df2', line: '#3df2ff', r: 0, pill: 0, font: "'Press Start 2P',monospace", hard: true } },
  { id: 'hoshi', name: 'Hoshi', pv: { bg: 'linear-gradient(160deg,#0c0f2e,#232a6e)', card: 'rgba(40,46,104,.8)', ac: '#a393ff', line: '#4a4f9c', r: 18, pill: 99, font: "'M PLUS Rounded 1c',sans-serif", glow: true } },
  { id: 'hanabi', name: 'Hanabi', pv: { bg: 'linear-gradient(135deg,#2a0b44,#0b0a24 55%,#3a1230)', card: 'rgba(46,32,98,.8)', ac: '#ff5fa8', line: '#8a3a78', r: 20, pill: 99, font: "'Comfortaa',sans-serif", glow: true } },
  { id: 'zerotwo', name: '02', pv: { bg: 'linear-gradient(160deg,#fff0f4,#ffd6e2)', card: '#ffffff', ac: '#e0114a', line: '#ff8fb1', r: 8, pill: 12, font: "'Bebas Neue',sans-serif", hard: true } },
  { id: 'toradora', name: 'Toradora', pv: { bg: '#fff3dd', card: '#fffaf0', ac: '#f08a24', line: '#5a2a0a', r: 14, pill: 14, font: "'Comfortaa',sans-serif", hard: true } },
  { id: 'evangelion', name: 'Evangelion', pv: { bg: 'linear-gradient(160deg,#170f24,#2a1d4a)', card: '#21173a', ac: '#8cff3c', line: '#6a4bb0', r: 2, pill: 2, font: "'Cinzel',serif", glow: true } },
  { id: 'killlakill', name: 'Kill la Kill', pv: { bg: '#121212', card: '#1d1d1d', ac: '#ff1f3d', line: '#ffffff', r: 0, pill: 0, font: "'Bebas Neue',sans-serif", hard: true } },
];
export const FREE_THEMES = ['sakura', 'sora', 'latvija', 'kintsugi', 'mezs', 'okeans', 'saulriets', 'arcade'];

const DEFAULTS = { theme: 'sakura', motion: 'full', map: 'theme' };
let prefs = { ...DEFAULTS };

export function applyPrefs(p = prefs) {
  const r = document.documentElement;
  r.setAttribute('data-theme', p.theme);
  const attr = (k, v, d) => (v && v !== d ? r.setAttribute('data-' + k, v) : r.removeAttribute('data-' + k));
  attr('motion', p.motion, 'full'); attr('map', p.map, 'theme');
  window.dispatchEvent(new Event('jll-theme'));
  const th = THEMES.find((x) => x.id === p.theme);
  const m = document.querySelector('meta[name=theme-color]');
  if (m && th) m.setAttribute('content', th.pv.ac);
}

export function loadPrefs() {
  try { const o = JSON.parse(localStorage.getItem('jll.prefs') || '{}'); prefs = { ...DEFAULTS, theme: o.theme || DEFAULTS.theme, motion: o.motion || 'full', map: o.map || 'theme' }; } catch { prefs = { ...DEFAULTS }; }
  let loggedIn = false;
  try { loggedIn = !!localStorage.getItem('jll.acct'); } catch {}
  if (!THEMES.some((x) => x.id === prefs.theme) || (!loggedIn && !FREE_THEMES.includes(prefs.theme))) prefs.theme = 'sakura';
  applyPrefs();
}
export function setPrefs(patch) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem('jll.prefs', JSON.stringify(prefs)); } catch {}
  applyPrefs();
}
export function useTheme() {
  const [th, setTh] = useState(prefs.theme);
  useEffect(() => { const f = () => setTh(prefs.theme); window.addEventListener('jll-theme', f); return () => window.removeEventListener('jll-theme', f); }, []);
  return th;
}

// ---------------------------------------------------------------- appearance panel
function Preview({ th, on, onClick }) {
  const p = th.pv;
  return html`<button class="swatch ${on ? 'on' : ''}" onClick=${onClick} aria-label=${th.name} title=${th.name}>
    <span class="pv" style=${{ background: p.bg, borderRadius: p.r + 'px', borderColor: p.line, borderWidth: p.hard ? '2px' : '1px', boxShadow: p.hard ? '3px 3px 0 #141414' : p.glow ? '0 0 10px ' + p.ac + '88' : 'none', fontFamily: p.font }}>
      <b style=${{ background: p.line, borderRadius: p.r ? '4px' : '0' }}></b>
      <i style=${{ background: p.ac, borderRadius: Math.min(p.pill, 6) + 'px' }}></i></span>
    <span style=${{ fontFamily: p.font, fontWeight: 700 }}>${th.name}</span></button>`;
}

export function AppearancePanel() {
  const [, force] = useState(0);
  useAccount();
  const owned = ownedSet();
  const p = prefs;
  const set = (patch) => { setPrefs(patch); if (patch.theme && accountToken()) equip({ kind: 'theme', item: patch.theme }).catch(() => {}); force((x) => x + 1); };
  const opt = (key, vals) => html`<${Seg} options=${vals.map(([v, k]) => [v, t(k)])} value=${p[key]} onChange=${(v) => set({ [key]: v })} />`;
  return html`<div class="stack" style="gap:6px">
    <div class="swatches">${THEMES.filter((th) => FREE_THEMES.includes(th.id) || owned.has(th.id)).map((th) => html`<${Preview} th=${th} key=${th.id} on=${p.theme === th.id} onClick=${() => set({ theme: th.id })} />`)}</div>
    <label>${t('ap.map')}</label>${opt('map', [['theme', 'ap.theme_default'], ['normal', 'ap.m_normal'], ['muted', 'ap.m_muted'], ['dark', 'ap.m_dark']])}
    <label>${t('ap.motion')}</label>${opt('motion', [['full', 'ap.full'], ['reduced', 'ap.reduced'], ['off', 'ap.off']])}</div>`;
}
