"""Mode 1: Race across Latvia.

* Latvia is split into regions (territories) made of novadi (municipalities). A team starts in the start city's novads.
  To travel on it must complete ONE task in the novads it is in; that opens the novadi bordering it, and checking in
  (tapping a novads on the map) moves the team there. Every region must be visited at least once, then the team checks
  in at the finish city. Time is not scored: the first team to reach the finish wins.
* A list of N tasks (default 5) is SHARED by every team. When a team completes one it disappears for everybody and a
  new shared task appears. A finished task gives the team ONE card pick: it shows as many random cards as the task's
  difficulty (1-6) and the team keeps one (with a full hand it may swap one of its cards, or take none).
  Photo proof is optional (lobby switch `requireProof`).
* When the daily play window closes, every team votes for the tasks it wants replaced; when the window opens again the
  tasks voted for by ALL teams are swapped for new ones.
"""
import random

import cards
import core
import geo
import game as G
from core import GameError, log, notice

TERRITORIES = [
    {'id': 'kurzeme', 'name': 'Kurzeme', 'color': '#2f9e8f'},
    {'id': 'zemgale', 'name': 'Zemgale & Sēlija', 'color': '#e8a200'},
    {'id': 'pieriga', 'name': 'Rīga & Pierīga', 'color': '#f06d3c'},
    {'id': 'vidzeme', 'name': 'Vidzeme', 'color': '#3b82c4'},
    {'id': 'latgale', 'name': 'Latgale', 'color': '#8d6ad9'},
]

DEFAULTS = {
    'startCity': 'liepaja', 'finishCity': 'daugavpils', 'useWindow': True, 'window': {'start': '08:00', 'end': '21:00'},
    'tasksEnabled': True, 'requireProof': False, 'taskSlots': 5, 'taskVotes': 3, 'handLimit': 6, 'days': 5, 'disabledCities': [],
}


def default_settings():
    s = dict(DEFAULTS)
    s['window'] = dict(DEFAULTS['window'])
    s['disabledCities'] = []
    s['territories'] = [dict(t) for t in TERRITORIES]
    s['muniTerritory'] = dict(geo.DEFAULT_MUNI_TERRITORY)
    s['cityTerritory'] = {}
    s['cards'] = cards.default_cards('race')
    s['tasks'] = cards.default_tasks()
    _recompute_city_territory(s)
    return s


def _recompute_city_territory(s):
    s['cityTerritory'] = {c['id']: geo.territory_at(c['lat'], c['lng'], s['muniTerritory']) for c in geo.CITIES}


def clean_settings(old, patch):
    s = dict(old)
    for k, (lo, hi) in {'days': (0, 14), 'taskSlots': (1, 12), 'taskVotes': (1, 6), 'handLimit': (2, 12)}.items():  # days 0 = no limit
        if k in patch:
            s[k] = int(core.num(patch[k], lo, hi, k))
    for k in ('useWindow', 'tasksEnabled', 'requireProof'):
        if k in patch:
            s[k] = bool(patch[k])
    if 'window' in patch:
        w = patch['window']
        try:
            a, b = core.hhmm_to_min(w['start']), core.hhmm_to_min(w['end'])
        except Exception:
            raise GameError('Bad time window')
        if not (0 <= a < b <= 24 * 60):
            raise GameError('Window start must be before end')
        s['window'] = {'start': w['start'], 'end': w['end']}
    for k in ('startCity', 'finishCity'):
        if k in patch:
            if patch[k] not in geo.CITY_BY_ID:
                raise GameError('Unknown city')
            s[k] = patch[k]
    if 'disabledCities' in patch:
        s['disabledCities'] = [c for c in patch['disabledCities'] if c in geo.CITY_BY_ID]
    if 'territories' in patch:
        ts = patch['territories']
        if not (2 <= len(ts) <= 8):
            raise GameError('Use 2 to 8 territories')
        out, seen = [], set()
        for t in ts:
            tid = str(t.get('id') or core.new_id(3))
            if tid in seen:
                raise GameError('Duplicate territory')
            seen.add(tid)
            out.append({'id': tid, 'name': core.clean_name(t.get('name'), 'Territory name'), 'color': core.color_ok(t.get('color'), '#888888')})
        s['territories'] = out
        s['muniTerritory'] = {m: (t if t in seen else out[0]['id']) for m, t in s['muniTerritory'].items()}
    if 'muniTerritory' in patch:
        ids = {t['id'] for t in s['territories']}
        mt = dict(s['muniTerritory'])
        for m, t in patch['muniTerritory'].items():
            if m in geo.MUNI_BY_ID and t in ids:
                mt[m] = t
        s['muniTerritory'] = mt
    _recompute_city_territory(s)
    return s


