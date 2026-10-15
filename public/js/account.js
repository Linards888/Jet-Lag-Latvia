import { html, useState, useEffect } from '/vendor/preact.js';
import { api, toast } from './api.js';
import { t, getLang } from './i18n.js';
import { AsyncBtn, Field, Modal, Mochi, Ico, Switch, copy, fmtDateTime } from './ui.js';
import { setPrefs, useTheme } from './theme.js';
import { go } from './home.js';
import { ThemeCard } from './characters.js';

// ---------------------------------------------------------------- state (one account per browser, token kept locally)
const KEY = 'jll.acct', OWNER_KEY = 'jll.acct.owner';
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
let token = load(KEY), me = null, cat = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
export const accountToken = () => token;
export function useAccount() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  return { me, token, cat };
}
export const call = (method, path, body) => api(method, '/account' + path, body, null);

export async function loadCatalog() {
  if (!cat) { cat = await api('GET', '/account/catalog'); cat.byId = Object.fromEntries(cat.items.map((i) => [i.id, i])); emit(); }
  return cat;
}
export const getCatalog = () => cat;
export const itemName = (id) => (cat && cat.byId[id] ? cat.byId[id].name : id);
export const achText = (a) => a.tr[getLang()] || a.tr.en;

function announce(pending) {
  for (const ev of pending || []) {
    if (ev.k === 'item') toast(t('acct.n_item', { name: itemName(ev.item) }), true);
    else if (ev.k === 'encounter') toast(t('acct.n_encounter'), true);
  }
}

// the equipped theme / mascot skin become the active look (done on login and when equipping, not on every load, so the local choice sticks)
export function applyEquip(v) {
  if (!v || !v.equip) return;
  document.documentElement.setAttribute('data-skin', v.equip.skin || 's_peach');
  setPrefs({ theme: v.equip.theme || 'sakura' });
}

export async function loadMe(quiet) {
  if (!token) { me = null; emit(); return null; }
  try {
    await loadCatalog();
    me = await call('GET', '/me');
    if (!quiet) announce(me.pending);
    document.documentElement.setAttribute('data-skin', me.equip.skin || 's_peach');
  } catch (e) { if (e.status === 401) { token = null; me = null; store(KEY, null); } }
  emit();
  return me;
}
export const ownedSet = () => new Set([...(cat ? cat.items.filter((i) => i.pool === 'base').map((i) => i.id) : []), ...(me ? me.owned : [])]);

async function authed(path, name, password) {
  const d = await call('POST', path, { name, password });
  token = d.token; store(KEY, token); store(OWNER_KEY, null);
  await loadCatalog();
  me = d.me; announce(d.me.pending); applyEquip(d.me); emit();
}
export const login = (n, p) => authed('/login', n, p);
export const register = (n, p) => authed('/register', n, p);
export async function logout() {
  try { await call('POST', '/logout', {}); } catch {}
  token = null; me = null; store(KEY, null); store(OWNER_KEY, null);
  document.documentElement.removeAttribute('data-skin'); emit();
}
export async function equip(body) { await call('POST', '/equip', body); await loadMe(true); if (body.kind === 'theme' || body.kind === 'skin') applyEquip(me); }
export async function linkGame(code, gameToken) { if (token) { try { await api('POST', `/games/${code}/link`, {}, gameToken); } catch {} } }
// the owner can open any account; the owner's own session is kept so they can switch back
export function switchToToken(newToken) { if (!load(OWNER_KEY)) store(OWNER_KEY, token); store(KEY, newToken); location.hash = '#/me'; location.reload(); }
export function returnToOwner() { store(KEY, load(OWNER_KEY)); store(OWNER_KEY, null); location.hash = '#/me'; location.reload(); }
export const isImpersonating = () => !!load(OWNER_KEY);
if (token) setTimeout(() => loadMe(), 0);

