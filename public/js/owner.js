import { html, useState, useEffect } from '/vendor/preact.js';
import { toast } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, Chip, Field, Mochi, Ico, fmtDateTime } from './ui.js';
import { go } from './home.js';
import { call, loadCatalog, loadMe, useAccount, getCatalog, achText, switchToToken, Tile } from './account.js';

// Owner console: every account and every game. Only the server owner (JETLAG_OWNER / data/owner.json) gets past the server check.
const guard = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok, true); return r === undefined ? true : r; } catch (e) { toast(e.message); return false; } };
const num = (v) => (v === '' || isNaN(+v) ? 0 : +v);

// ---------------------------------------------------------------- one account
function AccountPanel({ id, onChange }) {
  const cat = getCatalog();
  const [v, setV] = useState(null);
  const [stat, setStat] = useState('tasks_done'), [val, setVal] = useState('100');
  const [pw, setPw] = useState(''), [name, setName] = useState('');
  const run = (body, ok) => guard(async () => { const r = await call('POST', '/owner/accounts/' + id, body); setV(r.view); onChange && onChange(); return r; }, ok);
  useEffect(() => { call('GET', '/owner/accounts/' + id).then(setV).catch((e) => toast(e.message)); }, [id]);
  if (!v) return html`<p class="dim small">...</p>`;
  const has = new Set(v.owned);
  const pick = (kind, label) => html`<${Field} label=${label}><select value=${v.equip[kind] || ''} onChange=${(e) => run({ action: 'equip', kind, item: e.target.value || null })}>
    ${kind === 'title' && html`<option value="">-</option>`}${cat.items.filter((i) => i.kind === kind).map((i) => html`<option value=${i.id} key=${i.id}>${i.name}</option>`)}</select><//>`;
  return html`<div class="stack owner-panel">
    <div class="row" style="flex-wrap:wrap;gap:8px"><${Chip}>id ${v.id}<//><${Chip}>${t('owner.devices', { n: v.devices })}<//><${Chip}>${t('acct.level', { n: v.level })}<//></div>
    <div class="row" style="flex-wrap:wrap;gap:8px">${pick('theme', t('acct.kind_theme'))}${pick('title', t('acct.kind_title'))}${pick('frame', t('acct.kind_frame'))}${pick('skin', t('acct.kind_skin'))}</div>
    <div class="row" style="flex-wrap:wrap"><${AsyncBtn} class="sm soft" onClick=${() => run({ action: 'all_items' }, t('saved'))}>${t('owner.all_items')}<//>
      <${AsyncBtn} class="sm soft" onClick=${() => run({ action: 'ach', id: 'all' }, t('saved'))}>${t('owner.all_ach')}<//></div>
    <p class="eyebrow">${t('owner.items')}</p>
    <div class="tiles compact">${cat.items.filter((i) => i.pool === 'std').map((it) => html`<${Tile} key=${it.id} it=${it} owned=${has.has(it.id)} on=${has.has(it.id)} onClick=${() => run({ action: 'item', id: it.id, have: !has.has(it.id) })}><//>`)}</div>
    <p class="eyebrow">${t('owner.ach')}</p>
    <div class="chips">${cat.ach.map((a) => html`<button class="sm ${v.ach[a.id] ? '' : 'ghost'}" key=${a.id} onClick=${() => run({ action: 'ach', id: a.id, have: !v.ach[a.id] })}>${achText(a).name}</button>`)}</div>
    <p class="eyebrow">${t('owner.stats')}</p>
    <div class="row nw"><select value=${stat} onChange=${(e) => setStat(e.target.value)}>${['games_played', 'games_finished', 'wins', 'tasks_done', 'territories', 'first_claims', 'cards_played', 'picks_taken', 'questions_asked', 'found', 'tags_made', 'dest_claims', 'shop_buys', 'encounters', 'night'].map((k) => html`<option key=${k} value=${k}>${k} (${v.stats[k] || 0})</option>`)}</select>
      <input type="number" value=${val} onInput=${(e) => setVal(e.target.value)} /><${AsyncBtn} class="sm" onClick=${() => run({ action: 'stat', stat, value: num(val) }, t('saved'))}>${t('owner.set')}<//>
      <${AsyncBtn} class="sm ghost" onClick=${() => run({ action: 'xp', value: num(val) }, t('saved'))}>XP (${v.xp})<//></div>
    <div class="row nw"><input placeholder=${t('owner.new_password')} value=${pw} onInput=${(e) => setPw(e.target.value)} /><${AsyncBtn} class="sm" disabled=${pw.length < 6} onClick=${async () => { if (await run({ action: 'set_password', password: pw }, t('saved'))) setPw(''); }}>${t('owner.set_password')}<//></div>
    <p class="small dim" style="margin:0">${t('owner.hash_note')}</p>
    <div class="row nw"><input placeholder=${t('owner.new_name')} value=${name} onInput=${(e) => setName(e.target.value)} /><${AsyncBtn} class="sm" disabled=${name.length < 3} onClick=${async () => { if (await run({ action: 'rename', name }, t('saved'))) setName(''); }}>${t('owner.rename')}<//></div>
    <div class="row" style="flex-wrap:wrap"><${AsyncBtn} class="sm" onClick=${async () => { const r = await guard(() => call('POST', '/owner/accounts/' + id, { action: 'impersonate' })); if (r && r.token) switchToToken(r.token); }}>${t('owner.login_as')}<//>
      <${AsyncBtn} class="sm danger" confirm=${t('acct.reset_confirm')} onClick=${() => run({ action: 'reset' }, t('saved'))}>${t('acct.reset')}<//>
      <${AsyncBtn} class="sm danger" confirm=${t('owner.delete_confirm')} onClick=${async () => { if (await run({ action: 'delete' })) onChange && onChange(true); }}>${t('owner.delete')}<//></div></div>`;
}

