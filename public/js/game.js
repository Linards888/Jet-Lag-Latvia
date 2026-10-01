import { html, useState, useEffect } from '/vendor/preact.js';
import { useGame, useClock, useLocation, useNotices, saved, toast, META, useGeo, pushStatus, refreshPush, enablePush } from './api.js';
import { t, tx, noticeText } from './i18n.js';
import { AsyncBtn, Chip, Field, Switch, Seg, Modal, Ico, Empty, Mochi, copy } from './ui.js';
import { LMap } from './map.js';
import { WEIGHT_OF, rarity, effectSummary } from './cards-ui.js';
import { NotFound, go } from './home.js';
import { SettingsModal } from './settings.js';
import * as race from './race.js';
import * as hide from './hide.js';
import * as tag from './tag.js';

const PAGES = { race, hide, tag };

export function GamePage({ code }) {
  const g = useGame(code);
  const { st, err, conn, act, load, token } = g;
  const now = useClock(g.skew);
  const [gps, setGps] = useState(true);
  const [modal, setModal] = useState(null);
  const [notices, dismiss] = useNotices(st);
  const sharing = !!(st && st.me.plays && st.status !== 'finished' && gps);
  const loc = useLocation(code, token, sharing);
  useEffect(() => { if (token) refreshPush(code, token); }, [code, token]);

  if (!token) { go('#/join/' + code); return null; }
  if (err === 'gone') return html`<${NotFound} what=${t('nf.game_gone')} />`;
  if (err === 'auth') return html`<div class="wrap"><div class="card"><h2>${t('signedout.title')}</h2><p class="dim">${t('signedout.body', { code })}</p>
    <div class="row"><button onClick=${() => go('#/join/' + code)}>${t('signedout.back')}</button><button class="ghost" onClick=${() => { saved.remove(code); go('#/'); }}>${t('forget')}</button></div></div></div>`;
  if (!st) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /><p class="dim">${err || t('loading')}</p></div>`;

  const P = PAGES[st.mode];
  const ctx = { st, act, load, now, loc, code, token, conn, openModal: setModal };

  return html`<div>
    <div class="topbar"><div class="in">
      <div class="left"><button class="ghost icon" aria-label=${t('home')} onClick=${() => go('#/')}><${Ico} n="back" /></button><span class="name">${st.name}</span><span class="chip plain mono">${st.code}</span></div>
      <div class="right"><${Conn} conn=${conn} />
        ${st.me.role === 'admin' && html`<button class="soft sm" onClick=${() => setModal('mode')}>${t('adminmode.short.' + st.me.adminMode)}</button>`}
        ${st.me.plays && html`<button class="ghost sm" onClick=${() => setGps(!gps)}>${gpsLabel(gps, loc)}</button>`}
        <button class="ghost icon" aria-label=${t('settings')} onClick=${() => setModal('settings')}><${Ico} n="gear" /></button></div>
    </div></div>
    <div class="notices">${notices.map((n) => html`<div class="notice ${n.kind}" key=${n.id} onClick=${() => dismiss(n.id)}>${noticeText(n)}</div>`)}</div>
    <div class="wrap"><div class="stack">
      <${PushBanner} code=${code} token=${token} plays=${st.me.plays} />
      ${st.me.plays && loc.status === 'error' && html`<div class="callout warn">${t('gps.err_' + loc.msg)}</div>`}
      ${st.me.plays && loc.status === 'denied' && html`<div class="callout warn">${t('gps.denied_msg')}</div>`}
      ${st.status === 'paused' && html`<div class="callout warn">${t('paused_msg')}</div>`}
      ${st.status === 'finished' && html`<div class="callout good">${t('finished_msg')}</div>`}
      ${st.status === 'lobby' ? html`<${Lobby} ...${ctx} />` : html`<${P.Page} ...${ctx} />`}
    </div></div>
    ${modal === 'settings' && html`<${SettingsModal} game=${ctx} onClose=${() => setModal(null)} />`}
    ${modal === 'mode' && html`<${AdminModeModal} ...${ctx} onClose=${() => setModal(null)} />`}
    ${(modal === 'cards' || modal === 'tasks') && html`<${CatalogEditor} kind=${modal} ...${ctx} onClose=${() => setModal(null)} />`}
  </div>`;
}

const gpsLabel = (on, loc) => (!on ? t('gps.off') : loc.status === 'ok' ? t('gps.chip', { m: Math.round(loc.pos.acc) }) : loc.status === 'denied' ? t('gps.denied') : loc.status === 'error' ? t('gps.error') : t('gps.wait_chip'));

function Conn({ conn }) {
  return html`<span class="conn ${conn}" title=${t('conn.title')}><i></i><span>${t('conn.' + conn)}</span></span>`;
}

// one-time nudge to turn on phone notifications (needs a tap: browsers do not allow auto-prompts)
function PushBanner({ code, token, plays }) {
  const [s, setS] = useState(null);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('jll.pushdismiss') === '1'; } catch { return false; } });
  useEffect(() => { pushStatus().then(setS); }, []);
  if (hidden || !plays || !s || !s.supported || s.permission !== 'default') return null;
  return html`<div class="callout" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>${t('notify.banner')}</span>
    <span class="row"><${AsyncBtn} class="sm" onClick=${async () => { try { await enablePush(code, token); toast(t('notify.enabled'), true); } catch (e) { toast(e.message === 'denied' ? t('notify.denied') : e.message); } setS(await pushStatus()); }}>${t('notify.turn_on')}<//>
      <button class="sm ghost" onClick=${() => { setHidden(true); try { localStorage.setItem('jll.pushdismiss', '1'); } catch {} }}>${t('later')}</button></span></div>`;
}

// ================================================================ admin mode switch
function AdminModeModal({ st, act, onClose }) {
  const running = st.status === 'running' || st.status === 'paused';
  const opts = [
    ['player', !st.adminPlays && t('adminmode.not_player')],
    ['fair', null],
    ['full', st.adminPlays && running && t('adminmode.locked')],
  ];
  return html`<${Modal} title=${t('admin.mode')} onClose=${onClose}><div class="stack">${opts.map(([id, lock]) => html`<button class="mode ${st.me.adminMode === id ? 'on' : ''}" disabled=${!!lock} key=${id}
    onClick=${async () => { if (await act('admin_mode', { mode: id })) onClose(); }}><span><b>${t('adminmode.' + id)}</b><span class="dim small">${lock || t('adminmode.' + id + '.d')}</span></span></button>`)}</div><//>`;
}

