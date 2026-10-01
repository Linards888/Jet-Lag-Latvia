"""Mode 3: Tag across Latvia (optional All-Stars powers).

Tagging happens in real life: the IT team presses "Tag" when it has physically caught another team.
The team that is IT accumulates IT-time (only during the daily play window); the lowest total wins.
IT sees the runners live; runners see IT only if the admin enabled it (default: no).
"""
import random

import core
import game as G
from core import GameError, log, notice

POWERS = {
    'ghost': 'Ghost: your team vanishes from the tracker of others',
    'shield': 'Shield: your team cannot be tagged',
    'radar': 'Radar: see every team live',
}
DEFAULTS = {
    'days': 3, 'cooldownMin': 5, 'runnersSeeIt': False, 'useWindow': True,
    'window': {'start': '09:00', 'end': '21:00'}, 'allStars': False, 'ghostMin': 20, 'shieldMin': 15, 'radarMin': 5,
}


def default_settings():
    s = dict(DEFAULTS)
    s['window'] = dict(DEFAULTS['window'])
    return s


def clean_settings(old, patch):
    s = dict(old)
    for k, (lo, hi) in {'days': (1, 14), 'cooldownMin': (0, 120), 'ghostMin': (1, 120), 'shieldMin': (1, 120), 'radarMin': (1, 60)}.items():
        if k in patch:
            s[k] = int(core.num(patch[k], lo, hi, k))
    for k in ('useWindow', 'allStars', 'runnersSeeIt'):
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
    return s


def _win(game):
    s = game['settings']
    return s['window'] if s['useWindow'] else None


def _window_len(game):
    w = _win(game)
    return (core.hhmm_to_min(w['end']) - core.hhmm_to_min(w['start'])) * 60000 if w else core.DAY


def start(game, now):
    if len(game['teams']) < 2:
        raise GameError('Need at least 2 teams')
    for tid in game['teams']:
        if not G.team_members(game, tid):
            raise GameError('Every team needs a player')
    if any(m['teamId'] is None for m in G.participants(game)):
        raise GameError('Everyone who plays must be on a team')
    tids = list(game['teams'])
    it = random.choice(tids)
    powers = {}
    if game['settings']['allStars']:
        for tid in tids:
            powers[tid] = {p: {'used': False, 'until': 0} for p in random.sample(list(POWERS), 2)}
    game['data'] = {'it': it, 'itMs': {t: 0 for t in tids}, 'last': now, 'totalEff': 0, 'itLockUntil': 0, 'tags': [], 'powers': powers}
    log(game, 'tag', '%s starts as IT' % game['teams'][it]['name'])
    notice(game, '%s starts as IT. Everybody else: run!' % game['teams'][it]['name'], 'tag')


def accrue(game, now):
    d = game['data']
    if not d or game['status'] != 'running':
        return
    eff = core.eff_elapsed(d['last'], now, _win(game))
    d['itMs'][d['it']] += eff
    d['totalEff'] += eff
    d['last'] = now


def resume(game, now, paused_ms):
    game['data']['last'] = now
    if game['data']['itLockUntil']:
        game['data']['itLockUntil'] += paused_ms


def finish(game, now):
    d = game['data']
    ranking = sorted(d['itMs'].items(), key=lambda kv: kv[1])
    if ranking:
        log(game, 'system', 'Game over. Winner: %s (%d min as IT)' % (game['teams'][ranking[0][0]]['name'], ranking[0][1] // 60000))
        notice(game, 'Game over. Winner: %s' % game['teams'][ranking[0][0]]['name'], 'tag')


def tick(game, now):
    accrue(game, now)
    if game['data']['totalEff'] >= game['settings']['days'] * _window_len(game):
        finish(game, now)
        game['status'] = 'finished'
        game['version'] += 1


def action(store, game, m, typ, p, now):
    s, d = game['settings'], game['data']
    if game['status'] != 'running':
        raise GameError('The game is not running')
    if not m['teamId'] or not G.plays(game, m):
        raise GameError('You are not on a team')
    if typ == 'tag':
        if m['teamId'] != d['it']:
            raise GameError('Only the IT team can tag')
        open_, _ = core.window_state(now, _win(game))
        if not open_:
            raise GameError('Outside the daily play window')
        if d['itLockUntil'] > now:
            raise GameError('Tagger cooldown: wait %d more minutes' % ((d['itLockUntil'] - now) // 60000 + 1))
        target = game['teams'].get(p.get('targetTeamId'))
        if not target or target['id'] == d['it']:
            raise GameError('Pick another team')
        tid = target['id']
        pw = d['powers'].get(tid, {}).get('shield')
        if pw and pw['until'] > now:
            raise GameError('%s is shielded' % target['name'])
        accrue(game, now)
        prev = d['it']
        d['it'] = tid
        d['itLockUntil'] = now + s['cooldownMin'] * 60000 if s['cooldownMin'] else 0
        d['tags'].append({'t': now, 'from': prev, 'to': tid, 'by': m['id']})
        log(game, 'tag', '%s tagged %s' % (game['teams'][prev]['name'], target['name']), m['id'])
        notice(game, '%s tagged %s. %s is now IT.' % (game['teams'][prev]['name'], target['name'], target['name']), 'tag')
    elif typ == 'use_power':
        name = p.get('power')
        pw = d['powers'].get(m['teamId'], {}).get(name)
        if not pw or pw['used']:
            raise GameError('You do not have that power (or already used it)')
        minutes = s[name + 'Min']
        pw['used'], pw['until'] = True, now + minutes * 60000
        team = game['teams'][m['teamId']]['name']
        log(game, 'tag', '%s activated %s' % (team, name), m['id'])
        if name != 'ghost':
            notice(game, '%s activated %s for %d min' % (team, name.capitalize(), minutes), 'tag')
    else:
        raise GameError('Unknown action')
    G.bump(store, game)


def _power_on(d, tid, name, now):
    pw = d['powers'].get(tid, {}).get(name)
    return bool(pw and pw['until'] > now)


def _visible(game, me, now):
    s, d = game['settings'], game['data']
    out = []
    referee = G.is_referee(game, me)
    mine = me['teamId'] if G.plays(game, me) else None
    for tid in game['teams']:
        entry = {'teamId': tid, 'locs': [], 'hidden': False}
        if referee or mine == tid or (mine and _power_on(d, mine, 'radar', now)):
            show = True
        elif not mine:
            show = False
        elif _power_on(d, tid, 'ghost', now):
            show = False
        elif mine == d['it']:
            show = True
        elif tid == d['it']:
            show = bool(s['runnersSeeIt'])
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
    out.update({
        'it': d['it'], 'itMs': itMs, 'itLockLeftMs': max(0, d['itLockUntil'] - now),
        'shielded': [t for t in game['teams'] if _power_on(d, t, 'shield', now)],
        'tags': d['tags'][-30:], 'remainingMs': max(0, s['days'] * _window_len(game) - d['totalEff']),
        'ranking': [t for t, _ in sorted(itMs.items(), key=lambda kv: kv[1])],
        'positions': _visible(game, me, now),
        'powers': {t: {n: {'used': pw['used'], 'until': pw['until']} for n, pw in ps.items()} for t, ps in d['powers'].items()
                   if me['teamId'] == t or G.is_referee(game, me)},
        'powerInfo': POWERS,
    })
    return out
