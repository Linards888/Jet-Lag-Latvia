import { html, useState, useEffect } from '/vendor/preact.js';
import { useGame, useClock, useLocation, saved, api, toast, META } from './api.js';
import { AsyncBtn, Chip, Field, fmtDur, fmtDateTime, copy } from './ui.js';
import { LMap } from './map.js';
import { MODES, Rules } from './modes.js';
import * as race from './race.js';
import * as hide from './hide.js';
import * as tag from './tag.js';
import { go } from './home.js';

const VIEWS = { race, hide, tag };

export function GamePage({ code }) {
  const g = useGame(code);
  const { st, err, act, load, token } = g;
  const now = useClock(g.skew);
  const [gps, setGps] = useState(true);
  const [tab, setTab] = useState(null);
  const sharing = !!(st && st.me.plays && st.status !== 'finished' && gps);
  const loc = useLocation(code, token, sharing);

  if (!token) { go('#/join/' + code); return null; }
  if (err === 'auth') return html`<div class="wrap"><div class="card"><h2>You are signed out</h2><p>This device is not (or no longer) signed in to game ${code}. An admin login on another device revokes older admin sessions.</p>
    <button onClick=${() => go('#/join/' + code)}>Sign back in</button> <button class="sec" onClick=${() => { saved.remove(code); go('#/'); }}>Forget game</button></div></div>`;
  if (!st) return html`<div class="wrap"><p class="dim">${err || 'Loading game…'}</p></div>`;

  const V = VIEWS[st.mode];
  const tabs = st.status === 'lobby' ? [{ id: 'lobby', label: 'Lobby' }, { id: 'log', label: 'Log' }, { id: 'rules', label: 'Rules' }]
    : [...V.tabs(st), { id: 'log', label: 'Log' }, { id: 'more', label: 'More' }];
  const cur = tabs.find((t) => t.id === tab) ? tab : tabs[0].id;
  const ctx = { st, act, load, now, loc, code, token, setTab };
  const statusChip = { lobby: 'Lobby', running: '● Live', paused: '⏸ Paused', finished: '🏁 Finished' }[st.status];

  return html`<div>
    <div class="topbar"><div class="in">
      <div class="row sp"><div class="row"><b>${MODES[st.mode].icon} ${st.name}</b><span class="chip mono">${st.code}</span>
        <span class="chip ${st.status === 'paused' ? 'tag-it' : ''}">${statusChip}</span></div>
        <div class="row">${st.me.plays ? html`<button class="sm sec" onClick=${() => setGps(!gps)} title="Share your GPS position">${gps ? gpsLabel(loc) : '📍 off'}</button>` : html`<span class="chip">${st.me.role}${st.me.referee ? ' (referee)' : ''}</span>`}
          <button class="sm sec" onClick=${() => go('#/')}>⌂</button></div></div>
      <div class="tabs">${tabs.map((t) => html`<button class=${cur === t.id ? 'on' : ''} onClick=${() => setTab(t.id)} key=${t.id}>${t.label}${t.badge ? html`<span class="badge">${t.badge}</span>` : ''}</button>`)}</div>
    </div></div>
    <div class="wrap">
      ${st.me.plays && loc.status === 'error' && html`<div class="card warn small">⚠ ${loc.msg}</div>`}
      ${st.me.plays && loc.status === 'denied' && html`<div class="card warn small">⚠ Location permission denied - allow it in your browser settings or GPS checks will fail.</div>`}
      ${st.status === 'paused' && html`<div class="card hl">⏸ The game is paused by the admin. Clocks are stopped.</div>`}
      ${cur === 'lobby' ? html`<${Lobby} ...${ctx} />` : cur === 'log' ? html`<${LogTab} ...${ctx} />`
        : cur === 'rules' ? html`<div class="card"><${Rules} mode=${st.mode} /></div>`
        : cur === 'more' ? html`<${More} ...${ctx} />` : html`<${V.View} ...${ctx} tab=${cur} />`}
    </div>
  </div>`;
}

const gpsLabel = (loc) => loc.status === 'ok' ? `📍 ±${Math.round(loc.pos.acc)}m` : loc.status === 'denied' ? '📍 denied' : loc.status === 'error' ? '📍 ✕' : '📍 …';

