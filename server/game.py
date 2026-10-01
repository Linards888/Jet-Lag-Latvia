"""Mode-independent game logic: creation, join/auth, teams, lifecycle, location ingest, views.

Security model (anti-cheat):
  * Every member has a secret token; the server only stores its hash. Role/team are server-side state.
  * Exactly ONE admin exists per game (created with the game). The admin key is shown once and can be
    used to log in on another device, which revokes the previous admin token (still one admin).
  * The admin works in one of three modes (switchable any time, every switch is logged):
        player - plays like everybody else; admin controls are locked (no accidental clicks)
        fair   - all admin controls, but sees only what a player/spectator could see
        full   - all admin controls and sees everything (only for an admin who does not play while a game runs)
  * Hidden information (hider position, answers computed from GPS, ...) never leaves the server except
    through the rules of the game.
  * The hash-chained event log is visible to the admin only; players get short notices instead.
"""
import os
import secrets

import cards
import core
import geo
from core import GameError, log, notice, now_ms, sha

import hide
import race
import tag

MODES = {'race': race, 'hide': hide, 'tag': tag}
PALETTE = ['#e0457b', '#2f9e8f', '#e8a200', '#3b82c4', '#8d6ad9', '#f06d3c', '#3aa655', '#c2415a']
ONLINE_MS = 75000
SPEED_FLAG_MS = 140 / 3.6  # m/s; trains in Latvia top out below this
ADMIN_MODES = ('player', 'fair', 'full')
_FAILS = {}  # (kind, code, id) -> [timestamps]; in memory only, self-healing


def _throttle(key, limit, window_s, record=False):
    now = now_ms() / 1000
    hits = [t for t in _FAILS.get(key, []) if now - t < window_s]
    if record:
        hits.append(now)
    _FAILS[key] = hits
    return len(hits) >= limit


# ---------------------------------------------------------------- creation / membership
def _new_token():
    return secrets.token_urlsafe(24)


def _member(game, name, role, pin):
    if role not in ('admin', 'player', 'spectator'):
        raise GameError('Bad role')
    name = core.clean_name(name)
    if any(m['name'].lower() == name.lower() for m in game['members'].values()):
        raise GameError('That name is already taken in this game')
    pin = str(pin or '')
    if not (pin.isdigit() and 4 <= len(pin) <= 8):
        raise GameError('Choose a PIN of 4-8 digits (used to get back in from another device)')
    mid = core.new_id()
    token = _new_token()
    game['members'][mid] = {
        'id': mid, 'name': name, 'role': role, 'pinHash': sha(game['code'] + mid + pin), 'tokenHash': sha(token),
        'teamId': None, 'joinedAt': now_ms(), 'lastSeen': now_ms(), 'loc': None, 'trail': [],
    }
    return game['members'][mid], token


def create_game(store, mode, name, admin_name, admin_pin, admin_plays, settings):
    if mode not in MODES:
        raise GameError('Unknown game mode')
    with core.LOCK:
        code = core.new_code()
        while code in store.games:
            code = core.new_code()
        game = {
            'code': code, 'mode': mode, 'name': core.clean_name(name, 'Game name'), 'createdAt': now_ms(),
            'status': 'lobby', 'adminId': None, 'adminKeyHash': None, 'adminPlays': bool(admin_plays),
            'adminMode': 'fair' if admin_plays else 'full',
            'members': {}, 'teams': {}, 'log': [], 'notices': [], 'files': {}, 'version': 1, 'joinLocked': False,
            'flags': [], 'data': {}, 'secret': {}, 'pausedAt': None,
        }
        game['settings'] = MODES[mode].default_settings()
        if settings:
            game['settings'] = MODES[mode].clean_settings(game['settings'], settings)
        member, token = _member(game, admin_name, 'admin', admin_pin)
        game['adminId'] = member['id']
        key = core.new_key()
        game['adminKeyHash'] = sha(code + key)
        store.games[code] = game
        store.tokens[member['tokenHash']] = (code, member['id'])
        log(game, 'system', 'Game "%s" created (%s). Admin: %s, mode: %s' % (game['name'], mode, member['name'], game['adminMode']))
        store.mark(urgent=True)
        return game, key, token, member


def get_game(store, code):
    g = store.games.get(str(code or '').upper())
    if not g:
        raise GameError('Game not found', 404)
    return g


