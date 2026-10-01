import { html, useState } from '/vendor/preact.js';
import { META, cityName, uploadPhoto, fileUrl, toast } from './api.js';
import { AsyncBtn, Chip, Field, fmtDur, fmtKm, dist, fmtTime } from './ui.js';
import { LMap } from './map.js';

export function tabs(st) { return [{ id: 'play', label: '🎯 Round' }, { id: 'board', label: '🏆 Scores' }]; }

const nameOf = (st, id) => (st.members.find((m) => m.id === id) || { name: '?' }).name;

export function View(ctx) { return ctx.tab === 'board' ? html`<${Board} ...${ctx} />` : html`<${Play} ...${ctx} />`; }

// ---------------------------------------------------------------- play
function Play(ctx) {
  const { st, act, now } = ctx;
  const g = st.g, cur = g.cur;
  const next = g.rounds.find((r) => r.status === 'pending');
  if (st.status === 'finished') return html`<${Board} ...${ctx} />`;
  if (!cur) return html`<div class="card hl"><h2>${next ? `Next: round ${next.n}` : 'All rounds done'}</h2>
    ${next && html`<p><b>${nameOf(st, next.hiderId)}</b> will hide. Everyone else seeks.</p>`}
    ${next && (st.me.role === 'admin' ? html`<p class="small dim">Start it when the hider is ready (the hiding timer of ${st.settings.hideMinutes} min starts now).</p>
      <${AsyncBtn} class="good block" onClick=${() => act('start_round')}>▶ Start round ${next.n}<//>` : html`<p class="dim">Waiting for the admin to start the round…</p>`)}
    <p class="small dim">Schedule: ${g.rounds.map((r) => `R${r.n} ${nameOf(st, r.hiderId)}${r.status === 'done' ? ' ✔' : ''}`).join(' · ')}</p></div>`;
  const role = cur.role;
  const off = now - st.now;
  return html`<div>
    <div class="card hl"><div class="row sp"><div><h2>Round ${cur.n} - ${nameOf(st, cur.hiderId)} hides</h2>
      <div class="pill-row"><${Chip}>${role === 'hider' ? '🫣 You are the HIDER' : role === 'seeker' ? '🔍 You are a SEEKER' : '👁 ' + role}<//>
        <${Chip}>${{ hiding: 'Hiding phase', seeking: 'Seeking', endgame: '⚠ ENDGAME' }[cur.status]}<//></div></div>
      <div class="stat"><div class="v">${cur.status === 'hiding' ? fmtDur(cur.hideEndsAt - now) : fmtDur(cur.seekMsNow + off)}</div>
        <div class="k">${cur.status === 'hiding' ? 'hiding time left' : 'seeking (max ' + fmtDur(cur.maxSeekMs) + ')'}</div></div></div></div>
    ${role === 'hider' ? html`<${HiderPanel} ...${ctx} cur=${cur} />` : role === 'seeker' ? html`<${SeekerPanel} ...${ctx} cur=${cur} />` : html`<${WatchPanel} ...${ctx} cur=${cur} />`}
    <${Questions} ...${ctx} cur=${cur} />
    ${st.me.referee && html`<div class="card"><h3>Referee</h3><${AsyncBtn} class="sec" confirm="Mark the hider as found?" onClick=${() => act('force_found')}>Mark hider found<//></div>`}
  </div>`;
}

function GpsLine({ loc }) { return html`<div class="small ${loc.status === 'ok' ? 'ok' : 'warn'}">${loc.status === 'ok' ? `📍 GPS OK (±${Math.round(loc.pos.acc)} m)` : '📍 waiting for GPS…'}</div>`; }

function HiderPanel({ st, act, loc, cur, code, token, now }) {
  const s = st.settings;
  const z = cur.zone;
  const inside = z && loc.pos ? dist(loc.pos, z) <= s.zoneRadiusM : null;
  const items = [];
  if (z) items.push({ k: 'circle', lat: z.lat, lng: z.lng, r: s.zoneRadiusM, color: '#e0566a', fill: 0.15 }, { k: 'marker', lat: z.lat, lng: z.lng, color: '#e0566a', text: 'Z', label: 'Your zone' });
  if (loc.pos) items.push({ k: 'circle', lat: loc.pos.lat, lng: loc.pos.lng, r: Math.max(6, loc.pos.acc), color: '#5aa9e6' });
  for (const q of cur.questions) if (q.params && q.params.center) items.push({ k: 'circle', lat: q.params.center.lat, lng: q.params.center.lng, r: (q.params.radiusKm || 0) * 1000, color: '#888', dash: true, fill: 0.03 });
  const photos = cur.questions.filter((q) => q.status === 'waiting_photo');
  return html`<div>
    ${cur.status === 'hiding' && html`<div class="card"><h2>Choose your hiding zone</h2>
      <p class="small dim">Tap the map (inside Latvia) to set the centre of your ${s.zoneRadiusM} m zone, or use your location. You must be inside when the timer ends or you press Ready. After that, stay inside!</p>
      <div class="row"><button class="sec" disabled=${!loc.pos} onClick=${() => act('set_zone', { lat: loc.pos.lat, lng: loc.pos.lng })}>📍 Zone here</button>
        <${AsyncBtn} class="good grow" disabled=${!z} onClick=${() => act('ready')}>✅ I'm in position - start seeking now<//></div>
      <${GpsLine} loc=${loc} />${z && loc.pos && html`<p class="${inside ? 'ok' : 'warn'}">${inside ? 'You are inside your zone ✔' : 'You are ' + fmtKm(dist(loc.pos, z)) + ' from your zone centre'}</p>`}</div>`}
    ${cur.status !== 'hiding' && html`<div class="card"><p>${cur.status === 'endgame' ? '⚠ Seekers are inside your zone! Stay put and stay visible.' : 'Stay inside your zone. Answers to questions are computed from your GPS - keep this page open!'}</p><${GpsLine} loc=${loc} />
      ${z && loc.pos && html`<p class="${inside ? 'ok' : 'bad'}">${inside ? 'Inside zone ✔' : '⚠ OUTSIDE your zone (' + fmtKm(dist(loc.pos, z)) + ') - penalty after 3 min!'}</p>`}
      <${AsyncBtn} class="danger block" confirm="Confirm that the seekers found you?" onClick=${() => act('confirm_found')}>I've been found<//></div>`}
    ${photos.map((q) => html`<${PhotoAnswer} key=${q.id} q=${q} act=${act} code=${code} token=${token} />`)}
    <${LMap} cls="short" items=${items} fitKey=${'h' + cur.n + (z ? 'z' : '')} fitTo=${z ? [[z.lat - 0.02, z.lng - 0.03], [z.lat + 0.02, z.lng + 0.03]] : null} onMapClick=${cur.status === 'hiding' ? (p) => act('set_zone', p) : null} munis=${META.munis} muniColor=${() => '#444'} />
  </div>`;
}

function PhotoAnswer({ q, act, code, token }) {
  const [file, setFile] = useState(null);
  const send = async () => {
    if (!file) return toast('Take a photo first');
    try { const fid = await uploadPhoto(code, token, file); await act('answer_photo', { qid: q.id, fid }, 'Photo sent'); } catch (e) { toast(e.message); }
  };
  return html`<div class="card hl"><h2>📸 Photo request</h2><p>The seekers want: <b>${q.params.prompt}</b></p>
    <input type="file" accept="image/*" capture="environment" onChange=${(e) => setFile(e.target.files[0])} /><${AsyncBtn} class="block" style="margin-top:8px" onClick=${send}>Send photo<//></div>`;
}

