import { html, useState } from '/vendor/preact.js';
import { META, cityName, useGeo } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, Chip, Empty, fmtDur, fmtTime } from './ui.js';
import { LMap } from './map.js';
import { ActiveTasks, Reviews, teamOf } from './tasks-ui.js';

const POWERS = ['ghost', 'shield', 'radar'];
const MINUTES = { shield: 'shieldMin', ghost: 'ghostMin', radar: 'radarMin', peek: 'peekMin', freeze_it: 'freezeItMin', time_cut: 'timeCutMin' };

export function Page(ctx) {
  const { st } = ctx;
  if (st.status === 'lobby') return null;
  const g = st.g, mine = st.me.teamId && st.me.plays ? st.me.teamId : null;
  const my = mine && g.teams ? g.teams[mine] : null;
  const eco = st.settings.economy;
  return html`<div class="stack">
    <${Banner} ...${ctx} my=${my} />
    ${mine === g.it && html`<${TagIt} ...${ctx} />`}
    <${MapCard} ...${ctx} mine=${mine} />
    ${eco && html`<${Destinations} ...${ctx} mine=${mine} />`}
    <${Reviews} st=${st} reviews=${g.reviews} act=${ctx.act} code=${ctx.code} token=${ctx.token} />
    ${eco && html`<${ActiveTasks} st=${st} ctx=${ctx} active=${g.active} doneMap=${my && my.done} canDo=${!!my} title=${t('tag.tasks')} reward=${(task) => t('tag.task_reward', { n: task.difficulty * st.settings.taskPayout })} />`}
    ${eco && my && html`<${Shop} ...${ctx} my=${my} mine=${mine} />`}
    ${st.settings.allStars && mine && html`<${Powers} ...${ctx} mine=${mine} />`}
    <${Standings} ...${ctx} />
  </div>`;
}

function Banner({ st, now, my }) {
  const g = st.g, off = now - st.now, w = g.window;
  const mine = st.me.teamId && st.me.plays ? st.me.teamId : null;
  const meIt = mine === g.it;
  const myMs = mine ? g.itMs[mine] + (mine === g.it && st.status === 'running' ? off : 0) : null;
  const active = my ? Object.entries(my.eff).filter(([, until]) => until > now) : [];
  return html`<section class="card ${meIt ? 'accent' : ''}"><div class="row sp"><div><h2 style="margin:0">${meIt ? t('tag.you_are_it') : t('tag.team_is_it', { team: teamOf(st, g.it).name })}</h2>
      <div class="small dim">${meIt ? t('tag.catch') : mine ? t('tag.run') : t('tag.watching')}</div></div>
    ${myMs != null && html`<div class="stat"><div class="v">${fmtDur(myMs)}</div><div class="k">${t('tag.your_it_time')}</div></div>`}</div>
    ${my && st.settings.economy && html`<div class="row mt"><${Chip} cls="good">${t('tag.money', { n: my.money })}<//>${active.map(([k, until]) => html`<${Chip}>${t('shop.' + k)} ${fmtDur(until - now)}<//>`)}</div>`}
    ${st.settings.useWindow && !w.open && html`<div class="callout warn mt">${t('tag.outside_window')}</div>`}
    <p class="small dim" style="margin-bottom:0">${t('tag.time_left', { t: fmtDur(g.remainingMs) })}</p></section>`;
}

function TagIt({ st, act, now }) {
  const g = st.g;
  const targets = st.teams.filter((x) => x.id !== g.it);
  const [sel, setSel] = useState('');
  const target = sel || (targets[0] && targets[0].id);
  const lock = g.itLockLeftMs - (now - st.now);
  return html`<section class="card accent"><div class="sec-h"><h2>${t('tag.tag_someone')}</h2></div>
    ${lock > 0 && html`<div class="callout warn">${t('tag.cooldown', { t: fmtDur(lock, true) })}</div>`}
    <div class="list">${targets.map((x) => { const sh = g.shielded.includes(x.id);
      return html`<label class="switch" key=${x.id} style=${{ opacity: sh ? 0.5 : 1 }}><input type="radio" name="tg" checked=${target === x.id} onChange=${() => setSel(x.id)} /><span class="tr"></span>
        <span><i class="dot" style=${{ background: x.color, marginRight: '6px' }}></i>${x.name}${sh ? ' (' + t('tag.shielded') + ')' : ''}</span></label>`; })}</div>
    <${AsyncBtn} class="block mt" disabled=${!target || lock > 0} confirm=${t('tag.confirm', { team: target ? teamOf(st, target).name : '' })} onClick=${() => act('tag', { targetTeamId: target })}>${t('tag.tag_btn')}<//></section>`;
}