def authenticate(store, game, token):
    if not token:
        return None
    ref = store.tokens.get(sha(token))
    if not ref or ref[0] != game['code']:
        return None
    m = game['members'].get(ref[1])
    return m if m and m['tokenHash'] == sha(token) else None


def _issue_token(store, game, member):
    store.tokens.pop(member['tokenHash'], None)
    token = _new_token()
    member['tokenHash'] = sha(token)
    store.tokens[member['tokenHash']] = (game['code'], member['id'])
    return token


def join(store, game, name, role, pin):
    if role not in ('player', 'spectator'):
        raise GameError('Role must be player or spectator')
    if role == 'player':
        if game['status'] != 'lobby':
            raise GameError('The game already started - you can still join as a spectator')
        if game['joinLocked']:
            raise GameError('The admin locked joining')
        if sum(1 for m in game['members'].values() if m['role'] == 'player') >= 12:
            raise GameError('Game is full (12 players)')
    if len(game['members']) >= 40:
        raise GameError('Game is full')
    m, token = _member(game, name, role, pin)
    store.tokens[m['tokenHash']] = (game['code'], m['id'])
    log(game, 'join', '%s joined as %s' % (m['name'], role), m['id'])
    return m, token


def rejoin(store, game, name, pin):
    m = next((x for x in game['members'].values() if x['name'].lower() == str(name or '').strip().lower()), None)
    if not m or m['role'] == 'admin':
        raise GameError('No such member (admins use the admin key)')
    key = ('pin', game['code'], m['id'])
    if _throttle(key, 8, 600):
        raise GameError('Too many wrong PINs - try again in 10 minutes', 429)
    if sha(game['code'] + m['id'] + str(pin)) != m['pinHash']:
        _throttle(key, 8, 600, record=True)
        raise GameError('Wrong PIN')
    return m, _issue_token(store, game, m)


def admin_login(store, game, key):
    k = ('admin', game['code'], game['adminId'])
    if _throttle(k, 8, 900):
        raise GameError('Too many wrong admin keys - try again in 15 minutes', 429)
    if sha(game['code'] + str(key or '').strip().upper()) != game['adminKeyHash']:
        _throttle(k, 8, 900, record=True)
        raise GameError('Wrong admin key')
    admin = game['members'][game['adminId']]
    log(game, 'system', 'Admin logged in on a new device (previous admin session revoked)')
    return admin, _issue_token(store, game, admin)


def attempt_ok(game, m, what, cooldown_s):
    """Throttle probing actions so GPS checks cannot be used as a free oracle."""
    k = ('try', game['code'], m['id'], what)
    if _throttle(k, 1, cooldown_s):
        raise GameError('Wait %d s before trying that again' % cooldown_s)
    _throttle(k, 1, cooldown_s, record=True)


# ---------------------------------------------------------------- roles (used by the modes)
def admin_mode(game):
    return game.get('adminMode') or ('fair' if game['adminPlays'] else 'full')


def admin_active(game, m):
    """Admin with admin controls unlocked (mode fair or full)."""
    return bool(m) and m['role'] == 'admin' and admin_mode(game) != 'player'


def is_referee(game, m):
    """Sees everything: the admin in full mode."""
    return bool(m) and m['role'] == 'admin' and admin_mode(game) == 'full'


def neutral_admin(game, m):
    """Active admin who is not a participant: may settle disputes (force 'found', review proofs of anybody)."""
    return admin_active(game, m) and not game['adminPlays']


def participants(game):
    """Members who take part in play (players, plus the admin if adminPlays)."""
    return [m for m in game['members'].values() if m['role'] == 'player' or (m['role'] == 'admin' and game['adminPlays'])]


def plays(game, m):
    return m['role'] == 'player' or (m['role'] == 'admin' and game['adminPlays'])


def fresh_loc(m, now, max_age=120000):
    loc = m.get('loc')
    return loc if loc and now - loc['t'] <= max_age else None


def team_members(game, tid):
    return [m for m in game['members'].values() if m['teamId'] == tid]


def team_ids(game, tid):
    return [m['id'] for m in team_members(game, tid)]


def team_name(game, tid):
    t = game['teams'].get(tid)
    return t['name'] if t else '?'


