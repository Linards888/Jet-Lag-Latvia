import { html } from '/vendor/preact.js';

export const THEMES = [
  { id: 'sakura', name: 'Sakura', sw: ['#fff3f6', '#ffe1eb', '#e2457f'] },
  { id: 'matcha', name: 'Matcha', sw: ['#f3f8ec', '#e0f0d2', '#4f9238'] },
  { id: 'sora', name: 'Sora', sw: ['#eef7fd', '#d8ebfa', '#2e83d0'] },
  { id: 'yuzu', name: 'Yuzu', sw: ['#fff9e7', '#ffeab0', '#f2a100'] },
  { id: 'latvija', name: 'Latvija', sw: ['#f9f2eb', '#f4dcdc', '#9e3039'] },
  { id: 'yoru', name: 'Yoru', sw: ['#0f1620', '#172230', '#ff7a90'] },
  { id: 'sumi', name: 'Sumi', sw: ['#f3f3f0', '#e6e6e1', '#1b1b1b'] },
];

export const getTheme = () => document.documentElement.getAttribute('data-theme') || 'sakura';

export function setTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  try { localStorage.setItem('jll.theme', id); } catch {}
  const t = THEMES.find((x) => x.id === id);
  const m = document.querySelector('meta[name=theme-color]');
  if (m && t) m.setAttribute('content', t.sw[0]);
}

export function ThemePicker({ onPick }) {
  const cur = getTheme();
  return html`<div class="swatches">${THEMES.map((t) => html`<button class="swatch ${cur === t.id ? 'on' : ''}" key=${t.id} onClick=${() => { setTheme(t.id); onPick && onPick(t.id); }}>
    <span class="sw">${t.sw.map((c) => html`<i style=${{ background: c }}></i>`)}</span>${t.name}</button>`)}</div>`;
}
