"""Server-owner console: see and change every game (accounts live in accounts.py). Only for the account(s) named in
JETLAG_OWNER / data/owner.json; app.py checks that before calling anything here. PINs and passwords are stored only as salted
hashes, so they cannot be shown: the owner can replace them instead (set_pin here, set_password in accounts.py)."""
import json
import os
import re

import core
import game as G
from core import GameError, sha

HIDE_MEMBER = ('pinHash', 'tokenHash')  # everything else (incl. hidden game state) is shown to the owner


def list_games(store):
    out = []
    for g in sorted(store.games.values(), key=lambda x: -x['createdAt']):
        admin = next((m['name'] for m in g['members'].values() if m['role'] == 'admin'), '?')
        out.append(dict(G.public_info(g), createdAt=g['createdAt'], admin=admin, members=len(g['members']), teams=len(g['teams']),
                        linked=sum(1 for m in g['members'].values() if m.get('acct'))))
    return out


def dump_game(store, accounts, code):
    g = store.games.get(code)
    if not g:
        raise GameError('Game not found', 404)
    with core.LOCK:  # copy the parts the owner needs (no file blobs, no GPS trails, no hashes) while nobody is writing
        d = {k: v for k, v in g.items() if k not in ('files', 'members')}
        d['members'] = {mid: {k: v for k, v in m.items() if k not in HIDE_MEMBER + ('trail',)} for mid, m in g['members'].items()}
        d['fileCount'] = len(g.get('files', {}))
        d = json.loads(json.dumps(d))
    for m in d['members'].values():
        acct = accounts.users.get(m.get('acct'))
        m['accountName'] = acct['name'] if acct else None
    return d


def _set_path(root, path, value):
    if not isinstance(path, list) or not path:
        raise GameError('Not found')
    node = root
    for key in path[:-1]:
        node = node[int(key)] if isinstance(node, list) else node[str(key)]
    last = path[-1]
    if isinstance(node, list):
        node[int(last)] = value
    else:
        node[str(last)] = value


def game_action(store, g, p):
    """Anything: act as any member (play cards, start/end, timeouts ...), edit any value by path, set a PIN, delete the game."""
    act = p.get('action')
    with core.LOCK:
        if act == 'act':
            m = g['members'].get(p.get('memberId'))
            if not m:
                raise GameError('Bad member')
            G.do_action(store, g, m, str(p.get('type') or ''), p.get('payload') or {})
        elif act == 'patch':
            try:
                _set_path(g, p.get('path'), p.get('value'))
            except (KeyError, IndexError, ValueError, TypeError):
                raise GameError('Not found')
        elif act == 'set_pin':
            m = g['members'].get(p.get('memberId'))
            pin = str(p.get('pin') or '')
            if not m or not (pin.isdigit() and 4 <= len(pin) <= 8):
                raise GameError('Choose a PIN of 4-8 digits (used to get back in from another device)')
            m['pinHash'] = sha(g['code'] + m['id'] + pin)
        elif act == 'delete':
            for m in g['members'].values():
                store.tokens.pop(m['tokenHash'], None)
            store.games.pop(g['code'], None)
            store.mark(urgent=True)
            return
        else:
            raise GameError('Not found')
        G.settle(g, core.now_ms())  # a status changed through patch/act pays rewards exactly like a normal finish
        G.bump(store, g)


# ---------------------------------------------------------------- theme art (the owner uploads images they have the rights to)
ART_EXT = (('jpg', bytes([0xFF, 0xD8, 0xFF])), ('png', bytes([0x89, 0x50, 0x4E, 0x47])), ('webp', b'RIFF'))


def _art_dir():
    return os.path.join(core.DATA_DIR, 'art')


def find_art(theme, public_dir):
    theme = re.sub(r'[^a-z0-9]', '', str(theme).lower())
    for base in (_art_dir(), os.path.join(public_dir, 'art')):
        for ext, _ in ART_EXT:
            f = os.path.join(base, theme + '.' + ext)
            if theme and os.path.isfile(f):
                return f
    return None


def save_art(theme, data):
    """Store (or, with an empty body, remove) the art of one theme. Only real jpg/png/webp files are accepted."""
    import loot
    if loot.BY_ID.get(theme, {}).get('kind') != 'theme':
        raise GameError('Not found')
    new = None
    if data:  # check the new picture BEFORE the old one is removed
        new = next((e for e, magic in ART_EXT if data.startswith(magic) and (e != 'webp' or data[8:12] == b'WEBP')), None)
        if not new:
            raise GameError('Only JPEG/PNG/WebP images are accepted')
    os.makedirs(_art_dir(), exist_ok=True)
    for old, _ in ART_EXT:
        try:
            os.remove(os.path.join(_art_dir(), theme + '.' + old))
        except OSError:
            pass
    if not data:
        return True
    ext = new
    with open(os.path.join(_art_dir(), theme + '.' + ext), 'wb') as f:
        f.write(data)
    return True
