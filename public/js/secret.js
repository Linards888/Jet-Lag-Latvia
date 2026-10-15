import { html, useState, useEffect } from '/vendor/preact.js';
import { toast } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, Field, Modal } from './ui.js';
import { call, loadMe, useAccount } from './account.js';

// ---------------------------------------------------------------- the hidden place
// Nothing on any page points here. A secret order of taps on the home screen makes a tiny heart appear (only for the site owner, only
// until the page is reloaded). It opens the panel where the owner takes the secret look and gives it to, or takes it back from, players.
const SEQ = 'aaabbbccc', WINDOW_MS = 15000;
let pos = 0, started = 0, revealed = false;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function secretTap(kind) {
  const now = Date.now();
  if (pos && now - started > WINDOW_MS) pos = 0;
  if (SEQ[pos] === kind) {
    if (!pos) started = now;
    pos += 1;
    if (pos === SEQ.length) { pos = 0; revealed = true; emit(); }
  } else {
    pos = SEQ[0] === kind ? 1 : 0;
    if (pos) started = now;
  }
}

export function SecretButton() {
  const { me } = useAccount();
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  if (!revealed || !me || !me.owner) return null;
  return html`<button class="secret-heart" aria-label="." onClick=${() => setOpen(true)}><svg width="22" height="22" viewBox="0 0 56 56" aria-hidden="true"><path d="M28 50C8 36 4 22 12 13c7-7 15-3 16 3 1-6 9-10 16-3 8 9 4 23-16 37z" fill="currentColor" /></svg></button>
    ${open && html`<${SecretModal} onClose=${() => setOpen(false)} />`}`;
}

function SecretModal({ onClose }) {
  const [info, setInfo] = useState(null);
  const [name, setName] = useState('');
  const run = async (body, msg) => { try { const r = await call('POST', '/secret', body); if (r.holders) setInfo(r); await loadMe(true); if (msg) toast(msg, true); return true; } catch (e) { toast(e.message); return false; } };
  useEffect(() => { run({ action: 'list' }); }, []);
  return html`<${Modal} title=${t('secret.title')} onClose=${onClose}><div class="stack">
    ${info && !info.mine ? html`<${AsyncBtn} class="block" onClick=${() => run({ action: 'claim' }, t('secret.done'))}>${t('secret.claim')}<//>` : html`<div class="callout good">${t('secret.have')}</div>`}
    <${Field} label=${t('secret.player')}><input value=${name} maxlength="16" onInput=${(e) => setName(e.target.value)} /><//>
    <div class="row"><${AsyncBtn} class="grow" disabled=${!name.trim()} onClick=${() => run({ action: 'give', name: name.trim() }, t('secret.done'))}>${t('secret.give')}<//>
      <${AsyncBtn} class="ghost grow" disabled=${!name.trim()} onClick=${() => run({ action: 'revoke', name: name.trim() }, t('secret.done'))}>${t('secret.revoke')}<//></div>
    ${info && info.holders.length > 0 && html`<div><p class="eyebrow">${t('secret.holders')}</p><div class="pill-row">${info.holders.map((n) => html`<button class="sm ghost" key=${n} onClick=${() => setName(n)}>${n}</button>`)}</div></div>`}</div><//>`;
}
