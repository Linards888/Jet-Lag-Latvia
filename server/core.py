"""Shared engine pieces: ids, persistence, Riga time windows, tamper-evident log."""
import datetime
import hashlib
import json
import os
import secrets
import tempfile
import threading
import time

LOCK = threading.RLock()
DATA_DIR = os.environ.get('JETLAG_DATA', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
MAX_NAME = 24
DAY = 86400000
_BAD_CHARS = {ord(c): None for c in ['<', '>', '&', '"', "'", '`', '\\']}
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


class GameError(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.status = status


def now_ms():
    return int(time.time() * 1000)


def sha(s):
    return hashlib.sha256(s.encode('utf8')).hexdigest()


def new_id(n=6):
    return secrets.token_hex(n)


def new_code():
    return ''.join(secrets.choice(ALPHABET) for _ in range(5))


def new_key():
    return '-'.join(''.join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(4))


# ---------------------------------------------------------------- Europe/Riga time (no tzdata needed)
def _last_sunday_utc_ms(year, month):
    d = datetime.date(year, month, 31)
    d -= datetime.timedelta(days=(d.weekday() + 1) % 7)
    return int(datetime.datetime(d.year, d.month, d.day, 1, tzinfo=datetime.timezone.utc).timestamp() * 1000)


def riga_offset_ms(utc_ms):
    y = datetime.datetime.fromtimestamp(utc_ms / 1000, datetime.timezone.utc).year
    dst = _last_sunday_utc_ms(y, 3) <= utc_ms < _last_sunday_utc_ms(y, 10)
    return (3 if dst else 2) * 3600000


def hhmm_to_min(s):
    h, m = str(s).split(':')
    return int(h) * 60 + int(m)


def local_day_start(utc_ms):
    """UTC ms of local (Riga) midnight of the day containing utc_ms."""
    off = riga_offset_ms(utc_ms)
    loc = utc_ms + off
    mid = loc - loc % DAY
    return mid - riga_offset_ms(mid - off)


def _next_day(day_start):
    return local_day_start(day_start + DAY + 3 * 3600000)


def eff_elapsed(a, b, win):
    """Milliseconds between a and b that fall inside the daily play window win={'start','end'}."""
    if b <= a:
        return 0
    if not win:
        return b - a
    ws, we = hhmm_to_min(win['start']) * 60000, hhmm_to_min(win['end']) * 60000
    total, day = 0, local_day_start(a)
    while day < b:
        total += max(0, min(b, day + we) - max(a, day + ws))
        day = _next_day(day)
    return total


def window_state(now, win):
    """(is_open, ms_until_change)."""
    if not win:
        return True, None
    ws, we = hhmm_to_min(win['start']) * 60000, hhmm_to_min(win['end']) * 60000
    day = local_day_start(now)
    if day + ws <= now < day + we:
        return True, day + we - now
    if now < day + ws:
        return False, day + ws - now
    return False, _next_day(day) + ws - now


# ---------------------------------------------------------------- store
class Store:
    """All games live in memory and are persisted atomically to one JSON file (plus uploads/)."""

    def __init__(self, path=None):
        self.dir = DATA_DIR
        os.makedirs(os.path.join(self.dir, 'uploads'), exist_ok=True)
        self.path = path or os.path.join(self.dir, 'games.json')
        self.games = {}
        self.tokens = {}  # token hash -> (code, member id)
        self._dirty = False
        self._urgent = False
        self._load()

    def _load(self):
        for p in (self.path, self.path + '.bak'):
            try:
                with open(p, encoding='utf8') as f:
                    self.games = json.load(f)
                break
            except (OSError, ValueError):
                continue
        for code, g in self.games.items():
            for m in g['members'].values():
                self.tokens[m['tokenHash']] = (code, m['id'])

    def mark(self, urgent=False):
        self._dirty = True
        self._urgent = self._urgent or urgent

    def due(self, now_s, last_s):
        """Write soon after real actions, but only every ~45 s for bulk location data (SD-card friendly)."""
        return self._dirty and (now_s - last_s > 45 or (self._urgent and now_s - last_s > 4))

    def flush(self, force=False):
        with LOCK:
            if not (self._dirty or force):
                return
            self._dirty = self._urgent = False
            data = json.dumps(self.games, ensure_ascii=False, separators=(',', ':'))
        fd, tmp = tempfile.mkstemp(dir=self.dir, prefix='games-', suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf8') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        if os.path.exists(self.path):
            try:
                os.replace(self.path, self.path + '.bak')
            except OSError:
                pass
        os.replace(tmp, self.path)


# ---------------------------------------------------------------- tamper-evident public log
_FIELDS = ('i', 't', 'type', 'text', 'actor', 'data')


def _entry_hash(prev, e):
    return sha(prev + json.dumps({k: e[k] for k in _FIELDS}, sort_keys=True, ensure_ascii=False))


def log(game, typ, text, actor=None, data=None):
    """Append to the public, hash-chained event log (every member can read and verify it)."""
    prev = game['log'][-1]['hash'] if game['log'] else 'genesis'
    e = {'i': len(game['log']), 't': now_ms(), 'type': typ, 'text': text, 'actor': actor, 'data': data}
    e['hash'] = _entry_hash(prev, e)
    game['log'].append(e)
    return e


def verify_log(game):
    prev = 'genesis'
    for e in game['log']:
        if _entry_hash(prev, e) != e['hash']:
            return False
        prev = e['hash']
    return True


# ---------------------------------------------------------------- validation helpers
def clean_name(s, what='Name'):
    s = ' '.join(str(s or '').translate(_BAD_CHARS).split())[:MAX_NAME]
    if len(s) < 2:
        raise GameError(what + ' must be at least 2 characters')
    return s


def color_ok(c, default='#e63946'):
    c = str(c or '')
    return c if len(c) == 7 and c[0] == '#' and all(ch in '0123456789abcdefABCDEF' for ch in c[1:]) else default


def num(v, lo, hi, name):
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise GameError(name + ' must be a number')
    if not lo <= v <= hi:
        raise GameError('%s must be between %s and %s' % (name, lo, hi))
    return v
