"""Player accounts: a persistent profile across games with stats, unlockable cosmetics and a short bio.

* No e-mail, no real money. An account has a first name, last name, a username (shown everywhere, also inside games) and a password
  (stored only as a salted hash). The profile is public unless the player hides it.
* Game events (task done, tag, ...) feed counters -> xp/level and item unlocks (see loot.py for the rules and tiers).
* The server owner (JETLAG_OWNER env or data/owner.json) owns every item and can see and change every account and game:
  see the owner_* methods and the /api/account/owner routes in app.py. Their profile always shows a site-owner mark.
"""
import json
import os
import random
import secrets
import tempfile
import threading

import core
import loot
from core import GameError

LOCK = threading.RLock()
DAY_MS = 86400000
DAILY_EVENT_XP_CAP = 400
NAME_OK = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-')
BIO_MAX = 300


def _now():
    return core.now_ms()


def _day(now):
    return core.local_day_start(now) // DAY_MS


def _clean(v):
    return json.loads(json.dumps(v))


def _person(v, what):
    v = ' '.join(str(v or '').split())
    if not (1 <= len(v) <= 24):
        raise GameError('%s must be 1-24 characters' % what)
    return v


class Accounts:
    def __init__(self, path=None):
        self.path = path or os.path.join(core.DATA_DIR, 'accounts.json')
        self.users, self.names, self.tokens = {}, {}, {}
        self._dirty = False
        self._load()

    # ---------------------------------------------------------- persistence
    def _load(self):
        for p in (self.path, self.path + '.bak'):
            try:
                with open(p, encoding='utf8') as f:
                    self.users = json.load(f)
                break
            except (OSError, ValueError):
                continue
        for uid, a in self.users.items():  # migrate data written by older versions
            for k in ('dust', 'tickets', 'pity', 'earnedToday', 'ach'):
                a.pop(k, None)
            a['inv'] = {i: v for i, v in a.get('inv', {}).items() if i in loot.BY_ID}
            eq = a.get('equip', {})
            a['equip'] = {k: (eq.get(k) if eq.get(k) in loot.BY_ID else v) for k, v in loot.DEFAULT_EQUIP.items()}
            for k, v in (('first', ''), ('last', ''), ('bio', ''), ('earned', {'day': 0, 'n': 0})):
                a.setdefault(k, v)
            self.names[a['name'].lower()] = uid
            for h in a['tokens']:
                self.tokens[h] = uid

    def flush(self, force=False):
        with LOCK:
            if not (self._dirty or force):
                return
            self._dirty = False
            data = json.dumps(self.users, ensure_ascii=False, separators=(',', ':'))
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path), prefix='acc-', suffix='.tmp')
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

    def _mark(self):
        self._dirty = True

    # ---------------------------------------------------------- auth
    @staticmethod
    def _hash_pw(salt, pw):
        return core.sha('acct:' + salt + ':' + pw)

    @staticmethod
    def _check_name(name):
        if not (3 <= len(name) <= 16) or any(c not in NAME_OK for c in name):
            raise GameError('Account name: 3-16 letters, digits, _ or -')

    @staticmethod
    def _check_pw(pw):
        if not (6 <= len(pw) <= 64):
            raise GameError('Password must be 6-64 characters')

    def register(self, first, last, name, pw):
        first, last, name, pw = _person(first, 'First name'), _person(last, 'Last name'), str(name or '').strip(), str(pw or '')
        self._check_name(name)
        self._check_pw(pw)
        with LOCK:
            if name.lower() in self.names:
                raise GameError('That account name is taken')
            if len(self.users) >= 5000:
                raise GameError('Registration is closed')
            uid = core.new_id(5)
            salt = secrets.token_hex(8)
            a = {'id': uid, 'name': name, 'first': first, 'last': last, 'bio': '', 'salt': salt, 'pw': self._hash_pw(salt, pw), 'tokens': [], 'created': _now(),
                 'inv': {}, 'stats': {}, 'modes': [], 'equip': _clean(loot.DEFAULT_EQUIP), 'xp': 0,
                 'streak': {'day': 0, 'n': 0, 'best': 0}, 'pending': [], 'log': [], 'earned': {'day': 0, 'n': 0}, 'public': True}
            self.users[uid] = a
            self.names[name.lower()] = uid
            token = self._new_token(a)
            self._daily(a, _now())
            return a, token

    def login(self, name, pw):
        with LOCK:
            a = self.users.get(self.names.get(str(name or '').strip().lower()))
            if not a or self._hash_pw(a['salt'], str(pw or '')) != a['pw']:
                raise GameError('Wrong account name or password')
            return a, self._new_token(a)

    def _new_token(self, a):
        token = secrets.token_urlsafe(24)
        h = core.sha(token)
        a['tokens'].append(h)
        if len(a['tokens']) > 6:
            self.tokens.pop(a['tokens'].pop(0), None)
        self.tokens[h] = a['id']
        self._mark()
        return token

    def by_token(self, token):
        return self.users.get(self.tokens.get(core.sha(token))) if token else None

    def logout(self, a, token):
        h = core.sha(token or '')
        if h in a['tokens']:
            a['tokens'].remove(h)
            self.tokens.pop(h, None)
            self._mark()

    def update_profile(self, a, p):
        with LOCK:
            if 'first' in p:
                a['first'] = _person(p['first'], 'First name')
            if 'last' in p:
                a['last'] = _person(p['last'], 'Last name')
            if 'bio' in p:
                a['bio'] = str(p['bio'] or '').strip()[:BIO_MAX]
            self._mark()

    # ---------------------------------------------------------- owner identity
    _owner_cache = (None, frozenset())  # (owner.json mtime, names): the file is re-read only when it changes

    @classmethod
    def owner_names(cls):
        names = {n.strip().lower() for n in os.environ.get('JETLAG_OWNER', '').split(',') if n.strip()}
        path = os.path.join(core.DATA_DIR, 'owner.json')
        try:
            mtime = os.stat(path).st_mtime_ns
        except OSError:
            return names
        if cls._owner_cache[0] != mtime:
            try:
                with open(path, encoding='utf8') as f:
                    v = json.load(f).get('owner', [])
                cls._owner_cache = (mtime, frozenset(str(n).strip().lower() for n in (v if isinstance(v, list) else [v])))
            except (OSError, ValueError, AttributeError):
                cls._owner_cache = (mtime, frozenset())
        return names | cls._owner_cache[1]

    def is_owner(self, a):
        return a['name'].lower() in self.owner_names()

    def require_owner(self, a):
        if not self.is_owner(a):
            raise GameError('Only the admin can do that', 403)

    # ---------------------------------------------------------- inventory and unlocks
    def owns(self, a, item_id):
        return item_id in loot.BY_ID and (item_id in loot.BASE or item_id in a['inv'] or self.is_owner(a))

    def owned_ids(self, a):
        owner = self.is_owner(a)
        return [i['id'] for i in loot.ITEMS if i['stat'] is not None and (owner or i['id'] in a['inv'])]

    def _push(self, a, ev):
        a['pending'].append(dict(ev, t=_now()))
        del a['pending'][:-40]

    def _log(self, a, kind, **kw):
        a['log'].append(dict(kind=kind, t=_now(), **kw))
        del a['log'][:-30]

    def _stat_value(self, a, stat):
        if stat == 'modes':
            return len(a['modes'])
        if stat == 'streak':
            return a['streak']['best']
        return a['stats'].get(stat, 0)

    def unlock_item(self, a, item_id, source):
        if item_id in a['inv'] or item_id not in loot.BY_ID or item_id in loot.BASE:
            return False
        a['inv'][item_id] = {'t': _now(), 'src': source}
        self._push(a, {'k': 'item', 'item': item_id, 'src': source})
        self._log(a, 'item', item=item_id, src=source)
        return True

    def check_unlocks(self, a):
        for i in loot.UNLOCKABLE:
            if i['id'] not in a['inv'] and self._stat_value(a, i['stat']) >= i['goal']:
                self.unlock_item(a, i['id'], 'unlock')
        self._mark()

    def event(self, uid, stat, n=1, now=None):
        """A counted game event for account `uid` (called from the game code)."""
        now = now or _now()
        with LOCK:
            a = self.users.get(uid)
            if not a:
                return
            a['stats'][stat] = a['stats'].get(stat, 0) + n
            xp = loot.EVENT_XP.get(stat, 0) * n
            if xp:
                if ((now + core.riga_offset_ms(now)) // 3600000) % 24 < 4:
                    a['stats']['night'] = a['stats'].get('night', 0) + 1
                e, day = a['earned'], _day(now)
                if e['day'] != day:
                    e['day'], e['n'] = day, 0
                xp = max(0, min(xp, DAILY_EVENT_XP_CAP - e['n']))
                e['n'] += xp
                a['xp'] += xp
                if random.random() < loot.RARE_ENCOUNTER_CHANCE * n:  # a very rare random event: counts toward the 'encounters' unlocks
                    a['stats']['encounters'] = a['stats'].get('encounters', 0) + 1
                    self._log(a, 'encounter')
            self.check_unlocks(a)

    def game_started(self, uid, mode):
        with LOCK:
            a = self.users.get(uid)
            if a:
                if mode not in a['modes']:
                    a['modes'].append(mode)
                self.event(uid, 'games_played')

    def game_finished(self, uid, won):
        with LOCK:
            a = self.users.get(uid)
            if a:
                a['xp'] += 40 + (120 if won else 0)
                self.event(uid, 'games_finished')
                if won:
                    self.event(uid, 'wins')

    # ---------------------------------------------------------- daily login streak
    def _daily(self, a, now):
        day, st = _day(now), a['streak']
        if st['day'] == day:
            return False
        st['n'] = st['n'] + 1 if st['day'] == day - 1 else 1
        st['day'] = day
        st['best'] = max(st['best'], st['n'])
        a['xp'] += 10 + min(st['n'], 10) * 2
        self.check_unlocks(a)
        return True

    # ---------------------------------------------------------- equip
    def equip(self, a, p):
        with LOCK:
            e, kind, item = a['equip'], p.get('kind'), p.get('item')
            if kind in ('theme', 'title', 'frame', 'skin'):
                if item is None:
                    if kind != 'title':
                        raise GameError('Not found')
                    e[kind] = None
                else:
                    it = loot.BY_ID.get(item)
                    if not it or it['kind'] != kind or not self.owns(a, item):
                        raise GameError('You do not own that')
                    e[kind] = item
            elif kind == 'public':
                a['public'] = bool(p.get('value'))
            else:
                raise GameError('Not found')
            self._mark()

    # ---------------------------------------------------------- views
    def _common(self, a):
        owned = self.owned_ids(a)
        return {
            'name': a['name'], 'first': a['first'], 'last': a['last'], 'bio': a['bio'], 'owner': self.is_owner(a),
            'level': 1 + int((a['xp'] / 60) ** 0.5), 'xp': a['xp'], 'created': a['created'], 'equip': a['equip'],
            'stats': dict(a['stats'], modes=len(a['modes']), streak=a['streak']['best']), 'owned': owned,
        }

    def me(self, a):
        with LOCK:
            changed = self._daily(a, _now()) or bool(a['pending'])
            v = self._common(a)
            v.update({'id': a['id'], 'public': a['public'], 'streakNow': a['streak']['n'], 'pending': a['pending']})
            a['pending'] = []
            if changed:
                self._mark()
            return v

    def public(self, name):
        with LOCK:
            a = self.users.get(self.names.get(str(name or '').strip().lower()))
            if not a or not a['public']:
                raise GameError('Not found', 404)
            return self._common(a)

    # ---------------------------------------------------------- owner: everything about every account
    def owner_list(self, actor):
        self.require_owner(actor)
        with LOCK:
            return [{'id': a['id'], 'name': a['name'], 'first': a['first'], 'last': a['last'], 'level': 1 + int((a['xp'] / 60) ** 0.5), 'created': a['created'],
                     'items': len(a['inv']), 'devices': len(a['tokens']), 'public': a['public'], 'stats': a['stats']}
                    for a in sorted(self.users.values(), key=lambda x: x['created'])]

    def owner_view(self, actor, uid):
        self.require_owner(actor)
        a = self.users.get(uid)
        if not a:
            raise GameError('Not found', 404)
        v = self._common(a)
        v.update({'id': a['id'], 'public': a['public'], 'inv': a['inv'], 'modes': a['modes'], 'devices': len(a['tokens'])})
        return v

    def owner_action(self, actor, p):
        """Any change to any account (default: the owner's own). Passwords cannot be read (they are hashed) but can be replaced."""
        self.require_owner(actor)
        with LOCK:
            a = self.users.get(p.get('target')) if p.get('target') else actor
            if not a:
                raise GameError('Not found', 404)
            act, out = p.get('action'), {}
            if act in ('rename', 'delete') and self.is_owner(a):
                raise GameError('Not found')  # the owner account can never be renamed away or deleted (its name would be free to take)
            if act == 'item':
                it = p.get('id')
                if it not in loot.BY_ID or it in loot.BASE:
                    raise GameError('Not found')
                if p.get('have', True):
                    a['inv'].setdefault(it, {'t': _now(), 'src': 'owner'})
                else:
                    a['inv'].pop(it, None)
                    for k, v in list(a['equip'].items()):
                        if v == it:
                            a['equip'][k] = loot.DEFAULT_EQUIP[k]
            elif act == 'all_items':
                for i in loot.UNLOCKABLE:
                    a['inv'].setdefault(i['id'], {'t': _now(), 'src': 'owner'})
            elif act == 'stat':
                stat = str(p.get('stat') or '')
                if stat not in loot.STATS or stat in ('modes', 'streak'):
                    raise GameError('Not found')
                a['stats'][stat] = int(core.num(p.get('value'), 0, 10 ** 9, 'value'))
                self.check_unlocks(a)
            elif act == 'xp':
                a['xp'] = int(core.num(p.get('value'), 0, 10 ** 9, 'value'))
            elif act == 'equip':  # set any look, owned or not
                kind, item = p.get('kind'), p.get('item')
                if kind in ('theme', 'title', 'frame', 'skin') and (item is None or loot.BY_ID.get(item, {}).get('kind') == kind):
                    a['equip'][kind] = item
                else:
                    raise GameError('Not found')
            elif act == 'profile':
                self.update_profile(a, p)
            elif act == 'set_password':
                pw = str(p.get('password') or '')
                self._check_pw(pw)
                a['salt'] = secrets.token_hex(8)
                a['pw'] = self._hash_pw(a['salt'], pw)
                for h in a['tokens']:
                    self.tokens.pop(h, None)
                a['tokens'] = []
            elif act == 'rename':
                name = str(p.get('name') or '').strip()
                self._check_name(name)
                if self.names.get(name.lower(), a['id']) != a['id']:
                    raise GameError('That account name is taken')
                self.names.pop(a['name'].lower(), None)
                a['name'] = name
                self.names[name.lower()] = a['id']
            elif act == 'reset':
                a.update(inv={}, stats={}, modes=[], xp=0, equip=_clean(loot.DEFAULT_EQUIP), streak={'day': 0, 'n': 0, 'best': 0}, log=[], pending=[], bio='')
            elif act == 'delete':
                self.users.pop(a['id'], None)
                self.names.pop(a['name'].lower(), None)
                for h in a['tokens']:
                    self.tokens.pop(h, None)
            elif act == 'impersonate':  # a fresh login token for that account (the owner keeps their own)
                out['token'] = self._new_token(a)
            else:
                raise GameError('Not found')
            self._log(a, 'owner')
            self._mark()
            return out


# ---------------------------------------------------------------- hooks used by the game code
ACC = None


def init(path=None):
    global ACC
    ACC = Accounts(path)
    return ACC


def on_action(game, m, typ):
    """After a successful game action: count it for the player's account."""
    if ACC is None or not m.get('acct'):
        return
    stat = loot.ACTION_STAT.get(typ)
    if stat and not (typ == 'ask' and game['mode'] != 'hide') and not (typ == 'complete_task' and game['mode'] == 'hide'):
        ACC.event(m['acct'], stat)


def on_start(game, participants):
    if ACC is not None:
        for m in participants:
            if m.get('acct'):
                ACC.game_started(m['acct'], game['mode'])


def on_finish(game, winner_ids):
    """Once per game: finished + wins for every linked participant."""
    if ACC is None or game.get('settled'):
        return
    game['settled'] = True
    linked = {m['acct'] for m in game['members'].values() if m.get('acct')}
    if len(linked) < 2 or core.now_ms() - game.get('startedAt', 0) < 15 * 60000:
        return  # anti-farming: needs two different accounts and at least 15 minutes of play
    for m in game['members'].values():
        if m.get('acct') and (m['role'] == 'player' or (m['role'] == 'admin' and game.get('adminPlays'))):
            ACC.game_finished(m['acct'], m['id'] in winner_ids)