// ---------------------------------------------------------------- map with team positions and destinations (tap one to claim it)
function MapCard({ st, loc, act, mine }) {
  const geo = useGeo();
  const g = st.g;
  const [sel, setSel] = useState(null);
  const items = [];
  for (const p of g.positions) {
    const tm = teamOf(st, p.teamId);
    for (const l of p.locs) items.push({ k: 'marker', lat: l.lat, lng: l.lng, color: p.teamId === g.it ? '#d4314d' : tm.color, text: p.teamId === g.it ? '!' : tm.name[0], label: `${tm.name} - ${l.name}`, z: p.teamId === g.it ? 1000 : 500 });
  }
  for (const d of st.settings.economy ? g.dest : []) { const c = META.byId[d.cityId]; items.push({ k: 'marker', lat: c.lat, lng: c.lng, color: '#2e9d69', text: 'D', label: c.name, z: 800, onClick: () => setSel(d.id) }); }
  if (loc.pos) items.push({ k: 'circle', lat: loc.pos.lat, lng: loc.pos.lng, r: Math.max(loc.pos.acc, 15), color: '#3b82c4' });
  const d = sel && g.dest.find((x) => x.id === sel);
  return html`<section class="card"><div class="sec-h"><h2>${t('tag.map')}</h2></div>
    <${LMap} items=${items} munis=${geo} muniColor=${() => null} fitKey="tag" />
    <div class="pill-row mt">${g.positions.map((p) => html`<${Chip} color=${teamOf(st, p.teamId).color} cls="plain">${teamOf(st, p.teamId).name}${p.teamId === g.it ? ' (IT)' : ''}: ${p.hidden ? t('tag.hidden') : p.locs.length ? t('tag.visible') : t('tag.no_pos')}<//>`)}</div>
    ${d && html`<div class="sheet card flat accent mt"><div class="row sp"><b>${cityName(d.cityId)}</b><button class="ghost icon sm" onClick=${() => setSel(null)} aria-label=${t('close')}>×</button></div>
      ${mine && html`<${AsyncBtn} class="block mt" onClick=${async () => { if (await act('claim_destination', { destId: d.id })) setSel(null); }}>${t('tag.claim_here', { n: st.settings.destReward })}<//>`}</div>`}</section>`;
}

function Destinations({ st, act, mine }) {
  const g = st.g;
  return html`<section class="card"><div class="sec-h"><h2>${t('tag.destinations')}</h2><span class="chip good">${t('tag.reward', { n: st.settings.destReward })}</span></div>
    <div class="list">${g.dest.map((d) => html`<div class="row sp nw" key=${d.id}><b>${cityName(d.cityId)}</b>
      ${mine && html`<${AsyncBtn} class="sm" confirm=${t('tag.claim_confirm', { city: cityName(d.cityId) })} onClick=${() => act('claim_destination', { destId: d.id })}>${t('tag.claim')}<//>`}</div>`)}</div></section>`;
}

function Shop({ st, act, my }) {
  const prices = st.g.prices, s = st.settings;
  return html`<section class="card"><div class="sec-h"><h2>${t('tag.shop')}</h2><span class="chip good">${t('tag.money', { n: my.money })}</span></div>
    <div class="shop">${META.shop.map((id) => html`<div class="item" key=${id}><b>${t('shop.' + id)}</b><span class="small dim">${t('shop.' + id + '.d', { min: s[MINUTES[id]] })}</span>
      <div class="row sp"><span class="price">${prices[id]}</span><${AsyncBtn} class="sm" disabled=${my.money < prices[id]} confirm=${t('tag.buy_confirm', { item: t('shop.' + id), n: prices[id] })} onClick=${() => act('buy', { item: id })}>${t('tag.buy')}<//></div></div>`)}</div></section>`;
}

function Powers({ st, act, now, mine }) {
  const g = st.g, powers = g.powers[mine] || {}, my = g.teams && g.teams[mine];
  return html`<section class="card"><div class="sec-h"><h2>${t('tag.powers')}</h2></div>${Object.keys(powers).length === 0 ? html`<${Empty}>${t('tag.no_powers')}<//>` : Object.entries(powers).map(([name, pw]) => {
    const until = my ? my.eff[name] : 0, active = until > now;
    return html`<div class="row sp nw" key=${name} style="padding:8px 0"><div><b>${t('shop.' + name)}</b><div class="small dim">${t('shop.' + name + '.d', { min: st.settings[MINUTES[name]] })}</div></div>
      ${active ? html`<${Chip} cls="good">${fmtDur(until - now)}<//>` : pw.used ? html`<span class="dim small">${t('tag.used')}</span>` : html`<${AsyncBtn} class="sm" confirm=${t('tag.power_confirm', { name: t('shop.' + name) })} onClick=${() => act('use_power', { power: name })}>${t('tag.use')}<//>`}</div>`; })}</section>`;
}

function Standings({ st, now }) {
  const g = st.g, off = now - st.now;
  return html`<section class="card"><div class="sec-h"><h2>${t('tag.standings')}</h2></div>${g.ranking.map((id, i) => { const tm = teamOf(st, id);
    return html`<div class="row sp nw" key=${id} style="padding:7px 0"><span>${i + 1}. <i class="dot" style=${{ background: tm.color }}></i> <b>${tm.name}</b> ${id === g.it ? html`<${Chip}>IT<//>` : ''}
      <span class="small dim">${st.members.filter((m) => m.teamId === id).map((m) => m.name).join(', ')}</span></span><b>${fmtDur(g.itMs[id] + (id === g.it && st.status === 'running' ? off : 0))}</b></div>`; })}
    ${g.tags.length > 0 && html`<hr class="divider" /><p class="eyebrow">${t('tag.recent')}</p>${g.tags.slice().reverse().slice(0, 6).map((x) => html`<div class="small" key=${x.t}>${fmtTime(x.t)} - ${t('tag.tagged', { a: teamOf(st, x.from).name, b: teamOf(st, x.to).name })}</div>`)}`}</section>`;
}