# ---------------------------------------------------------------- helpers
def _td(game, tid):
    return game['data']['teams'][tid]


def _win(game):
    s = game['settings']
    return s['window'] if s['useWindow'] else None


def _terr_name(game, tid):
    return next((t['name'] for t in game['settings']['territories'] if t['id'] == tid), tid)


def _city_muni(city_id):
    return geo.CITY_BY_ID[city_id].get('muni')


def _muni_name(mid):
    return geo.MUNI_BY_ID[mid]['name'] if mid in geo.MUNI_BY_ID else mid


def novads_open(game, tid):
    """Novadi the team may check in to: the neighbours of every novads where it completed a task (all of them when tasks are off)."""
    d = _td(game, tid)
    seen = set(d['visited'])
    if not game['settings']['tasksEnabled']:
        return sorted(m for m in geo.MUNI_BY_ID if m not in seen)
    out = set()
    for u in d['unlocked']:
        out |= geo.ADJ.get(u, set())
    return sorted(out - seen)


def _novads_of(game, p):
    """The novads a check-in or finish points at: tapped on the map (muniId) or the novads of a checkpoint city (cityId)."""
    mid = p.get('muniId')
    if mid is None:
        city = geo.CITY_BY_ID.get(p.get('cityId'))
        if not city or city['id'] in game['settings']['disabledCities']:
            raise GameError('That city is not a checkpoint')
        mid = _city_muni(city['id'])
    if mid not in geo.MUNI_BY_ID:
        raise GameError('Choose a novads on the map')
    return mid


def _regions_left(game, tid):
    reached = set(_td(game, tid)['reached'])
    return [t['id'] for t in game['settings']['territories'] if t['id'] not in reached]


def _task(game, task_id):
    return next((t for t in game['settings']['tasks'] if t['id'] == task_id), None)


def _need_running(game):
    if game['status'] != 'running':
        raise GameError('The game is paused' if game['status'] == 'paused' else 'The game is not running')


def _need_window(game, now):
    open_, _ = core.window_state(now, _win(game))
    if not open_:
        raise GameError('Outside the daily play window')


def _my_team(game, m):
    if not m['teamId'] or not G.plays(game, m):
        raise GameError('You are not on a team')
    return m['teamId']


def _can_review(game, m, team_id):
    if G.plays(game, m):
        return m['teamId'] is not None and m['teamId'] != team_id
    return G.admin_active(game, m)


def _end_ms(game):
    """When the planned days run out (None = no limit)."""
    s, data = game['settings'], game['data']
    if not s.get('days') or not game.get('startedAt'):
        return None
    shift = data.get('shift', 0)
    if s['useWindow']:
        return core.nth_day_start(game['startedAt'], s['days'] - 1) + core.hhmm_to_min(s['window']['end']) * 60000 + shift
    return game['startedAt'] + s['days'] * core.DAY + shift


def _day_no(game, now):
    return max(1, round((core.local_day_start(now) - core.local_day_start(game['startedAt'])) / core.DAY) + 1) if game.get('startedAt') else 1


# ---------------------------------------------------------------- shared tasks
def _next_task(game):
    """A new task for the shared list: one that has not been shown yet (the list restarts when the catalogue is used up)."""
    data = game['data']
    ids = [t['id'] for t in game['settings']['tasks']]
    pool = [i for i in ids if i not in data['shared'] and i not in data['used']]
    if not pool:
        data['used'] = list(data['shared'])
        pool = [i for i in ids if i not in data['shared']]
    if not pool:
        return None
    x = random.choice(pool)
    data['used'].append(x)
    return x