function SeekerPanel({ st, act, loc, cur, code, token, now }) {
  const s = st.settings;
  const opts = st.g.options;
  const [qt, setQt] = useState('radar');
  const [p, setP] = useState({ radiusKm: 5, distM: 1000, kind: 'region', target: 'riga', pool: 'any', tRadius: 25, prompt: opts.photo[0] });
  const cool = cur.cooldownLeftMs - (now - st.now);
  const open = cur.questions.find((q) => q.status === 'thermo_open' && q.asker === st.me.id);
  const z = cur.zone;
  const items = [];
  if (z) items.push({ k: 'circle', lat: z.lat, lng: z.lng, r: s.zoneRadiusM, color: '#e0566a', fill: 0.15 });
  for (const q of cur.questions) {
    if (!q.params) continue;
    if (q.type === 'radar' && q.answer) items.push({ k: 'circle', lat: q.params.center.lat, lng: q.params.center.lng, r: q.params.radiusKm * 1000, color: q.answer.hit ? '#3ecf8e' : '#ff6b6b', dash: !q.answer.hit, fill: q.answer.hit ? 0.06 : 0.02 });
    if (q.type === 'tentacles' && q.params.center) items.push({ k: 'circle', lat: q.params.center.lat, lng: q.params.center.lng, r: q.params.radiusKm * 1000, color: '#f2c14e', dash: true, fill: 0.02 });
    if (q.type === 'thermo' && q.params.start) {
      items.push({ k: 'marker', shape: 'dot', lat: q.params.start.lat, lng: q.params.start.lng, color: '#fff', label: `Thermo #${q.n} start` });
      if (q.params.end) items.push({ k: 'line', pts: [[q.params.start.lat, q.params.start.lng], [q.params.end.lat, q.params.end.lng]], color: q.answer && q.answer.hot ? '#3ecf8e' : '#5aa9e6', dash: true });
    }
  }
  for (const l of cur.seekerLocs || []) items.push({ k: 'marker', shape: 'dot', lat: l.lat, lng: l.lng, color: l.id === st.me.id ? '#5aa9e6' : '#b39ddb', label: l.name, z: 900 });
  const ask = () => act('ask', { qtype: qt, radiusKm: qt === 'tentacles' ? p.tRadius : p.radiusKm, distM: p.distM, kind: p.kind, target: p.target, pool: p.pool, prompt: p.prompt });
  const sel = (k, arr, fmt = (x) => x) => html`<select value=${p[k]} onChange=${(e) => setP({ ...p, [k]: isNaN(+e.target.value) ? e.target.value : +e.target.value })}>${arr.map((v) => html`<option value=${v}>${fmt(v)}</option>`)}</select>`;
  return html`<div>
    <${LMap} cls="short" items=${items} fitKey=${'s' + cur.n} munis=${META.munis} muniColor=${() => '#444'} />
    <div class="card"><${GpsLine} loc=${loc} />
      ${cur.status === 'hiding' && html`<p>The hider is getting into position. Stay where you are until the timer hits zero!</p>`}
      ${cur.status === 'seeking' && html`<div class="row" style="margin-top:8px"><${AsyncBtn} class="sec grow" onClick=${() => act('enter_endgame')}>🚪 I'm inside the hiding zone<//>
        <${AsyncBtn} class="sec" confirm="Vote to give up? (All seekers must agree; the hider gets the max time.)" onClick=${() => act('give_up')}>🏳 Give up (${cur.giveUp}/${st.members.filter((m) => m.plays).length - 1})<//></div>`}
      ${cur.status !== 'hiding' && html`<${AsyncBtn} class="good block" style="margin-top:8px" onClick=${() => act('found')}>🎯 I found the hider (must be within ~${s.foundRadiusM} m)<//>`}</div>
    ${cur.status === 'seeking' && html`<div class="card"><h2>Ask a question</h2>
      ${cool > 0 && html`<p class="warn">⏳ Cooldown: ${fmtDur(cool, true)}</p>`}
      ${open ? html`<div><p><b>Thermometer open:</b> travel ${fmtKm(open.params.distM)} from your start, then finish.</p>
        ${loc.pos && open.params.start && html`<div class="bar"><i style=${{ width: Math.min(100, (dist(loc.pos, open.params.start) / open.params.distM) * 100) + '%' }}></i></div><p class="small">${fmtKm(dist(loc.pos, open.params.start))} / ${fmtKm(open.params.distM)}</p>`}
        <${AsyncBtn} class="block" onClick=${() => act('thermo_end', { qid: open.id })}>🌡 Finish thermometer here<//></div>` : html`<div>
        <div class="tabs">${['radar', 'thermo', 'matching', 'measuring', 'tentacles', 'photo'].map((t) => html`<button class=${qt === t ? 'on' : ''} onClick=${() => setQt(t)} key=${t}>${t}</button>`)}</div>
        ${qt === 'radar' && html`<div><${Field} label="Is the hider within… of ME (my current position)?">${sel('radiusKm', opts.radarKm, (v) => v + ' km')}<//></div>`}
        ${qt === 'thermo' && html`<div><${Field} label="Travel at least…, then I get hotter/colder">${sel('distM', opts.thermoM, (v) => fmtKm(v))}<//></div>`}
        ${qt === 'matching' && html`<div><${Field} label="Are we both in…">${sel('kind', Object.keys(opts.match), (k) => opts.match[k])}<//></div>`}
        ${qt === 'measuring' && html`<div><${Field} label="Is the hider closer to … than I am?">${sel('target', Object.keys(opts.measure), (k) => opts.measure[k])}<//></div>`}
        ${qt === 'tentacles' && html`<div class="row"><div class="grow"><${Field} label="Which … is the hider nearest">${sel('pool', ['any', 'republic'], (k) => k === 'any' ? 'town' : 'republican city')}<//></div>
          <div class="grow"><${Field} label="within (of me)">${sel('tRadius', opts.tentacleKm, (v) => v + ' km')}<//></div></div>`}
        ${qt === 'photo' && html`<div><${Field} label="The hider sends a photo of…">${sel('prompt', opts.photo)}<//></div>`}
        <p class="small dim">Uses your current GPS position. Each answer gives the hider +${s.costs[qt]} min of time credit.</p>
        <${AsyncBtn} class="block" disabled=${cool > 0} onClick=${ask}>Ask<//></div>`}</div>`}
  </div>`;
}

function WatchPanel({ st, cur, act }) {
  const z = cur.zone, hl = cur.hiderLoc;
  const s = st.settings;
  const items = [];
  if (z) items.push({ k: 'circle', lat: z.lat, lng: z.lng, r: s.zoneRadiusM, color: '#e0566a' });
  if (hl) items.push({ k: 'marker', lat: hl.lat, lng: hl.lng, color: '#e0566a', text: 'H', label: 'Hider (live)' });
  for (const l of cur.seekerLocs || []) items.push({ k: 'marker', shape: 'dot', lat: l.lat, lng: l.lng, color: '#5aa9e6', label: l.name });
  return html`<div>${st.me.referee ? html`<${LMap} cls="short" items=${items} fitKey=${'w' + cur.n} munis=${META.munis} muniColor=${() => '#444'} />`
    : html`<div class="card dim">👁 Spectating. Secret information stays hidden until the round ends.</div>`}</div>`;
}

function Questions({ st, cur, code, token }) {
  if (!cur.questions.length) return html`<div class="card dim">No questions asked yet.</div>`;
  return html`<div class="card"><h2>Questions & answers</h2>${cur.questions.slice().reverse().map((q) => qRow(st, q, code, token))}</div>`;
}
function qRow(st, q, code, token) {
  const a = q.answer; const cls = a ? (a.hit === true || a.same === true || a.closer === true || a.hot === true ? 'yes' : a.hit === false || a.same === false || a.closer === false || a.hot === false ? 'no' : '') : '';
  const desc = { radar: `Radar ${q.params.radiusKm || ''} km`, thermo: `Thermometer ${fmtKm(q.params.distM || 0)}`, matching: 'Matching', measuring: 'Measuring', tentacles: `Tentacles ${q.params.radiusKm || ''} km`, photo: 'Photo' }[q.type];
  return html`<div class="qitem ${cls}" key=${q.id}><div class="small dim">#${q.n} ${nameOf(st, q.asker)} · ${fmtTime(q.t)} · ${desc}</div>
    ${a ? html`<div><b>${a.text}</b>${a.fid && html`<div><img class="proof" src=${fileUrl(code, token, a.fid)} loading="lazy" /></div>`}</div>` : html`<div class="dim">${q.status === 'waiting_photo' ? '⏳ waiting for the hider\'s photo…' : q.status === 'thermo_open' ? '🌡 in progress…' : '…'}</div>`}</div>`;
}

// ---------------------------------------------------------------- scores
function Board({ st, code, token }) {
  const g = st.g;
  const ppl = st.members.filter((m) => m.plays);
  const ranking = ppl.map((m) => ({ m, ms: g.totals[m.id] || 0 })).sort((a, b) => b.ms - a.ms);
  const [show, setShow] = useState(null);
  return html`<div>
    ${st.status === 'finished' && html`<div class="card hl"><h2>🏆 Winner: ${ranking[0] && ranking[0].m.name}</h2></div>`}
    <div class="card"><h2>Total hiding time</h2><p class="small dim">Longest total wins.</p>${ranking.map((r, i) => html`<div class="row sp" key=${r.m.id} style="padding:6px 0"><span>${i + 1}. <b>${r.m.name}</b></span><b>${fmtDur(r.ms)}</b></div>`)}</div>
    <div class="card"><h2>Rounds</h2>${g.rounds.map((r) => html`<div key=${r.n} style="border-top:1px solid var(--line);padding:8px 0"><div class="row sp"><span><b>R${r.n}</b> ${nameOf(st, r.hiderId)}</span>
      <span>${r.status === 'done' ? html`<b>${fmtDur(r.hiderMs)}</b> <span class="small dim">${{ found: 'found', timeout: 'survived', gave_up: 'seekers gave up', aborted: 'aborted' }[r.outcome]}</span>` : html`<span class="dim">${r.status}</span>`}</span></div>
      ${r.status === 'done' && html`<div class="small dim">${r.questions.length} questions · credit ${r.creditMin}m · penalty ${r.penaltyMin}m <button class="sm sec" onClick=${() => setShow(show === r.n ? null : r.n)}>${show === r.n ? 'hide' : 'reveal where'}</button></div>`}
      ${show === r.n && r.reveal && r.reveal.zone && html`<${LMap} cls="short" fitKey=${'rv' + r.n} fitTo=${[[r.reveal.zone.lat - 0.03, r.reveal.zone.lng - 0.04], [r.reveal.zone.lat + 0.03, r.reveal.zone.lng + 0.04]]} munis=${META.munis} muniColor=${() => '#444'}
        items=${[{ k: 'circle', lat: r.reveal.zone.lat, lng: r.reveal.zone.lng, r: st.settings.zoneRadiusM, color: '#e0566a' }, ...(r.reveal.trail.length > 1 ? [{ k: 'line', pts: r.reveal.trail.map((p) => [p[1], p[2]]), color: '#f2c14e' }] : [])]} />`}
      ${show === r.n && (r.events || []).map((e) => html`<div class="small warn">${fmtTime(e.t)} - ${e.text}</div>`)}
      ${show === r.n && r.questions.map((q) => qRow(st, q, code, token))}</div>`)}</div></div>`;
}
