import { html, useState } from '/vendor/preact.js';
import { t } from './i18n.js';
import { Ico } from './ui.js';
import { AccountButton } from './account.js';
import { FriendsButton } from './friends.js';
import { SettingsModal } from './settings.js';

// Account and settings stay reachable on every page outside a running game (the game page has its own top bar with the same buttons)
export function GlobalBar() {
  const [open, setOpen] = useState(null);
  return html`<div class="globalbar"><button class="ghost sm" onClick=${() => { location.hash = '#/people'; }}>${t('people.title')}</button><${FriendsButton} /><${AccountButton} /><button class="ghost icon" aria-label=${t('settings')} onClick=${() => setOpen('settings')}><${Ico} n="gear" /></button>
    ${open && html`<${SettingsModal} game=${null} onClose=${() => setOpen(null)} />`}</div>`;
}
