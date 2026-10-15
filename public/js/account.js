import { html, useState, useEffect } from '/vendor/preact.js';
import { api, toast } from './api.js';
import { t, getLang } from './i18n.js';
import { AsyncBtn, Chip, Field, Modal, Mochi, Ico, Switch, copy, fmtDateTime } from './ui.js';
import { setPrefs } from './theme.js';
import { go } from './home.js';

// ---------------------------------------------------------------- state (one account per browser, token kept locally)
const KEY = 'jll.acct';
let token = null, me = null, cat = null;
try { token = localStorage.getItem(KEY); } catch {}
const subs = new Set();
const emit = () => subs.forEach((f) => f());
export const accountToken = () => token;
export function useAccount() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  return { me, token, cat };
}
const call = (method, path, body) => api(method, '/account' + path, body, null);

export async function loadCatalog() {
  if (!cat) { cat = await api('GET', '/account/catalog'); cat.byId = Object.fromEntries(cat.items.map((i) => [i.id, i])); emit(); }
  return cat;
}
const itemName = (id) => (cat && cat.byId[id] ? cat.byId[id].name : id);
const achOf = (id) => cat && cat.ach.find((a) => a.id === id);
export const achText = (a) => (a.tr[getLang()] || a.tr.en);

function announce(pending) {
  for (const ev of pending || []) {
    if (ev.k === 'ach') { const a = achOf(ev.id); if (a) toast(t('acct.n_ach', { name: achText(a).name }), true); }
    else if (ev.k === 'item') toast(t('acct.n_item', { name: itemName(ev.item) }), true);
    else if (ev.k === 'encounter') toast(t('acct.n_encounter'), true);
    else if (ev.k === 'daily') toast(t('acct.n_daily', { dust: ev.dust, n: ev.streak }), true);
  }
}

// the equipped theme / font become the active look
export function applyEquip(v) {
  if (!v || !v.equip) return;
  const e = v.equip;
  const root = document.documentElement;
  root.setAttribute('data-skin', e.skin || 's_peach');
  setPrefs({ theme: e.theme || 'sakura' });
}

export async function loadMe(quiet) {
  if (!token) { me = null; emit(); return null; }
  try {
    await loadCatalog();
    const v = await call('GET', '/me');
    me = v;
    if (!quiet) announce(v.pending);
    document.documentElement.setAttribute('data-skin', v.equip.skin || 's_peach');
  } catch (e) { if (e.status === 401) { token = null; me = null; try { localStorage.removeItem(KEY); } catch {} } }
  emit();
  return me;
}
export const ownedSet = () => new Set([...(cat ? cat.base : []), ...(me ? me.owned : [])]);

async function authed(path, name, password) {
  const d = await call('POST', path, { name, password });
  token = d.token;
  try { localStorage.setItem(KEY, token); } catch {}
  await loadCatalog();
  me = d.me; announce(d.me.pending); applyEquip(d.me); emit();
}
export const login = (n, p) => authed('/login', n, p);
export const register = (n, p) => authed('/register', n, p);
export async function logout() { try { await call('POST', '/logout', {}); } catch {} token = null; me = null; try { localStorage.removeItem(KEY); } catch {} document.documentElement.removeAttribute('data-skin'); emit(); }
export async function equip(body) { await call('POST', '/equip', body); await loadMe(true); if (body.kind === 'theme' || body.kind === 'skin') applyEquip(me); }
export async function linkGame(code, gameToken) { if (!token) return; try { await api('POST', `/games/${code}/link`, {}, gameToken); } catch {} }
if (token) setTimeout(() => loadMe(), 0);

