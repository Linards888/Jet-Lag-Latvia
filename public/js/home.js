import { html, useState, useEffect } from '/vendor/preact.js';
import { api, saved, toast } from './api.js';
import { AsyncBtn, Field, Switch, Mochi, Modal, Ico, copy } from './ui.js';
import { MODES, Guide } from './guide.js';
import { ThemePicker } from './theme.js';

export const go = (h) => { location.hash = h; };

function TopLinks() {
  const [m, setM] = useState(null);
  return html`<div class="row" style="justify-content:flex-end;padding-top:12px">
    <button class="ghost sm" onClick=${() => setM('guide')}><${Ico} n="book" size=${15} /> How to play</button>
    <button class="ghost sm" onClick=${() => setM('theme')}><${Ico} n="palette" size=${15} /> Theme</button>
    ${m === 'guide' && html`<${Guide} onClose=${() => setM(null)} />`}
    ${m === 'theme' && html`<${Modal} title="Theme" onClose=${() => setM(null)}><${ThemePicker} /><//>`}</div>`;
}

export function Home() {
  const mine = Object.entries(saved.all());
  return html`<div class="wrap"><${TopLinks} />
    <div class="hero"><${Mochi} size=${108} /><div class="jp">ジェットラグ</div><h1>Jet Lag: Latvia</h1>
      <p class="dim" style="margin:0">Race, hide and tag across your own country.</p></div>
    <div class="stack mt2">
      <button class="block" style="padding:15px" onClick=${() => go('#/create')}>Create a game</button>
      <button class="block ghost" style="padding:15px" onClick=${() => go('#/join')}>Join with a code</button>
    </div>
    ${mine.length > 0 && html`<div class="card"><p class="eyebrow">Your games on this device</p><div class="list">
      ${mine.map(([code, g]) => html`<div class="row sp nw" key=${code}>
        <div class="grow"><b>${g.gameName || code}</b> <span class="chip plain mono">${code}</span>
          <div class="dim small">${MODES[g.mode] ? MODES[g.mode].title : ''} - ${g.role}</div></div>
        <button class="sm" onClick=${() => go('#/g/' + code)}>Open</button>
        <button class="sm ghost icon" aria-label="Forget" onClick=${() => { if (confirm('Forget this game on this device? You can get back in with your name and PIN.')) { saved.remove(code); location.reload(); } }}><${Ico} n="close" size=${14} /></button>
      </div>`)}</div></div>`}
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
      const d = await api('POST', '/games', { mode, name: name || MODES[mode].title, adminName: admin, adminPin: pin, adminPlays: plays });
      saved.set(d.code, { token: d.token, memberId: d.memberId, name: admin, role: 'admin', mode, gameName: name || MODES[mode].title, adminKey: d.adminKey });
      setDone(d);
    } catch (e) { toast(e.message); }
  };
  if (done) return html`<div class="wrap"><div class="card accent center"><${Mochi} size=${84} /><h2>Game created</h2>
    <p class="eyebrow">Game code</p><div class="mono" style="font-size:2.4rem;font-weight:800;letter-spacing:.12em">${done.code}</div>
    <div class="row" style="justify-content:center"><span class="mono small dim">${location.origin}/#/join/${done.code}</span>
      <button class="sm ghost" onClick=${() => toast(copy(`${location.origin}/#/join/${done.code}`) ? 'Link copied' : 'Copy failed', true)}><${Ico} n="copy" size=${14} /> Copy</button></div>
    <hr class="divider" /><p class="eyebrow">Your admin key (shown once)</p>
    <div class="mono" style="font-size:1.4rem;font-weight:800">${done.adminKey}</div>
    <p class="small dim">Write it down. It is the only way to become admin on another device.</p>
    <button class="block mt" onClick=${() => go('#/g/' + done.code)}>Open the lobby</button></div></div>`;

  return html`<div class="wrap"><div class="row sp"><button class="ghost sm" onClick=${() => go('#/')}><${Ico} n="back" size=${15} /> Back</button><h2 style="margin:0">Create a game</h2></div>
    ${Object.entries(MODES).map(([k, m]) => html`<button class="mode ${mode === k ? 'on' : ''}" onClick=${() => setMode(k)} key=${k}>
      <span class="kanji">${m.kanji}</span><span><b>${m.title}</b><span class="dim small">${m.sub}</span></span></button>`)}
    <div class="card">
      <${Field} label="Game name (optional)"><input value=${name} onInput=${(e) => setName(e.target.value)} maxlength="24" placeholder=${MODES[mode].title} /><//>
      <${Field} label="Your name"><input value=${admin} onInput=${(e) => setAdmin(e.target.value)} maxlength="24" /><//>
      <${Field} label="Your PIN (4-8 digits)"><input value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} inputmode="numeric" maxlength="8" /><//>
      <${Switch} checked=${plays} onChange=${setPlays}>I also play<//>
      <${AsyncBtn} class="block" onClick=${create}>Create game<//>
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
    try { setInfo(await api('GET', '/games/' + (c || code).trim().toUpperCase())); } catch (e) { setInfo(null); toast(e.status === 404 ? 'No game with that code' : e.message); }
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
  return html`<div class="wrap"><div class="row sp"><button class="ghost sm" onClick=${() => go('#/')}><${Ico} n="back" size=${15} /> Back</button><h2 style="margin:0">Join a game</h2></div>
    <div class="card"><label style="margin-top:0">Game code</label><div class="row nw"><input class="grow mono" value=${code} onInput=${(e) => { setCode(e.target.value.toUpperCase()); setInfo(null); }} maxlength="5" placeholder="ABCDE" style="font-size:1.4rem;letter-spacing:.2em;font-weight:800" />
      <button onClick=${() => lookup()}>Find</button></div></div>
    ${info && html`<div class="card accent"><h2>${info.name}</h2><p class="dim">${MODES[info.mode].title} - ${info.players} players - ${info.status}</p>
      <div class="seg mt"><button class=${tab === 'join' ? 'on' : ''} onClick=${() => setTab('join')}>New here</button>
        <button class=${tab === 'back' ? 'on' : ''} onClick=${() => setTab('back')}>Get back in</button>
        <button class=${tab === 'admin' ? 'on' : ''} onClick=${() => setTab('admin')}>Admin</button></div>
      ${tab !== 'admin' && html`<${Field} label="Your name"><input value=${name} onInput=${(e) => setName(e.target.value)} maxlength="24" /><//>
        <${Field} label=${tab === 'join' ? 'Choose a PIN (4-8 digits)' : 'Your PIN'}><input value=${pin} inputmode="numeric" onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} maxlength="8" /><//>`}
      ${tab === 'join' && html`<${Field} label="Join as"><select value=${role} onChange=${(e) => setRole(e.target.value)}>
        <option value="player" disabled=${info.status !== 'lobby' || info.joinLocked}>Player${info.status !== 'lobby' ? ' (game started)' : info.joinLocked ? ' (locked)' : ''}</option>
        <option value="spectator">Spectator</option></select><//>`}
      ${tab === 'admin' && html`<${Field} label="Admin key"><input class="mono" value=${key} onInput=${(e) => setKey(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" /><//>`}
      <${AsyncBtn} class="block mt" onClick=${submit}>${tab === 'join' ? 'Join' : tab === 'back' ? 'Get back in' : 'Log in as admin'}<//></div>`}
  </div>`;
}

export function NotFound({ what }) {
  return html`<div class="wrap center"><div class="hero"><${Mochi} size=${120} mood="sleepy" /><div class="jp">迷子</div><h1>Nothing here</h1>
    <p class="dim">${what || 'This page wandered off.'}</p></div><button onClick=${() => go('#/')}>Back to start</button></div>`;
}
