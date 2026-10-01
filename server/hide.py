"""Mode 2: Hide & Seek across Latvia.

Every player hides `hidesPerPlayer` times (one round per hide). Seekers pick questions from a fixed menu (each
question can be asked once per round); the SERVER answers from the hider's real GPS after a short reaction window
in which the hider may veto / randomize with a card. Every answered question lets the hider draw cards.
The seek timer runs until somebody presses "found". Score = time survived + time-bonus cards in hand - penalties.
"""
import random

import cards
import core
import geo
import game as G
from core import GameError, log, notice

CATS = [('radar', 'Radar'), ('thermo', 'Thermometer'), ('matching', 'Matching'), ('measuring', 'Measuring'), ('tentacles', 'Tentacles'), ('photo', 'Photo')]
PHOTO_PROMPTS = ['The sky straight above you', 'The ground beneath your feet', 'The tallest thing you can see',
                 'The nearest road sign or street name', 'The nearest tree', 'A view in any direction of your choice (no people)',
                 'The nearest public-transport stop']
MATCH = {'region': 'in the same historic region', 'municipality': 'in the same municipality',
         'nearest_city': 'closest to the same town', 'nearest_republic': 'closest to the same republican city'}
RIGA = (56.9496, 24.1052)
REPUBLIC = [c for c in geo.CITIES if c['republic']]


