import { html, useState } from '/vendor/preact.js';
import { META } from './api.js';
import { AsyncBtn, Chip, Empty, fmtDur, fmtTime } from './ui.js';
import { LMap } from './map.js';

export function tabs(st) { return [{ id: 'map', label: 'Map' }, ...(st.me.plays ? [{ id: 'play', label: 'Play' }] : [])]; }

const team = (st, id) => st.teams.find((t) => t.id === id) || { name: '?', color: '#888' };

export function View(ctx) {
  if (ctx.st.status === 'lobby') return null;
  return ctx.tab === 'play' ? html`<${Play} ...${ctx} />` : html`<${MapTab} ...${ctx} />`;
}

function Banner({ st, now }) {
  const g = st.g, off = now - st.now;
  const w = g.window;
  const meIt = st.me.teamId === g.it && st.me.plays;
  const myMs = st.me.teamId ? g.itMs[st.me.teamId] + (st.me.teamId === g.it && st.status === 'running' ? off : 0) : null;
  return html`<div class="card ${meIt ? 'accent' : ''}"><div class="row sp"><div><h2 style="margin:0">${meIt ? 'You are IT' : `${team(st, g.it).name} is IT`}</h2>
      <div class="small dim">${meIt ? 'Catch another team, then press Tag.' : st.me.teamId ? 'Stay away from IT.' : 'Watching the game.'}</div></div>
    ${myMs != null && html`<div class="stat"><div class="v">${fmtDur(myMs)}</div><div class="k">your time as IT</div></div>`}</div>
    ${st.settings.useWindow && !w.open && html`<div class="callout warn mt">Outside the play window. The clock is stopped.</div>`}
    <p class="small dim" style="margin-bottom:0">Game time left: ${fmtDur(g.remainingMs)}</p></div>`;
}

function Standings({ st, now }) {
  const g = st.g, off = now - st.now;
  return html`<div class="card"><p class="eyebrow">Standings (least time as IT wins)</p>${g.ranking.map((id, i) => { const t = team(st, id);
    return html`<div class="row sp" key=${id} style="padding:7px 0"><span>${i + 1}. <i class="dot" style=${{ background: t.color }}></i> <b>${t.name}</b> ${id === g.it ? html`<${Chip}>IT<//>` : ''}
      <span class="small dim">${st.members.filter((m) => m.teamId === id).map((m) => m.name).join(', ')}</span></span><b>${fmtDur(g.itMs[id] + (id === g.it && st.status === 'running' ? off : 0))}</b></div>`; })}</div>`;
}

function MapTab(ctx) {
  const { st, loc } = ctx;
  const g = st.g;
  const items = [];
  for (const p of g.positions) {
    const t = team(st, p.teamId);
    for (const l of p.locs) items.push({ k: 'marker', lat: l.lat, lng: l.lng, color: p.teamId === g.it ? '#d4314d' : t.color, text: p.teamId === g.it ? '!' : t.name[0], label: `${t.name} - ${l.name}`, z: p.teamId === g.it ? 1000 : 500 });
  }
  if (loc.pos) items.push({ k: 'circle', lat: loc.pos.lat, lng: loc.pos.lng, r: Math.max(loc.pos.acc, 15), color: '#3b82c4' });
  return html`<div class="stack"><${Banner} ...${ctx} />
    <${LMap} items=${items} munis=${META.munis} muniColor=${() => null} fitKey="tag" />
    <div class="card"><p class="eyebrow">On your map</p>${g.positions.map((p) => html`<div class="row sp" key=${p.teamId} style="padding:4px 0"><${Chip} color=${team(st, p.teamId).color}>${team(st, p.teamId).name}${p.teamId === g.it ? ' (IT)' : ''}<//>
      <span class="small dim">${p.hidden ? 'hidden' : p.locs.length ? 'visible' : 'no position yet'}</span></div>`)}</div>
    <${Standings} ...${ctx} /></div>`;
}

function Play(ctx) {
  const { st, act, now } = ctx;
  const g = st.g;
  const mine = st.me.teamId;
  const meIt = mine === g.it;
  const powers = g.powers[mine] || {};
  const targets = st.teams.filter((t) => t.id !== g.it);
  const [sel, setSel] = useState('');
  const target = sel || (targets[0] && targets[0].id);
  const lock = g.itLockLeftMs - (now - st.now);
  return html`<div class="stack"><${Banner} ...${ctx} />
    ${meIt && html`<div class="card accent"><h2>Tag someone</h2>
      ${lock > 0 && html`<div class="callout warn">Tagger cooldown: ${fmtDur(lock, true)}</div>`}
      <div class="list">${targets.map((t) => { const sh = g.shielded.includes(t.id);
        return html`<label class="switch" key=${t.id} style=${{ opacity: sh ? 0.5 : 1 }}><input type="radio" name="tg" checked=${target === t.id} onChange=${() => setSel(t.id)} /><span class="tr"></span>
          <span><i class="dot" style=${{ background: t.color, marginRight: '6px' }}></i>${t.name}${sh ? ' (shielded)' : ''}</span></label>`; })}</div>
      <${AsyncBtn} class="block mt" disabled=${!target || lock > 0} confirm=${'Did you really tag ' + (target ? team(st, target).name : '') + '?'} onClick=${() => act('tag', { targetTeamId: target })}>Tag!<//></div>`}
    ${st.settings.allStars && html`<div class="card"><p class="eyebrow">Your powers</p>${Object.keys(powers).length === 0 ? html`<${Empty}>No powers<//>` : Object.entries(powers).map(([name, pw]) => {
      const active = pw.until > now;
      return html`<div class="row sp nw" key=${name} style="padding:8px 0"><div><b style="text-transform:capitalize">${name}</b><div class="small dim">${g.powerInfo[name]}</div></div>
        ${active ? html`<${Chip} cls="good">active ${fmtDur(pw.until - now)}<//>` : pw.used ? html`<span class="dim small">used</span>` : html`<${AsyncBtn} class="sm" confirm=${'Use ' + name + ' now? One use only.'} onClick=${() => act('use_power', { power: name })}>Use<//>`}</div>`; })}</div>`}
    <${Standings} ...${ctx} />
    ${g.tags.length > 0 && html`<div class="card"><p class="eyebrow">Recent tags</p>${g.tags.slice().reverse().slice(0, 8).map((t) => html`<div class="small" key=${t.t}>${fmtTime(t.t)} - ${team(st, t.from).name} tagged ${team(st, t.to).name}</div>`)}</div>`}
  </div>`;
}
