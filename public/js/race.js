import { html, useState } from '/vendor/preact.js';
import { META, cityName, uploadPhoto, fileUrl, toast } from './api.js';
import { AsyncBtn, Chip, Field, fmtDur, fmtKm, dist, muniAt, esc } from './ui.js';
import { LMap } from './map.js';

export function tabs(st) {
  const n = st.g.reviews.length;
  return [{ id: 'map', label: '🗺 Map' }, ...(st.me.plays ? [{ id: 'play', label: '🎯 Play', badge: n || null }] : (n ? [{ id: 'play', label: '🔎 Review', badge: n }] : [])), { id: 'board', label: '🏆 Board' }];
}

const terr = (st, id) => st.settings.territories.find((t) => t.id === id) || { name: '?', color: '#777' };
const team = (st, id) => st.teams.find((t) => t.id === id) || { name: '?', color: '#777' };
const tdata = (st, id) => st.g.teams.find((t) => t.id === id);
const STATUS = { need_proof: ['📸 needs proof', 'warn'], pending: ['⏳ in review', 'dim'], approved: ['✅ approved', 'ok'], rejected: ['❌ rejected - redo or skip', 'bad'], skipped: ['⏭ skipped', 'dim'] };

export function View(ctx) {
  const { tab, st } = ctx;
  if (st.status === 'lobby') return null;
  return tab === 'map' ? html`<${MapTab} ...${ctx} />` : tab === 'play' ? html`<${PlayTab} ...${ctx} />` : html`<${Board} ...${ctx} />`;
}

