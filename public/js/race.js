import { html, useState, useEffect, useRef, useMemo } from '/vendor/preact.js';
import { META, useGeo } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, Chip, Empty, fmtDur, muniAt } from './ui.js';
import { LMap } from './map.js';
import { GCard, PickModal, RaceCardModal, Hand } from './cards-ui.js';
import { ActiveTasks, Reviews, TaskRow, taskOf, teamOf } from './tasks-ui.js';

const terr = (st, id) => st.settings.territories.find((x) => x.id === id) || { name: '?', color: '#888' };
const row = (st, id) => st.g.teams.find((x) => x.id === id);
const fmtLeft = (ms) => (ms >= 48 * 3600000 ? `${Math.floor(ms / 86400000)}d ${Math.floor((ms % 86400000) / 3600000)}h` : fmtDur(ms));
const NAMES = new WeakMap();  // novads id -> name, built once per loaded geodata
const novadsName = (geo, id) => {
  if (!geo) return id;
  if (!NAMES.has(geo)) NAMES.set(geo, Object.fromEntries(geo.features.map((f) => [f.properties.id, f.properties.name])));
  return NAMES.get(geo)[id] || id;
};

export function Page(ctx) {
  const { st } = ctx;
  if (st.status === 'lobby') return null;
  const my = row(st, st.me.teamId);
  return html`<div class="stack">
    <${Status} ...${ctx} my=${my} />
    <${MapCard} ...${ctx} my=${my} />
    <${Reviews} st=${st} reviews=${st.g.reviews} act=${ctx.act} code=${ctx.code} token=${ctx.token} />
    <${RaceTasks} ...${ctx} my=${my} />
    ${my && html`<${Cards} ...${ctx} my=${my} />`}
  </div>`;
}

