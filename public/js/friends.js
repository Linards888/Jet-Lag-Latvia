import { html, useState, useEffect } from '/vendor/preact.js';
import { saved, toast } from './api.js';
import { t } from './i18n.js';
import { AsyncBtn, Modal, Ico, fmtDateTime } from './ui.js';
import { call, accountToken, useAccount } from './account.js';
import { go } from './home.js';

// ---------------------------------------------------------------- friends, messages and game invitations (all through the account API)
let social = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
export async function refreshSocial(announce) {
  if (!accountToken()) { social = null; emit(); return; }
  try {
    const next = await call('GET', '/social');
    if (announce && social && next.unread > social.unread) toast(t('friends.new_message'), true);
    social = next;
    emit();
  } catch {}
}
function useSocial() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    refreshSocial();
    const id = setInterval(() => document.hidden || refreshSocial(true), 20000);
    return () => { subs.delete(f); clearInterval(id); };
  }, []);
  return social;
}

// the global bar / game top bar button with the number of unread messages
export const openFriends = (name) => window.dispatchEvent(new CustomEvent('jll-friends', { detail: name }));  // e.g. the Message button on a profile

export function FriendsButton() {
  const { me } = useAccount();
  const s = useSocial();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(null);
  useEffect(() => { const f = (e) => { setStart(e.detail || null); setOpen(true); }; window.addEventListener('jll-friends', f); return () => window.removeEventListener('jll-friends', f); }, []);
  if (!me) return null;
  const n = s ? s.unread + s.incoming.length : 0;
  return html`<span><button class="ghost sm" onClick=${() => setOpen(true)}>${t('friends.title')}${n > 0 && html` <span class="count">${n}</span>`}</button>${open && html`<${FriendsModal} start=${start} onClose=${() => { setOpen(false); setStart(null); }} />`}</span>`;
}

function Chat({ friend, onBack, onClose }) {
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [pick, setPick] = useState(false);
  const mine = Object.entries(saved.all());
  const load = () => call('GET', '/chat/' + encodeURIComponent(friend.name)).then((c) => { setChat(c); refreshSocial(); }).catch((e) => toast(e.message));
  useEffect(() => { load(); const id = setInterval(() => document.hidden || load(), 8000); return () => clearInterval(id); }, [friend.name]);
  const send = async (body) => { try { setChat(await call('POST', '/chat/' + encodeURIComponent(friend.name), body)); setText(''); return true; } catch (e) { toast(e.message); return false; } };
  return html`<div class="stack"><div class="row sp"><button class="ghost sm" onClick=${onBack}><${Ico} n="back" size=${14} /> ${t('back')}</button><b>${friend.name}</b><span class="dot ${chat && chat.with.online ? 'on' : ''}"></span></div>
    <div class="chat">${chat && chat.messages.length === 0 && html`<span class="dim small">${t('friends.no_messages')}</span>`}
      ${(chat ? chat.messages : []).map((m, i) => (m.k === 'invite'
        ? html`<div class="msg invite ${m.f ? '' : 'me'}" key=${i}><b>${t('friends.invite_text', { game: m.game || m.code })}</b><div class="row mt" style="gap:8px"><span class="chip plain mono">${m.code}</span>${m.f === 1 && html`<button class="sm" onClick=${() => { onClose(); go('#/join/' + m.code); }}>${t('friends.join')}</button>`}</div><small>${fmtDateTime(m.t)}</small></div>`
        : html`<div class="msg ${m.f ? '' : 'me'}" key=${i}>${m.x}<small>${fmtDateTime(m.t)}</small></div>`))}</div>
    <div class="row nw"><input value=${text} maxlength="500" placeholder=${t('friends.write')} onInput=${(e) => setText(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && text.trim() && send({ text })} />
      <${AsyncBtn} class="sm" disabled=${!text.trim()} onClick=${() => send({ text })}>${t('send')}<//></div>
    ${mine.length > 0 && html`<div><button class="ghost block" onClick=${() => setPick(!pick)}>${t('friends.invite')}</button>
      ${pick && html`<div class="list mt">${mine.map(([code, g]) => html`<button class="ghost block" key=${code} style="text-align:left" onClick=${async () => { if (await send({ invite: { code, game: g.gameName, mode: g.mode } })) setPick(false); }}>${g.gameName || code} (${code})</button>`)}</div>`}</div>`}</div>`;
}

function FriendsModal({ onClose, start }) {
  const s = useSocial();
  const [name, setName] = useState('');
  const [chatWith, setChatWith] = useState(start ? { name: start } : null);
  const act = async (action, who) => { try { await call('POST', '/friends', { action, name: who }); await refreshSocial(); return true; } catch (e) { toast(e.message); return false; } };
  if (chatWith) return html`<${Modal} title=${t('friends.title')} onClose=${onClose}><${Chat} friend=${chatWith} onBack=${() => setChatWith(null)} onClose=${onClose} /><//>`;
  return html`<${Modal} title=${t('friends.title')} onClose=${onClose}><div class="stack">
    <div class="row nw"><input value=${name} maxlength="16" placeholder=${t('friends.username')} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && name.trim() && act('request', name.trim()).then((ok) => ok && setName(''))} />
      <${AsyncBtn} class="sm" disabled=${!name.trim()} onClick=${async () => { if (await act('request', name.trim())) { setName(''); toast(t('friends.sent'), true); } }}>${t('friends.add')}<//></div>
    ${s && s.incoming.length > 0 && html`<div><p class="eyebrow">${t('friends.requests')}</p>${s.incoming.map((f) => html`<div class="friend-row" key=${f.name}><b class="grow">${f.name} <span class="small dim">${f.first} ${f.last}</span></b>
      <${AsyncBtn} class="sm" onClick=${() => act('accept', f.name)}>${t('friends.accept')}<//><${AsyncBtn} class="sm ghost" onClick=${() => act('decline', f.name)}>${t('friends.decline')}<//></div>`)}</div>`}
    <div><p class="eyebrow">${t('friends.list')}</p>${s && s.friends.length === 0 && html`<span class="dim small">${t('friends.none')}</span>`}
      ${(s ? s.friends : []).map((f) => html`<div class="friend-row" key=${f.name}><span class="dot ${f.online ? 'on' : ''}"></span><button class="link grow" style="text-align:left" onClick=${() => setChatWith(f)}>${f.name} <span class="small dim">${f.first} ${f.last}</span></button>
        ${f.unread > 0 && html`<span class="count">${f.unread}</span>`}<button class="sm ghost" onClick=${() => setChatWith(f)}>${t('friends.chat')}</button>
        <button class="sm ghost icon" aria-label=${t('friends.remove')} onClick=${() => confirm(t('friends.remove_confirm', { name: f.name })) && act('remove', f.name)}><${Ico} n="close" size=${13} /></button></div>`)}</div>
    ${s && s.outgoing.length > 0 && html`<div><p class="eyebrow">${t('friends.pending')}</p>${s.outgoing.map((f) => html`<div class="friend-row" key=${f.name}><span class="grow">${f.name}</span><button class="sm ghost" onClick=${() => act('cancel', f.name)}>${t('cancel')}</button></div>`)}</div>`}</div><//>`;
}
