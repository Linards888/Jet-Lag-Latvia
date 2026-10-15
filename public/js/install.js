import { html, useState, useEffect } from '/vendor/preact.js';
import { toast } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, copy } from './ui.js';

// ---------------------------------------------------------------- "install as an app" (a PWA: own icon, full screen, works offline)
// Android/desktop Chrome offer a real install prompt; it arrives once and must be kept until the button is pressed.
let deferred = null;
const ping = () => window.dispatchEvent(new Event('jll-install'));
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; ping(); });
window.addEventListener('appinstalled', () => { deferred = null; ping(); });

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const platform = () => {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /android/i.test(ua) ? 'android' : 'desktop';
};
const STEPS = { ios: 4, android: 4, desktop: 2 };
const Steps = ({ p }) => html`<ol class="steps">${Array.from({ length: STEPS[p] }, (_, i) => html`<li key=${i}>${t(`install.${p}.${i + 1}`)}</li>`)}</ol>`;

export function InstallCard() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); window.addEventListener('jll-install', f); return () => window.removeEventListener('jll-install', f); }, []);
  const mine = platform();
  const secure = window.isSecureContext;
  const install = async () => {
    deferred.prompt();
    const r = await deferred.userChoice;
    if (r.outcome === 'accepted') toast(t('install.done'), true);
    deferred = null; ping();
  };
  return html`<section class="card"><div class="sec-h"><h2>${t('install.title')}</h2></div>
    ${standalone() ? html`<div class="callout good">${t('install.installed')}</div>` : html`<div class="stack" style="gap:10px">
      <p class="dim small" style="margin:0">${t('install.intro')}</p>
      ${deferred && html`<${AsyncBtn} class="block" onClick=${install}>${t('install.button')}<//>`}
      ${!secure && html`<div class="callout warn">${t('install.need_https')}</div>`}
      <div><p class="eyebrow">${t('install.steps_for', { device: t('install.dev_' + mine) })}</p><${Steps} p=${mine} /></div>
      <details><summary class="dim small" style="cursor:pointer">${t('install.other')}</summary>
        ${['ios', 'android', 'desktop'].filter((p) => p !== mine).map((p) => html`<div key=${p}><p class="eyebrow mt">${t('install.dev_' + p)}</p><${Steps} p=${p} /></div>`)}</details>
      <div class="row nw"><input class="grow mono" readonly value=${location.origin} onFocus=${(e) => e.target.select()} />
        <button class="sm" onClick=${() => toast(copy(location.origin) ? t('copied') : t('copy_failed'), true)}>${t('copy')}</button></div>
      <p class="dim small" style="margin:0">${t('install.link_hint')}</p></div>`}</section>`;
}
