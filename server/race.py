"""Mode 1: Race across Latvia.

Territory gates + GPS check-ins. Every check-in needs one task (picked from the task list, easy to hard);
an approved task gives the team 1-6 card picks (= task difficulty). Cards are team property: any teammate can
use them (time bonuses, curses on other teams, freeze, shield ...). Admins can edit the task and card lists.
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
    'startCity': 'liepaja', 'finishCity': 'daugavpils', 'requiredPerTerritory': 3, 'ordered': True,
    'checkinRadiusM': 2500, 'useWindow': True, 'window': {'start': '08:00', 'end': '21:00'},
    'territoryBonusMin': 20, 'skipPenaltyMin': 45, 'tasksEnabled': True, 'days': 5, 'locDelayMin': 10,
    'disabledCities': [],
}
OPEN = ('choose', 'need_proof', 'rejected')      # attempt states that still need work from the team
COUNTS = ('pending', 'approved', 'skipped')      # check-in states that count towards clearing a territory


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
    for k, (lo, hi) in {'requiredPerTerritory': (1, 8), 'checkinRadiusM': (300, 10000), 'territoryBonusMin': (0, 240),
                        'skipPenaltyMin': (0, 600), 'days': (1, 14), 'locDelayMin': (0, 120)}.items():
        if k in patch:
            s[k] = int(core.num(patch[k], lo, hi, k))
    for k in ('ordered', 'useWindow', 'tasksEnabled'):
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


def _counts(game, tid):
    c = {}
    for a in _td(game, tid)['attempts']:
        if a['kind'] == 'checkin' and a['status'] in COUNTS:
            c[a['territory']] = c.get(a['territory'], 0) + 1
    return c


def cleared(game, tid):
    need = game['settings']['requiredPerTerritory']
    c = _counts(game, tid)
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


def _task(game, task_id):
    return next((t for t in game['settings']['tasks'] if t['id'] == task_id), None)


def _tasks_on(game):
    s = game['settings']
    return s['tasksEnabled'] and bool(s['tasks'])


def _task_used(d, task_id):
    return any(a['taskId'] == task_id and a['status'] in ('need_proof', 'pending', 'approved') for a in d['attempts'])


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


def _find(d, aid):
    a = next((x for x in d['attempts'] if x['aid'] == aid), None)
    if not a:
        raise GameError('Unknown task entry')
    return a


def _grant_picks(game, tid, n, why):
    cat = game['settings']['cards']
    if not cat or n <= 0:
        return
    d = _td(game, tid)
    for _ in range(min(n, 6)):
        d['picks'].append({'pid': core.new_id(3), 'options': cards.draw(cat, 3)})
    notice(game, '%s: %d card pick%s waiting' % (why, n, '' if n == 1 else 's'), 'cards', G.team_ids(game, tid))


def _after_progress(game, tid, terr, now):
    s = game['settings']
    if terr in cleared(game, tid) and terr not in game['data']['claims']:
        game['data']['claims'][terr] = tid
        _td(game, tid)['bonusMin'] += s['territoryBonusMin']
        log(game, 'claim', '%s is the first to clear %s (-%d min bonus)' % (G.team_name(game, tid), _terr_name(game, terr), s['territoryBonusMin']))
        notice(game, '%s cleared %s first and earned a time bonus' % (G.team_name(game, tid), _terr_name(game, terr)), 'claim')


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
    game['data'] = {'teams': {tid: {'attempts': [], 'cards': [], 'picks': [], 'bonusMin': 0, 'penaltyMin': 0, 'finishedAt': None,
                                    'finishEffMs': None, 'adjust': [], 'frozenUntil': 0, 'spyUntil': 0} for tid in teams}, 'claims': {}}


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
        notice(game, 'All teams finished. The race is over.', 'info')


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
        if terr not in available(game, tid):
            nxt = ', '.join(_terr_name(game, t) for t in available(game, tid)) or 'the finish'
            raise GameError('%s is in %s - not open to you right now. Your current target: %s.' % (city['name'], _terr_name(game, terr), nxt))
        if any(a['kind'] == 'checkin' and a['cityId'] == city['id'] for a in d['attempts']):
            raise GameError('Your team already checked in at %s' % city['name'])
        if any(a['kind'] == 'checkin' and a['status'] in OPEN for a in d['attempts']):
            raise GameError('Finish your open task first')
        if manual:
            log(game, 'override', 'Admin manually checked %s in at %s' % (G.team_name(game, tid), city['name']), m['id'])
        else:
            loc = G.fresh_loc(m, now, 180000)
            if not loc:
                raise GameError('No fresh GPS fix - enable location sharing and wait a few seconds')
            dist = geo.haversine(loc['lat'], loc['lng'], city['lat'], city['lng'])
            if dist > s['checkinRadiusM']:
                raise GameError('You are %.1f km from %s - get within %.1f km of the centre' % (dist / 1000, city['name'], s['checkinRadiusM'] / 1000))
        att = {'aid': core.new_id(3), 'kind': 'checkin', 'cityId': city['id'], 'territory': terr, 'taskId': None,
               'status': 'choose' if _tasks_on(game) else 'approved', 'fid': None, 'note': '', 't': now, 'by': m['id'], 'reviewedBy': None}
        d['attempts'].append(att)
        log(game, 'checkin', '%s checked in at %s (%s)' % (G.team_name(game, tid), city['name'], _terr_name(game, terr)), m['id'])
        notice(game, '%s checked in at %s' % (G.team_name(game, tid), city['name']), 'checkin')
        _after_progress(game, tid, terr, now)
    elif typ == 'choose_task':
        _need_running(game)
        tid = _my_team(game, m)
        d = _td(game, tid)
        a = _find(d, p.get('aid'))
        task = _task(game, p.get('taskId'))
        if a['status'] != 'choose' or not task:
            raise GameError('Cannot choose that task now')
        if _task_used(d, task['id']):
            raise GameError('Your team already did that task')
        a['taskId'], a['status'] = task['id'], 'need_proof'
    elif typ == 'start_extra':
        _need_running(game)
        tid = _my_team(game, m)
        d = _td(game, tid)
        task = _task(game, p.get('taskId'))
        if not _tasks_on(game) or not task:
            raise GameError('Tasks are not available')
        if _task_used(d, task['id']):
            raise GameError('Your team already did that task')
        if sum(1 for a in d['attempts'] if a['kind'] == 'extra' and a['status'] in OPEN) >= 2:
            raise GameError('Finish your open bonus tasks first (max 2 at a time)')
        d['attempts'].append({'aid': core.new_id(3), 'kind': 'extra', 'cityId': None, 'territory': None, 'taskId': task['id'], 'status': 'need_proof',
                              'fid': None, 'note': '', 't': now, 'by': m['id'], 'reviewedBy': None})
    elif typ == 'proof':
        _need_running(game)
        tid = _my_team(game, m)
        d = _td(game, tid)
        a = _find(d, p.get('aid'))
        if a['status'] not in ('need_proof', 'rejected'):
            raise GameError('Nothing to submit for that task')
        f = game['files'].get(p.get('fid'))
        if not f or game['members'].get(f['owner'], {}).get('teamId') != tid:
            raise GameError('Upload a photo first')
        a['fid'], a['note'], a['status'] = p['fid'], str(p.get('note') or '')[:240], 'pending'
        task = _task(game, a['taskId']) or {'title': 'task'}
        log(game, 'proof', '%s submitted proof for "%s"' % (G.team_name(game, tid), task['title']), m['id'])
        notice(game, '%s submitted proof - review needed' % G.team_name(game, tid), 'review')
        if a['kind'] == 'checkin':
            _after_progress(game, tid, a['territory'], now)
    elif typ == 'skip':
        _need_running(game)
        tid = _my_team(game, m)
        d = _td(game, tid)
        a = _find(d, p.get('aid'))
        if a['status'] not in OPEN:
            raise GameError('Cannot skip that task')
        if a['kind'] == 'extra':
            d['attempts'].remove(a)
        else:
            a['status'] = 'skipped'
            d['penaltyMin'] += s['skipPenaltyMin']
            log(game, 'penalty', '%s skipped a task in %s (+%d min)' % (G.team_name(game, tid), geo.CITY_BY_ID[a['cityId']]['name'], s['skipPenaltyMin']), m['id'])
            _after_progress(game, tid, a['territory'], now)
    elif typ == 'review':
        _need_running(game)
        team = game['teams'].get(p.get('teamId'))
        if not team or not _can_review(game, m, team['id']):
            raise GameError('You cannot review that team', 403)
        a = _find(_td(game, team['id']), p.get('aid'))
        verdict = p.get('verdict')
        if verdict not in ('approve', 'reject'):
            raise GameError('Bad review')
        if a['status'] != 'pending' and not (G.neutral_admin(game, m) and a['status'] == 'approved'):
            raise GameError('Already reviewed')
        a['status'] = 'approved' if verdict == 'approve' else 'rejected'
        a['reviewedBy'] = m['id']
        task = _task(game, a['taskId']) or {'title': 'task', 'difficulty': 1}
        log(game, 'review', '%s %s the proof of %s for "%s"' % (m['name'], 'approved' if verdict == 'approve' else 'rejected', team['name'], task['title']), m['id'])
        if verdict == 'approve' and not a.get('granted'):
            a['granted'] = True
            _grant_picks(game, team['id'], task['difficulty'], 'Task approved')
        elif verdict == 'reject':
            notice(game, 'A proof was rejected - redo it or skip', 'review', G.team_ids(game, team['id']))
    elif typ == 'pick':
        tid = _my_team(game, m)
        d = _td(game, tid)
        pk = next((x for x in d['picks'] if x['pid'] == p.get('pid')), None)
        if not pk:
            raise GameError('That pick is gone')
        d['picks'].remove(pk)
        if not p.get('pass'):
            idx = int(core.num(p.get('index'), 0, len(pk['options']) - 1, 'index'))
            d['cards'].append({'iid': core.new_id(3), 'card': pk['options'][idx], 't': now})
    elif typ == 'play_card':
        _need_running(game)
        _play_card(game, m, p, now)
    elif typ == 'finish':
        _need_running(game)
        _need_window(game, now)
        tid = _my_team(game, m)
        d = _td(game, tid)
        if d['finishedAt']:
            raise GameError('Already finished')
        if d['frozenUntil'] > now:
            raise GameError('Your team is frozen for %d more minutes' % ((d['frozenUntil'] - now) // 60000 + 1))
        if available(game, tid):
            raise GameError('Clear every territory first')
        if any(a['kind'] == 'checkin' and a['status'] in OPEN for a in d['attempts']):
            raise GameError('Finish or skip your open task first')
        fc = geo.CITY_BY_ID[s['finishCity']]
        loc = G.fresh_loc(m, now, 180000)
        if not loc or geo.haversine(loc['lat'], loc['lng'], fc['lat'], fc['lng']) > s['checkinRadiusM'] * 1.5:
            raise GameError('You must be at the finish (%s) with GPS on' % fc['name'])
        d['finishedAt'] = now
        d['finishEffMs'] = core.eff_elapsed(game['startedAt'], now, _win(game))
        place = sum(1 for x in game['data']['teams'].values() if x['finishedAt'])
        log(game, 'finish', '%s reached %s (finisher #%d)' % (G.team_name(game, tid), fc['name'], place), m['id'])
        notice(game, '%s reached the finish (place %d)' % (G.team_name(game, tid), place), 'claim')
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
        notice(game, 'Admin adjusted %s by %+d min: %s' % (team['name'], minutes, reason), 'info')
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
    msg = '%s\'s shield blocked "%s" from %s' % (G.team_name(game, target_tid), card['name'], G.team_name(game, attacker_tid))
    log(game, 'card', msg)
    notice(game, msg, 'card')
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
    if t == 'skip_free':
        a = _find(d, p.get('aid'))
        if a['kind'] != 'checkin' or a['status'] not in OPEN:
            raise GameError('Pick one of your open check-in tasks')
    if t == 'steal' and not _td(game, target['id'])['cards']:
        raise GameError('That team has no cards to steal')
    d['cards'].remove(inst)
    where = ' on %s' % target['name'] if target else ''
    blocked = bool(target) and _blocked_by_shield(game, target['id'], card, tid)
    if not blocked:
        td = _td(game, target['id']) if target else None
        if t == 'time_bonus':
            d['bonusMin'] += e['min']
        elif t == 'time_penalty':
            td['penaltyMin'] += e['min']
            notice(game, '%s gave you +%d min' % (me_name, e['min']), 'curse', G.team_ids(game, target['id']))
        elif t == 'freeze':
            td['frozenUntil'] = max(now, td['frozenUntil']) + e['min'] * 60000
            notice(game, 'Your team is frozen for %d min' % e['min'], 'curse', G.team_ids(game, target['id']))
        elif t == 'skip_free':
            a['status'] = 'skipped'
            _after_progress(game, tid, a['territory'], now)
        elif t == 'extra_picks':
            _grant_picks(game, tid, e['n'], 'Card played')
        elif t == 'steal':
            stolen = random.choice(td['cards'])
            td['cards'].remove(stolen)
            d['cards'].append({'iid': core.new_id(3), 'card': stolen['card'], 't': now})
            notice(game, '%s stole a card from you' % me_name, 'curse', G.team_ids(game, target['id']))
        elif t == 'spy':
            d['spyUntil'] = max(now, d['spyUntil']) + e['min'] * 60000
    log(game, 'card', '%s played "%s"%s%s' % (me_name, card['name'], where, ' (blocked by shield)' if blocked else ''), m['id'])
    notice(game, '%s played %s%s%s' % (me_name, card['name'], where, ' - blocked' if blocked else ''), 'card')
    if e['type'] == 'text' and not blocked:
        notice(game, '%s: %s' % (card['name'], card['desc']), 'card', None if not target else G.team_ids(game, target['id']) + G.team_ids(game, tid))


# ---------------------------------------------------------------- views
def _visible_locs(game, me, team, now, spy):
    out = []
    delay = game['settings']['locDelayMin'] * 60000
    live = G.is_referee(game, me) or me['teamId'] == team['id'] or spy
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
    mine = _td(game, me['teamId']) if me['teamId'] in game['data']['teams'] else None
    spy = bool(mine and mine['spyUntil'] > now)
    for t in game['teams'].values():
        d = _td(game, t['id'])
        own = me['teamId'] == t['id'] or G.is_referee(game, me)
        rows = []
        for a in d['attempts']:
            row = {'aid': a['aid'], 'kind': a['kind'], 'cityId': a['cityId'], 't': a['t'], 'territory': a['territory'], 'status': a['status'],
                   'taskId': a['taskId'] if own or a['status'] in ('pending', 'approved') else None}
            if own:
                row.update({'note': a['note'], 'fid': a['fid']})
            elif a['status'] in ('pending', 'approved'):
                row['fid'] = a['fid']
            rows.append(row)
            if a['status'] == 'pending' and _can_review(game, me, t['id']):
                out['reviews'].append({'teamId': t['id'], 'aid': a['aid'], 'cityId': a['cityId'], 'taskId': a['taskId'], 'fid': a['fid'], 'note': a['note']})
        sc = _score_ms(game, t['id'], now)
        cl = cleared(game, t['id'])
        row = {'id': t['id'], 'attempts': rows, 'cleared': cl, 'counts': _counts(game, t['id']), 'available': available(game, t['id']),
               'bonusMin': d['bonusMin'], 'penaltyMin': d['penaltyMin'], 'finishedAt': d['finishedAt'], 'scoreMs': sc, 'adjust': d['adjust'],
               'frozenUntil': d['frozenUntil'], 'locs': _visible_locs(game, me, t, now, spy)}
        if own:
            row.update({'cards': d['cards'], 'picks': d['picks'], 'spyUntil': d['spyUntil']})
        out['teams'].append(row)
        done = _counts(game, t['id'])
        ranking.append((0 if d['finishedAt'] else 1, sc if d['finishedAt'] else -len(cl) * 1000 - sum(done.values()), t['id']))
    ranking.sort()
    out['ranking'] = [r[2] for r in ranking]
    out['claims'] = game['data']['claims']
    return out
