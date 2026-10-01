import { html, useState } from '/vendor/preact.js';
import { META, uploadPhoto, fileUrl, toast } from './api.js';
import { AsyncBtn, Chip, Empty, Modal, Field, fmtDur, fmtKm, dist, fmtTime } from './ui.js';
import { LMap } from './map.js';
import { GCard, PickModal, Hand, effectSummary } from './cards-ui.js';

export function tabs(st) {
  const cur = st.g.cur;
  const role = cur ? cur.role : null;
  const t = [{ id: 'play', label: 'Round' }];
  if (role === 'seeker') t.push({ id: 'ask', label: 'Questions' });
  if (role === 'hider') t.push({ id: 'cards', label: 'Cards', badge: cur.draws && cur.draws.length ? cur.draws.length : null });
  t.push({ id: 'board', label: 'Scores' });
  return t;
}

const nameOf = (st, id) => (st.members.find((m) => m.id === id) || { name: '?' }).name;

export function View(ctx) {
  return ctx.tab === 'board' ? html`<${Board} ...${ctx} />` : ctx.tab === 'ask' ? html`<${Ask} ...${ctx} />` : ctx.tab === 'cards' ? html`<${CardsTab} ...${ctx} />` : html`<${Play} ...${ctx} />`;
}

function GpsLine({ loc }) { return html`<span class="small ${loc.status === 'ok' ? 'good' : 'warn'}">${loc.status === 'ok' ? `GPS ok, ${Math.round(loc.pos.acc)} m` : 'Waiting for GPS'}</span>`; }

