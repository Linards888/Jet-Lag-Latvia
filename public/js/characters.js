import { html } from '/vendor/preact.js';
import { t } from './i18n.js';
import { Mochi } from './ui.js';

/*  Every theme has its own mascot, stickers and a short lore text. The six character themes use a small anime-style girl drawn
    here as plain SVG (fan-style doodles with the palette of the show they nod to, no official art); the free themes use the Mochi mascot. */

const SKIN = '#ffe6d6';

// ---------------------------------------------------------------- the girl: back hair + body + head + eyes + fringe + accessories
const BACK = {
  long: (h) => html`<path d="M22 60C12 110 20 142 36 146L84 146C100 142 108 110 98 60Z" fill=${h} />`,
  twin: (h) => html`<path d="M26 54C4 70 2 122 18 140C28 122 32 90 36 66Z" fill=${h} /><path d="M94 54C116 70 118 122 102 140C92 122 88 90 84 66Z" fill=${h} />`,
  bob: (h) => html`<path d="M24 52Q22 116 38 118L82 118Q98 116 96 52Z" fill=${h} />`,
  short: (h) => html`<path d="M26 56Q24 92 34 98L86 98Q96 92 94 56Z" fill=${h} />`,
  pony: (h) => html`<path d="M22 60C16 90 24 112 36 116L84 116C94 100 98 76 98 60Z" fill=${h} /><path d="M96 46C118 50 122 100 108 138C100 112 98 84 90 66Z" fill=${h} />`,
};
const ACC = {
  horns: (c) => html`<path d="M36 30L30 4L50 22Z" fill=${c} /><path d="M84 30L90 4L70 22Z" fill=${c} />`,
  star: (c) => html`<path d="M34 40l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill=${c} stroke="#fff" stroke-width="1.5" />`,
  flower: (c) => html`<g transform="translate(86 36)"><circle r="3.4" fill="#ffd166" />${[0, 72, 144, 216, 288].map((a) => html`<ellipse key=${a} cx="0" cy="-7" rx="3.8" ry="5.6" fill=${c} transform=${'rotate(' + a + ')'} />`)}<circle r="3" fill="#ffd166" /></g>`,
  ribbon: (c) => html`<g transform="translate(88 30)"><path d="M0 0L-16 -9L-16 9Z" fill=${c} /><path d="M0 0L16 -9L16 9Z" fill=${c} /><circle r="4" fill=${c} stroke="#fff" stroke-width="1.5" /></g>`,
  headset: (c) => html`<rect x="18" y="44" width="10" height="22" rx="3" fill=${c} stroke="#222" stroke-width="1.5" /><rect x="92" y="44" width="10" height="22" rx="3" fill=${c} stroke="#222" stroke-width="1.5" />`,
  streak: (c) => html`<path d="M46 24C44 38 48 48 52 56C56 46 54 34 52 24Z" fill=${c} />`,
  tigerears: (c) => html`<path d="M28 40L24 14L50 28Z" fill=${c} /><path d="M92 40L96 14L70 28Z" fill=${c} /><path d="M30 30l5-1M31 24l6-1M90 30l-5-1M89 24l-6-1" stroke="#5a2a0a" stroke-width="1.6" />`,
  cheeks: () => html`<path d="M32 78l7-2M32 84l8 0M88 78l-7-2M88 84l-8 0" stroke="#5a2a0a" stroke-width="1.6" stroke-linecap="round" />`,
  blade: () => html`<g transform="translate(96 118) rotate(24)"><path d="M0 -62L9 -52L9 6L0 14L-9 6L-9 -52Z" fill="#e8ecf5" stroke="#222" stroke-width="2" /><path d="M0 -62L0 14" stroke="#ff1f3d" stroke-width="3" /><rect x="-12" y="8" width="24" height="7" rx="2" fill="#ff1f3d" stroke="#222" stroke-width="1.5" /></g>`,
};
function Girl({ hair = '#e75480', eyes = '#38b6a5', outfit = '#fff', style = 'long', acc = [], size = 150, fringe }) {
  const f = fringe || hair;
  return html`<svg class="girl" width=${size} height=${size * 1.25} viewBox="0 0 120 150" aria-hidden="true">
    ${BACK[style](hair)}
    <path d="M30 150Q34 118 60 116Q86 118 90 150Z" fill=${outfit} stroke="#222" stroke-width="1.5" /><path d="M52 118L60 132L68 118" fill=${SKIN} stroke="#222" stroke-width="1.2" />
    <ellipse cx="60" cy="68" rx="34" ry="36" fill=${SKIN} stroke="#222" stroke-width="1.5" />
    <ellipse cx="45" cy="72" rx="7.5" ry="10.5" fill="#fff" stroke="#222" stroke-width="1.3" /><ellipse cx="75" cy="72" rx="7.5" ry="10.5" fill="#fff" stroke="#222" stroke-width="1.3" />
    <ellipse cx="46" cy="74" rx="5.2" ry="8.4" fill=${eyes} /><ellipse cx="74" cy="74" rx="5.2" ry="8.4" fill=${eyes} />
    <ellipse cx="46" cy="75" rx="2.4" ry="4.6" fill="#1a1a2a" /><ellipse cx="74" cy="75" rx="2.4" ry="4.6" fill="#1a1a2a" />
    <circle cx="43.6" cy="70" r="2.1" fill="#fff" /><circle cx="71.6" cy="70" r="2.1" fill="#fff" /><circle cx="47.5" cy="79" r="1" fill="#fff" /><circle cx="75.5" cy="79" r="1" fill="#fff" />
    <path d="M37 60Q45 56 52 60M68 60Q75 56 83 60" stroke="#222" stroke-width="1.8" fill="none" stroke-linecap="round" />
    <ellipse cx="35" cy="88" rx="6" ry="3.6" fill="#ff8fa3" opacity=".5" /><ellipse cx="85" cy="88" rx="6" ry="3.6" fill="#ff8fa3" opacity=".5" /><path d="M54 93Q60 99 66 93" stroke="#a23a3a" stroke-width="2" fill="none" stroke-linecap="round" />
    <path d="M24 70C18 30 42 20 60 20C78 20 102 30 96 70C92 52 84 44 74 44C70 52 60 52 56 44C46 46 34 52 24 70Z" fill=${f} stroke="#222" stroke-width="1.4" />
    <path d="M24 70C26 84 28 92 32 98C32 84 34 76 36 66ZM96 70C94 84 92 92 88 98C88 84 86 76 84 66Z" fill=${f} />
    ${acc.map(([k, c]) => html`<g key=${k}>${ACC[k](c)}</g>`)}
  </svg>`;
}

