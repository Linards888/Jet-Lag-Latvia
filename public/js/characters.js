import { html, useState, useEffect } from '/vendor/preact.js';
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

// ---------------------------------------------------------------- original SVG mascots (used until the owner uploads a picture for the theme)
const Cloud = ({ size }) => html`<svg class="girl" width=${size} height=${size * 0.85} viewBox="0 0 120 100" aria-hidden="true"><defs><linearGradient id="cl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" /><stop offset="1" stop-color="#bfe0fb" /></linearGradient></defs>
  <path d="M28 78a20 20 0 0 1 2-40 26 26 0 0 1 50-6 22 22 0 0 1 14 46z" fill="url(#cl)" stroke="#2e83d0" stroke-width="3" stroke-linejoin="round" /><path d="M42 48c6-8 18-10 26-4" fill="none" stroke="#2e83d0" stroke-width="3" stroke-linecap="round" opacity=".5" />
  <circle cx="46" cy="64" r="3.2" fill="#2e83d0" /><circle cx="70" cy="64" r="3.2" fill="#2e83d0" /><path d="M54 69q4 4 8 0" fill="none" stroke="#2e83d0" stroke-width="2.6" stroke-linecap="round" /></svg>`;
const Flag = ({ size }) => html`<svg class="girl" width=${size} height=${size * 0.8} viewBox="0 0 150 120" aria-hidden="true"><rect x="12" y="8" width="5" height="108" rx="2.5" fill="#6b5b4a" /><circle cx="14.5" cy="8" r="4.5" fill="#d9ab3f" />
  <path d="M17 14Q50 6 82 14T146 14V86Q114 94 82 86T17 86Z" fill="#9e3039" /><path d="M17 43Q50 35 82 43T146 43V57Q114 65 82 57T17 57Z" fill="#ffffff" /><path d="M17 14Q50 6 82 14T146 14V86Q114 94 82 86T17 86Z" fill="none" stroke="#5a1a20" stroke-width="1.5" /></svg>`;
const Vase = ({ size }) => html`<svg class="girl" width=${size * 0.7} height=${size * 1.2} viewBox="0 0 100 140" aria-hidden="true"><ellipse cx="50" cy="132" rx="30" ry="5" fill="#000" opacity=".18" />
  <path d="M39 16h22l-2 18c22 12 28 46 15 76-4 9-12 14-24 14s-20-5-24-14C13 80 19 46 41 34z" fill="#1b1612" stroke="#3a3128" stroke-width="2" /><path d="M30 60c-2 18 0 32 6 44" fill="none" stroke="#ffffff" stroke-width="3" opacity=".18" stroke-linecap="round" />
  <ellipse cx="50" cy="16" rx="13" ry="4.5" fill="#e8b84a" stroke="#8a6416" stroke-width="1.5" /><path d="M50 20L46 44L56 62L47 86L58 106L51 124" fill="none" stroke="#f1c75b" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" /><path d="M46 44L36 50M56 62L66 66M47 86L38 92" fill="none" stroke="#f1c75b" stroke-width="2" stroke-linecap="round" />
  <rect x="30" y="122" width="40" height="5" rx="2.5" fill="#e8b84a" /></svg>`;