def put_file(store, game, member, data, scope):
    if len(data) > 6 * 1024 * 1024 or len(data) < 100:
        raise GameError('Image too large or empty')
    if not (data[:3] == b'\xff\xd8\xff' or data[:8] == b'\x89PNG\r\n\x1a\n' or data[:4] == b'RIFF'):
        raise GameError('Only JPEG/PNG/WebP images are accepted')
    fid = core.new_id(8)
    d = os.path.join(store.dir, 'uploads', game['code'])
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, fid), 'wb') as f:
        f.write(data)
    game['files'][fid] = {'owner': member['id'], 't': now_ms(), 'scope': scope,
                          'mime': 'image/png' if data[:4] == b'\x89PNG' else ('image/webp' if data[:4] == b'RIFF' else 'image/jpeg')}
    return fid


def can_read_file(game, m, f):
    if is_referee(game, m) or f['owner'] == m['id']:
        return True
    scope = f['scope']
    if scope == 'members':
        return True
    return isinstance(scope, list) and m['id'] in scope


# ---------------------------------------------------------------- locations
def update_loc(game, m, lat, lng, acc):
    if game['status'] not in ('running', 'lobby', 'paused'):
        return
    if not plays(game, m):
        raise GameError('Only participants share a location')
    lat, lng = core.num(lat, -90, 90, 'lat'), core.num(lng, -180, 180, 'lng')
    acc = core.num(acc or 0, 0, 100000, 'accuracy')
    t = now_ms()
    prev = m.get('loc')
    m['loc'] = {'lat': lat, 'lng': lng, 'acc': acc, 't': t}
    m['lastSeen'] = t
    tr = m['trail']
    if not tr or t - tr[-1][0] > 60000 or geo.haversine(tr[-1][1], tr[-1][2], lat, lng) > 25:
        tr.append([t, round(lat, 5), round(lng, 5)])
        if len(tr) > 2500:
            del tr[:500]
    if prev and game['status'] == 'running' and game['mode'] in ('race', 'tag') and acc < 100 and prev.get('acc', 0) < 100:
        dt = (t - prev['t']) / 1000
        d = geo.haversine(prev['lat'], prev['lng'], lat, lng)
        if 5 <= dt <= 600 and d > 400 and d / dt > SPEED_FLAG_MS and t - m.get('lastSpeedFlag', 0) > 600000:
            m['lastSpeedFlag'] = t
            text = '%s moved ~%d km/h - faster than public transport allows (possible car/taxi)' % (m['name'], d / dt * 3.6)
            game['flags'].append({'t': t, 'memberId': m['id'], 'text': text})
            log(game, 'flag', text, m['id'])
    hook = getattr(MODES[game['mode']], 'on_loc', None)
    if hook and game['status'] == 'running':
        hook(game, m, t)


# ---------------------------------------------------------------- lifecycle + common actions
def _require_admin(game, m):
    if m['role'] != 'admin':
        raise GameError('Only the admin can do that', 403)
    if admin_mode(game) == 'player':
        raise GameError('Switch to Admin mode first - you are currently playing as a normal player', 403)


TEAM_ACTIONS = ('team_create', 'team_join', 'team_leave')
ADMIN_ACTIONS = ('start', 'pause', 'resume', 'end', 'announce', 'update_settings', 'lock_join', 'assign_team', 'kick', 'rename_team', 'edit_catalog')


def do_action(store, game, m, typ, p):
    mod = MODES[game['mode']]
    now = now_ms()
    p = p or {}
    if typ in TEAM_ACTIONS:
        return _team_action(game, m, typ, p)
    if typ == 'admin_mode':
        return _set_admin_mode(game, m, p)
    if typ in ADMIN_ACTIONS:
        _require_admin(game, m)
        return _admin_action(store, game, m, typ, p, now)
    return mod.action(store, game, m, typ, p, now)


def _set_admin_mode(game, m, p):
    if m['role'] != 'admin':
        raise GameError('Only the admin can do that', 403)
    mode = p.get('mode')
    if mode not in ADMIN_MODES:
        raise GameError('Unknown admin mode')
    if mode == 'player' and not game['adminPlays']:
        raise GameError('You are not a player in this game')
    if mode == 'full' and game['adminPlays'] and game['status'] in ('running', 'paused'):
        raise GameError('You play in this game, so the all-seeing view is locked while it runs')
    if mode == admin_mode(game):
        return
    game['adminMode'] = mode
    log(game, 'system', 'Admin switched to "%s" mode' % mode, m['id'])


