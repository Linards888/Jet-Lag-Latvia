"""Mode 2: Hide & Seek across Latvia.

Every player hides `hidesPerPlayer` times (one round per hide). Seekers ask questions; the SERVER answers them
from the hider's real GPS position, so the hider cannot lie and seekers never receive the position itself.
Score of a hider = total time survived (plus credit for every answered question), highest total wins.
"""
import random

import core
import geo
import game as G
from core import GameError, log

RADAR_KM = [1, 2, 5, 10, 25, 50, 100, 200]
THERMO_M = [500, 1000, 2000, 5000]
TENTACLE_KM = [10, 25, 50]
PHOTO_PROMPTS = ['The sky straight above you', 'The ground beneath your feet', 'The tallest thing you can see',
                 'The nearest road sign or street name', 'The nearest tree', 'A view in any direction of your choice (no people)',
                 'The nearest public-transport stop']
MATCH_KINDS = {'region': 'the same historic region', 'municipality': 'the same municipality', 'nearest_city': 'the same nearest town',
               'nearest_republic': 'the same nearest of the 9 republican cities'}
MEASURE_TARGETS = {'riga': 'Rīga city centre', 'border': "Latvia's border/coast", 'city': 'the nearest town centre'}
QTYPES = ['radar', 'thermo', 'matching', 'measuring', 'tentacles', 'photo']

DEFAULTS = {
    'hidesPerPlayer': 2, 'hideMinutes': 60, 'maxSeekMinutes': 420, 'zoneRadiusM': 500, 'cooldownMin': 5,
    'foundRadiusM': 30, 'zonePenaltyMin': 15,
    'costs': {'radar': 1, 'thermo': 2, 'matching': 2, 'measuring': 3, 'tentacles': 3, 'photo': 5},
}


def default_settings():
    return {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULTS.items()}


def clean_settings(old, patch):
    s = dict(old)
    for k, (lo, hi) in {'hidesPerPlayer': (1, 4), 'hideMinutes': (5, 240), 'maxSeekMinutes': (20, 1440), 'zoneRadiusM': (100, 3000),
                        'cooldownMin': (0, 60), 'foundRadiusM': (10, 200), 'zonePenaltyMin': (0, 120)}.items():
        if k in patch:
            s[k] = int(core.num(patch[k], lo, hi, k))
    if 'costs' in patch:
        s['costs'] = dict(s['costs'])
        for k in QTYPES:
            if k in patch['costs']:
                s['costs'][k] = int(core.num(patch['costs'][k], 0, 60, 'cost'))
    return s


# ---------------------------------------------------------------- lifecycle
def _rounds(game):
    return game['data']['rounds']


def _cur(game):
    for r in _rounds(game):
        if r['status'] in ('hiding', 'seeking', 'endgame'):
            return r
    return None


def start(game, now):
    players = [m for m in G.participants(game)]
    if len(players) < 2:
        raise GameError('Need at least 2 players')
    order = []
    for _ in range(game['settings']['hidesPerPlayer']):
        ids = [m['id'] for m in players]
        random.shuffle(ids)
        if order and len(ids) > 1 and ids[0] == order[-1]:
            ids.append(ids.pop(0))
        order += ids
    game['data'] = {'rounds': [{'n': i + 1, 'hiderId': h, 'status': 'pending', 'questions': [], 'creditMin': 0, 'penaltyMin': 0,
                                'pausedMs': 0, 'giveUp': [], 'events': [], 'zone': None} for i, h in enumerate(order)]}


def accrue(game, now):
    pass


def resume(game, now, paused_ms):
    r = _cur(game)
    if r:
        r['pausedMs'] += paused_ms
        if r['status'] == 'hiding':
            r['hideEndsAt'] += paused_ms


def finish(game, now):
    r = _cur(game)
    if r:
        _end_round(game, r, now, 'aborted')


def _seek_ms(r, now):
    if r['status'] in ('seeking', 'endgame'):
        return max(0, now - r['seekStartedAt'] - r['pausedMs'])
    return r.get('seekMs', 0)


def _hider(game, r):
    return game['members'].get(r['hiderId'])


def _seekers(game, r):
    return [m for m in G.participants(game) if m['id'] != r['hiderId']]


