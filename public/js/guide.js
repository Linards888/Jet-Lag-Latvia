import { html, useState } from '/vendor/preact.js';
import { Modal, Seg } from './ui.js';

export const MODES = {
  race: { kanji: '走', title: 'Race Across Latvia', sub: 'Teams race from coast to border, 3-10 days', blurb: 'Clear territories city by city, do Latvian tasks, collect cards and reach the finish first.' },
  hide: { kanji: '隠', title: 'Hide & Seek Across Latvia', sub: 'Everyone hides twice, one round per day', blurb: 'One hides, the rest ask questions. The server answers from the real GPS. Survive the longest.' },
  tag: { kanji: '鬼', title: 'Tag Across Latvia', sub: 'One team is IT, everyone else runs', blurb: 'Tag happens in real life. Least time as IT wins. Optional All-Stars powers.' },
};

const GUIDES = {
  race: [
    ['Goal', 'Be the first team to clear every territory and reach the finish city. Your time only runs inside the daily play window. Public transport only.'],
    ['Territories', 'Latvia is split into coloured territories. In your current territory, check in to cities inside it (GPS must be near the city centre). Clear enough check-ins and the next territory opens. The first team to clear a territory earns a time bonus.'],
    ['Tasks', 'Every check-in needs one task. Pick it from the list (easy to hard), do it, upload a photo as proof. Other teams or the referee approve it. You can also do extra tasks any time from the Tasks tab.'],
    ['Cards', 'An approved task gives card picks: difficulty 1 gives 1 pick, difficulty 6 gives 6. Each pick shows 3 cards, keep one. Cards belong to the team and any teammate can play them: time bonuses, curses on rivals, freeze, shield, spy and more.'],
    ['Skipping', 'You can skip a task for a time penalty, or with a Free skip card.'],
    ['Finish', 'Clear all territories, be at the finish city and press Finish. Lowest total time wins.'],
  ],
  hide: [
    ['Goal', 'Everyone hides the same number of times. The hider scores the time survived plus time-bonus cards in hand. Highest total wins.'],
    ['Hiding', 'The hider picks a zone on the map and travels there during the hiding time. Seekers wait.'],
    ['Seeking', 'The timer runs until the hider is found. Seekers pick questions from the menu. Each question can be asked once per round. The server answers from the hider\'s real GPS after a short window in which the hider may react with a card.'],
    ['Cards', 'Every answered question lets the hider draw cards. Time-bonus cards add minutes at the end. Power cards: veto a question, randomize it, block questions for a while, bigger hand. Curses and funny cards are announced to the seekers.'],
    ['Found', 'When the seekers have the hider, anyone presses Found. There is no distance check.'],
  ],
  tag: [
    ['Goal', 'One team is IT. IT tags another team in real life and presses Tag; the tagged team becomes IT. Least total time as IT wins.'],
    ['Visibility', 'IT sees the runners on the map. Runners do not see IT unless the admin turned that on.'],
    ['Cooldown', 'After a tag, the new IT has to wait a few minutes before tagging.'],
    ['All-Stars', 'Each team gets two one-use powers: Ghost hides you from the tracker, Shield makes you untaggable, Radar shows every team.'],
  ],
};

export function Guide({ mode, onClose }) {
  const [m, setM] = useState(mode || 'race');
  return html`<${Modal} title="How to play" onClose=${onClose}>
    ${!mode && html`<${Seg} options=${Object.entries(MODES).map(([k, v]) => [k, v.title.split(' ')[0] + ' ' + v.title.split(' ')[1]])} value=${m} onChange=${setM} />`}
    <div class="stack mt" key=${m}>${GUIDES[m].map(([h, t]) => html`<div><h3 style="margin-bottom:2px">${h}</h3><p class="dim" style="margin:0">${t}</p></div>`)}</div>
  <//>`;
}
