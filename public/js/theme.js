import { html, useState } from '/vendor/preact.js';
import { t } from './i18n.js';
import { Seg, Switch } from './ui.js';

// Each theme is a complete look (shape, type, background) - see css/style.css. The preview shows its personality.
export const THEMES = [
  { id: 'sakura', name: 'Sakura', pv: { bg: '#fff3f6', card: '#ffffff', ac: '#e2457f', line: '#f6d3de', r: 14, pill: 99, font: "'M PLUS Rounded 1c',sans-serif" } },
  { id: 'matcha', name: 'Matcha', pv: { bg: '#f4f2e8', card: '#fbfaf3', ac: '#4f7f3a', line: '#bfbc9f', r: 3, pill: 3, font: "'Lora',serif" } },
  { id: 'sora', name: 'Sora', pv: { bg: 'linear-gradient(160deg,#bfe0fb,#f6fbff)', card: 'rgba(255,255,255,.7)', ac: '#2e83d0', line: '#fff', r: 18, pill: 99, font: "'Comfortaa',sans-serif" } },
  { id: 'yuzu', name: 'Yuzu', pv: { bg: '#ffe14d', card: '#ffffff', ac: '#ff4d2e', line: '#141414', r: 7, pill: 7, font: "'Unbounded',sans-serif", hard: true } },
  { id: 'latvija', name: 'Latvija', pv: { bg: '#f7efe3', card: '#fffaf1', ac: '#9e3039', line: '#c8a98a', r: 1, pill: 1, font: "'Cormorant Garamond',serif" } },
  { id: 'yoru', name: 'Yoru', pv: { bg: '#0a0d14', card: '#0f1521', ac: '#38f2c0', line: '#1d2a3f', r: 2, pill: 2, font: "'JetBrains Mono',monospace", glow: true } },
  { id: 'sumi', name: 'Sumi', pv: { bg: '#f6f5f1', card: '#ffffff', ac: '#121212', line: '#121212', r: 0, pill: 0, font: "'Playfair Display',serif", rule: true } },
];

const DEFAULTS = { theme: 'sakura', accent: '', radius: 100, text: 100, density: 'cozy', pattern: 'theme', cards: 'theme', buttons: 'theme', motion: 'full', map: 'theme', font: 'theme' };
const FONTS = {  // [body, display]
  rounded: ["'Nunito', sans-serif", "'M PLUS Rounded 1c', 'Nunito', sans-serif"], serif: ["'Lora', serif", "'Cormorant Garamond', 'Lora', serif"],
  sans: ["'Source Sans 3', sans-serif", "'Rubik', 'Source Sans 3', sans-serif"], mono: ["'JetBrains Mono', monospace", "'JetBrains Mono', monospace"],
  bold: ["'Rubik', sans-serif", "'Unbounded', 'Rubik', sans-serif"], editorial: ["'IBM Plex Sans', sans-serif", "'Playfair Display', serif"],
};
let prefs = { ...DEFAULTS };

export const getPrefs = () => prefs;

function lum(hex) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function applyPrefs(p = prefs) {
  const r = document.documentElement, s = r.style;
  r.setAttribute('data-theme', p.theme);
  const attr = (k, v, d) => (v && v !== d ? r.setAttribute('data-' + k, v) : r.removeAttribute('data-' + k));
  attr('density', p.density, 'cozy'); attr('pattern', p.pattern, 'theme'); attr('cards', p.cards, 'theme'); attr('buttons', p.buttons, 'theme'); attr('motion', p.motion, 'full'); attr('map', p.map, 'theme');
  s.setProperty('--rs', String(p.radius / 100)); s.setProperty('--ts', String(p.text / 100));
  const vars = ['--accent', '--accent-deep', '--accent-soft', '--accent-ink', '--ink-accent'];
  if (/^#[0-9a-f]{6}$/i.test(p.accent)) {
    s.setProperty('--accent', p.accent);
    s.setProperty('--accent-deep', 'color-mix(in srgb, ' + p.accent + ' 70%, #000)');
    s.setProperty('--accent-soft', 'color-mix(in srgb, ' + p.accent + ' 16%, var(--surface))');
    s.setProperty('--ink-accent', 'color-mix(in srgb, ' + p.accent + ' 75%, var(--text))');
    s.setProperty('--accent-ink', lum(p.accent) > 0.5 ? '#161616' : '#ffffff');
  } else vars.forEach((v) => s.removeProperty(v));
  if (FONTS[p.font]) { s.setProperty('--font-b', FONTS[p.font][0]); s.setProperty('--font-d', FONTS[p.font][1]); } else { s.removeProperty('--font-b'); s.removeProperty('--font-d'); }
  const th = THEMES.find((x) => x.id === p.theme);
  const m = document.querySelector('meta[name=theme-color]');
  if (m && th) m.setAttribute('content', th.pv.ac);
}

