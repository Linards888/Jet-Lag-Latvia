import { html, useState, useEffect } from '/vendor/preact.js';
import { api, toast } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, Field, Modal, Mochi, Ico, Switch, copy } from './ui.js';
import { setPrefs, useTheme } from './theme.js';
import { go } from './home.js';
import { ThemeCard } from './characters.js';
import { InstallCard } from './install.js';

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

// the secret look is in no public list: it reaches the page only inside the holder's own /me
function mergeSecret(m) {
  for (const it of (m && m.secret) || []) if (cat && !cat.byId[it.id]) { cat.items.push(it); cat.byId[it.id] = it; }
}

function announce(pending) {
  for (const ev of pending || []) if (ev.k === 'item') toast(t('acct.n_item', { name: itemName(ev.item) }), true);
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
    mergeSecret(me);
    if (!quiet) announce(me.pending);
    document.documentElement.setAttribute('data-skin', me.equip.skin || 's_peach');
    const cur = document.documentElement.getAttribute('data-theme');
    if (cur && !ownedSet().has(cur)) applyEquip(me);  // a look that was taken back
  } catch (e) { if (e.status === 401) { token = null; me = null; store(KEY, null); } }
  emit();
  return me;
}
export const ownedSet = () => new Set([...(cat ? cat.base : ['sakura', 'sora', 'latvija']), ...(me ? me.owned : [])]);

async function authed(path, body) {
  const d = await call('POST', path, body);
  token = d.token; store(KEY, token); store(OWNER_KEY, null);
  await loadCatalog();
  me = d.me; mergeSecret(me); announce(d.me.pending); applyEquip(d.me); emit();
}
export const login = (name, password) => authed('/login', { name, password });
export const register = (first, last, name, password) => authed('/register', { first, last, name, password });
export async function logout() {
  try { await call('POST', '/logout', {}); } catch {}
  token = null; me = null; store(KEY, null); store(OWNER_KEY, null);
  document.documentElement.removeAttribute('data-skin'); emit();
}
export async function equip(body) { await call('POST', '/equip', body); await loadMe(true); if (body.kind === 'theme' || body.kind === 'skin') applyEquip(me); }
export async function saveProfile(body) { await call('POST', '/profile', body); await loadMe(true); }
export async function linkGame(code, gameToken) { if (token) { try { await api('POST', `/games/${code}/link`, {}, gameToken); } catch {} } }
// the owner can open any account; the owner's own session is kept so they can switch back
export function switchToToken(newToken) { if (!load(OWNER_KEY)) store(OWNER_KEY, token); store(KEY, newToken); location.hash = '#/me'; location.reload(); }
export function returnToOwner() { store(KEY, load(OWNER_KEY)); store(OWNER_KEY, null); location.hash = '#/me'; location.reload(); }
export const isImpersonating = () => !!load(OWNER_KEY);
if (token) setTimeout(() => loadMe(), 0);

// ---------------------------------------------------------------- small pieces
const RAR = ['common', 'rare', 'epic', 'legendary', 'mythic'];
const KINDS = ['theme', 'title', 'frame', 'skin', 'symbol'];
export function Avatar({ name, frame = 'f_plain', skin = 's_peach', size = 64 }) {
  return html`<span class="avatar ${frame}" data-skin=${skin} style=${{ width: size + 'px', height: size + 'px', fontSize: size * 0.42 + 'px' }}><b>${(name || '?').slice(0, 1).toUpperCase()}</b></span>`;
}
export const Sym = ({ id }) => html`<span class="symbol ${id}" title=${itemName(id)}></span>`;
export const Tile = ({ it, owned, on, onClick, children }) => html`<button class="tile r-${it.rarity} ${owned ? '' : 'locked'} ${on ? 'on' : ''}" onClick=${onClick} disabled=${!onClick}>${children}</button>`;

