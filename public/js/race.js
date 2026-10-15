import { html, useState } from '/vendor/preact.js';
import { META, cityName, useGeo } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, Chip, Empty, fmtDur, muniAt } from './ui.js';
import { LMap } from './map.js';
import { GCard, RaceCardModal, Hand } from './cards-ui.js';
import { ActiveTasks, Reviews, TaskRow, taskOf, teamOf } from './tasks-ui.js';

const terr = (st, id) => st.settings.territories.find((x) => x.id === id) || { name: '?', color: '#888' };
const row = (st, id) => st.g.teams.find((x) => x.id === id);
const cardsFor = (task) => (task.difficulty <= 3 ? 1 : 2);
const fmtLeft = (ms) => (ms >= 48 * 3600000 ? `${Math.floor(ms / 86400000)}d ${Math.floor((ms % 86400000) / 3600000)}h` : fmtDur(ms));

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
    <${Standings} ...${ctx} />
  </div>`;
}

// day: the same shared tasks for every team (a finished one disappears for all); night: every team votes out 3 of them
function RaceTasks(ctx) {
  const { st, my } = ctx;
  const g = st.g, n = Math.min(st.settings.taskVotes || 3, g.shared.length);
  const [sel, setSel] = useState(null);
  if (!st.settings.tasksEnabled) return null;
  if (g.phase === 'vote') {
    const cur = sel || (my && my.vote) || [];
    const toggle = (id) => setSel(cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < n ? [...cur, id] : cur);
    const saved = my && my.vote && my.vote.length === n && my.vote.every((x) => cur.includes(x)) && cur.length === n;
    return html`<section class="card"><div class="sec-h"><h2>${t('task.vote_title')}</h2><span class="chip plain">${cur.length}/${n}</span></div>
      <p class="dim small" style="margin-top:0">${t('task.vote_hint', { n })}</p>
      ${g.shared.map((id) => { const task = taskOf(st, id); if (!task) return null; const on = cur.includes(id);
        return html`<${TaskRow} key=${id} task=${task} status=${on ? 'chosen' : ''} reward=${t('task.reward_cards', { n: cardsFor(task) })}
          action=${my && st.me.plays && html`<button class="sm ${on ? '' : 'ghost'}" onClick=${() => toggle(id)}>${on ? t('task.deselect') : t('task.select')}</button>`} />`; })}
      ${my && st.me.plays && html`<${AsyncBtn} class="block mt" disabled=${cur.length !== n || saved} onClick=${async () => { const ok = await ctx.act('vote_tasks', { taskIds: cur }, t('task.vote_saved')); if (ok) setSel(null); }}>${saved ? t('task.vote_saved') : t('task.vote_confirm')}<//>`}
      <p class="small dim mt">${t('task.voted_n', { a: g.votesIn, b: g.teams.length })}</p>
    </section>`;
  }
  return html`<div class="stack"><p class="dim small" style="margin:0 4px">${t('task.shared_hint')}</p>
    <${ActiveTasks} st=${st} ctx=${ctx} active=${g.shared} doneMap=${my && my.done} canDo=${!!my && st.me.plays} title=${t('race.tasks')} reward=${(task) => t('task.reward_cards', { n: cardsFor(task) })} /></div>`;
}

// the top card: my team, my progress and a few useful numbers (no clock: the first team to the finish wins)
function Status({ st, now, my }) {
  const g = st.g, s = st.settings;
  const left = g.endsAt ? g.endsAt - now : null;
  const tile = (k, v) => html`<div class="tile-info"><div class="v">${v}</div><div class="k">${k}</div></div>`;
  const place = my && my.finishedAt ? g.ranking.indexOf(my.id) + 1 : 0;
  return html`<section class="card ${my ? 'accent' : ''}">
    ${my ? html`<div class="row sp"><div><h2 style="margin:0"><i class="dot" style=${{ background: teamOf(st, st.me.teamId).color }}></i> ${teamOf(st, st.me.teamId).name}</h2>
      <div class="small dim">${my.finishedAt ? t('race.finished_place', { n: place }) : my.available.length ? t('race.next', { terr: my.available.map((id) => terr(st, id).name).join(', ') }) : t('race.go_finish', { city: cityName(s.finishCity) })}</div></div>
      <div class="stat"><div class="v">${my.reached.length}/${s.territories.length}</div><div class="k">${t('race.territories')}</div></div></div>` : html`<h2 style="margin:0">${t('race.title')}</h2>`}
    <div class="pill-row mt">${s.territoryOrder.map((id, i) => html`<${Chip} color=${terr(st, id).color} cls=${my && my.reached.includes(id) ? '' : 'plain'}>${i + 1}. ${terr(st, id).name}${my && my.reached.includes(id) ? ' ✓' : ''}<//>`)}</div>
    <div class="info-tiles mt">${tile(t('race.tile_day'), g.days ? t('race.day_of', { d: g.day, n: g.days }) : g.day)}
      ${tile(t('race.tile_ends'), left != null ? (left > 0 ? fmtLeft(left) : t('race.time_up')) : t('race.no_limit'))}
      ${tile(t('race.tile_tasks'), my ? my.tasksDone : '-')}${tile(t('race.tile_cards'), my ? `${my.cards.length}/${s.handLimit}` : '-')}</div>
    ${my && my.frozenUntil > now && html`<div class="callout bad mt">${t('race.frozen', { t: fmtDur(my.frozenUntil - now) })}</div>`}</section>`;
}

// ---------------------------------------------------------------- map + tap a city to check in
function MapCard({ st, act, loc, my, now }) {
  const geo = useGeo();
  const s = st.settings;
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const items = [];
  for (const c of META.cities) {
    const tid = s.cityTerritory[c.id]; const off = s.disabledCities.includes(c.id);
    const done = my && tid && my.reached.includes(tid);
    items.push({ k: 'marker', shape: 'dot', lat: c.lat, lng: c.lng, color: terr(st, tid).color, dim: off || (done && c.id !== s.startCity), label: c.name, onClick: () => setSel(c.id) });
  }
  for (const [k, id] of [['start', s.startCity], ['finish', s.finishCity]]) { const c = META.byId[id]; items.push({ k: 'marker', lat: c.lat, lng: c.lng, color: k === 'start' ? '#2e9d69' : '#222', text: k === 'start' ? 'S' : 'F', label: t('race.' + k) + ' ' + c.name, z: 500, onClick: () => setSel(id) }); }
  if (sel) { const c = META.byId[sel]; items.push({ k: 'circle', lat: c.lat, lng: c.lng, r: 9000, color: '#fff', weight: 3, fill: 0.08 }); }
  for (const tr of st.g.teams) for (const l of tr.locs) items.push({ k: 'marker', lat: l.lat, lng: l.lng, color: teamOf(st, tr.id).color, text: teamOf(st, tr.id).name[0], label: `${teamOf(st, tr.id).name} - ${l.name}`, z: 900 });
  if (loc.pos) items.push({ k: 'circle', lat: loc.pos.lat, lng: loc.pos.lng, r: Math.max(loc.pos.acc, 15), color: '#3b82c4' });
  const matches = q.trim() ? META.cities.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const here = geo && loc.pos ? muniAt(geo, loc.pos.lat, loc.pos.lng) : null;
  return html`<section class="card"><div class="sec-h"><h2>${t('race.map')}</h2></div>
    <${LMap} munis=${geo} muniColor=${(p) => terr(st, s.muniTerritory[p.id]).color} items=${items} fitKey="race"
      panel=${sel && html`<${CityPanel} st=${st} act=${act} my=${my} cityId=${sel} onClose=${() => setSel(null)} now=${now} />`} />
    <p class="small dim mt">${t('race.tap_hint')}</p>
    <input class="mt" placeholder=${t('race.search')} value=${q} onInput=${(e) => setQ(e.target.value)} />
    ${matches.map((c) => { const tid = s.cityTerritory[c.id]; return html`<div class="row sp" style="padding:8px 0" key=${c.id}><button class="link" onClick=${() => { setSel(c.id); setQ(''); }}>${c.name}</button>
      <${Chip} color=${terr(st, tid).color}>${t('race.inside', { terr: terr(st, tid).name })}<//></div>`; })}
    ${here && html`<p class="small mt">${t('race.you_are_in', { muni: here.name })} <b style=${{ color: terr(st, s.muniTerritory[here.id]).color }}>${terr(st, s.muniTerritory[here.id]).name}</b></p>`}</section>`;
}

function CityPanel({ st, act, my, cityId, onClose }) {
  const s = st.settings, c = META.byId[cityId], tid = s.cityTerritory[cityId];
  const off = s.disabledCities.includes(cityId);
  const isFinish = cityId === s.finishCity;
  const open = my && tid && my.available.includes(tid);
  const reached = my && tid && my.reached.includes(tid);
  const allReached = my && my.available.length === 0;
  let note = '';
  if (off) note = t('race.not_checkpoint'); else if (!my) note = '';
  else if (reached) note = t('race.already', { terr: terr(st, tid).name }); else if (!open) note = t('race.locked', { terr: terr(st, tid).name });
  return html`<div class="sheet card flat accent mt"><div class="row sp"><div><h3 style="margin:0">${c.name}</h3><${Chip} color=${terr(st, tid).color}>${t('race.inside', { terr: terr(st, tid).name })}<//></div>
    <button class="ghost icon sm" onClick=${onClose} aria-label=${t('close')}>×</button></div>
    ${note && html`<p class="small dim mt">${note}</p>`}
    ${my && !my.finishedAt && !off && html`<div class="row mt">
      ${open && html`<${AsyncBtn} class="grow" onClick=${async () => { if (await act('checkin', { cityId })) onClose(); }}>${t('race.checkin_here')}<//>`}
      ${isFinish && allReached && html`<${AsyncBtn} class="good-btn grow" onClick=${() => act('finish', { cityId })}>${t('race.finish_here')}<//>`}</div>`}</div>`;
}

