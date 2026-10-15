"""Player accounts: a persistent profile across games with stats, achievements, collectibles and cosmetics.

* No e-mail, no real money. Register with a name + password; the profile is public (achievements, collection) unless hidden.
* Game events (task done, tag, ...) feed counters -> achievements -> rewards. Stardust (earned by playing) used to buy standard
  summons; Sakura tickets (rare achievements / rare encounters only) buy the Anime banner, the ONLY place anime fonts drop.
* Server-side RNG and bookkeeping only: the client never decides what drops.
"""
import json
import os
import random
import secrets
import tempfile
import threading
import time

import core
import loot
from core import GameError

LOCK = threading.RLock()
DAY_MS = 86400000
DAILY_EVENT_DUST_CAP = 400
STD_PITY_EPIC, STD_PITY_LEG, ANI_PITY_LEG, ANI_PITY_MYTH = 30, 90, 10, 40
NAME_OK = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-')


def _now():
    return core.now_ms()


def _day(now):
    return core.local_day_start(now) // DAY_MS


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
        for uid, a in self.users.items():
            a['inv'] = {i: v for i, v in a.get('inv', {}).items() if i in loot.BY_ID}
            a['ach'] = {i: v for i, v in a.get('ach', {}).items() if i in loot.ACH_BY_ID}
            a['equip'].pop('font', None)
            for k, v in list(a['equip'].items()):
                if k in ('theme', 'frame', 'skin') and v and v not in loot.BASE and v not in a['inv']:
                    a['equip'][k] = loot.DEFAULT_EQUIP[k]
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

    def register(self, name, pw):
        name = str(name or '').strip()
        pw = str(pw or '')
        if not (3 <= len(name) <= 16) or any(c not in NAME_OK for c in name):
            raise GameError('Account name: 3-16 letters, digits, _ or -')
        if not (6 <= len(pw) <= 64):
            raise GameError('Password must be 6-64 characters')
        with LOCK:
            if name.lower() in self.names:
                raise GameError('That account name is taken')
            if len(self.users) >= 5000:
                raise GameError('Registration is closed')
            uid = core.new_id(5)
            salt = secrets.token_hex(8)
            now = _now()
            a = {'id': uid, 'name': name, 'salt': salt, 'pw': self._hash_pw(salt, pw), 'tokens': [], 'created': now,
                 'dust': 300, 'tickets': {'std': 0, 'sakura': 0}, 'pity': {'se': 0, 'sl': 0, 'al': 0, 'am': 0},
                 'inv': {}, 'stats': {}, 'modes': [], 'ach': {}, 'equip': json.loads(json.dumps(loot.DEFAULT_EQUIP)), 'xp': 0,
                 'streak': {'day': 0, 'n': 0, 'best': 0}, 'pending': [], 'log': [], 'earnedToday': {'day': 0, 'n': 0}, 'public': True}
            self.users[uid] = a
            self.names[name.lower()] = uid
            self._mark()
            token = self._new_token(a)
            self._daily(a, now)
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
            old = a['tokens'].pop(0)
            self.tokens.pop(old, None)
        self.tokens[h] = a['id']
        self._mark()
        return token

    def by_token(self, token):
        if not token:
            return None
        return self.users.get(self.tokens.get(core.sha(token)))

    def logout(self, a, token):
        h = core.sha(token or '')
        if h in a['tokens']:
            a['tokens'].remove(h)
            self.tokens.pop(h, None)
            self._mark()

    # ---------------------------------------------------------- inventory helpers
    def owns(self, a, item_id):
        return item_id in loot.BASE or item_id in a['inv']

    def _push(self, a, ev):
        a['pending'].append(dict(ev, t=_now()))
        del a['pending'][:-40]

    def _log(self, a, kind, **kw):
        a['log'].append(dict(kind=kind, t=_now(), **kw))
        del a['log'][:-30]

    def grant_item(self, a, item_id, source):
        """Returns True if new, False if duplicate (converted to stardust)."""
        it = loot.BY_ID[item_id]
        if item_id in loot.BASE:
            return False
        if item_id in a['inv']:
            a['inv'][item_id]['n'] += 1
            gain = loot.SHARDS[it['rarity']]
            a['dust'] += gain
            self._push(a, {'k': 'dupe', 'item': item_id, 'dust': gain})
            return False
        a['inv'][item_id] = {'n': 1, 't': _now(), 'src': source}
        self._push(a, {'k': 'item', 'item': item_id, 'src': source})
        self._log(a, 'item', item=item_id, src=source)
        return True

    # ---------------------------------------------------------- stats and achievements
    def _stat_value(self, a, stat):
        s = a['stats']
        if stat == 'modes':
            return len(a['modes'])
        if stat == 'items':
            return len(a['inv'])
        if stat == 'streak':
            return a['streak']['best']
        if stat == 'mythics':
            return sum(1 for i in a['inv'] if loot.BY_ID[i]['rarity'] == 'mythic')
        if stat == 'themes_owned':
            return sum(1 for t in loot.THEMES if self.owns(a, t))
        if stat == 'secret':
            return sum(1 for i in a['inv'] if loot.BY_ID[i]['rarity'] == 'secret')
        return s.get(stat, 0)

    def check_achievements(self, a):
        again = True
        while again:  # rewards can themselves unlock other achievements
            again = False
            for aid, stat, goal, reward, _ in loot.ACH:
                if aid in a['ach'] or self._stat_value(a, stat) < goal:
                    continue
                a['ach'][aid] = _now()
                a['dust'] += reward.get('dust', 0)
                a['tickets']['std'] += reward.get('std', 0)
                a['tickets']['sakura'] += reward.get('sakura', 0)
                a['xp'] += 25
                self._push(a, {'k': 'ach', 'id': aid})
                self._log(a, 'ach', id=aid)
                if reward.get('item'):
                    self.grant_item(a, reward['item'], 'achievement')
                again = True
        self._mark()

    def event(self, uid, stat, n=1, now=None):
        """A counted game event for account `uid` (called from the game code)."""
        now = now or _now()
        with LOCK:
            a = self.users.get(uid)
            if not a:
                return
            a['stats'][stat] = a['stats'].get(stat, 0) + n
            hour = ((now + core.riga_offset_ms(now)) // 3600000) % 24
            if hour < 4 and stat in loot.EVENT_DUST:
                a['stats']['night'] = a['stats'].get('night', 0) + 1
            gain = loot.EVENT_DUST.get(stat, 0) * n
            if gain:
                day = _day(now)
                e = a['earnedToday']
                if e['day'] != day:
                    e['day'], e['n'] = day, 0
                gain = max(0, min(gain, DAILY_EVENT_DUST_CAP - e['n']))
                e['n'] += gain
                a['dust'] += gain
                a['xp'] += gain
                if random.random() < loot.RARE_ENCOUNTER_CHANCE * n:
                    self._encounter(a)
            self.check_achievements(a)

    def _encounter(self, a):
        a['stats']['encounters'] = a['stats'].get('encounters', 0) + 1
        a['tickets']['sakura'] += 1
        a['dust'] += 150
        self._push(a, {'k': 'encounter', 'sakura': 1, 'dust': 150})
        self._log(a, 'encounter')
        if random.random() < 0.2:
            secrets_left = [i['id'] for i in loot.ITEMS if i['rarity'] == 'secret' and i['id'] not in a['inv']]
            if secrets_left:
                self.grant_item(a, random.choice(secrets_left), 'encounter')

    def game_started(self, uid, mode):
        with LOCK:
            a = self.users.get(uid)
            if not a:
                return
            if mode not in a['modes']:
                a['modes'].append(mode)
            self.event(uid, 'games_played')

    def game_finished(self, uid, won):
        with LOCK:
            a = self.users.get(uid)
            if not a:
                return
            a['dust'] += 40 + (120 if won else 0)
            a['xp'] += 40 + (120 if won else 0)
            self.event(uid, 'games_finished')
            if won:
                self.event(uid, 'wins')

    # ---------------------------------------------------------- daily login
    def _daily(self, a, now):
        day = _day(now)
        st = a['streak']
        if st['day'] == day:
            return False
        st['n'] = st['n'] + 1 if st['day'] == day - 1 else 1
        st['day'] = day
        st['best'] = max(st['best'], st['n'])
        gain = 30 + min(st['n'], 10) * 5
        a['dust'] += gain
        extra = {}
        if st['n'] % 7 == 0:
            a['tickets']['std'] += 1
            extra['std'] = 1
        self._push(a, dict({'k': 'daily', 'dust': gain, 'streak': st['n']}, **extra))
        self.check_achievements(a)
        self._mark()
        return True

    # ---------------------------------------------------------- summon
    def _roll_rarity(self, a, banner, guaranteed_min):
        w = dict(loot.STD_WEIGHTS if banner == 'std' else loot.ANIME_WEIGHTS)
        have = {i['rarity'] for i in loot.POOLS[banner]}
        order = loot.RARITIES
        w = {r: v for r, v in w.items() if r in have and (guaranteed_min is None or order.index(r) >= order.index(guaranteed_min))}
        total = sum(w.values())
        x = random.random() * total
        for r, v in w.items():
            x -= v
            if x <= 0:
                return r
        return list(w)[-1]

    def summon(self, a, banner, n):
        if banner not in ('std', 'anime') or n not in (1, 10):
            raise GameError('Bad summon')
        with LOCK:
            if banner == 'std':
                use_t = min(a['tickets']['std'], n)
                dust_cost = (n - use_t) * loot.STD_COST
                if n == 10 and use_t == 0:
                    dust_cost = 900
                if a['dust'] < dust_cost:
                    raise GameError('Not enough stardust')
                a['tickets']['std'] -= use_t
                a['dust'] -= dust_cost
            else:
                if a['tickets']['sakura'] < n:
                    raise GameError('Not enough Sakura tickets')
                a['tickets']['sakura'] -= n
            p = a['pity']
            results = []
            for k in range(n):
                if banner == 'std':
                    p['se'] += 1
                    p['sl'] += 1
                    floor = 'legendary' if p['sl'] >= STD_PITY_LEG else 'epic' if p['se'] >= STD_PITY_EPIC else ('rare' if (n == 10 and k == 9 and not any(loot.RARITIES.index(r['rarity']) >= 1 for r in results)) else None)
                else:
                    p['al'] += 1
                    p['am'] += 1
                    floor = 'mythic' if p['am'] >= ANI_PITY_MYTH else 'legendary' if p['al'] >= ANI_PITY_LEG else None
                rar = self._roll_rarity(a, banner, floor)
                pool = [i for i in loot.POOLS[banner] if i['rarity'] == rar]
                it = random.choice(pool)
                idx = loot.RARITIES.index(rar)
                if banner == 'std':
                    if idx >= 2:
                        p['se'] = 0
                    if idx >= 3:
                        p['sl'] = 0
                else:
                    if idx >= 3:
                        p['al'] = 0
                    if idx >= 4:
                        p['am'] = 0
                new = self.grant_item(a, it['id'], banner)
                results.append({'item': it['id'], 'rarity': rar, 'new': new})
            a['stats']['summons'] = a['stats'].get('summons', 0) + n
            self.check_achievements(a)
            self._mark()
            return results

    # ---------------------------------------------------------- owner tools (only for the account(s) the server owner names)
    def _owner_names(self):
        names = {n.strip().lower() for n in os.environ.get('JETLAG_OWNER', '').split(',') if n.strip()}
        try:
            with open(os.path.join(os.path.dirname(self.path), 'owner.json'), encoding='utf8') as f:
                v = json.load(f).get('owner', [])
            names |= {str(n).strip().lower() for n in (v if isinstance(v, list) else [v])}
        except (OSError, ValueError, AttributeError):
            pass
        return names

    def is_owner(self, a):
        return a['name'].lower() in self._owner_names()

    def owner_action(self, a, p):
        if not self.is_owner(a):
            raise GameError('Only the admin can do that', 403)
        with LOCK:
            act = p.get('action')
            if act == 'give':
                for k, lim in (('dust', 10 ** 9), ('xp', 10 ** 9)):
                    if k in p:
                        a[k] += int(core.num(p[k], -lim, lim, k))
                a['dust'] = max(0, a['dust'])
                for k, f in (('std', 'std'), ('sakura', 'sakura')):
                    if k in p:
                        a['tickets'][f] = max(0, a['tickets'][f] + int(core.num(p[k], -10 ** 6, 10 ** 6, k)))
            elif act == 'item':
                it = p.get('id')
                if it not in loot.BY_ID or it in loot.BASE:
                    raise GameError('Not found')
                if p.get('have', True):
                    a['inv'].setdefault(it, {'n': 1, 't': _now(), 'src': 'owner'})
                else:
                    a['inv'].pop(it, None)
                    for k, v in list(a['equip'].items()):
                        if v == it:
                            a['equip'][k] = loot.DEFAULT_EQUIP[k]
                    a['equip']['badges'] = [x for x in a['equip'].get('badges', []) if x != it]
                    a['equip']['widgets'] = [x for x in a['equip'].get('widgets', []) if x != it] or loot.DEFAULT_EQUIP['widgets']
            elif act == 'all_items':
                for i in loot.ITEMS:
                    if i['id'] not in loot.BASE:
                        a['inv'].setdefault(i['id'], {'n': 1, 't': _now(), 'src': 'owner'})
            elif act == 'ach':
                aid = p.get('id')
                if aid == 'all':
                    for x in loot.ACH:
                        a['ach'].setdefault(x[0], _now())
                elif aid in loot.ACH_BY_ID:
                    if p.get('have', True):
                        a['ach'].setdefault(aid, _now())
                    else:
                        a['ach'].pop(aid, None)
                else:
                    raise GameError('Not found')
            elif act == 'stat':
                stat = str(p.get('stat') or '')
                if not stat.isidentifier() or stat in ('modes', 'items', 'streak'):
                    raise GameError('Not found')
                a['stats'][stat] = int(core.num(p.get('value'), 0, 10 ** 9, 'value'))
                self.check_achievements(a)
            elif act == 'reset':
                for k in ('inv', 'stats', 'ach'):
                    a[k] = {}
                a['modes'], a['dust'], a['xp'] = [], 300, 0
                a['tickets'] = {'std': 0, 'sakura': 0}
                a['pity'] = {'se': 0, 'sl': 0, 'al': 0, 'am': 0}
                a['equip'] = json.loads(json.dumps(loot.DEFAULT_EQUIP))
            else:
                raise GameError('Not found')
            self._log(a, 'owner')
            self._mark()

    # ---------------------------------------------------------- equip
    def equip(self, a, p):
        with LOCK:
            e = a['equip']
            kind, item = p.get('kind'), p.get('item')
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
            elif kind in ('badges', 'widgets'):
                items = [x for x in (p.get('items') or []) if isinstance(x, str)]
                limit = 3 if kind == 'badges' else 8
                want = 'badge' if kind == 'badges' else 'widget'
                items = list(dict.fromkeys(items))[:limit]
                for x in items:
                    it = loot.BY_ID.get(x)
                    if not it or it['kind'] != want or not self.owns(a, x):
                        raise GameError('You do not own that')
                e[kind] = items
            elif kind == 'public':
                a['public'] = bool(p.get('value'))
            else:
                raise GameError('Not found')
            self._mark()

    # ---------------------------------------------------------- views
    def _common(self, a):
        owned = [i for i in a['inv']]
        return {
            'name': a['name'], 'level': 1 + int((a['xp'] / 60) ** 0.5), 'xp': a['xp'], 'created': a['created'], 'equip': a['equip'],
            'stats': dict(a['stats'], modes=len(a['modes']), best_streak=a['streak']['best']),
            'ach': a['ach'], 'owned': owned,
            'counts': {r: sum(1 for i in owned if loot.BY_ID[i]['rarity'] == r) for r in loot.RARITIES},
            'rarest': sorted(owned, key=lambda i: (-loot.RARITIES.index(loot.BY_ID[i]['rarity']), a['inv'][i]['t']))[:6],
            'recent': a['log'][-12:][::-1],
        }

    def me(self, a):
        with LOCK:
            now = _now()
            self._daily(a, now)
            v = self._common(a)
            v.update({'owner': self.is_owner(a), 'id': a['id'], 'dust': a['dust'], 'tickets': a['tickets'], 'pity': a['pity'], 'inv': a['inv'], 'public': a['public'],
                      'streak': a['streak'], 'pending': a['pending'], 'todayEarned': a['earnedToday']['n'] if a['earnedToday']['day'] == _day(now) else 0,
                      'dailyCap': DAILY_EVENT_DUST_CAP})
            a['pending'] = []
            self._mark()
            return v

    def public(self, name):
        with LOCK:
            a = self.users.get(self.names.get(str(name or '').strip().lower()))
            if not a or not a['public']:
                raise GameError('Not found', 404)
            return self._common(a)


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
    if ACC is None:
        return
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
