import { html, useState, useEffect } from '/vendor/preact.js';
import { META, cityName, uploadPhoto, fileUrl, toast, useGeo, localAlert } from './api.js';
import { t, tx, qText, aText } from './i18n.js';
import { AsyncBtn, Chip, Empty, Modal, Field, Switch, fmtDur, fmtKm, dist, fmtTime } from './ui.js';
import { LMap } from './map.js';
import { GCard, PickModal, Hand, effectSummary } from './cards-ui.js';
import { computeArea } from './areas.js';

const nameOf = (st, id) => (st.members.find((m) => m.id === id) || { name: '?' }).name;
const qt = (q) => qText(q, cityName);

export function Page(ctx) {
  const { st, act } = ctx;
  const g = st.g, cur = g.cur;
  const next = g.rounds.find((r) => r.status === 'pending');
  if (st.status === 'lobby') return null;
  return html`<div class="stack">
    ${st.status === 'finished' ? null : !cur ? html`<section class="card accent"><div class="sec-h"><h2>${next ? t('hide.next_round', { n: next.n }) : t('hide.all_done')}</h2></div>
      ${next && html`<p><b>${nameOf(st, next.hiderId)}</b> ${t('hide.will_hide')}</p>`}
      ${next && (st.me.canAdmin ? html`<${AsyncBtn} class="block" onClick=${() => act('start_round')}>${t('hide.start_round', { n: next.n, min: st.settings.hideMinutes })}<//>` : html`<p class="dim">${t('hide.wait_admin')}</p>`)}
      <p class="small dim">${g.rounds.map((r) => `R${r.n} ${nameOf(st, r.hiderId)}${r.status === 'done' ? ' ✓' : ''}`).join('  |  ')}</p></section>`
      : html`<${Round} ...${ctx} cur=${cur} />`}
    <${Scores} ...${ctx} />
  </div>`;
}