// day: the same shared tasks for every team (a finished one disappears for all); night: every team votes out 3 of them
function RaceTasks(ctx) {
  const { st, my } = ctx;
  const g = st.g, n = Math.min(st.settings.taskVotes || 3, g.shared.length);
  const [sel, setSel] = useState(null);
  if (!st.settings.tasksEnabled) return null;
  const reward = (task) => t('task.reward_pick', { n: task.difficulty });
  if (g.phase === 'vote') {
    const cur = sel || (my && my.vote) || [];
    const toggle = (id) => setSel(cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < n ? [...cur, id] : cur);
    const saved = my && my.vote && my.vote.length === n && my.vote.every((x) => cur.includes(x)) && cur.length === n;
    return html`<section class="card"><div class="sec-h"><h2>${t('task.vote_title')}</h2><span class="chip plain">${cur.length}/${n}</span></div>
      <p class="dim small" style="margin-top:0">${t('task.vote_hint', { n })}</p>
      ${g.shared.map((id) => { const task = taskOf(st, id); if (!task) return null; const on = cur.includes(id);
        return html`<${TaskRow} key=${id} task=${task} status=${on ? 'chosen' : ''} reward=${reward(task)}
          action=${my && st.me.plays && html`<button class="sm ${on ? '' : 'ghost'}" onClick=${() => toggle(id)}>${on ? t('task.deselect') : t('task.select')}</button>`} />`; })}
      ${my && st.me.plays && html`<${AsyncBtn} class="block mt" disabled=${cur.length !== n || saved} onClick=${async () => { const ok = await ctx.act('vote_tasks', { taskIds: cur }, t('task.vote_saved')); if (ok) setSel(null); }}>${saved ? t('task.vote_saved') : t('task.vote_confirm')}<//>`}
      <p class="small dim mt">${t('task.voted_n', { a: g.votesIn, b: g.teams.length })}</p>
    </section>`;
  }
  return html`<${ActiveTasks} st=${st} ctx=${ctx} active=${g.shared} doneMap=${my && my.done} canDo=${!!my && st.me.plays} title=${t('race.tasks')} reward=${reward} />`;
}

// the top card: my team, where it is and a few useful numbers (no clock: the first team to the finish wins)
function Status({ st, now, my }) {
  const g = st.g, s = st.settings;
  const geo = useGeo();
  const left = g.endsAt ? g.endsAt - now : null;
  const tile = (k, v) => html`<div class="tile-info"><div class="v">${v}</div><div class="k">${k}</div></div>`;
  const place = my && my.finishedAt ? g.ranking.indexOf(my.id) + 1 : 0;
  const hint = !my ? '' : my.finishedAt ? t('race.finished_place', { n: place }) : !s.tasksEnabled || my.unlocked.includes(my.at) ? t('race.hint_go') : t('race.hint_task');
  return html`<section class="card ${my ? 'accent' : ''}">
    ${my ? html`<div class="row sp"><div><h2 style="margin:0"><i class="dot" style=${{ background: teamOf(st, st.me.teamId).color }}></i> ${teamOf(st, st.me.teamId).name}</h2>
      <div class="small"><b>${t('race.you_are_in', { muni: novadsName(geo, my.at) })}</b></div><div class="small dim">${hint}</div></div>
      <div class="stat"><div class="v">${my.reached.length}/${s.territories.length}</div><div class="k">${t('race.regions')}</div></div></div>` : html`<h2 style="margin:0">${t('race.title')}</h2>`}
    <div class="info-tiles mt">${tile(t('race.tile_day'), g.days ? t('race.day_of', { d: g.day, n: g.days }) : g.day)}
      ${tile(t('race.tile_ends'), left != null ? (left > 0 ? fmtLeft(left) : t('race.time_up')) : t('race.no_limit'))}
      ${tile(t('race.tile_tasks'), my ? my.tasksDone : '-')}${tile(t('race.tile_cards'), my ? `${my.cards.length}/${s.handLimit}` : '-')}</div>
    ${my && my.frozenUntil > now && html`<div class="callout bad mt">${t('race.frozen', { t: fmtDur(my.frozenUntil - now) })}</div>`}</section>`;
}

// ---------------------------------------------------------------- map: tap a novads, check in when it is open
function MapCard({ st, act, loc, my }) {
  const geo = useGeo();
  const s = st.settings;
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const open = useMemo(() => new Set(my ? my.open : []), [my && my.open.join()]), seen = useMemo(() => new Set(my ? my.visited : []), [my && my.visited.join()]);
  const locked = (id) => !!my && !seen.has(id) && !open.has(id);
  const items = [];
  for (const c of META.cities) {
    const tid = s.cityTerritory[c.id]; const off = s.disabledCities.includes(c.id);
    items.push({ k: 'marker', shape: 'dot', lat: c.lat, lng: c.lng, color: terr(st, tid).color, dim: off || locked(c.muni) || (seen.has(c.muni) && c.id !== s.startCity), label: c.name, onClick: () => c.muni && setSel(c.muni) });
  }
  for (const [k, id] of [['start', s.startCity], ['finish', s.finishCity]]) { const c = META.byId[id]; items.push({ k: 'marker', lat: c.lat, lng: c.lng, color: k === 'start' ? '#2e9d69' : '#222', text: k === 'start' ? 'S' : 'F', label: t('race.' + k) + ' ' + c.name, z: 500, onClick: () => setSel(c.muni) }); }
  for (const tr of st.g.teams) for (const l of tr.locs) items.push({ k: 'marker', lat: l.lat, lng: l.lng, color: teamOf(st, tr.id).color, text: teamOf(st, tr.id).name[0], label: `${teamOf(st, tr.id).name} - ${l.name}`, z: 900 });
  if (loc.pos) items.push({ k: 'circle', lat: loc.pos.lat, lng: loc.pos.lng, r: Math.max(loc.pos.acc, 15), color: '#3b82c4' });
  const matches = q.trim() ? META.cities.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const here = useMemo(() => (geo && loc.pos ? muniAt(geo, loc.pos.lat, loc.pos.lng) : null), [geo, loc.pos && loc.pos.lat, loc.pos && loc.pos.lng]);
  return html`<section class="card"><div class="sec-h"><h2>${t('race.map')}</h2></div>
    <${LMap} munis=${geo} muniColor=${(p) => (locked(p.id) ? '#8d8d8d' : terr(st, s.muniTerritory[p.id]).color)} items=${items} fitKey="race" onMuniClick=${(p) => setSel(p.id)}
      panel=${sel && html`<${NovadsPanel} st=${st} act=${act} my=${my} geo=${geo} mid=${sel} onClose=${() => setSel(null)} />`} />
    ${my && html`<p class="small dim mt">${t('race.map_legend')}</p>`}
    <input class="mt" placeholder=${t('race.search')} value=${q} onInput=${(e) => setQ(e.target.value)} />
    ${matches.map((c) => html`<div class="row sp" style="padding:8px 0" key=${c.id}><button class="link" onClick=${() => { if (c.muni) setSel(c.muni); setQ(''); }}>${c.name}</button>
      <${Chip} color=${terr(st, s.cityTerritory[c.id]).color}>${terr(st, s.cityTerritory[c.id]).name}<//></div>`)}
    ${here && html`<p class="small mt">${t('race.gps_in', { muni: here.name })} <b style=${{ color: terr(st, s.muniTerritory[here.id]).color }}>${terr(st, s.muniTerritory[here.id]).name}</b></p>`}</section>`;
}

function NovadsPanel({ st, act, my, geo, mid, onClose }) {
  const s = st.settings, region = terr(st, s.muniTerritory[mid]);
  const fin = META.byId[s.finishCity];
  const isFinish = fin && fin.muni === mid;
  const open = !!my && my.open.includes(mid), seen = !!my && my.visited.includes(mid);
  const regionsLeft = my ? s.territories.length - my.reached.length : 0;
  let note = '';
  if (my && !my.finishedAt) {
    if (seen) note = t('race.visited');
    else if (!open) note = my.unlocked.includes(my.at) ? t('race.not_border') : t('race.do_task_first', { muni: novadsName(geo, my.at) });
  }
  return html`<div class="sheet card flat accent mt"><div class="row sp"><div><h3 style="margin:0">${novadsName(geo, mid)}</h3><${Chip} color=${region.color}>${region.name}<//>${isFinish && html` <${Chip}>${t('race.finish')} ${fin.name}<//>`}</div>
    <button class="ghost icon sm" onClick=${onClose} aria-label=${t('close')}>×</button></div>
    ${note && html`<p class="small dim mt">${note}</p>`}
    ${my && !my.finishedAt && html`<div class="row mt">
      ${open && html`<${AsyncBtn} class="grow" onClick=${async () => { if (await act('checkin', { muniId: mid })) onClose(); }}>${t('race.checkin_here')}<//>`}
      ${isFinish && (seen || open) && (regionsLeft === 0
        ? html`<${AsyncBtn} class="good-btn grow" onClick=${() => act('finish', { cityId: s.finishCity })}>${t('race.finish_here')}<//>`
        : html`<p class="small dim grow">${t('race.regions_left', { n: regionsLeft })}</p>`)}</div>`}</div>`;
}

// ---------------------------------------------------------------- cards: a finished task = ONE pick (as many cards to choose from as the task is hard)
function Cards({ st, act, my }) {
  const s = st.settings;
  const [pickOpen, setPickOpen] = useState(() => !!my.picks.length);
  const [sel, setSel] = useState(null);
  const sets = my.picks.map((p) => ({ id: p.pid, options: p.options, keep: 1 }));
  const prev = useRef(my.picks.length);
  useEffect(() => { if (my.picks.length > prev.current) setPickOpen(true); prev.current = my.picks.length; }, [my.picks.length]);
  return html`<section class="card"><div class="sec-h"><h2>${t('cards.title')}</h2><span class="chip plain">${my.cards.length}/${s.handLimit}</span></div>
    ${sets.length > 0 && html`<div class="callout mt" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px"><span>${t('cards.picks_waiting', { n: sets.length })}</span><button class="sm" onClick=${() => setPickOpen(true)}>${t('open')}</button></div>`}
    <${Hand} items=${my.cards} mode="race" onOpen=${setSel} empty=${html`<${Empty}>${t('cards.empty')}<//>`} />
    ${my.spyUntil > Date.now() && html`<div class="callout good">${t('cards.spy_on')}</div>`}
    <details style="margin-top:6px"><summary class="dim small" style="cursor:pointer">${t('cards.all', { n: s.cards.length })}</summary>
      <div class="hand">${s.cards.map((c) => html`<${GCard} card=${c} mode="race" small=${true} key=${c.id} />`)}</div></details>
    ${pickOpen && html`<${PickModal} sets=${sets} mode="race" hand=${my.cards} limit=${s.handLimit} onClose=${() => setPickOpen(false)}
      onTake=${(set, idx, drop) => act('pick', { pid: set.id, index: idx[0], discardIid: drop[0] })} onPass=${(set) => act('pick', { pid: set.id, pass: true })} />`}
    ${sel && html`<${RaceCardModal} inst=${sel} st=${st} onClose=${() => setSel(null)} onPlay=${(p) => act('play_card', p)} onDiscard=${(iid) => act('discard', { iid })} />`}</section>`;
}
