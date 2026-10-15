import { html, useState, useEffect } from '/vendor/preact.js';
import { api, toast } from './api.js';
import { t } from './i18n.js';
import { Mochi, Ico, Seg } from './ui.js';
import { Avatar, Header, Stats, themeName, itemName, loadCatalog, call, getCatalog, useAccount, AuthModal } from './account.js';
import { refreshSocial, openFriends } from './friends.js';
import { ThemeCard } from './characters.js';
import { go } from './home.js';

const RAR = ['common', 'rare', 'epic', 'legendary', 'mythic'];
const open = (name) => go('#/u/' + encodeURIComponent(name));
const TABS = ['level', 'wins', 'games', 'tasks'];
const stat = (p, tab) => (tab === 'level' ? t('people.lv', { n: p.level }) : tab === 'wins' ? p.stats.wins : tab === 'games' ? p.stats.games_played : p.stats.tasks_done);

// ---------------------------------------------------------------- one person: avatar, name, title, level (tap = open the profile)
export function PersonRow({ p, tab = 'level', rank }) {
  const e = p.equip || {};
  return html`<button class="person" onClick=${() => open(p.name)}>
    ${rank != null && html`<span class="rk">${rank}</span>`}
    <span class="av"><${Avatar} name=${p.name} frame=${e.frame} skin=${e.skin} size=${44} />${p.online && html`<i class="on"></i>`}</span>
    <span class="who"><b>${p.name}</b>${p.owner && html` <span class="chip plain">${t('people.owner')}</span>`}
      <small>${e.title ? itemName(e.title) : p.first + ' ' + p.last}</small></span>
    <span class="val"><b>${stat(p, tab)}</b>${tab !== 'level' && html`<small>${t('people.lv', { n: p.level })}</small>`}</span></button>`;
}

// the three best: a podium (2nd, 1st, 3rd)
function Podium({ list, tab }) {
  if (list.length < 3) return list.map((p, i) => html`<${PersonRow} p=${p} tab=${tab} rank=${i + 1} key=${p.name} />`);
  return html`<div class="podium">${[1, 0, 2].map((i) => { const p = list[i], e = p.equip || {};
    return html`<button class="step s${i + 1}" key=${p.name} onClick=${() => open(p.name)}><span class="n">${i + 1}</span>
      <${Avatar} name=${p.name} frame=${e.frame} skin=${e.skin} size=${i === 0 ? 64 : 52} /><b>${p.name}</b><small>${stat(p, tab)}</small></button>`; })}</div>`;
}