// ---------------------------------------------------------------- stickers (simple shapes, colour per theme)
const STICKER = {
  star: (c) => html`<path d="M28 4l7 16 17 2-13 12 4 17-15-9-15 9 4-17L4 22l17-2z" fill=${c} stroke="#222" stroke-width="2.4" stroke-linejoin="round" />`,
  heart: (c) => html`<path d="M28 50C8 36 4 22 12 13c7-7 15-3 16 3 1-6 9-10 16-3 8 9 4 23-16 37z" fill=${c} stroke="#222" stroke-width="2.4" stroke-linejoin="round" />`,
  paw: (c) => html`<g fill=${c} stroke="#222" stroke-width="2"><ellipse cx="28" cy="36" rx="13" ry="11" /><ellipse cx="12" cy="22" rx="5.5" ry="7" /><ellipse cx="22" cy="12" rx="5.5" ry="7" /><ellipse cx="34" cy="12" rx="5.5" ry="7" /><ellipse cx="44" cy="22" rx="5.5" ry="7" /></g>`,
  scissors: (c) => html`<g stroke="#222" stroke-width="2.2" stroke-linejoin="round"><path d="M10 6L38 36L32 42L6 12Z" fill="#e8ecf5" /><path d="M46 6L18 36L24 42L50 12Z" fill=${c} /><circle cx="14" cy="46" r="6" fill="none" stroke=${c} stroke-width="4" /><circle cx="42" cy="46" r="6" fill="none" stroke=${c} stroke-width="4" /></g>`,
  spark: (c) => html`<path d="M28 2L34 22L54 28L34 34L28 54L22 34L2 28L22 22Z" fill=${c} stroke="#222" stroke-width="2.4" stroke-linejoin="round" />`,
  flower: (c) => html`<g stroke="#222" stroke-width="2">${[0, 72, 144, 216, 288].map((a) => html`<ellipse key=${a} cx="28" cy="14" rx="8" ry="12" fill=${c} transform=${'rotate(' + a + ' 28 28)'} />`)}<circle cx="28" cy="28" r="7" fill="#ffd166" /></g>`,
  bolt: (c) => html`<path d="M32 2L10 32H26L20 54L46 22H30Z" fill=${c} stroke="#222" stroke-width="2.4" stroke-linejoin="round" />`,
  ring: (c) => html`<g fill="none" stroke="#222" stroke-width="2.4"><circle cx="28" cy="28" r="22" fill=${c} /><circle cx="28" cy="28" r="13" fill="#fff" /><circle cx="28" cy="28" r="5" fill=${c} /></g>`,
  hex: (c) => html`<path d="M28 3L50 15V41L28 53L6 41V15Z" fill=${c} stroke="#222" stroke-width="2.4" stroke-linejoin="round" /><path d="M28 17L40 24V36L28 43L16 36V24Z" fill="none" stroke="#222" stroke-width="2" />`,
  burst: (c) => html`<g stroke=${c} stroke-width="4" stroke-linecap="round" fill="none">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => html`<path key=${a} d="M28 6V16" transform=${'rotate(' + a + ' 28 28)'} />`)}</g><circle cx="28" cy="28" r="6" fill=${c} stroke="#222" stroke-width="2" />`,
};
const Sticker = ({ kind, color, label, tilt = 0 }) => html`<span class="sticker" style=${{ transform: 'rotate(' + tilt + 'deg)' }}><svg width="46" height="46" viewBox="0 0 56 56" aria-hidden="true">${STICKER[kind](color)}</svg><b>${label}</b></span>`;

