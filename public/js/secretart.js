import { html, useState, useEffect } from '/vendor/preact.js';
import { useAccount, accountToken } from './account.js';
import { useTheme } from './theme.js';

// Pictures of the secret look. They are fetched with the account's own token (never a public URL) and only while that look is the active
// theme; an account without the look gets nothing. Slot names: see server/secretart.py.
const cache = new Map();  // "slot:version" -> object URL

export function useSecretPic(slot) {
  const { me } = useAccount();
  const theme = useTheme();
  const ver = slot && me && me.secretArt ? me.secretArt[slot] : null;
  const on = theme === 'onimai' && !!ver;
  const key = slot + ':' + ver;
  const [url, setUrl] = useState(cache.get(key) || null);
  useEffect(() => {
    if (!on) { setUrl(null); return; }
    if (cache.has(key)) { setUrl(cache.get(key)); return; }
    let live = true;
    fetch('/api/account/secret-art/' + slot, { headers: { 'X-Account': accountToken() || '' } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (b && live) { const u = URL.createObjectURL(b); cache.set(key, u); setUrl(u); } })
      .catch(() => {});
    return () => { live = false; };
  }, [on, key]);
  return on ? url : null;
}

// a wide picture at the top of a page or window
export function SecretPic({ slot }) {
  const url = useSecretPic(slot);
  return url ? html`<img class="secret-pic" src=${url} alt="" />` : null;
}

// the sticker pictures (up to six): a small row of them
export function useSecretStickers() {
  const pics = [useSecretPic('sticker1'), useSecretPic('sticker2'), useSecretPic('sticker3'), useSecretPic('sticker4'), useSecretPic('sticker5'), useSecretPic('sticker6')];
  return pics.filter(Boolean);
}