// ---------------------------------------------------------------- cards: every finished task puts a card straight into the hand
function Cards({ st, act, my }) {
  const s = st.settings;
  const [sel, setSel] = useState(null);
  return html`<section class="card"><div class="sec-h"><h2>${t('cards.title')}</h2><span class="chip plain">${my.cards.length}/${s.handLimit}</span></div>
    <${Hand} items=${my.cards} mode="race" onOpen=${setSel} empty=${html`<${Empty}>${t('cards.empty')}<//>`} />
    ${my.spyUntil > Date.now() && html`<div class="callout good">${t('cards.spy_on')}</div>`}
    <details style="margin-top:6px"><summary class="dim small" style="cursor:pointer">${t('cards.all', { n: s.cards.length })}</summary>
      <div class="hand">${s.cards.map((c) => html`<${GCard} card=${c} mode="race" small=${true} key=${c.id} />`)}</div></details>
    ${sel && html`<${RaceCardModal} inst=${sel} st=${st} onClose=${() => setSel(null)} onPlay=${(p) => act('play_card', p)} onDiscard=${(iid) => act('discard', { iid })} />`}</section>`;
}

// ---------------------------------------------------------------- standings: the order of arrival at the finish, then progress
function Standings({ st, now }) {
  const total = st.settings.territories.length;
  return html`<section class="card"><div class="sec-h"><h2>${t('standings')}</h2></div>
    ${st.g.ranking.map((id, i) => { const r = row(st, id), tm = teamOf(st, id);
      return html`<div class="row sp nw" key=${id} style="padding:8px 0"><span>${i + 1}. <i class="dot" style=${{ background: tm.color }}></i> <b>${tm.name}</b>
        <span class="small dim">${st.members.filter((m) => m.teamId === id).map((m) => m.name).join(', ')}</span>
        ${r.finishedAt ? html`<${Chip} cls="good">${t('race.chip_finished')}<//>` : ''}${r.frozenUntil > now ? html`<${Chip} cls="bad">${t('race.frozen_chip')}<//>` : ''}</span>
        <span class="xs dim" style="text-align:right">${t('race.progress', { a: r.reached.length, b: total, n: r.tasksDone })}</span></div>`; })}</section>`;
}
