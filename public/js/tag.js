import { html, useState } from '/vendor/preact.js';
import { META } from './api.js';
import { AsyncBtn, Chip, fmtDur, fmtKm, dist, fmtTime } from './ui.js';
import { LMap } from './map.js';

export function tabs(st) { return [{ id: 'map', label: '🗺 Map' }, ...(st.me.plays ? [{ id: 'play', label: '🎯 Play' }] : []), { id: 'board', label: '🏆 Board' }]; }

const team = (st, id) => st.teams.find((t) => t.id === id) || { name: '?', color: '#777' };

export function View(ctx) {
  if (ctx.st.status === 'lobby') return null;
  return ctx.tab === 'map' ? html`<${MapTab} ...${ctx} />` : ctx.tab === 'play' ? html`<${Play} ...${ctx} />` : html`<${Board} ...${ctx} />`;
}

function Banner({ st, now }) {
  const g = st.g, off = now - st.now;
  const w = g.window;
  const meIt = st.me.teamId === g.it;
  return html`<div class="card ${meIt ? 'hl' : ''}"><div class="row sp"><div><h2>${meIt ? '🔴 YOU ARE IT!' : `🔴 IT: ${team(st, g.it).name}`}</h2>
      <div class="small dim">${meIt ? 'Tag another team before you rack up time.' : st.me.teamId ? 'Run! Stay away from IT.' : ''}</div></div>
    <div class="stat"><div class="v">${fmtDur(g.itMs[st.me.teamId || g.it] + (st.me.teamId === g.it || !st.me.teamId ? off : 0), false)}</div><div class="k">${st.me.teamId ? 'your IT time' : 'IT time'}</div></div></div>
    ${st.settings.useWindow && html`<p class="small ${w.open ? 'ok' : 'warn'}">${w.open ? '🟢 Play window open' : '🌙 Outside the play window - clock stopped, rest.'}</p>`}
    <p class="small dim">Game time left: ${fmtDur(g.remainingMs)}</p></div>`;
}

function MapTab(ctx) {
  const { st, loc } = ctx;
  const g = st.g;
  const items = [];
  for (const p of g.positions) {
    const t = team(st, p.teamId);
    for (const l of p.locs) items.push({ k: 'marker', lat: l.lat, lng: l.lng, color: p.teamId === g.it ? '#ff2d3d' : t.color, text: p.teamId === g.it ? '!' : t.name[0],
      label: `${t.name} - ${l.name}${p.live ? '' : ' (' + fmtTime(l.t) + ')'}`, z: p.teamId === g.it ? 1000 : 500 });
  }
  if (loc.pos) items.push({ k: 'circle', lat: loc.pos.lat, lng: loc.pos.lng, r: Math.max(loc.pos.acc, 15), color: '#5aa9e6' });
  return html`<div><${Banner} ...${ctx} />
    <${LMap} items=${items} munis=${META.munis} muniColor=${() => '#4a3439'} fitKey="tag" />
    <div class="card"><h3>Who can you see?</h3>${g.positions.map((p) => html`<div class="row sp" key=${p.teamId} style="padding:4px 0"><${Chip} color=${team(st, p.teamId).color} cls=${p.teamId === g.it ? 'tag-it' : ''}>${team(st, p.teamId).name}${p.teamId === g.it ? ' (IT)' : ''}<//>
      <span class="small dim">${p.hidden ? '🙈 hidden' : p.locs.length ? (p.live ? '🟢 live' : '🕒 delayed ' + st.settings.itDelayMin + ' min') : 'no position yet'}</span></div>`)}</div></div>`;
}

function Play(ctx) {
  const { st, act, loc, now } = ctx;
  const g = st.g;
  const mine = st.me.teamId;
  const meIt = mine === g.it;
  const powers = g.powers[mine] || {};
  const targets = st.teams.filter((t) => t.id !== g.it);
  const [sel, setSel] = useState('');
  const target = sel || (targets[0] && targets[0].id);
  const near = (tid) => { const p = g.positions.find((x) => x.teamId === tid); if (!p || !loc.pos || !p.locs.length) return null; return Math.min(...p.locs.map((l) => dist(loc.pos, l))); };
  return html`<div><${Banner} ...${ctx} />
    ${meIt && html`<div class="card hl"><h2>Tag someone</h2><p class="small dim">Get within ~${st.settings.tagRadiusM} m of the other team. Both phones must have fresh GPS. Their position on your map is ${st.settings.itDelayMin} min old.</p>
      ${targets.map((t) => { const imm = g.immune[t.id], sh = g.shielded.includes(t.id); const d = near(t.id);
        return html`<label class="chk" key=${t.id} style="opacity:${imm || sh ? 0.5 : 1}"><input type="radio" name="tg" checked=${target === t.id} onChange=${() => setSel(t.id)} />
          <i class="dot" style=${{ background: t.color, marginRight: '6px' }}></i>${t.name}${imm ? ' 🛡 immune ' + fmtDur(imm - now) : ''}${sh ? ' ⭐ shielded' : ''}${d != null ? html`<span class="dim small" style="margin-left:8px">last seen ${fmtKm(d)} from you</span>` : ''}</label>`; })}
      <${AsyncBtn} class="block" style="background:#c0152b" disabled=${!target} onClick=${() => act('tag', { targetTeamId: target })}>👆 TAG!<//></div>`}
    ${!meIt && g.immune[mine] && html`<div class="card">🛡 You are immune from IT for ${fmtDur(g.immune[mine] - now)}.</div>`}
    ${st.settings.allStars && html`<div class="card"><h2>⭐ Your powers</h2>${Object.keys(powers).length === 0 ? html`<p class="dim">No powers.</p>` : Object.entries(powers).map(([name, pw]) => {
      const active = pw.until > now;
      return html`<div class="row sp" key=${name} style="padding:6px 0"><div><b>${name.toUpperCase()}</b><div class="small dim">${g.powerInfo[name]}</div></div>
        ${active ? html`<span class="ok">active ${fmtDur(pw.until - now)}</span>` : pw.used ? html`<span class="dim">used</span>` : html`<${AsyncBtn} class="sm" confirm=${'Use ' + name + ' now? One use only.'} onClick=${() => act('use_power', { power: name })}>Use<//>`}</div>`; })}</div>`}
    <div class="card small dim">Keep this page open (screen on) so your position is shared. Public transport only!</div></div>`;
}

function Board({ st, now }) {
  const g = st.g;
  return html`<div>
    <div class="card"><h2>Ranking - least time as IT wins</h2>${g.ranking.map((id, i) => { const t = team(st, id);
      return html`<div class="row sp" key=${id} style="padding:8px 0"><span>${i + 1}. <i class="dot" style=${{ background: t.color }}></i> <b>${t.name}</b> ${id === g.it ? html`<${Chip} cls="tag-it">IT<//>` : ''}
        <span class="small dim">${st.members.filter((m) => m.teamId === id).map((m) => m.name).join(', ')}</span></span><b>${fmtDur(g.itMs[id] + (id === g.it && st.status === 'running' ? now - st.now : 0))}</b></div>`; })}</div>
    <div class="card"><h3>Tag history</h3>${g.tags.length === 0 ? html`<p class="dim">No tags yet.</p>` : g.tags.slice().reverse().map((t) => html`<div class="small" key=${t.t}>${fmtTime(t.t)} - ${team(st, t.from).name} tagged ${team(st, t.to).name}</div>`)}</div></div>`;
}