def _team_action(game, m, typ, p):
    if game['mode'] == 'hide':
        raise GameError('Hide & Seek has no teams')
    if game['status'] != 'lobby':
        raise GameError('Teams are locked once the game started')
    if not plays(game, m):
        raise GameError('Only players can be on a team')
    if typ == 'team_create':
        if len(game['teams']) >= 8:
            raise GameError('Max 8 teams')
        name = core.clean_name(p.get('name'), 'Team name')
        if any(t['name'].lower() == name.lower() for t in game['teams'].values()):
            raise GameError('Team name taken')
        tid = core.new_id(4)
        game['teams'][tid] = {'id': tid, 'name': name, 'color': core.color_ok(p.get('color'), PALETTE[len(game['teams']) % 8])}
        m['teamId'] = tid
        log(game, 'team', '%s created team %s' % (m['name'], name), m['id'])
    elif typ == 'team_join':
        t = game['teams'].get(p.get('teamId'))
        if not t:
            raise GameError('No such team')
        if len(team_members(game, t['id'])) >= 4:
            raise GameError('Team is full (4)')
        m['teamId'] = t['id']
        log(game, 'team', '%s joined team %s' % (m['name'], t['name']), m['id'])
    else:
        m['teamId'] = None
        _drop_empty_teams(game)


def _drop_empty_teams(game):
    used = {x['teamId'] for x in game['members'].values()}
    for tid in [t for t in game['teams'] if t not in used]:
        del game['teams'][tid]


def _edit_catalog(game, p):
    kind = p.get('kind')
    mode = game['mode']
    s = game['settings']
    if kind == 'cards' and mode in ('race', 'hide'):
        s['cards'] = cards.default_cards(mode) if p.get('reset') else cards.clean_cards(mode, p.get('items'))
    elif kind == 'tasks' and mode == 'race':
        s['tasks'] = cards.default_tasks() if p.get('reset') else cards.clean_tasks(p.get('items'))
    else:
        raise GameError('This game has no such catalogue')


def _admin_action(store, game, m, typ, p, now):
    mod = MODES[game['mode']]
    st = game['status']
    if typ == 'announce':
        text = str(p.get('text') or '').strip()[:300]
        if not text:
            raise GameError('Empty announcement')
        log(game, 'announce', text, m['id'])
        notice(game, text, 'announce')
    elif typ == 'lock_join':
        game['joinLocked'] = bool(p.get('locked', True))
        log(game, 'system', 'Joining %s' % ('locked' if game['joinLocked'] else 'unlocked'), m['id'])
    elif typ == 'update_settings':
        if st != 'lobby':
            raise GameError('Settings can only be changed in the lobby')
        game['settings'] = mod.clean_settings(game['settings'], p.get('settings') or {})
        if p.get('name'):
            game['name'] = core.clean_name(p['name'], 'Game name')
        log(game, 'system', 'Admin updated the game settings', m['id'])
    elif typ == 'edit_catalog':
        if st == 'finished':
            raise GameError('The game is over')
        _edit_catalog(game, p)
        log(game, 'system', 'Admin changed the %s list' % p.get('kind'), m['id'])
    elif typ == 'rename_team':
        t = game['teams'].get(p.get('teamId'))
        if not t or st != 'lobby':
            raise GameError('Cannot rename now')
        t['name'] = core.clean_name(p.get('name'), 'Team name')
        t['color'] = core.color_ok(p.get('color'), t['color'])
    elif typ == 'assign_team':
        if st != 'lobby':
            raise GameError('Teams are locked once the game started')
        t = game['members'].get(p.get('memberId'))
        if not t or not plays(game, t):
            raise GameError('Bad member')
        if p.get('teamId') and p['teamId'] not in game['teams']:
            raise GameError('No such team')
        t['teamId'] = p.get('teamId') or None
        _drop_empty_teams(game)
        log(game, 'team', 'Admin moved %s to %s' % (t['name'], team_name(game, t['teamId']) if t['teamId'] else 'no team'), m['id'])
    elif typ == 'kick':
        t = game['members'].get(p.get('memberId'))
        if not t or t['role'] == 'admin':
            raise GameError('Cannot remove that member')
        if st != 'lobby' and t['role'] == 'player':
            raise GameError('Players cannot be removed after the game started')
        store.tokens.pop(t['tokenHash'], None)
        del game['members'][t['id']]
        _drop_empty_teams(game)
        log(game, 'join', '%s was removed by the admin' % t['name'], m['id'])
    elif typ == 'start':
        if st != 'lobby':
            raise GameError('Already started')
        mod.start(game, now)  # raises GameError if the lobby is not ready
        game['status'] = 'running'
        game['startedAt'] = now
        game['joinLocked'] = True
        if game['adminPlays'] and admin_mode(game) == 'full':
            game['adminMode'] = 'fair'
        log(game, 'system', 'The game has started', m['id'])
        notice(game, 'The game has started', 'info')
    elif typ == 'pause':
        if st != 'running':
            raise GameError('Not running')
        mod.accrue(game, now)
        game['status'], game['pausedAt'] = 'paused', now
        log(game, 'system', 'Game paused: %s' % (str(p.get('reason') or '')[:120] or 'no reason given'), m['id'])
        notice(game, 'The game is paused', 'info')
    elif typ == 'resume':
        if st != 'paused':
            raise GameError('Not paused')
        paused = now - game['pausedAt']
        game['status'], game['pausedAt'] = 'running', None
        mod.resume(game, now, paused)
        log(game, 'system', 'Game resumed', m['id'])
        notice(game, 'The game continues', 'info')
    elif typ == 'end':
        if st in ('lobby', 'finished'):
            raise GameError('Nothing to end')
        mod.accrue(game, now)
        mod.finish(game, now)
        game['status'] = 'finished'
        log(game, 'system', 'The admin ended the game', m['id'])
        notice(game, 'The game is over', 'info')


