import { html, render, useState, useEffect } from '/vendor/preact.js';
import { loadMeta } from './api.js';
import { detectLang, setLang, loadErrors, t } from './i18n.js';
import { loadPrefs } from './theme.js';
import { Toasts, Mochi } from './ui.js';
import { Home, Create, Join, NotFound } from './home.js';
import { GamePage } from './game.js';

function App() {
  const [hash, setHash] = useState(location.hash || '#/');
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [, relang] = useState(0);
  useEffect(() => {
    const f = () => { setHash(location.hash || '#/'); window.scrollTo(0, 0); };
    const l = () => relang((x) => x + 1);
    window.addEventListener('hashchange', f); window.addEventListener('jll-lang', l);
    Promise.all([loadMeta(), setLang(detectLang(), false), loadErrors()]).then(() => setReady(true)).catch((e) => setErr(e.message));
    return () => { window.removeEventListener('hashchange', f); window.removeEventListener('jll-lang', l); };
  }, []);
  if (err) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /><h2>${err}</h2><button onClick=${() => location.reload()}>OK</button></div>`;
  if (!ready) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /></div>`;
  const parts = hash.replace(/^#\/?/, '').split('/');
  let page;
  if (parts[0] === '' || parts[0] === undefined) page = html`<${Home} />`;
  else if (parts[0] === 'create') page = html`<${Create} />`;
  else if (parts[0] === 'join') page = html`<${Join} code=${(parts[1] || '').toUpperCase()} key=${parts[1] || ''} />`;
  else if (parts[0] === 'g' && parts[1]) page = html`<${GamePage} code=${parts[1].toUpperCase()} key=${parts[1]} />`;
  else page = html`<${NotFound} />`;
  return html`<div>${page}<${Toasts} /></div>`;
}

loadPrefs();
const root = document.getElementById('app');
root.textContent = '';
render(html`<${App} />`, root);

// offline-ready app shell + web push (needs https or localhost)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
