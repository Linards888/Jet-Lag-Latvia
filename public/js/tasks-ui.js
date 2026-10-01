import { html, useState } from '/vendor/preact.js';
import { cityName, fileUrl, uploadPhoto, toast } from './api.js';
import { t, tx } from './i18n.js';
import { AsyncBtn, Chip, Dots, Empty, Field, Modal } from './ui.js';

export const taskOf = (st, id) => st.settings.tasks.find((x) => x.id === id);
export const teamOf = (st, id) => st.teams.find((x) => x.id === id) || { name: '?', color: '#888' };

// one task: collapsed title row, tap to read exactly how to do it
export function TaskRow({ task, status, pinned, reward, action, extra }) {
  return html`<details class="task ${status === 'done' ? 'done' : ''} ${pinned ? 'pinned' : ''}"><summary><span class="t">${tx(task, 'title')}</span>
    ${pinned && html`<${Chip} cls="warn">${t('task.protected')}<//>`}${status && html`<${Chip} cls=${status === 'done' ? 'good' : ''}>${t('task.' + status)}<//>`}<${Dots} n=${task.difficulty} /></summary>
    <div class="body"><p style="margin-top:0">${tx(task, 'desc')}</p>
      <div class="row sp"><span class="small dim">${reward}</span><span class="row" style="gap:8px">${extra}${action}</span></div></div></details>`;
}

// photo + note dialog (only used when the admin switched "require proof" on in the lobby)
export function ProofModal({ task, code, token, onSubmit, onClose }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const send = async () => {
    if (!file) return toast(t('proof.need_photo'));
    try { const fid = await uploadPhoto(code, token, file); if (await onSubmit({ fid, note })) onClose(); } catch (e) { toast(e.message); }
  };
  return html`<${Modal} title=${tx(task, 'title')} onClose=${onClose}><p>${tx(task, 'desc')}</p>
    <input type="file" accept="image/*" capture="environment" onChange=${(e) => setFile(e.target.files[0])} />
    <${Field} label=${t('proof.note')}><input value=${note} maxlength="240" onInput=${(e) => setNote(e.target.value)} /><//>
    <${AsyncBtn} class="block mt" onClick=${send}>${t('proof.submit')}<//><//>`;
}

// proofs waiting for this player's review
export function Reviews({ st, reviews, act, code, token }) {
  if (!reviews || !reviews.length) return null;
  return html`<section class="card accent"><div class="sec-h"><h2>${t('review.title', { n: reviews.length })}</h2></div>
    ${reviews.map((r) => { const tk = taskOf(st, r.taskId); return html`<div key=${r.teamId + r.taskId} style="margin:12px 0;border-top:1px dashed var(--line2);padding-top:12px"><b>${teamOf(st, r.teamId).name}</b>
      <div class="small"><b>${tk ? tx(tk, 'title') : ''}</b> - ${tk ? tx(tk, 'desc') : ''}</div>${r.note && html`<div class="small dim">"${r.note}"</div>`}
      <img class="proof" src=${fileUrl(code, token, r.fid)} loading="lazy" />
      <div class="row mt"><${AsyncBtn} class="good-btn grow" onClick=${() => act('review', { teamId: r.teamId, taskId: r.taskId, verdict: 'approve' })}>${t('review.approve')}<//>
        <${AsyncBtn} class="danger grow" onClick=${() => act('review', { teamId: r.teamId, taskId: r.taskId, verdict: 'reject' })}>${t('review.reject')}<//></div></div>`; })}</section>`;
}

// the shared "N random tasks" list used by Race and Tag
export function ActiveTasks({ st, ctx, active, doneMap, reward, canDo, pin, onPin, title }) {
  const { act, code, token } = ctx;
  const [proof, setProof] = useState(null);
  const tasks = active.map((id) => taskOf(st, id)).filter(Boolean);
  if (!st.settings.tasksEnabled && st.mode === 'race') return null;
  const complete = (task) => (st.settings.requireProof ? setProof(task) : act('complete_task', { taskId: task.id }, t('task.done_toast')));
  return html`<section class="card"><div class="sec-h"><h2>${title}</h2><span class="chip plain">${t('task.shared')}</span></div>
    ${tasks.length === 0 ? html`<${Empty}>${t('task.none')}<//>` : tasks.map((task) => { const status = doneMap ? ({ approved: 'done', pending: 'pending', rejected: 'rejected' }[doneMap[task.id]] || '') : '';
      return html`<${TaskRow} key=${task.id} task=${task} status=${status} pinned=${pin === task.id} reward=${reward(task)}
        extra=${onPin && canDo && html`<button class="sm ghost" onClick=${() => onPin(pin === task.id ? null : task.id)}>${pin === task.id ? t('task.unprotect') : t('task.protect')}</button>`}
        action=${canDo && status !== 'done' && status !== 'pending' && html`<${AsyncBtn} class="sm" confirm=${st.settings.requireProof ? null : t('task.confirm_done')} onClick=${() => complete(task)}>${t('task.mark_done')}<//>`} />`; })}
    ${proof && html`<${ProofModal} task=${proof} code=${code} token=${token} onClose=${() => setProof(null)} onSubmit=${(p) => act('complete_task', { taskId: proof.id, ...p }, t('task.proof_sent'))} />`}</section>`;
}
