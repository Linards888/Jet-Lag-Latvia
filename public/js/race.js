import { html, useState } from '/vendor/preact.js';
import { META, cityName, uploadPhoto, fileUrl, toast } from './api.js';
import { AsyncBtn, Chip, Field, Dots, Empty, fmtDur, fmtKm, dist, muniAt, esc } from './ui.js';
import { LMap } from './map.js';
import { GCard, PickModal, RaceCardModal, Hand } from './cards-ui.js';

export function tabs(st) {
  const my = st.g.teams.find((t) => t.id === st.me.teamId);
  const picks = my && my.picks ? my.picks.length : 0;
  const reviews = st.g.reviews.length;
  const t = [{ id: 'map', label: 'Map' }];
  if (st.me.plays) t.push({ id: 'play', label: 'Play', badge: reviews || null });
  else if (reviews) t.push({ id: 'play', label: 'Review', badge: reviews });
  t.push({ id: 'tasks', label: 'Tasks' });
  if (st.me.plays) t.push({ id: 'cards', label: 'Cards', badge: picks || null });
  t.push({ id: 'board', label: 'Board' });
  return t;
}

const terr = (st, id) => st.settings.territories.find((t) => t.id === id) || { name: '?', color: '#888' };
const team = (st, id) => st.teams.find((t) => t.id === id) || { name: '?', color: '#888' };
const tdata = (st, id) => st.g.teams.find((t) => t.id === id);
const taskOf = (st, id) => st.settings.tasks.find((t) => t.id === id);
const OPEN = ['choose', 'need_proof', 'rejected'];
const STATUS = { choose: ['Pick a task', 'warn'], need_proof: ['Needs proof', 'warn'], pending: ['In review', ''], approved: ['Approved', 'good'], rejected: ['Rejected', 'bad'], skipped: ['Skipped', ''] };

export function View(ctx) {
  const { tab, st } = ctx;
  if (st.status === 'lobby') return null;
  return tab === 'map' ? html`<${MapTab} ...${ctx} />` : tab === 'play' ? html`<${PlayTab} ...${ctx} />` : tab === 'tasks' ? html`<${TasksTab} ...${ctx} />`
    : tab === 'cards' ? html`<${CardsTab} ...${ctx} />` : html`<${Board} ...${ctx} />`;
}