function Round(ctx) {
  const { st, act, now, cur } = ctx;
  const role = cur.role, off = now - st.now;
  return html`<div class="stack">
    <section class="card accent"><div class="row sp"><div><h2 style="margin:0">${t('hide.round_hides', { n: cur.n, name: nameOf(st, cur.hiderId) })}</h2>
      <div class="pill-row mt"><${Chip}>${t('hide.role_' + role)}<//><${Chip} cls="plain">${t(cur.status === 'hiding' ? 'hide.phase_hiding' : 'hide.phase_seeking')}<//></div></div>
      <div class="stat"><div class="v">${cur.status === 'hiding' ? fmtDur(cur.hideEndsAt - now) : fmtDur(cur.seekMsNow + off, true)}</div><div class="k">${cur.status === 'hiding' ? t('hide.time_left') : t('hide.time_seeking')}</div></div></div></section>
    ${role === 'hider' ? html`<${Hider} ...${ctx} />` : role === 'seeker' ? html`<${Seeker} ...${ctx} />` : html`<${Watch} ...${ctx} />`}
    <${QA} ...${ctx} />
    ${st.me.neutral && cur.status === 'seeking' && html`<section class="card"><${AsyncBtn} class="ghost" confirm=${t('hide.referee_confirm')} onClick=${() => act('force_found')}>${t('hide.referee_found')}<//></section>`}
  </div>`;
}

const gps = (loc) => html`<span class="small ${loc.status === 'ok' ? 'good' : 'warn'}">${loc.status === 'ok' ? t('gps.ok', { m: Math.round(loc.pos.acc) }) : t('gps.wait')}</span>`;

// ---------------------------------------------------------------- hider
function Hider(ctx) {
  const { st, act, loc, cur, code, token, now } = ctx;
  const s = st.settings, z = cur.zone;
  const geo = useGeo();
  const inside = z && loc.pos ? dist(loc.pos, z) <= s.zoneRadiusM : null;
  const outside = !!(z && loc.pos && cur.status === 'seeking' && dist(loc.pos, z) > s.zoneRadiusM + Math.max(30, loc.pos.acc));
  const [alerts, setAlerts] = useState(() => { try { return localStorage.getItem('jll.zonealerts') !== 'off'; } catch { return true; } });
  const [sel, setSel] = useState(null);
  const [pickOpen, setPickOpen] = useState(true);
  // out-of-zone alert every 10 s (vibration + notification). It can be switched off because GPS is not always precise.
  useEffect(() => {
    if (!outside || !alerts || !s.zoneAlerts) return;
    localAlert(t('hide.outside_alert'));
    const iv = setInterval(() => localAlert(t('hide.outside_alert')), 10000);
    return () => clearInterval(iv);
  }, [outside, alerts, s.zoneAlerts]);
  const items = [];
  if (z) items.push({ k: 'circle', lat: z.lat, lng: z.lng, r: s.zoneRadiusM, color: '#e2457f', fill: 0.15 }, { k: 'marker', lat: z.lat, lng: z.lng, color: '#e2457f', text: 'Z', label: t('hide.your_zone') });
  if (loc.pos) items.push({ k: 'circle', lat: loc.pos.lat, lng: loc.pos.lng, r: Math.max(6, loc.pos.acc), color: '#3b82c4' });
  const photos = cur.questions.filter((q) => q.status === 'waiting_photo');
  const pending = cur.questions.filter((q) => q.status === 'pending');
  const reactive = (cur.hand || []).filter((c) => ['veto', 'randomize'].includes(c.card.effect.type));
  const draws = (cur.draws || []).map((d) => ({ id: d.did, options: d.options, keep: d.keep }));
  const bonus = (cur.hand || []).filter((c) => c.card.effect.type === 'time_bonus').reduce((a, c) => a + c.card.effect.min, 0);
  return html`<div class="stack">
    ${pending.map((q) => html`<section class="card accent" key=${q.id}><p class="eyebrow">${t('hide.q_incoming')}</p><b>${qt(q)}</b>
      <p class="small">${t('hide.your_answer')} <b>${aText(q, cityName)}</b></p><p class="small dim">${t('hide.reveals_in', { t: fmtDur(q.revealAt - now, true) })}</p>
      ${reactive.length > 0 ? html`<div class="row">${reactive.map((c) => html`<${AsyncBtn} class="sm soft" disabled=${c.card.effect.type === 'randomize' && ['thermo', 'photo'].includes(q.cat)} confirm=${t('card.confirm_play', { name: tx(c.card, 'name') })} onClick=${() => act('play_card', { iid: c.iid, qid: q.id })}>${tx(c.card, 'name')}<//>`)}</div>` : html`<p class="small dim">${t('hide.no_react_cards')}</p>`}</section>`)}
    ${photos.map((q) => html`<${PhotoAnswer} key=${q.id} q=${q} act=${act} code=${code} token=${token} />`)}
    ${outside && alerts && html`<div class="callout bad">${t('hide.outside_alert')}</div>`}
    ${cur.status === 'hiding' ? html`<section class="card"><div class="sec-h"><h2>${t('hide.choose_zone')}</h2></div>
      <div class="row"><button class="ghost" disabled=${!loc.pos} onClick=${() => act('set_zone', { lat: loc.pos.lat, lng: loc.pos.lng })}>${t('hide.zone_here')}</button>
        <${AsyncBtn} class="grow" disabled=${!z} onClick=${() => act('ready')}>${t('hide.ready')}<//></div>
      <div class="mt row sp">${gps(loc)}${z && loc.pos && html`<span class="small ${inside ? 'good' : 'warn'}">${inside ? t('hide.inside') : t('hide.away', { d: fmtKm(dist(loc.pos, z)) })}</span>`}</div>
      <p class="small dim">${t('hide.tap_map', { r: s.zoneRadiusM })}</p></section>`
      : html`<section class="card"><div class="row sp">${gps(loc)}${z && loc.pos && html`<span class="small ${inside ? 'good' : 'bad'}">${inside ? t('hide.inside') : t('hide.outside', { d: fmtKm(dist(loc.pos, z)) })}</span>`}</div>
        ${s.zoneAlerts && html`<${Switch} checked=${alerts} onChange=${(v) => { setAlerts(v); try { localStorage.setItem('jll.zonealerts', v ? 'on' : 'off'); } catch {} }}>${t('hide.zone_alerts')}<//>`}
        <${AsyncBtn} class="danger block mt" confirm=${t('hide.found_confirm_hider')} onClick=${() => act('found')}>${t('hide.i_was_found')}<//></section>`}
    <section class="card"><div class="sec-h"><h2>${t('cards.title')}</h2><span class="chip plain">${(cur.hand || []).length}/${cur.handLimit}</span></div>
      ${draws.length > 0 && html`<div class="callout" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px"><span>${t('hide.draws_waiting', { n: draws.length })}</span><button class="sm" onClick=${() => setPickOpen(true)}>${t('hide.draw_cards')}</button></div>`}
      <${Hand} items=${cur.hand || []} mode="hide" onOpen=${setSel} empty=${html`<${Empty}>${t('hide.hand_empty')}<//>`} />
      ${bonus > 0 && html`<${Chip} cls="good">${t('hide.bonus_in_hand', { n: bonus })}<//>`}</section>
    <${LMap} cls="short" items=${items} munis=${geo} fitKey=${'h' + cur.n + (z ? 'z' : '')} fitTo=${z ? [[z.lat - 0.02, z.lng - 0.03], [z.lat + 0.02, z.lng + 0.03]] : null}
      onMapClick=${cur.status === 'hiding' ? (p) => act('set_zone', p) : null} muniColor=${() => null} />
    ${draws.length > 0 && pickOpen && html`<${PickModal} sets=${draws} mode="hide" title=${t('hide.draw_cards')} hand=${cur.hand || []} limit=${cur.handLimit} onClose=${() => setPickOpen(false)}
      onTake=${(set, idx, drop) => act('draw_keep', { did: set.id, indexes: idx, discard: drop })} onPass=${(set) => act('draw_skip', { did: set.id })} />`}
    ${sel && html`<${HiderCardModal} inst=${sel} cur=${cur} act=${act} onClose=${() => setSel(null)} />`}
  </div>`;
}

function PhotoAnswer({ q, act, code, token }) {
  const [file, setFile] = useState(null);
  const send = async () => {
    if (!file) return toast(t('proof.need_photo'));
    try { const fid = await uploadPhoto(code, token, file); await act('answer_photo', { qid: q.id, fid }, t('hide.photo_sent')); } catch (e) { toast(e.message); }
  };
  return html`<section class="card accent"><p class="eyebrow">${t('hide.photo_request')}</p><b>${qt(q)}</b>
    <input style="margin-top:8px" type="file" accept="image/*" capture="environment" onChange=${(e) => setFile(e.target.files[0])} /><${AsyncBtn} class="block mt" onClick=${send}>${t('hide.send_photo')}<//></section>`;
}

function HiderCardModal({ inst, cur, act, onClose }) {
  const e = inst.card.effect;
  const spec = META.effects.hide[e.type] || {};
  const pending = cur.questions.filter((q) => q.status === 'pending');
  const [qid, setQid] = useState(pending[0] ? pending[0].id : '');
  const [disc, setDisc] = useState('');
  const others = (cur.hand || []).filter((c) => c.iid !== inst.iid);
  const needsQ = e.type === 'veto' || e.type === 'randomize';
  const ready = (!needsQ || qid) && (e.type !== 'discard_draw' || disc);
  return html`<${Modal} title=${tx(inst.card, 'name')} onClose=${onClose}>
    <div class="row nw" style="align-items:flex-start;gap:16px"><${GCard} card=${inst.card} mode="hide" />
      <div class="grow"><p class="small dim">${effectSummary('hide', e)}</p>
        ${spec.passive ? html`<div class="callout">${t('hide.passive')}</div>` : html`<div>
          ${needsQ && html`<${Field} label=${t('hide.which_q')}><select value=${qid} onChange=${(ev) => setQid(ev.target.value)}><option value="">${t('choose')}</option>${pending.map((q) => html`<option value=${q.id}>${qt(q)}</option>`)}</select><//>`}
          ${e.type === 'discard_draw' && html`<${Field} label=${t('hide.which_discard')}><select value=${disc} onChange=${(ev) => setDisc(ev.target.value)}><option value="">${t('choose')}</option>${others.map((c) => html`<option value=${c.iid}>${tx(c.card, 'name')}</option>`)}</select><//>`}
          <${AsyncBtn} class="block mt" disabled=${!ready} confirm=${t('hide.play_confirm', { name: tx(inst.card, 'name') })} onClick=${async () => { if (await act('play_card', { iid: inst.iid, qid, discardIid: disc })) onClose(); }}>${t('card.play')}<//></div>`}
        <${AsyncBtn} class="ghost block mt" confirm=${t('card.confirm_discard')} onClick=${async () => { if (await act('discard', { iid: inst.iid })) onClose(); }}>${t('card.discard')}<//></div></div>
  <//>`;
}

// ---------------------------------------------------------------- seekers: search area + question menu
function Seeker(ctx) {
  const { st, act, loc, cur } = ctx;
  const geo = useGeo();
  const area = geo ? computeArea(cur.questions) : null;
  const items = [];
  for (const q of cur.questions) {
    if (!q.params || q.status !== 'answered' || !q.answer) continue;
    if (q.cat === 'radar' && q.params.center) items.push({ k: 'circle', lat: q.params.center.lat, lng: q.params.center.lng, r: q.params.km * 1000, color: q.answer.hit ? '#2e9d69' : '#d4314d', dash: !q.answer.hit, fill: 0, weight: 2 });
    if (q.cat === 'tentacles' && q.params.center) items.push({ k: 'circle', lat: q.params.center.lat, lng: q.params.center.lng, r: q.params.km * 1000, color: '#d98600', dash: true, fill: 0 });
    if (q.cat === 'thermo' && q.params.start && q.params.end) {
      items.push({ k: 'marker', shape: 'dot', lat: q.params.start.lat, lng: q.params.start.lng, color: '#fff', label: t('hide.thermo_start', { n: q.n }) });
      items.push({ k: 'line', pts: [[q.params.start.lat, q.params.start.lng], [q.params.end.lat, q.params.end.lng]], color: q.answer.hot ? '#2e9d69' : '#3b82c4', dash: true });
    }
  }
  for (const l of cur.seekerLocs || []) items.push({ k: 'marker', shape: 'dot', lat: l.lat, lng: l.lng, color: l.id === st.me.id ? '#3b82c4' : '#8d6ad9', label: l.name, z: 900 });
  const names = area ? [...area.possibleMunis].map((id) => (geo.features.find((f) => f.properties.id === id) || { properties: { name: id } }).properties.name) : [];
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e2457f';
  return html`<div class="stack">
    <section class="card"><div class="sec-h"><h2>${t('hide.search_area')}</h2>${area && geo && html`<span class="chip">${t('hide.possible_munis', { a: names.length, b: geo.features.length })}</span>`}</div>
      <${LMap} munis=${geo} muniColor=${(p) => (area && area.possibleMunis.has(p.id) ? accent : null)} items=${items} overlay=${area} fitKey=${'s' + cur.n} />
      <p class="small dim mt">${area ? t('hide.area_legend') : t('hide.area_empty')}</p>
      ${area && html`<div class="pill-row">${names.slice(0, 14).map((n) => html`<${Chip} cls="plain">${n}<//>`)}${names.length > 14 ? html`<${Chip} cls="plain">+${names.length - 14}<//>` : ''}</div>`}</section>
    <section class="card"><div class="row sp">${gps(loc)}<span class="small dim">${cur.status === 'hiding' ? t('hide.stay_put') : ''}</span></div>
      ${cur.status === 'seeking' && html`<div class="row mt"><${AsyncBtn} class="good-btn grow" confirm=${t('hide.found_confirm')} onClick=${() => act('found')}>${t('hide.we_found')}<//>
        <${AsyncBtn} class="ghost" confirm=${t('hide.giveup_confirm')} onClick=${() => act('give_up')}>${t('hide.give_up', { a: cur.giveUp, b: cur.seekers })}<//></div>`}</section>
    ${cur.status === 'seeking' && html`<${Ask} ...${ctx} />`}
  </div>`;
}

function Ask({ st, act, loc, now, cur }) {
  const lock = cur.lockLeftMs - (now - st.now);
  const open = cur.questions.find((q) => q.status === 'thermo_open' && q.asker === st.me.id);
  const used = new Set(cur.used);
  const byQid = Object.fromEntries(cur.questions.map((q) => [q.qid, q]));
  return html`<section class="card"><div class="sec-h"><h2>${t('hide.questions')}</h2></div>
    ${lock > 0 && html`<div class="callout bad">${t('hide.locked', { t: fmtDur(lock, true) })}</div>`}
    ${open && html`<div class="card accent flat"><b>${t('hide.thermo_open')}</b><p class="small">${t('hide.thermo_hint', { d: fmtKm(open.params.distM) })}</p>
      ${loc.pos && open.params.start && html`<div class="bar"><i style=${{ width: Math.min(100, (dist(loc.pos, open.params.start) / open.params.distM) * 100) + '%' }}></i></div><p class="small">${fmtKm(dist(loc.pos, open.params.start))} / ${fmtKm(open.params.distM)}</p>`}
      <${AsyncBtn} class="block" onClick=${() => act('thermo_end', { qid: open.id })}>${t('hide.thermo_finish')}<//></div>`}
    <div>${META.cats.map(([cat]) => { const qs = META.questions.filter((q) => q.cat === cat); const n = qs.filter((q) => used.has(q.id)).length;
      return html`<details class="qcat" key=${cat}><summary><span>${t('cat.' + cat)}</span><span class="dim small">${t('hide.asked', { a: n, b: qs.length })}</span></summary><div class="qs">
        ${qs.map((q) => { const u = used.has(q.id); const rec = byQid[q.id];
          return html`<${AsyncBtn} class="qbtn ${u ? 'used' : ''}" key=${q.id} disabled=${u || lock > 0 || !!open} confirm=${t('hide.ask_confirm') + '\n\n' + qt({ qid: q.id })} onClick=${() => act('ask', { qid: q.id })}>${qt({ qid: q.id })}
            ${u && rec && html`<small>${rec.status === 'answered' && rec.answer ? aText(rec, cityName) : rec.status === 'vetoed' ? t('hide.vetoed_short') : t('hide.asked_short')}</small>`}<//>`; })}</div></details>`; })}</div></section>`;
}

function Watch({ st, cur }) {
  const geo = useGeo();
  const z = cur.zone, hl = cur.hiderLoc;
  const items = [];
  if (z) items.push({ k: 'circle', lat: z.lat, lng: z.lng, r: st.settings.zoneRadiusM, color: '#e2457f' });
  if (hl) items.push({ k: 'marker', lat: hl.lat, lng: hl.lng, color: '#e2457f', text: 'H', label: t('hide.hider_live') });
  for (const l of cur.seekerLocs || []) items.push({ k: 'marker', shape: 'dot', lat: l.lat, lng: l.lng, color: '#3b82c4', label: l.name });
  return st.me.referee ? html`<${LMap} cls="short" items=${items} munis=${geo} muniColor=${() => null} fitKey=${'w' + cur.n} />` : html`<section class="card"><${Empty}>${t('hide.watching')}<//></section>`;
}

// ---------------------------------------------------------------- Q&A list
function QRow({ st, q, code, token, now }) {
  const a = q.answer;
  const cls = q.status === 'answered' && a ? (a.hit === true || a.same === true || a.closer === true || a.hot === true || (a.city && !a.outside) ? 'yes' : a.hit === false || a.same === false || a.closer === false || a.hot === false || a.outside ? 'no' : '') : q.status === 'vetoed' ? 'no' : 'wait';
  let body;
  if (q.status === 'answered' && a) body = html`<div><b>${a.fid ? '' : aText(q, cityName)}</b>${a.fid && html`<div><img class="proof" src=${fileUrl(code, token, a.fid)} loading="lazy" /></div>`}</div>`;
  else if (q.status === 'pending') body = html`<div class="dim">${t('hide.answering')}${now ? ` (${fmtDur(q.revealAt - now, true)})` : ''}</div>`;
  else if (q.status === 'vetoed') body = html`<div class="bad"><b>${t('hide.vetoed')}</b></div>`;
  else if (q.status === 'waiting_photo') body = html`<div class="dim">${t('hide.waiting_photo')}</div>`;
  else if (q.status === 'thermo_open') body = html`<div class="dim">${t('hide.thermo_progress')}</div>`;
  return html`<div class="qitem ${cls}"><div class="small dim">${nameOf(st, q.asker)} ${fmtTime(q.t)}${q.randomized ? ' (' + t('hide.randomized') + ')' : ''}</div><div class="small">${qt(q)}</div>${body}</div>`;
}
function QA(ctx) {
  const { cur } = ctx;
  if (!cur.questions.length) return null;
  return html`<section class="card"><div class="sec-h"><h2>${t('hide.qa')}</h2></div>${cur.questions.slice().reverse().map((q) => html`<${QRow} ...${ctx} q=${q} key=${q.id} />`)}</section>`;
}

// ---------------------------------------------------------------- scores
function Scores({ st, code, token }) {
  const g = st.g;
  const geo = useGeo();
  const ppl = st.members.filter((m) => m.plays);
  const ranking = ppl.map((m) => ({ m, ms: g.totals[m.id] || 0 })).sort((a, b) => b.ms - a.ms);
  const [show, setShow] = useState(null);
  return html`<div class="stack">
    ${st.status === 'finished' && ranking[0] && html`<section class="card accent center"><p class="eyebrow">${t('winner')}</p><h1>${ranking[0].m.name}</h1></section>`}
    <section class="card"><div class="sec-h"><h2>${t('hide.totals')}</h2></div>${ranking.map((r, i) => html`<div class="row sp" key=${r.m.id} style="padding:6px 0"><span>${i + 1}. <b>${r.m.name}</b></span><b>${fmtDur(r.ms)}</b></div>`)}</section>
    ${g.rounds.some((r) => r.status === 'done') && html`<section class="card"><div class="sec-h"><h2>${t('hide.rounds')}</h2></div>${g.rounds.filter((r) => r.status === 'done').map((r) => html`<div key=${r.n} style="border-top:1px dashed var(--line2);padding:10px 0"><div class="row sp"><span><b>${t('hide.round', { n: r.n })}</b> ${nameOf(st, r.hiderId)}</span>
      <span><b>${fmtDur(r.hiderMs)}</b> <span class="small dim">${t('hide.outcome_' + r.outcome)}</span></span></div>
      <div class="small dim">${t('hide.round_stats', { q: r.questions.length, b: r.bonusMin || 0 })} <button class="sm ghost" onClick=${() => setShow(show === r.n ? null : r.n)}>${show === r.n ? t('hide.hide_map') : t('hide.reveal')}</button></div>
      ${show === r.n && r.reveal && r.reveal.zone && html`<div class="mt"><${LMap} cls="short" fitKey=${'rv' + r.n} munis=${geo} muniColor=${() => null} fitTo=${[[r.reveal.zone.lat - 0.03, r.reveal.zone.lng - 0.04], [r.reveal.zone.lat + 0.03, r.reveal.zone.lng + 0.04]]}
        items=${[{ k: 'circle', lat: r.reveal.zone.lat, lng: r.reveal.zone.lng, r: st.settings.zoneRadiusM, color: '#e2457f' }, ...(r.reveal.trail.length > 1 ? [{ k: 'line', pts: r.reveal.trail.map((p) => [p[1], p[2]]), color: '#d98600' }] : [])]} /></div>`}
      ${show === r.n && r.questions.map((q) => html`<${QRow} st=${st} q=${q} code=${code} token=${token} now=${0} key=${q.id} />`)}</div>`)}</section>`}
  </div>`;
}