// ---------------------------------------------------------------- sign in / create account (a real account is needed to play)
export function AuthForm({ onDone }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ first: '', last: '', name: '', pw: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    try { await (mode === 'login' ? login(f.name.trim(), f.pw) : register(f.first, f.last, f.name.trim(), f.pw)); onDone && onDone(); return true; } catch (e) { toast(e.message); return false; }
  };
  return html`<div class="stack"><p class="dim small" style="margin:0">${t('acct.why')}</p>
    ${mode === 'register' && html`<div class="row nw"><${Field} label=${t('acct.first')}><input value=${f.first} maxlength="24" autocomplete="given-name" onInput=${set('first')} /><//>
      <${Field} label=${t('acct.last')}><input value=${f.last} maxlength="24" autocomplete="family-name" onInput=${set('last')} /><//></div>`}
    <${Field} label=${t('acct.name')}><input value=${f.name} maxlength="16" autocomplete="username" onInput=${set('name')} /><//>
    <${Field} label=${t('acct.password')}><input type="password" value=${f.pw} autocomplete=${mode === 'login' ? 'current-password' : 'new-password'} onInput=${set('pw')} onKeyDown=${(e) => e.key === 'Enter' && submit()} /><//>
    <${AsyncBtn} class="block" onClick=${submit}>${mode === 'login' ? t('acct.login') : t('acct.register')}<//>
    <button class="link" onClick=${() => setMode(mode === 'login' ? 'register' : 'login')}>${mode === 'login' ? t('acct.to_register') : t('acct.to_login')}</button></div>`;
}
export function AuthModal({ onClose }) { return html`<${Modal} title=${t('acct.title')} onClose=${onClose}><${AuthForm} onDone=${onClose} /><//>`; }
// wrap a page that needs an account: shows the sign-in form instead until the player has one
export function RequireAccount({ children }) {
  const { me: m } = useAccount();
  return m ? children : html`<div class="card"><h2>${t('acct.need')}</h2><${AuthForm} /></div>`;
}

// button for the global bar and game topbar: opens the profile or the sign-in dialog
export function AccountButton() {
  const { me: m } = useAccount();
  const [open, setOpen] = useState(false);
  return html`<span><button class="ghost sm" onClick=${() => (m ? go('#/me') : setOpen(true))}>${m ? m.name : t('acct.title')}</button>${open && html`<${AuthModal} onClose=${() => setOpen(false)} />`}</span>`;
}

// ---------------------------------------------------------------- profile
const statValue = (v, stat) => v.stats[stat] || 0;
const STAT_KEYS = ['games_played', 'wins', 'tasks_done', 'territories', 'first_claims', 'cards_played', 'questions_asked', 'found', 'tags_made', 'dest_claims', 'shop_buys', 'encounters', 'streak'];
const OwnerMark = () => html`<a class="owner-mark" href=${cat.ownerSite} target="_blank" rel="noopener noreferrer"><i></i>${t('acct.owner_mark')}<b>${cat.ownerSite.replace('https://', '')}</b></a>`;

export function Header({ v, own, onEdit }) {
  const e = v.equip, nextLv = Math.pow(v.level, 2) * 60, curLv = Math.pow(v.level - 1, 2) * 60;
  return html`<section class="card profile-head"><div class="row nw" style="gap:14px"><${Avatar} name=${v.name} frame=${e.frame} skin=${e.skin} size=${76} />
    <div class="grow"><div class="row sp nw"><h1 style="margin:0;font-size:1.5rem">${v.name}</h1>${own && html`<button class="ghost sm" onClick=${onEdit}>${t('acct.edit')}</button>`}</div>
      <div class="small dim">${v.first} ${v.last}</div>${e.title && html`<div class="title-tag">${itemName(e.title)}</div>`}
      ${(e.symbols || []).length > 0 && html`<div class="row" style="gap:8px;margin:4px 0">${e.symbols.map((y) => html`<${Sym} id=${y} key=${y} />`)}</div>`}
      <div class="small dim">${t('acct.level', { n: v.level })}</div><i class="pbar"><u style=${{ width: Math.min(100, (v.xp - curLv) / (nextLv - curLv) * 100) + '%' }}></u></i></div></div>
    ${v.owner && html`<div class="mt"><${OwnerMark} /></div>`}${v.bio && html`<p class="bio">${v.bio}</p>`}</section>`;
}
export const Stats = ({ v }) => html`<section class="card"><div class="sec-h"><h2>${t('acct.stats')}</h2></div><div class="statgrid">${STAT_KEYS.map((k) => html`<div class="stat" key=${k}><b>${statValue(v, k)}</b><span>${t('acct.s_' + k)}</span></div>`)}</div></section>`;
export const themeName = (id) => (cat.byId[id] ? cat.byId[id].name : id);