// ---------------------------------------------------------------- map + "is it inside?"
function MapTab({ st, loc }) {
  const my = tdata(st, st.me.teamId);
  const open = my ? my.available : [];
  const s = st.settings;
  const items = [];
  for (const c of META.cities) {
    const t = s.cityTerritory[c.id]; const off = s.disabledCities.includes(c.id);
    const done = my && my.attempts.some((x) => x.kind === 'checkin' && x.cityId === c.id);
    items.push({ k: 'marker', shape: 'dot', lat: c.lat, lng: c.lng, color: terr(st, t).color, dim: off, label: (done ? 'Done: ' : '') + c.name,
      popup: `<b>${esc(c.name)}</b><br>Inside <b>${esc(terr(st, t).name)}</b>${off ? '<br><i>not a checkpoint</i>' : ''}${my && t ? (open.includes(t) ? '<br>Open to you now' : my.cleared.includes(t) ? '<br>Territory cleared' : '<br>Locked for now') : ''}` });
  }
  for (const [k, id] of [['start', s.startCity], ['finish', s.finishCity]]) { const c = META.byId[id]; items.push({ k: 'marker', lat: c.lat, lng: c.lng, color: k === 'start' ? '#2e9d69' : '#222', text: k === 'start' ? 'S' : 'F', label: (k === 'start' ? 'Start ' : 'Finish ') + c.name, z: 500 }); }
  for (const t of st.g.teams) for (const l of t.locs) items.push({ k: 'marker', lat: l.lat, lng: l.lng, color: team(st, t.id).color, text: team(st, t.id).name[0], label: `${team(st, t.id).name} - ${l.name}${l.live ? '' : ' (delayed)'}`, z: 900 });
  if (loc.pos) items.push({ k: 'circle', lat: loc.pos.lat, lng: loc.pos.lng, r: Math.max(loc.pos.acc, 15), color: '#3b82c4' });
  return html`<div class="stack">
    <${LMap} munis=${META.munis} muniColor=${(p) => terr(st, s.muniTerritory[p.id]).color} items=${items} fitKey="race" />
    <div class="card"><div class="pill-row">${s.territoryOrder.map((id, i) => html`<${Chip} color=${terr(st, id).color}>${i + 1}. ${terr(st, id).name}${my && my.cleared.includes(id) ? ' (cleared)' : ''}${my && my.available.includes(id) ? ' - now' : ''}<//>`)}</div></div>
    <${Lookup} st=${st} loc=${loc} my=${my} />
  </div>`;
}

function Lookup({ st, loc, my }) {
  const [q, setQ] = useState('');
  const s = st.settings;
  const matches = q.trim() ? META.cities.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const here = loc.pos ? muniAt(META.munis, loc.pos.lat, loc.pos.lng) : null;
  return html`<div class="card"><p class="eyebrow">Inside or outside?</p>
    <input placeholder="Type a city, e.g. Jelgava" value=${q} onInput=${(e) => setQ(e.target.value)} />
    ${matches.map((c) => { const t = s.cityTerritory[c.id]; const ok = my && my.available.includes(t);
      return html`<div class="row sp" style="padding:8px 0" key=${c.id}><b>${c.name}</b><span class="row" style="gap:6px"><${Chip} color=${terr(st, t).color}>inside ${terr(st, t).name}<//>
        ${my && html`<${Chip} cls=${ok ? 'good' : 'plain'}>${ok ? 'open to you' : my.cleared.includes(t) ? 'cleared' : 'locked'}<//>`}</span></div>`; })}
    ${here && html`<p class="small" style="margin-top:10px">You are in <b>${here.name}</b>, territory <b style=${{ color: terr(st, s.muniTerritory[here.id]).color }}>${terr(st, s.muniTerritory[here.id]).name}</b></p>`}
    <details style="margin-top:10px"><summary class="dim small" style="cursor:pointer">All cities by territory</summary>
      ${s.territoryOrder.map((id) => html`<div style="margin:8px 0" key=${id}><b style=${{ color: terr(st, id).color }}>${terr(st, id).name}</b><div class="small dim">${META.cities.filter((c) => s.cityTerritory[c.id] === id && !s.disabledCities.includes(c.id)).sort((a, b) => b.pop - a.pop).map((c) => c.name).join(', ')}</div></div>`)}</details></div>`;
}

// ---------------------------------------------------------------- tasks (shared row)
function TaskRow({ t, st, status, action }) {
  return html`<details class="task ${status === 'done' ? 'done' : ''}" key=${t.id}><summary><span class="t">${t.title}</span>
    ${status && html`<${Chip} cls=${status === 'done' ? 'good' : ''}>${status}<//>`}<${Dots} n=${t.difficulty} /></summary>
    <div class="body"><p style="margin-top:0">${t.desc}</p><div class="row sp"><span class="small dim">Reward: ${t.difficulty} card pick${t.difficulty > 1 ? 's' : ''}</span>${action}</div></div></details>`;
}

function TaskList({ st, my, render }) {
  const tasks = st.settings.tasks;
  if (!tasks.length) return html`<${Empty}>No tasks in this game<//>`;
  return html`<div>${[1, 2, 3, 4, 5, 6].map((lv) => { const list = tasks.filter((t) => t.difficulty === lv);
    return list.length ? html`<div key=${lv}><div class="lvl"><span>Level ${lv}</span><span class="dim small">${lv} pick${lv > 1 ? 's' : ''} each</span></div>${list.map((t) => render(t))}</div>` : null; })}</div>`;
}

const statusOf = (my, taskId) => { const a = my && my.attempts.filter((x) => x.taskId === taskId).pop(); return a ? ({ approved: 'done', pending: 'in review', need_proof: 'in progress', rejected: 'rejected', skipped: '' }[a.status]) : ''; };
const usedBy = (my, taskId) => !!(my && my.attempts.some((x) => x.taskId === taskId && ['need_proof', 'pending', 'approved'].includes(x.status)));

function TasksTab({ st, act }) {
  const my = tdata(st, st.me.teamId);
  const on = st.settings.tasksEnabled;
  return html`<div class="stack">${!on && html`<div class="callout warn">Tasks are switched off in this game.</div>`}
    <${TaskList} st=${st} my=${my} render=${(t) => html`<${TaskRow} t=${t} st=${st} status=${statusOf(my, t.id)}
      action=${st.me.plays && on && !usedBy(my, t.id) && html`<${AsyncBtn} class="sm" onClick=${() => act('start_extra', { taskId: t.id }, 'Bonus task started - find it on the Play tab')}>Do as bonus task<//>`} />`} /></div>`;
}

// ---------------------------------------------------------------- play
function PlayTab(ctx) {
  const { st, now } = ctx;
  const my = tdata(st, st.me.teamId);
  return html`<div class="stack">
    <${Window} st=${st} now=${now} />
    ${my && my.frozenUntil > now && html`<div class="callout bad">Your team is frozen for ${fmtDur(my.frozenUntil - now)}. No check-in or finish until then.</div>`}
    <${Reviews} ...${ctx} />
    ${my && html`<${MyTeam} ...${ctx} my=${my} />`}
    ${!my && !st.g.reviews.length && html`<div class="card"><${Empty}>You are not on a team. Follow the race on the Map and Board tabs.<//></div>`}
  </div>`;
}

function Window({ st, now }) {
  const w = st.g.window;
  if (!st.settings.useWindow) return null;
  const ms = w.msToChange != null ? w.msToChange - (now - st.now) : null;
  return html`<div class="callout ${w.open ? 'good' : 'warn'}">${w.open ? `Play window open until ${st.settings.window.end}. Closes in ${fmtDur(ms)}.` : `Outside the play window. Rest! The clock is stopped. Opens in ${fmtDur(ms)} (${st.settings.window.start}).`}</div>`;
}

function MyTeam({ st, act, loc, code, token, my, now }) {
  const s = st.settings;
  const need = s.requiredPerTerritory;
  const open = my.attempts.filter((a) => OPEN.includes(a.status));
  const openCheckin = open.some((a) => a.kind === 'checkin');
  const cands = [];
  for (const c of META.cities) {
    const t = s.cityTerritory[c.id];
    if (!t || s.disabledCities.includes(c.id) || !my.available.includes(t) || my.attempts.some((x) => x.kind === 'checkin' && x.cityId === c.id)) continue;
    cands.push({ c, t, d: loc.pos ? dist(loc.pos, c) : null });
  }
  cands.sort((a, b) => (a.d ?? 1e12) - (b.d ?? 1e12) || b.c.pop - a.c.pop);
  const allClear = my.available.length === 0;
  const fc = META.byId[s.finishCity];
  const frozen = my.frozenUntil > now;
  return html`<div class="stack">
    ${open.map((a) => a.status === 'choose' ? html`<${ChooseTask} key=${a.aid} a=${a} st=${st} my=${my} act=${act} />` : html`<${ProofCard} key=${a.aid} a=${a} st=${st} act=${act} code=${code} token=${token} />`)}
    <div class="card"><h2>${team(st, st.me.teamId).name}</h2>
      ${s.territoryOrder.map((id) => { const n = Math.min(need, my.counts[id] || 0); const cur = my.available.includes(id);
        return html`<div class="terr" key=${id}><i class="dot" style=${{ background: terr(st, id).color }}></i><div class="grow"><div class="row sp"><b>${terr(st, id).name}</b>
          <span class="small ${my.cleared.includes(id) ? 'good' : 'dim'}">${my.cleared.includes(id) ? 'cleared' : cur ? 'current' : 'locked'} ${n}/${need}</span></div>
          <div class="bar"><i style=${{ width: (n / need) * 100 + '%', background: terr(st, id).color }}></i></div></div></div>`; })}
      ${(my.bonusMin || my.penaltyMin) ? html`<p class="small dim">Bonus ${my.bonusMin} min, penalties ${my.penaltyMin} min</p>` : ''}
      ${my.finishedAt ? html`<div class="callout good">You finished. Score ${fmtDur(my.scoreMs)}</div>` : allClear && html`<div class="mt"><div class="callout good">All territories cleared. Go to ${fc.name} and press Finish.</div>
        <${AsyncBtn} class="good-btn block mt" disabled=${frozen || openCheckin} onClick=${() => act('finish')}>Finish the race<//></div>`}</div>
    ${!my.finishedAt && !allClear && html`<div class="card"><h2>Check in</h2>
      <p class="small dim">Open now: ${my.available.map((id) => terr(st, id).name).join(', ')}. Be within ${fmtKm(s.checkinRadiusM)} of the centre${loc.pos ? '' : ' (waiting for GPS)'}.</p>
      <div class="list">${cands.slice(0, 12).map(({ c, t, d }) => html`<div class="row sp nw" key=${c.id}><div><b>${c.name}</b> <${Chip} color=${terr(st, t).color}>${terr(st, t).name}<//>
        ${d != null && html`<div class="small ${d <= s.checkinRadiusM ? 'good' : 'dim'}">${fmtKm(d)} away</div>`}</div>
        <${AsyncBtn} class="sm ${d != null && d <= s.checkinRadiusM ? '' : 'ghost'}" disabled=${frozen || openCheckin} onClick=${() => act('checkin', { cityId: c.id })}>Check in<//></div>`)}</div></div>`}
    <div class="card"><p class="eyebrow">Your tasks</p>${my.attempts.length === 0 ? html`<p class="dim">Nothing yet.</p>` : my.attempts.slice().reverse().map((a) => { const t = taskOf(st, a.taskId);
      return html`<div class="row sp" key=${a.aid} style="padding:5px 0"><span><b>${a.cityId ? cityName(a.cityId) : 'Bonus'}</b> <span class="dim small">${t ? t.title : ''}</span></span><span class="small ${STATUS[a.status][1]}">${STATUS[a.status][0]}</span></div>`; })}</div>
  </div>`;
}

function ChooseTask({ a, st, my, act }) {
  return html`<div class="card accent"><h2>Choose a task for ${cityName(a.cityId)}</h2>
    <${TaskList} st=${st} my=${my} render=${(t) => usedBy(my, t.id) ? null : html`<${TaskRow} t=${t} st=${st}
      action=${html`<${AsyncBtn} class="sm" onClick=${() => act('choose_task', { aid: a.aid, taskId: t.id })}>Take this task<//>`} />`} />
    <div class="row mt"><${AsyncBtn} class="ghost sm" confirm=${`Skip for a +${st.settings.skipPenaltyMin} min penalty?`} onClick=${() => act('skip', { aid: a.aid })}>Skip (+${st.settings.skipPenaltyMin} min)<//></div></div>`;
}

function ProofCard({ a, st, act, code, token }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const t = taskOf(st, a.taskId) || { title: 'Task', desc: '', difficulty: 1 };
  const bonus = a.kind === 'extra';
  const submit = async () => {
    if (!file) return toast('Pick or take a photo first');
    try { const fid = await uploadPhoto(code, token, file); await act('proof', { aid: a.aid, fid, note }, 'Proof submitted'); setFile(null); } catch (e) { toast(e.message); }
  };
  return html`<div class="card accent"><div class="row sp"><h2 style="margin:0">${t.title}</h2><${Dots} n=${t.difficulty} /></div>
    <p class="small dim">${bonus ? 'Bonus task' : cityName(a.cityId)} - ${t.difficulty} pick${t.difficulty > 1 ? 's' : ''} when approved</p>
    <p>${t.desc}</p>
    ${a.status === 'rejected' && html`<div class="callout bad">Your last proof was rejected. Redo it${bonus ? '' : ' or skip'}.</div>`}
    <input type="file" accept="image/*" capture="environment" onChange=${(e) => setFile(e.target.files[0])} />
    <${Field} label="Note (optional)"><input value=${note} maxlength="240" onInput=${(e) => setNote(e.target.value)} /><//>
    <div class="row mt"><${AsyncBtn} class="grow" onClick=${submit}>Submit proof<//>
      <${AsyncBtn} class="ghost" confirm=${bonus ? 'Drop this bonus task?' : `Skip for a +${st.settings.skipPenaltyMin} min penalty?`} onClick=${() => act('skip', { aid: a.aid })}>${bonus ? 'Drop' : `Skip (+${st.settings.skipPenaltyMin}m)`}<//></div></div>`;
}

function Reviews({ st, act, code, token }) {
  const rs = st.g.reviews;
  if (!rs.length) return null;
  return html`<div class="card accent"><h2>Proofs to review (${rs.length})</h2>
    ${rs.map((r) => { const t = taskOf(st, r.taskId); return html`<div key=${r.aid} style="margin:12px 0;border-top:1.5px dashed var(--line);padding-top:12px"><b>${team(st, r.teamId).name}</b> ${r.cityId ? 'in ' + cityName(r.cityId) : '(bonus task)'}
      <div class="small"><b>${t ? t.title : ''}</b> - ${t ? t.desc : ''}</div>${r.note && html`<div class="small dim">"${r.note}"</div>`}
      <img class="proof" src=${fileUrl(code, token, r.fid)} loading="lazy" />
      <div class="row mt"><${AsyncBtn} class="good-btn grow" onClick=${() => act('review', { teamId: r.teamId, aid: r.aid, verdict: 'approve' })}>Approve<//>
        <${AsyncBtn} class="danger grow" onClick=${() => act('review', { teamId: r.teamId, aid: r.aid, verdict: 'reject' })}>Reject<//></div></div>`; })}</div>`;
}

// ---------------------------------------------------------------- cards
function CardsTab({ st, act }) {
  const my = tdata(st, st.me.teamId);
  const [pickOpen, setPickOpen] = useState(() => !!(my && my.picks && my.picks.length));
  const [sel, setSel] = useState(null);
  if (!my) return html`<div class="card"><${Empty}>Join a team to collect cards<//></div>`;
  const sets = (my.picks || []).map((p) => ({ id: p.pid, options: p.options, keep: 1 }));
  return html`<div class="stack">
    ${sets.length > 0 && html`<div class="card accent"><div class="row sp"><div><h2 style="margin:0">${sets.length} card pick${sets.length > 1 ? 's' : ''} waiting</h2><div class="small dim">Choose one card from each set</div></div>
      <button onClick=${() => setPickOpen(true)}>Open</button></div></div>`}
    <div class="card"><p class="eyebrow">Your hand (${my.cards.length})</p>
      <${Hand} items=${my.cards} mode="race" onOpen=${setSel} empty=${html`<${Empty}>No cards yet. Finish tasks to earn picks.<//>`} />
      ${my.spyUntil > Date.now() && html`<div class="callout good">Spy is active: you can see every team live.</div>`}</div>
    <details class="card"><summary style="cursor:pointer;font-weight:700">All cards in this game (${st.settings.cards.length})</summary>
      <div class="hand">${st.settings.cards.map((c) => html`<${GCard} card=${c} mode="race" small=${true} key=${c.id} />`)}</div></details>
    ${pickOpen && html`<${PickModal} sets=${sets} mode="race" title="Choose a card" onClose=${() => setPickOpen(false)}
      onTake=${(set, idx) => act('pick', { pid: set.id, index: idx[0] })} onPass=${(set) => act('pick', { pid: set.id, pass: true })} />`}
    ${sel && html`<${RaceCardModal} inst=${sel} st=${st} my=${my} onClose=${() => setSel(null)} onPlay=${(p) => act('play_card', p)} />`}
  </div>`;
}

// ---------------------------------------------------------------- board
function Board({ st, act, code, token, now }) {
  const need = st.settings.requiredPerTerritory;
  const [adj, setAdj] = useState({ teamId: '', minutes: 10, reason: '' });
  const [man, setMan] = useState({ teamId: '', cityId: '' });
  return html`<div class="stack">
    ${st.g.ranking.map((id, i) => { const t = tdata(st, id); const tm = team(st, id);
      return html`<div class="card" style=${{ borderColor: tm.color, margin: 0 }} key=${id}><div class="row sp"><h2 style="margin:0">${i + 1}. <i class="dot" style=${{ background: tm.color }}></i> ${tm.name}</h2>
        <div class="stat"><div class="v">${fmtDur(t.scoreMs)}</div><div class="k">${t.finishedAt ? 'final' : 'so far'}</div></div></div>
        <div class="small dim">${st.members.filter((m) => m.teamId === id).map((m) => m.name).join(', ')} - bonus ${t.bonusMin}m, penalties ${t.penaltyMin}m${t.cards ? ', ' + t.cards.length + ' cards' : ''}${t.frozenUntil > now ? ', frozen' : ''}</div>
        <div class="pill-row" style="margin:8px 0">${st.settings.territoryOrder.map((tid) => html`<${Chip} color=${terr(st, tid).color}>${terr(st, tid).name} ${Math.min(need, t.counts[tid] || 0)}/${need}${st.g.claims[tid] === id ? ' (first)' : ''}<//>`)}</div>
        <details><summary class="small dim" style="cursor:pointer">Tasks (${t.attempts.length})</summary>${t.attempts.map((a) => { const tk = taskOf(st, a.taskId); return html`<div class="small" style="padding:4px 0" key=${a.aid}><b>${a.cityId ? cityName(a.cityId) : 'Bonus'}</b> ${tk ? tk.title : ''} <span class=${STATUS[a.status][1]}>${STATUS[a.status][0]}</span>
          ${a.fid && html`<div><img class="proof" src=${fileUrl(code, token, a.fid)} loading="lazy" /></div>`}</div>`; })}
          ${t.adjust.map((a) => html`<div class="small warn">Admin adjustment ${a.min > 0 ? '+' : ''}${a.min} min: ${a.reason}</div>`)}</details></div>`; })}
    ${st.me.canAdmin && st.status !== 'finished' && html`<div class="card"><p class="eyebrow">Admin tools</p>
      <div class="row nw"><select class="grow" value=${adj.teamId} onChange=${(e) => setAdj({ ...adj, teamId: e.target.value })}><option value="">Team...</option>${st.teams.filter((t) => t.id !== st.me.teamId).map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select>
        <input style="width:90px" type="number" value=${adj.minutes} onInput=${(e) => setAdj({ ...adj, minutes: +e.target.value })} /></div>
      <input style="margin-top:8px" placeholder="Reason (required)" value=${adj.reason} onInput=${(e) => setAdj({ ...adj, reason: e.target.value })} />
      <${AsyncBtn} class="block mt" onClick=${() => act('adjust', adj, 'Adjustment applied')}>Add ${adj.minutes} min (negative = bonus)<//>
      ${st.me.neutral && html`<hr class="divider" /><div class="row nw"><select class="grow" onChange=${(e) => setMan({ ...man, teamId: e.target.value })}><option value="">Team...</option>${st.teams.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select>
        <select class="grow" onChange=${(e) => setMan({ ...man, cityId: e.target.value })}><option value="">City...</option>${META.cities.map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select></div>
        <${AsyncBtn} class="ghost block mt" onClick=${() => act('checkin', { ...man, manual: true }, 'Checked in')}>Check team in manually<//>`}</div>`}
  </div>`;
}
