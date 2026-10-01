import { html, useState, useEffect } from '/vendor/preact.js';
import { saved, api, toast, META, pushStatus, enablePush, disablePush } from './api.js';
import { t, LANGS, getLang, setLang } from './i18n.js';
import { AsyncBtn, Chip, Field, Modal, fmtDateTime, Seg } from './ui.js';
import { AppearancePanel } from './theme.js';
import { Guide } from './guide.js';

const Acc = ({ title, open, children, badge }) => html`<details class="qcat" open=${open}><summary><span>${title}</span>${badge || ''}</summary><div style="padding:0 14px 14px">${children}</div></details>`;

// one window for everything that is not the game itself: language, look, notifications, people, admin tools, log
export function SettingsModal({ game, guideFirst, onClose }) {
  const [guide, setGuide] = useState(!!guideFirst);
  const [lang, setL] = useState(getLang());
  if (guide) return html`<${Guide} mode=${game ? game.st.mode : null} onClose=${() => (guideFirst ? onClose() : setGuide(false))} />`;
  const admin = game && game.st.me.canAdmin;
  return html`<${Modal} title=${t('settings')} onClose=${onClose}><div class="stack" style="gap:8px">
    <button class="ghost block" onClick=${() => setGuide(true)}>${t('guide.title')}</button>
    <${Acc} title=${t('language')} open=${false}><div class="pill-row">${LANGS.map(([c, n]) => html`<button class=${c === lang ? '' : 'ghost'} key=${c} onClick=${async () => { await setLang(c); setL(c); }}>${n}</button>`)}</div><//>
    <${Acc} title=${t('appearance')} open=${false}><${AppearancePanel} /><//>
    ${game && html`<${Acc} title=${t('notify.title')} open=${false}><${NotifyControl} code=${game.code} token=${game.token} /><//>`}
    ${game && html`<${Acc} title=${t('people')} open=${false}><${People} st=${game.st} /><//>`}
    ${admin && html`<${Acc} title=${t('admin.title')} open=${true}><${AdminPanel} game=${game} onClose=${onClose} /><//>`}
    ${admin && html`<${Acc} title=${t('log.title')} open=${false}><${LogView} game=${game} /><//>`}
    ${game && html`<button class="ghost block" onClick=${() => { if (confirm(t('leave.confirm'))) { saved.remove(game.code); location.hash = '#/'; } }}>${t('leave')}</button>`}
  </div><//>`;
}