// ---------------------------------------------------------------- round tab
function Play(ctx) {
  const { st, act, now } = ctx;
  const g = st.g, cur = g.cur;
  const next = g.rounds.find((r) => r.status === 'pending');
  if (st.status === 'finished') return html`<${Board} ...${ctx} />`;
  if (!cur) return html`<div class="card accent"><h2>${next ? `Next: round ${next.n}` : 'All rounds done'}</h2>
    ${next && html`<p><b>${nameOf(st, next.hiderId)}</b> will hide. Everyone else seeks.</p>`}
    ${next && (st.me.canAdmin ? html`<${AsyncBtn} class="block" onClick=${() => act('start_round')}>Start round ${next.n} (${st.settings.hideMinutes} min hiding)<//>` : html`<p class="dim">Waiting for the admin to start the round.</p>`)}
    <p class="small dim">${g.rounds.map((r) => `R${r.n} ${nameOf(st, r.hiderId)}${r.status === 'done' ? ' (done)' : ''}`).join('  |  ')}</p></div>`;
  const role = cur.role;
  const off = now - st.now;
  return html`<div class="stack">
    <div class="card accent"><div class="row sp"><div><h2 style="margin:0">Round ${cur.n}: ${nameOf(st, cur.hiderId)} hides</h2>
      <div class="pill-row mt"><${Chip}>${role === 'hider' ? 'You hide' : role === 'seeker' ? 'You seek' : role}<//><${Chip} cls="plain">${cur.status === 'hiding' ? 'Hiding phase' : 'Seeking'}<//></div></div>
      <div class="stat"><div class="v">${cur.status === 'hiding' ? fmtDur(cur.hideEndsAt - now) : fmtDur(cur.seekMsNow + off, true)}</div><div class="k">${cur.status === 'hiding' ? 'hiding time left' : 'time seeking'}</div></div></div></div>
    ${role === 'hider' ? html`<${HiderPanel} ...${ctx} cur=${cur} />` : role === 'seeker' ? html`<${SeekerPanel} ...${ctx} cur=${cur} />` : html`<${WatchPanel} ...${ctx} cur=${cur} />`}
    <${Questions} ...${ctx} cur=${cur} />
    ${st.me.neutral && cur.status === 'seeking' && html`<div class="card"><${AsyncBtn} class="ghost" confirm="Mark the hider as found?" onClick=${() => act('force_found')}>Referee: mark hider found<//></div>`}
  </div>`;
}

function HiderPanel({ st, act, loc, cur, code, token, now, setTab }) {
  const s = st.settings;
  const z = cur.zone;
  const inside = z && loc.pos ? dist(loc.pos, z) <= s.zoneRadiusM : null;
  const items = [];
  if (z) items.push({ k: 'circle', lat: z.lat, lng: z.lng, r: s.zoneRadiusM, color: '#e2457f', fill: 0.15 }, { k: 'marker', lat: z.lat, lng: z.lng, color: '#e2457f', text: 'Z', label: 'Your zone' });
  if (loc.pos) items.push({ k: 'circle', lat: loc.pos.lat, lng: loc.pos.lng, r: Math.max(6, loc.pos.acc), color: '#3b82c4' });
  for (const q of cur.questions) if (q.params && q.params.center && q.params.km) items.push({ k: 'circle', lat: q.params.center.lat, lng: q.params.center.lng, r: q.params.km * 1000, color: '#888', dash: true, fill: 0.03 });
  const photos = cur.questions.filter((q) => q.status === 'waiting_photo');
  const pending = cur.questions.filter((q) => q.status === 'pending');
  const reactive = (cur.hand || []).filter((c) => ['veto', 'randomize'].includes(c.card.effect.type));
  return html`<div class="stack">
    ${pending.map((q) => html`<div class="card accent" key=${q.id}><p class="eyebrow">Question coming in</p><b>${q.text}</b>
      <p class="small">Your answer: <b>${q.answer && q.answer.text}</b></p>
      <p class="small dim">It is revealed to the seekers in ${fmtDur(q.revealAt - now, true)}.</p>
      ${reactive.length > 0 ? html`<div class="row">${reactive.map((c) => html`<${AsyncBtn} class="sm soft" disabled=${c.card.effect.type === 'randomize' && ['thermo', 'photo'].includes(q.cat)} confirm=${'Play "' + c.card.name + '"?'} onClick=${() => act('play_card', { iid: c.iid, qid: q.id })}>${c.card.name}<//>`)}</div>` : html`<p class="small dim">No Veto or Randomize card in your hand.</p>`}</div>`)}
    ${photos.map((q) => html`<${PhotoAnswer} key=${q.id} q=${q} act=${act} code=${code} token=${token} />`)}
    ${cur.draws && cur.draws.length > 0 && html`<div class="card accent"><div class="row sp"><b>${cur.draws.length} draw${cur.draws.length > 1 ? 's' : ''} waiting</b><button onClick=${() => setTab('cards')}>Draw cards</button></div></div>`}
    ${cur.status === 'hiding' ? html`<div class="card"><h2>Choose your hiding zone</h2>
      <div class="row"><button class="ghost" disabled=${!loc.pos} onClick=${() => act('set_zone', { lat: loc.pos.lat, lng: loc.pos.lng })}>Zone at my position</button>
        <${AsyncBtn} class="grow" disabled=${!z} onClick=${() => act('ready')}>I am in position, start seeking<//></div>
      <div class="mt row sp"><${GpsLine} loc=${loc} />${z && loc.pos && html`<span class="small ${inside ? 'good' : 'warn'}">${inside ? 'Inside your zone' : fmtKm(dist(loc.pos, z)) + ' from the zone centre'}</span>`}</div>
      <p class="small dim">Tap the map to place the zone (radius ${s.zoneRadiusM} m).</p></div>`
      : html`<div class="card"><div class="row sp"><${GpsLine} loc=${loc} />${z && loc.pos && html`<span class="small ${inside ? 'good' : 'bad'}">${inside ? 'Inside your zone' : 'OUTSIDE your zone (' + fmtKm(dist(loc.pos, z)) + ')'}</span>`}</div>
        <${AsyncBtn} class="danger block mt" confirm="Confirm that the seekers found you?" onClick=${() => act('found')}>I have been found<//></div>`}
    <${LMap} cls="short" items=${items} fitKey=${'h' + cur.n + (z ? 'z' : '')} fitTo=${z ? [[z.lat - 0.02, z.lng - 0.03], [z.lat + 0.02, z.lng + 0.03]] : null}
      onMapClick=${cur.status === 'hiding' ? (p) => act('set_zone', p) : null} munis=${META.munis} muniColor=${() => null} />
  </div>`;
}

function PhotoAnswer({ q, act, code, token }) {
  const [file, setFile] = useState(null);
  const send = async () => {
    if (!file) return toast('Take a photo first');
    try { const fid = await uploadPhoto(code, token, file); await act('answer_photo', { qid: q.id, fid }, 'Photo sent'); } catch (e) { toast(e.message); }
  };
  return html`<div class="card accent"><p class="eyebrow">Photo request</p><b>${q.text}</b>
    <input style="margin-top:8px" type="file" accept="image/*" capture="environment" onChange=${(e) => setFile(e.target.files[0])} /><${AsyncBtn} class="block mt" onClick=${send}>Send photo<//></div>`;
}