// ---------------------------------------------------------------- edit: bio, name and the whole look (hidden behind the small Edit button)
const SLOT = { symbol: 'symbols' };
function EditModal({ v, onClose }) {
  const [f, setF] = useState({ first: v.first, last: v.last, bio: v.bio });
  const [info, setInfo] = useState(null);  // the locked item whose unlock hint is shown
  const owned = ownedSet(), eq = v.equip;
  const locked = v.newcomerUntil > Date.now() && !v.owner;
  const click = async (it) => {
    try {
      if (it.kind === 'symbol') { const cur = eq.symbols || []; await equip({ kind: 'symbols', items: cur.includes(it.id) ? cur.filter((x) => x !== it.id) : [...cur, it.id].slice(-3) }); }
      else await equip({ kind: it.kind, item: it.kind === 'title' && eq.title === it.id ? null : it.id });
    } catch (e) { toast(e.message); }
  };
  const removeSecret = async () => { if (!confirm(t('secret.drop_confirm'))) return; try { await call('POST', '/secret', { action: 'drop' }); await loadMe(true); } catch (e) { toast(e.message); } };
  const isOn = (it) => (it.kind === 'symbol' ? (eq.symbols || []).includes(it.id) : eq[it.kind] === it.id);
  const save = async () => { try { await saveProfile(f); toast(t('saved'), true); return true; } catch (e) { toast(e.message); return false; } };
  const how = (it) => (it.vis === 'show' && it.stat ? t('acct.how_to', { what: t('acct.s_' + it.stat), n: it.goal, have: Math.min(statValue(v, it.stat), it.goal) }) : t('acct.how_unknown'));
  return html`<${Modal} title=${t('acct.edit')} onClose=${onClose} wide=${true}><div class="stack">
    <div class="row nw"><${Field} label=${t('acct.first')}><input value=${f.first} maxlength="24" onInput=${(e) => setF({ ...f, first: e.target.value })} /><//><${Field} label=${t('acct.last')}><input value=${f.last} maxlength="24" onInput=${(e) => setF({ ...f, last: e.target.value })} /><//></div>
    <${Field} label=${t('acct.bio')}><textarea rows="3" maxlength="300" value=${f.bio} placeholder=${t('acct.bio_ph')} onInput=${(e) => setF({ ...f, bio: e.target.value })}></textarea><//>
    <${AsyncBtn} class="sm" onClick=${save}>${t('acct.save')}<//>
    ${KINDS.map((k) => html`<div key=${k}><p class="eyebrow mt">${t('acct.kind_' + k)}${k === 'symbol' ? ' (' + t('acct.max3') + ')' : ''}</p>${info && info.kind === k && html`<div class="callout"><b>${info.name}</b> (${t('rar.' + info.rarity)}): ${how(info)}</div>`}${k === 'title' && locked && html`<p class="small dim" style="margin:0 0 6px">${t('acct.newcomer_lock')}</p>`}
      ${k === 'theme' && owned.has('onimai') && html`<button class="sm ghost" style="margin:0 0 6px" onClick=${removeSecret}>${t('secret.drop')}</button>`}
      <div class="tiles compact">${cat.items.filter((i) => i.kind === k && (owned.has(i.id) || i.vis !== 'hidden')).sort((a, b) => RAR.indexOf(a.rarity) - RAR.indexOf(b.rarity)).map((it) => {
        const has = owned.has(it.id);
        return html`<${Tile} key=${it.id} it=${it} owned=${has} on=${isOn(it)} onClick=${has ? (k === 'title' && locked ? null : () => click(it)) : () => setInfo(it)}><span class="tn">${it.name}</span>${k === 'symbol' && html`<${Sym} id=${it.id} />`}<//>`; })}</div></div>`)}
    <${Switch} checked=${v.public} onChange=${(val) => equip({ kind: 'public', value: val })}>${t('acct.public')}<//>
    <${Switch} checked=${v.showTheme} onChange=${(val) => equip({ kind: 'showTheme', value: val })}>${t('acct.show_theme')}<//></div><//>`;
}

export function ProfilePage() {
  const { me: m } = useAccount();
  const theme = useTheme();
  const [edit, setEdit] = useState(false);
  useEffect(() => { loadCatalog().then(() => loadMe(true)); const id = setInterval(() => document.hidden || loadMe(true), 60000); return () => clearInterval(id); }, []);
  if (!cat) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /></div>`;
  const back = html`<button class="ghost icon" aria-label=${t('back')} onClick=${() => go('#/')}><${Ico} n="back" /></button>`;
  if (!m) return html`<div class="wrap"><div class="row">${back}<h2 style="margin:0">${t('acct.title')}</h2></div><div class="card mt"><${AuthForm} /></div></div>`;
  return html`<div class="wrap"><div class="row sp">${back}<span class="row" style="gap:8px">
      ${isImpersonating() && html`<button class="sm" onClick=${returnToOwner}>${t('owner.back')}</button>`}
      ${m.owner && html`<button class="sm soft" onClick=${() => go('#/owner')}>${t('owner.console')}</button>`}
      <button class="ghost sm" onClick=${() => go('#/people')}>${t('people.find')}</button>
      <button class="ghost sm" onClick=${() => { copy(location.origin + '/#/u/' + m.name); toast(t('copied'), true); }}>${t('acct.share')}</button></span></div>
    <div class="stack mt"><${Header} v=${m} own=${true} onEdit=${() => setEdit(true)} /><${ThemeCard} theme=${theme} name=${themeName(theme)} /><${Stats} v=${m} /><${InstallCard} />
      <section class="card"><button class="ghost block" onClick=${() => { logout(); go('#/'); }}>${t('acct.logout')}</button></section></div>
    ${edit && html`<${EditModal} v=${m} onClose=${() => setEdit(false)} />`}</div>`;
}