// ---------------------------------------------------------------- small pieces
const Fold2 = ({ title, right, open = false, cls = '', children }) => html`<details class="card fold ${cls}" open=${open}><summary><h3>${title}</h3>${right}</summary><div class="fold-body">${children}</div></details>`;
const RAR = ['common', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
const rarName = (r) => t('rar.' + r);
export function Avatar({ name, frame = 'f_plain', skin = 's_peach', size = 64 }) {
  return html`<span class="avatar ${frame}" data-skin=${skin} style=${{ width: size + 'px', height: size + 'px', fontSize: size * 0.42 + 'px' }}><b>${(name || '?').slice(0, 1).toUpperCase()}</b></span>`;
}
const Badge = ({ id }) => html`<span class="badge ${id}" title=${itemName(id)}></span>`;
const Tile = ({ it, owned, on, onClick, children }) => html`<button class="tile r-${it.rarity} ${owned ? '' : 'locked'} ${on ? 'on' : ''}" onClick=${onClick} disabled=${!onClick}>
  <span class="tn">${owned || it.pool === 'std' || it.pool === 'achv' ? it.name : '???'}</span>
  <span class="tr">${rarName(it.rarity)}</span>${children}</button>`;

function AuthForm({ onDone }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const go_ = async () => { try { await (mode === 'login' ? login : register)(name.trim(), pw); onDone && onDone(); return true; } catch (e) { toast(e.message); return false; } };
  return html`<div class="stack"><p class="dim small" style="margin:0">${t('acct.why')}</p>
    <${Field} label=${t('acct.name')}><input value=${name} maxlength="16" autocomplete="username" onInput=${(e) => setName(e.target.value)} /><//>
    <${Field} label=${t('acct.password')}><input type="password" value=${pw} autocomplete=${mode === 'login' ? 'current-password' : 'new-password'} onInput=${(e) => setPw(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && go_()} /><//>
    <${AsyncBtn} class="block" onClick=${go_}>${mode === 'login' ? t('acct.login') : t('acct.register')}<//>
    <button class="link" onClick=${() => setMode(mode === 'login' ? 'register' : 'login')}>${mode === 'login' ? t('acct.to_register') : t('acct.to_login')}</button></div>`;
}
export function AuthModal({ onClose }) { return html`<${Modal} title=${t('acct.title')} onClose=${onClose}><${AuthForm} onDone=${onClose} /><//>`; }

// small chip for the home page / settings: opens the profile or the login dialog
export function AccountButton() {
  const { me: m } = useAccount();
  const [open, setOpen] = useState(false);
  return html`<span><button class="ghost sm" onClick=${() => (m ? go('#/me') : setOpen(true))}>${m ? m.name : t('acct.title')}</button>${open && html`<${AuthModal} onClose=${() => setOpen(false)} />`}</span>`;
}

// ---------------------------------------------------------------- widgets
const STAT_KEYS = ['games_played', 'wins', 'tasks_done', 'territories', 'first_claims', 'cards_played', 'questions_asked', 'found', 'tags_made', 'dest_claims', 'shop_buys', 'encounters', 'best_streak'];
function WStats({ v }) { return html`<div class="statgrid">${STAT_KEYS.map((k) => html`<div class="stat" key=${k}><b>${v.stats[k] || 0}</b><span>${t('acct.s_' + k)}</span></div>`)}</div>`; }
function WAch({ v }) {
  const done = cat.ach.filter((a) => v.ach[a.id]);
  return html`<div class="small dim">${t('acct.achievements', { a: done.length, b: cat.ach.length })}</div><div class="chips">${done.sort((x, y) => v.ach[y.id] - v.ach[x.id]).slice(0, 12).map((a) => html`<${Chip} cls="good" key=${a.id}>${achText(a).name}<//>`)}</div>`;
}
function WCollection({ v }) {
  return html`<div class="rarbar">${RAR.map((r) => html`<span class="rc r-${r}" key=${r}><b>${v.counts[r] || 0}</b>${rarName(r)}</span>`)}</div>`;
}
function WStreak({ v, own }) { const s = v.streak || { n: 0, best: v.stats.best_streak }; return html`<div class="row"><span class="big">${s.n || v.stats.best_streak || 0}</span><span class="dim small">${t('acct.streak', { n: s.n || 0 })} - ${t('acct.best', { n: s.best || v.stats.best_streak || 0 })}</span></div>`; }
function WTimeline({ v }) {
  return html`<div class="list">${(v.recent || []).length === 0 ? html`<span class="dim small">-</span>` : v.recent.map((e, i) => html`<div class="row sp small" key=${i}><span>${e.kind === 'ach' ? (achOf(e.id) ? achText(achOf(e.id)).name : e.id) : e.kind === 'item' ? itemName(e.item) : t('acct.n_encounter')}</span><span class="dim">${fmtDateTime(e.t)}</span></div>`)}</div>`;
}
function WRarest({ v }) { return html`<div class="chips">${v.rarest.map((id) => html`<span class="chip r-${cat.byId[id].rarity}" key=${id}>${itemName(id)}</span>`)}</div>`; }
function WCabinet({ v }) {
  const items = RAR.slice().reverse().flatMap((r) => v.owned.filter((i) => cat.byId[i].rarity === r && cat.byId[i].kind !== 'widget'));
  return html`<div class="cabinet">${items.slice(0, 18).map((id) => html`<span class="trophy r-${cat.byId[id].rarity}" title=${itemName(id)} key=${id}></span>`)}</div>`;
}
function WRadar({ v }) {
  const row = (label, a, b) => html`<div class="radar"><span class="small">${label}</span><i><u style=${{ width: Math.min(100, a / b * 100) + '%' }}></u></i><span class="small dim">${a}/${b}</span></div>`;
  return html`${row(t('acct.radar_epic'), v.pity.se, 30)}${row(t('acct.radar_leg'), v.pity.sl, 90)}${row(t('acct.radar_ani'), v.pity.al, 10)}${row(t('acct.radar_myth'), v.pity.am, 40)}`;
}
const WIDGETS = { w_stats: WStats, w_ach: WAch, w_collection: WCollection, w_streak: WStreak, w_timeline: WTimeline, w_rarest: WRarest, w_cabinet: WCabinet, w_radar: WRadar };
function Widgets({ v, own }) {
  const ids = (v.equip.widgets || []).filter((w) => WIDGETS[w] && (own || w !== 'w_radar'));
  return html`<div class="widgets">${ids.map((w) => { const W = WIDGETS[w]; return html`<${Fold2} key=${w} cls="widget" title=${itemName(w)} open=${!['w_stats', 'w_ach', 'w_collection'].includes(w)}><${W} v=${v} own=${own} /><//>`; })}</div>`;
}

// ---------------------------------------------------------------- collection and equip
const KINDS = ['theme', 'title', 'frame', 'skin', 'badge', 'widget'];
function Collection({ v }) {
  const owned = ownedSet();
  const eq = v.equip;
  const isOn = (it) => (it.kind === 'badge' ? (eq.badges || []).includes(it.id) : it.kind === 'widget' ? (eq.widgets || []).includes(it.id) : eq[it.kind === 'theme' || it.kind === 'title' || it.kind === 'frame' || it.kind === 'skin' ? it.kind : ''] === it.id);
  const click = async (it) => {
    try {
      if (it.kind === 'badge' || it.kind === 'widget') {
        const key = it.kind === 'badge' ? 'badges' : 'widgets', cur = eq[key] || [];
        await equip({ kind: key, items: cur.includes(it.id) ? cur.filter((x) => x !== it.id) : [...cur, it.id] });
      } else await equip({ kind: it.kind, item: isOn(it) && (it.kind === 'title') ? null : it.id });
    } catch (e) { toast(e.message); }
  };
  return html`<${Fold2} title=${t('acct.collection')} right=${html`<span class="chip plain">${t('acct.owned', { a: v.owned.length, b: cat.items.filter((i) => i.pool !== 'base').length })}</span>`}>
    ${KINDS.map((k) => { const list = cat.items.filter((i) => i.kind === k).sort((a, b) => RAR.indexOf(a.rarity) - RAR.indexOf(b.rarity));
      return html`<div key=${k}><p class="eyebrow mt">${t('acct.kind_' + k)}</p>
        <div class="tiles">${list.map((it) => html`<${Tile} key=${it.id} it=${it} owned=${owned.has(it.id)} on=${isOn(it)} onClick=${owned.has(it.id) ? () => click(it) : null}>
          ${!owned.has(it.id) && it.pool === 'achv' && html`<span class="small dim">${t('acct.how_ach')}</span>`}
          ${k === 'badge' && html`<${Badge} id=${it.id} />`}<//>`)}</div></div>`; })}<//>`;
}

function Achievements({ v }) {
  return html`<${Fold2} title=${t('acct.achievements', { a: cat.ach.filter((a) => v.ach[a.id]).length, b: cat.ach.length })}>
    <div class="achs">${cat.ach.map((a) => { const x = achText(a), done = v.ach[a.id], val = a.stat === 'streak' ? v.stats.best_streak || 0 : a.stat === 'modes' ? v.stats.modes || 0 : a.stat === 'items' ? v.owned.length : (v.stats[a.stat] || 0);
      const r = a.reward;
      return html`<div class="ach ${done ? 'done' : ''}" key=${a.id}><b>${x.name}</b><span class="small">${x.desc}</span>
        <i class="pbar"><u style=${{ width: Math.min(100, (done ? a.goal : Math.min(val, a.goal)) / a.goal * 100) + '%' }}></u></i>
        <span class="small dim">${done ? fmtDateTime(done) : (['mythics', 'themes_owned', 'secret'].includes(a.stat) ? '' : val + '/' + a.goal)} ${r.dust ? '+' + r.dust : ''}${r.std ? ' +' + r.std + ' T' : ''}${r.sakura ? ' +' + r.sakura + ' S' : ''}${r.item ? ' + ' + itemName(r.item) : ''}</span></div>`; })}</div><//>`;
}

function Header({ v, own }) {
  const e = v.equip, nextLv = Math.pow(v.level, 2) * 60, curLv = Math.pow(v.level - 1, 2) * 60;
  return html`<section class="card profile-head"><div class="row nw" style="gap:14px"><${Avatar} name=${v.name} frame=${e.frame} skin=${e.skin} size=${76} />
    <div class="grow"><h1 style="margin:0;font-size:1.5rem">${v.name}</h1>${e.title && html`<div class="title-tag">${itemName(e.title)}</div>`}
      <div class="small dim">${t('acct.level', { n: v.level })}</div><i class="pbar"><u style=${{ width: Math.min(100, (v.xp - curLv) / (nextLv - curLv) * 100) + '%' }}></u></i></div></div>
    ${(e.badges || []).length > 0 && html`<div class="row mt" style="gap:8px">${e.badges.map((b) => html`<${Badge} id=${b} key=${b} />`)}</div>`}
</section>`;
}

// owner tools: only shown for the account(s) the server owner names (JETLAG_OWNER or data/owner.json); the server checks it again
function OwnerTools({ v }) {
  const [stat, setStat] = useState('tasks_done'), [val, setVal] = useState('100');
  const run = async (body, ok) => { try { await call('POST', '/owner', body); await loadMe(true); if (ok) toast(ok, true); return true; } catch (e) { toast(e.message); return false; } };
  const owned = ownedSet();
  return html`<section class="card accent"><div class="sec-h"><h2>${t('acct.owner')}</h2></div><p class="small dim" style="margin-top:0">${t('acct.owner_hint')}</p>
    <div class="row mt" style="flex-wrap:wrap"><${AsyncBtn} class="sm soft" onClick=${() => run({ action: 'all_items' }, t('saved'))}>${t('acct.all_items')}<//>
      <${AsyncBtn} class="sm soft" onClick=${() => run({ action: 'ach', id: 'all' }, t('saved'))}>${t('acct.all_ach')}<//></div>
    <p class="eyebrow mt">${t('acct.owner_items')}</p>
    <div class="tiles">${cat.items.filter((i) => i.pool !== 'base').map((it) => html`<${Tile} key=${it.id} it=${it} owned=${owned.has(it.id)} on=${owned.has(it.id)} onClick=${() => run({ action: 'item', id: it.id, have: !owned.has(it.id) })}><//>`)}</div>
    <p class="eyebrow mt">${t('acct.owner_ach')}</p>
    <div class="chips">${cat.ach.map((a) => html`<button class="sm ${v.ach[a.id] ? '' : 'ghost'}" key=${a.id} onClick=${() => run({ action: 'ach', id: a.id, have: !v.ach[a.id] })}>${achText(a).name}</button>`)}</div>
    <p class="eyebrow mt">${t('acct.owner_stat')}</p>
    <div class="row nw"><select value=${stat} onChange=${(e) => setStat(e.target.value)}>${['games_played', 'wins', 'tasks_done', 'territories', 'first_claims', 'cards_played', 'picks_taken', 'questions_asked', 'found', 'tags_made', 'dest_claims', 'shop_buys', 'encounters', 'night'].map((k) => html`<option value=${k} key=${k}>${k}</option>`)}</select>
      <input type="number" value=${val} onInput=${(e) => setVal(e.target.value)} /><${AsyncBtn} class="sm" onClick=${() => run({ action: 'stat', stat, value: +val || 0 }, t('saved'))}>${t('acct.give')}<//></div>
    <${AsyncBtn} class="danger block mt" confirm=${t('acct.reset_confirm')} onClick=${() => run({ action: 'reset' }, t('saved'))}>${t('acct.reset')}<//></section>`;
}

export function ProfilePage() {
  const { me: m } = useAccount();
  const [auth, setAuth] = useState(false);
  useEffect(() => { loadCatalog().then(() => loadMe(true)); const id = setInterval(() => loadMe(), 60000); return () => clearInterval(id); }, []);
  if (!cat) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /></div>`;
  if (!m) return html`<div class="wrap"><div class="row"><button class="ghost icon" aria-label=${t('back')} onClick=${() => go('#/')}><${Ico} n="back" /></button><h2 style="margin:0">${t('acct.title')}</h2></div><div class="card mt"><${AuthForm} /></div></div>`;
  return html`<div class="wrap"><div class="row sp"><button class="ghost icon" aria-label=${t('back')} onClick=${() => go('#/')}><${Ico} n="back" /></button>
      <span class="row"><button class="ghost sm" onClick=${() => { const url = location.origin + '/#/u/' + m.name; copy(url); toast(t('copied'), true); }}>${t('acct.share')}</button></span></div>
    <div class="stack mt"><${Header} v=${m} own=${true} /><${Widgets} v=${m} own=${true} /><${Collection} v=${m} /><${Achievements} v=${m} />
      ${m.owner && html`<${OwnerTools} v=${m} />`}
      <section class="card"><${Switch} checked=${m.public} onChange=${(val) => equip({ kind: 'public', value: val })}>${t('acct.public')}<//>
        <button class="ghost block mt" onClick=${() => { logout(); go('#/'); }}>${t('acct.logout')}</button></section></div></div>`;
}

export function PublicProfile({ name }) {
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { loadCatalog().then(() => api('GET', '/account/u/' + encodeURIComponent(name))).then(setV).catch((e) => setErr(e.message)); }, [name]);
  if (err) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /><p class="dim">${err}</p><button onClick=${() => go('#/')}>${t('nf.back')}</button></div>`;
  if (!v || !cat) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /></div>`;
  const items = cat.items.filter((i) => v.owned.includes(i.id)).sort((a, b) => RAR.indexOf(b.rarity) - RAR.indexOf(a.rarity));
  return html`<div class="wrap"><div class="row"><button class="ghost icon" aria-label=${t('back')} onClick=${() => go('#/')}><${Ico} n="back" /></button></div>
    <div class="stack mt"><${Header} v=${v} own=${false} /><${Widgets} v=${v} own=${false} />
      <${Fold2} title=${t('acct.collection')}><div class="tiles">${items.map((it) => html`<${Tile} key=${it.id} it=${it} owned=${true} />`)}</div><//>
      <${Fold2} title=${t('acct.achievements', { a: Object.keys(v.ach).length, b: cat.ach.length })}>
        <div class="achs">${cat.ach.filter((a) => v.ach[a.id]).map((a) => html`<div class="ach done" key=${a.id}><b>${achText(a).name}</b><span class="small">${achText(a).desc}</span><span class="small dim">${fmtDateTime(v.ach[a.id])}</span></div>`)}</div><//></div></div>`;
}

// Console command: type  coc  in the browser console (F12) on this website. Works only for the owner account (the server checks it).
let cocBusy = 0;
const COC = { help: 'coc = unlock every collectible on the logged-in owner account' };
async function cocRun() {
  if (Date.now() - cocBusy < 3000) return;
  cocBusy = Date.now();
  if (!token) { console.warn('coc: log in to your account first (#/me)'); return; }
  try { await call('POST', '/owner', { action: 'all_items' }); await loadMe(true); console.log('coc: every item is unlocked - open your profile (#/me)'); }
  catch (e) { console.warn('coc: ' + (e.status === 403 ? 'this account is not the owner' : e.message)); }
}
try { Object.defineProperty(window, 'coc', { configurable: true, get() { cocRun(); return COC; } }); } catch {}