def tick(store, now):
    """Called every few seconds: time-based transitions."""
    with core.LOCK:
        for g in store.games.values():
            if g['status'] == 'running':
                before = g['version']
                try:
                    MODES[g['mode']].tick(g, now)
                except Exception as e:  # never let one game kill the loop
                    print('tick error', g['code'], repr(e))
                store.mark(urgent=g['version'] != before)


# ---------------------------------------------------------------- views
def public_info(game):
    return {'code': game['code'], 'name': game['name'], 'mode': game['mode'], 'status': game['status'],
            'players': sum(1 for m in game['members'].values() if m['role'] == 'player'),
            'joinLocked': game['joinLocked'], 'adminPlays': game['adminPlays']}


def view(game, me):
    now = now_ms()
    mod = MODES[game['mode']]
    active = admin_active(game, me)
    members = []
    for x in game['members'].values():
        members.append({'id': x['id'], 'name': x['name'], 'role': x['role'], 'teamId': x['teamId'], 'plays': plays(game, x),
                        'online': now - x['lastSeen'] < ONLINE_MS, 'hasLoc': bool(fresh_loc(x, now, 300000))})
    notices = [{'id': n['id'], 't': n['t'], 'text': n['text'], 'kind': n['kind']}
               for n in game.get('notices', [])[-60:] if n['to'] is None or me['id'] in n['to']]
    out = {
        'now': now, 'code': game['code'], 'mode': game['mode'], 'name': game['name'], 'status': game['status'],
        'version': game['version'], 'joinLocked': game['joinLocked'], 'adminPlays': game['adminPlays'],
        'startedAt': game.get('startedAt'), 'pausedAt': game.get('pausedAt'),
        'me': {'id': me['id'], 'name': me['name'], 'role': me['role'], 'teamId': me['teamId'], 'plays': plays(game, me),
               'adminMode': admin_mode(game) if me['role'] == 'admin' else None, 'canAdmin': active,
               'referee': is_referee(game, me), 'neutral': neutral_admin(game, me)},
        'members': members,
        'teams': [{'id': t['id'], 'name': t['name'], 'color': t['color']} for t in game['teams'].values()],
        'settings': game['settings'], 'notices': notices,
        'g': mod.view(game, me, now),
    }
    if active:  # the event log is for the admin only
        out.update({'log': game['log'][-150:], 'logTotal': len(game['log']), 'chainOk': core.verify_log(game), 'flags': game['flags'][-20:]})
    return out


def touch(game, m):
    m['lastSeen'] = now_ms()


def bump(store, game):
    game['version'] += 1
    store.mark(urgent=True)
