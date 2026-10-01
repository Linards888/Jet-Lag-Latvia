"""Mode 1: Race across Latvia (territory gates, city check-ins, challenges, daily play window)."""
import random

import core
import geo
import game as G
from core import GameError, log

TERRITORIES = [
    {'id': 'kurzeme', 'name': 'Kurzeme', 'color': '#2a9d8f'},
    {'id': 'zemgale', 'name': 'Zemgale & Sēlija', 'color': '#e9c46a'},
    {'id': 'pieriga', 'name': 'Rīga & Pierīga', 'color': '#e76f51'},
    {'id': 'vidzeme', 'name': 'Vidzeme', 'color': '#457b9d'},
    {'id': 'latgale', 'name': 'Latgale', 'color': '#9b5de5'},
]

CHALLENGES = [
    'Photo of your whole team with the town\'s name sign or coat of arms.',
    'Find the tallest building or tower you can see and photograph it with a team member pointing at it.',
    'Buy the cheapest item in a local shop (max 2 EUR) and photograph the receipt next to it.',
    'Photo of a statue or monument - your whole team must copy its pose.',
    'Find a mural, graffiti or street art and take a team photo in front of it.',
    'Photo of the local church with a team member "holding" its spire (forced perspective).',
    'Ask a local for their favourite spot in town and photograph your team there.',
    'Take a photo of a bus/tram/train timetable showing a departure to a city that starts with "R" or "D".',
    'Eat a local bakery item and photograph the whole team holding what is left of it.',
    'Find a playground and do a team photo on the swing/slide (yes, everyone).',
    'Photo of the most expensive-looking thing for sale in a shop window (price visible).',
    'Find the town\'s river, lake or sea and photograph your feet in the water (or a team member touching it).',
    'Find a plaque or memorial with a date on it and photograph it with today\'s date written on paper.',
    'Photo of a team member shaking hands with a stranger (ask first!) - stranger gets a high five if they prefer.',
    'Find a library or culture house and photograph your team at its entrance.',
    'Photograph a pet or animal (with its owner\'s permission) with all team members visible.',
    'Collect something natural from the town (leaf, stone, pinecone) and photograph it on a map of Latvia.',
    'Photo of your team forming the letters of the town\'s first initial with your bodies.',
    'Find a bench with the best view you can and take a team selfie from it.',
    'Buy a drink you\'ve never tried from a shop and photograph everyone\'s reaction.',
    'Take a photo of the train station or bus station sign of this town.',
    'Find something painted in the colours of the Latvian flag and photograph it with your team.',
    'Photo of a team member balancing on one leg on the town\'s main square.',
    'Find a historic building older than 100 years and photograph the year/plaque.',
]

DEFAULTS = {
    'startCity': 'liepaja', 'finishCity': 'daugavpils', 'requiredPerTerritory': 3, 'ordered': True,
    'checkinRadiusM': 2500, 'useWindow': True, 'window': {'start': '08:00', 'end': '21:00'},
    'territoryBonusMin': 20, 'skipPenaltyMin': 45, 'challenges': True, 'days': 5, 'locDelayMin': 10,
    'disabledCities': [],
}


def default_settings():
    s = dict(DEFAULTS)
    s['window'] = dict(DEFAULTS['window'])
    s['disabledCities'] = []
    s['territories'] = [dict(t) for t in TERRITORIES]
    s['territoryOrder'] = [t['id'] for t in TERRITORIES]
    s['muniTerritory'] = dict(geo.DEFAULT_MUNI_TERRITORY)
    s['cityTerritory'] = {}
    _recompute_city_territory(s)
    return s


def _recompute_city_territory(s):
    s['cityTerritory'] = {c['id']: geo.territory_at(c['lat'], c['lng'], s['muniTerritory']) for c in geo.CITIES}


def clean_settings(old, patch):
    s = dict(old)
    for k, (lo, hi) in {'requiredPerTerritory': (1, 8), 'checkinRadiusM': (300, 10000), 'territoryBonusMin': (0, 240),
                        'skipPenaltyMin': (0, 600), 'days': (1, 14), 'locDelayMin': (0, 120)}.items():
        if k in patch:
            s[k] = int(core.num(patch[k], lo, hi, k))
    for k in ('ordered', 'useWindow', 'challenges'):
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


# ---------------------------------------------------------------- progress helpers
def _tdata(game, tid):
    return game['data']['teams'][tid]