// ---------------------------------------------------------------- the community: search, leaderboards, who is online, new players
export function CommunityPage() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [tab, setTab] = useState('level');
  const [err, setErr] = useState(null);
  useEffect(() => { loadCatalog().then(() => api('GET', '/account/community')).then(setData).catch((e) => setErr(e.message)); }, []);
  useEffect(() => {
    if (!q.trim()) { setFound(null); return; }
    const id = setTimeout(() => api('GET', '/account/people?q=' + encodeURIComponent(q.trim())).then(setFound).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [q]);
  const back = html`<button class="ghost icon" aria-label=${t('back')} onClick=${() => go('#/')}><${Ico} n="back" /></button>`;
  if (err) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /><p class="dim">${err}</p></div>`;
  if (!data || !getCatalog()) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /></div>`;
  const top = data.top[tab];
  return html`<div class="wrap"><div class="row sp">${back}<span class="dim small">${t('people.players', { n: data.total })}</span></div>
    <div class="stack mt"><section class="card"><h1 style="margin:0 0 8px;font-size:1.5rem">${t('people.title')}</h1>
      <input type="search" placeholder=${t('people.search')} value=${q} onInput=${(e) => setQ(e.target.value)} />
      ${found && html`<div class="people mt">${found.length === 0 ? html`<p class="dim small">${t('people.none')}</p>` : found.map((p) => html`<${PersonRow} p=${p} key=${p.name} />`)}</div>`}</section>
    ${!found && html`<section class="card"><div class="sec-h"><h2>${t('people.top')}</h2></div>
      <${Seg} options=${TABS.map((k) => [k, t('people.tab_' + k)])} value=${tab} onChange=${setTab} />
      <div class="people mt">${top.length === 0 ? html`<p class="dim small">${t('people.nobody')}</p>` : html`<${Podium} list=${top.slice(0, 3)} tab=${tab} />${top.slice(3).map((p, i) => html`<${PersonRow} p=${p} tab=${tab} rank=${i + 4} key=${p.name} />`)}`}</div></section>
    <section class="card"><div class="sec-h"><h2>${t('people.online_now')}</h2><span class="chip plain">${data.online.length}</span></div>
      <div class="people">${data.online.length === 0 ? html`<p class="dim small">${t('people.nobody')}</p>` : data.online.map((p) => html`<${PersonRow} p=${p} key=${p.name} />`)}</div></section>
    <section class="card"><div class="sec-h"><h2>${t('people.new')}</h2></div>
      <div class="people">${data.newest.map((p) => html`<${PersonRow} p=${p} key=${p.name} />`)}</div></section>`}</div></div>`;
}

// ---------------------------------------------------------------- friend buttons on a profile (add / accept / message ...)
function Relation({ v, onChange }) {
  const { me } = useAccount();
  const [login, setLogin] = useState(false);
  const act = async (action) => { try { await call('POST', '/friends', { action, name: v.name }); await refreshSocial(); onChange(); } catch (e) { toast(e.message); } };
  if (!me) return html`<div class="row"><button class="sm" onClick=${() => setLogin(true)}>${t('people.login_to_add')}</button>${login && html`<${AuthModal} onClose=${() => setLogin(false)} />`}</div>`;
  if (v.rel === 'me') return null;
  return html`<div class="row" style="gap:8px;flex-wrap:wrap">
    ${v.rel === 'none' && html`<button class="sm" onClick=${() => act('request')}>${t('people.add')}</button>`}
    ${v.rel === 'out' && html`<span class="chip plain">${t('people.sent')}</span><button class="sm ghost" onClick=${() => act('cancel')}>${t('cancel')}</button>`}
    ${v.rel === 'in' && html`<button class="sm" onClick=${() => act('accept')}>${t('friends.accept')}</button><button class="sm ghost" onClick=${() => act('decline')}>${t('friends.decline')}</button>`}
    ${v.rel === 'friend' && html`<span class="chip">${t('people.friends')}</span><button class="sm" onClick=${() => openFriends(v.name)}>${t('people.message')}</button>
      <button class="sm ghost" onClick=${() => confirm(t('friends.remove_confirm', { name: v.name })) && act('remove')}>${t('friends.remove')}</button>`}</div>`;
}

// ---------------------------------------------------------------- someone's public profile
export function PublicProfile({ name }) {
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => loadCatalog().then(() => api('GET', '/account/u/' + encodeURIComponent(name))).then(setV).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [name]);
  const back = html`<div class="row"><button class="ghost icon" aria-label=${t('back')} onClick=${() => (history.length > 1 ? history.back() : go('#/people'))}><${Ico} n="back" /></button></div>`;
  if (err) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /><p class="dim">${err}</p><button onClick=${() => go('#/people')}>${t('nf.back')}</button></div>`;
  const cat = getCatalog();
  if (!v || !cat) return html`<div class="wrap center"><${Mochi} size=${90} mood="sleepy" /></div>`;
  const owned = new Set([...cat.base, ...v.owned]);
  const counts = RAR.map((r) => [r, cat.items.filter((i) => i.rarity === r && owned.has(i.id)).length]);
  return html`<div class="wrap">${back}<div class="stack mt"><${Header} v=${v} />
    <section class="card"><div class="facts">
      <div><b>#${v.rank}</b><span>${t('people.rank')}</span></div><div><b>${v.level}</b><span>${t('people.level')}</span></div>
      <div><b>${v.friendCount}</b><span>${t('people.friends_n')}</span></div><div><b>${new Date(v.created).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</b><span>${t('people.member_since')}</span></div></div>
      <div class="row mt" style="gap:8px"><span class="presence ${v.online ? 'on' : ''}"><i></i>${v.online ? t('people.online') : t('people.offline')}</span></div>
      <div class="mt"><${Relation} v=${v} onChange=${load} /></div></section>
    ${v.equip.theme && html`<${ThemeCard} theme=${v.equip.theme} name=${themeName(v.equip.theme)} />`}
    <${Stats} v=${v} />
    <section class="card"><div class="sec-h"><h2>${t('people.collection')}</h2></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">${counts.map(([r, n]) => html`<span class="chip rar-${r}" key=${r}>${t('rar.' + r)}: ${n}</span>`)}</div></section>
    ${v.friends.length > 0 && html`<section class="card"><div class="sec-h"><h2>${t('people.friends_n')}</h2><span class="chip plain">${v.friendCount}</span></div>
      <div class="friends-grid">${v.friends.map((f) => html`<button class="fcell" key=${f.name} onClick=${() => open(f.name)}><${Avatar} name=${f.name} frame=${(f.equip || {}).frame} skin=${(f.equip || {}).skin} size=${48} /><small>${f.name}</small></button>`)}</div></section>`}
    </div></div>`;
}