// ---------------------------------------------------------------- small pieces
const RAR = ['common', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
export function Avatar({ name, frame = 'f_plain', skin = 's_peach', size = 64 }) {
  return html`<span class="avatar ${frame}" data-skin=${skin} style=${{ width: size + 'px', height: size + 'px', fontSize: size * 0.42 + 'px' }}><b>${(name || '?').slice(0, 1).toUpperCase()}</b></span>`;
}
export const Badge = ({ id }) => html`<span class="badge ${id}" title=${itemName(id)}></span>`;
export const Tile = ({ it, owned, on, onClick, children }) => html`<button class="tile r-${it.rarity} ${owned ? '' : 'locked'} ${on ? 'on' : ''}" onClick=${onClick} disabled=${!onClick}>
  <span class="tn">${it.name}</span>${children}</button>`;

function AuthForm({ onDone }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const submit = async () => { try { await (mode === 'login' ? login : register)(name.trim(), pw); onDone && onDone(); return true; } catch (e) { toast(e.message); return false; } };
  return html`<div class="stack"><p class="dim small" style="margin:0">${t('acct.why')}</p>
    <${Field} label=${t('acct.name')}><input value=${name} maxlength="16" autocomplete="username" onInput=${(e) => setName(e.target.value)} /><//>
    <${Field} label=${t('acct.password')}><input type="password" value=${pw} autocomplete=${mode === 'login' ? 'current-password' : 'new-password'} onInput=${(e) => setPw(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && submit()} /><//>
    <${AsyncBtn} class="block" onClick=${submit}>${mode === 'login' ? t('acct.login') : t('acct.register')}<//>
    <button class="link" onClick=${() => setMode(mode === 'login' ? 'register' : 'login')}>${mode === 'login' ? t('acct.to_register') : t('acct.to_login')}</button></div>`;
}
export function AuthModal({ onClose }) { return html`<${Modal} title=${t('acct.title')} onClose=${onClose}><${AuthForm} onDone=${onClose} /><//>`; }

// button on the home page: opens the profile or the login dialog
export function AccountButton() {
  const { me: m } = useAccount();
  const [open, setOpen] = useState(false);
  return html`<span><button class="ghost sm" onClick=${() => (m ? go('#/me') : setOpen(true))}>${m ? m.name : t('acct.title')}</button>${open && html`<${AuthModal} onClose=${() => setOpen(false)} />`}</span>`;
}

// ---------------------------------------------------------------- profile widgets (the Stats one is always shown)
const STAT_KEYS = ['games_played', 'wins', 'tasks_done', 'territories', 'first_claims', 'cards_played', 'questions_asked', 'found', 'tags_made', 'dest_claims', 'shop_buys', 'encounters', 'best_streak'];
const WStats = ({ v }) => html`<div class="statgrid">${STAT_KEYS.map((k) => html`<div class="stat" key=${k}><b>${v.stats[k] || 0}</b><span>${t('acct.s_' + k)}</span></div>`)}</div>`;
const WStreak = ({ v }) => html`<div class="row"><span class="big">${(v.streak && v.streak.n) || 0}</span><span class="dim small">${t('acct.streak', { n: (v.streak && v.streak.n) || 0 })} - ${t('acct.best', { n: v.stats.best_streak || 0 })}</span></div>`;
const WTimeline = ({ v }) => html`<div class="list">${(v.recent || []).length === 0 ? html`<span class="dim small">-</span>` : v.recent.map((e, i) => html`<div class="row sp small" key=${i}><span>${e.kind === 'item' ? itemName(e.item) : e.kind === 'ach' ? achText(cat.ach.find((a) => a.id === e.id) || { tr: { en: { name: e.id } } }).name : t('acct.n_encounter')}</span><span class="dim">${fmtDateTime(e.t)}</span></div>`)}</div>`;
const WRarest = ({ v }) => html`<div class="chips">${v.rarest.map((id) => html`<span class="chip r-${cat.byId[id].rarity}" key=${id}>${itemName(id)}</span>`)}</div>`;
const WCabinet = ({ v }) => html`<div class="cabinet">${RAR.slice().reverse().flatMap((r) => v.owned.filter((i) => cat.byId[i].rarity === r && cat.byId[i].kind !== 'widget')).slice(0, 24).map((id) => html`<span class="trophy r-${cat.byId[id].rarity}" title=${itemName(id)} key=${id}></span>`)}</div>`;
const WIDGETS = { w_stats: WStats, w_streak: WStreak, w_timeline: WTimeline, w_rarest: WRarest, w_cabinet: WCabinet };
const Widgets = ({ v }) => html`<div class="widgets">${(v.equip.widgets || []).filter((w) => WIDGETS[w]).map((w) => { const W = WIDGETS[w]; return html`<section class="card widget" key=${w}><div class="sec-h"><h3 style="margin:0">${itemName(w)}</h3></div><${W} v=${v} /></section>`; })}</div>`;

// ---------------------------------------------------------------- collection: compact tiles, tap to equip
const KINDS = ['theme', 'title', 'frame', 'skin', 'badge', 'widget'];
const SLOT = { badge: 'badges', widget: 'widgets' };
function Collection({ v }) {
  const owned = ownedSet(), eq = v.equip;
  const isOn = (it) => (SLOT[it.kind] ? (eq[SLOT[it.kind]] || []).includes(it.id) : eq[it.kind] === it.id);
  const click = async (it) => {
    try {
      if (SLOT[it.kind]) { const cur = eq[SLOT[it.kind]] || []; await equip({ kind: SLOT[it.kind], items: cur.includes(it.id) ? cur.filter((x) => x !== it.id) : [...cur, it.id] }); }
      else await equip({ kind: it.kind, item: it.kind === 'title' && isOn(it) ? null : it.id });
    } catch (e) { toast(e.message); }
  };
  const shown = (it) => it.pool === 'base' || owned.has(it.id) || it.kind !== 'theme';
  return html`<section class="card"><div class="sec-h"><h2>${t('acct.collection')}</h2><span class="chip plain">${t('acct.owned', { a: v.owned.length, b: cat.items.filter((i) => i.pool !== 'base' && shown(i)).length })}</span></div>
    ${KINDS.map((k) => html`<div key=${k}><p class="eyebrow mt">${t('acct.kind_' + k)}</p><div class="tiles compact">${cat.items.filter((i) => i.kind === k && shown(i)).sort((a, b) => RAR.indexOf(a.rarity) - RAR.indexOf(b.rarity)).map((it) =>
      html`<${Tile} key=${it.id} it=${it} owned=${owned.has(it.id)} on=${isOn(it)} onClick=${owned.has(it.id) ? () => click(it) : null}>${k === 'badge' && html`<${Badge} id=${it.id} />`}<//>`)}</div></div>`)}</section>`;
}

export function Header({ v }) {
  const e = v.equip, nextLv = Math.pow(v.level, 2) * 60, curLv = Math.pow(v.level - 1, 2) * 60;
  return html`<section class="card profile-head"><div class="row nw" style="gap:14px"><${Avatar} name=${v.name} frame=${e.frame} skin=${e.skin} size=${76} />
    <div class="grow"><h1 style="margin:0;font-size:1.5rem">${v.name}</h1>${e.title && html`<div class="title-tag">${itemName(e.title)}</div>`}
      <div class="small dim">${t('acct.level', { n: v.level })}</div><i class="pbar"><u style=${{ width: Math.min(100, (v.xp - curLv) / (nextLv - curLv) * 100) + '%' }}></u></i></div></div>
    ${(e.badges || []).length > 0 && html`<div class="row mt" style="gap:8px">${e.badges.map((b) => html`<${Badge} id=${b} key=${b} />`)}</div>`}</section>`;
}
const themeName = (id) => (cat.byId[id] ? cat.byId[id].name : id);

export function ProfilePage() {
  const { me: m } = useAccount();
  const theme = useTheme();
  useEffect(() => { loadCatalog().then(() => loadMe(true)); const id = setInterval(() => loadMe(true), 60000); return () => clearInterval(id); }, []);
  if (!cat) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /></div>`;
  const back = html`<button class="ghost icon" aria-label=${t('back')} onClick=${() => go('#/')}><${Ico} n="back" /></button>`;
  if (!m) return html`<div class="wrap"><div class="row">${back}<h2 style="margin:0">${t('acct.title')}</h2></div><div class="card mt"><${AuthForm} /></div></div>`;
  return html`<div class="wrap"><div class="row sp">${back}<span class="row" style="gap:8px">
      ${isImpersonating() && html`<button class="sm" onClick=${returnToOwner}>${t('owner.back')}</button>`}
      ${m.owner && html`<button class="sm soft" onClick=${() => go('#/owner')}>${t('owner.console')}</button>`}
      <button class="ghost sm" onClick=${() => { copy(location.origin + '/#/u/' + m.name); toast(t('copied'), true); }}>${t('acct.share')}</button></span></div>
    <div class="stack mt"><${Header} v=${m} /><${ThemeCard} theme=${theme} name=${themeName(theme)} /><${Widgets} v=${m} /><${Collection} v=${m} />
      <section class="card"><${Switch} checked=${m.public} onChange=${(val) => equip({ kind: 'public', value: val })}>${t('acct.public')}<//>
        <button class="ghost block mt" onClick=${() => { logout(); go('#/'); }}>${t('acct.logout')}</button></section></div></div>`;
}

export function PublicProfile({ name }) {
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { loadCatalog().then(() => api('GET', '/account/u/' + encodeURIComponent(name))).then(setV).catch((e) => setErr(e.message)); }, [name]);
  const back = html`<div class="row"><button class="ghost icon" aria-label=${t('back')} onClick=${() => go('#/')}><${Ico} n="back" /></button></div>`;
  if (err) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /><p class="dim">${err}</p><button onClick=${() => go('#/')}>${t('nf.back')}</button></div>`;
  if (!v || !cat) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /></div>`;
  const items = cat.items.filter((i) => v.owned.includes(i.id)).sort((a, b) => RAR.indexOf(b.rarity) - RAR.indexOf(a.rarity));
  return html`<div class="wrap">${back}<div class="stack mt"><${Header} v=${v} /><${ThemeCard} theme=${v.equip.theme || 'sakura'} name=${themeName(v.equip.theme || 'sakura')} /><${Widgets} v=${v} />
      <section class="card"><div class="sec-h"><h2>${t('acct.collection')}</h2></div><div class="tiles compact">${items.map((it) => html`<${Tile} key=${it.id} it=${it} owned=${true} />`)}</div></section></div></div>`;
}
