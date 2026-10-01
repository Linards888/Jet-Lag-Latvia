"""Mode 3: Tag across Latvia - with destinations, money, tasks and a shop.

* One team is IT and tags the others IN REAL LIFE (button press, no GPS check). Score = time spent as IT, least wins.
* Runners (and IT) can claim **destinations** (cities) by tapping them on the map: reward = money.
* Teams share N random **tasks**; completing one pays money (difficulty x payout). Photo proof is optional.
* Money buys things in the **shop**: Shield, Ghost, Radar, Peek (see IT), Freeze IT, Time cut.
* All-Stars edition: each team also gets 2 free random one-use powers (Ghost, Shield, Radar).
* IT sees runners live; runners do not see IT unless the admin turned it on (or they bought Peek).
"""
import random

import cards
import core
import geo
import game as G
from core import GameError, log, notice

POWERS = ('ghost', 'shield', 'radar')
SHOP = ('shield', 'ghost', 'radar', 'peek', 'freeze_it', 'time_cut')
DEFAULTS = {
    'days': 3, 'cooldownMin': 5, 'runnersSeeIt': False, 'useWindow': True, 'window': {'start': '09:00', 'end': '21:00'}, 'allStars': False,
    'ghostMin': 20, 'shieldMin': 15, 'radarMin': 5, 'peekMin': 5, 'freezeItMin': 10, 'timeCutMin': 10,
    'economy': True, 'destCount': 3, 'destReward': 60, 'destMinPop': 5, 'taskSlots': 5, 'taskPayout': 15, 'requireProof': False,
    'prices': {'shield': 40, 'ghost': 40, 'radar': 60, 'peek': 30, 'freeze_it': 70, 'time_cut': 60},
}


def default_settings():
    s = dict(DEFAULTS)
    s['window'] = dict(DEFAULTS['window'])
    s['prices'] = dict(DEFAULTS['prices'])
    s['tasks'] = cards.default_tasks()
    return s


def clean_settings(old, patch):
    s = dict(old)
    for k, (lo, hi) in {'days': (1, 14), 'cooldownMin': (0, 120), 'ghostMin': (1, 120), 'shieldMin': (1, 120), 'radarMin': (1, 60), 'peekMin': (1, 60),
                        'freezeItMin': (1, 60), 'timeCutMin': (1, 120), 'destCount': (1, 8), 'destReward': (0, 1000), 'destMinPop': (1, 600),
                        'taskSlots': (1, 12), 'taskPayout': (0, 200)}.items():
        if k in patch:
            s[k] = int(core.num(patch[k], lo, hi, k))
    for k in ('useWindow', 'allStars', 'runnersSeeIt', 'economy', 'requireProof'):
        if k in patch:
            s[k] = bool(patch[k])
    if 'prices' in patch:
        s['prices'] = dict(s['prices'])
        for k in SHOP:
            if k in patch['prices']:
                s['prices'][k] = int(core.num(patch['prices'][k], 0, 1000, 'price'))
    if 'window' in patch:
        w = patch['window']
        try:
            a, b = core.hhmm_to_min(w['start']), core.hhmm_to_min(w['end'])
        except Exception:
            raise GameError('Bad time window')
        if not (0 <= a < b <= 24 * 60):
            raise GameError('Window start must be before end')
        s['window'] = {'start': w['start'], 'end': w['end']}
    return s


def _win(game):
    s = game['settings']
    return s['window'] if s['useWindow'] else None


def _window_len(game):
    w = _win(game)
    return (core.hhmm_to_min(w['end']) - core.hhmm_to_min(w['start'])) * 60000 if w else core.DAY


def _td(game, tid):
    return game['data']['teams'][tid]


def _on(game, tid, name, now):
    return _td(game, tid)['eff'].get(name, 0) > now


def _new_destinations(game, n, exclude=()):
    s = game['settings']
    pool = [c['id'] for c in geo.CITIES if c['pop'] >= s['destMinPop'] and c['id'] not in exclude]
    random.shuffle(pool)
    return [{'id': core.new_id(3), 'cityId': cid} for cid in pool[:n]]