def _approved_counts(game, tid):
    c = {}
    for ci in _tdata(game, tid)['checkins']:
        if ci['status'] in ('approved', 'skipped', 'pending'):
            c[ci['territory']] = c.get(ci['territory'], 0) + 1
    return c


def cleared(game, tid):
    need = game['settings']['requiredPerTerritory']
    c = _approved_counts(game, tid)
    return [t['id'] for t in game['settings']['territories'] if c.get(t['id'], 0) >= need]


def available(game, tid):
    s = game['settings']
    done = set(cleared(game, tid))
    if s['ordered']:
        for t in s['territoryOrder']:
            if t not in done:
                return [t]
        return []
    return [t['id'] for t in s['territories'] if t['id'] not in done]


def _pending_total(game, tid):
    return sum(1 for ci in _tdata(game, tid)['checkins'] if ci['status'] in ('need_proof', 'rejected'))


def _score_ms(game, tid, now):
    d = _tdata(game, tid)
    base = d['finishEffMs'] if d['finishedAt'] else core.eff_elapsed(game['startedAt'], now, _win(game))
    return base + (d['penaltyMin'] - d['bonusMin']) * 60000


def _win(game):
    s = game['settings']
    return s['window'] if s['useWindow'] else None


def _territory_name(game, tid):
    return next((t['name'] for t in game['settings']['territories'] if t['id'] == tid), tid)


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
    per = {}
    for cid, t in s['cityTerritory'].items():
        if cid not in s['disabledCities'] and t:
            per[t] = per.get(t, 0) + 1
    for t in s['territories']:
        if per.get(t['id'], 0) < s['requiredPerTerritory']:
            raise GameError('Territory "%s" has fewer enabled cities than required check-ins' % t['name'])
    game['data'] = {'teams': {tid: {'checkins': [], 'bonusMin': 0, 'penaltyMin': 0, 'finishedAt': None, 'finishEffMs': None, 'adjust': []}
                              for tid in teams}, 'claims': {}, 'usedChallenges': {}}


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
        log(game, 'system', 'All teams finished - race over!')


# ---------------------------------------------------------------- actions
def _my_team(game, m):
    if not m['teamId']:
        raise GameError('You are not on a team')
    return m['teamId']


def _need_running(game):
    if game['status'] != 'running':
        raise GameError('The game is not running' if game['status'] != 'paused' else 'The game is paused')


def _need_window(game, now):
    open_, _ = core.window_state(now, _win(game))
    if not open_:
        raise GameError('Outside the daily play window - rest up! The clock is stopped.')


def _reviewable_by(game, m, team_id):
    if m['role'] == 'spectator':
        return False
    if m['role'] == 'admin':
        return m['teamId'] != team_id
    return m['teamId'] is not None and m['teamId'] != team_id