function SeekerPanel({ st, act, loc, cur, now }) {
  const items = [];
  for (const q of cur.questions) {
    if (!q.params) continue;
    if (q.cat !== 'thermo' && q.params.center && q.params.km && q.answer) items.push({ k: 'circle', lat: q.params.center.lat, lng: q.params.center.lng, r: q.params.km * 1000, color: q.answer.hit === false ? '#d4314d' : q.answer.hit ? '#2e9d69' : '#d98600', dash: q.answer.hit !== true, fill: q.answer.hit ? 0.06 : 0.02 });
    if (q.cat === 'thermo' && q.params.start) {
      items.push({ k: 'marker', shape: 'dot', lat: q.params.start.lat, lng: q.params.start.lng, color: '#fff', label: `Thermometer ${q.n} start` });
      if (q.params.end) items.push({ k: 'line', pts: [[q.params.start.lat, q.params.start.lng], [q.params.end.lat, q.params.end.lng]], color: q.answer && q.answer.hot ? '#2e9d69' : '#3b82c4', dash: true });
    }
  }
  for (const l of cur.seekerLocs || []) items.push({ k: 'marker', shape: 'dot', lat: l.lat, lng: l.lng, color: l.id === st.me.id ? '#3b82c4' : '#8d6ad9', label: l.name, z: 900 });
  return html`<div class="stack">
    <${LMap} cls="short" items=${items} fitKey=${'s' + cur.n} munis=${META.munis} muniColor=${() => null} />
    <div class="card"><div class="row sp"><${GpsLine} loc=${loc} /><span class="small dim">${cur.status === 'hiding' ? 'Stay where you are until the timer ends' : ''}</span></div>
      ${cur.status === 'seeking' && html`<div class="row mt"><${AsyncBtn} class="good-btn grow" confirm="Have you really found the hider?" onClick=${() => act('found')}>We found the hider<//>
        <${AsyncBtn} class="ghost" confirm="Vote to give up? All seekers must agree." onClick=${() => act('give_up')}>Give up (${cur.giveUp}/${cur.seekers})<//></div>`}</div>
  </div>`;
}

function WatchPanel({ st, cur }) {
  const z = cur.zone, hl = cur.hiderLoc;
  const items = [];
  if (z) items.push({ k: 'circle', lat: z.lat, lng: z.lng, r: st.settings.zoneRadiusM, color: '#e2457f' });
  if (hl) items.push({ k: 'marker', lat: hl.lat, lng: hl.lng, color: '#e2457f', text: 'H', label: 'Hider (live)' });
  for (const l of cur.seekerLocs || []) items.push({ k: 'marker', shape: 'dot', lat: l.lat, lng: l.lng, color: '#3b82c4', label: l.name });
  return st.me.referee ? html`<${LMap} cls="short" items=${items} fitKey=${'w' + cur.n} munis=${META.munis} muniColor=${() => null} />` : html`<div class="card"><${Empty}>Watching. Secrets stay hidden until the round ends.<//></div>`;
}

function Questions({ st, cur, code, token, now }) {
  if (!cur.questions.length) return html`<div class="card"><${Empty}>No questions asked yet<//></div>`;
  return html`<div class="card"><p class="eyebrow">Questions and answers</p>${cur.questions.slice().reverse().map((q) => qRow(st, q, code, token, now))}</div>`;
}

function qRow(st, q, code, token, now) {
  const a = q.answer;
  const cls = q.status === 'answered' && a ? (a.hit === true || a.same === true || a.closer === true || a.hot === true ? 'yes' : a.hit === false || a.same === false || a.closer === false || a.hot === false ? 'no' : '') : q.status === 'vetoed' ? 'no' : 'wait';
  let body;
  if (q.status === 'answered' && a) body = html`<div><b>${a.text}</b>${a.fid && html`<div><img class="proof" src=${fileUrl(code, token, a.fid)} loading="lazy" /></div>`}</div>`;
  else if (q.status === 'pending') body = html`<div class="dim">The hider is answering${now ? ` (${fmtDur(q.revealAt - now, true)})` : ''}</div>`;
  else if (q.status === 'vetoed') body = html`<div class="bad"><b>Vetoed by the hider.</b> The question is used up.</div>`;
  else if (q.status === 'waiting_photo') body = html`<div class="dim">Waiting for the hider's photo</div>`;
  else if (q.status === 'thermo_open') body = html`<div class="dim">Thermometer in progress</div>`;
  return html`<div class="qitem ${cls}" key=${q.id}><div class="small dim">${nameOf(st, q.asker)} at ${fmtTime(q.t)}${q.randomized ? ' (randomized)' : ''}</div><div class="small">${q.text}</div>${body}</div>`;
}