def _begin_seek(game, r, now):
    h = _hider(game, r)
    if not r['zone']:
        loc = G.fresh_loc(h, now, 600000)
        if not loc:
            return False
        r['zone'] = {'lat': loc['lat'], 'lng': loc['lng']}
        r['events'].append({'t': now, 'text': 'No zone chosen - zone set around the hider\'s position'})
    r['status'], r['seekStartedAt'], r['pausedMs'], r['lastAskAt'] = 'seeking', now, 0, 0
    log(game, 'round', 'Round %d: %s is hiding! The seeking phase begins (hiding zone radius %d m). Max %d min.' % (
        r['n'], h['name'], game['settings']['zoneRadiusM'], game['settings']['maxSeekMinutes']))
    return True


def _end_round(game, r, now, outcome):
    s = game['settings']
    seek = _seek_ms(r, now) if r['status'] in ('seeking', 'endgame') else 0
    if outcome in ('timeout', 'gave_up'):
        seek = s['maxSeekMinutes'] * 60000
    ms = max(0, seek + (r['creditMin'] - r['penaltyMin']) * 60000)
    h = _hider(game, r)
    tr = [p for p in (h['trail'] if h else []) if p[0] >= r.get('startedAt', now)]
    r.update({'status': 'done', 'outcome': outcome, 'hiderMs': ms, 'seekMs': seek, 'doneAt': now, 'reveal': {'zone': r['zone'], 'trail': tr[-400:]}})
    text = {'found': 'found after %s', 'timeout': 'survived the full time (%s)', 'gave_up': 'was not found - seekers gave up (%s)',
            'aborted': 'round aborted (%s)'}[outcome] % _fmt(seek)
    log(game, 'round', 'Round %d over: %s %s. Hider score: %s' % (r['n'], h['name'] if h else '?', text, _fmt(ms)))
    if all(x['status'] == 'done' for x in _rounds(game)):
        game['status'] = 'finished'
        tot = _totals(game)
        best = max(tot.items(), key=lambda kv: kv[1]) if tot else None
        if best:
            log(game, 'system', 'All rounds played! Winner: %s with %s of hiding time' % (game['members'][best[0]]['name'], _fmt(best[1])))