function NotifyControl({ code, token }) {
  const [s, setS] = useState(null);
  const refresh = () => pushStatus().then(setS);
  useEffect(() => { refresh(); }, []);
  if (!s) return html`<p class="dim">...</p>`;
  if (!s.supported) return html`<div class="callout warn">${window.isSecureContext ? t('notify.unsupported') : t('notify.https')}</div>`;
  if (s.permission === 'denied') return html`<div class="callout bad">${t('notify.denied')}</div>`;
  return html`<div><p class="small dim">${t('notify.body')}</p>${s.subscribed && s.permission === 'granted'
    ? html`<div class="row sp"><${Chip} cls="good">${t('notify.on')}<//><${AsyncBtn} class="ghost sm" onClick=${async () => { await disablePush(code, token); refresh(); }}>${t('notify.turn_off')}<//></div>`
    : html`<${AsyncBtn} class="block" onClick=${async () => { try { await enablePush(code, token); toast(t('notify.enabled'), true); } catch (e) { toast(e.message === 'denied' ? t('notify.denied') : e.message); } refresh(); }}>${t('notify.turn_on')}<//>`}</div>`;
}

function People({ st }) {
  return html`<div class="list">${st.members.map((m) => { const tm = st.teams.find((x) => x.id === m.teamId);
    return html`<div class="row sp nw" key=${m.id}><span><i class="dot" style=${{ background: m.online ? 'var(--good)' : 'var(--line2)' }}></i> ${m.name} ${tm ? html`<${Chip} color=${tm.color}>${tm.name}<//>` : ''}</span>
      <span class="dim small">${t('role.' + m.role)}${m.id === st.me.id ? ', ' + t('you') : ''}${m.plays && st.status !== 'lobby' ? (m.hasLoc ? ', GPS' : ', ' + t('no_gps')) : ''}</span></div>`; })}</div>`;
}

function AdminPanel({ game, onClose }) {
  const { st, act, code, openModal } = game;
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [adj, setAdj] = useState({ teamId: '', minutes: 10, reason: '' });
  const [man, setMan] = useState({ teamId: '', cityId: '' });
  const key = (saved.get(code) || {}).adminKey;
  const open = (m) => { onClose(); openModal(m); };
  return html`<div class="stack" style="gap:6px">
    <p class="eyebrow">${t('admin.mode')}</p><div class="row sp"><b>${t('adminmode.' + st.me.adminMode)}</b><button class="soft sm" onClick=${() => open('mode')}>${t('change')}</button></div>
    <p class="eyebrow mt">${t('admin.game')}</p>
    <div class="row">${st.status === 'running' && html`<button class="ghost" onClick=${() => act('pause', { reason })}>${t('admin.pause')}</button>`}
      ${st.status === 'paused' && html`<button class="good-btn" onClick=${() => act('resume')}>${t('admin.resume')}</button>`}
      ${st.status !== 'finished' && html`<${AsyncBtn} class="danger" confirm=${t('admin.end_confirm')} onClick=${() => act('end')}>${t('admin.end')}<//>`}</div>
    <${Field} label=${t('admin.pause_reason')}><input value=${reason} onInput=${(e) => setReason(e.target.value)} maxlength="120" /><//>
    <${Field} label=${t('admin.announce')}><div class="row nw"><input class="grow" value=${text} onInput=${(e) => setText(e.target.value)} maxlength="300" /><${AsyncBtn} onClick=${async () => { if (await act('announce', { text })) setText(''); }}>${t('send')}<//></div><//>
    ${st.mode !== 'hide' && html`<p class="eyebrow mt">${t('admin.edit_anytime')}</p>`}
    <div class="row">${(st.mode === 'race' || st.mode === 'tag') && html`<button class="soft" onClick=${() => open('tasks')}>${t('admin.tasks', { n: st.settings.tasks.length })}</button>`}
      ${st.mode !== 'tag' && html`<button class="soft" onClick=${() => open('cards')}>${t('admin.cards', { n: st.settings.cards.length })}</button>`}</div>
    ${st.mode === 'race' && st.status !== 'lobby' && html`<p class="eyebrow mt">${t('admin.adjust')}</p>
      <div class="row nw"><select class="grow" value=${adj.teamId} onChange=${(e) => setAdj({ ...adj, teamId: e.target.value })}><option value="">${t('choose')}</option>${st.teams.filter((x) => x.id !== st.me.teamId).map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>
        <input style="width:90px" type="number" value=${adj.minutes} onInput=${(e) => setAdj({ ...adj, minutes: +e.target.value })} /></div>
      <input style="margin-top:8px" placeholder=${t('admin.reason')} value=${adj.reason} onInput=${(e) => setAdj({ ...adj, reason: e.target.value })} />
      <${AsyncBtn} class="block mt" onClick=${() => act('adjust', adj, t('admin.applied'))}>${t('admin.adjust_btn', { n: adj.minutes })}<//>
      ${st.me.neutral && html`<div class="row nw mt"><select class="grow" onChange=${(e) => setMan({ ...man, teamId: e.target.value })}><option value="">${t('choose')}</option>${st.teams.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>
        <select class="grow" onChange=${(e) => setMan({ ...man, cityId: e.target.value })}><option value="">${t('choose')}</option>${META.cities.map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select></div>
        <${AsyncBtn} class="ghost block mt" onClick=${() => act('checkin', { ...man, manual: true }, t('admin.applied'))}>${t('admin.manual_checkin')}<//>`}`}
    ${key && html`<p class="eyebrow mt">${t('admin.key')}</p><div class="row sp"><span class="mono">${showKey ? key : '****-****-****-****'}</span><button class="sm ghost" onClick=${() => setShowKey(!showKey)}>${showKey ? t('hide_') : t('show')}</button></div>`}
    ${(st.flags || []).length > 0 && html`<p class="eyebrow mt">${t('admin.flags')}</p>${st.flags.slice().reverse().map((f) => html`<div class="small warn" key=${f.t}>${fmtDateTime(f.t)} - ${f.text}</div>`)}`}</div>`;
}

function LogView({ game }) {
  const { st, code, token } = game;
  const [full, setFull] = useState(null);
  const rows = (full || st.log || []).slice().reverse();
  return html`<div><div class="row sp"><${Chip} cls=${st.chainOk ? 'good' : 'bad'}>${st.chainOk ? t('log.ok') : t('log.broken')}<//></div>
    ${st.logTotal > (st.log || []).length && !full && html`<button class="sm ghost mt" onClick=${async () => setFull((await api('GET', `/games/${code}/log`, null, token)).log)}>${t('log.load_all', { n: st.logTotal })}</button>`}
    <div class="log list mt">${rows.map((e) => html`<div class=${e.type} key=${e.i}><span class="t">${fmtDateTime(e.t)}</span>${e.text}</div>`)}</div></div>`;
}
