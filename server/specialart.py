"""Pictures of the special look. Unlike theme art they are NOT served from /art: only an account that holds the look can fetch them
(through the account API), they are never shown on public profiles or lists, and only the owner can upload or remove them."""
import os

import core
from core import GameError

SLOTS = ('hero', 'profile', 'game', 'settings', 'community', 'sticker1', 'sticker2', 'sticker3', 'sticker4', 'sticker5', 'sticker6')
EXT = (('jpg', bytes([0xFF, 0xD8, 0xFF])), ('png', bytes([0x89, 0x50, 0x4E, 0x47])), ('webp', b'RIFF'))
MAX_BYTES = 2_000_000


def _dir():
    return os.path.join(core.DATA_DIR, 'art', 'special')


def _file(slot):
    for ext, _ in EXT:
        f = os.path.join(_dir(), slot + '.' + ext)
        if os.path.isfile(f):
            return f
    return None


def find(slot):
    return _file(slot) if slot in SLOTS else None


def listing():
    """{slot: version} for every slot that has a picture (the version changes whenever the picture does)."""
    out = {}
    for s in SLOTS:
        f = _file(s)
        if f:
            out[s] = int(os.stat(f).st_mtime)
    return out


def save(slot, data):
    """Store (or, with an empty body, remove) the picture of one slot. Only real jpg/png/webp files are accepted."""
    if slot not in SLOTS:
        raise GameError('Not found')
    ext = None
    if data:  # check the new picture BEFORE the old one is removed
        ext = next((e for e, magic in EXT if data.startswith(magic) and (e != 'webp' or data[8:12] == b'WEBP')), None)
        if not ext:
            raise GameError('Only JPEG/PNG/WebP images are accepted')
    os.makedirs(_dir(), exist_ok=True)
    for old, _ in EXT:
        try:
            os.remove(os.path.join(_dir(), slot + '.' + old))
        except OSError:
            pass
    if not data:
        return True
    with open(os.path.join(_dir(), slot + '.' + ext), 'wb') as f:
        f.write(data)
    return True