function Accounts() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const refresh = (closed) => { if (closed === true) setOpen(null); call('GET', '/owner/accounts').then(setList).catch((e) => toast(e.message)); };
  useEffect(refresh, []);
  const rows = (list || []).filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
  return html`<section class="card"><div class="sec-h"><h2>${t('owner.accounts')}</h2><span class="chip plain">${list ? list.length : '...'}</span></div>
    <input placeholder=${t('owner.search')} value=${q} onInput=${(e) => setQ(e.target.value)} />
    <div class="list mt">${rows.map((a) => html`<div key=${a.id} class="owner-row"><div class="row sp nw" onClick=${() => setOpen(open === a.id ? null : a.id)} style="cursor:pointer"><span><b>${a.name}</b> <span class="small dim">${t('acct.level', { n: a.level })} - ${a.items} ${t('owner.items_short')} - ${a.ach} ${t('owner.ach_short')} - ${fmtDateTime(a.created)}</span></span><${Ico} n=${open === a.id ? 'close' : 'back'} size=${14} /></div>
      ${open === a.id && html`<${AccountPanel} id=${a.id} onChange=${refresh} />`}</div>`)}</div></section>`;
}

// ---------------------------------------------------------------- one game
const getPath = (root, path) => path.reduce((n, k) => (n == null ? n : n[k]), root);
function GamePanel({ code, onChange }) {
  const [d, setD] = useState(null);
  const [path, setPath] = useState(''), [value, setValue] = useState('');
  const [mid, setMid] = useState(''), [type, setType] = useState('play_card'), [payload, setPayload] = useState('{}');
  const [pin, setPin] = useState('');
  const [raw, setRaw] = useState(false);
  const load = () => document.hidden ? null : call('GET', '/owner/games/' + code).then((x) => { setD(x); if (!mid) setMid(Object.keys(x.members)[0] || ''); }).catch((e) => toast(e.message));
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [code]);
  const run = (body, ok) => guard(async () => { await call('POST', '/owner/games/' + code, body); await load(); onChange && onChange(); }, ok);
  if (!d) return html`<p class="dim small">...</p>`;
  const admin = Object.values(d.members).find((m) => m.role === 'admin');
  const act = (type_, payload_ = {}, who = admin) => run({ action: 'act', memberId: who.id, type: type_, payload: payload_ }, t('saved'));
  const parsed = () => { try { return JSON.parse(value); } catch { return value; } };
  const shown = path.trim() ? getPath(d, path.trim().split('.')) : undefined;
  return html`<div class="stack owner-panel">
    <div class="row" style="flex-wrap:wrap;gap:8px"><${Chip}>${d.mode}<//><${Chip} cls=${d.status === 'running' ? 'good' : ''}>${d.status}<//><${Chip}>${t('owner.settled')}: ${String(!!d.settled)}<//></div>
    ${admin && html`<div class="row" style="flex-wrap:wrap"><${AsyncBtn} class="sm" onClick=${() => act('pause', { reason: 'owner' })}>${t('admin.pause')}<//><${AsyncBtn} class="sm" onClick=${() => act('resume')}>${t('admin.resume')}<//>
      <${AsyncBtn} class="sm danger" confirm=${t('admin.end_confirm')} onClick=${() => act('end')}>${t('admin.end')}<//>
      <${AsyncBtn} class="sm" onClick=${() => { const text = prompt(t('admin.announce')); if (text) act('announce', { text }); }}>${t('admin.announce')}<//></div>`}
    <p class="eyebrow">${t('owner.members')}</p>
    <div class="list">${Object.values(d.members).map((m) => html`<div class="row sp small" key=${m.id}><span><b>${m.name}</b> ${m.role}${m.teamId && d.teams[m.teamId] ? ' / ' + d.teams[m.teamId].name : ''}${m.accountName ? ' / ' + m.accountName : ''}</span><span class="dim mono">${m.id}</span></div>`)}</div>
    <div class="row nw"><select value=${mid} onChange=${(e) => setMid(e.target.value)}>${Object.values(d.members).map((m) => html`<option key=${m.id} value=${m.id}>${m.name}</option>`)}</select>
      <input placeholder="PIN" value=${pin} onInput=${(e) => setPin(e.target.value)} /><${AsyncBtn} class="sm" disabled=${!/^\d{4,8}$/.test(pin)} onClick=${() => run({ action: 'set_pin', memberId: mid, pin }, t('saved'))}>${t('owner.set_pin')}<//></div>
    <p class="small dim" style="margin:0">${t('owner.hash_note')}</p>
    <p class="eyebrow">${t('owner.act_as')}</p>
    <div class="row nw"><input placeholder="type (play_card, adjust, pause, ...)" value=${type} onInput=${(e) => setType(e.target.value)} /></div>
    <textarea rows="3" value=${payload} onInput=${(e) => setPayload(e.target.value)} placeholder='{"iid": "..."}'></textarea>
    <${AsyncBtn} class="sm" onClick=${() => { let p; try { p = JSON.parse(payload || '{}'); } catch { return toast('JSON?'); } return act(type, p, d.members[mid]); }}>${t('owner.run')}<//>
    <p class="eyebrow">${t('owner.edit_value')}</p>
    <input placeholder="data.teams.<id>.bonusMin" value=${path} onInput=${(e) => setPath(e.target.value)} />
    ${path.trim() && html`<pre class="small owner-json">${JSON.stringify(shown, null, 1) || 'undefined'}</pre>`}
    <div class="row nw"><input placeholder='JSON: 10, "text", {"a":1}' value=${value} onInput=${(e) => setValue(e.target.value)} /><${AsyncBtn} class="sm" disabled=${!path.trim()} onClick=${() => run({ action: 'patch', path: path.trim().split('.'), value: parsed() }, t('saved'))}>${t('owner.set')}<//></div>
    <details onToggle=${(e) => setRaw(e.target.open)}><summary class="small">${t('owner.raw')}</summary>${raw && html`<pre class="small owner-json">${JSON.stringify(d, null, 1)}</pre>`}</details>
    <${AsyncBtn} class="sm danger" confirm=${t('owner.delete_confirm')} onClick=${async () => { if (await run({ action: 'delete' })) onChange && onChange(true); }}>${t('owner.delete_game')}<//></div>`;
}

