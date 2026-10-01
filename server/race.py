"""Mode 1: Race across Latvia.

* Latvia is split into territories. A territory is a region you must get OUT of: to progress you check in (tap the
  city on the map) in the next territory. When every territory is reached, check in at the finish city.
* All teams share the same N random tasks (default 5). A team presses "done" when it finished a task; an approved
  task gives card picks = its difficulty (1-6). Photo proof is optional (lobby switch `requireProof`).
* Cards belong to the team (max `handLimit` in hand). Each team may protect one task from the "shuffle" card.
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
    'startCity': 'liepaja', 'finishCity': 'daugavpils', 'ordered': True, 'useWindow': True, 'window': {'start': '08:00', 'end': '21:00'},
    'territoryBonusMin': 20, 'tasksEnabled': True, 'requireProof': False, 'taskSlots': 5, 'handLimit': 6, 'days': 5, 'disabledCities': [],
}


def default_settings():
    s = dict(DEFAULTS)
    s['window'] = dict(DEFAULTS['window'])
    s['disabledCities'] = []
    s['territories'] = [dict(t) for t in TERRITORIES]
    s['territoryOrder'] = [t['id'] for t in TERRITORIES]
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
    for k, (lo, hi) in {'territoryBonusMin': (0, 240), 'days': (1, 14), 'taskSlots': (1, 12), 'handLimit': (2, 12)}.items():
        if k in patch:
            s[k] = int(core.num(patch[k], lo, hi, k))
    for k in ('ordered', 'useWindow', 'tasksEnabled', 'requireProof'):
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
        s['territoryOrder'] = [t['id'] for t in out]
        s['muniTerritory'] = {m: (t if t in seen else out[0]['id']) for m, t in s['muniTerritory'].items()}
    if 'territoryOrder' in patch and 'territories' not in patch:
        order = patch['territoryOrder']
        if sorted(order) != sorted(t['id'] for t in s['territories']):
            raise GameError('Bad territory order')
        s['territoryOrder'] = list(order)
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


def available(game, tid):
    """Territories the team may still move into (ordered race: only the next one)."""
    s = game['settings']
    reached = set(_td(game, tid)['reached'])
    if s['ordered']:
        for t in s['territoryOrder']:
            if t not in reached:
                return [t]
        return []
    return [t['id'] for t in s['territories'] if t['id'] not in reached]


def _task(game, task_id):
    return next((t for t in game['settings']['tasks'] if t['id'] == task_id), None)


def _score_ms(game, tid, now):
    d = _td(game, tid)
    base = d['finishEffMs'] if d['finishedAt'] else core.eff_elapsed(game['startedAt'], now, _win(game))
    return base + (d['penaltyMin'] - d['bonusMin']) * 60000


def _need_running(game):
    if game['status'] != 'running':
        raise GameError('The game is paused' if game['status'] == 'paused' else 'The game is not running')


def _need_window(game, now):
    open_, _ = core.window_state(now, _win(game))
    if not open_:
        raise GameError('Outside the daily play window - the clock is stopped.')


def _my_team(game, m):
    if not m['teamId'] or not G.plays(game, m):
        raise GameError('You are not on a team')
    return m['teamId']


def _can_review(game, m, team_id):
    if G.plays(game, m):
        return m['teamId'] is not None and m['teamId'] != team_id
    return G.admin_active(game, m)


def _grant_picks(game, tid, n):
    cat = game['settings']['cards']
    if not cat or n <= 0:
        return
    d = _td(game, tid)
    for _ in range(min(n, 6)):
        d['picks'].append({'pid': core.new_id(3), 'options': cards.draw(cat, 3)})
    notice(game, 'picks', 'cards', G.team_ids(game, tid), n=n)


def _draw_active(game, n, exclude=()):
    pool = [t['id'] for t in game['settings']['tasks'] if t['id'] not in exclude]
    random.shuffle(pool)
    return pool[:n]


def _refresh_finished_tasks(game):
    """A task that every team has done is replaced by a new random one (same for everybody)."""
    d = game['data']
    teams = d['teams']
    for i, tid in enumerate(list(d['active'])):
        if all(tid in t['done'] and t['done'][tid] in ('approved', 'pending') for t in teams.values()):
            new = _draw_active(game, 1, exclude=set(d['active']))
            if new:
                d['active'][i] = new[0]
                for t in teams.values():
                    if t['pin'] == tid:
                        t['pin'] = None


def _after_reach(game, tid, terr):
    s = game['settings']
    if terr not in game['data']['claims']:
        game['data']['claims'][terr] = tid
        _td(game, tid)['bonusMin'] += s['territoryBonusMin']
        log(game, 'claim', '%s is the first to reach %s (-%d min bonus)' % (G.team_name(game, tid), _terr_name(game, terr), s['territoryBonusMin']))
        notice(game, 'claim', 'claim', None, team=G.team_name(game, tid), terr=_terr_name(game, terr), min=s['territoryBonusMin'])


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
    if not start_t:
        raise GameError('The start city is not inside any territory')
    if not s['cityTerritory'].get(s['finishCity']):
        raise GameError('The finish city is not inside any territory')
    game['data'] = {'teams': {tid: {'reached': [start_t], 'done': {}, 'proofs': [], 'pin': None, 'cards': [], 'picks': [], 'bonusMin': 0, 'penaltyMin': 0,
                                    'finishedAt': None, 'finishEffMs': None, 'adjust': [], 'frozenUntil': 0, 'spyUntil': 0} for tid in teams},
                    'claims': {}, 'active': _draw_active(game, s['taskSlots']) if s['tasksEnabled'] else []}


def accrue(game, now):
    pass


def resume(game, now, paused_ms):
    pass


def finish(game, now):
    pass


def tick(game, now):
    d = game['data']
    if d.get('teams') and all(t['finishedAt'] for t in d['teams'].values()):
        game['status'] = 'finished'
        game['version'] += 1
        log(game, 'system', 'All teams finished - race over')
        notice(game, 'all_finished', 'round')


# ---------------------------------------------------------------- actions
def action(store, game, m, typ, p, now):
    s = game['settings']
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
        city = geo.CITY_BY_ID.get(p.get('cityId'))
        if not city or city['id'] in s['disabledCities']:
            raise GameError('That city is not a checkpoint')
        terr = s['cityTerritory'].get(city['id'])
        if not terr:
            raise GameError('That city is not in any territory')
        if terr in d['reached']:
            raise GameError('You already reached %s' % _terr_name(game, terr))
        if terr not in available(game, tid):
            raise GameError('%s is in %s - not open to you yet. Next: %s.' % (city['name'], _terr_name(game, terr), ', '.join(_terr_name(game, t) for t in available(game, tid))))
        d['reached'].append(terr)
        if manual:
            log(game, 'override', 'Admin manually moved %s to %s' % (G.team_name(game, tid), _terr_name(game, terr)), m['id'])
        log(game, 'checkin', '%s reached %s via %s' % (G.team_name(game, tid), _terr_name(game, terr), city['name']), m['id'])
        notice(game, 'reached', 'checkin', None, team=G.team_name(game, tid), terr=_terr_name(game, terr), city=city['name'])
        _after_reach(game, tid, terr)
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
        if available(game, tid):
            raise GameError('Reach every territory first')
        d['finishedAt'] = now
        d['finishEffMs'] = core.eff_elapsed(game['startedAt'], now, _win(game))
        place = sum(1 for x in game['data']['teams'].values() if x['finishedAt'])
        fc = geo.CITY_BY_ID[s['finishCity']]['name']
        log(game, 'finish', '%s reached %s (finisher #%d)' % (G.team_name(game, tid), fc, place), m['id'])
        notice(game, 'finished', 'claim', None, team=G.team_name(game, tid), place=place)
    elif typ == 'complete_task':
        _need_running(game)
        tid = _my_team(game, m)
        d = _td(game, tid)
        task = _task(game, p.get('taskId'))
        if not task or task['id'] not in game['data']['active']:
            raise GameError('That task is not active')
        if d['done'].get(task['id']) in ('approved', 'pending'):
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
            d['done'][task['id']] = 'approved'
            log(game, 'task', '%s completed "%s"' % (G.team_name(game, tid), task['title']), m['id'])
            _grant_picks(game, tid, task['difficulty'])
            _refresh_finished_tasks(game)
    elif typ == 'pin_task':
        tid = _my_team(game, m)
        task_id = p.get('taskId')
        if task_id is not None and task_id not in game['data']['active']:
            raise GameError('That task is not active')
        _td(game, tid)['pin'] = task_id
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
        if d['done'].get(pr['taskId']) != 'pending' and not (G.neutral_admin(game, m) and d['done'].get(pr['taskId']) == 'approved'):
            raise GameError('Already reviewed')
        task = _task(game, pr['taskId']) or {'title': 'task', 'difficulty': 1}
        d['done'][pr['taskId']] = 'approved' if verdict == 'approve' else 'rejected'
        log(game, 'review', '%s %s the proof of %s for "%s"' % (m['name'], 'approved' if verdict == 'approve' else 'rejected', team['name'], task['title']), m['id'])
        if verdict == 'approve' and not pr.get('granted'):
            pr['granted'] = True
            _grant_picks(game, team['id'], task['difficulty'])
            _refresh_finished_tasks(game)
        elif verdict == 'reject':
            notice(game, 'proof_rejected', 'review', G.team_ids(game, team['id']))
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
    elif typ == 'adjust':
        if not G.admin_active(game, m):
            raise GameError('Switch to Admin mode first', 403)
        team = game['teams'].get(p.get('teamId'))
        reason = str(p.get('reason') or '').strip()[:160]
        if not team or not reason:
            raise GameError('Team and a reason are required (it is logged)')
        if m['teamId'] == team['id']:
            raise GameError('You cannot adjust your own team')
        minutes = int(core.num(p.get('minutes'), -600, 600, 'minutes'))
        d = _td(game, team['id'])
        d['penaltyMin'] += minutes
        d['adjust'].append({'t': now, 'min': minutes, 'reason': reason})
        log(game, 'override', 'Admin %s %d min to %s: %s' % ('added' if minutes >= 0 else 'removed', abs(minutes), team['name'], reason), m['id'])
        notice(game, 'adjusted', 'info', None, team=team['name'], min='%+d' % minutes, reason=reason)
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
    if t == 'shuffle_tasks' and not game['data']['active']:
        raise GameError('There are no tasks to shuffle')
    d['cards'].remove(inst)
    blocked = bool(target) and _blocked_by_shield(game, target['id'], card, tid)
    if not blocked:
        td = _td(game, target['id']) if target else None
        if t == 'time_bonus':
            d['bonusMin'] += e['min']
        elif t == 'time_penalty':
            td['penaltyMin'] += e['min']
            notice(game, 'curse_penalty', 'curse', G.team_ids(game, target['id']), team=me_name, min=e['min'])
        elif t == 'freeze':
            td['frozenUntil'] = max(now, td['frozenUntil']) + e['min'] * 60000
            notice(game, 'curse_freeze', 'curse', G.team_ids(game, target['id']), min=e['min'])
        elif t == 'shuffle_tasks':
            pinned = {x['pin'] for x in game['data']['teams'].values() if x['pin']}
            active = game['data']['active']
            pool = [x['id'] for x in game['settings']['tasks'] if x['id'] not in active]
            random.shuffle(pool)
            for i, task_id in enumerate(active):
                if task_id not in pinned and pool:
                    active[i] = pool.pop()
        elif t == 'extra_picks':
            _grant_picks(game, tid, e['n'])
        elif t == 'steal':
            stolen = random.choice(td['cards'])
            td['cards'].remove(stolen)
            d['cards'].append({'iid': core.new_id(3), 'card': stolen['card'], 't': now})
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
    out = {'window': {'open': open_, 'msToChange': change}, 'teams': [], 'reviews': [], 'ranking': [], 'active': []}
    if not started:
        return out
    ranking = []
    mine = _td(game, me['teamId']) if me['teamId'] in game['data']['teams'] else None
    spy = bool(mine and mine['spyUntil'] > now)
    referee = G.is_referee(game, me)
    out['active'] = game['data']['active']
    for t in game['teams'].values():
        d = _td(game, t['id'])
        own = me['teamId'] == t['id'] or referee
        sc = _score_ms(game, t['id'], now)
        n_done = sum(1 for v in d['done'].values() if v == 'approved')
        row = {'id': t['id'], 'reached': d['reached'], 'available': available(game, t['id']), 'bonusMin': d['bonusMin'], 'penaltyMin': d['penaltyMin'],
               'finishedAt': d['finishedAt'], 'scoreMs': sc, 'adjust': d['adjust'], 'frozenUntil': d['frozenUntil'], 'tasksDone': n_done,
               'locs': _visible_locs(game, me, t, spy)}
        if own:
            row.update({'cards': d['cards'], 'picks': d['picks'], 'spyUntil': d['spyUntil'], 'done': d['done'], 'pin': d['pin']})
        out['teams'].append(row)
        for pr in d['proofs']:
            if d['done'].get(pr['taskId']) == 'pending' and _can_review(game, me, t['id']):
                out['reviews'].append({'teamId': t['id'], 'taskId': pr['taskId'], 'fid': pr['fid'], 'note': pr['note']})
        ranking.append((0 if d['finishedAt'] else 1, sc if d['finishedAt'] else -len(d['reached']) * 1000 - n_done, t['id']))
    ranking.sort()
    out['ranking'] = [r[2] for r in ranking]
    out['claims'] = game['data']['claims']
    return out
