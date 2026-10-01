import { html, useState, useEffect } from '/vendor/preact.js';
import { META, cityName } from './api.js';
import { t, tx } from './i18n.js';
import { AsyncBtn, Modal, Field } from './ui.js';

export const rarity = (w) => (w >= 4 ? 1 : w >= 2 ? 2 : 3);                 // 1 common, 2 uncommon, 3 rare
export const WEIGHT_OF = { 1: 5, 2: 3, 3: 1 };
export const rarityName = (w) => t('rarity.' + rarity(w));

// human description of an effect, e.g. "Takes 15 min off your time"
export function effectSummary(mode, e) { return t('eff.' + mode + '.' + e.type, e); }

// ---------------------------------------------------------------- one card (face)
export function GCard({ card, mode, small, onClick, selected }) {
  const r = rarity(card.weight);
  const Tag = onClick ? 'button' : 'div';
  return html`<${Tag} class="gcard r${r} ${small ? 'small' : ''}" onClick=${onClick}><span class="kind">${t('kind.' + card.effect.type)}</span><span class="nm">${tx(card, 'name')}</span>
    <span class="ds">${tx(card, 'desc') || effectSummary(mode, card.effect)}</span>
    <span class="pips">${[1, 2, 3].map((i) => html`<i class=${i <= r ? 'on' : ''}></i>`)}</span><//>`;
}

// a card that starts face down and flips over
export function Flip({ card, mode, open, delay = 0 }) {
  return html`<div class="flip ${open ? 'open' : ''}"><div class="inner" style=${{ transitionDelay: delay + 's' }}>
    <div class="back"><div class="cback"></div></div>
    <div class="face"><${GCard} card=${card} mode=${mode} /></div></div></div>`;
}

// ---------------------------------------------------------------- pick / draw modal (race picks and hide draws)
// sets: [{id, options, keep}]   hand: cards already held   limit: max hand size
// onTake(set, indexes, discardIids) -> Promise<bool>     onPass(set)
export function PickModal({ sets, mode, title, hand = [], limit = 6, onTake, onPass, onClose }) {
  const set = sets[0];
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState([]);
  const [drop, setDrop] = useState([]);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { setOpen(false); setSel([]); setDrop([]); setLeaving(false); const tm = setTimeout(() => setOpen(true), 380); return () => clearTimeout(tm); }, [set && set.id]);
  useEffect(() => { if (!set) onClose(); }, [!!set]);
  if (!set) return null;
  const keep = set.keep || 1;
  const overflow = Math.max(0, hand.length + sel.length - limit);
  const toggle = (i) => {
    if (!open || leaving) return;
    setSel((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : keep === 1 ? [i] : cur.length < keep ? [...cur, i] : cur));
    setDrop([]);
  };
  const toggleDrop = (iid) => setDrop((cur) => (cur.includes(iid) ? cur.filter((x) => x !== iid) : cur.length < overflow ? [...cur, iid] : cur));
  const take = async () => {
    setLeaving(true);
    await new Promise((r) => setTimeout(r, 650));
    const ok = await onTake(set, sel, drop);
    if (ok === false) setLeaving(false);
  };
  return html`<${Modal} title=${title || t('pick.title')} onClose=${onClose} wide=${true}>
    <p class="dim small">${sets.length > 1 ? t('pick.waiting', { n: sets.length }) + ' ' : ''}${t('pick.keep', { k: keep, n: set.options.length })}</p>
    <div class="pickrow ${leaving ? 'leaving' : ''}">${set.options.map((c, i) => html`<button class="opt ${sel.includes(i) ? 'sel' : ''}" key=${set.id + i} onClick=${() => toggle(i)}>
      <${Flip} card=${c} mode=${mode} open=${open} delay=${i * 0.2} /></button>`)}</div>
    ${overflow > 0 && html`<div class="callout warn">${t('pick.full', { n: limit, d: overflow })}
      <div class="hand">${hand.map((c) => html`<button class="gcard small r${rarity(c.card.weight)}" key=${c.iid} style=${{ opacity: drop.includes(c.iid) ? 1 : 0.55, outline: drop.includes(c.iid) ? '3px solid var(--bad)' : 'none' }} onClick=${() => toggleDrop(c.iid)}>
        <span class="nm">${tx(c.card, 'name')}</span><span class="ds">${drop.includes(c.iid) ? t('pick.will_discard') : t('pick.tap_discard')}</span><//>`)}</div></div>`}
    <div class="row mt" style="justify-content:center">
      <button disabled=${!open || leaving || sel.length === 0 || drop.length < overflow} onClick=${take}>${t('pick.take')}</button>
      <${AsyncBtn} class="ghost" disabled=${!open || leaving} onClick=${() => onPass(set)}>${overflow > 0 ? t('pick.discard_new') : t('pick.pass')}<//></div>
  <//>`;
}

// ---------------------------------------------------------------- race: card detail + play form
export function RaceCardModal({ inst, st, onPlay, onDiscard, onClose }) {
  const e = inst.card.effect;
  const spec = META.effects.race[e.type] || {};
  const needsTarget = spec.target || (e.type === 'text' && e.target);
  const [target, setTarget] = useState('');
  const others = st.teams.filter((x) => x.id !== st.me.teamId && !(st.g.teams.find((r) => r.id === x.id) || {}).finishedAt);
  return html`<${Modal} title=${tx(inst.card, 'name')} onClose=${onClose}>
    <div class="row nw" style="align-items:flex-start;gap:16px"><${GCard} card=${inst.card} mode="race" />
      <div class="grow"><p class="small dim">${effectSummary('race', e)}</p>
        ${spec.passive ? html`<div class="callout">${t('card.passive')}</div>` : html`<div>
          ${needsTarget && html`<${Field} label=${t('card.target')}><select value=${target} onChange=${(ev) => setTarget(ev.target.value)}><option value="">${t('choose')}</option>${others.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select><//>`}
          <${AsyncBtn} class="block mt" disabled=${needsTarget && !target} confirm=${t('card.confirm_play', { name: tx(inst.card, 'name') })} onClick=${async () => { if (await onPlay({ iid: inst.iid, targetTeamId: target || undefined })) onClose(); }}>${t('card.play')}<//></div>`}
        <${AsyncBtn} class="ghost block mt" confirm=${t('card.confirm_discard')} onClick=${async () => { if (await onDiscard(inst.iid)) onClose(); }}>${t('card.discard')}<//></div></div>
  <//>`;
}

export function Hand({ items, mode, onOpen, empty }) {
  if (!items.length) return empty || null;
  return html`<div class="hand">${items.map((c, i) => html`<div style=${{ animationDelay: i * 0.05 + 's' }} key=${c.iid}><${GCard} card=${c.card} mode=${mode} small=${true} onClick=${() => onOpen(c)} /></div>`)}</div>`;
}