// ---------------------------------------------------------------- per theme: mascot art + stickers (lore texts are translated: char.<id>, lore.<id>)
const THEME_INFO = {
  zerotwo: { girl: { hair: '#ff8fb1', fringe: '#ff7aa2', eyes: '#35c9a8', outfit: '#e0114a', style: 'long', acc: [['horns', '#e0114a']] }, stickers: [['heart', '#ff4d83', 'Partner'], ['bolt', '#ffc2d4', 'Go'], ['spark', '#e0114a', 'Ride'], ['ring', '#ff7aa2', '02']] },
  toradora: { girl: { hair: '#c27a3d', fringe: '#b5682c', eyes: '#8a4b1a', outfit: '#f08a24', style: 'long', acc: [['tigerears', '#f08a24'], ['cheeks', '']] }, stickers: [['paw', '#f08a24', 'Tiger'], ['star', '#ffd27a', 'Palmtop'], ['heart', '#f26b5e', 'Bento'], ['spark', '#8a4b1a', 'Grr']] },
  evangelion: { girl: { hair: '#8fc3ff', fringe: '#7db4f5', eyes: '#d62839', outfit: '#f4f1ff', style: 'bob', acc: [['headset', '#ff6a00']] }, stickers: [['hex', '#8cff3c', 'Sync'], ['bolt', '#ff6a00', 'Warning'], ['ring', '#7b3fb5', 'Unit'], ['spark', '#b24bff', 'Pattern']] },
  killlakill: { girl: { hair: '#1b1b24', fringe: '#1b1b24', eyes: '#4aa3ff', outfit: '#ff1f3d', style: 'short', acc: [['streak', '#ff1f3d'], ['blade', '']] }, stickers: [['scissors', '#ff1f3d', 'Cut'], ['bolt', '#ffffff', 'Spirit'], ['spark', '#ff1f3d', 'Fight'], ['ring', '#1b1b24', 'Uniform']] },
  hoshi: { girl: { hair: '#8d7bff', fringe: '#7a68e8', eyes: '#ffd479', outfit: '#2a2f78', style: 'twin', acc: [['star', '#ffd479']] }, stickers: [['star', '#ffd479', 'Star'], ['spark', '#c9c0ff', 'Glow'], ['ring', '#8d7bff', 'Orbit'], ['burst', '#ffd479', 'Nova']] },
  hanabi: { girl: { hair: '#2b1a4a', fringe: '#3a2262', eyes: '#ff5fa8', outfit: '#ff5fa8', style: 'pony', acc: [['flower', '#ff8cc4']] }, stickers: [['burst', '#ff5fa8', 'Hanabi'], ['flower', '#ff8cc4', 'Matsuri'], ['spark', '#ffd166', 'Boom'], ['star', '#7ad0ff', 'Night']] },
};
const FREE_STICKERS = {
  sakura: [['flower', '#ff8fb1', 'Sakura'], ['heart', '#e2457f', 'Mochi']], sora: [['star', '#7ad0ff', 'Sky'], ['ring', '#2e83d0', 'Cloud']],
  latvija: [['spark', '#9e3039', 'Raksts'], ['star', '#c99a3b', 'Saule']], kintsugi: [['spark', '#d9ab3f', 'Gold'], ['ring', '#d9ab3f', 'Mend']],
  mezs: [['flower', '#7fbf6a', 'Mezs'], ['star', '#3d7a4a', 'Ozols']], okeans: [['ring', '#2ec4b6', 'Wave'], ['spark', '#8be4da', 'Glow']],
  saulriets: [['burst', '#e85d3f', 'Sun'], ['star', '#ffb347', 'Dune']], arcade: [['bolt', '#ff3df2', 'Zap'], ['hex', '#3df2ff', 'Coin']],
};
const stickersOf = (theme) => (THEME_INFO[theme] ? THEME_INFO[theme].stickers : FREE_STICKERS[theme] || FREE_STICKERS.sakura);

// the picture that stands in for the old floating blob: the theme's own character, no animation
function Mascot({ theme, size = 150 }) {
  const info = THEME_INFO[theme];
  return info ? html`<${Girl} ...${info.girl} size=${size} />` : html`<${Mochi} size=${size * 0.78} />`;
}
const TILT = [-8, 6, -4, 9];
const Stickers = ({ theme, cls = '' }) => html`<div class="stickers ${cls}">${stickersOf(theme).map(([k, c, l], i) => html`<${Sticker} key=${k + i} kind=${k} color=${c} label=${l} tilt=${TILT[i % 4]} />`)}</div>`;
export function ThemeHero({ theme }) {
  return html`<div class="theme-hero"><${Mascot} theme=${theme} size=${130} /><${Stickers} theme=${theme} /></div>`;
}
export function ThemeCard({ theme, name }) {
  return html`<section class="card theme-card"><div class="row nw" style="gap:16px;align-items:flex-start"><${Mascot} theme=${theme} size=${120} />
    <div class="grow"><h2 style="margin:0">${name}</h2><div class="title-tag">${t('char.' + theme)}</div><p class="small" style="margin:6px 0 0">${t('lore.' + theme)}</p></div></div>
    <${Stickers} theme=${theme} cls="mt" /></section>`;
}