def _build_questions():
    q = []
    for km in (1, 2, 5, 10, 25, 50, 100):
        q.append({'id': 'radar:%d' % km, 'cat': 'radar', 'text': 'Are you within %d km of me?' % km})
    for m in (500, 1000, 2000, 5000):
        q.append({'id': 'thermo:%d' % m, 'cat': 'thermo', 'text': 'I travel at least %s. Am I hotter or colder?' % ('%d m' % m if m < 1000 else '%d km' % (m // 1000))})
    for k, t in MATCH.items():
        q.append({'id': 'match:' + k, 'cat': 'matching', 'text': 'Are we both %s?' % t})
    q.append({'id': 'measure:border', 'cat': 'measuring', 'text': "Are you closer to Latvia's border or coast than me?"})
    q.append({'id': 'measure:city', 'cat': 'measuring', 'text': 'Are you closer to a town centre than me?'})
    for c in REPUBLIC:
        q.append({'id': 'measure:c:' + c['id'], 'cat': 'measuring', 'text': 'Are you closer to %s than me?' % c['name']})
    for pool, label in (('any', 'town'), ('republic', 'republican city')):
        for km in (10, 25, 50):
            q.append({'id': 'tent:%s:%d' % (pool, km), 'cat': 'tentacles', 'text': 'Which %s are you closest to, within %d km of me?' % (label, km)})
    for i, pr in enumerate(PHOTO_PROMPTS):
        q.append({'id': 'photo:%d' % i, 'cat': 'photo', 'text': 'Send a photo of: %s' % pr.lower()})
    return q


QUESTIONS = _build_questions()
Q_BY_ID = {q['id']: q for q in QUESTIONS}

DEFAULTS = {'hidesPerPlayer': 2, 'hideMinutes': 60, 'zoneRadiusM': 500, 'cooldownMin': 5, 'zonePenaltyMin': 15, 'handLimit': 6, 'reactSec': 45}


def default_settings():
    s = dict(DEFAULTS)
    s['cards'] = cards.default_cards('hide')
    return s


def clean_settings(old, patch):
    s = dict(old)
    for k, (lo, hi) in {'hidesPerPlayer': (1, 4), 'hideMinutes': (5, 240), 'zoneRadiusM': (100, 3000), 'cooldownMin': (0, 60),
                        'zonePenaltyMin': (0, 120), 'handLimit': (2, 12), 'reactSec': (0, 300)}.items():
        if k in patch:
            s[k] = int(core.num(patch[k], lo, hi, k))
    return s


# ---------------------------------------------------------------- lifecycle
def _rounds(game):
    return game['data']['rounds']


def _cur(game):
    for r in _rounds(game):
        if r['status'] in ('hiding', 'seeking'):
            return r
    return None


def _hider(game, r):
    return game['members'].get(r['hiderId'])


def _seekers(game, r):
    return [m for m in G.participants(game) if m['id'] != r['hiderId']]


def _seeker_ids(game, r):
    return [m['id'] for m in _seekers(game, r)]


def _seek_ms(r, now):
    if r['status'] == 'seeking':
        return max(0, now - r['seekStartedAt'] - r['pausedMs'])
    return r.get('seekMs', 0)


def _fmt(ms):
    m = int(ms / 60000)
    return '%dh %02dm' % (m // 60, m % 60) if m >= 60 else '%d min' % m


def start(game, now):
    players = G.participants(game)
    if len(players) < 2:
        raise GameError('Need at least 2 players')
    order = []
    for _ in range(game['settings']['hidesPerPlayer']):
        ids = [m['id'] for m in players]
        random.shuffle(ids)
        if order and len(ids) > 1 and ids[0] == order[-1]:
            ids.append(ids.pop(0))
        order += ids
    game['data'] = {'rounds': [{'n': i + 1, 'hiderId': h, 'status': 'pending', 'questions': [], 'penaltyMin': 0, 'pausedMs': 0, 'giveUp': [],
                                'events': [], 'zone': None, 'hand': [], 'draws': [], 'handBonus': 0, 'lockUntil': 0, 'lastAskAt': 0}
                               for i, h in enumerate(order)]}


def accrue(game, now):
    pass


def resume(game, now, paused_ms):
    r = _cur(game)
    if r:
        r['pausedMs'] += paused_ms
        if r['status'] == 'hiding':
            r['hideEndsAt'] += paused_ms
        for q in r['questions']:
            if q['status'] == 'pending':
                q['revealAt'] += paused_ms
        r['lockUntil'] += paused_ms if r['lockUntil'] else 0


def finish(game, now):
    r = _cur(game)
    if r:
        _end_round(game, r, now, 'aborted')


def _begin_seek(game, r, now):
    h = _hider(game, r)
    if not r['zone']:
        loc = G.fresh_loc(h, now, 600000)
        if not loc:
            return False
        r['zone'] = {'lat': loc['lat'], 'lng': loc['lng']}
        r['events'].append({'t': now, 'text': "No zone chosen - zone set around the hider's position"})
    r['status'], r['seekStartedAt'], r['pausedMs'] = 'seeking', now, 0
    log(game, 'round', 'Round %d: %s is hiding. The seeking phase begins.' % (r['n'], h['name']))
    notice(game, '%s has hidden. Start seeking!' % h['name'], 'round')
    return True


def _bonus_min(r):
    return sum(c['card']['effect']['min'] for c in r['hand'] if c['card']['effect']['type'] == 'time_bonus')


def _end_round(game, r, now, outcome):
    seek = _seek_ms(r, now) if r['status'] == 'seeking' else 0
    bonus = _bonus_min(r)
    ms = max(0, seek + (bonus - r['penaltyMin']) * 60000)
    h = _hider(game, r)
    tr = [p for p in (h['trail'] if h else []) if p[0] >= r.get('startedAt', now)]
    r.update({'status': 'done', 'outcome': outcome, 'hiderMs': ms, 'seekMs': seek, 'doneAt': now, 'bonusMin': bonus,
              'reveal': {'zone': r['zone'], 'trail': tr[-400:]}})
    text = {'found': 'was found after %s', 'gave_up': 'was not found - seekers gave up after %s', 'aborted': 'round aborted after %s'}[outcome] % _fmt(seek)
    log(game, 'round', 'Round %d over: %s %s. Hider score: %s' % (r['n'], h['name'] if h else '?', text, _fmt(ms)))
    notice(game, 'Round %d over. %s %s. Score %s' % (r['n'], h['name'] if h else '?', text, _fmt(ms)), 'round')
    if all(x['status'] == 'done' for x in _rounds(game)):
        game['status'] = 'finished'
        tot = _totals(game)
        best = max(tot.items(), key=lambda kv: kv[1]) if tot else None
        if best:
            log(game, 'system', 'All rounds played. Winner: %s with %s' % (game['members'][best[0]]['name'], _fmt(best[1])))
            notice(game, 'All rounds played. Winner: %s' % game['members'][best[0]]['name'], 'round')


def _totals(game):
    tot = {m['id']: 0 for m in G.participants(game)}
    for r in _rounds(game):
        if r['status'] == 'done' and r['hiderId'] in tot:
            tot[r['hiderId']] += r['hiderMs']
    return tot


def _reveal(game, r, q, now):
    q['status'], q['answeredAt'] = 'answered', now
    n, keep = cards.DRAW[q['cat']]
    cat = game['settings']['cards']
    if cat:
        r['draws'].append({'did': core.new_id(3), 'options': cards.draw(cat, n), 'keep': keep})
        notice(game, 'New cards to draw (keep %d of %d)' % (keep, n), 'cards', [r['hiderId']])
    notice(game, 'Answer: %s - %s' % (q['text'], q['answer']['text']), 'answer', _seeker_ids(game, r))


def tick(game, now):
    r = _cur(game)
    if not r:
        return
    if r['status'] == 'hiding' and now >= r['hideEndsAt']:
        if _begin_seek(game, r, now):
            game['version'] += 1
        elif now - r.get('warned', 0) > 300000:
            r['warned'] = now
            log(game, 'round', "Waiting for the hider's GPS position before seeking can start")
            game['version'] += 1
    elif r['status'] == 'seeking':
        for q in r['questions']:
            if q['status'] == 'pending' and now >= q['revealAt']:
                _reveal(game, r, q, now)
                game['version'] += 1


def on_loc(game, m, now):
    r = _cur(game)
    if not r or r['status'] != 'seeking' or m['id'] != r['hiderId'] or not r['zone']:
        return
    s = game['settings']
    d = geo.haversine(m['loc']['lat'], m['loc']['lng'], r['zone']['lat'], r['zone']['lng'])
    if d > s['zoneRadiusM'] + max(30, m['loc']['acc']):
        r['outSince'] = r.get('outSince') or now
        if now - r['outSince'] > 180000 and not r.get('outPenalised'):
            r['outPenalised'] = True
            r['penaltyMin'] += s['zonePenaltyMin']
            r['events'].append({'t': now, 'text': 'Hider left the zone for 3+ minutes: -%d min' % s['zonePenaltyMin']})
            log(game, 'penalty', 'The hider left the hiding zone (penalty applied)')
            notice(game, 'The hider left the hiding zone and got a penalty', 'round', _seeker_ids(game, r))
    else:
        r['outSince'], r['outPenalised'] = None, False


# ---------------------------------------------------------------- answering
def _fns(qid):
    kind = qid.split(':')
    if kind[0] == 'match':
        k = kind[1]
        return {'region': lambda pt: geo.DEFAULT_MUNI_TERRITORY.get(geo.muni_at(*pt)), 'municipality': lambda pt: geo.muni_at(*pt),
                'nearest_city': lambda pt: geo.nearest_city(*pt)[0]['id'], 'nearest_republic': lambda pt: geo.nearest_city(*pt, republic_only=True)[0]['id']}[k]
    if qid == 'measure:border':
        return lambda pt: geo.dist_to_border(*pt)
    if qid == 'measure:city':
        return lambda pt: geo.nearest_city(*pt)[1]
    c = geo.CITY_BY_ID[kind[2]]
    return lambda pt: geo.haversine(pt[0], pt[1], c['lat'], c['lng'])


def _answer(qid, here, H):
    """Compute the (secret) answer for a non-photo, non-thermo question."""
    q = Q_BY_ID[qid]
    cat = q['cat']
    if cat == 'radar':
        km = int(qid.split(':')[1])
        hit = geo.haversine(*here, *H) <= km * 1000
        return {'text': 'YES, the hider is within %d km of you' % km if hit else 'NO, the hider is not within %d km of you' % km, 'hit': hit}
    if cat == 'matching':
        f = _fns(qid)
        same = f(here) == f(H)
        return {'text': 'YES, you are both %s' % MATCH[qid.split(':')[1]] if same else 'NO, you are not both %s' % MATCH[qid.split(':')[1]], 'same': same}
    if cat == 'measuring':
        f = _fns(qid)
        closer = f(H) < f(here)
        return {'text': 'YES, the hider is closer' if closer else 'NO, the hider is not closer', 'closer': closer}
    if cat == 'tentacles':
        _, pool, km = qid.split(':')
        km = int(km)
        if geo.haversine(*here, *H) > km * 1000:
            return {'text': 'The hider is outside %d km of you, so there is no answer' % km, 'city': None}
        c = geo.nearest_city(*H, republic_only=(pool == 'republic'))[0]
        return {'text': 'Within %d km of you, the hider is closest to %s' % (km, c['name']), 'city': c['id']}
    raise GameError('Cannot answer that question')


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
        if not G.admin_active(game, m):
            raise GameError('Only the admin starts rounds (switch to Admin mode)', 403)
        if _cur(game):
            raise GameError('A round is already in progress')
        r = next((x for x in _rounds(game) if x['status'] == 'pending'), None)
        if not r:
            raise GameError('No rounds left')
        r.update({'status': 'hiding', 'startedAt': now, 'hideEndsAt': now + s['hideMinutes'] * 60000})
        h = _hider(game, r)
        log(game, 'round', 'Round %d: %s goes hiding (%d min)' % (r['n'], h['name'], s['hideMinutes']))
        notice(game, 'Round %d: %s is hiding. Seekers, stay put!' % (r['n'], h['name']), 'round')
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
    elif typ in ('ask', 'thermo_end'):
        _ask(game, r, m, is_seeker, typ, p, now)
    elif typ == 'answer_photo':
        if not is_hider:
            raise GameError('Only the hider answers photo questions')
        q = next((x for x in r['questions'] if x['id'] == p.get('qid') and x['status'] == 'waiting_photo'), None)
        f = game['files'].get(p.get('fid'))
        if not q or not f or f['owner'] != m['id']:
            raise GameError('Upload a photo first')
        f['scope'] = _seeker_ids(game, r) + [m['id']]
        q['answer'] = {'text': q['text'], 'fid': p['fid']}
        _reveal(game, r, q, now)
    elif typ == 'found':
        if not (is_seeker or is_hider) or r['status'] != 'seeking':
            raise GameError('Not now')
        log(game, 'round', '%s pressed "found"' % m['name'], m['id'])
        _end_round(game, r, now, 'found')
    elif typ == 'give_up':
        if not is_seeker or r['status'] != 'seeking':
            raise GameError('Not now')
        if m['id'] not in r['giveUp']:
            r['giveUp'].append(m['id'])
        notice(game, '%s wants to give up (%d/%d)' % (m['name'], len(r['giveUp']), len(_seekers(game, r))), 'round', _seeker_ids(game, r))
        if len(r['giveUp']) >= len(_seekers(game, r)):
            _end_round(game, r, now, 'gave_up')
    elif typ == 'force_found':
        if not G.neutral_admin(game, m):
            raise GameError('Only a neutral admin can do that', 403)
        log(game, 'override', 'Admin ended the round (hider found)', m['id'])
        _end_round(game, r, now, 'found')
    elif typ in ('draw_keep', 'draw_skip', 'discard', 'play_card'):
        if not is_hider:
            raise GameError('Only the hider has cards')
        _cards_action(game, r, m, typ, p, now)
    else:
        raise GameError('Unknown action')
    G.bump(store, game)


def _used(r):
    return {q['qid'] for q in r['questions'] if q['status'] != 'cancelled'}


def _ask(game, r, m, is_seeker, typ, p, now):
    s = game['settings']
    if not is_seeker:
        raise GameError('Only seekers ask questions')
    if r['status'] != 'seeking':
        raise GameError('Questions can only be asked while seeking')
    me = _fresh(game, m, now, 'Your')
    hl = _fresh(game, _hider(game, r), now, "The hider's", 300000)
    H = (hl['lat'], hl['lng'])
    if typ == 'thermo_end':
        q = next((x for x in r['questions'] if x['id'] == p.get('qid') and x['status'] == 'thermo_open'), None)
        if not q or q['asker'] != m['id']:
            raise GameError('No open thermometer of yours')
        a = q['params']['start']
        moved = geo.haversine(a['lat'], a['lng'], me['lat'], me['lng'])
        need = q['params']['distM']
        if moved < need * 0.9:
            raise GameError('Keep travelling - you moved %d of %d m' % (moved, need))
        da, db = geo.haversine(a['lat'], a['lng'], *H), geo.haversine(me['lat'], me['lng'], *H)
        q['params']['end'] = {'lat': me['lat'], 'lng': me['lng']}
        q['askLoc'] = {'lat': me['lat'], 'lng': me['lng']}
        q['answer'] = {'text': 'HOTTER - the hider is closer to where you are now' if db < da else 'COLDER - the hider is closer to where you started', 'hot': db < da}
        _set_pending(game, r, q, now)
        return
    qd = Q_BY_ID.get(p.get('qid'))
    if not qd:
        raise GameError('Unknown question')
    if r['lockUntil'] > now:
        raise GameError('The hider blocked your questions for %d more minutes' % ((r['lockUntil'] - now) // 60000 + 1))
    if qd['id'] in _used(r):
        raise GameError('That question was already asked this round')
    if any(x['status'] == 'thermo_open' for x in r['questions']):
        raise GameError('Finish your open thermometer first')
    if now - r['lastAskAt'] < s['cooldownMin'] * 60000:
        raise GameError('Cooldown: next question in %d s' % ((s['cooldownMin'] * 60000 - (now - r['lastAskAt'])) // 1000 + 1))
    q = {'id': core.new_id(3), 'n': len(r['questions']) + 1, 't': now, 'asker': m['id'], 'qid': qd['id'], 'cat': qd['cat'], 'text': qd['text'],
         'params': {}, 'status': 'pending', 'answer': None, 'askLoc': {'lat': me['lat'], 'lng': me['lng']}, 'revealAt': now}
    here = (me['lat'], me['lng'])
    if qd['cat'] == 'thermo':
        q['params'] = {'distM': int(qd['id'].split(':')[1]), 'start': {'lat': me['lat'], 'lng': me['lng']}}
        q['status'] = 'thermo_open'
    elif qd['cat'] == 'photo':
        q['status'] = 'waiting_photo'
    else:
        if qd['cat'] in ('radar', 'tentacles'):
            q['params'] = {'center': {'lat': me['lat'], 'lng': me['lng']}, 'km': int(qd['id'].split(':')[-1])}
        q['answer'] = _answer(qd['id'], here, H)
    r['lastAskAt'] = now
    r['questions'].append(q)
    log(game, 'question', '%s asked: %s' % (m['name'], qd['text']), m['id'])
    if q['status'] == 'pending':
        _set_pending(game, r, q, now)


def _set_pending(game, r, q, now):
    s = game['settings']
    q['status'], q['revealAt'] = 'pending', now + s['reactSec'] * 1000
    notice(game, 'Question: %s' % q['text'], 'question', [r['hiderId']])
    if s['reactSec'] == 0:
        _reveal(game, r, q, now)


def _cards_action(game, r, m, typ, p, now):
    s = game['settings']
    limit = s['handLimit'] + r['handBonus']
    if typ in ('draw_keep', 'draw_skip'):
        dr = next((x for x in r['draws'] if x['did'] == p.get('did')), None)
        if not dr:
            raise GameError('That draw is gone')
        if typ == 'draw_keep':
            idx = sorted(set(int(i) for i in (p.get('indexes') or [])))
            if any(i < 0 or i >= len(dr['options']) for i in idx):
                raise GameError('Bad choice')
            if len(idx) > dr['keep']:
                raise GameError('You may keep at most %d' % dr['keep'])
            if len(r['hand']) + len(idx) > limit:
                raise GameError('Your hand is full (%d) - discard a card first' % limit)
            for i in idx:
                r['hand'].append({'iid': core.new_id(3), 'card': dr['options'][i]})
        r['draws'].remove(dr)
        return
    inst = next((i for i in r['hand'] if i['iid'] == p.get('iid')), None)
    if not inst:
        raise GameError('You do not have that card')
    if typ == 'discard':
        r['hand'].remove(inst)
        return
    card, e = inst['card'], inst['card']['effect']
    spec = cards.HIDE_EFFECTS.get(e['type'])
    if not spec or spec.get('passive'):
        raise GameError('This card counts automatically at the end of the round')
    t = e['type']
    q = None
    if t in ('veto', 'randomize'):
        q = next((x for x in r['questions'] if x['id'] == p.get('qid') and x['status'] == 'pending'), None)
        if not q:
            raise GameError('There is no question waiting for your answer')
        if t == 'randomize' and q['cat'] in ('thermo', 'photo'):
            raise GameError('Thermometer and photo questions cannot be randomized')
    extra = None
    if t == 'discard_draw':
        extra = next((i for i in r['hand'] if i['iid'] == p.get('discardIid') and i['iid'] != inst['iid']), None)
        if not extra:
            raise GameError('Choose a card to discard')
    r['hand'].remove(inst)
    to = _seeker_ids(game, r)
    if t == 'veto':
        q['status'], q['answer'] = 'vetoed', None
        notice(game, 'The hider played %s: your question was cancelled' % card['name'], 'card', to)
    elif t == 'randomize':
        pool = [x for x in QUESTIONS if x['cat'] == q['cat'] and x['id'] not in _used(r)]
        if not pool:
            r['hand'].append(inst)
            raise GameError('No other question to randomize into')
        nq = random.choice(pool)
        hl = _fresh(game, _hider(game, r), now, 'Your', 600000)
        q['qid'], q['text'] = nq['id'], nq['text']
        q['params'] = {'center': q['askLoc'], 'km': int(nq['id'].split(':')[-1])} if q['cat'] in ('radar', 'tentacles') else {}
        q['answer'] = _answer(nq['id'], (q['askLoc']['lat'], q['askLoc']['lng']), (hl['lat'], hl['lng']))
        q['randomized'] = True
        _reveal(game, r, q, now)
        notice(game, 'The hider played %s: your question became "%s"' % (card['name'], nq['text']), 'card', to)
    elif t == 'question_lock':
        r['lockUntil'] = max(now, r['lockUntil']) + e['min'] * 60000
        notice(game, 'The hider played %s: no questions for %d min' % (card['name'], e['min']), 'card', to)
    elif t == 'hand_size':
        r['handBonus'] += e['n']
        notice(game, 'The hider played %s' % card['name'], 'card', to)
    elif t == 'discard_draw':
        r['hand'].remove(extra)
        cat = s['cards']
        r['draws'].append({'did': core.new_id(3), 'options': cards.draw(cat, e['draw']), 'keep': e['draw']})
        notice(game, 'The hider played %s' % card['name'], 'card', to)
    elif t == 'text':
        notice(game, 'The hider played %s: %s' % (card['name'], card['desc']), 'card', to)
    log(game, 'card', 'The hider played "%s"' % card['name'], m['id'])


# ---------------------------------------------------------------- view
def _pub_round(r):
    keys = ('n', 'hiderId', 'status', 'hiderMs', 'outcome', 'startedAt', 'hideEndsAt', 'seekStartedAt', 'doneAt', 'seekMs', 'bonusMin', 'penaltyMin', 'pausedMs')
    return {k: r[k] for k in keys if k in r}


def _q_view(q, me, r, secret):
    o = {k: q[k] for k in ('id', 'n', 't', 'asker', 'qid', 'cat', 'text', 'status', 'answeredAt', 'revealAt', 'randomized') if k in q}
    o['params'] = q['params']
    if q['status'] == 'thermo_open' and q['asker'] != me['id'] and not secret:
        o['params'] = {'distM': q['params']['distM']}
    if q['status'] == 'answered' or secret:
        o['answer'] = q['answer']
    return o


def view(game, me, now):
    s = game['settings']
    out = {'rounds': [], 'totals': {}, 'cur': None}
    if game['status'] == 'lobby':
        return out
    referee = G.is_referee(game, me)
    for r in _rounds(game):
        pr = _pub_round(r)
        if r['status'] == 'done':
            pr['reveal'] = r.get('reveal')
            pr['events'] = r['events']
            pr['questions'] = [_q_view(q, me, r, True) for q in r['questions']]
        out['rounds'].append(pr)
    out['totals'] = _totals(game)
    r = _cur(game)
    if not r:
        return out
    hider = _hider(game, r)
    is_hider = me['id'] == r['hiderId']
    seeker = any(x['id'] == me['id'] for x in _seekers(game, r))
    secret = is_hider or referee
    cur = _pub_round(r)
    cur['seekMsNow'] = _seek_ms(r, now)
    cur['questions'] = [_q_view(q, me, r, secret) for q in r['questions']]
    cur['used'] = sorted(_used(r))
    cur['cooldownLeftMs'] = max(0, s['cooldownMin'] * 60000 - (now - r['lastAskAt'])) if r['status'] == 'seeking' and r['lastAskAt'] else 0
    cur['lockLeftMs'] = max(0, r['lockUntil'] - now)
    cur['giveUp'] = len(r['giveUp'])
    cur['seekers'] = len(_seekers(game, r))
    cur['role'] = 'hider' if is_hider else ('seeker' if seeker else ('referee' if referee else 'spectator'))
    if secret:
        cur['zone'] = r['zone']
        cur['events'] = r['events']
        cur['hand'] = r['hand']
        cur['draws'] = r['draws']
        cur['handLimit'] = s['handLimit'] + r['handBonus']
        if referee:
            cur['hiderLoc'] = hider['loc'] if hider else None
    if seeker or referee:
        cur['seekerLocs'] = [{'id': x['id'], 'name': x['name'], 'lat': x['loc']['lat'], 'lng': x['loc']['lng'], 't': x['loc']['t']}
                             for x in _seekers(game, r) if x.get('loc')]
    out['cur'] = cur
    return out