def _replace_shared(game, task_id):
    """Swap one shared task for a new one (or just drop it when the catalogue has nothing left)."""
    shared = game['data']['shared']
    if task_id not in shared:
        return
    i = shared.index(task_id)
    new = _next_task(game)
    if new:
        shared[i] = new
    else:
        shared.pop(i)
    for tid, d in game['data']['teams'].items():  # votes and submitted proofs for the old task are void
        if d['vote'] and task_id in d['vote']:
            d['vote'] = [x for x in d['vote'] if x != task_id]
        if d['done'].get(task_id) == 'pending':
            del d['done'][task_id]
            d['proofs'] = [x for x in d['proofs'] if x['taskId'] != task_id]
            notice(game, 'task_gone', 'review', G.team_ids(game, tid))


def _fill_shared(game):
    data = game['data']
    while len(data['shared']) < game['settings']['taskSlots']:
        new = _next_task(game)
        if not new:
            break
        data['shared'].append(new)


def _add_card(game, tid, card):
    """Put a card into a team's hand; with a full hand the oldest card is dropped (used for stolen cards)."""
    d = _td(game, tid)
    if len(d['cards']) >= game['settings']['handLimit']:
        dropped = d['cards'].pop(0)
        notice(game, 'card_dropped', 'card', G.team_ids(game, tid), card=dropped['card']['name'])
    d['cards'].append({'iid': core.new_id(3), 'card': card, 't': core.now_ms()})


def _grant_pick(game, tid, options):
    """One card pick: `options` random cards of which the team keeps one."""
    cat = game['settings']['cards']
    if not cat:
        return
    _td(game, tid)['picks'].append({'pid': core.new_id(3), 'options': cards.draw(cat, max(1, options))})
    notice(game, 'picks', 'cards', G.team_ids(game, tid), n=1)


def _task_done(game, tid, task):
    """A team finished a shared task: it is gone for everybody, replaced by a new one, and the team gets its cards."""
    d = _td(game, tid)
    d['done'][task['id']] = 'approved'
    if d['at'] not in d['unlocked']:  # a task done here opens the novadi next to it
        d['unlocked'].append(d['at'])
        notice(game, 'novads_open', 'checkin', G.team_ids(game, tid), novads=_muni_name(d['at']))
    _replace_shared(game, task['id'])
    _grant_pick(game, tid, task['difficulty'])
    log(game, 'task', '%s completed "%s"' % (G.team_name(game, tid), task['title']))
    notice(game, 'task_done', 'claim', None, team=G.team_name(game, tid))


def _ensure(game):
    """Games saved by an older version get the fields of the shared task list and of the novads rules."""
    s, data = game['settings'], game['data']
    s.setdefault('taskVotes', 3)
    if not data.get('teams'):
        return
    if 'shared' in data:
        return
    start = _city_muni(s['startCity'])
    for d in data['teams'].values():
        d.setdefault('at', start)
        d.setdefault('visited', [d['at']])
        d.setdefault('unlocked', [])
        d.setdefault('picks', [])
    data['shared'], data['used'] = [], []
    if data.get('phase') == 'plan':
        data['phase'] = 'vote'
    s['cards'] = [c for c in s['cards'] if c['effect']['type'] in cards.RACE_EFFECTS]  # the time cards are gone
    if s['tasksEnabled']:
        _fill_shared(game)
    for d in data['teams'].values():
        d.setdefault('vote', None)
        d['cards'] = [c for c in d.get('cards', []) if c['card']['effect']['type'] in cards.RACE_EFFECTS]