def _fmt(ms):
    m = int(ms / 60000)
    return '%dh %02dm' % (m // 60, m % 60) if m >= 60 else '%d min' % m


def _totals(game):
    tot = {m['id']: 0 for m in G.participants(game)}
    for r in _rounds(game):
        if r['status'] == 'done' and r['hiderId'] in tot:
            tot[r['hiderId']] += r['hiderMs']
    return tot


def tick(game, now):
    r = _cur(game)
    if not r:
        return
    if r['status'] == 'hiding' and now >= r['hideEndsAt']:
        if _begin_seek(game, r, now):
            game['version'] += 1
        elif now - r.get('warned', 0) > 300000:
            r['warned'] = now
            log(game, 'round', 'Waiting for the hider\'s GPS position before seeking can start...')
            game['version'] += 1
    elif r['status'] in ('seeking', 'endgame') and _seek_ms(r, now) >= game['settings']['maxSeekMinutes'] * 60000:
        _end_round(game, r, now, 'timeout')
        game['version'] += 1


def on_loc(game, m, now):
    r = _cur(game)
    if not r or r['status'] not in ('seeking', 'endgame') or m['id'] != r['hiderId'] or not r['zone']:
        return
    s = game['settings']
    d = geo.haversine(m['loc']['lat'], m['loc']['lng'], r['zone']['lat'], r['zone']['lng'])
    if d > s['zoneRadiusM'] + max(30, m['loc']['acc']):
        r['outSince'] = r.get('outSince') or now
        if now - r['outSince'] > 180000 and not r.get('outPenalised'):
            r['outPenalised'] = True
            r['penaltyMin'] += s['zonePenaltyMin']
            r['events'].append({'t': now, 'text': 'Hider left the zone for 3+ minutes: -%d min' % s['zonePenaltyMin']})
            log(game, 'penalty', 'The hider left the hiding zone (penalty applied; details revealed after the round)')
    else:
        r['outSince'], r['outPenalised'] = None, False


# ---------------------------------------------------------------- actions
def _fresh(game, m, now, who, age=180000):
    loc = G.fresh_loc(m, now, age)
    if not loc:
        raise GameError('%s GPS position is not fresh yet - wait a few seconds with location sharing on' % who)
    return loc


def action(store, game, m, typ, p, now):
    s = game['settings']
    if game['status'] != 'running':
        raise GameError('The game is not running')
    if typ == 'start_round':
        if m['role'] != 'admin':
            raise GameError('Only the admin starts rounds', 403)
        if _cur(game):
            raise GameError('A round is already in progress')
        r = next((x for x in _rounds(game) if x['status'] == 'pending'), None)
        if not r:
            raise GameError('No rounds left')
        r.update({'status': 'hiding', 'startedAt': now, 'hideEndsAt': now + s['hideMinutes'] * 60000})
        h = _hider(game, r)
        log(game, 'round', 'Round %d: %s goes hiding! %d minutes to get into position. Seekers: stay put.' % (r['n'], h['name'], s['hideMinutes']))
        G.bump(store, game)
        return
    r = _cur(game)
    if not r:
        raise GameError('No round in progress')
    is_hider = m['id'] == r['hiderId']
    is_seeker = any(x['id'] == m['id'] for x in _seekers(game, r))
    if typ == 'set_zone':
        if not is_hider or r['status'] != 'hiding':
            raise GameError('Only the hider can choose the zone, before seeking starts')
        lat, lng = core.num(p.get('lat'), 50, 60, 'lat'), core.num(p.get('lng'), 15, 35, 'lng')
        if not geo.in_latvia(lat, lng):
            raise GameError('The zone centre must be inside Latvia')
        r['zone'] = {'lat': lat, 'lng': lng}
    elif typ == 'ready':
        if not is_hider or r['status'] != 'hiding':
            raise GameError('Not now')
        if not r['zone']:
            raise GameError('Choose your zone first')
        loc = _fresh(game, m, now, 'Your')
        if geo.haversine(loc['lat'], loc['lng'], r['zone']['lat'], r['zone']['lng']) > s['zoneRadiusM']:
            raise GameError('You are not inside your zone yet')
        _begin_seek(game, r, now)
    elif typ in ('ask', 'thermo_start', 'thermo_end'):
        _ask(game, r, m, is_seeker, typ, p, now)
    elif typ == 'answer_photo':
        if not is_hider:
            raise GameError('Only the hider answers photo questions')
        q = next((x for x in r['questions'] if x['id'] == p.get('qid') and x['status'] == 'waiting_photo'), None)
        f = game['files'].get(p.get('fid'))
        if not q or not f or f['owner'] != m['id']:
            raise GameError('Upload a photo first')
        f['scope'] = [x['id'] for x in _seekers(game, r)] + [m['id']]
        q.update({'status': 'answered', 'answer': {'text': 'Photo: ' + q['params']['prompt'], 'fid': p['fid']}, 'answeredAt': now})
        r['creditMin'] += s['costs']['photo']
    elif typ == 'enter_endgame':
        if not is_seeker or r['status'] != 'seeking':
            raise GameError('Not now')
        loc = _fresh(game, m, now, 'Your')
        G.attempt_ok(game, m, 'endgame', 90)
        if geo.haversine(loc['lat'], loc['lng'], r['zone']['lat'], r['zone']['lng']) > s['zoneRadiusM']:
            raise GameError('You are not inside the hiding zone')
        r['status'] = 'endgame'
        r['endgameAt'] = now
        log(game, 'round', '%s entered the hiding zone! ENDGAME: the hider must stay put; seekers - find them!' % m['name'], m['id'])
    elif typ == 'found':
        if not is_seeker or r['status'] not in ('seeking', 'endgame'):
            raise GameError('Not now')
        loc = _fresh(game, m, now, 'Your')
        hl = _fresh(game, _hider(game, r), now, "The hider's", 240000)
        G.attempt_ok(game, m, 'found', 15)
        if geo.haversine(loc['lat'], loc['lng'], hl['lat'], hl['lng']) > s['foundRadiusM'] + max(10, min(40, loc['acc'] / 2)):
            raise GameError('Not close enough to the hider yet (need to be within about %d m)' % s['foundRadiusM'])
        _end_round(game, r, now, 'found')
    elif typ == 'confirm_found':
        if not is_hider or r['status'] not in ('seeking', 'endgame'):
            raise GameError('Not now')
        _end_round(game, r, now, 'found')
    elif typ == 'give_up':
        if not is_seeker or r['status'] not in ('seeking', 'endgame'):
            raise GameError('Not now')
        if m['id'] not in r['giveUp']:
            r['giveUp'].append(m['id'])
        log(game, 'round', '%s wants to give up (%d/%d seekers)' % (m['name'], len(r['giveUp']), len(_seekers(game, r))), m['id'])
        if len(r['giveUp']) >= len(_seekers(game, r)):
            _end_round(game, r, now, 'gave_up')
    elif typ == 'force_found':
        if not G.is_referee(game, m):
            raise GameError('Only a neutral admin can do that', 403)
        log(game, 'override', 'Admin marked the hider as found', m['id'])
        _end_round(game, r, now, 'found')
    else:
        raise GameError('Unknown action')
    G.bump(store, game)


def _ask(game, r, m, is_seeker, typ, p, now):
    s = game['settings']
    if not is_seeker:
        raise GameError('Only seekers ask questions')
    if r['status'] != 'seeking':
        raise GameError('Questions can only be asked while seeking (not in the endgame)')
    me = _fresh(game, m, now, 'Your')
    hl = _fresh(game, _hider(game, r), now, "The hider's", 300000)
    H = (hl['lat'], hl['lng'])
    if typ == 'thermo_end':
        q = next((x for x in r['questions'] if x['id'] == p.get('qid') and x['status'] == 'thermo_open'), None)
        if not q or q['asker'] != m['id']:
            raise GameError('No open thermometer of yours')
        a = q['params']['start']
        moved = geo.haversine(a['lat'], a['lng'], me['lat'], me['lng'])
        if moved < q['params']['distM'] * 0.9:
            raise GameError('Keep travelling - you moved %d of %d m' % (moved, q['params']['distM']))
        da, db = geo.haversine(a['lat'], a['lng'], *H), geo.haversine(me['lat'], me['lng'], *H)
        q['params']['end'] = {'lat': me['lat'], 'lng': me['lng']}
        q.update({'status': 'answered', 'answeredAt': now, 'answer': {'text': 'HOTTER - the hider is closer to where you are now' if db < da else 'COLDER - the hider is closer to where you started', 'hot': db < da}})
        r['creditMin'] += s['costs']['thermo']
        log(game, 'question', '%s answered a Thermometer: %s' % (m['name'], 'hotter' if db < da else 'colder'), m['id'])
        return
    if any(x['status'] == 'thermo_open' for x in r['questions']):
        raise GameError('Finish your open thermometer first')
    if now - r['lastAskAt'] < s['cooldownMin'] * 60000:
        raise GameError('Cooldown: next question in %d s' % ((s['cooldownMin'] * 60000 - (now - r['lastAskAt'])) // 1000 + 1))
    qt = p.get('qtype') if typ == 'ask' else 'thermo'
    q = {'id': core.new_id(3), 'n': len(r['questions']) + 1, 't': now, 'asker': m['id'], 'type': qt, 'params': {}, 'status': 'answered', 'answer': None}
    here = (me['lat'], me['lng'])
    if qt == 'thermo':
        dm = int(p.get('distM') or 0)
        if dm not in THERMO_M:
            raise GameError('Bad distance')
        q['params'] = {'distM': dm, 'start': {'lat': me['lat'], 'lng': me['lng']}}
        q['status'] = 'thermo_open'
    elif qt == 'radar':
        km = int(p.get('radiusKm') or 0)
        if km not in RADAR_KM:
            raise GameError('Bad radius')
        hit = geo.haversine(*here, *H) <= km * 1000
        q['params'] = {'radiusKm': km, 'center': {'lat': me['lat'], 'lng': me['lng']}}
        q['answer'] = {'text': ('YES - the hider IS within %d km of %s' if hit else 'NO - the hider is NOT within %d km of %s') % (km, m['name']), 'hit': hit}
    elif qt == 'matching':
        kind = p.get('kind')
        if kind not in MATCH_KINDS:
            raise GameError('Bad question')
        f = {'region': lambda pt: geo.DEFAULT_MUNI_TERRITORY.get(geo.muni_at(*pt)), 'municipality': lambda pt: geo.muni_at(*pt),
             'nearest_city': lambda pt: geo.nearest_city(*pt)[0]['id'], 'nearest_republic': lambda pt: geo.nearest_city(*pt, republic_only=True)[0]['id']}[kind]
        same = f(here) == f(H)
        q['params'] = {'kind': kind}
        q['answer'] = {'text': ('YES - you and the hider are in %s' if same else 'NO - you and the hider are NOT in %s') % MATCH_KINDS[kind], 'same': same}
    elif qt == 'measuring':
        tgt = p.get('target')
        if tgt not in MEASURE_TARGETS:
            raise GameError('Bad question')
        fn = {'riga': lambda pt: geo.haversine(*pt, 56.9496, 24.1052), 'border': lambda pt: geo.dist_to_border(*pt),
              'city': lambda pt: geo.nearest_city(*pt)[1]}[tgt]
        closer = fn(H) < fn(here)
        q['params'] = {'target': tgt}
        q['answer'] = {'text': ('YES - the hider is closer to %s than you' if closer else 'NO - the hider is NOT closer to %s than you') % MEASURE_TARGETS[tgt], 'closer': closer}
    elif qt == 'tentacles':
        km, pool = int(p.get('radiusKm') or 0), p.get('pool')
        if km not in TENTACLE_KM or pool not in ('any', 'republic'):
            raise GameError('Bad question')
        q['params'] = {'radiusKm': km, 'pool': pool, 'center': {'lat': me['lat'], 'lng': me['lng']}}
        if geo.haversine(*here, *H) > km * 1000:
            q['answer'] = {'text': 'The hider is OUTSIDE %d km of you - no answer' % km, 'city': None}
        else:
            c = geo.nearest_city(*H, republic_only=(pool == 'republic'))[0]
            q['answer'] = {'text': 'Within %d km of you, the hider is closest to %s' % (km, c['name']), 'city': c['id']}
    elif qt == 'photo':
        if p.get('prompt') not in PHOTO_PROMPTS:
            raise GameError('Bad photo request')
        q['params'] = {'prompt': p['prompt']}
        q['status'] = 'waiting_photo'
    else:
        raise GameError('Unknown question type')
    r['lastAskAt'] = now
    r['questions'].append(q)
    if q['status'] == 'answered':
        r['creditMin'] += s['costs'][qt]
        q['answeredAt'] = now
    log(game, 'question', '%s asked a %s question%s' % (m['name'], qt, '' if q['status'] == 'answered' else ' (waiting)'), m['id'], {'qid': q['id']})


# ---------------------------------------------------------------- view
def _pub_round(r, now):
    keys = ('n', 'hiderId', 'status', 'hiderMs', 'outcome', 'startedAt', 'hideEndsAt', 'seekStartedAt', 'doneAt', 'seekMs', 'creditMin', 'penaltyMin', 'pausedMs', 'endgameAt')
    return {k: r[k] for k in keys if k in r}


def view(game, me, now):
    s = game['settings']
    out = {'rounds': [], 'totals': {}, 'options': {'radarKm': RADAR_KM, 'thermoM': THERMO_M, 'tentacleKm': TENTACLE_KM, 'photo': PHOTO_PROMPTS,
                                                    'match': MATCH_KINDS, 'measure': MEASURE_TARGETS}, 'cur': None}
    if game['status'] == 'lobby':
        return out
    referee = G.is_referee(game, me)
    for r in _rounds(game):
        pr = _pub_round(r, now)
        if r['status'] == 'done':
            pr['reveal'] = r.get('reveal')
            pr['events'] = r['events']
            pr['questions'] = [_q_view(game, q, me, r) for q in r['questions']]
        out['rounds'].append(pr)
    out['totals'] = _totals(game)
    r = _cur(game)
    if not r:
        return out
    hider = _hider(game, r)
    is_hider = me['id'] == r['hiderId']
    seeker = any(x['id'] == me['id'] for x in _seekers(game, r))
    cur = _pub_round(r, now)
    cur['seekMsNow'] = _seek_ms(r, now)
    cur['maxSeekMs'] = s['maxSeekMinutes'] * 60000
    cur['questions'] = [_q_view(game, q, me, r) for q in r['questions']]
    cur['cooldownLeftMs'] = max(0, s['cooldownMin'] * 60000 - (now - r.get('lastAskAt', 0))) if r['status'] == 'seeking' else 0
    cur['giveUp'] = len(r['giveUp'])
    cur['role'] = 'hider' if is_hider else ('seeker' if seeker else ('referee' if referee else 'spectator'))
    if is_hider or referee:
        cur['zone'] = r['zone']
        cur['hiderLoc'] = hider['loc'] if hider else None
        cur['events'] = r['events']
    elif seeker and r['status'] == 'endgame':
        cur['zone'] = r['zone']
    if seeker or referee:
        cur['seekerLocs'] = [{'id': x['id'], 'name': x['name'], 'lat': x['loc']['lat'], 'lng': x['loc']['lng'], 't': x['loc']['t']}
                             for x in _seekers(game, r) if x.get('loc') and (seeker or referee)]
    out['cur'] = cur
    return out


def _q_view(game, q, me, r):
    o = {k: q[k] for k in ('id', 'n', 't', 'asker', 'type', 'status', 'answer', 'answeredAt') if k in q}
    o['params'] = q['params']
    if q['status'] == 'thermo_open' and q['asker'] != me['id']:
        o['params'] = {'distM': q['params']['distM']}
    if q['status'] == 'thermo_open' and q['asker'] == me['id']:
        o['params'] = q['params']
    return o
