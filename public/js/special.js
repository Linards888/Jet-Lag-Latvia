import { html, useState, useEffect } from '/vendor/preact.js';
import { toast } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, Field, Modal } from './ui.js';
import { call, loadMe, useAccount, accountToken } from './account.js';

// ---------------------------------------------------------------- the hidden place
// Nothing on any page points here. A special order of taps on the home screen makes a tiny heart appear (only for the site owner, only
// until the page is reloaded). It opens the panel where the owner takes the special look and gives it to, or takes it back from, players.
const SEQ = 'aaabbbccc', WINDOW_MS = 15000;
let pos = 0, started = 0, revealed = false;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function specialTap(kind) {
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

export function SpecialButton() {
  const { me } = useAccount();
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  if (!revealed || !me || !me.owner) return null;
  return html`<button class="special-heart" aria-label="." onClick=${() => setOpen(true)}><svg width="22" height="22" viewBox="0 0 56 56" aria-hidden="true"><path d="M28 50C8 36 4 22 12 13c7-7 15-3 16 3 1-6 9-10 16-3 8 9 4 23-16 37z" fill="currentColor" /></svg></button>
    ${open && html`<${SpecialModal} onClose=${() => setOpen(false)} />`}`;
}

const SLOTS = ['hero', 'profile', 'game', 'settings', 'community', 'sticker1', 'sticker2', 'sticker3', 'sticker4', 'sticker5', 'sticker6'];

function SpecialModal({ onClose }) {
  const { me } = useAccount();
  const [info, setInfo] = useState(null);
  const [name, setName] = useState('');
  const run = async (body, msg) => { try { const r = await call('POST', '/special', body); if (r.holders) setInfo(r); await loadMe(true); if (msg) toast(msg, true); return true; } catch (e) { toast(e.message); return false; } };
  useEffect(() => { run({ action: 'list' }); }, []);
  const upload = async (slot, body) => {
    try {
      const r = await fetch('/api/account/special-art/' + slot, { method: 'POST', headers: { 'X-Account': accountToken() }, body });
      if (!r.ok) throw new Error((await r.json()).error);
      await loadMe(true); toast(t('special.done'), true);
    } catch (e) { toast(e.message); }
  };
  const label = (s) => (s.startsWith('sticker') ? t('special.slot_sticker', { n: s.slice(7) }) : t('special.slot_' + s));
  return html`<${Modal} title=${t('special.title')} onClose=${onClose}><div class="stack">
    ${info && !info.mine ? html`<${AsyncBtn} class="block" onClick=${() => run({ action: 'claim' }, t('special.done'))}>${t('special.claim')}<//>` : html`<div class="callout good">${t('special.have')}</div>`}
    <${Field} label=${t('special.player')}><input value=${name} maxlength="16" onInput=${(e) => setName(e.target.value)} /><//>
    <div class="row"><${AsyncBtn} class="grow" disabled=${!name.trim()} onClick=${() => run({ action: 'give', name: name.trim() }, t('special.done'))}>${t('special.give')}<//>
      <${AsyncBtn} class="ghost grow" disabled=${!name.trim()} onClick=${() => run({ action: 'revoke', name: name.trim() }, t('special.done'))}>${t('special.revoke')}<//></div>
    <details><summary class="eyebrow" style="cursor:pointer">${t('special.art')}</summary><p class="small dim">${t('special.art_hint')}</p>
      ${SLOTS.map((s) => html`<div class="row sp nw" key=${s} style="padding:4px 0"><span>${label(s)}${me && me.specialArt && me.specialArt[s] ? html` <span class="chip good">${t('special.set')}</span>` : ''}</span>
        <span class="row nw" style="gap:6px"><input type="file" accept="image/jpeg,image/png,image/webp" style="max-width:150px" onChange=${(e) => e.target.files[0] && upload(s, e.target.files[0])} />
          <button class="sm ghost" onClick=${() => upload(s, new Blob([]))}>${t('remove')}</button></span></div>`)}</details>
    ${info && info.holders.length > 0 && html`<div><p class="eyebrow">${t('special.holders')}</p><div class="pill-row">${info.holders.map((n) => html`<button class="sm ghost" key=${n} onClick=${() => setName(n)}>${n}</button>`)}</div></div>`}</div><//>`;
}
