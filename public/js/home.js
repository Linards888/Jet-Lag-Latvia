import { html, useState, useEffect } from '/vendor/preact.js';
import { api, saved, toast } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, Field, Switch, Mochi, Ico, copy } from './ui.js';
import { MODE_IDS, KANJI } from './guide.js';
import { SettingsModal } from './settings.js';

export const go = (h) => { location.hash = h; };

export function Home() {
  const mine = Object.entries(saved.all());
  const [m, setM] = useState(null);
  return html`<div class="wrap">
    <div class="row" style="justify-content:flex-end;padding-top:8px"><button class="ghost icon" aria-label=${t('settings')} onClick=${() => setM(true)}><${Ico} n="gear" /></button></div>
    <div class="hero"><${Mochi} size=${108} /><div class="jp">ジェットラグ</div><h1>Jet Lag: Latvia</h1>
      <p class="dim" style="margin:0">${t('home.tagline')}</p></div>
    <div class="stack mt2">
      <button class="block" style="padding:15px" onClick=${() => go('#/create')}>${t('home.create')}</button>
      <button class="block ghost" style="padding:15px" onClick=${() => go('#/join')}>${t('home.join')}</button>
      <button class="link" onClick=${() => setM('guide')}>${t('guide.title')}</button>
    </div>
    ${mine.length > 0 && html`<div class="card"><p class="eyebrow">${t('home.mine')}</p><div class="list">
      ${mine.map(([code, g]) => html`<div class="row sp nw" key=${code}>
        <div class="grow"><b>${g.gameName || code}</b> <span class="chip plain mono">${code}</span>
          <div class="dim small">${g.mode ? t('mode.' + g.mode + '.title') : ''} - ${t('role.' + g.role)}</div></div>
        <button class="sm" onClick=${() => go('#/g/' + code)}>${t('open')}</button>
        <button class="sm ghost icon" aria-label=${t('forget')} onClick=${() => { if (confirm(t('home.forget_confirm'))) { saved.remove(code); location.reload(); } }}><${Ico} n="close" size=${14} /></button>
      </div>`)}</div></div>`}
    ${m && html`<${SettingsModal} game=${null} guideFirst=${m === 'guide'} onClose=${() => setM(null)} />`}
  </div>`;
}