def _draw_tasks(game, n, exclude=()):
    pool = [t['id'] for t in game['settings']['tasks'] if t['id'] not in exclude]
    random.shuffle(pool)
    return pool[:n]


def start(game, now):
    if len(game['teams']) < 2:
        raise GameError('Need at least 2 teams')
    for tid in game['teams']:
        if not G.team_members(game, tid):
            raise GameError('Every team needs a player')
    if any(m['teamId'] is None for m in G.participants(game)):
        raise GameError('Everyone who plays must be on a team')
    s = game['settings']
    tids = list(game['teams'])
    it = random.choice(tids)
    powers = {}
    if s['allStars']:
        for tid in tids:
            powers[tid] = {p: {'used': False} for p in random.sample(list(POWERS), 2)}
    eco = s['economy']
    game['data'] = {
        'it': it, 'itMs': {t: 0 for t in tids}, 'last': now, 'totalEff': 0, 'itLockUntil': 0, 'tags': [], 'powers': powers,
        'teams': {t: {'money': 0, 'done': {}, 'proofs': [], 'eff': {'shield': 0, 'ghost': 0, 'radar': 0, 'peek': 0}} for t in tids},
        'dest': _new_destinations(game, s['destCount']) if eco else [], 'active': _draw_tasks(game, s['taskSlots']) if eco and s['tasks'] else [],
    }
    log(game, 'tag', '%s starts as IT' % game['teams'][it]['name'])
    notice(game, 'tag_start', 'tag', None, team=game['teams'][it]['name'])


def accrue(game, now):
    d = game['data']
    if not d or game['status'] != 'running':
        return
    eff = core.eff_elapsed(d['last'], now, _win(game))
    d['itMs'][d['it']] += eff
    d['totalEff'] += eff
    d['last'] = now


def resume(game, now, paused_ms):
    d = game['data']
    d['last'] = now
    if d['itLockUntil']:
        d['itLockUntil'] += paused_ms
    for t in d['teams'].values():
        for k, v in t['eff'].items():
            if v:
                t['eff'][k] = v + paused_ms


