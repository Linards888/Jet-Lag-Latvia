import { html } from '/vendor/preact.js';

export const MODES = {
  race: {
    icon: '🚆', title: 'Race Across Latvia', sub: 'Teams race from the west coast to the far east, 3-10 days',
    blurb: 'Latvia is split into territories. Clear each one by checking in to cities and doing challenges, then reach the finish first.',
  },
  hide: {
    icon: '🫣', title: 'Hide & Seek Across Latvia', sub: 'Everyone hides twice - one round per day',
    blurb: 'One player hides, the others ask questions that the server answers from the hider\'s real GPS. Longest survivor wins.',
  },
  tag: {
    icon: '🏃', title: 'Tag Across Latvia', sub: 'One team is IT - catch the others, or run',
    blurb: 'The team that is IT must physically tag another team (GPS-verified). Least time as IT wins. Optional All-Stars powers.',
  },
};

export function Rules({ mode }) {
  if (mode === 'race') return html`<div>
    <h2>🚆 Race Across Latvia</h2>
    <p>Teams travel using <b>public transport only</b> (train, tram, bus, trolleybus, on foot - no cars, no hitch-hiking, no taxis). The app flags speeds above 140 km/h in the public log.</p>
    <h3>Territories</h3>
    <p>Latvia is divided into <b>territories</b> (groups of municipalities, shown in colour on the map). The admin can re-shape them in the lobby. Every city belongs to exactly one territory - tap any city or use <i>Is it inside?</i> on the Map tab.</p>
    <h3>How to progress</h3>
    <ol>
      <li>In a territory you may check in only to cities <b>inside it</b>. You must be physically within the check-in radius of the city (GPS verified).</li>
      <li>Each check-in gives a <b>challenge</b>. Do it, upload a photo as proof. The other teams (or a neutral admin) approve it. Or skip it for a time penalty.</li>
      <li>When you have enough check-ins in a territory it is <b>cleared</b>. In an <i>ordered</i> race the next territory then opens. The first team to clear a territory gets a <b>time bonus</b>.</li>
      <li>After all territories are cleared, reach the <b>finish city</b> and press Finish.</li>
    </ol>
    <h3>Clock & score</h3>
    <p>Your time only runs during the <b>daily play window</b> (e.g. 08:00-21:00). Outside it you rest. Score = elapsed play time + penalties - bonuses. Lowest time wins. Teams that did not finish are ranked by progress.</p>
  </div>`;
  if (mode === 'hide') return html`<div>
    <h2>🫣 Hide & Seek Across Latvia</h2>
    <p>Every player hides the same number of times (default 2) - one round per day. Everyone else seeks together.</p>
    <h3>Round flow</h3>
    <ol>
      <li><b>Hiding phase</b>: the hider travels (public transport) and picks a <b>hiding zone</b> (a circle on the map). Seekers wait.</li>
      <li><b>Seeking phase</b>: seekers ask questions. The <b>server answers from the hider's real GPS</b> - the hider cannot lie and seekers never see the hider's position.</li>
      <li><b>Endgame</b>: when seekers are inside the zone they press <i>Enter zone</i>. The hider must stay put; seekers search on foot.</li>
      <li><b>Found</b>: a seeker gets within a few metres of the hider and presses <i>Found</i> (verified by both phones' GPS), or the hider confirms.</li>
    </ol>
    <h3>Questions</h3>
    <ul>
      <li><b>Radar</b>: is the hider within X km of me?</li><li><b>Thermometer</b>: travel a distance - hotter or colder?</li>
      <li><b>Matching</b>: same region / municipality / nearest town as me?</li><li><b>Measuring</b>: is the hider closer to Rīga / the border / a town than me?</li>
      <li><b>Tentacles</b>: which town is the hider closest to (within X km)?</li><li><b>Photo</b>: the hider uploads a photo of something.</li>
    </ul>
    <p>Each question has a cooldown for seekers and adds <b>time credit</b> to the hider's score. Leaving the zone for over 3 minutes costs the hider a penalty.</p>
    <h3>Score</h3>
    <p>Hider score = time survived + question credit - penalties (a round is capped at the max seek time). Your total over all your hides decides the winner - <b>longest total wins</b>.</p>
  </div>`;
  return html`<div>
    <h2>🏃 Tag Across Latvia</h2>
    <p>One team is <b>IT</b>. Travel by public transport only. All clocks run during the daily play window.</p>
    <ul>
      <li>The IT team must physically <b>tag</b> another team. The server checks that both teams' phones are within the tag radius - no honour system.</li>
      <li>The newly tagged team becomes IT. The previous IT gets <b>immunity</b> for a while (no tag-backs).</li>
      <li>IT sees the runners' positions only with a <b>delay</b>. Runners see IT live (configurable by the admin).</li>
      <li><b>Score</b>: total time spent as IT. <b>Lowest wins.</b></li>
    </ul>
    <h3>All-Stars powers (optional)</h3>
    <ul><li><b>Ghost</b> - vanish from the tracker for a while</li><li><b>Shield</b> - cannot be tagged for a while</li><li><b>Radar</b> - see every team live for a few minutes</li></ul>
    <p>Each team gets two random powers, each usable once.</p>
  </div>`;
}