def action(store, game, m, typ, p, now):
    s = game['settings']
    if typ == 'checkin':
        _need_running(game)
        _need_window(game, now)
        manual = bool(p.get('manual'))
        if manual:
            if not G.is_referee(game, m) or p.get('teamId') not in game['teams']:
                raise GameError('Only a neutral admin can check a team in manually', 403)
            tid = p['teamId']
        else:
            tid = _my_team(game, m)
        d = _tdata(game, tid)
        if d['finishedAt']:
            raise GameError('That team already finished')
        city = geo.CITY_BY_ID.get(p.get('cityId'))
        if not city or city['id'] in s['disabledCities']:
            raise GameError('That city is not a checkpoint')
        terr = s['cityTerritory'].get(city['id'])
        if not terr:
            raise GameError('That city is not in any territory')
        if terr not in available(game, tid):
            where = _territory_name(game, terr)
            nxt = ', '.join(_territory_name(game, t) for t in available(game, tid)) or 'the finish'
            raise GameError('%s is in %s - not open to you right now. Your current target: %s.' % (city['name'], where, nxt))
        if any(ci['cityId'] == city['id'] for ci in d['checkins']):
            raise GameError('Your team already checked in at %s' % city['name'])
        if manual:
            log(game, 'override', 'Admin manually checked %s in at %s' % (G.team_name(game, tid), city['name']), m['id'])
        else:
            loc = G.fresh_loc(m, now, 180000)
            if not loc:
                raise GameError('No fresh GPS fix - enable location sharing and wait a few seconds')
            dist = geo.haversine(loc['lat'], loc['lng'], city['lat'], city['lng'])
            if dist > s['checkinRadiusM']:
                raise GameError('You are %.1f km from %s - get within %.1f km of the centre' % (dist / 1000, city['name'], s['checkinRadiusM'] / 1000))
        used = game['data']['usedChallenges'].setdefault(tid, [])
        pool = [i for i in range(len(CHALLENGES)) if i not in used] or list(range(len(CHALLENGES)))
        ch = random.choice(pool)
        used.append(ch)
        ci = {'cityId': city['id'], 't': now, 'territory': terr, 'challenge': CHALLENGES[ch] if s['challenges'] else None,
              'status': 'need_proof' if s['challenges'] else 'approved', 'fid': None, 'note': '', 'by': m['id'], 'reviewedBy': None}
        d['checkins'].append(ci)
        log(game, 'checkin', '%s checked in at %s (%s)' % (G.team_name(game, tid), city['name'], _territory_name(game, terr)), m['id'], {'cityId': city['id']})
        _after_progress(game, tid, terr, now)
    elif typ == 'proof':
        _need_running(game)
        tid = _my_team(game, m)
        ci = next((c for c in _tdata(game, tid)['checkins'] if c['cityId'] == p.get('cityId')), None)
        if not ci or ci['status'] not in ('need_proof', 'rejected'):
            raise GameError('Nothing to submit for that city')
        f = game['files'].get(p.get('fid'))
        if not f or game['members'].get(f['owner'], {}).get('teamId') != tid:
            raise GameError('Upload a photo first')
        ci['fid'], ci['note'], ci['status'] = p['fid'], str(p.get('note') or '')[:200], 'pending'
        log(game, 'proof', '%s submitted proof for %s - waiting for review' % (G.team_name(game, tid), geo.CITY_BY_ID[ci['cityId']]['name']), m['id'])
        _after_progress(game, tid, ci['territory'], now)
    elif typ == 'skip':
        _need_running(game)
        tid = _my_team(game, m)
        d = _tdata(game, tid)
        ci = next((c for c in d['checkins'] if c['cityId'] == p.get('cityId')), None)
        if not ci or ci['status'] not in ('need_proof', 'rejected'):
            raise GameError('Cannot skip that challenge')
        ci['status'] = 'skipped'
        d['penaltyMin'] += s['skipPenaltyMin']
        log(game, 'penalty', '%s skipped the challenge in %s (+%d min penalty)' % (G.team_name(game, tid), geo.CITY_BY_ID[ci['cityId']]['name'], s['skipPenaltyMin']), m['id'])
        _after_progress(game, tid, ci['territory'], now)
    elif typ == 'review':
        _need_running(game)
        team = game['teams'].get(p.get('teamId'))
        if not team or not _reviewable_by(game, m, team['id']):
            raise GameError('You cannot review that team', 403)
        ci = next((c for c in _tdata(game, team['id'])['checkins'] if c['cityId'] == p.get('cityId')), None)
        verdict = p.get('verdict')
        if not ci or verdict not in ('approve', 'reject'):
            raise GameError('Bad review')
        if ci['status'] != 'pending' and not (m['role'] == 'admin' and ci['status'] == 'approved'):
            raise GameError('Already reviewed')
        ci['status'] = 'approved' if verdict == 'approve' else 'rejected'
        ci['reviewedBy'] = m['id']
        log(game, 'review', '%s %s the proof of %s in %s' % (m['name'], 'approved' if verdict == 'approve' else 'rejected', team['name'], geo.CITY_BY_ID[ci['cityId']]['name']), m['id'])
    elif typ == 'finish':
        _need_running(game)
        _need_window(game, now)
        tid = _my_team(game, m)
        d = _tdata(game, tid)
        if d['finishedAt']:
            raise GameError('Already finished')
        if available(game, tid):
            raise GameError('Clear every territory first')
        if _pending_total(game, tid):
            raise GameError('Finish or skip your open challenges first')
        fc = geo.CITY_BY_ID[s['finishCity']]
        loc = G.fresh_loc(m, now, 180000)
        if not loc or geo.haversine(loc['lat'], loc['lng'], fc['lat'], fc['lng']) > s['checkinRadiusM'] * 1.5:
            raise GameError('You must be at the finish (%s) with GPS on' % fc['name'])
        d['finishedAt'] = now
        d['finishEffMs'] = core.eff_elapsed(game['startedAt'], now, _win(game))
        place = sum(1 for x in game['data']['teams'].values() if x['finishedAt'])
        log(game, 'finish', '%s reached %s! (finisher #%d)' % (G.team_name(game, tid), fc['name'], place), m['id'])
    elif typ == 'adjust':
        if m['role'] != 'admin':
            raise GameError('Admin only', 403)
        team = game['teams'].get(p.get('teamId'))
        reason = str(p.get('reason') or '').strip()[:160]
        if not team or not reason:
            raise GameError('Team and a reason are required (it is logged publicly)')
        if m['teamId'] == team['id']:
            raise GameError('You cannot adjust your own team')
        minutes = int(core.num(p.get('minutes'), -600, 600, 'minutes'))
        d = _tdata(game, team['id'])
        d['penaltyMin'] += minutes
        d['adjust'].append({'t': now, 'min': minutes, 'reason': reason})
        log(game, 'override', 'Admin %s %d min to %s: %s' % ('added' if minutes >= 0 else 'removed', abs(minutes), team['name'], reason), m['id'])
    else:
        raise GameError('Unknown action')
    G.bump(store, game)