function Games() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const refresh = (closed) => { if (closed === true) setOpen(null); call('GET', '/owner/games').then(setList).catch((e) => toast(e.message)); };
  useEffect(() => { refresh(); const id = setInterval(() => document.hidden || refresh(), 15000); return () => clearInterval(id); }, []);
  return html`<section class="card"><div class="sec-h"><h2>${t('owner.games')}</h2><span class="chip plain">${list ? list.length : '...'}</span></div>
    <div class="list">${(list || []).map((g) => html`<div key=${g.code} class="owner-row"><div class="row sp nw" onClick=${() => setOpen(open === g.code ? null : g.code)} style="cursor:pointer">
      <span><b>${g.name}</b> <span class="chip plain mono">${g.code}</span> <span class="small dim">${g.mode} - ${g.status} - ${g.players} ${t('owner.players')} - ${g.admin} - ${fmtDateTime(g.createdAt)}</span></span><${Ico} n=${open === g.code ? 'close' : 'back'} size=${14} /></div>
      ${open === g.code && html`<${GamePanel} code=${g.code} onChange=${refresh} />`}</div>`)}</div></section>`;
}

export function OwnerPage() {
  const { me: m } = useAccount();
  useEffect(() => { loadCatalog().then(() => loadMe(true)); }, []);
  if (!getCatalog() || !m) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /></div>`;
  if (!m.owner) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /><p class="dim">${t('nf.title')}</p><button onClick=${() => go('#/')}>${t('nf.back')}</button></div>`;
  return html`<div class="wrap"><div class="row"><button class="ghost icon" aria-label=${t('back')} onClick=${() => go('#/me')}><${Ico} n="back" /></button><h2 style="margin:0">${t('owner.console')}</h2></div>
    <div class="stack mt"><${Accounts} /><${Games} /></div></div>`;
}
