import { html, useState, useEffect } from '/vendor/preact.js';
import { useGame, useClock, useLocation, useNotices, saved, api, toast, META } from './api.js';
import { AsyncBtn, Chip, Field, Switch, Seg, Modal, Ico, Empty, Mochi, fmtDateTime, copy } from './ui.js';
import { LMap } from './map.js';
import { MODES, Guide } from './guide.js';
import { ThemePicker } from './theme.js';
import { RARITY, WEIGHT_OF, rarity, effectSummary } from './cards-ui.js';
import { NotFound, go } from './home.js';
import * as race from './race.js';
import * as hide from './hide.js';
import * as tag from './tag.js';

const VIEWS = { race, hide, tag };
const ADMIN_LABEL = { player: 'Player', fair: 'Admin', full: 'Admin (all-seeing)' };

export function GamePage({ code }) {
  const g = useGame(code);
  const { st, err, conn, act, load, token } = g;
  const now = useClock(g.skew);
  const [gps, setGps] = useState(true);
  const [tab, setTab] = useState(null);
  const [modal, setModal] = useState(null);
  const [notices, dismiss] = useNotices(st);
  const sharing = !!(st && st.me.plays && st.status !== 'finished' && gps);
  const loc = useLocation(code, token, sharing);

  if (!token) { go('#/join/' + code); return null; }
  if (err === 'gone') return html`<${NotFound} what="This game does not exist any more." />`;
  if (err === 'auth') return html`<div class="wrap"><div class="card"><h2>You are signed out</h2><p class="dim">This device is not (or no longer) signed in to game ${code}. A newer admin login revokes older admin sessions.</p>
    <div class="row"><button onClick=${() => go('#/join/' + code)}>Sign back in</button><button class="ghost" onClick=${() => { saved.remove(code); go('#/'); }}>Forget game</button></div></div></div>`;
  if (!st) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /><p class="dim">${err || 'Loading...'}</p></div>`;

  const V = VIEWS[st.mode];
  const canAdmin = st.me.canAdmin;
  const modeTabs = st.status === 'lobby' ? [{ id: 'lobby', label: 'Lobby' }] : V.tabs(st);
  const tabs = [...modeTabs, ...(canAdmin ? [{ id: 'log', label: 'Log' }, { id: 'admin', label: 'Admin' }] : []), { id: 'more', label: 'More' }];
  const cur = tabs.find((t) => t.id === tab) ? tab : tabs[0].id;
  const ctx = { st, act, load, now, loc, code, token, setTab, conn, openModal: setModal };

  return html`<div>
    <div class="topbar"><div class="in">
      <div class="row sp nw"><div class="row nw" style="gap:8px"><button class="ghost icon" aria-label="Home" onClick=${() => go('#/')}><${Ico} n="back" /></button>
          <span class="name">${st.name}</span><span class="chip plain mono">${st.code}</span></div>
        <div class="row nw" style="gap:6px"><${Conn} conn=${conn} />
          ${st.me.role === 'admin' && html`<button class="soft sm" onClick=${() => setModal('mode')}>${ADMIN_LABEL[st.me.adminMode]}</button>`}
          ${st.me.plays && html`<button class="ghost sm" onClick=${() => setGps(!gps)}>${gpsLabel(gps, loc)}</button>`}
          <button class="ghost icon" aria-label="Guide" onClick=${() => setModal('guide')}><${Ico} n="book" /></button></div></div>
      <div class="tabs">${tabs.map((t) => html`<button class=${cur === t.id ? 'on' : ''} onClick=${() => setTab(t.id)} key=${t.id}>${t.label}${t.badge ? html`<span class="badge">${t.badge}</span>` : ''}</button>`)}</div>
    </div></div>
    <div class="notices">${notices.map((n) => html`<div class="notice ${n.kind}" key=${n.id} onClick=${() => dismiss(n.id)}>${n.text}</div>`)}</div>
    <div class="wrap" key=${cur}>
      ${st.me.plays && loc.status === 'error' && html`<div class="callout warn">${loc.msg}</div>`}
      ${st.me.plays && loc.status === 'denied' && html`<div class="callout warn">Location permission denied. Allow it in the browser settings or GPS checks will fail.</div>`}
      ${st.status === 'paused' && html`<div class="callout warn">The game is paused. Clocks are stopped.</div>`}
      ${st.status === 'finished' && html`<div class="callout good">The game is over.</div>`}
      ${cur === 'lobby' ? html`<${Lobby} ...${ctx} />` : cur === 'log' ? html`<${LogTab} ...${ctx} />` : cur === 'admin' ? html`<${AdminTab} ...${ctx} />`
        : cur === 'more' ? html`<${More} ...${ctx} />` : html`<${V.View} ...${ctx} tab=${cur} />`}
    </div>
    ${modal === 'guide' && html`<${Guide} mode=${st.mode} onClose=${() => setModal(null)} />`}
    ${modal === 'mode' && html`<${AdminModeModal} ...${ctx} onClose=${() => setModal(null)} />`}
    ${(modal === 'cards' || modal === 'tasks') && html`<${CatalogEditor} kind=${modal} ...${ctx} onClose=${() => setModal(null)} />`}
  </div>`;
}

const gpsLabel = (on, loc) => (!on ? 'GPS off' : loc.status === 'ok' ? `GPS ${Math.round(loc.pos.acc)} m` : loc.status === 'denied' ? 'GPS denied' : loc.status === 'error' ? 'GPS error' : 'GPS...');

function Conn({ conn }) {
  const label = { ok: 'Connected', wait: 'Connecting', off: 'Offline' }[conn];
  return html`<span class="conn ${conn}" title="Connection to the game server"><i></i>${label}</span>`;
}

// ================================================================ admin mode switch
function AdminModeModal({ st, act, onClose }) {
  const running = st.status === 'running' || st.status === 'paused';
  const opts = [
    ['player', 'Player', 'Play like everyone else. Admin controls are locked so nothing is clicked by accident.', !st.adminPlays && 'You are not a player in this game'],
    ['fair', 'Admin', 'All admin controls. You only see what a normal player or spectator sees.', null],
    ['full', 'Admin (all-seeing)', 'All admin controls and you see everything: positions, hidden info, all cards.', st.adminPlays && running && 'Locked while you play'],
  ];
  return html`<${Modal} title="Admin mode" onClose=${onClose}><div class="stack">${opts.map(([id, name, desc, lock]) => html`<button class="mode ${st.me.adminMode === id ? 'on' : ''}" disabled=${!!lock} key=${id}
    onClick=${async () => { if (await act('admin_mode', { mode: id })) onClose(); }}><span><b>${name}</b><span class="dim small">${lock || desc}</span></span></button>`)}</div><//>`;
}

