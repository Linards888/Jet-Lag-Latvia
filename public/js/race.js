import { html, useState } from '/vendor/preact.js';
import { META, cityName, useGeo } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, Chip, Empty, fmtDur, muniAt, esc } from './ui.js';
import { LMap } from './map.js';
import { GCard, PickModal, RaceCardModal, Hand } from './cards-ui.js';
import { ActiveTasks, Reviews, teamOf } from './tasks-ui.js';

const terr = (st, id) => st.settings.territories.find((x) => x.id === id) || { name: '?', color: '#888' };
const row = (st, id) => st.g.teams.find((x) => x.id === id);

export function Page(ctx) {
  const { st } = ctx;
  if (st.status === 'lobby') return null;
  const my = row(st, st.me.teamId);
  return html`<div class="stack">
    <${Status} ...${ctx} my=${my} />
    <${MapCard} ...${ctx} my=${my} />
    <${Reviews} st=${st} reviews=${st.g.reviews} act=${ctx.act} code=${ctx.code} token=${ctx.token} />
    <${ActiveTasks} st=${st} ctx=${ctx} active=${st.g.active} doneMap=${my && my.done} canDo=${!!my && st.me.plays} pin=${my && my.pin}
      onPin=${st.me.plays && my ? (id) => ctx.act('pin_task', { taskId: id }) : null} title=${t('race.tasks')} reward=${(task) => t('task.reward_picks', { n: task.difficulty })} />
    ${my && html`<${Cards} ...${ctx} my=${my} />`}
    <${Standings} ...${ctx} />
  </div>`;
}

function Status({ st, now, my }) {
  const w = st.g.window;
  const ms = w.msToChange != null ? w.msToChange - (now - st.now) : null;
  const s = st.settings;
  return html`<section class="card ${my ? 'accent' : ''}">
    ${my ? html`<div class="row sp"><div><h2 style="margin:0">${teamOf(st, st.me.teamId).name}</h2>
      <div class="small dim">${my.finishedAt ? t('race.finished') : my.available.length ? t('race.next', { terr: my.available.map((id) => terr(st, id).name).join(', ') }) : t('race.go_finish', { city: cityName(s.finishCity) })}</div></div>
      <div class="stat"><div class="v">${fmtDur(my.scoreMs)}</div><div class="k">${my.finishedAt ? t('final') : t('so_far')}</div></div></div>` : html`<h2 style="margin:0">${t('race.title')}</h2>`}
    <div class="pill-row mt">${s.territoryOrder.map((id, i) => html`<${Chip} color=${terr(st, id).color} cls=${my && my.reached.includes(id) ? '' : 'plain'}>${i + 1}. ${terr(st, id).name}${my && my.reached.includes(id) ? ' ✓' : ''}<//>`)}</div>
    ${(my && (my.bonusMin || my.penaltyMin)) ? html`<p class="small dim mt">${t('race.bonus_pen', { b: my.bonusMin, p: my.penaltyMin })}</p>` : ''}
    ${s.useWindow && html`<div class="callout ${w.open ? 'good' : 'warn'} mt">${w.open ? t('race.window_open', { end: s.window.end, t: fmtDur(ms) }) : t('race.window_closed', { start: s.window.start, t: fmtDur(ms) })}</div>`}
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
    <${LMap} munis=${geo} muniColor=${(p) => terr(st, s.muniTerritory[p.id]).color} items=${items} fitKey="race" />
    <p class="small dim mt">${t('race.tap_hint')}</p>
    ${sel && html`<${CityPanel} st=${st} act=${act} my=${my} cityId=${sel} onClose=${() => setSel(null)} now=${now} />`}
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

// ---------------------------------------------------------------- cards
function Cards({ st, act, my, code, token }) {
  const s = st.settings;
  const [pickOpen, setPickOpen] = useState(() => !!my.picks.length);
  const [sel, setSel] = useState(null);
  const sets = my.picks.map((p) => ({ id: p.pid, options: p.options, keep: 1 }));
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

// ---------------------------------------------------------------- standings
function Standings({ st, now }) {
  const total = st.settings.territories.length;
  return html`<section class="card"><div class="sec-h"><h2>${t('standings')}</h2></div>
    ${st.g.ranking.map((id, i) => { const r = row(st, id), tm = teamOf(st, id);
      return html`<div class="row sp nw" key=${id} style="padding:8px 0"><span>${i + 1}. <i class="dot" style=${{ background: tm.color }}></i> <b>${tm.name}</b>
        <span class="small dim">${st.members.filter((m) => m.teamId === id).map((m) => m.name).join(', ')}</span>
        ${r.frozenUntil > now ? html`<${Chip} cls="bad">${t('race.frozen_chip')}<//>` : ''}</span>
        <span style="text-align:right"><b>${fmtDur(r.scoreMs)}</b><div class="xs dim">${t('race.progress', { a: r.reached.length, b: total, n: r.tasksDone })}${st.g.claims && Object.values(st.g.claims).includes(id) ? ' ★' : ''}</div></span></div>`; })}</section>`;
}