def _sync(game, now):
    """Move between the day (play) and the night (vote) phase. True if something changed."""
    s, data = game['settings'], game['data']
    if not s['tasksEnabled'] or game['status'] != 'running' or not data.get('teams'):
        return False
    open_, _ = core.window_state(now, _win(game))
    if data['phase'] == 'play' and not open_:
        data['phase'] = 'vote'
        for d in data['teams'].values():
            d['vote'] = None
        notice(game, 'vote_start', 'cards', None, n=min(s['taskVotes'], len(data['shared'])))
        return True
    if data['phase'] == 'vote' and open_:
        votes = [set(d['vote'] or []) for d in data['teams'].values()]
        common = set.intersection(*votes) if votes else set()
        swapped = [x for x in data['shared'] if x in common]
        for x in swapped:
            _replace_shared(game, x)
        for d in data['teams'].values():
            d['vote'] = None
        data['phase'] = 'play'
        if swapped:
            log(game, 'system', 'The teams voted to replace %d tasks' % len(swapped))
        notice(game, 'vote_end', 'cards', None, n=len(swapped))
        return True
    return False


# ---------------------------------------------------------------- lifecycle
def start(game, now):
    teams = game['teams']
    if len(teams) < 2:
        raise GameError('Need at least 2 teams')
    for tid in teams:
        if not G.team_members(game, tid):
            raise GameError('Every team needs a player')
    if any(m['teamId'] is None for m in G.participants(game)):
        raise GameError('Everyone who plays must be on a team')
    s = game['settings']
    start_t = s['cityTerritory'].get(s['startCity'])
    start_m = _city_muni(s['startCity'])
    if not start_t or not start_m:
        raise GameError('The start city is not inside any territory')
    if not s['cityTerritory'].get(s['finishCity']):
        raise GameError('The finish city is not inside any territory')
    game['data'] = {'teams': {tid: {'reached': [start_t], 'at': start_m, 'visited': [start_m], 'unlocked': [], 'done': {}, 'proofs': [], 'cards': [], 'picks': [],
                                    'finishedAt': None, 'frozenUntil': 0, 'spyUntil': 0, 'vote': None} for tid in teams},
                    'shared': [], 'used': [], 'phase': 'play'}
    if s['tasksEnabled']:
        _fill_shared(game)
        if not core.window_state(now, _win(game))[0]:
            game['data']['phase'] = 'vote'


def accrue(game, now):
    pass


def resume(game, now, paused_ms):
    game['data']['shift'] = game['data'].get('shift', 0) + paused_ms  # the planned days do not run while paused


def finish(game, now):
    pass


def tick(game, now):
    _ensure(game)
    if _sync(game, now):
        game['version'] += 1
    d = game['data']
    end = _end_ms(game)
    if d.get('teams') and all(t['finishedAt'] for t in d['teams'].values()):
        game['status'] = 'finished'
        game['version'] += 1
        log(game, 'system', 'All teams finished - race over')
        notice(game, 'all_finished', 'round')
    elif end and now >= end:
        game['status'] = 'finished'
        game['version'] += 1
        log(game, 'system', 'The planned days are over - race ended')
        notice(game, 'time_up', 'round')