export function Create() {
  const [mode, setMode] = useState('race');
  const [name, setName] = useState('');
  const [admin, setAdmin] = useState('');
  const [pin, setPin] = useState('');
  const [plays, setPlays] = useState(true);
  const [done, setDone] = useState(null);

  const create = async () => {
    try {
      const gname = name || t('mode.' + mode + '.title');
      const d = await api('POST', '/games', { mode, name: gname, adminName: admin, adminPin: pin, adminPlays: plays });
      saved.set(d.code, { token: d.token, memberId: d.memberId, name: admin, role: 'admin', mode, gameName: gname, adminKey: d.adminKey });
      setDone(d);
    } catch (e) { toast(e.message); }
  };
  if (done) return html`<div class="wrap"><div class="card accent center"><${Mochi} size=${84} /><h2>${t('create.done')}</h2>
    <p class="eyebrow">${t('lobby.code')}</p><div class="mono" style="font-size:2.4rem;font-weight:800;letter-spacing:.12em">${done.code}</div>
    <div class="row" style="justify-content:center"><span class="mono small dim" style="word-break:break-all">${location.origin}/#/join/${done.code}</span>
      <button class="sm ghost" onClick=${() => toast(copy(`${location.origin}/#/join/${done.code}`) ? t('copied') : t('copy_failed'), true)}><${Ico} n="copy" size=${14} /> ${t('copy')}</button></div>
    <hr class="divider" /><p class="eyebrow">${t('create.key')}</p>
    <div class="mono" style="font-size:1.3rem;font-weight:800;word-break:break-all">${done.adminKey}</div>
    <p class="small dim">${t('create.key_note')}</p>
    <button class="block mt" onClick=${() => go('#/g/' + done.code)}>${t('create.open_lobby')}</button></div></div>`;

  return html`<div class="wrap"><div class="row sp"><button class="ghost sm" onClick=${() => go('#/')}><${Ico} n="back" size=${15} /> ${t('back')}</button><h2 style="margin:0">${t('home.create')}</h2></div>
    ${MODE_IDS.map((k) => html`<button class="mode ${mode === k ? 'on' : ''}" onClick=${() => setMode(k)} key=${k}>
      <span class="kanji">${KANJI[k]}</span><span><b>${t('mode.' + k + '.title')}</b><span class="dim small">${t('mode.' + k + '.sub')}</span><br /><span class="small">${t('mode.' + k + '.blurb')}</span></span></button>`)}
    <div class="card">
      <${Field} label=${t('create.game_name')}><input value=${name} onInput=${(e) => setName(e.target.value)} maxlength="24" placeholder=${t('mode.' + mode + '.title')} /><//>
      <${Field} label=${t('create.your_name')}><input value=${admin} onInput=${(e) => setAdmin(e.target.value)} maxlength="24" /><//>
      <${Field} label=${t('create.pin')}><input value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} inputmode="numeric" maxlength="8" /><//>
      <${Switch} checked=${plays} onChange=${setPlays}>${t('create.also_play')}<//>
      <${AsyncBtn} class="block" onClick=${create}>${t('create.submit')}<//>
    </div></div>`;
}

export function Join({ code: initial }) {
  const [code, setCode] = useState(initial || '');
  const [info, setInfo] = useState(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('player');
  const [tab, setTab] = useState('join');
  const [key, setKey] = useState('');

  const lookup = async (c) => {
    try { setInfo(await api('GET', '/games/' + (c || code).trim().toUpperCase())); } catch (e) { setInfo(null); toast(e.status === 404 ? t('join.no_game') : e.message); }
  };
  useEffect(() => { if (initial) lookup(initial); }, [initial]);
  const submit = async () => {
    try {
      let d;
      if (tab === 'join') d = await api('POST', `/games/${info.code}/join`, { name, pin, role });
      else if (tab === 'back') d = await api('POST', `/games/${info.code}/rejoin`, { name, pin });
      else d = await api('POST', `/games/${info.code}/admin-login`, { key });
      saved.set(info.code, { token: d.token, memberId: d.memberId, name, role: d.role, mode: info.mode, gameName: info.name });
      go('#/g/' + info.code);
    } catch (e) { toast(e.message); }
  };
  return html`<div class="wrap"><div class="row sp"><button class="ghost sm" onClick=${() => go('#/')}><${Ico} n="back" size=${15} /> ${t('back')}</button><h2 style="margin:0">${t('home.join')}</h2></div>
    <div class="card"><label style="margin-top:0">${t('join.code')}</label><div class="row nw"><input class="grow mono" value=${code} onInput=${(e) => { setCode(e.target.value.toUpperCase()); setInfo(null); }} maxlength="5" placeholder="ABCDE" style="font-size:1.4rem;letter-spacing:.2em;font-weight:800" />
      <button onClick=${() => lookup()}>${t('join.find')}</button></div></div>
    ${info && html`<div class="card accent"><h2>${info.name}</h2><p class="dim">${t('mode.' + info.mode + '.title')} - ${t('join.players', { n: info.players })} - ${t('status.' + info.status)}</p>
      <div class="seg mt"><button class=${tab === 'join' ? 'on' : ''} onClick=${() => setTab('join')}>${t('join.new')}</button>
        <button class=${tab === 'back' ? 'on' : ''} onClick=${() => setTab('back')}>${t('join.back')}</button>
        <button class=${tab === 'admin' ? 'on' : ''} onClick=${() => setTab('admin')}>${t('join.admin')}</button></div>
      ${tab !== 'admin' && html`<${Field} label=${t('join.name')}><input value=${name} onInput=${(e) => setName(e.target.value)} maxlength="24" /><//>
        <${Field} label=${tab === 'join' ? t('join.choose_pin') : t('join.pin')}><input value=${pin} inputmode="numeric" onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} maxlength="8" /><//>`}
      ${tab === 'join' && html`<${Field} label=${t('join.as')}><select value=${role} onChange=${(e) => setRole(e.target.value)}>
        <option value="player" disabled=${info.status !== 'lobby' || info.joinLocked}>${t('role.player')}${info.status !== 'lobby' ? ' (' + t('join.started') + ')' : info.joinLocked ? ' (' + t('join.locked') + ')' : ''}</option>
        <option value="spectator">${t('role.spectator')}</option></select><//>`}
      ${tab === 'admin' && html`<${Field} label=${t('join.admin_key')}><input class="mono" value=${key} onInput=${(e) => setKey(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" /><//>`}
      <${AsyncBtn} class="block mt" onClick=${submit}>${tab === 'join' ? t('join.submit') : tab === 'back' ? t('join.submit_back') : t('join.submit_admin')}<//></div>`}
  </div>`;
}

export function NotFound({ what }) {
  return html`<div class="wrap center"><div class="hero"><${Mochi} size=${120} mood="sleepy" /><div class="jp">迷子</div><h1>${t('nf.title')}</h1>
    <p class="dim">${what || t('nf.body')}</p></div><button onClick=${() => go('#/')}>${t('nf.back')}</button></div>`;
}