const Idol = ({ size }) => html`<svg class="girl" width=${size} height=${size * 1.25} viewBox="0 0 120 150" aria-hidden="true">
  <path d="M26 150Q30 114 60 112Q90 114 94 150Z" fill="#ff3df2" stroke="#222" stroke-width="1.8" /><path d="M60 112L52 150H68Z" fill="#3df2ff" /><path d="M48 126l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#ffe23d" stroke="#222" stroke-width="1" />
  <rect x="53" y="100" width="14" height="14" fill="#ffe6d6" stroke="#222" stroke-width="1.5" />
  <path d="M26 62C22 22 46 12 62 12C82 12 100 24 94 62C92 46 84 38 74 36C62 40 40 38 30 52Z" fill="#8fd3ff" stroke="#222" stroke-width="1.6" /><path d="M30 52C24 70 28 84 36 90C36 74 36 62 40 52ZM94 62C100 74 96 86 90 92C90 76 90 66 86 58Z" fill="#8fd3ff" stroke="#222" stroke-width="1.4" />
  <ellipse cx="60" cy="66" rx="30" ry="34" fill="#ffe6d6" stroke="#222" stroke-width="1.6" /><path d="M28 52C34 40 48 34 62 36C76 34 90 42 92 52C84 44 72 42 62 46C50 42 38 44 28 52Z" fill="#8fd3ff" stroke="#222" stroke-width="1.4" />
  <rect x="32" y="58" width="24" height="14" rx="6" fill="#111" /><rect x="64" y="58" width="24" height="14" rx="6" fill="#111" /><path d="M56 63h8" stroke="#111" stroke-width="3" /><path d="M36 61l8-2M68 61l8-2" stroke="#fff" stroke-width="1.6" opacity=".6" stroke-linecap="round" />
  <path d="M50 86Q60 94 70 86" fill="none" stroke="#a23a3a" stroke-width="2.4" stroke-linecap="round" /><ellipse cx="38" cy="82" rx="5" ry="3" fill="#ff8fa3" opacity=".5" /><ellipse cx="82" cy="82" rx="5" ry="3" fill="#ff8fa3" opacity=".5" />
  <path d="M90 74Q100 84 84 94" fill="none" stroke="#222" stroke-width="2" /><circle cx="84" cy="94" r="4" fill="#222" /><g transform="translate(96 108) rotate(25)"><rect x="-5" y="-14" width="10" height="26" rx="5" fill="#ddd" stroke="#222" stroke-width="1.5" /><circle cx="0" cy="-20" r="9" fill="#555" stroke="#222" stroke-width="1.5" /></g></svg>`;
const Lantern = ({ size }) => html`<svg class="girl" width=${size} height=${size * 1.1} viewBox="0 0 120 130" aria-hidden="true"><g stroke="#ff5fa8" stroke-width="4" stroke-linecap="round" fill="none">${[0, 40, 80, 120, 160, 200, 240, 280, 320].map((a) => html`<path key=${a} d="M60 22V8" transform=${'rotate(' + a + ' 60 30)'} />`)}</g><circle cx="60" cy="30" r="5" fill="#ffd166" />
  <line x1="60" y1="62" x2="60" y2="70" stroke="#2a1a3a" stroke-width="3" /><ellipse cx="60" cy="96" rx="26" ry="32" fill="#ff5f7a" stroke="#ffd479" stroke-width="3" /><rect x="46" y="64" width="28" height="8" rx="2" fill="#2a1a3a" /><rect x="46" y="120" width="28" height="7" rx="2" fill="#2a1a3a" />
  <path d="M60 68v56M44 80Q60 96 44 112M76 80Q60 96 76 112" fill="none" stroke="#ffd479" stroke-width="2" opacity=".8" /></svg>`;
const Whale = ({ size }) => html`<svg class="girl" width=${size} height=${size * 0.75} viewBox="0 0 140 105" aria-hidden="true"><path d="M70 28q-2-14 6-22M76 28q6-12 16-14" fill="none" stroke="#7ad0ff" stroke-width="4" stroke-linecap="round" /><path d="M120 66c14-2 16-20 8-30 10 4 16 14 12 28-2 8-10 12-20 8z" fill="#2a86b8" stroke="#124a6a" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M14 70C14 44 38 30 70 30s56 16 56 38c0 22-24 32-56 32S14 92 14 70z" fill="#3aa3d4" stroke="#124a6a" stroke-width="3" /><path d="M20 76c20 14 70 18 100-8c0 18-24 30-52 30S26 92 20 76z" fill="#d6f2ff" /><path d="M64 88l-8 12 22-6z" fill="#2a86b8" stroke="#124a6a" stroke-width="2.5" stroke-linejoin="round" />
  <circle cx="42" cy="62" r="4.5" fill="#102a3a" /><circle cx="43.4" cy="60.6" r="1.4" fill="#fff" /><path d="M32 76q8 6 16 0" fill="none" stroke="#102a3a" stroke-width="2.6" stroke-linecap="round" /><ellipse cx="28" cy="72" rx="5" ry="3" fill="#ff8fa3" opacity=".55" /></svg>`;