// ---------------------------------------------------------------- map + "is it inside?"
function MapTab({ st, loc, now }) {
  const my = tdata(st, st.me.teamId);
  const open = my ? my.available : [];
  const s = st.settings;
  const items = [];
  for (const c of META.cities) {
    const t = s.cityTerritory[c.id]; const off = s.disabledCities.includes(c.id);
    const done = my && my.checkins.some((x) => x.cityId === c.id);
    items.push({ k: 'marker', shape: 'dot', lat: c.lat, lng: c.lng, color: terr(st, t).color, dim: off, label: (done ? '✔ ' : '') + c.name,
      popup: `<b>${esc(c.name)}</b><br>Inside <b>${esc(terr(st, t).name)}</b>${off ? '<br><i>not a checkpoint</i>' : ''}${my && t ? (open.includes(t) ? '<br>✅ open to you now' : my.cleared.includes(t) ? '<br>✔ territory cleared' : '<br>🔒 not open yet') : ''}` });
  }
  for (const [k, id] of [['start', s.startCity], ['finish', s.finishCity]]) { const c = META.byId[id]; items.push({ k: 'marker', lat: c.lat, lng: c.lng, color: k === 'start' ? '#1f8a5d' : '#111', text: k === 'start' ? 'S' : '🏁', label: (k === 'start' ? 'START ' : 'FINISH ') + c.name, z: 500 }); }
  for (const t of st.g.teams) for (const l of t.locs) items.push({ k: 'marker', lat: l.lat, lng: l.lng, color: team(st, t.id).color, text: team(st, t.id).name[0], label: `${team(st, t.id).name} - ${l.name}${l.live ? '' : ' (delayed)'}`, z: 900 });
  if (loc.pos) items.push({ k: 'circle', lat: loc.pos.lat, lng: loc.pos.lng, r: Math.max(loc.pos.acc, 15), color: '#5aa9e6' });
  return html`<div>
    <${LMap} munis=${META.munis} muniColor=${(p) => terr(st, s.muniTerritory[p.id]).color} items=${items} fitKey="race" />
    <div class="card"><div class="row">${s.territoryOrder.map((id, i) => html`<${Chip} color=${terr(st, id).color}>${i + 1}. ${terr(st, id).name}${my && my.cleared.includes(id) ? ' ✔' : ''}${my && my.available.includes(id) ? ' ◀ you' : ''}<//>`)}</div>
      <p class="small dim">${s.ordered ? 'Territories open in this order.' : 'Territories can be cleared in any order.'} Each needs ${s.requiredPerTerritory} check-ins. Tap a city or municipality for details.</p></div>
    <${Lookup} st=${st} loc=${loc} my=${my} />
  </div>`;
}

function Lookup({ st, loc, my }) {
  const [q, setQ] = useState('');
  const s = st.settings;
  const matches = q.trim() ? META.cities.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const here = loc.pos ? muniAt(META.munis, loc.pos.lat, loc.pos.lng) : null;
  return html`<div class="card"><h2>Is this city inside or outside?</h2>
    <input placeholder="Type a city, e.g. Jelgava" value=${q} onInput=${(e) => setQ(e.target.value)} />
    ${matches.map((c) => { const t = s.cityTerritory[c.id]; const ok = my && my.available.includes(t);
      return html`<div class="row sp" style="padding:8px 0" key=${c.id}><b>${c.name}</b><span><${Chip} color=${terr(st, t).color}>inside ${terr(st, t).name}<//>
        ${my && html`<${Chip}>${ok ? '✅ open to you' : my.cleared.includes(t) ? '✔ cleared' : '🔒 not yet'}<//>`}</span></div>`; })}
    ${here && html`<p class="small" style="margin-top:10px">📍 You are in <b>${here.name}</b> → territory <b style=${{ color: terr(st, s.muniTerritory[here.id]).color }}>${terr(st, s.muniTerritory[here.id]).name}</b></p>`}
    <details style="margin-top:8px"><summary class="dim small">All cities by territory</summary>
      ${s.territoryOrder.map((id) => html`<div style="margin:8px 0" key=${id}><b style=${{ color: terr(st, id).color }}>${terr(st, id).name}</b><div class="small dim">${META.cities.filter((c) => s.cityTerritory[c.id] === id && !s.disabledCities.includes(c.id)).sort((a, b) => b.pop - a.pop).map((c) => c.name).join(', ')}</div></div>`)}</details></div>`;
}

// ---------------------------------------------------------------- play
function PlayTab(ctx) {
  const { st, act, now, loc, code, token } = ctx;
  const s = st.settings;
  const my = tdata(st, st.me.teamId);
  return html`<div>
    <${Window} st=${st} now=${now} />
    <${Reviews} ...${ctx} />
    ${my && html`<${MyTeam} ...${ctx} my=${my} />`}
    ${!my && !st.g.reviews.length && html`<div class="card dim">You are not on a team. Use the Map and Board tabs to follow the race.</div>`}
  </div>`;
}

function Window({ st, now }) {
  const w = st.g.window;
  if (!st.settings.useWindow) return null;
  const ms = w.msToChange != null ? w.msToChange - (now - st.now) : null;
  return html`<div class="card ${w.open ? '' : 'hl'}">${w.open ? html`🟢 Play window open (${st.settings.window.start}-${st.settings.window.end}) - closes in <b>${fmtDur(ms)}</b>`
    : html`🌙 Outside the play window - <b>rest!</b> Clock is stopped. Opens in <b>${fmtDur(ms)}</b> (${st.settings.window.start})`}</div>`;
}

function MyTeam({ st, act, loc, code, token, my, now }) {
  const s = st.settings;
  const need = s.requiredPerTerritory;
  const open = my.checkins.filter((c) => c.status === 'need_proof' || c.status === 'rejected');
  const cands = [];
  for (const c of META.cities) {
    const t = s.cityTerritory[c.id];
    if (!t || s.disabledCities.includes(c.id) || !my.available.includes(t) || my.checkins.some((x) => x.cityId === c.id)) continue;
    cands.push({ c, t, d: loc.pos ? dist(loc.pos, c) : null });
  }
  cands.sort((a, b) => (a.d ?? 1e12) - (b.d ?? 1e12) || b.c.pop - a.c.pop);
  const allClear = my.available.length === 0;
  const fc = META.byId[s.finishCity];
  return html`<div>
    <div class="card"><h2>${team(st, st.me.teamId).name} - progress</h2>
      ${s.territoryOrder.map((id) => { const n = Math.min(need, my.counts[id] || 0); const cur = my.available.includes(id);
        return html`<div class="terr" key=${id}><i class="dot" style=${{ background: terr(st, id).color }}></i><div class="grow"><div class="row sp"><b>${terr(st, id).name}</b>
          <span class="small ${my.cleared.includes(id) ? 'ok' : 'dim'}">${my.cleared.includes(id) ? '✔ cleared' : cur ? '◀ current target' : '🔒'} ${n}/${need}</span></div>
          <div class="bar"><i style=${{ width: (n / need) * 100 + '%', background: terr(st, id).color }}></i></div></div></div>`; })}
      ${(my.bonusMin || my.penaltyMin) ? html`<p class="small">Bonus ${my.bonusMin} min · Penalties ${my.penaltyMin} min</p>` : ''}
      ${my.finishedAt ? html`<p class="ok"><b>🏁 You finished! Score ${fmtDur(my.scoreMs)}</b></p>` : allClear && html`<div><p class="ok"><b>All territories cleared!</b> Head to <b>${fc.name}</b> (finish) and press the button.</p>
        <${AsyncBtn} class="good block" onClick=${() => act('finish')}>🏁 I'm at the finish - finish the race<//></div>`}</div>

    ${open.map((c) => html`<${Challenge} key=${c.cityId} c=${c} act=${act} code=${code} token=${token} s=${s} />`)}

    ${!my.finishedAt && !allClear && html`<div class="card"><h2>Check in to a city</h2>
      <p class="small dim">Open now: ${my.available.map((id) => terr(st, id).name).join(', ')}. You must be within ${fmtKm(s.checkinRadiusM)} of the city centre${loc.pos ? '' : ' - waiting for GPS…'}.</p>
      <div class="list">${cands.slice(0, 12).map(({ c, t, d }) => html`<div class="row sp" key=${c.id}><div><b>${c.name}</b> <${Chip} color=${terr(st, t).color}>${terr(st, t).name}<//>
        ${d != null && html`<div class="small ${d <= s.checkinRadiusM ? 'ok' : 'dim'}">${fmtKm(d)} away</div>`}</div>
        <${AsyncBtn} class="sm ${d != null && d <= s.checkinRadiusM ? 'good' : 'sec'}" onClick=${() => act('checkin', { cityId: c.id })}>Check in<//></div>`)}</div></div>`}

    <div class="card"><h3>Your check-ins</h3>${my.checkins.length === 0 ? html`<p class="dim">None yet.</p>` : my.checkins.slice().reverse().map((c) => html`<div class="row sp" key=${c.cityId} style="padding:4px 0">
      <span><b>${cityName(c.cityId)}</b> <${Chip} color=${terr(st, c.territory).color}>${terr(st, c.territory).name}<//></span><span class="small ${STATUS[c.status][1]}">${STATUS[c.status][0]}</span></div>`)}</div>
  </div>`;
}

function Challenge({ c, act, code, token, s }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const submit = async () => {
    if (!file) return toast('Pick or take a photo first');
    try { const fid = await uploadPhoto(code, token, file); await act('proof', { cityId: c.cityId, fid, note }, 'Proof submitted'); setFile(null); } catch (e) { toast(e.message); }
  };
  return html`<div class="card hl"><h2>📸 Challenge - ${cityName(c.cityId)}</h2><p><b>${c.challenge}</b></p>
    ${c.status === 'rejected' && html`<p class="bad small">Your last proof was rejected. Redo it, or skip (+${s.skipPenaltyMin} min).</p>`}
    <input type="file" accept="image/*" capture="environment" onChange=${(e) => setFile(e.target.files[0])} />
    <${Field} label="Note (optional)"><input value=${note} maxlength="200" onInput=${(e) => setNote(e.target.value)} /><//>
    <div class="row" style="margin-top:10px"><${AsyncBtn} class="grow" onClick=${submit}>Submit proof<//>
      <${AsyncBtn} class="sec" confirm=${`Skip this challenge for a +${s.skipPenaltyMin} min penalty?`} onClick=${() => act('skip', { cityId: c.cityId })}>Skip (+${s.skipPenaltyMin}m)<//></div></div>`;
}

function Reviews({ st, act, code, token }) {
  const rs = st.g.reviews;
  if (!rs.length) return null;
  return html`<div class="card hl"><h2>🔎 Proofs to review (${rs.length})</h2>
    <p class="small dim">Is the photo a fair attempt at the challenge? Approve or reject. Be fair - it's logged publicly.</p>
    ${rs.map((r) => html`<div key=${r.teamId + r.cityId} style="margin:12px 0;border-top:1px solid var(--line);padding-top:10px"><b>${team(st, r.teamId).name}</b> in <b>${cityName(r.cityId)}</b>
      <div class="small">Challenge: ${r.challenge}</div>${r.note && html`<div class="small dim">"${r.note}"</div>`}
      <img class="proof" src=${fileUrl(code, token, r.fid)} loading="lazy" />
      <div class="row" style="margin-top:8px"><${AsyncBtn} class="good grow" onClick=${() => act('review', { teamId: r.teamId, cityId: r.cityId, verdict: 'approve' })}>✅ Approve<//>
        <${AsyncBtn} class="danger grow" onClick=${() => act('review', { teamId: r.teamId, cityId: r.cityId, verdict: 'reject' })}>❌ Reject<//></div></div>`)}</div>`;
}

// ---------------------------------------------------------------- board
function Board({ st, act, code, token, now }) {
  const admin = st.me.role === 'admin';
  const need = st.settings.requiredPerTerritory;
  const [adj, setAdj] = useState({ teamId: '', minutes: 10, reason: '' });
  const [man, setMan] = useState({ teamId: '', cityId: '' });
  return html`<div>
    ${st.g.ranking.map((id, i) => { const t = tdata(st, id); const tm = team(st, id);
      return html`<div class="card" style=${{ borderColor: tm.color }} key=${id}><div class="row sp"><h2>${i + 1}. <i class="dot" style=${{ background: tm.color }}></i> ${tm.name}</h2>
        <div class="stat"><div class="v">${fmtDur(t.scoreMs)}</div><div class="k">${t.finishedAt ? '🏁 final' : 'so far'}</div></div></div>
        <div class="small dim">${st.members.filter((m) => m.teamId === id).map((m) => m.name).join(', ')} · bonus ${t.bonusMin}m · penalties ${t.penaltyMin}m</div>
        <div class="pill-row" style="margin:8px 0">${st.settings.territoryOrder.map((tid) => html`<${Chip} color=${terr(st, tid).color}>${terr(st, tid).name} ${Math.min(need, t.counts[tid] || 0)}/${need}${st.g.claims[tid] === id ? ' ⭐' : ''}<//>`)}</div>
        <details><summary class="small dim">Check-ins (${t.checkins.length})</summary>${t.checkins.map((c) => html`<div class="small" style="padding:4px 0" key=${c.cityId}><b>${cityName(c.cityId)}</b> <span class=${STATUS[c.status][1]}>${STATUS[c.status][0]}</span>
          ${c.fid && html`<div><img class="proof" src=${fileUrl(code, token, c.fid)} loading="lazy" /></div>`}</div>`)}
          ${t.adjust.map((a) => html`<div class="small warn">Admin adjustment ${a.min > 0 ? '+' : ''}${a.min} min: ${a.reason}</div>`)}</details></div>`; })}
    ${admin && st.status !== 'finished' && html`<div class="card"><h2>🛠 Admin tools (logged publicly)</h2>
      <div class="row"><select class="grow" value=${adj.teamId} onChange=${(e) => setAdj({ ...adj, teamId: e.target.value })}><option value="">Team…</option>${st.teams.filter((t) => t.id !== st.me.teamId).map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select>
        <input style="width:90px" type="number" value=${adj.minutes} onInput=${(e) => setAdj({ ...adj, minutes: +e.target.value })} /></div>
      <input style="margin-top:8px" placeholder="Reason (required)" value=${adj.reason} onInput=${(e) => setAdj({ ...adj, reason: e.target.value })} />
      <${AsyncBtn} class="block" style="margin-top:8px" onClick=${() => act('adjust', adj, 'Adjustment applied')}>Add ${adj.minutes} min penalty (negative = bonus)<//>
      ${st.me.referee && html`<h3 style="margin-top:14px">Manual check-in (no GPS)</h3><div class="row"><select class="grow" onChange=${(e) => setMan({ ...man, teamId: e.target.value })}><option value="">Team…</option>${st.teams.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select>
        <select class="grow" onChange=${(e) => setMan({ ...man, cityId: e.target.value })}><option value="">City…</option>${META.cities.map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select></div>
        <${AsyncBtn} class="sec block" style="margin-top:8px" onClick=${() => act('checkin', { ...man, manual: true }, 'Checked in')}>Check team in manually<//>
        <p class="help">Use only when a phone died. The team still has to do the challenge.</p>`}</div>`}
  </div>`;
}
