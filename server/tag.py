"""Mode 3: Tag across Latvia (optional All-Stars powers).

One team is "It". It must physically tag another team; the SERVER verifies both teams' GPS are within the tag
radius. The team that is It accumulates It-time (only during the daily play window); the lowest total wins.
"""
import random

import core
import geo
import game as G
from core import GameError, log

POWERS = {
    'ghost': 'Ghost: your team vanishes from the tracker of others',
    'shield': 'Shield: your team cannot be tagged',
    'radar': 'Radar: see every team live',
}
DEFAULTS = {
    'days': 3, 'itDelayMin': 10, 'runnersSeeIt': 'live', 'tagRadiusM': 75, 'immunityMin': 10, 'useWindow': True,
    'window': {'start': '09:00', 'end': '21:00'}, 'allStars': False, 'ghostMin': 20, 'shieldMin': 15, 'radarMin': 5,
}


def default_settings():
    s = dict(DEFAULTS)
    s['window'] = dict(DEFAULTS['window'])
    return s


def clean_settings(old, patch):
    s = dict(old)
    for k, (lo, hi) in {'days': (1, 14), 'itDelayMin': (0, 60), 'tagRadiusM': (20, 500), 'immunityMin': (0, 120),
                        'ghostMin': (1, 120), 'shieldMin': (1, 120), 'radarMin': (1, 60)}.items():
        if k in patch:
            s[k] = int(core.num(patch[k], lo, hi, k))
    for k in ('useWindow', 'allStars'):
        if k in patch:
            s[k] = bool(patch[k])
    if 'runnersSeeIt' in patch:
        if patch['runnersSeeIt'] not in ('live', 'delayed'):
            raise GameError('Bad visibility option')
        s['runnersSeeIt'] = patch['runnersSeeIt']
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
    game['data'] = {'it': it, 'itMs': {t: 0 for t in tids}, 'last': now, 'totalEff': 0, 'immune': {}, 'tags': [], 'powers': powers}
    log(game, 'tag', '%s starts as IT! Everybody else: run.' % game['teams'][it]['name'])


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


def finish(game, now):
    d = game['data']
    ranking = sorted(d['itMs'].items(), key=lambda kv: kv[1])
    if ranking:
        log(game, 'system', 'Game over! Winner: %s (only %d min as IT)' % (game['teams'][ranking[0][0]]['name'], ranking[0][1] // 60000))


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
    if not m['teamId']:
        raise GameError('You are not on a team')
    if typ == 'tag':
        if m['teamId'] != d['it']:
            raise GameError('Only the IT team can tag')
        open_, _ = core.window_state(now, _win(game))
        if not open_:
            raise GameError('Outside the daily play window')
        target = game['teams'].get(p.get('targetTeamId'))
        if not target or target['id'] == d['it']:
            raise GameError('Pick another team')
        tid = target['id']
        if d['immune'].get(tid, 0) > now:
            raise GameError('%s is immune for %d more minutes' % (target['name'], (d['immune'][tid] - now) // 60000 + 1))
        pw = d['powers'].get(tid, {}).get('shield')
        if pw and pw['until'] > now:
            raise GameError('%s is shielded!' % target['name'])
        me = G.fresh_loc(m, now, 90000)
        if not me:
            raise GameError('No fresh GPS fix for you (need one within the last 90 s)')
        best = None
        for x in G.team_members(game, tid):
            l = G.fresh_loc(x, now, 90000)
            if l:
                dist = geo.haversine(me['lat'], me['lng'], l['lat'], l['lng'])
                best = dist if best is None or dist < best else best
        G.attempt_ok(game, m, 'tag', 10)
        if best is None:
            raise GameError('%s has no fresh GPS position - they must have the app open' % target['name'])
        if best > s['tagRadiusM'] + min(40, me['acc'] / 2):
            raise GameError('Not close enough to %s - get within about %d m' % (target['name'], s['tagRadiusM']))
        accrue(game, now)
        prev = d['it']
        d['it'] = tid
        d['immune'][prev] = now + s['immunityMin'] * 60000
        d['tags'].append({'t': now, 'from': prev, 'to': tid, 'by': m['id']})
        log(game, 'tag', '%s TAGGED %s! %s is now IT.' % (game['teams'][prev]['name'], target['name'], target['name']), m['id'])
    elif typ == 'use_power':
        name = p.get('power')
        pw = d['powers'].get(m['teamId'], {}).get(name)
        if not pw or pw['used']:
            raise GameError('You do not have that power (or already used it)')
        minutes = s[name + 'Min'] if name + 'Min' in s else 15
        pw['used'], pw['until'] = True, now + minutes * 60000
        log(game, 'tag', '%s activated %s' % (game['teams'][m['teamId']]['name'], 'the %s power for %d min' % (name.upper(), minutes) if name != 'ghost' else 'a secret power'), m['id'])
    else:
        raise GameError('Unknown action')
    G.bump(store, game)


def _power_on(d, tid, name, now):
    pw = d['powers'].get(tid, {}).get(name)
    return bool(pw and pw['until'] > now)


def _visible(game, me, now):
    s, d = game['settings'], game['data']
    delay = s['itDelayMin'] * 60000
    out = []
    referee = G.is_referee(game, me)
    for tid in game['teams']:
        entry = {'teamId': tid, 'locs': [], 'hidden': False, 'live': False}
        if referee or me['teamId'] == tid:
            mode = 'live'
        elif me['role'] == 'spectator':
            mode = 'delayed'
        elif _power_on(d, me['teamId'], 'radar', now):
            mode = 'live'
        elif _power_on(d, tid, 'ghost', now):
            mode = 'hidden'
        elif me['teamId'] == d['it']:
            mode = 'delayed'
        elif tid == d['it']:
            mode = 'live' if s['runnersSeeIt'] == 'live' else 'delayed'
        else:
            mode = 'hidden'
        if mode == 'hidden':
            entry['hidden'] = True
        else:
            dl = delay + (300000 if me['role'] == 'spectator' and not referee and me['teamId'] != tid else 0)
            for x in G.team_members(game, tid):
                if mode == 'live' and x.get('loc'):
                    l = x['loc']
                    entry['locs'].append({'id': x['id'], 'name': x['name'], 'lat': l['lat'], 'lng': l['lng'], 't': l['t']})
                elif mode == 'delayed':
                    pts = [q for q in x['trail'] if q[0] <= now - dl]
                    if pts:
                        entry['locs'].append({'id': x['id'], 'name': x['name'], 'lat': pts[-1][1], 'lng': pts[-1][2], 't': pts[-1][0]})
            entry['live'] = mode == 'live'
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
        'it': d['it'], 'itMs': itMs, 'immune': {t: u for t, u in d['immune'].items() if u > now},
        'shielded': [t for t in game['teams'] if _power_on(d, t, 'shield', now)],
        'tags': d['tags'][-30:], 'remainingMs': max(0, s['days'] * _window_len(game) - d['totalEff']),
        'ranking': [t for t, _ in sorted(itMs.items(), key=lambda kv: kv[1])],
        'positions': _visible(game, me, now),
        'powers': {t: {n: {'used': pw['used'], 'until': pw['until']} for n, pw in ps.items()} for t, ps in d['powers'].items()
                   if me['teamId'] == t or G.is_referee(game, me)},
        'powerInfo': POWERS,
    })
    return out