// ================================================================ lobby
function Lobby(ctx) {
  const { st, act, code } = ctx;
  const admin = st.me.role === 'admin';
  const players = st.members.filter((m) => m.plays);
  const specs = st.members.filter((m) => m.role === 'spectator');
  const [tn, setTn] = useState('');
  const [tc, setTc] = useState('#2a9d8f');
  const link = `${location.origin}/#/join/${code}`;
  const saved_ = saved.get(code) || {};
  const teamBased = st.mode !== 'hide';
  return html`<div>
    <div class="card hl"><div class="row sp"><div><div class="dim small">Game code</div><div class="big mono">${code}</div></div>
      <div class="grow small dim" style="text-align:right">Invite link<br /><span class="mono">${link}</span><br />
        <button class="sm sec" onClick=${() => toast(copy(link) ? 'Link copied' : 'Copy failed', true)}>Copy link</button></div></div>
      ${admin && saved_.adminKey && html`<p class="small">Your admin key: <span class="mono">${saved_.adminKey}</span> <span class="dim">(only visible on this device)</span></p>`}
      <p class="small dim">${st.adminPlays ? 'Admin also plays (fair-play mode: no secret info for the admin).' : 'Admin is a neutral referee.'}</p></div>

    ${teamBased ? html`<${Teams} ...${ctx} players=${players} admin=${admin} tn=${tn} setTn=${setTn} tc=${tc} setTc=${setTc} />` : html`<div class="card"><h3>Players (${players.length})</h3><div class="list">
      ${players.map((m) => html`<div class="row sp" key=${m.id}><span>${m.name} ${m.role === 'admin' ? html`<${Chip}>admin<//>` : ''} ${m.id === st.me.id ? html`<${Chip}>you<//>` : ''}</span>
        ${admin && m.role !== 'admin' && html`<button class="sm sec" onClick=${() => confirm('Remove ' + m.name + '?') && act('kick', { memberId: m.id })}>Remove</button>`}</div>`)}</div>
      <p class="small dim">Need at least 2 players. Each player hides ${st.settings.hidesPerPlayer}× → ${players.length * st.settings.hidesPerPlayer} rounds.</p></div>`}

    ${specs.length > 0 && html`<div class="card"><h3>Spectators</h3>${specs.map((m) => html`<${Chip}>${m.name}<//> `)}</div>`}

    ${admin ? html`<${Settings} ...${ctx} />
      <div class="card"><div class="row">
        <button class="sec" onClick=${() => act('lock_join', { locked: !st.joinLocked })}>${st.joinLocked ? '🔓 Unlock joining' : '🔒 Lock joining'}</button>
        <${AsyncBtn} class="good grow" onClick=${() => act('start')}>▶ Start the game<//></div>
        <p class="help">Teams and settings cannot be changed after the start. Late people can only spectate.</p></div>`
      : html`<div class="card dim">Waiting for the admin to start the game…</div>`}
  </div>`;
}

function Teams({ st, act, players, admin, tn, setTn, tc, setTc }) {
  const free = players.filter((m) => !m.teamId);
  const mine = st.me.teamId;
  const canJoin = st.me.plays;
  return html`<div>
    <div class="grid">${st.teams.map((t) => {
      const ms = players.filter((m) => m.teamId === t.id);
      return html`<div class="card" style=${{ borderColor: t.color }} key=${t.id}><div class="row sp"><b><i class="dot" style=${{ background: t.color }}></i> ${t.name}</b>
        ${canJoin && mine !== t.id && html`<button class="sm" onClick=${() => act('team_join', { teamId: t.id })}>Join</button>`}
        ${mine === t.id && html`<button class="sm sec" onClick=${() => act('team_leave')}>Leave</button>`}</div>
        <div class="list">${ms.map((m) => html`<div class="row sp" key=${m.id}><span>${m.name}${m.id === st.me.id ? ' (you)' : ''}</span>
          ${admin && html`<span><select style="width:auto;padding:4px" onChange=${(e) => act('assign_team', { memberId: m.id, teamId: e.target.value || null })}>
            <option value="">move…</option>${st.teams.filter((x) => x.id !== t.id).map((x) => html`<option value=${x.id}>${x.name}</option>`)}<option value="">(no team)</option></select>
            ${m.role !== 'admin' && html`<button class="sm sec" onClick=${() => confirm('Remove ' + m.name + '?') && act('kick', { memberId: m.id })}>✕</button>`}</span>`}</div>`)}</div></div>`;
    })}</div>
    ${free.length > 0 && html`<div class="card"><h3>Not in a team yet</h3>${free.map((m) => html`<div class="row sp" key=${m.id}><span>${m.name}${m.id === st.me.id ? ' (you)' : ''}</span>
      ${admin && html`<span><select style="width:auto;padding:4px" onChange=${(e) => e.target.value && act('assign_team', { memberId: m.id, teamId: e.target.value })}>
        <option value="">assign…</option>${st.teams.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>
        ${m.role !== 'admin' && html`<button class="sm sec" onClick=${() => act('kick', { memberId: m.id })}>✕</button>`}</span>`}</div>`)}</div>`}
    ${canJoin && !mine && html`<div class="card"><h3>Create your team</h3><div class="row"><input class="grow" placeholder="Team name" value=${tn} maxlength="24" onInput=${(e) => setTn(e.target.value)} />
      <input type="color" value=${tc} onInput=${(e) => setTc(e.target.value)} /><${AsyncBtn} onClick=${async () => { if (await act('team_create', { name: tn, color: tc })) setTn(''); }}>Create<//></div></div>`}
  </div>`;
}

// ================================================================ settings editors (admin, lobby only)
function Settings({ st, act }) {
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(st.settings)));
  const [open, setOpen] = useState(false);
  useEffect(() => { setS(JSON.parse(JSON.stringify(st.settings))); }, [JSON.stringify(st.settings)]);
  const num = (k, label, unit, help) => html`<${Field} label=${label + (unit ? ` (${unit})` : '')} help=${help}><input type="number" value=${s[k]} onInput=${(e) => setS({ ...s, [k]: +e.target.value })} /><//>`;
  const chk = (k, label, help) => html`<div><label class="chk"><input type="checkbox" checked=${!!s[k]} onChange=${(e) => setS({ ...s, [k]: e.target.checked })} />${label}</label>${help && html`<div class="help">${help}</div>`}</div>`;
  const win = html`<div>${chk('useWindow', 'Use a daily play window', 'Clocks only run inside this window; outside it everybody rests (recommended for multi-day games).')}
    ${s.useWindow && html`<div class="row"><div class="grow"><label>From</label><input type="time" value=${s.window.start} onInput=${(e) => setS({ ...s, window: { ...s.window, start: e.target.value } })} /></div>
      <div class="grow"><label>Until</label><input type="time" value=${s.window.end} onInput=${(e) => setS({ ...s, window: { ...s.window, end: e.target.value } })} /></div></div>`}</div>`;
  const save = async () => {
    const { cityTerritory, muniTerritory, ...rest } = s;
    if (await act('update_settings', { settings: rest }, 'Settings saved')) return;
  };
  return html`<div class="card"><div class="row sp"><h2>⚙ Game settings</h2><button class="sm sec" onClick=${() => setOpen(!open)}>${open ? 'Hide' : 'Edit'}</button></div>
    ${!open && html`<p class="small dim">${summary(st)}</p>`}
    ${open && html`<div>
      ${st.mode === 'race' && html`<div class="grid">
        <${Field} label="Start city"><${CitySelect} value=${s.startCity} onChange=${(v) => setS({ ...s, startCity: v })} /><//>
        <${Field} label="Finish city"><${CitySelect} value=${s.finishCity} onChange=${(v) => setS({ ...s, finishCity: v })} /><//>
        ${num('requiredPerTerritory', 'Check-ins needed per territory', '', 'Bigger = longer game. With 5 territories: 2-3 ≈ 3 days, 6-8 ≈ 7-10 days.')}
        ${num('days', 'Planned days', '', 'Info only - you end the race when you like.')}
        ${num('checkinRadiusM', 'City check-in radius', 'm', 'You must be this close to the city centre.')}
        ${num('territoryBonusMin', 'First-to-clear bonus', 'min')}
        ${num('skipPenaltyMin', 'Skip-challenge penalty', 'min')}
        ${num('locDelayMin', 'Other teams\' location delay', 'min', 'Other teams see your position this many minutes late.')}</div>
        ${chk('ordered', 'Territories must be cleared in order', 'Order is shown in the list below (west → east).')}
        ${chk('challenges', 'Challenges + photo proof at each check-in')}${win}
        <${TerritoryEditor} st=${st} s=${s} setS=${setS} act=${act} />`}
      ${st.mode === 'hide' && html`<div class="grid">
        ${num('hidesPerPlayer', 'Hides per player', '', '3 players × 2 = 6 rounds (6-7 days).')}${num('hideMinutes', 'Hiding time', 'min')}
        ${num('maxSeekMinutes', 'Max seeking time', 'min', 'A round ends when this much seek time passed - the hider "wins" it.')}
        ${num('zoneRadiusM', 'Hiding zone radius', 'm')}${num('cooldownMin', 'Question cooldown', 'min')}${num('foundRadiusM', 'Found distance', 'm')}
        ${num('zonePenaltyMin', 'Leaving-the-zone penalty', 'min')}</div>
        <h3>Time credit per answered question (min)</h3><div class="grid">${Object.keys(s.costs).map((k) => html`<${Field} label=${k}><input type="number" value=${s.costs[k]} onInput=${(e) => setS({ ...s, costs: { ...s.costs, [k]: +e.target.value } })} /><//>`)}</div>`}
      ${st.mode === 'tag' && html`<div class="grid">
        ${num('days', 'Game length', 'play days', 'Counted in daily-window time.')}${num('itDelayMin', 'IT sees runners with delay', 'min')}
        ${num('tagRadiusM', 'Tag distance', 'm')}${num('immunityMin', 'Tag-back immunity', 'min')}</div>
        <${Field} label="Do runners see IT?"><select value=${s.runnersSeeIt} onChange=${(e) => setS({ ...s, runnersSeeIt: e.target.value })}><option value="live">Live</option><option value="delayed">With the same delay</option></select><//>
        ${win}${chk('allStars', '⭐ All-Stars edition (special powers)', 'Each team gets 2 random one-use powers: Ghost, Shield, Radar.')}
        ${s.allStars && html`<div class="grid">${num('ghostMin', 'Ghost duration', 'min')}${num('shieldMin', 'Shield duration', 'min')}${num('radarMin', 'Radar duration', 'min')}</div>`}`}
      <${AsyncBtn} class="block" style="margin-top:14px" onClick=${save}>Save settings<//></div>`}</div>`;
}

const summary = (st) => { const s = st.settings; if (st.mode === 'race') return `${s.requiredPerTerritory} check-ins × ${s.territories.length} territories, ${s.ordered ? 'ordered' : 'any order'}, ${s.useWindow ? s.window.start + '-' + s.window.end : 'no window'}.`;
  if (st.mode === 'hide') return `${s.hidesPerPlayer} hides each, ${s.hideMinutes} min hiding, zone ${s.zoneRadiusM} m, max ${s.maxSeekMinutes} min seeking.`;
  return `${s.days} play days, IT delay ${s.itDelayMin} min, tag ${s.tagRadiusM} m${s.allStars ? ', ⭐ All-Stars' : ''}.`; };

function CitySelect({ value, onChange }) {
  return html`<select value=${value} onChange=${(e) => onChange(e.target.value)}>${META.cities.slice().sort((a, b) => a.name.localeCompare(b.name, 'lv')).map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select>`;
}

function TerritoryEditor({ st, s, setS, act }) {
  const ts = st.settings.territories;
  const [brush, setBrush] = useState(ts[0].id);
  const colorOf = (id) => (ts.find((t) => t.id === id) || {}).color || '#777';
  const patchTerr = (territories) => act('update_settings', { settings: { territories } });
  const dis = new Set(st.settings.disabledCities);
  return html`<div><h3>Territories - tap a municipality on the map to paint it</h3>
    <div class="pill-row">${ts.map((t) => html`<button class="sm ${brush === t.id ? '' : 'sec'}" style=${brush === t.id ? { background: t.color } : { borderColor: t.color }} onClick=${() => setBrush(t.id)}>🖌 ${t.name}</button>`)}</div>
    <${LMap} cls="short" munis=${META.munis} muniColor=${(p) => colorOf(st.settings.muniTerritory[p.id])} fitKey="terr"
      onMuniClick=${(p) => act('update_settings', { settings: { muniTerritory: { [p.id]: brush } } })}
      items=${META.cities.map((c) => ({ k: 'marker', shape: 'dot', lat: c.lat, lng: c.lng, color: dis.has(c.id) ? '#555' : colorOf(st.settings.cityTerritory[c.id]), label: c.name, dim: dis.has(c.id) }))} />
    <div class="card">${ts.map((t, i) => { const cs = META.cities.filter((c) => st.settings.cityTerritory[c.id] === t.id).sort((a, b) => b.pop - a.pop);
      return html`<div key=${t.id}><div class="row"><input type="color" value=${t.color} onChange=${(e) => patchTerr(ts.map((x) => x.id === t.id ? { ...x, color: e.target.value } : x))} />
        <input class="grow" value=${t.name} onChange=${(e) => patchTerr(ts.map((x) => x.id === t.id ? { ...x, name: e.target.value } : x))} />
        <button class="sm sec" disabled=${i === 0} onClick=${() => { const a = ts.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; patchTerr(a); }}>↑</button>
        <button class="sm sec" disabled=${i === ts.length - 1} onClick=${() => { const a = ts.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; patchTerr(a); }}>↓</button>
        ${ts.length > 2 && html`<button class="sm sec" onClick=${() => patchTerr(ts.filter((x) => x.id !== t.id))}>✕</button>`}</div>
        <div class="small dim" style="margin:4px 0 10px">${cs.length} cities - tap to disable/enable as checkpoint: ${cs.map((c) => html`<button class="sm sec" style=${{ margin: '2px', opacity: dis.has(c.id) ? 0.4 : 1, textDecoration: dis.has(c.id) ? 'line-through' : '' }}
          onClick=${() => act('update_settings', { settings: { disabledCities: dis.has(c.id) ? [...dis].filter((x) => x !== c.id) : [...dis, c.id] } })}>${c.name}</button>`)}</div></div>`; })}
      ${ts.length < 8 && html`<button class="sm sec" onClick=${() => patchTerr([...ts, { id: 't' + Math.random().toString(36).slice(2, 6), name: 'New territory', color: '#888888' }])}>+ Add territory</button>`}</div></div>`;
}

// ================================================================ log + more
function LogTab({ st, code, token }) {
  const [full, setFull] = useState(null);
  const rows = (full || st.log).slice().reverse();
  return html`<div class="card"><div class="row sp"><h2>Public game log</h2>
    <span class="chip ${st.chainOk ? '' : 'tag-it'}" title="Every entry is chained to the previous one with a SHA-256 hash, so history cannot be edited secretly.">${st.chainOk ? '🔒 tamper-proof chain OK' : '⚠ chain BROKEN'}</span></div>
    <p class="small dim">Everything here is visible to everyone, including every admin override.${st.logTotal > st.log.length && !full ? '' : ''}</p>
    ${st.logTotal > st.log.length && !full && html`<button class="sm sec" onClick=${async () => setFull((await api('GET', `/games/${code}/log`, null, token)).log)}>Load all ${st.logTotal} entries</button>`}
    <div class="log list">${rows.map((e) => html`<div class=${e.type} key=${e.i}><span class="t">${fmtDateTime(e.t)}</span>${e.text}</div>`)}</div></div>`;
}

function More({ st, act, code, token }) {
  const admin = st.me.role === 'admin';
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  return html`<div>
    ${admin && html`<div class="card"><h2>🛠 Admin</h2>
      <div class="row">${st.status === 'running' && html`<button class="sec" onClick=${() => act('pause', { reason })}>⏸ Pause</button>`}
        ${st.status === 'paused' && html`<button class="good" onClick=${() => act('resume')}>▶ Resume</button>`}
        ${st.status !== 'finished' && html`<${AsyncBtn} class="danger" confirm="End the whole game now?" onClick=${() => act('end')}>⏹ End game<//>`}</div>
      <${Field} label="Pause reason (logged publicly)"><input value=${reason} onInput=${(e) => setReason(e.target.value)} maxlength="120" /><//>
      <${Field} label="Announcement to everyone"><div class="row"><input class="grow" value=${text} onInput=${(e) => setText(e.target.value)} maxlength="300" /><${AsyncBtn} onClick=${async () => { if (await act('announce', { text })) setText(''); }}>Send<//></div><//>
      <p class="help">${st.adminPlays ? 'You play too, so you cannot see secrets or judge your own team.' : 'You are a neutral referee: you can see all positions and hidden info.'} Overrides are always written to the public log.</p></div>`}
    ${st.flags.length > 0 && html`<div class="card"><h3>⚠ Possible rule breaks (speed)</h3>${st.flags.slice().reverse().map((f) => html`<div class="small warn">${fmtDateTime(f.t)} - ${f.text}</div>`)}</div>`}
    <div class="card"><h3>People</h3><div class="list">${st.members.map((m) => html`<div class="row sp" key=${m.id}><span><i class="dot" style=${{ background: m.online ? 'var(--ok)' : '#555' }}></i> ${m.name}
      ${m.teamId ? html`<${Chip} color=${(st.teams.find((t) => t.id === m.teamId) || {}).color}>${(st.teams.find((t) => t.id === m.teamId) || {}).name}<//>` : ''}</span>
      <span class="dim small">${m.role}${m.id === st.me.id ? ' · you' : ''}${m.plays ? (m.hasLoc ? ' · 📍' : ' · no GPS') : ''}</span></div>`)}</div></div>
    <div class="card"><${Rules} mode=${st.mode} /></div>
    <div class="card"><button class="sec" onClick=${() => { saved.remove(code); go('#/'); }}>Leave this game on this device</button></div>
  </div>`;
}