// ================================================================ lobby
function Lobby(ctx) {
  const { st, act, code } = ctx;
  const admin = st.me.canAdmin;
  const players = st.members.filter((m) => m.plays);
  const specs = st.members.filter((m) => m.role === 'spectator');
  const link = `${location.origin}/#/join/${code}`;
  return html`<div class="stack">
    <div class="card accent"><div class="row sp"><div><p class="eyebrow">Game code</p><div class="mono" style="font-size:2.2rem;font-weight:800;letter-spacing:.12em">${code}</div></div>
      <div class="stack" style="gap:6px;align-items:flex-end"><span class="chip plain">${MODES[st.mode].title}</span>
        <button class="sm ghost" onClick=${() => toast(copy(link) ? 'Invite link copied' : 'Copy failed', true)}><${Ico} n="copy" size=${14} /> Copy invite link</button></div></div></div>
    ${st.mode !== 'hide' ? html`<${Teams} ...${ctx} players=${players} admin=${admin} />` : html`<div class="card"><p class="eyebrow">Players (${players.length})</p><div class="list">
      ${players.map((m) => html`<div class="row sp nw" key=${m.id}><span><b>${m.name}</b> ${m.role === 'admin' ? html`<${Chip}>admin<//>` : ''} ${m.id === st.me.id ? html`<${Chip} cls="plain">you<//>` : ''}</span>
        ${admin && m.role !== 'admin' && html`<button class="sm ghost" onClick=${() => confirm('Remove ' + m.name + '?') && act('kick', { memberId: m.id })}>Remove</button>`}</div>`)}</div></div>`}
    ${specs.length > 0 && html`<div class="card"><p class="eyebrow">Spectators</p><div class="pill-row">${specs.map((m) => html`<${Chip} cls="plain">${m.name}<//>`)}</div></div>`}
    ${admin ? html`<${Settings} ...${ctx} />
      <div class="card"><div class="row"><button class="ghost" onClick=${() => act('lock_join', { locked: !st.joinLocked })}>${st.joinLocked ? 'Unlock joining' : 'Lock joining'}</button>
        <${AsyncBtn} class="grow" onClick=${() => act('start')}>Start the game<//></div></div>`
      : html`<div class="card"><${Empty}>Waiting for the admin to start the game<//></div>`}
  </div>`;
}

function Teams({ st, act, players, admin }) {
  const [tn, setTn] = useState('');
  const [tc, setTc] = useState('#e0457b');
  const free = players.filter((m) => !m.teamId);
  const mine = st.me.teamId;
  const canJoin = st.me.plays;
  return html`<div class="stack">
    <div class="grid">${st.teams.map((t) => {
      const ms = players.filter((m) => m.teamId === t.id);
      return html`<div class="card" style=${{ borderColor: t.color, margin: 0 }} key=${t.id}><div class="row sp"><b style="font-family:var(--font-display)"><i class="dot" style=${{ background: t.color }}></i> ${t.name}</b>
        ${canJoin && mine !== t.id && html`<button class="sm" onClick=${() => act('team_join', { teamId: t.id })}>Join</button>`}
        ${mine === t.id && html`<button class="sm ghost" onClick=${() => act('team_leave')}>Leave</button>`}</div>
        <div class="list">${ms.map((m) => html`<div class="row sp nw" key=${m.id}><span>${m.name}${m.id === st.me.id ? ' (you)' : ''}</span>
          ${admin && html`<span class="row nw" style="gap:6px"><select style="width:auto;padding:5px 8px" onChange=${(e) => act('assign_team', { memberId: m.id, teamId: e.target.value || null })}>
            <option value="">Move...</option>${st.teams.filter((x) => x.id !== t.id).map((x) => html`<option value=${x.id}>${x.name}</option>`)}<option value="">No team</option></select>
            ${m.role !== 'admin' && html`<button class="sm ghost icon" aria-label="Remove" onClick=${() => confirm('Remove ' + m.name + '?') && act('kick', { memberId: m.id })}><${Ico} n="close" size=${14} /></button>`}</span>`}</div>`)}</div></div>`;
    })}</div>
    ${free.length > 0 && html`<div class="card"><p class="eyebrow">Not in a team yet</p>${free.map((m) => html`<div class="row sp nw" key=${m.id} style="padding:4px 0"><span>${m.name}${m.id === st.me.id ? ' (you)' : ''}</span>
      ${admin && html`<select style="width:auto;padding:5px 8px" onChange=${(e) => e.target.value && act('assign_team', { memberId: m.id, teamId: e.target.value })}>
        <option value="">Assign...</option>${st.teams.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>`}</div>`)}</div>`}
    ${canJoin && !mine && html`<div class="card"><p class="eyebrow">Create your team</p><div class="row nw"><input class="grow" placeholder="Team name" value=${tn} maxlength="24" onInput=${(e) => setTn(e.target.value)} />
      <input type="color" value=${tc} onInput=${(e) => setTc(e.target.value)} /><${AsyncBtn} onClick=${async () => { if (await act('team_create', { name: tn, color: tc })) setTn(''); }}>Create<//></div></div>`}
  </div>`;
}

// ================================================================ settings (admin, lobby)
function Settings({ st, act, openModal }) {
  const clone = () => { const { cards, tasks, cityTerritory, muniTerritory, ...rest } = st.settings; return JSON.parse(JSON.stringify(rest)); };
  const [s, setS] = useState(clone);
  const [open, setOpen] = useState(false);
  useEffect(() => { setS(clone()); }, [JSON.stringify(st.settings, (k, v) => (k === 'cards' || k === 'tasks' || k === 'cityTerritory' || k === 'muniTerritory' ? undefined : v))]);
  const num = (k, label) => html`<${Field} label=${label}><input type="number" value=${s[k]} onInput=${(e) => setS({ ...s, [k]: +e.target.value })} /><//>`;
  const sw = (k, label) => html`<${Switch} checked=${!!s[k]} onChange=${(v) => setS({ ...s, [k]: v })}>${label}<//>`;
  const win = html`<div>${sw('useWindow', 'Daily play window')}
    ${s.useWindow && html`<div class="row nw"><div class="grow"><label>From</label><input type="time" value=${s.window.start} onInput=${(e) => setS({ ...s, window: { ...s.window, start: e.target.value } })} /></div>
      <div class="grow"><label>Until</label><input type="time" value=${s.window.end} onInput=${(e) => setS({ ...s, window: { ...s.window, end: e.target.value } })} /></div></div>`}</div>`;
  const save = () => act('update_settings', { settings: s }, 'Settings saved');
  return html`<div class="card"><div class="row sp"><h2 style="margin:0">Game settings</h2><button class="sm ghost" onClick=${() => setOpen(!open)}>${open ? 'Hide' : 'Edit'}</button></div>
    ${open && html`<div class="stack mt">
      ${st.mode === 'race' && html`<div class="grid">
        <${Field} label="Start city"><${CitySelect} value=${s.startCity} onChange=${(v) => setS({ ...s, startCity: v })} /><//>
        <${Field} label="Finish city"><${CitySelect} value=${s.finishCity} onChange=${(v) => setS({ ...s, finishCity: v })} /><//>
        ${num('requiredPerTerritory', 'Check-ins per territory')}${num('days', 'Planned days')}${num('checkinRadiusM', 'Check-in radius (m)')}
        ${num('territoryBonusMin', 'First-to-clear bonus (min)')}${num('skipPenaltyMin', 'Skip penalty (min)')}${num('locDelayMin', 'Other teams see you after (min)')}</div>
        ${sw('ordered', 'Territories open in order')}${sw('tasksEnabled', 'Tasks and cards')}${win}
        <div class="row"><button class="soft" onClick=${() => openModal('tasks')}>Edit tasks (${st.settings.tasks.length})</button><button class="soft" onClick=${() => openModal('cards')}>Edit cards (${st.settings.cards.length})</button></div>
        <${TerritoryEditor} st=${st} act=${act} />`}
      ${st.mode === 'hide' && html`<div class="grid">${num('hidesPerPlayer', 'Hides per player')}${num('hideMinutes', 'Hiding time (min)')}${num('zoneRadiusM', 'Zone radius (m)')}
        ${num('cooldownMin', 'Question cooldown (min)')}${num('reactSec', 'Hider reaction time (s)')}${num('handLimit', 'Hand limit')}${num('zonePenaltyMin', 'Leaving-zone penalty (min)')}</div>
        <div class="row"><button class="soft" onClick=${() => openModal('cards')}>Edit cards (${st.settings.cards.length})</button></div>`}
      ${st.mode === 'tag' && html`<div class="grid">${num('days', 'Game length (play days)')}${num('cooldownMin', 'Tagger cooldown (min)')}</div>
        ${sw('runnersSeeIt', 'Do runners see IT?')}${win}${sw('allStars', 'All-Stars edition')}
        ${s.allStars && html`<div class="grid">${num('ghostMin', 'Ghost (min)')}${num('shieldMin', 'Shield (min)')}${num('radarMin', 'Radar (min)')}</div>`}`}
      <${AsyncBtn} class="block" onClick=${save}>Save settings<//></div>`}</div>`;
}

function CitySelect({ value, onChange }) {
  return html`<select value=${value} onChange=${(e) => onChange(e.target.value)}>${META.cities.slice().sort((a, b) => a.name.localeCompare(b.name, 'lv')).map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select>`;
}

function TerritoryEditor({ st, act }) {
  const ts = st.settings.territories;
  const [brush, setBrush] = useState(ts[0].id);
  const colorOf = (id) => (ts.find((t) => t.id === id) || {}).color || '#777';
  const patchTerr = (territories) => act('update_settings', { settings: { territories } });
  const dis = new Set(st.settings.disabledCities);
  return html`<div><p class="eyebrow">Territories: pick a brush, tap municipalities</p>
    <div class="pill-row">${ts.map((t) => html`<button class="sm ${brush === t.id ? '' : 'ghost'}" style=${brush === t.id ? { background: t.color, boxShadow: 'none' } : { borderColor: t.color }} onClick=${() => setBrush(t.id)}>${t.name}</button>`)}</div>
    <div class="mt"><${LMap} cls="short" munis=${META.munis} muniColor=${(p) => colorOf(st.settings.muniTerritory[p.id])} fitKey="terr"
      onMuniClick=${(p) => act('update_settings', { settings: { muniTerritory: { [p.id]: brush } } })}
      items=${META.cities.map((c) => ({ k: 'marker', shape: 'dot', lat: c.lat, lng: c.lng, color: dis.has(c.id) ? '#777' : colorOf(st.settings.cityTerritory[c.id]), label: c.name, dim: dis.has(c.id) }))} /></div>
    <div class="card flat">${ts.map((t, i) => { const cs = META.cities.filter((c) => st.settings.cityTerritory[c.id] === t.id).sort((a, b) => b.pop - a.pop);
      return html`<div key=${t.id}><div class="row nw"><input type="color" value=${t.color} onChange=${(e) => patchTerr(ts.map((x) => x.id === t.id ? { ...x, color: e.target.value } : x))} />
        <input class="grow" value=${t.name} onChange=${(e) => patchTerr(ts.map((x) => x.id === t.id ? { ...x, name: e.target.value } : x))} />
        <button class="sm ghost icon" disabled=${i === 0} aria-label="Up" onClick=${() => { const a = ts.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; patchTerr(a); }}>&uarr;</button>
        <button class="sm ghost icon" disabled=${i === ts.length - 1} aria-label="Down" onClick=${() => { const a = ts.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; patchTerr(a); }}>&darr;</button>
        ${ts.length > 2 && html`<button class="sm ghost icon" aria-label="Remove" onClick=${() => patchTerr(ts.filter((x) => x.id !== t.id))}><${Ico} n="close" size=${14} /></button>`}</div>
        <div class="small dim" style="margin:6px 0 14px">${cs.length} cities. Tap to switch a checkpoint off or on: ${cs.map((c) => html`<button class="sm ghost" style=${{ margin: '3px', opacity: dis.has(c.id) ? 0.4 : 1, textDecoration: dis.has(c.id) ? 'line-through' : '' }}
          onClick=${() => act('update_settings', { settings: { disabledCities: dis.has(c.id) ? [...dis].filter((x) => x !== c.id) : [...dis, c.id] } })}>${c.name}</button>`)}</div></div>`; })}
      ${ts.length < 8 && html`<button class="sm soft" onClick=${() => patchTerr([...ts, { id: 't' + Math.random().toString(36).slice(2, 6), name: 'New territory', color: '#888888' }])}>Add territory</button>`}</div></div>`;
}

// ================================================================ cards / tasks editor
function CatalogEditor({ kind, st, act, onClose }) {
  const isCards = kind === 'cards';
  const effects = META.effects[st.mode] || {};
  const blank = () => (isCards ? { name: '', desc: '', weight: 3, effect: { type: 'text' } } : { title: '', desc: '', difficulty: 1 });
  const [items, setItems] = useState(() => JSON.parse(JSON.stringify(st.settings[kind])));
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState(null);
  const startEdit = (i) => { setEdit(i); setDraft(i === 'new' ? blank() : JSON.parse(JSON.stringify(items[i]))); };
  const commit = () => {
    if (!(isCards ? draft.name : draft.title).trim()) return toast('Give it a name');
    setItems(edit === 'new' ? [...items, draft] : items.map((x, i) => (i === edit ? draft : x)));
    setEdit(null);
  };
  const setType = (type) => {
    const spec = effects[type];
    const e = { type };
    Object.entries(spec.params).forEach(([p, r]) => { e[p] = r[2]; });
    setDraft({ ...draft, effect: e });
  };
  const form = () => {
    if (!isCards) return html`<div>
      <${Field} label="Title"><input value=${draft.title} maxlength="60" onInput=${(e) => setDraft({ ...draft, title: e.target.value })} /><//>
      <${Field} label="How to do it"><textarea maxlength="600" value=${draft.desc} onInput=${(e) => setDraft({ ...draft, desc: e.target.value })}></textarea><//>
      <${Field} label="Difficulty (= card picks)"><select value=${draft.difficulty} onChange=${(e) => setDraft({ ...draft, difficulty: +e.target.value })}>${[1, 2, 3, 4, 5, 6].map((n) => html`<option value=${n}>${n} - ${n} pick${n > 1 ? 's' : ''}</option>`)}</select><//></div>`;
    const spec = effects[draft.effect.type] || { params: {} };
    return html`<div>
      <${Field} label="Name"><input value=${draft.name} maxlength="40" onInput=${(e) => setDraft({ ...draft, name: e.target.value })} /><//>
      <${Field} label="Description (shown to everyone it affects)"><textarea maxlength="240" value=${draft.desc} onInput=${(e) => setDraft({ ...draft, desc: e.target.value })}></textarea><//>
      <${Field} label="What it does"><select value=${draft.effect.type} onChange=${(e) => setType(e.target.value)}>${Object.entries(effects).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select><//>
      ${Object.entries(spec.params).map(([p, r]) => html`<${Field} label=${p === 'min' ? 'Minutes' : p === 'n' ? 'Amount' : p === 'draw' ? 'Cards to draw' : p}><input type="number" min=${r[0]} max=${r[1]} value=${draft.effect[p]} onInput=${(e) => setDraft({ ...draft, effect: { ...draft.effect, [p]: +e.target.value } })} /><//>`)}
      ${st.mode === 'race' && draft.effect.type === 'text' && html`<${Switch} checked=${!!draft.effect.target} onChange=${(v) => setDraft({ ...draft, effect: { ...draft.effect, target: v } })}>Aimed at another team<//>`}
      <${Field} label="Rarity"><${Seg} options=${[[1, 'Common'], [2, 'Uncommon'], [3, 'Rare']]} value=${rarity(draft.weight)} onChange=${(r) => setDraft({ ...draft, weight: WEIGHT_OF[r] })} /><//></div>`;
  };
  const label = (it) => (isCards ? it.name : it.title);
  const meta = (it) => (isCards ? `${effectSummary(st.mode, it.effect)} - ${RARITY[rarity(it.weight)]}` : `Difficulty ${it.difficulty}`);
  return html`<${Modal} title=${isCards ? 'Cards' : 'Tasks'} onClose=${onClose} wide=${true}>
    <div class="row sp" style="margin-bottom:8px"><span class="dim small">${items.length} ${kind}</span>
      <span class="row"><button class="sm soft" onClick=${() => startEdit('new')}><${Ico} n="plus" size=${14} /> Add</button>
      <button class="sm ghost" onClick=${() => { if (confirm('Replace everything with the defaults?')) act('edit_catalog', { kind, reset: true }, 'Reset to defaults').then(onClose); }}>Reset to defaults</button></span></div>
    ${edit !== null && html`<div class="card accent flat">${form()}<div class="row mt"><button onClick=${commit}>${edit === 'new' ? 'Add' : 'Done'}</button><button class="ghost" onClick=${() => setEdit(null)}>Cancel</button></div></div>`}
    <div class="list">${items.map((it, i) => html`<div class="row sp nw" key=${i}><div class="grow"><b>${label(it)}</b><div class="small dim">${meta(it)}</div></div>
      <button class="sm ghost icon" aria-label="Edit" onClick=${() => startEdit(i)}><${Ico} n="edit" size=${15} /></button>
      <button class="sm ghost icon" aria-label="Delete" onClick=${() => setItems(items.filter((_, j) => j !== i))}><${Ico} n="trash" size=${15} /></button></div>`)}</div>
    <${AsyncBtn} class="block mt" onClick=${async () => { if (await act('edit_catalog', { kind, items }, 'Saved')) onClose(); }}>Save changes<//>
  <//>`;
}

// ================================================================ admin / log / more
function AdminTab({ st, act, code, openModal }) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [showKey, setShowKey] = useState(false);
  const key = (saved.get(code) || {}).adminKey;
  return html`<div class="stack">
    <div class="card"><p class="eyebrow">Mode</p><div class="row sp"><div><b>${ADMIN_LABEL[st.me.adminMode]}</b><div class="small dim">${{ fair: 'You see what a player sees', full: 'You see everything', player: '' }[st.me.adminMode]}</div></div>
      <button class="soft" onClick=${() => openModal('mode')}>Change</button></div></div>
    <div class="card"><p class="eyebrow">Game</p><div class="row">
      ${st.status === 'running' && html`<button class="ghost" onClick=${() => act('pause', { reason })}>Pause</button>`}
      ${st.status === 'paused' && html`<button class="good-btn" onClick=${() => act('resume')}>Resume</button>`}
      ${st.status !== 'finished' && html`<${AsyncBtn} class="danger" confirm="End the whole game now?" onClick=${() => act('end')}>End game<//>`}</div>
      <${Field} label="Pause reason"><input value=${reason} onInput=${(e) => setReason(e.target.value)} maxlength="120" /><//>
      <${Field} label="Announcement to everyone"><div class="row nw"><input class="grow" value=${text} onInput=${(e) => setText(e.target.value)} maxlength="300" /><${AsyncBtn} onClick=${async () => { if (await act('announce', { text })) setText(''); }}>Send<//></div><//></div>
    ${st.mode !== 'tag' && html`<div class="card"><p class="eyebrow">Edit anytime</p><div class="row">
      ${st.mode === 'race' && html`<button class="soft" onClick=${() => openModal('tasks')}>Tasks (${st.settings.tasks.length})</button>`}
      <button class="soft" onClick=${() => openModal('cards')}>Cards (${st.settings.cards.length})</button></div></div>`}
    ${key && html`<div class="card"><p class="eyebrow">Admin key</p><div class="row sp"><span class="mono">${showKey ? key : '****-****-****-****'}</span><button class="sm ghost" onClick=${() => setShowKey(!showKey)}>${showKey ? 'Hide' : 'Show'}</button></div></div>`}
    ${(st.flags || []).length > 0 && html`<div class="card"><p class="eyebrow">Possible rule breaks</p>${st.flags.slice().reverse().map((f) => html`<div class="small warn" key=${f.t}>${fmtDateTime(f.t)} - ${f.text}</div>`)}</div>`}
  </div>`;
}

function LogTab({ st, code, token }) {
  const [full, setFull] = useState(null);
  const rows = (full || st.log || []).slice().reverse();
  return html`<div class="card"><div class="row sp"><h2 style="margin:0">Event log</h2>
    <span class="chip ${st.chainOk ? 'good' : 'bad'}" title="Every entry carries the hash of the previous one, so history cannot be edited unnoticed.">${st.chainOk ? 'Tamper-proof chain OK' : 'Chain broken'}</span></div>
    ${st.logTotal > (st.log || []).length && !full && html`<button class="sm ghost mt" onClick=${async () => setFull((await api('GET', `/games/${code}/log`, null, token)).log)}>Load all ${st.logTotal} entries</button>`}
    <div class="log list mt">${rows.map((e) => html`<div class=${e.type} key=${e.i}><span class="t">${fmtDateTime(e.t)}</span>${e.text}</div>`)}</div></div>`;
}

function More({ st, code, openModal }) {
  const [theme, setTheme] = useState(0);
  return html`<div class="stack">
    <div class="card"><p class="eyebrow">People</p><div class="list">${st.members.map((m) => { const t = st.teams.find((x) => x.id === m.teamId);
      return html`<div class="row sp nw" key=${m.id}><span><i class="dot" style=${{ background: m.online ? 'var(--good)' : 'var(--line2)' }}></i> ${m.name} ${t ? html`<${Chip} color=${t.color}>${t.name}<//>` : ''}</span>
        <span class="dim small">${m.role}${m.id === st.me.id ? ', you' : ''}${m.plays && st.status !== 'lobby' ? (m.hasLoc ? ', GPS' : ', no GPS') : ''}</span></div>`; })}</div></div>
    <div class="card"><p class="eyebrow">Theme</p><${ThemePicker} onPick=${() => setTheme(theme + 1)} /></div>
    <div class="card"><div class="row"><button class="ghost" onClick=${() => openModal('guide')}>How to play</button>
      <button class="ghost" onClick=${() => { saved.remove(code); go('#/'); }}>Leave this game on this device</button></div></div>
  </div>`;
}