# ---------------------------------------------------------------- actions
def action(store, game, m, typ, p, now):
    s = game['settings']
    _ensure(game)
    if game['status'] == 'running':
        _sync(game, now)
    if typ == 'checkin':
        _need_running(game)
        _need_window(game, now)
        manual = bool(p.get('manual'))
        if manual:
            if not G.neutral_admin(game, m) or p.get('teamId') not in game['teams']:
                raise GameError('Only a neutral admin can check a team in manually', 403)
            tid = p['teamId']
        else:
            tid = _my_team(game, m)
        d = _td(game, tid)
        if d['finishedAt']:
            raise GameError('That team already finished')
        if d['frozenUntil'] > now and not manual:
            raise GameError('Your team is frozen for %d more minutes' % ((d['frozenUntil'] - now) // 60000 + 1))
        mid = _novads_of(game, p)
        if mid in d['visited']:
            raise GameError('You already visited %s' % _muni_name(mid))
        if not manual and mid not in novads_open(game, tid):
            if d['at'] not in d['unlocked']:
                raise GameError('Complete a task in %s first to open the neighbouring novadi' % _muni_name(d['at']))
            raise GameError('%s does not border a novads where you completed a task' % _muni_name(mid))
        d['visited'].append(mid)
        d['at'] = mid
        terr = s['muniTerritory'].get(mid)
        if terr and terr not in d['reached']:
            d['reached'].append(terr)
        if manual:
            log(game, 'override', 'Admin manually moved %s to %s' % (G.team_name(game, tid), _muni_name(mid)), m['id'])
        log(game, 'checkin', '%s reached %s' % (G.team_name(game, tid), _muni_name(mid)), m['id'])
        notice(game, 'reached', 'checkin', None, team=G.team_name(game, tid), terr=_terr_name(game, terr), city=_muni_name(mid))
    elif typ == 'finish':
        _need_running(game)
        _need_window(game, now)
        tid = _my_team(game, m)
        d = _td(game, tid)
        if d['finishedAt']:
            raise GameError('Already finished')
        if d['frozenUntil'] > now:
            raise GameError('Your team is frozen for %d more minutes' % ((d['frozenUntil'] - now) // 60000 + 1))
        if p.get('cityId') != s['finishCity']:
            raise GameError('That is not the finish city')
        if _regions_left(game, tid):
            raise GameError('Reach every territory first')
        fm = _city_muni(s['finishCity'])
        if fm not in d['visited'] and fm not in novads_open(game, tid):
            raise GameError('The finish is not open to you yet: complete a task in a novads next to it')
        d['finishedAt'] = now
        place = sum(1 for x in game['data']['teams'].values() if x['finishedAt'])
        fc = geo.CITY_BY_ID[s['finishCity']]['name']
        log(game, 'finish', '%s reached %s (finisher #%d)' % (G.team_name(game, tid), fc, place), m['id'])
        notice(game, 'finished', 'claim', None, team=G.team_name(game, tid), place=place)
    elif typ == 'pick':
        tid = _my_team(game, m)
        d = _td(game, tid)
        pk = next((x for x in d['picks'] if x['pid'] == p.get('pid')), None)
        if not pk:
            raise GameError('That pick is gone')
        if not p.get('pass'):
            idx = int(core.num(p.get('index'), 0, len(pk['options']) - 1, 'index'))
            if len(d['cards']) >= s['handLimit']:
                drop = next((i for i in d['cards'] if i['iid'] == p.get('discardIid')), None)
                if not drop:
                    raise GameError('Your hand is full (%d) - discard a card or pass on the new one' % s['handLimit'])
                d['cards'].remove(drop)
            d['cards'].append({'iid': core.new_id(3), 'card': pk['options'][idx], 't': now})
        d['picks'].remove(pk)
    elif typ == 'complete_task':
        _need_running(game)
        tid = _my_team(game, m)
        d = _td(game, tid)
        task = _task(game, p.get('taskId'))
        if not task or task['id'] not in game['data']['shared'] or game['data']['phase'] != 'play':
            raise GameError('That task is not available')
        if d['done'].get(task['id']) == 'pending':
            raise GameError('Your team already did that task')
        if s['requireProof']:
            f = game['files'].get(p.get('fid'))
            if not f or game['members'].get(f['owner'], {}).get('teamId') != tid:
                raise GameError('Upload a photo first')
            d['proofs'] = [x for x in d['proofs'] if x['taskId'] != task['id']]
            d['proofs'].append({'taskId': task['id'], 'fid': p['fid'], 'note': str(p.get('note') or '')[:240], 't': now, 'by': m['id']})
            d['done'][task['id']] = 'pending'
            log(game, 'proof', '%s submitted proof for "%s"' % (G.team_name(game, tid), task['title']), m['id'])
            notice(game, 'proof_submitted', 'review', None, team=G.team_name(game, tid))
        else:
            _task_done(game, tid, task)
    elif typ == 'vote_tasks':
        _need_running(game)
        tid = _my_team(game, m)
        if game['data']['phase'] != 'vote':
            raise GameError('Voting is only open outside the daily play window')
        ids = list(dict.fromkeys(p.get('taskIds') or []))
        want = min(s['taskVotes'], len(game['data']['shared']))
        if len(ids) != want or any(x not in game['data']['shared'] for x in ids):
            raise GameError('Choose exactly %d tasks' % want)
        _td(game, tid)['vote'] = ids
    elif typ == 'review':
        _need_running(game)
        team = game['teams'].get(p.get('teamId'))
        if not team or not _can_review(game, m, team['id']):
            raise GameError('You cannot review that team', 403)
        d = _td(game, team['id'])
        pr = next((x for x in d['proofs'] if x['taskId'] == p.get('taskId')), None)
        verdict = p.get('verdict')
        if not pr or verdict not in ('approve', 'reject'):
            raise GameError('Bad review')
        if d['done'].get(pr['taskId']) != 'pending':
            raise GameError('Already reviewed')
        task = _task(game, pr['taskId']) or {'id': pr['taskId'], 'title': 'task', 'difficulty': 1}
        log(game, 'review', '%s %s the proof of %s for "%s"' % (m['name'], 'approved' if verdict == 'approve' else 'rejected', team['name'], task['title']), m['id'])
        if verdict == 'approve':
            _task_done(game, team['id'], task)
        else:
            d['done'][pr['taskId']] = 'rejected'
            notice(game, 'proof_rejected', 'review', G.team_ids(game, team['id']))
    elif typ == 'discard':
        tid = _my_team(game, m)
        d = _td(game, tid)
        inst = next((i for i in d['cards'] if i['iid'] == p.get('iid')), None)
        if not inst:
            raise GameError('You do not have that card')
        d['cards'].remove(inst)
    elif typ == 'play_card':
        _need_running(game)
        _play_card(game, m, p, now)
    else:
        raise GameError('Unknown action')
    G.bump(store, game)


# ---------------------------------------------------------------- cards
def _blocked_by_shield(game, target_tid, card, attacker_tid):
    """A shield in the target's hand silently absorbs one hostile card."""
    t = _td(game, target_tid)
    sh = next((i for i in t['cards'] if i['card']['effect']['type'] == 'shield'), None)
    if not sh:
        return False
    t['cards'].remove(sh)
    log(game, 'card', "%s's shield blocked \"%s\" from %s" % (G.team_name(game, target_tid), card['name'], G.team_name(game, attacker_tid)))
    notice(game, 'shield_blocked', 'card', None, target=G.team_name(game, target_tid), card=card['name'], team=G.team_name(game, attacker_tid))
    return True


def _play_card(game, m, p, now):
    tid = _my_team(game, m)
    d = _td(game, tid)
    inst = next((i for i in d['cards'] if i['iid'] == p.get('iid')), None)
    if not inst:
        raise GameError('You do not have that card')
    card, e = inst['card'], inst['card']['effect']
    spec = cards.RACE_EFFECTS.get(e['type'])
    if not spec:
        raise GameError('Unknown card effect')
    if spec.get('passive'):
        raise GameError('This card works automatically - just keep it in your hand')
    me_name = G.team_name(game, tid)
    needs_target = spec.get('target') or (e['type'] == 'text' and e.get('target'))
    target = None
    if needs_target:
        target = game['teams'].get(p.get('targetTeamId'))
        if not target or target['id'] == tid:
            raise GameError('Choose another team')
        if _td(game, target['id'])['finishedAt']:
            raise GameError('That team already finished')
    t = e['type']
    if t == 'steal' and not _td(game, target['id'])['cards']:
        raise GameError('That team has no cards to steal')
    if t == 'swap_task' and p.get('taskId') not in game['data']['shared']:
        raise GameError('Choose a task to replace')
    d['cards'].remove(inst)
    blocked = bool(target) and _blocked_by_shield(game, target['id'], card, tid)
    if not blocked:
        td = _td(game, target['id']) if target else None
        if t == 'freeze':
            td['frozenUntil'] = max(now, td['frozenUntil']) + e['min'] * 60000
            notice(game, 'curse_freeze', 'curse', G.team_ids(game, target['id']), min=e['min'])
        elif t == 'swap_task':
            _replace_shared(game, p['taskId'])
            notice(game, 'task_swapped', 'cards', None, team=me_name)
        elif t == 'extra_card':
            for _ in range(e['n']):
                _grant_pick(game, tid, 3)
        elif t == 'steal':
            stolen = random.choice(td['cards'])
            td['cards'].remove(stolen)
            _add_card(game, tid, stolen['card'])
            notice(game, 'curse_steal', 'curse', G.team_ids(game, target['id']), team=me_name)
        elif t == 'spy':
            d['spyUntil'] = max(now, d['spyUntil']) + e['min'] * 60000
    where = ' on %s' % target['name'] if target else ''
    log(game, 'card', '%s played "%s"%s%s' % (me_name, card['name'], where, ' (blocked by shield)' if blocked else ''), m['id'])
    if not target:
        notice(game, 'card_played', 'card', None, team=me_name, card=card['name'])
    elif blocked:
        notice(game, 'card_blocked', 'card', None, team=me_name, card=card['name'], target=target['name'])
    else:
        notice(game, 'card_played_on', 'card', None, team=me_name, card=card['name'], target=target['name'])
    if e['type'] == 'text' and not blocked:
        notice(game, 'card_text', 'card', (G.team_ids(game, target['id']) + G.team_ids(game, tid)) if target else None, card=card['name'], desc=card['desc'])


# ---------------------------------------------------------------- views
def _visible_locs(game, me, team, spy):
    out = []
    live = G.is_referee(game, me) or me['teamId'] == team['id'] or spy
    for x in G.team_members(game, team['id']):
        if live and x.get('loc'):
            l = x['loc']
            out.append({'id': x['id'], 'name': x['name'], 'lat': l['lat'], 'lng': l['lng'], 't': l['t'], 'live': True})
    return out


def view(game, me, now):
    s = game['settings']
    started = game['status'] in ('running', 'paused', 'finished')
    open_, change = core.window_state(now, _win(game))
    out = {'window': {'open': open_, 'msToChange': change}, 'teams': [], 'reviews': [], 'ranking': [], 'shared': []}
    if not started:
        return out
    _ensure(game)
    data = game['data']
    ranking = []
    mine = _td(game, me['teamId']) if me['teamId'] in data['teams'] else None
    spy = bool(mine and mine['spyUntil'] > now)
    referee = G.is_referee(game, me)
    out.update({'shared': data['shared'], 'phase': data['phase'], 'day': _day_no(game, now), 'days': s.get('days', 0), 'endsAt': _end_ms(game),
                'votesIn': sum(1 for d in data['teams'].values() if d['vote'])})
    for t in game['teams'].values():
        d = _td(game, t['id'])
        own = me['teamId'] == t['id'] or referee
        n_done = sum(1 for v in d['done'].values() if v == 'approved')
        row = {'id': t['id'], 'reached': d['reached'], 'finishedAt': d['finishedAt'], 'frozenUntil': d['frozenUntil'], 'tasksDone': n_done, 'locs': _visible_locs(game, me, t, spy)}
        if own:
            row.update({'cards': d['cards'], 'picks': d['picks'], 'spyUntil': d['spyUntil'], 'done': d['done'], 'vote': d['vote'],
                        'at': d['at'], 'visited': d['visited'], 'unlocked': d['unlocked']})
            if me['teamId'] == t['id']:
                row['open'] = novads_open(game, t['id'])
        out['teams'].append(row)
        for pr in d['proofs']:
            if d['done'].get(pr['taskId']) == 'pending' and _can_review(game, me, t['id']):
                out['reviews'].append({'teamId': t['id'], 'taskId': pr['taskId'], 'fid': pr['fid'], 'note': pr['note']})
        ranking.append(((0, d['finishedAt']) if d['finishedAt'] else (1, -(len(d['reached']) * 1000 + len(d['visited']) * 10 + n_done)), t['id']))
    ranking.sort()
    out['ranking'] = [r[1] for r in ranking]
    return out