// ---------------------------------------------------------------- question menu (seekers)
function Ask({ st, act, loc, now }) {
  const cur = st.g.cur;
  if (!cur) return html`<div class="card"><${Empty}>No round in progress<//></div>`;
  if (cur.status !== 'seeking') return html`<div class="card"><${Empty}>Questions open when seeking starts<//></div>`;
  const cool = cur.cooldownLeftMs - (now - st.now);
  const lock = cur.lockLeftMs - (now - st.now);
  const open = cur.questions.find((q) => q.status === 'thermo_open' && q.asker === st.me.id);
  const used = new Set(cur.used);
  const byQid = Object.fromEntries(cur.questions.map((q) => [q.qid, q]));
  return html`<div class="stack">
    ${lock > 0 && html`<div class="callout bad">The hider blocked your questions for ${fmtDur(lock, true)}.</div>`}
    ${cool > 0 && lock <= 0 && html`<div class="callout warn">Cooldown: ${fmtDur(cool, true)}</div>`}
    ${open && html`<div class="card accent"><b>Thermometer open</b><p class="small">Travel ${fmtKm(open.params.distM)} from where you started, then finish it.</p>
      ${loc.pos && open.params.start && html`<div class="bar"><i style=${{ width: Math.min(100, (dist(loc.pos, open.params.start) / open.params.distM) * 100) + '%' }}></i></div><p class="small">${fmtKm(dist(loc.pos, open.params.start))} of ${fmtKm(open.params.distM)}</p>`}
      <${AsyncBtn} class="block" onClick=${() => act('thermo_end', { qid: open.id })}>Finish thermometer here<//></div>`}
    <div>${META.cats.map(([cat, label]) => { const qs = META.questions.filter((q) => q.cat === cat); const n = qs.filter((q) => used.has(q.id)).length;
      return html`<details class="qcat" key=${cat}><summary><span>${label}</span><span class="dim small">${n}/${qs.length} asked</span></summary><div class="qs">
        ${qs.map((q) => { const u = used.has(q.id); const rec = byQid[q.id];
          return html`<${AsyncBtn} class="qbtn ${u ? 'used' : ''}" key=${q.id} disabled=${u || cool > 0 || lock > 0 || !!open} confirm=${'Ask this question? It can only be asked once.\n\n' + q.text} onClick=${() => act('ask', { qid: q.id })}>${q.text}
            ${u && rec && html`<small>${rec.status === 'answered' && rec.answer ? rec.answer.text : rec.status === 'vetoed' ? 'Vetoed' : 'Asked'}</small>`}<//>`; })}</div></details>`; })}</div>
  </div>`;
}

// ---------------------------------------------------------------- hider cards
function CardsTab({ st, act }) {
  const cur = st.g.cur;
  const [sel, setSel] = useState(null);
  const [pickOpen, setPickOpen] = useState(true);
  if (!cur || cur.role !== 'hider') return html`<div class="card"><${Empty}>Only the hider has cards<//></div>`;
  const draws = (cur.draws || []).map((d) => ({ id: d.did, options: d.options, keep: d.keep }));
  const bonus = (cur.hand || []).filter((c) => c.card.effect.type === 'time_bonus').reduce((a, c) => a + c.card.effect.min, 0);
  return html`<div class="stack">
    ${draws.length > 0 && html`<div class="card accent"><div class="row sp"><div><h2 style="margin:0">${draws.length} draw${draws.length > 1 ? 's' : ''} waiting</h2><div class="small dim">Keep some, the rest are discarded</div></div><button onClick=${() => setPickOpen(true)}>Open</button></div></div>`}
    <div class="card"><div class="row sp"><p class="eyebrow" style="margin:0">Your hand ${(cur.hand || []).length}/${cur.handLimit}</p>${bonus > 0 && html`<${Chip} cls="good">+${bonus} min in hand<//>`}</div>
      <${Hand} items=${cur.hand || []} mode="hide" onOpen=${setSel} empty=${html`<${Empty}>Your hand is empty. Answered questions give you draws.<//>`} /></div>
    ${draws.length > 0 && pickOpen && html`<${PickModal} sets=${draws} mode="hide" title="Draw cards" onClose=${() => setPickOpen(false)}
      onTake=${(set, idx) => act('draw_keep', { did: set.id, indexes: idx })} onPass=${(set) => act('draw_skip', { did: set.id })} />`}
    ${sel && html`<${HiderCardModal} inst=${sel} cur=${cur} act=${act} onClose=${() => setSel(null)} />`}
  </div>`;
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
  return html`<${Modal} title=${inst.card.name} onClose=${onClose}>
    <div class="row nw" style="align-items:flex-start;gap:16px"><${GCard} card=${inst.card} mode="hide" />
      <div class="grow"><p class="small dim">${effectSummary('hide', e)}</p>
        ${spec.passive ? html`<div class="callout">Counts automatically if it is in your hand when the round ends.</div>` : html`<div>
          ${needsQ && html`<${Field} label="Which question?"><select value=${qid} onChange=${(ev) => setQid(ev.target.value)}><option value="">Choose...</option>${pending.map((q) => html`<option value=${q.id}>${q.text}</option>`)}</select><//>`}
          ${e.type === 'discard_draw' && html`<${Field} label="Card to discard"><select value=${disc} onChange=${(ev) => setDisc(ev.target.value)}><option value="">Choose...</option>${others.map((c) => html`<option value=${c.iid}>${c.card.name}</option>`)}</select><//>`}
          <${AsyncBtn} class="block mt" disabled=${!ready} confirm=${'Play "' + inst.card.name + '"? The seekers will be told.'} onClick=${async () => { if (await act('play_card', { iid: inst.iid, qid, discardIid: disc })) onClose(); }}>Play card<//></div>`}
        <${AsyncBtn} class="ghost block mt" confirm="Discard this card?" onClick=${async () => { if (await act('discard', { iid: inst.iid })) onClose(); }}>Discard<//></div></div>
  <//>`;
}

// ---------------------------------------------------------------- scores
function Board({ st, code, token }) {
  const g = st.g;
  const ppl = st.members.filter((m) => m.plays);
  const ranking = ppl.map((m) => ({ m, ms: g.totals[m.id] || 0 })).sort((a, b) => b.ms - a.ms);
  const [show, setShow] = useState(null);
  return html`<div class="stack">
    ${st.status === 'finished' && ranking[0] && html`<div class="card accent center"><p class="eyebrow">Winner</p><h1>${ranking[0].m.name}</h1></div>`}
    <div class="card"><p class="eyebrow">Total hiding time</p>${ranking.map((r, i) => html`<div class="row sp" key=${r.m.id} style="padding:6px 0"><span>${i + 1}. <b>${r.m.name}</b></span><b>${fmtDur(r.ms)}</b></div>`)}</div>
    <div class="card"><p class="eyebrow">Rounds</p>${g.rounds.map((r) => html`<div key=${r.n} style="border-top:1.5px dashed var(--line);padding:10px 0"><div class="row sp"><span><b>Round ${r.n}</b> ${nameOf(st, r.hiderId)}</span>
      <span>${r.status === 'done' ? html`<b>${fmtDur(r.hiderMs)}</b> <span class="small dim">${{ found: 'found', gave_up: 'seekers gave up', aborted: 'aborted' }[r.outcome]}</span>` : html`<span class="dim">${r.status}</span>`}</span></div>
      ${r.status === 'done' && html`<div class="small dim">${r.questions.length} questions, cards in hand ${r.bonusMin ? '+' + r.bonusMin + ' min' : 'none'}, penalty ${r.penaltyMin} min <button class="sm ghost" onClick=${() => setShow(show === r.n ? null : r.n)}>${show === r.n ? 'Hide' : 'Reveal'}</button></div>`}
      ${show === r.n && r.reveal && r.reveal.zone && html`<div class="mt"><${LMap} cls="short" fitKey=${'rv' + r.n} fitTo=${[[r.reveal.zone.lat - 0.03, r.reveal.zone.lng - 0.04], [r.reveal.zone.lat + 0.03, r.reveal.zone.lng + 0.04]]} munis=${META.munis} muniColor=${() => null}
        items=${[{ k: 'circle', lat: r.reveal.zone.lat, lng: r.reveal.zone.lng, r: st.settings.zoneRadiusM, color: '#e2457f' }, ...(r.reveal.trail.length > 1 ? [{ k: 'line', pts: r.reveal.trail.map((p) => [p[1], p[2]]), color: '#d98600' }] : [])]} /></div>`}
      ${show === r.n && (r.events || []).map((e) => html`<div class="small warn">${fmtTime(e.t)} - ${e.text}</div>`)}
      ${show === r.n && r.questions.map((q) => qRow(st, q, code, token, 0))}</div>`)}</div></div>`;
}
