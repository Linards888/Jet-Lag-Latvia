import { html, useState, useEffect } from '/vendor/preact.js';
import { api, saved, toast } from './api.js';
import { AsyncBtn, Field, copy } from './ui.js';
import { MODES } from './modes.js';

export const go = (h) => { location.hash = h; };

export function Home() {
  const mine = Object.entries(saved.all());
  return html`<div class="wrap">
    <div class="hero"><div class="flag"></div><h1>Jet Lag: Latvia</h1>
      <p class="dim">Play the Jet Lag games across your own country. Trams, trains and friends.</p></div>
    <div class="grid">
      <button class="block" style="padding:18px" onClick=${() => go('#/create')}>➕ Create a game</button>
      <button class="block sec" style="padding:18px" onClick=${() => go('#/join')}>🔑 Join with a code</button>
    </div>
    ${mine.length > 0 && html`<div class="card"><h3>Your games on this device</h3><div class="list">
      ${mine.map(([code, g]) => html`<div class="row sp" key=${code}>
        <div class="grow"><b>${g.gameName || code}</b> <span class="chip">${code}</span> <span class="chip">${g.role}</span>
          <div class="dim small">${MODES[g.mode] ? MODES[g.mode].title : ''}</div></div>
        <button class="sm" onClick=${() => go('#/g/' + code)}>Open</button>
        <button class="sm sec" onClick=${() => { if (confirm('Forget this game on this device? (You can get back in with your name + PIN)')) { saved.remove(code); go('#/'); location.reload(); } }}>✕</button>
      </div>`)}</div></div>`}
    <div class="card small dim"><b>Comeback:</b> lost your device? Use <a href="#/join">Join</a> → <i>Get back in</i> with your name + PIN. Admins use the one-time admin key.</div>
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
  if (done) return html`<div class="wrap"><div class="card hl"><h2>Game created 🎉</h2>
    <p>Game code</p><div class="big mono">${done.code}</div>
    <p>Share link: <span class="mono small">${location.origin}/#/join/${done.code}</span>
      <button class="sm sec" onClick=${() => toast(copy(`${location.origin}/#/join/${done.code}`) ? 'Link copied' : 'Copy failed', true)}>Copy</button></p>
    <h3>Your admin key (shown once!)</h3>
    <div class="big mono">${done.adminKey}</div>
    <p class="small warn">Write this down. It is the ONLY way to become admin on another device, and logging in with it kicks out the old admin session - so there is always exactly one admin. Other people cannot get it.</p>
    <button class="block" onClick=${() => go('#/g/' + done.code)}>Go to the lobby →</button></div></div>`;

  return html`<div class="wrap"><h2>Create a game</h2>
    ${Object.entries(MODES).map(([k, m]) => html`<button class="mode ${mode === k ? 'on' : ''}" onClick=${() => setMode(k)} key=${k}>
      <b>${m.icon} ${m.title}</b><div class="dim small">${m.sub}</div><div class="small" style="margin-top:4px">${m.blurb}</div></button>`)}
    <div class="card">
      <${Field} label="Game name (optional)"><input value=${name} onInput=${(e) => setName(e.target.value)} maxlength="24" placeholder=${MODES[mode].title} /><//>
      <${Field} label="Your name (you will be the admin)"><input value=${admin} onInput=${(e) => setAdmin(e.target.value)} maxlength="24" /><//>
      <${Field} label="Your PIN (4-8 digits)" help="Used to get back in if you lose this device."><input value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} inputmode="numeric" maxlength="8" /><//>
      <label class="chk"><input type="checkbox" checked=${plays} onChange=${(e) => setPlays(e.target.checked)} />I also want to play</label>
      <div class="help">${plays
        ? 'Fair-play mode: you play like everyone else. The server automatically hides all secret info from you and you cannot judge your own team. Every admin override is written to the public, tamper-evident log.'
        : 'Neutral referee: you do not play, but you can see everything (locations, hidden info) and settle disputes. All overrides are logged publicly.'}</div>
      <${AsyncBtn} class="block" style="margin-top:12px" onClick=${create}>Create game<//>
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

  const lookup = async () => {
    try { setInfo(await api('GET', '/games/' + code.trim().toUpperCase())); } catch (e) { setInfo(null); toast(e.message); }
  };
  useEffect(() => { if (initial) lookup(); }, [initial]);
  const finish = (d, extra) => {
    const c = info.code;
    saved.set(c, { token: d.token, memberId: d.memberId, name: extra.name, role: d.role, mode: info.mode, gameName: info.name });
    go('#/g/' + c);
  };
  const submit = async () => {
    try {
      let d;
      if (tab === 'join') d = await api('POST', `/games/${info.code}/join`, { name, pin, role });
      else if (tab === 'back') d = await api('POST', `/games/${info.code}/rejoin`, { name, pin });
      else d = await api('POST', `/games/${info.code}/admin-login`, { key });
      finish(d, { name });
    } catch (e) { toast(e.message); }
  };
  return html`<div class="wrap"><h2>Join a game</h2>
    <div class="card"><${Field} label="Game code"><div class="row"><input class="grow mono" value=${code} onInput=${(e) => { setCode(e.target.value.toUpperCase()); setInfo(null); }} maxlength="5" placeholder="ABCDE" style="font-size:1.4rem;letter-spacing:.2em" />
      <button onClick=${lookup}>Find</button></div><//></div>
    ${info && html`<div class="card hl"><h2>${info.name}</h2><p class="dim">${MODES[info.mode].icon} ${MODES[info.mode].title} · ${info.players} players · ${info.status}</p>
      <div class="tabs"><button class=${tab === 'join' ? 'on' : ''} onClick=${() => setTab('join')}>New here</button>
        <button class=${tab === 'back' ? 'on' : ''} onClick=${() => setTab('back')}>Get back in</button>
        <button class=${tab === 'admin' ? 'on' : ''} onClick=${() => setTab('admin')}>Admin</button></div>
      ${tab !== 'admin' && html`<${Field} label="Your name"><input value=${name} onInput=${(e) => setName(e.target.value)} maxlength="24" /><//>
        <${Field} label=${tab === 'join' ? 'Choose a PIN (4-8 digits, to get back in later)' : 'Your PIN'}><input value=${pin} inputmode="numeric" onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} maxlength="8" /><//>`}
      ${tab === 'join' && html`<${Field} label="I want to be a…"><select value=${role} onChange=${(e) => setRole(e.target.value)}>
        <option value="player" disabled=${info.status !== 'lobby' || info.joinLocked}>Player ${info.status !== 'lobby' ? '(game already started)' : info.joinLocked ? '(locked)' : ''}</option>
        <option value="spectator">Spectator (watch only, sees no secrets)</option></select><//>`}
      ${tab === 'admin' && html`<${Field} label="Admin key" help="Only the game creator has it. Logging in revokes the previous admin session."><input class="mono" value=${key} onInput=${(e) => setKey(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" /><//>`}
      <${AsyncBtn} class="block" style="margin-top:14px" onClick=${submit}>${tab === 'join' ? 'Join' : tab === 'back' ? 'Get back in' : 'Log in as admin'}<//></div>`}
  </div>`;
}