const SunBoat = ({ size }) => html`<svg class="girl" width=${size} height=${size * 0.8} viewBox="0 0 140 112" aria-hidden="true"><circle cx="70" cy="62" r="40" fill="#ffc45a" stroke="#d9772a" stroke-width="3" /><g stroke="#ff9a4a" stroke-width="4" stroke-linecap="round">${[-60, -30, 0, 30, 60].map((a) => html`<path key=${a} d="M70 8V0" transform=${'rotate(' + a + ' 70 62)'} />`)}</g>
  <rect y="82" width="140" height="30" fill="#e0895a" /><path d="M0 92q17-8 35 0t35 0 35 0 35 0v20H0z" fill="#b95f3f" /><path d="M60 80h40l-8 12H68z" fill="#6d3326" stroke="#3a1a10" stroke-width="2" stroke-linejoin="round" /><line x1="80" y1="80" x2="80" y2="42" stroke="#3a1a10" stroke-width="3" /><path d="M80 44l22 30H80z" fill="#fff6e8" stroke="#3a1a10" stroke-width="2" stroke-linejoin="round" /><path d="M78 50L62 74h16z" fill="#ffe2c2" stroke="#3a1a10" stroke-width="2" stroke-linejoin="round" /></svg>`;
const SVG_MASCOT = { sora: Cloud, latvija: Flag, kintsugi: Vase, arcade: Idol, hanabi: Lantern, okeans: Whale, saulriets: SunBoat };
const CUTOUT = ['toradora', 'evangelion', 'killlakill', 'zerotwo', 'mezs', 'arcade'];  // transparent character cut-outs (no photo frame)

const NO_ART = new Set();  // themes whose /art/<theme> image does not exist (no repeated requests)
const PORTRAITS = ['mezs'];  // bundled public-domain portrait cut-out of the poet Rainis (public/art)
export const clearArt = (theme) => NO_ART.delete(theme);
function Mascot({ theme, size = 150 }) {
  const [missing, setMissing] = useState(NO_ART.has(theme));
  useEffect(() => setMissing(NO_ART.has(theme)), [theme]);
  if (!missing) return html`<img class=${'portrait' + (CUTOUT.includes(theme) ? ' cut' : '')} src=${'/art/' + theme} width=${size} height=${size * 1.2} alt="" onError=${() => { NO_ART.add(theme); setMissing(true); }} />`;
  const Art = SVG_MASCOT[theme], info = THEME_INFO[theme];  // no picture: an original SVG mascot, else the small drawn girl, else the Mochi
  return Art ? html`<${Art} size=${size} />` : info ? html`<${Girl} ...${info.girl} size=${size} />` : html`<${Mochi} size=${size * 0.78} />`;
}
const TILT = [-8, 6, -4, 9];
const Stickers = ({ theme, cls = '' }) => html`<div class="stickers ${cls}">${stickersOf(theme).map(([k, c, l], i) => html`<${Sticker} key=${k + i} kind=${k} color=${c} label=${l} tilt=${TILT[i % 4]} />`)}</div>`;
export function ThemeHero({ theme }) {
  return html`<div class="theme-hero"><${Mascot} theme=${theme} size=${130} /><${Stickers} theme=${theme} /></div>`;
}
export function ThemeCard({ theme, name }) {
  return html`<section class="card theme-card"><div class="row nw" style="gap:16px;align-items:flex-start"><${Mascot} theme=${theme} size=${120} />
    <div class="grow"><h2 style="margin:0">${name}</h2><div class="title-tag">${t('char.' + theme)}</div><p class="small" style="margin:6px 0 0">${t('lore.' + theme)}</p>
      ${PORTRAITS.includes(theme) && html`<p class="small dim" style="margin:6px 0 0">${t('acct.photo_credit')}</p>`}</div></div>
    <${Stickers} theme=${theme} cls="mt" /></section>`;
}