def _after_progress(game, tid, terr, now):
    s = game['settings']
    if terr in cleared(game, tid) and terr not in game['data']['claims']:
        game['data']['claims'][terr] = tid
        d = _tdata(game, tid)
        d['bonusMin'] += s['territoryBonusMin']
        log(game, 'claim', '%s is the first to clear %s! (-%d min bonus)' % (G.team_name(game, tid), _territory_name(game, terr), s['territoryBonusMin']), None)


# ---------------------------------------------------------------- views
def _visible_locs(game, me, team, now):
    out = []
    delay = game['settings']['locDelayMin'] * 60000
    live = G.is_referee(game, me) or me['teamId'] == team['id']
    for x in G.team_members(game, team['id']):
        if not x.get('loc'):
            continue
        if live:
            l = x['loc']
            out.append({'id': x['id'], 'name': x['name'], 'lat': l['lat'], 'lng': l['lng'], 't': l['t'], 'live': True})
        else:
            pts = [q for q in x['trail'] if q[0] <= now - delay]
            if pts:
                q = pts[-1]
                out.append({'id': x['id'], 'name': x['name'], 'lat': q[1], 'lng': q[2], 't': q[0], 'live': False})
    return out


def view(game, me, now):
    s = game['settings']
    started = game['status'] in ('running', 'paused', 'finished')
    open_, change = core.window_state(now, _win(game))
    out = {'window': {'open': open_, 'msToChange': change}, 'teams': [], 'reviews': [], 'ranking': []}
    if not started:
        return out
    ranking = []
    for t in game['teams'].values():
        d = _tdata(game, t['id'])
        own = me['teamId'] == t['id'] or G.is_referee(game, me)
        cks = []
        for ci in d['checkins']:
            row = {'cityId': ci['cityId'], 't': ci['t'], 'territory': ci['territory'], 'status': ci['status']}
            if own:
                row.update({'challenge': ci['challenge'], 'note': ci['note'], 'fid': ci['fid']})
            elif ci['status'] in ('pending', 'approved'):
                row['fid'] = ci['fid']
            cks.append(row)
            if ci['status'] == 'pending' and _reviewable_by(game, me, t['id']):
                out['reviews'].append({'teamId': t['id'], 'cityId': ci['cityId'], 'fid': ci['fid'], 'note': ci['note'], 'challenge': ci['challenge']})
        sc = _score_ms(game, t['id'], now)
        cl = cleared(game, t['id'])
        row = {'id': t['id'], 'checkins': cks, 'cleared': cl, 'counts': _approved_counts(game, t['id']), 'available': available(game, t['id']),
               'bonusMin': d['bonusMin'], 'penaltyMin': d['penaltyMin'], 'finishedAt': d['finishedAt'], 'scoreMs': sc,
               'adjust': d['adjust'], 'locs': _visible_locs(game, me, t, now)}
        out['teams'].append(row)
        ranking.append((0 if d['finishedAt'] else 1, sc if d['finishedAt'] else -len(cl) * 1000 - sum(_approved_counts(game, t['id']).values()), t['id']))
    ranking.sort()
    out['ranking'] = [r[2] for r in ranking]
    out['claims'] = game['data']['claims']
    return out