export function loadPrefs() {
  try { prefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('jll.prefs') || '{}') }; } catch { prefs = { ...DEFAULTS }; }
  if (!THEMES.some((x) => x.id === prefs.theme)) prefs.theme = 'sakura';
  applyPrefs();
}
export function setPrefs(patch) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem('jll.prefs', JSON.stringify(prefs)); } catch {}
  applyPrefs();
}
export const resetPrefs = () => setPrefs({ ...DEFAULTS, theme: prefs.theme });

// ---------------------------------------------------------------- appearance panel
function Preview({ th, on, onClick }) {
  const p = th.pv;
  return html`<button class="swatch ${on ? 'on' : ''}" onClick=${onClick} aria-label=${th.name}>
    <span class="pv" style=${{ background: p.bg, borderRadius: p.r + 'px', borderColor: p.line, borderWidth: p.hard ? '2px' : '1px', boxShadow: p.hard ? '3px 3px 0 #141414' : p.glow ? '0 0 10px ' + p.ac + '88' : 'none', fontFamily: p.font }}>
      <b style=${{ background: p.rule ? '#121212' : p.line, borderRadius: p.r ? '4px' : '0' }}></b>
      <i style=${{ background: p.ac, borderRadius: Math.min(p.pill, 6) + 'px' }}></i></span>
    <span style=${{ fontFamily: p.font, fontWeight: 700 }}>${th.name}</span></button>`;
}

export function AppearancePanel() {
  const [, force] = useState(0);
  const p = prefs;
  const set = (patch) => { setPrefs(patch); force((x) => x + 1); };
  const opt = (key, vals) => html`<${Seg} options=${vals.map(([v, k]) => [v, t(k)])} value=${p[key]} onChange=${(v) => set({ [key]: v })} />`;
  return html`<div class="stack" style="gap:6px">
    <p class="eyebrow">${t('ap.theme')}</p>
    <div class="swatches">${THEMES.map((th) => html`<${Preview} th=${th} key=${th.id} on=${p.theme === th.id} onClick=${() => set({ theme: th.id })} />`)}</div>
    <p class="eyebrow mt">${t('ap.customize')}</p>
    <label>${t('ap.accent')}</label>
    <div class="row nw"><input type="color" value=${p.accent || THEMES.find((x) => x.id === p.theme).pv.ac} onInput=${(e) => set({ accent: e.target.value })} />
      <button class="ghost sm" onClick=${() => set({ accent: '' })}>${t('ap.reset_accent')}</button></div>
    <label>${t('ap.roundness')}: ${p.radius}%</label><input type="range" min="0" max="160" step="10" value=${p.radius} onInput=${(e) => set({ radius: +e.target.value })} />
    <label>${t('ap.textsize')}: ${p.text}%</label><input type="range" min="85" max="135" step="5" value=${p.text} onInput=${(e) => set({ text: +e.target.value })} />
    <label>${t('ap.density')}</label>${opt('density', [['compact', 'ap.compact'], ['cozy', 'ap.cozy'], ['roomy', 'ap.roomy']])}
    <label>${t('ap.font')}</label>${opt('font', [['theme', 'ap.theme_default'], ['rounded', 'ap.f_rounded'], ['serif', 'ap.f_serif'], ['sans', 'ap.f_sans'], ['mono', 'ap.f_mono'], ['bold', 'ap.f_bold'], ['editorial', 'ap.f_editorial']])}
    <label>${t('ap.pattern')}</label>${opt('pattern', [['theme', 'ap.theme_default'], ['none', 'ap.none'], ['waves', 'ap.p_waves'], ['dots', 'ap.p_dots'], ['grid', 'ap.p_grid'], ['zigzag', 'ap.p_zigzag'], ['lines', 'ap.p_lines']])}
    <label>${t('ap.cards')}</label>${opt('cards', [['theme', 'ap.theme_default'], ['soft', 'ap.c_soft'], ['outline', 'ap.c_outline'], ['flat', 'ap.c_flat'], ['glass', 'ap.c_glass']])}
    <label>${t('ap.buttons')}</label>${opt('buttons', [['theme', 'ap.theme_default'], ['pill', 'ap.b_pill'], ['round', 'ap.b_round'], ['square', 'ap.b_square']])}
    <label>${t('ap.map')}</label>${opt('map', [['theme', 'ap.theme_default'], ['normal', 'ap.m_normal'], ['muted', 'ap.m_muted'], ['dark', 'ap.m_dark']])}
    <label>${t('ap.motion')}</label>${opt('motion', [['full', 'ap.full'], ['reduced', 'ap.reduced'], ['off', 'ap.off']])}
    <button class="ghost mt" onClick=${() => { resetPrefs(); force((x) => x + 1); }}>${t('ap.reset')}</button></div>`;
}