// ================================================================ lobby
function Lobby(ctx) {
  const { st, act, code } = ctx;
  const admin = st.me.canAdmin;
  const players = st.members.filter((m) => m.plays);
  const specs = st.members.filter((m) => m.role === 'spectator');
  const link = `${location.origin}/#/join/${code}`;
  return html`<div class="stack">
    <section class="card accent"><div class="row sp"><div><p class="eyebrow">${t('lobby.code')}</p><div class="mono" style="font-size:2.2rem;font-weight:800;letter-spacing:.12em">${code}</div></div>
      <div class="stack" style="gap:6px;align-items:flex-end"><span class="chip plain">${t('mode.' + st.mode + '.title')}</span>
        <button class="sm ghost" onClick=${() => toast(copy(link) ? t('lobby.link_copied') : t('copy_failed'), true)}><${Ico} n="copy" size=${14} /> ${t('lobby.copy_link')}</button></div></div></section>
    ${st.mode !== 'hide' ? html`<${Teams} ...${ctx} players=${players} admin=${admin} />` : html`<section class="card"><p class="eyebrow">${t('lobby.players', { n: players.length })}</p><div class="list">
      ${players.map((m) => html`<div class="row sp nw" key=${m.id}><span><b>${m.name}</b> ${m.role === 'admin' ? html`<${Chip}>${t('role.admin')}<//>` : ''} ${m.id === st.me.id ? html`<${Chip} cls="plain">${t('you')}<//>` : ''}</span>
        ${admin && m.role !== 'admin' && html`<button class="sm ghost" onClick=${() => confirm(t('lobby.remove_confirm', { name: m.name })) && act('kick', { memberId: m.id })}>${t('remove')}</button>`}</div>`)}</div>
      <p class="small dim">${t('lobby.hide_rounds', { n: players.length * st.settings.hidesPerPlayer })}</p></section>`}
    ${specs.length > 0 && html`<section class="card"><p class="eyebrow">${t('lobby.spectators')}</p><div class="pill-row">${specs.map((m) => html`<${Chip} cls="plain">${m.name}<//>`)}</div></section>`}
    ${admin ? html`<${LobbySettings} ...${ctx} />
      <section class="card"><div class="row"><button class="ghost" onClick=${() => act('lock_join', { locked: !st.joinLocked })}>${st.joinLocked ? t('lobby.unlock') : t('lobby.lock')}</button>
        <${AsyncBtn} class="grow" onClick=${() => act('start')}>${t('lobby.start')}<//></div></section>`
      : html`<section class="card"><${Empty}>${t('lobby.waiting')}<//></section>`}
  </div>`;
}

function Teams({ st, act, players, admin }) {
  const [tn, setTn] = useState('');
  const [tc, setTc] = useState('#e0457b');
  const free = players.filter((m) => !m.teamId);
  const mine = st.me.teamId;
  const canJoin = st.me.plays;
  return html`<div class="stack">
    <div class="grid">${st.teams.map((tm) => {
      const ms = players.filter((m) => m.teamId === tm.id);
      return html`<section class="card" style=${{ borderColor: tm.color, margin: 0 }} key=${tm.id}><div class="row sp"><b style="font-family:var(--font-d)"><i class="dot" style=${{ background: tm.color }}></i> ${tm.name}</b>
        ${canJoin && mine !== tm.id && html`<button class="sm" onClick=${() => act('team_join', { teamId: tm.id })}>${t('join_team')}</button>`}
        ${mine === tm.id && html`<button class="sm ghost" onClick=${() => act('team_leave')}>${t('leave_team')}</button>`}</div>
        <div class="list">${ms.map((m) => html`<div class="row sp nw" key=${m.id}><span>${m.name}${m.id === st.me.id ? ' (' + t('you') + ')' : ''}</span>
          ${admin && html`<span class="row nw" style="gap:6px"><select style="width:auto;padding:5px 8px" onChange=${(e) => act('assign_team', { memberId: m.id, teamId: e.target.value || null })}>
            <option value="">${t('lobby.move')}</option>${st.teams.filter((x) => x.id !== tm.id).map((x) => html`<option value=${x.id}>${x.name}</option>`)}<option value="">${t('lobby.no_team')}</option></select>
            ${m.role !== 'admin' && html`<button class="sm ghost icon" aria-label=${t('remove')} onClick=${() => confirm(t('lobby.remove_confirm', { name: m.name })) && act('kick', { memberId: m.id })}><${Ico} n="close" size=${14} /></button>`}</span>`}</div>`)}</div></section>`;
    })}</div>
    ${free.length > 0 && html`<section class="card"><p class="eyebrow">${t('lobby.no_team_yet')}</p>${free.map((m) => html`<div class="row sp nw" key=${m.id} style="padding:4px 0"><span>${m.name}${m.id === st.me.id ? ' (' + t('you') + ')' : ''}</span>
      ${admin && html`<select style="width:auto;padding:5px 8px" onChange=${(e) => e.target.value && act('assign_team', { memberId: m.id, teamId: e.target.value })}>
        <option value="">${t('lobby.assign')}</option>${st.teams.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>`}</div>`)}</section>`}
    ${canJoin && !mine && html`<section class="card"><p class="eyebrow">${t('lobby.create_team')}</p><div class="row nw"><input class="grow" placeholder=${t('lobby.team_name')} value=${tn} maxlength="24" onInput=${(e) => setTn(e.target.value)} />
      <input type="color" value=${tc} onInput=${(e) => setTc(e.target.value)} /><${AsyncBtn} onClick=${async () => { if (await act('team_create', { name: tn, color: tc })) setTn(''); }}>${t('create')}<//></div></section>`}
  </div>`;
}

// ================================================================ lobby settings (admin)
const HEAVY = ['cards', 'tasks', 'cityTerritory', 'muniTerritory'];

function LobbySettings({ st, act, openModal }) {
  const clone = () => { const o = JSON.parse(JSON.stringify(st.settings)); HEAVY.forEach((k) => delete o[k]); return o; };
  const [s, setS] = useState(clone);
  const [open, setOpen] = useState(false);
  const sig = JSON.stringify(st.settings, (k, v) => (HEAVY.includes(k) ? undefined : v));
  useEffect(() => { setS(clone()); }, [sig]);
  const num = (k, label) => html`<${Field} label=${label}><input type="number" inputmode="decimal" value=${s[k]} onInput=${(e) => setS({ ...s, [k]: +e.target.value })} /><//>`;
  const sw = (k, label) => html`<${Switch} checked=${!!s[k]} onChange=${(v) => setS({ ...s, [k]: v })}>${label}<//>`;
  const win = html`<div>${sw('useWindow', t('set.window'))}
    ${s.useWindow && html`<div class="row nw"><div class="grow"><label>${t('set.from')}</label><input type="time" value=${s.window.start} onInput=${(e) => setS({ ...s, window: { ...s.window, start: e.target.value } })} /></div>
      <div class="grow"><label>${t('set.until')}</label><input type="time" value=${s.window.end} onInput=${(e) => setS({ ...s, window: { ...s.window, end: e.target.value } })} /></div></div>`}</div>`;
  const editors = (tasks, cardsToo) => html`<div class="row">${tasks && html`<button class="soft" onClick=${() => openModal('tasks')}>${t('admin.tasks', { n: st.settings.tasks.length })}</button>`}${cardsToo && html`<button class="soft" onClick=${() => openModal('cards')}>${t('admin.cards', { n: st.settings.cards.length })}</button>`}</div>`;
  return html`<section class="card"><div class="sec-h"><h2>${t('set.title')}</h2><button class="sm ghost" onClick=${() => setOpen(!open)}>${open ? t('hide_') : t('edit')}</button></div>
    ${open && html`<div class="stack">
      ${st.mode === 'race' && html`<div class="grid">
        <${Field} label=${t('set.start_city')}><${CitySelect} value=${s.startCity} onChange=${(v) => setS({ ...s, startCity: v })} /><//>
        <${Field} label=${t('set.finish_city')}><${CitySelect} value=${s.finishCity} onChange=${(v) => setS({ ...s, finishCity: v })} /><//>
        ${num('territoryBonusMin', t('set.first_bonus'))}${num('taskSlots', t('set.task_slots'))}${num('handLimit', t('set.hand_limit'))}${num('days', t('set.days'))}</div>
        ${sw('ordered', t('set.ordered'))}${sw('tasksEnabled', t('set.tasks_cards'))}${sw('requireProof', t('set.require_proof'))}${win}
        ${editors(true, true)}<${TerritoryEditor} st=${st} act=${act} />`}
      ${st.mode === 'hide' && html`<div class="grid">${num('hidesPerPlayer', t('set.hides_per'))}${num('hideMinutes', t('set.hide_minutes'))}${num('zoneRadiusM', t('set.zone_radius'))}
        ${num('reactSec', t('set.react'))}${num('handLimit', t('set.hand_limit'))}</div>${sw('zoneAlerts', t('set.zone_alerts'))}${editors(false, true)}`}
      ${st.mode === 'tag' && html`<div class="grid">${num('days', t('set.days_play'))}${num('cooldownMin', t('set.tagger_cooldown'))}</div>
        ${sw('runnersSeeIt', t('set.runners_see_it'))}${win}${sw('allStars', t('set.allstars'))}
        ${s.allStars && html`<div class="grid">${num('ghostMin', t('shop.ghost'))}${num('shieldMin', t('shop.shield'))}${num('radarMin', t('shop.radar'))}</div>`}
        ${sw('economy', t('set.economy'))}
        ${s.economy && html`<div class="grid">${num('destCount', t('set.dest_count'))}${num('destReward', t('set.dest_reward'))}${num('taskSlots', t('set.task_slots'))}${num('taskPayout', t('set.task_payout'))}
          ${num('peekMin', t('shop.peek'))}${num('freezeItMin', t('shop.freeze_it'))}${num('timeCutMin', t('shop.time_cut'))}</div>${sw('requireProof', t('set.require_proof'))}
          <p class="eyebrow">${t('set.prices')}</p><div class="grid">${META.shop.map((id) => html`<${Field} label=${t('shop.' + id)}><input type="number" value=${s.prices[id]} onInput=${(e) => setS({ ...s, prices: { ...s.prices, [id]: +e.target.value } })} /><//>`)}</div>${editors(true, false)}`}`}
      <${AsyncBtn} class="block" onClick=${() => act('update_settings', { settings: s }, t('set.saved'))}>${t('set.save')}<//></div>`}</section>`;
}

function CitySelect({ value, onChange }) {
  return html`<select value=${value} onChange=${(e) => onChange(e.target.value)}>${META.cities.slice().sort((a, b) => a.name.localeCompare(b.name, 'lv')).map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select>`;
}

function TerritoryEditor({ st, act }) {
  const geo = useGeo();
  const ts = st.settings.territories;
  const [brush, setBrush] = useState(ts[0].id);
  const colorOf = (id) => (ts.find((x) => x.id === id) || {}).color || '#777';
  const patchTerr = (territories) => act('update_settings', { settings: { territories } });
  const dis = new Set(st.settings.disabledCities);
  return html`<div><p class="eyebrow">${t('terr.title')}</p>
    <div class="pill-row">${ts.map((x) => html`<button class="sm ${brush === x.id ? '' : 'ghost'}" style=${brush === x.id ? { background: x.color, boxShadow: 'none', color: '#fff' } : { borderColor: x.color }} onClick=${() => setBrush(x.id)} key=${x.id}>${x.name}</button>`)}</div>
    <div class="mt"><${LMap} cls="short" munis=${geo} muniColor=${(p) => colorOf(st.settings.muniTerritory[p.id])} fitKey="terr"
      onMuniClick=${(p) => act('update_settings', { settings: { muniTerritory: { [p.id]: brush } } })}
      items=${META.cities.map((c) => ({ k: 'marker', shape: 'dot', lat: c.lat, lng: c.lng, color: dis.has(c.id) ? '#777' : colorOf(st.settings.cityTerritory[c.id]), label: c.name, dim: dis.has(c.id) }))} /></div>
    <div class="card flat">${ts.map((x, i) => { const cs = META.cities.filter((c) => st.settings.cityTerritory[c.id] === x.id).sort((a, b) => b.pop - a.pop);
      return html`<div key=${x.id}><div class="row nw"><input type="color" value=${x.color} onChange=${(e) => patchTerr(ts.map((y) => y.id === x.id ? { ...y, color: e.target.value } : y))} />
        <input class="grow" value=${x.name} onChange=${(e) => patchTerr(ts.map((y) => y.id === x.id ? { ...y, name: e.target.value } : y))} />
        <button class="sm ghost icon" disabled=${i === 0} aria-label="Up" onClick=${() => { const a = ts.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; patchTerr(a); }}>&uarr;</button>
        <button class="sm ghost icon" disabled=${i === ts.length - 1} aria-label="Down" onClick=${() => { const a = ts.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; patchTerr(a); }}>&darr;</button>
        ${ts.length > 2 && html`<button class="sm ghost icon" aria-label=${t('remove')} onClick=${() => patchTerr(ts.filter((y) => y.id !== x.id))}><${Ico} n="close" size=${14} /></button>`}</div>
        <div class="small dim" style="margin:6px 0 14px">${t('terr.cities', { n: cs.length })} ${cs.map((c) => html`<button class="sm ghost" key=${c.id} style=${{ margin: '3px', opacity: dis.has(c.id) ? 0.4 : 1, textDecoration: dis.has(c.id) ? 'line-through' : '' }}
          onClick=${() => act('update_settings', { settings: { disabledCities: dis.has(c.id) ? [...dis].filter((y) => y !== c.id) : [...dis, c.id] } })}>${c.name}</button>`)}</div></div>`; })}
      ${ts.length < 8 && html`<button class="sm soft" onClick=${() => patchTerr([...ts, { id: 't' + Math.random().toString(36).slice(2, 6), name: t('terr.new'), color: '#888888' }])}>${t('terr.add')}</button>`}</div></div>`;
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
    if (!(isCards ? draft.name : draft.title).trim()) return toast(t('ed.need_name'));
    const d = { ...draft };  // the server drops built-in translations when a default item's text was edited
    setItems(edit === 'new' ? [...items, d] : items.map((x, i) => (i === edit ? d : x)));
    setEdit(null);
  };
  const setType = (type) => { const spec = effects[type]; const e = { type }; Object.entries(spec.params).forEach(([p, r]) => { e[p] = r[2]; }); setDraft({ ...draft, effect: e }); };
  const form = () => {
    if (!isCards) return html`<div>
      <${Field} label=${t('ed.title')}><input value=${draft.title} maxlength="60" onInput=${(e) => setDraft({ ...draft, title: e.target.value })} /><//>
      <${Field} label=${t('ed.how')}><textarea maxlength="600" value=${draft.desc} onInput=${(e) => setDraft({ ...draft, desc: e.target.value })}></textarea><//>
      <${Field} label=${t('ed.difficulty')}><select value=${draft.difficulty} onChange=${(e) => setDraft({ ...draft, difficulty: +e.target.value })}>${[1, 2, 3, 4, 5, 6].map((n) => html`<option value=${n}>${n}</option>`)}</select><//></div>`;
    const spec = effects[draft.effect.type] || { params: {} };
    return html`<div>
      <${Field} label=${t('ed.name')}><input value=${draft.name} maxlength="40" onInput=${(e) => setDraft({ ...draft, name: e.target.value })} /><//>
      <${Field} label=${t('ed.desc')}><textarea maxlength="240" value=${draft.desc} onInput=${(e) => setDraft({ ...draft, desc: e.target.value })}></textarea><//>
      <${Field} label=${t('ed.effect')}><select value=${draft.effect.type} onChange=${(e) => setType(e.target.value)}>${Object.keys(effects).map((k) => html`<option value=${k}>${t('eff.' + st.mode + '.' + k + '.label')}</option>`)}</select><//>
      ${Object.entries(spec.params).map(([p, r]) => html`<${Field} label=${t('ed.p_' + p)}><input type="number" min=${r[0]} max=${r[1]} value=${draft.effect[p]} onInput=${(e) => setDraft({ ...draft, effect: { ...draft.effect, [p]: +e.target.value } })} /><//>`)}
      ${st.mode === 'race' && draft.effect.type === 'text' && html`<${Switch} checked=${!!draft.effect.target} onChange=${(v) => setDraft({ ...draft, effect: { ...draft.effect, target: v } })}>${t('ed.aimed')}<//>`}
      <${Field} label=${t('ed.rarity')}><${Seg} options=${[[1, t('rarity.1')], [2, t('rarity.2')], [3, t('rarity.3')]]} value=${rarity(draft.weight)} onChange=${(r) => setDraft({ ...draft, weight: WEIGHT_OF[r] })} /><//></div>`;
  };
  const label = (it) => tx(it, isCards ? 'name' : 'title');
  const meta = (it) => (isCards ? `${effectSummary(st.mode, it.effect)} - ${t('rarity.' + rarity(it.weight))}` : t('ed.diff_n', { n: it.difficulty }));
  return html`<${Modal} title=${isCards ? t('ed.cards') : t('ed.tasks')} onClose=${onClose} wide=${true}>
    <div class="row sp" style="margin-bottom:8px"><span class="dim small">${items.length}</span>
      <span class="row"><button class="sm soft" onClick=${() => startEdit('new')}><${Ico} n="plus" size=${14} /> ${t('ed.add')}</button>
      <button class="sm ghost" onClick=${() => { if (confirm(t('ed.reset_confirm'))) act('edit_catalog', { kind, reset: true }, t('ed.reset_done')).then(onClose); }}>${t('ed.reset')}</button></span></div>
    ${edit !== null && html`<div class="card accent flat">${form()}<div class="row mt"><button onClick=${commit}>${edit === 'new' ? t('ed.add') : t('done')}</button><button class="ghost" onClick=${() => setEdit(null)}>${t('cancel')}</button></div></div>`}
    <div class="list">${items.map((it, i) => html`<div class="row sp nw" key=${i}><div class="grow"><b>${label(it)}</b><div class="small dim">${meta(it)}</div></div>
      <button class="sm ghost icon" aria-label=${t('edit')} onClick=${() => startEdit(i)}><${Ico} n="edit" size=${15} /></button>
      <button class="sm ghost icon" aria-label=${t('remove')} onClick=${() => setItems(items.filter((_, j) => j !== i))}><${Ico} n="trash" size=${15} /></button></div>`)}</div>
    <${AsyncBtn} class="block mt" onClick=${async () => { if (await act('edit_catalog', { kind, items }, t('saved'))) onClose(); }}>${t('ed.save')}<//>
  <//>`;
}
