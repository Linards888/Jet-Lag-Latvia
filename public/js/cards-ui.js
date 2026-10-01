import { html, useState, useEffect } from '/vendor/preact.js';
import { META, cityName } from './api.js';
import { AsyncBtn, Modal, Field } from './ui.js';

const KIND = {
  time_bonus: 'Time bonus', time_penalty: 'Curse', freeze: 'Curse', skip_free: 'Boost', extra_picks: 'Boost', steal: 'Curse', spy: 'Power', shield: 'Defence',
  text: 'Wildcard', veto: 'Power', randomize: 'Power', question_lock: 'Curse', hand_size: 'Boost', discard_draw: 'Boost',
};
export const rarity = (w) => (w >= 4 ? 1 : w >= 2 ? 2 : 3);                 // 1 common, 2 uncommon, 3 rare
export const RARITY = { 1: 'Common', 2: 'Uncommon', 3: 'Rare' };
export const WEIGHT_OF = { 1: 5, 2: 3, 3: 1 };

export function effectSummary(mode, e) {
  const spec = (META.effects[mode] || {})[e.type];
  if (!spec) return e.type;
  const ps = Object.keys(spec.params).map((p) => `${e[p]} ${p === 'min' ? 'min' : p === 'n' ? '' : p}`.trim()).join(', ');
  return spec.label + (ps ? ` (${ps})` : '');
}

// ---------------------------------------------------------------- one card (face)
export function GCard({ card, mode, small, onClick }) {
  const r = rarity(card.weight);
  const Tag = onClick ? 'button' : 'div';
  const body = html`<span class="kind">${KIND[card.effect.type] || 'Card'}</span><span class="nm">${card.name}</span>
    <span class="ds">${card.desc || effectSummary(mode, card.effect)}</span>
    <span class="pips">${[1, 2, 3].map((i) => html`<i class=${i <= r ? 'on' : ''}></i>`)}</span>`;
  return html`<${Tag} class="gcard r${r} ${small ? 'small' : ''}" onClick=${onClick}>${body}<//>`;
}

// a card that starts face down and flips over
export function Flip({ card, mode, open, delay = 0, onClick, selected }) {
  return html`<div class="flip ${open ? 'open' : ''}"><div class="inner" style=${{ transitionDelay: delay + 's' }}>
    <div class="back"><div class="cback"></div></div>
    <div class="face"><${GCard} card=${card} mode=${mode} /></div></div></div>`;
}

// ---------------------------------------------------------------- pick / draw modal (race picks and hide draws)
export function PickModal({ sets, mode, title, onTake, onPass, onClose }) {
  const set = sets[0];
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState([]);
  const [leaving, setLeaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setOpen(false); setSel([]); setLeaving(false); setErr(''); const t = setTimeout(() => setOpen(true), 380); return () => clearTimeout(t); }, [set && set.id]);
  useEffect(() => { if (!set) onClose(); }, [!!set]);
  if (!set) return null;
  const keep = set.keep || 1;
  const toggle = (i) => {
    if (!open || leaving) return;
    setSel((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : keep === 1 ? [i] : cur.length < keep ? [...cur, i] : cur));
  };
  const take = async () => {
    setLeaving(true);
    await new Promise((r) => setTimeout(r, 650));
    const ok = await onTake(set, sel);
    if (ok === false) { setLeaving(false); setErr('Could not take that card'); }
  };
  return html`<${Modal} title=${title || 'Choose your card'} onClose=${onClose} wide=${true}>
    <p class="dim small">${sets.length > 1 ? `${sets.length} picks waiting. ` : ''}Keep ${keep} of ${set.options.length}.</p>
    <div class="pickrow ${leaving ? 'leaving' : ''}">${set.options.map((c, i) => html`<button class="opt ${sel.includes(i) ? 'sel' : ''}" key=${set.id + i} onClick=${() => toggle(i)}>
      <${Flip} card=${c} mode=${mode} open=${open} delay=${i * 0.2} /></button>`)}</div>
    ${err && html`<div class="callout bad">${err}</div>`}
    <div class="row" style="justify-content:center">
      <button disabled=${!open || leaving || sel.length === 0} onClick=${take}>Take ${sel.length > 1 ? sel.length + ' cards' : 'card'}</button>
      <${AsyncBtn} class="ghost" disabled=${!open || leaving} onClick=${() => onPass(set)}>Pass<//></div>
  <//>`;
}

// ---------------------------------------------------------------- race: card detail + play form
export function RaceCardModal({ inst, st, my, onPlay, onClose }) {
  const e = inst.card.effect;
  const spec = META.effects.race[e.type] || {};
  const needsTarget = spec.target || (e.type === 'text' && e.target);
  const [target, setTarget] = useState('');
  const [aid, setAid] = useState('');
  const others = st.teams.filter((t) => t.id !== st.me.teamId && !(st.g.teams.find((x) => x.id === t.id) || {}).finishedAt);
  const open = (my.attempts || []).filter((a) => a.kind === 'checkin' && ['choose', 'need_proof', 'rejected'].includes(a.status));
  const ready = (!needsTarget || target) && (e.type !== 'skip_free' || aid);
  return html`<${Modal} title=${inst.card.name} onClose=${onClose}>
    <div class="row" style="align-items:flex-start;flex-wrap:nowrap;gap:16px"><${GCard} card=${inst.card} mode="race" />
      <div class="grow"><p class="small dim">${effectSummary('race', e)}</p>
        ${spec.passive ? html`<div class="callout">Works automatically when someone targets your team. Just keep it in your hand.</div>` : html`<div>
          ${needsTarget && html`<${Field} label="Target team"><select value=${target} onChange=${(ev) => setTarget(ev.target.value)}><option value="">Choose...</option>${others.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select><//>`}
          ${e.type === 'skip_free' && html`<${Field} label="Which task?"><select value=${aid} onChange=${(ev) => setAid(ev.target.value)}><option value="">Choose...</option>${open.map((a) => html`<option value=${a.aid}>${cityName(a.cityId)}</option>`)}</select><//>`}
          <${AsyncBtn} class="block mt" disabled=${!ready} confirm=${'Play "' + inst.card.name + '"? It is used up.'} onClick=${async () => { if (await onPlay({ iid: inst.iid, targetTeamId: target || undefined, aid: aid || undefined })) onClose(); }}>Play card<//></div>`}</div></div>
  <//>`;
}

export function Hand({ items, mode, onOpen, empty }) {
  if (!items.length) return empty || null;
  return html`<div class="hand">${items.map((c, i) => html`<div style=${{ animationDelay: i * 0.05 + 's' }} key=${c.iid}><${GCard} card=${c.card} mode=${mode} small=${true} onClick=${() => onOpen(c)} /></div>`)}</div>`;
}
