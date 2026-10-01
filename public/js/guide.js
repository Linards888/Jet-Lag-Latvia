import { html, useState } from '/vendor/preact.js';
import { t } from './i18n.js';
import { Modal, Seg } from './ui.js';

export const MODE_IDS = ['race', 'hide', 'tag'];
export const KANJI = { race: '走', hide: '隠', tag: '鬼' };
const SECTIONS = {
  race: ['goal', 'territories', 'tasks', 'cards', 'hand', 'finish'],
  hide: ['goal', 'hiding', 'seeking', 'questions', 'cards', 'found'],
  tag: ['goal', 'visibility', 'cooldown', 'economy', 'allstars'],
};

// all instructions live here - one window, no scattered help text
export function Guide({ mode, onClose }) {
  const [m, setM] = useState(mode || 'race');
  return html`<${Modal} title=${t('guide.title')} onClose=${onClose}>
    ${!mode && html`<${Seg} options=${MODE_IDS.map((k) => [k, t('mode.' + k + '.short')])} value=${m} onChange=${setM} />`}
    <div class="stack mt" key=${m}>${SECTIONS[m].map((s) => html`<div><h3 style="margin-bottom:2px">${t('guide.' + m + '.' + s + '.h')}</h3><p class="dim" style="margin:0">${t('guide.' + m + '.' + s + '.b')}</p></div>`)}</div>
  <//>`;
}