def finish(game, now):
    d = game['data']
    ranking = sorted(d['itMs'].items(), key=lambda kv: kv[1])
    if ranking:
        name = game['teams'][ranking[0][0]]['name']
        log(game, 'system', 'Game over. Winner: %s (%d min as IT)' % (name, ranking[0][1] // 60000))
        notice(game, 'game_over', 'tag', None, winner=name)


def tick(game, now):
    accrue(game, now)
    if game['data']['totalEff'] >= game['settings']['days'] * _window_len(game):
        finish(game, now)
        game['status'] = 'finished'
        game['version'] += 1


# ---------------------------------------------------------------- actions
def _can_review(game, m, team_id):
    if G.plays(game, m):
        return m['teamId'] is not None and m['teamId'] != team_id
    return G.admin_active(game, m)


def _set_effect(game, tid, name, now):
    s = game['settings']
    minutes = s[name + 'Min']
    t = _td(game, tid)
    t['eff'][name] = max(now, t['eff'][name]) + minutes * 60000
    return minutes


def action(store, game, m, typ, p, now):
    s, d = game['settings'], game['data']
    if game['status'] != 'running':
        raise GameError('The game is not running')
    if not m['teamId'] or not G.plays(game, m):
        if typ == 'review':
            pass
        else:
            raise GameError('You are not on a team')
    tid = m['teamId']
    name = game['teams'][tid]['name'] if tid in game['teams'] else ''
    if typ == 'tag':
        if tid != d['it']:
            raise GameError('Only the IT team can tag')
        open_, _ = core.window_state(now, _win(game))
        if not open_:
            raise GameError('Outside the daily play window')
        if d['itLockUntil'] > now:
            raise GameError('Tagger cooldown: wait %d more minutes' % ((d['itLockUntil'] - now) // 60000 + 1))
        target = game['teams'].get(p.get('targetTeamId'))
        if not target or target['id'] == d['it']:
            raise GameError('Pick another team')
        if _on(game, target['id'], 'shield', now):
            raise GameError('%s is shielded' % target['name'])
        accrue(game, now)
        prev = d['it']
        d['it'] = target['id']
        d['itLockUntil'] = now + s['cooldownMin'] * 60000 if s['cooldownMin'] else 0
        d['tags'].append({'t': now, 'from': prev, 'to': target['id'], 'by': m['id']})
        log(game, 'tag', '%s tagged %s' % (game['teams'][prev]['name'], target['name']), m['id'])
        notice(game, 'tagged', 'tag', None, src=game['teams'][prev]['name'], dst=target['name'])
    elif typ == 'use_power':
        power = p.get('power')
        pw = d['powers'].get(tid, {}).get(power)
        if not pw or pw['used']:
            raise GameError('You do not have that power (or already used it)')
        pw['used'] = True
        minutes = _set_effect(game, tid, power, now)
        log(game, 'tag', '%s activated %s' % (name, power), m['id'])
        if power != 'ghost':
            notice(game, 'power_' + power, 'tag', None, team=name, min=minutes)
    elif typ == 'buy':
        if not s['economy']:
            raise GameError('The shop is closed')
        item = p.get('item')
        if item not in SHOP:
            raise GameError('Unknown item')
        t = _td(game, tid)
        price = s['prices'][item]
        if t['money'] < price:
            raise GameError('Not enough money (%d needed)' % price)
        if item == 'freeze_it' and tid == d['it']:
            raise GameError('IT cannot freeze itself')
        if item == 'time_cut':
            accrue(game, now)
            if d['itMs'][tid] <= 0:
                raise GameError('You have no IT time to cut yet')
        t['money'] -= price
        minutes = 0
        if item in ('shield', 'ghost', 'radar', 'peek'):
            minutes = _set_effect(game, tid, item, now)
        elif item == 'freeze_it':
            minutes = s['freezeItMin']
            d['itLockUntil'] = max(now, d['itLockUntil']) + minutes * 60000
        elif item == 'time_cut':
            minutes = s['timeCutMin']
            d['itMs'][tid] = max(0, d['itMs'][tid] - minutes * 60000)
        log(game, 'shop', '%s bought %s for %d' % (name, item, price), m['id'])
        if item != 'ghost':
            notice(game, 'shop_' + item, 'tag', None, team=name, min=minutes)
    elif typ == 'claim_destination':
        if not s['economy']:
            raise GameError('Destinations are switched off')
        open_, _ = core.window_state(now, _win(game))
        if not open_:
            raise GameError('Outside the daily play window')
        dest = next((x for x in d['dest'] if x['id'] == p.get('destId')), None)
        if not dest:
            raise GameError('That destination is gone')
        city = geo.CITY_BY_ID[dest['cityId']]['name']
        _td(game, tid)['money'] += s['destReward']
        d['dest'].remove(dest)
        new = _new_destinations(game, 1, exclude={x['cityId'] for x in d['dest']} | {dest['cityId']})
        d['dest'].extend(new)
        log(game, 'dest', '%s reached %s (+%d)' % (name, city, s['destReward']), m['id'])
        notice(game, 'dest_claim', 'claim', None, team=name, city=city, reward=s['destReward'])
    elif typ == 'complete_task':
        if not s['economy']:
            raise GameError('Tasks are switched off')
        t = _td(game, tid)
        task = next((x for x in s['tasks'] if x['id'] == p.get('taskId')), None)
        if not task or task['id'] not in d['active']:
            raise GameError('That task is not active')
        if t['done'].get(task['id']) in ('approved', 'pending'):
            raise GameError('Your team already did that task')
        if s['requireProof']:
            f = game['files'].get(p.get('fid'))
            if not f or game['members'].get(f['owner'], {}).get('teamId') != tid:
                raise GameError('Upload a photo first')
            t['proofs'] = [x for x in t['proofs'] if x['taskId'] != task['id']]
            t['proofs'].append({'taskId': task['id'], 'fid': p['fid'], 'note': str(p.get('note') or '')[:240], 't': now})
            t['done'][task['id']] = 'pending'
            notice(game, 'proof_submitted', 'review', None, team=name)
        else:
            t['done'][task['id']] = 'approved'
            t['money'] += task['difficulty'] * s['taskPayout']
            log(game, 'task', '%s completed "%s"' % (name, task['title']), m['id'])
            _refresh_tasks(game)
    elif typ == 'review':
        team = game['teams'].get(p.get('teamId'))
        if not team or not _can_review(game, m, team['id']):
            raise GameError('You cannot review that team', 403)
        t = _td(game, team['id'])
        pr = next((x for x in t['proofs'] if x['taskId'] == p.get('taskId')), None)
        verdict = p.get('verdict')
        if not pr or verdict not in ('approve', 'reject') or t['done'].get(pr['taskId']) != 'pending':
            raise GameError('Bad review')
        task = next((x for x in s['tasks'] if x['id'] == pr['taskId']), {'difficulty': 1, 'title': 'task'})
        t['done'][pr['taskId']] = 'approved' if verdict == 'approve' else 'rejected'
        if verdict == 'approve':
            t['money'] += task['difficulty'] * s['taskPayout']
            _refresh_tasks(game)
        else:
            notice(game, 'proof_rejected', 'review', G.team_ids(game, team['id']))
        log(game, 'review', '%s %s the proof of %s' % (m['name'], verdict + 'd', team['name']), m['id'])
    else:
        raise GameError('Unknown action')
    G.bump(store, game)


def _refresh_tasks(game):
    d = game['data']
    for i, task_id in enumerate(list(d['active'])):
        if all(t['done'].get(task_id) in ('approved', 'pending') for t in d['teams'].values()):
            new = _draw_tasks(game, 1, exclude=set(d['active']))
            if new:
                d['active'][i] = new[0]


# ---------------------------------------------------------------- views
def _visible(game, me, now):
    s, d = game['settings'], game['data']
    out = []
    referee = G.is_referee(game, me)
    mine = me['teamId'] if G.plays(game, me) else None
    for tid in game['teams']:
        entry = {'teamId': tid, 'locs': [], 'hidden': False}
        if referee or mine == tid or (mine and _on(game, mine, 'radar', now)):
            show = True
        elif not mine:
            show = False
        elif _on(game, tid, 'ghost', now):
            show = False
        elif mine == d['it']:
            show = True
        elif tid == d['it']:
            show = bool(s['runnersSeeIt']) or _on(game, mine, 'peek', now)
        else:
            show = False
        if show:
            for x in G.team_members(game, tid):
                if x.get('loc'):
                    l = x['loc']
                    entry['locs'].append({'id': x['id'], 'name': x['name'], 'lat': l['lat'], 'lng': l['lng'], 't': l['t']})
        else:
            entry['hidden'] = True
        out.append(entry)
    return out


def view(game, me, now):
    s = game['settings']
    open_, change = core.window_state(now, _win(game))
    out = {'window': {'open': open_, 'msToChange': change}}
    d = game['data']
    if not d:
        return out
    itMs = dict(d['itMs'])
    if game['status'] == 'running':
        itMs[d['it']] += core.eff_elapsed(d['last'], now, _win(game))
    referee = G.is_referee(game, me)
    mine = me['teamId'] if me['teamId'] in d['teams'] else None
    out.update({
        'it': d['it'], 'itMs': itMs, 'itLockLeftMs': max(0, d['itLockUntil'] - now),
        'shielded': [t for t in game['teams'] if _on(game, t, 'shield', now)],
        'tags': d['tags'][-30:], 'remainingMs': max(0, s['days'] * _window_len(game) - d['totalEff']),
        'ranking': [t for t, _ in sorted(itMs.items(), key=lambda kv: kv[1])],
        'positions': _visible(game, me, now),
        'powers': {t: {n: {'used': pw['used']} for n, pw in ps.items()} for t, ps in d['powers'].items() if mine == t or referee},
        'dest': d['dest'], 'active': d['active'], 'reviews': [], 'prices': s['prices'],
    })
    if mine or referee:
        out['teams'] = {t: {'money': v['money'], 'done': v['done'], 'eff': v['eff']} for t, v in d['teams'].items() if mine == t or referee}
    for tid, v in d['teams'].items():
        for pr in v['proofs']:
            if v['done'].get(pr['taskId']) == 'pending' and _can_review(game, me, tid):
                out['reviews'].append({'teamId': tid, 'taskId': pr['taskId'], 'fid': pr['fid'], 'note': pr['note']})
    return out
