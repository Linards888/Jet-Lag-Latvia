import { html, useState, useEffect } from '/vendor/preact.js';
import { useAccount, accountToken } from './account.js';
import { useTheme } from './theme.js';

// Pictures of the special look. They are fetched with the account's own token (never a public URL) and only while that look is the active
// theme; an account without the look gets nothing. Slot names: see server/specialart.py.
const cache = new Map();  // "slot:version" -> object URL

export function useSpecialPic(slot) {
  const { me } = useAccount();
  const theme = useTheme();
  const ver = slot && me && me.specialArt ? me.specialArt[slot] : null;
  const on = theme === 'onimai' && !!ver;
  const key = slot + ':' + ver;
  const [url, setUrl] = useState(cache.get(key) || null);
  useEffect(() => {
    if (!on) { setUrl(null); return; }
    if (cache.has(key)) { setUrl(cache.get(key)); return; }
    let live = true;
    fetch('/api/account/special-art/' + slot, { headers: { 'X-Account': accountToken() || '' } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (b && live) { const u = URL.createObjectURL(b); cache.set(key, u); setUrl(u); } })
      .catch(() => {});
    return () => { live = false; };
  }, [on, key]);
  return on ? url : null;
}

// a wide picture at the top of a page or window
export function SpecialPic({ slot }) {
  const url = useSpecialPic(slot);
  return url ? html`<img class="special-pic" src=${url} alt="" />` : null;
}

// the sticker pictures (up to six): a small row of them
export function useSpecialStickers() {
  const pics = [useSpecialPic('sticker1'), useSpecialPic('sticker2'), useSpecialPic('sticker3'), useSpecialPic('sticker4'), useSpecialPic('sticker5'), useSpecialPic('sticker6')];
  return pics.filter(Boolean);
}
