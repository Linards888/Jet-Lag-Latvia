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
MSG_MAX, CHAT_KEEP, FRIENDS_MAX, PENDING_MAX = 500, 200, 100, 30
ONLINE_MS = 120000
PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def _now():
    return core.now_ms()


def _day(now):
    return core.local_day_start(now) // DAY_MS


def _level(xp):
    return 1 + int((xp / 60) ** 0.5)


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
        self.seen = {}  # account id -> last time it used the site (memory only)
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
            a['equip'] = {'theme': eq.get('theme') if eq.get('theme') in loot.BY_ID else 'sakura', 'frame': eq.get('frame') if eq.get('frame') in loot.BY_ID else 'f_plain',
                          'skin': eq.get('skin') if eq.get('skin') in loot.BY_ID else 's_peach', 'title': eq.get('title') if eq.get('title') in loot.BY_ID else None,
                          'symbols': [x for x in eq.get('symbols', []) if x in loot.BY_ID][:loot.SYMBOLS_MAX]}
            for k, v in (('first', ''), ('last', ''), ('bio', ''), ('earned', {'day': 0, 'n': 0}), ('newcomerUntil', 0), ('showTheme', True),
                         ('friends', {}), ('reqIn', []), ('reqOut', []), ('chats', {}), ('unread', {})):
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
                 'inv': {}, 'stats': {}, 'modes': [], 'equip': _clean(loot.DEFAULT_EQUIP), 'xp': 0, 'newcomerUntil': _now() + loot.NEWCOMER_DAYS * DAY_MS, 'showTheme': True,
                 'friends': {}, 'reqIn': [], 'reqOut': [], 'chats': {}, 'unread': {},
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
        return item_id in loot.BY_ID and (item_id in loot.BASE or item_id in a['inv'] or (self.is_owner(a) and item_id not in loot.SECRET_IDS))

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

    # ---------------------------------------------------------- the secret look
    def _take(self, a, item_id):
        a['inv'].pop(item_id, None)
        for k, v in list(a['equip'].items()):
            if v == item_id:
                a['equip'][k] = loot.DEFAULT_EQUIP[k]

    def secret_action(self, actor, p):
        """claim / give / revoke (owner only) and drop (any holder). Everybody else gets a plain 404: the place does not exist for them."""
        item = loot.SECRET_IDS[0]
        act = p.get('action')
        with LOCK:
            if act == 'drop' and item in actor['inv']:
                self._take(actor, item)
                self._mark()
                return {'ok': True}
            if not self.is_owner(actor):
                raise GameError('Not found', 404)
            if act == 'claim':
                self.unlock_item(actor, item, 'secret')
            elif act in ('give', 'revoke'):
                u = self._by_name(p.get('name'))
                if not u:
                    raise GameError('Not found')
                if act == 'give':
                    self.unlock_item(u, item, 'gift')
                else:
                    self._take(u, item)
            elif act != 'list':
                raise GameError('Not found')
            self._mark()
            return {'holders': sorted(u['name'] for u in self.users.values() if item in u['inv']), 'mine': item in actor['inv']}

    # ---------------------------------------------------------- equip
    def equip(self, a, p):
        with LOCK:
            e, kind, item = a['equip'], p.get('kind'), p.get('item')
            if kind == 'title' and a['newcomerUntil'] > _now() and not self.is_owner(a):
                raise GameError('Your Newcomer title is locked for the first week')
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
            elif kind == 'symbols':
                items = list(dict.fromkeys(x for x in (p.get('items') or []) if isinstance(x, str)))[:loot.SYMBOLS_MAX]
                if any(loot.BY_ID.get(x, {}).get('kind') != 'symbol' or not self.owns(a, x) for x in items):
                    raise GameError('You do not own that')
                e['symbols'] = items
            elif kind == 'public':
                a['public'] = bool(p.get('value'))
            elif kind == 'showTheme':
                a['showTheme'] = bool(p.get('value'))
            else:
                raise GameError('Not found')
            self._mark()

    # ---------------------------------------------------------- friends, messages and game invitations
    def _by_name(self, name):
        return self.users.get(self.names.get(str(name or '').strip().lower()))

    def touch(self, a):
        self.seen[a['id']] = _now()

    def _brief(self, u, me=None):
        return {'name': u['name'], 'first': u['first'], 'last': u['last'], 'online': _now() - self.seen.get(u['id'], 0) < ONLINE_MS,
                'unread': me['unread'].get(u['id'], 0) if me else 0}

    def social(self, a):
        with LOCK:
            out = {'friends': [], 'incoming': [], 'outgoing': [], 'unread': sum(a['unread'].values())}
            for key, dst in (('friends', 'friends'), ('reqIn', 'incoming'), ('reqOut', 'outgoing')):
                for uid in list(a[key]):
                    u = self.users.get(uid)
                    if u:
                        out[dst].append(self._brief(u, a))
            return out

    def friend_action(self, a, p):
        with LOCK:
            act, u = p.get('action'), self._by_name(p.get('name'))
            if not u or u is a:
                raise GameError('Not found')
            uid, me = u['id'], a['id']
            if act == 'request':
                if uid in a['friends']:
                    raise GameError('Already friends')
                if me in u['reqOut'] or uid in a['reqIn']:  # they already asked: that is a yes
                    return self.friend_action(a, {'action': 'accept', 'name': u['name']})
                if len(a['friends']) >= FRIENDS_MAX or len(a['reqOut']) >= PENDING_MAX or len(u['reqIn']) >= PENDING_MAX:
                    raise GameError('Too many friend requests')
                if uid not in a['reqOut']:
                    a['reqOut'].append(uid)
                    u['reqIn'].append(me)
            elif act == 'accept':
                if uid not in a['reqIn']:
                    raise GameError('Not found')
                a['reqIn'].remove(uid)
                u['reqOut'] = [x for x in u['reqOut'] if x != me]
                a['friends'][uid] = u['friends'][me] = _now()
            elif act in ('decline', 'cancel'):
                a['reqIn'] = [x for x in a['reqIn'] if x != uid]
                a['reqOut'] = [x for x in a['reqOut'] if x != uid]
                u['reqIn'] = [x for x in u['reqIn'] if x != me]
                u['reqOut'] = [x for x in u['reqOut'] if x != me]
            elif act == 'remove':
                for x, y in ((a, uid), (u, me)):
                    x['friends'].pop(y, None)
                    x['chats'].pop(y, None)
                    x['unread'].pop(y, None)
            else:
                raise GameError('Not found')
            self._mark()

    def _friend(self, a, name):
        u = self._by_name(name)
        if not u or u['id'] not in a['friends']:
            raise GameError('You can only message friends')
        return u

    def chat_get(self, a, name):
        with LOCK:
            u = self._friend(a, name)
            if a['unread'].pop(u['id'], None):
                self._mark()
            return {'with': self._brief(u), 'messages': a['chats'].get(u['id'], [])[-100:]}

    def chat_send(self, a, name, text=None, invite=None):
        # text message, or a game invitation {code, game, mode} (the receiver gets a Join button)
        with LOCK:
            u = self._friend(a, name)
            if invite:
                msg = {'k': 'invite', 'code': str(invite.get('code') or '')[:5].upper(), 'game': str(invite.get('game') or '')[:40], 'mode': str(invite.get('mode') or '')[:8]}
                if len(msg['code']) != 5:
                    raise GameError('Not found')
            else:
                text = str(text or '').strip()[:MSG_MAX]
                if not text:
                    raise GameError('Empty message')
                msg = {'k': 'text', 'x': text}
            now = _now()
            for who, other, frm in ((a, u, 0), (u, a, 1)):
                chat = who['chats'].setdefault(other['id'], [])
                chat.append(dict(msg, f=frm, t=now))
                del chat[:-CHAT_KEEP]
            u['unread'][a['id']] = u['unread'].get(a['id'], 0) + 1
            self._mark()

    def _purge(self, a):
        # an account is gone: remove it from everybody's friends, requests and chats
        for u in self.users.values():
            for k in ('reqIn', 'reqOut'):
                u[k] = [x for x in u[k] if x != a['id']]
            for k in ('friends', 'chats', 'unread'):
                u[k].pop(a['id'], None)

    # ---------------------------------------------------------- views
    def _common(self, a):
        owned = self.owned_ids(a)
        return {
            'name': a['name'], 'first': a['first'], 'last': a['last'], 'bio': a['bio'], 'owner': self.is_owner(a),
            'level': _level(a['xp']), 'xp': a['xp'], 'created': a['created'], 'equip': a['equip'],
            'stats': dict(a['stats'], modes=len(a['modes']), streak=a['streak']['best']), 'owned': owned, 'showTheme': a['showTheme'],
        }

    def me(self, a):
        with LOCK:
            changed = self._daily(a, _now()) or bool(a['pending'])
            v = self._common(a)
            v.update({'id': a['id'], 'public': a['public'], 'streakNow': a['streak']['n'], 'pending': a['pending'], 'newcomerUntil': a['newcomerUntil']})
            secret = [i for i in loot.SECRET if i['id'] in a['inv']]  # only the holder ever sees these
            v['owned'], v['secret'] = v['owned'] + [i['id'] for i in secret], secret
            a['pending'] = []
            if changed:
                self._mark()
            return v

    def _online(self, u):
        return _now() - self.seen.get(u['id'], 0) < ONLINE_MS

    def _relation(self, viewer, u):
        """How the viewer stands to this account: me / friend / in (they asked me) / out (I asked them) / none; None when nobody is logged in."""
        if not viewer:
            return None
        if viewer is u:
            return 'me'
        uid = u['id']
        return 'friend' if uid in viewer['friends'] else 'in' if uid in viewer['reqIn'] else 'out' if uid in viewer['reqOut'] else 'none'

    def _entry(self, u, viewer=None):
        """One row of a people list / leaderboard."""
        e = u['equip']
        return {'name': u['name'], 'first': u['first'], 'last': u['last'], 'level': _level(u['xp']), 'xp': u['xp'], 'owner': self.is_owner(u), 'online': self._online(u),
                'equip': {'title': e.get('title'), 'frame': e.get('frame'), 'skin': e.get('skin'), 'symbols': e.get('symbols', [])}, 'created': u['created'],
                'stats': {k: u['stats'].get(k, 0) for k in ('wins', 'games_played', 'tasks_done')}, 'rel': self._relation(viewer, u)}

    def _ranked(self, sort, q=''):
        """Public accounts, best first. sort: level | wins | games | tasks | new | online."""
        q = q.strip().lower()
        pool = [u for u in self.users.values() if u['public'] and (not q or q in ' '.join((u['name'], u['first'], u['last'])).lower())]
        stat = {'wins': 'wins', 'games': 'games_played', 'tasks': 'tasks_done'}.get(sort)
        if sort == 'new':
            pool.sort(key=lambda u: -u['created'])
        elif stat:
            pool = [u for u in pool if u['stats'].get(stat, 0) > 0]
            pool.sort(key=lambda u: (-u['stats'].get(stat, 0), -u['xp'], u['name'].lower()))
        elif sort == 'online':
            pool = [u for u in pool if self._online(u)]
            pool.sort(key=lambda u: (-u['xp'], u['name'].lower()))
        else:
            pool.sort(key=lambda u: (-u['xp'], u['name'].lower()))
        return pool

    def people(self, viewer, q='', sort='level', limit=50):
        with LOCK:
            return [dict(self._entry(u, viewer), rank=i + 1) for i, u in enumerate(self._ranked(sort, q)[:limit])]

    def community(self, viewer):
        """Everything the community page shows at once."""
        with LOCK:
            top = lambda sort, n=10: [dict(self._entry(u, viewer), rank=i + 1) for i, u in enumerate(self._ranked(sort)[:n])]
            return {'total': sum(1 for u in self.users.values() if u['public']), 'online': top('online', 12), 'newest': top('new', 8),
                    'top': {k: top(k) for k in ('level', 'wins', 'games', 'tasks')}}

    def public(self, name, viewer=None):
        with LOCK:
            a = self.users.get(self.names.get(str(name or '').strip().lower()))
            if not a or not a['public']:
                raise GameError('Not found', 404)
            v = self._common(a)
            if not a['showTheme']:  # the player hides their theme from others
                v['equip'] = dict(v['equip'], theme=None)
            friends = [self.users[x] for x in a['friends'] if x in self.users and self.users[x]['public']]
            friends.sort(key=lambda u: -u['xp'])
            v.update({'online': self._online(a), 'rel': self._relation(viewer, a), 'friendCount': len(a['friends']),
                      'friends': [self._entry(u, viewer) for u in friends[:24]],
                      'rank': 1 + self._ranked('level').index(a)})
            return v

    # ---------------------------------------------------------- owner: everything about every account
    def owner_list(self, actor):
        self.require_owner(actor)
        with LOCK:
            return [{'id': a['id'], 'name': a['name'], 'first': a['first'], 'last': a['last'], 'level': _level(a['xp']), 'created': a['created'],
                     'items': len(a['inv']), 'devices': len(a['tokens']), 'friends': len(a['friends']), 'public': a['public'], 'stats': a['stats'], 'owner': self.is_owner(a)}
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
                raise GameError('The owner account cannot be renamed or deleted')  # its name would otherwise be free to take
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
            elif act in ('set_password', 'generate_password'):
                pw = ''.join(secrets.choice(PW_ALPHABET) for _ in range(12)) if act == 'generate_password' else str(p.get('password') or '')
                self._check_pw(pw)
                out['password'] = pw  # shown once to the owner, who can hand it over; the stored value is only a hash
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
                a.update(inv={}, stats={}, modes=[], xp=0, equip=_clean(loot.DEFAULT_EQUIP), streak={'day': 0, 'n': 0, 'best': 0}, log=[], pending=[], bio='', newcomerUntil=0)
            elif act == 'delete':
                self._purge(a)
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
