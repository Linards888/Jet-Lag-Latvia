import { html, render, useState, useEffect } from '/vendor/preact.js';
import { loadMeta } from './api.js';
import { Toasts } from './ui.js';
import { Home, Create, Join } from './home.js';
import { GamePage } from './game.js';

function App() {
  const [hash, setHash] = useState(location.hash || '#/');
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const f = () => { setHash(location.hash || '#/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    loadMeta().then(() => setReady(true)).catch((e) => setErr(e.message));
    return () => window.removeEventListener('hashchange', f);
  }, []);
  if (err) return html`<div class="wrap"><div class="card bad">Could not load: ${err}</div></div>`;
  if (!ready) return html`<p class="boot">Loading Jet Lag: Latvia…</p>`;
  const parts = hash.replace(/^#\/?/, '').split('/');
  let page;
  if (parts[0] === 'create') page = html`<${Create} />`;
  else if (parts[0] === 'join') page = html`<${Join} code=${(parts[1] || '').toUpperCase()} key=${parts[1] || ''} />`;
  else if (parts[0] === 'g' && parts[1]) page = html`<${GamePage} code=${parts[1].toUpperCase()} key=${parts[1]} />`;
  else page = html`<${Home} />`;
  return html`<div>${page}<${Toasts} /></div>`;
}

render(html`<${App} />`, document.getElementById('app'));
