import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))
os.environ['JETLAG_DATA'] = tempfile.mkdtemp()
os.environ['JETLAG_PUSH'] = 'off'
import cards  # noqa: E402
import core  # noqa: E402
import game as G  # noqa: E402
import hide  # noqa: E402
from core import GameError  # noqa: E402

JPEG = b'\xff\xd8\xff' + b'0' * 300
LIEPAJA, JELGAVA, RIGA, VALMIERA, DAUGAVPILS = (56.5047, 21.0108), (56.6511, 23.7214), (56.9496, 24.1052), (57.5384, 25.4264), (55.8747, 26.5362)


def mk(mode, settings=None, plays=False, n=0):
    store = core.Store(os.path.join(os.environ['JETLAG_DATA'], 'g%s.json' % os.urandom(3).hex()))
    g, key, tok, admin = G.create_game(store, mode, 'Test', 'Boss', '1234', plays, settings or {})
    ms = []
    for i in range(n):
        m, t = G.join(store, g, 'P%d' % i, 'player', '1111')
        ms.append(m)
    return store, g, admin, key, tok, ms


def at(g, m, pt, acc=10):
    G.update_loc(g, m, pt[0], pt[1], acc)


def act(store, g, m, typ, **p):
    G.do_action(store, g, m, typ, p)


def give(g, team_id, effect_type, **params):
    """Put a card straight into a race team's inventory."""
    card = {'id': 'x' + effect_type, 'name': 'Test ' + effect_type, 'desc': 'd', 'weight': 1, 'effect': dict(type=effect_type, **params)}
    g['data']['teams'][team_id]['cards'].append({'iid': core.new_id(3), 'card': card, 't': 0})
    return g['data']['teams'][team_id]['cards'][-1]['iid']


def team_row(st, tid):
    return next(t for t in st['g']['teams'] if t['id'] == tid)


def keys(g, m):
    return [n['key'] for n in G.view(g, m)['notices']]


class RaceTests(unittest.TestCase):
    def setUp(self):
        self.store, self.g, self.admin, self.key, self.tok, (self.a, self.b) = mk('race', {'useWindow': False}, n=2)
        act(self.store, self.g, self.a, 'team_create', name='Red')
        act(self.store, self.g, self.b, 'team_create', name='Blue')
        act(self.store, self.g, self.admin, 'start')
        self.ta, self.tb = self.a['teamId'], self.b['teamId']
        self.d = self.g['data']

    def test_territory_is_a_region_you_must_get_out_of(self):
        g, store, a = self.g, self.store, self.a
        row = team_row(G.view(g, a), self.ta)
        self.assertEqual(row['reached'], ['kurzeme'])  # start territory
        self.assertEqual(row['available'], ['zemgale'])
        with self.assertRaises(GameError):
            act(store, g, a, 'checkin', cityId='daugavpils')  # not the next territory
        with self.assertRaises(GameError):
            act(store, g, a, 'checkin', cityId='liepaja')  # already in it
        act(store, g, a, 'checkin', cityId='jelgava')  # no GPS needed
        self.assertEqual(g['data']['claims']['zemgale'], self.ta)  # first to reach gets the bonus
        self.assertEqual(self.d['teams'][self.ta]['bonusMin'], 20)
        with self.assertRaises(GameError):
            act(store, g, a, 'finish', cityId='daugavpils')  # not all territories reached yet
        for city in ('riga', 'valmiera', 'rezekne'):
            act(store, g, a, 'checkin', cityId=city)
        act(store, g, a, 'finish', cityId='daugavpils')
        self.assertTrue(self.d['teams'][self.ta]['finishedAt'])
        self.assertTrue(core.verify_log(g))
        json.dumps(G.view(g, self.b))

    def test_shared_tasks_picks_and_hand_limit(self):
        g, store, a, b = self.g, self.store, self.a, self.b
        active = G.view(g, a)['g']['active']
        self.assertEqual(len(active), 5)
        self.assertEqual(active, G.view(g, b)['g']['active'])  # same tasks for every team
        task = next(t for t in g['settings']['tasks'] if t['id'] == active[0])
        act(store, g, a, 'complete_task', taskId=active[0])  # no start, no proof by default
        row = team_row(G.view(g, a), self.ta)
        self.assertEqual(len(row['picks']), task['difficulty'])
        self.assertEqual(len(row['picks'][0]['options']), 3)
        with self.assertRaises(GameError):
            act(store, g, a, 'complete_task', taskId=active[0])
        with self.assertRaises(GameError):
            act(store, g, a, 'complete_task', taskId='nope')
        self.assertNotIn('picks', team_row(G.view(g, b), self.ta))  # rivals cannot see them
        # hand limit 6: a 7th card needs a discard (or a pass)
        d = self.d['teams'][self.ta]
        d['cards'] = []
        for _ in range(6):
            give(g, self.ta, 'shield')
        d['picks'] = [{'pid': 'p1', 'options': cards.draw(g['settings']['cards'], 3)}, {'pid': 'p2', 'options': cards.draw(g['settings']['cards'], 3)}]
        with self.assertRaises(GameError):
            act(store, g, a, 'pick', pid='p1', index=0)
        act(store, g, a, 'pick', pid='p1', index=0, discardIid=d['cards'][0]['iid'])
        self.assertEqual(len(d['cards']), 6)
        act(store, g, a, 'pick', pid='p2', **{'pass': True})
        self.assertEqual((len(d['cards']), len(d['picks'])), (6, 0))

    def test_shuffle_card_keeps_protected_tasks_and_finished_tasks_refresh(self):
        g, store, a, b = self.g, self.store, self.a, self.b
        before = list(self.d['active'])
        act(store, g, a, 'pin_task', taskId=before[0])
        act(store, g, b, 'pin_task', taskId=before[1])
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'shuffle_tasks'))
        after = self.d['active']
        self.assertEqual(after[:2], before[:2])  # protected by me and by the other team
        self.assertTrue(all(x not in before[2:] for x in after[2:]))  # the other 3 changed
        self.assertEqual(len(set(after)), 5)
        # a task done by every team is replaced for everybody
        t0 = after[3]
        act(store, g, a, 'complete_task', taskId=t0)
        self.assertIn(t0, self.d['active'])
        act(store, g, b, 'complete_task', taskId=t0)
        self.assertNotIn(t0, self.d['active'])

    def test_card_effects(self):
        g, store, a, b = self.g, self.store, self.a, self.b
        d_a, d_b = self.d['teams'][self.ta], self.d['teams'][self.tb]
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'time_bonus', min=15))
        self.assertEqual(d_a['bonusMin'], 15)
        iid = give(g, self.ta, 'freeze', min=30)
        with self.assertRaises(GameError):
            act(store, g, a, 'play_card', iid=iid)  # needs a target
        act(store, g, a, 'play_card', iid=iid, targetTeamId=self.tb)
        with self.assertRaises(GameError):
            act(store, g, b, 'checkin', cityId='jelgava')  # frozen
        self.assertIn('curse_freeze', keys(g, b))
        give(g, self.tb, 'shield')  # shield absorbs the next hostile card
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'time_penalty', min=20), targetTeamId=self.tb)
        self.assertEqual((d_b['penaltyMin'], d_b['cards']), (0, []))
        self.assertIn('card_blocked', keys(g, a))
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'time_penalty', min=20), targetTeamId=self.tb)
        self.assertEqual(d_b['penaltyMin'], 20)
        give(g, self.tb, 'spy', min=5)
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'steal'), targetTeamId=self.tb)
        self.assertEqual([c['card']['effect']['type'] for c in d_a['cards']], ['spy'])
        with self.assertRaises(GameError):
            act(store, g, a, 'play_card', iid=give(g, self.ta, 'shield'))  # passive
        at(g, b, JELGAVA)
        self.assertEqual(team_row(G.view(g, a), self.tb)['locs'], [])  # others' positions are not shown...
        act(store, g, a, 'play_card', iid=d_a['cards'][0]['iid'])  # ...unless you play Spy
        self.assertTrue(team_row(G.view(g, a), self.tb)['locs'][0]['live'])
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'text'))
        self.assertIn('card_text', keys(g, b))


class RaceProofTests(unittest.TestCase):
    def test_optional_proof_and_review(self):
        store, g, admin, key, tok, (a, b) = mk('race', {'useWindow': False, 'requireProof': True}, n=2)
        act(store, g, a, 'team_create', name='Red')
        act(store, g, b, 'team_create', name='Blue')
        act(store, g, admin, 'start')
        ta = a['teamId']
        t0 = g['data']['active'][0]
        with self.assertRaises(GameError):
            act(store, g, a, 'complete_task', taskId=t0)  # a photo is required in this lobby setting
        fid = G.put_file(store, g, a, JPEG, 'members')
        act(store, g, a, 'complete_task', taskId=t0, fid=fid, note='done')
        self.assertEqual(team_row(G.view(g, a), ta)['picks'], [])  # nothing until reviewed
        with self.assertRaises(GameError):
            act(store, g, a, 'review', teamId=ta, taskId=t0, verdict='approve')  # own team
        self.assertEqual(len(G.view(g, b)['g']['reviews']), 1)
        act(store, g, b, 'review', teamId=ta, taskId=t0, verdict='approve')
        self.assertGreater(len(team_row(G.view(g, a), ta)['picks']), 0)


class AdminModeTests(unittest.TestCase):
    def test_modes_and_locks(self):
        store, g, admin, key, tok, (a, b) = mk('hide', {'hidesPerPlayer': 1}, plays=True, n=2)
        self.assertEqual(G.admin_mode(g), 'fair')
        act(store, g, admin, 'announce', text='hello')
        self.assertIn('announce', keys(g, a))
        act(store, g, admin, 'admin_mode', mode='player')
        with self.assertRaises(GameError):  # no accidental admin actions while playing as a player
            act(store, g, admin, 'announce', text='oops')
        v = G.view(g, admin)
        self.assertNotIn('log', v)
        self.assertFalse(v['me']['canAdmin'])
        act(store, g, admin, 'admin_mode', mode='fair')
        self.assertIn('log', G.view(g, admin))
        act(store, g, admin, 'admin_mode', mode='full')  # allowed in the lobby
        act(store, g, admin, 'start')
        self.assertEqual(G.admin_mode(g), 'fair')
        with self.assertRaises(GameError):
            act(store, g, admin, 'admin_mode', mode='full')  # locked while the game runs
        self.assertNotIn('log', G.view(g, a))  # players never get the log

    def test_non_playing_admin(self):
        store, g, admin, key, tok, _ = mk('race', n=0)
        self.assertEqual(G.admin_mode(g), 'full')
        with self.assertRaises(GameError):
            act(store, g, admin, 'admin_mode', mode='player')
        act(store, g, admin, 'admin_mode', mode='fair')
        self.assertFalse(G.is_referee(g, admin))
        self.assertTrue(G.admin_active(g, admin))

    def test_catalog_editing_and_lean_state(self):
        store, g, admin, key, tok, _ = mk('race', n=0)
        act(store, g, admin, 'edit_catalog', kind='cards', items=[
            {'name': 'Mans prikols', 'desc': 'Dejo!', 'weight': 2, 'effect': {'type': 'text', 'target': True}},
            {'name': 'Bonuss', 'desc': '', 'weight': 9, 'effect': {'type': 'time_bonus', 'min': 999}}])
        cs = g['settings']['cards']
        self.assertEqual((len(cs), cs[1]['effect']['min'], cs[1]['weight']), (2, 180, 8))
        with self.assertRaises(GameError):
            act(store, g, admin, 'edit_catalog', kind='cards', items=[{'name': 'x?', 'effect': {'type': 'nope'}}])
        act(store, g, admin, 'edit_catalog', kind='tasks', items=[{'title': 'Mans uzdevums', 'desc': 'x', 'difficulty': 4}])
        self.assertEqual(g['settings']['tasks'][0]['difficulty'], 4)
        act(store, g, admin, 'edit_catalog', kind='tasks', reset=True)
        self.assertEqual(len(g['settings']['tasks']), len(cards.DEFAULT_TASKS))
        self.assertEqual({t['difficulty'] for t in cards.DEFAULT_TASKS}, {1, 2, 3, 4, 5, 6})
        # the heavy catalogue is only sent when its version changed
        v1 = G.view(g, admin)
        self.assertIn('catalog', v1)
        self.assertNotIn('cards', v1['settings'])
        self.assertNotIn('catalog', G.view(g, admin, v1['catV']))
        act(store, g, admin, 'edit_catalog', kind='tasks', reset=True)
        self.assertIn('catalog', G.view(g, admin, v1['catV']))

    def test_default_content_is_translated_until_edited(self):
        self.assertTrue(all('en' in t['tr'] and 'ru' in t['tr'] for t in cards.DEFAULT_TASKS))
        items = cards.default_tasks()
        items[0]['title'] = 'Edited'
        self.assertNotIn('tr', cards.clean_tasks(items)[0])
        self.assertIn('tr', cards.clean_tasks(items)[1])


class HideTests(unittest.TestCase):
    def setup_round(self, **settings):
        store, g, admin, key, tok, ps = mk('hide', dict({'hidesPerPlayer': 1, 'reactSec': 45}, **settings), n=3)
        act(store, g, admin, 'start')
        r = g['data']['rounds'][0]
        hider = g['members'][r['hiderId']]
        seekers = [m for m in ps if m is not hider]
        act(store, g, admin, 'start_round')
        at(g, hider, JELGAVA)
        act(store, g, hider, 'set_zone', lat=JELGAVA[0], lng=JELGAVA[1])
        for s in seekers:
            at(g, s, RIGA)
        act(store, g, hider, 'ready')
        return store, g, admin, r, hider, seekers

    def test_defaults(self):
        self.assertEqual(hide.default_settings()['hideMinutes'], 150)  # 2.5 h
        for gone in ('cooldownMin', 'zonePenaltyMin', 'maxSeekMinutes', 'foundRadiusM'):
            self.assertNotIn(gone, hide.default_settings())

    def test_questions_once_no_cooldown_and_secrecy(self):
        store, g, admin, r, hider, seekers = self.setup_round()
        self.assertEqual(r['status'], 'seeking')
        act(store, g, seekers[0], 'ask', qid='radar:50')
        act(store, g, seekers[0], 'ask', qid='radar:10')  # no cooldown between questions
        q = r['questions'][0]
        self.assertEqual(q['status'], 'pending')
        self.assertIsNone(next(x for x in G.view(g, seekers[0])['g']['cur']['questions'] if x['id'] == q['id']).get('answer'))
        self.assertTrue(next(x for x in G.view(g, hider)['g']['cur']['questions'] if x['id'] == q['id'])['answer']['hit'])
        with self.assertRaises(GameError):
            act(store, g, seekers[1], 'ask', qid='radar:50')  # each question only once
        hide.tick(g, core.now_ms() + 60000)
        self.assertEqual(q['status'], 'answered')
        self.assertEqual(q['answer'], {'hit': True})  # structured answer, text is built by the client
        self.assertEqual(r['questions'][1]['answer'], {'hit': False})
        self.assertEqual(len(r['draws']), 2)
        self.assertEqual(len(r['draws'][0]['options']), 2)
        act(store, g, hider, 'draw_keep', did=r['draws'][0]['did'], indexes=[0])
        self.assertEqual(len(r['hand']), 1)
        act(store, g, seekers[0], 'ask', qid='match:region')
        self.assertEqual(r['questions'][2]['answer'], {'same': False})  # Zemgale vs Pierīga
        self.assertEqual(r['questions'][2]['params']['center']['lat'], RIGA[0])  # asker position is public to seekers
        blob = json.dumps(G.view(g, seekers[0]))
        self.assertNotIn(str(JELGAVA[0]), blob)
        self.assertIsNone(G.view(g, seekers[0])['g']['cur'].get('zone'))
        self.assertIsNotNone(G.view(g, hider)['g']['cur']['zone'])
        self.assertIsNotNone(G.view(g, admin)['g']['cur']['zone'])
        act(store, g, admin, 'admin_mode', mode='fair')
        self.assertIsNone(G.view(g, admin)['g']['cur'].get('zone'))
        self.assertNotIn('question_in', keys(g, seekers[0]))  # hider-only notice

    def test_found_has_no_radius_and_timer_has_no_cap_and_no_zone_penalty(self):
        store, g, admin, r, hider, seekers = self.setup_round()
        r['hand'].append({'iid': 'b', 'card': {'id': 'h', 'name': 'bonus', 'desc': '', 'weight': 1, 'effect': {'type': 'time_bonus', 'min': 10}}})
        r['seekStartedAt'] -= 3 * 3600 * 1000
        at(g, hider, RIGA)  # leaving the zone has no server-side penalty any more
        hide.tick(g, core.now_ms())
        self.assertEqual((r['status'], r['penaltyMin']), ('seeking', 0))
        act(store, g, seekers[0], 'found')  # seekers are far away - no GPS check
        self.assertEqual(r['status'], 'done')
        self.assertGreaterEqual(r['hiderMs'], (3 * 60 + 10) * 60000 - 5000)
        self.assertIn('round_found', keys(g, seekers[1]))
        self.assertIsNotNone(G.view(g, seekers[1])['g']['rounds'][0]['reveal'])

    def test_veto_randomize_lock_notify_seekers(self):
        store, g, admin, r, hider, seekers = self.setup_round()

        def card(t, **e):
            r['hand'].append({'iid': core.new_id(3), 'card': {'id': 'x', 'name': 'C ' + t, 'desc': 'desc', 'weight': 1, 'effect': dict(type=t, **e)}})
            return r['hand'][-1]['iid']
        act(store, g, seekers[0], 'ask', qid='radar:5')
        q = r['questions'][0]
        act(store, g, hider, 'play_card', iid=card('veto'), qid=q['id'])
        self.assertEqual(q['status'], 'vetoed')
        with self.assertRaises(GameError):
            act(store, g, seekers[0], 'ask', qid='radar:5')
        self.assertIn('h_veto', keys(g, seekers[1]))
        self.assertNotIn('h_veto', keys(g, hider))
        act(store, g, seekers[0], 'ask', qid='radar:25')
        q2 = r['questions'][1]
        act(store, g, hider, 'play_card', iid=card('randomize'), qid=q2['id'])
        self.assertEqual(q2['status'], 'answered')
        self.assertNotEqual(q2['qid'], 'radar:25')
        act(store, g, hider, 'play_card', iid=card('question_lock', min=10))
        with self.assertRaises(GameError):
            act(store, g, seekers[0], 'ask', qid='radar:100')
        with self.assertRaises(GameError):
            act(store, g, hider, 'play_card', iid=card('time_bonus', min=5))

    def test_thermometer_and_hand_overflow(self):
        store, g, admin, r, hider, seekers = self.setup_round(handLimit=2)
        act(store, g, seekers[0], 'ask', qid='thermo:500')
        with self.assertRaises(GameError):
            act(store, g, seekers[0], 'thermo_end', qid=r['questions'][0]['id'])
        at(g, seekers[0], (RIGA[0], RIGA[1] + 0.02))  # away from Jelgava -> colder
        act(store, g, seekers[0], 'thermo_end', qid=r['questions'][0]['id'])
        self.assertEqual(r['questions'][0]['answer'], {'hot': False})
        for i in range(2):
            r['hand'].append({'iid': 'h%d' % i, 'card': {'id': 'x', 'name': 'n', 'desc': '', 'weight': 1, 'effect': {'type': 'veto'}}})
        hide.tick(g, core.now_ms() + 60000)
        with self.assertRaises(GameError):  # hand is full
            act(store, g, hider, 'draw_keep', did=r['draws'][0]['did'], indexes=[0])
        act(store, g, hider, 'draw_keep', did=r['draws'][0]['did'], indexes=[0], discard=['h0'])  # discard an old card to keep the new one
        ids = [c['iid'] for c in r['hand']]
        self.assertIn('h1', ids)
        self.assertNotIn('h0', ids)
        self.assertEqual(len(r['hand']), 2)

    def test_catalog_is_complete(self):
        ids = [q['id'] for q in hide.QUESTIONS]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual({q['cat'] for q in hide.QUESTIONS}, {c for c, _ in hide.CATS})
        for q in hide.QUESTIONS:
            if q['cat'] not in ('thermo', 'photo'):
                self.assertIsInstance(hide._answer(q['id'], RIGA, JELGAVA), dict)


class ThrottleTests(unittest.TestCase):
    def test_wrong_pin_lockout_is_temporary_and_names_are_clean(self):
        store, g, admin, key, tok, (a,) = mk('race', n=1)
        for _ in range(8):
            with self.assertRaises(GameError):
                G.rejoin(store, g, 'P0', '0000')
        with self.assertRaises(GameError) as e:
            G.rejoin(store, g, 'P0', '1111')
        self.assertEqual(e.exception.status, 429)
        G._FAILS.clear()
        self.assertEqual(G.rejoin(store, g, 'P0', '1111')[0]['id'], a['id'])
        m, _t = G.join(store, g, '<img src=x onerror=alert(1)>', 'spectator', '1234')
        self.assertNotIn('<', m['name'])

    def test_admin_key_single_admin(self):
        store, g, admin, key, tok, (a,) = mk('race', n=1)
        with self.assertRaises(GameError):
            G.admin_login(store, g, 'WRONG-KEY')
        admin2, tok2 = G.admin_login(store, g, key)
        self.assertIsNone(G.authenticate(store, g, tok))
        self.assertIsNotNone(G.authenticate(store, g, tok2))
        self.assertEqual(sum(1 for m in g['members'].values() if m['role'] == 'admin'), 1)
        with self.assertRaises(GameError):
            act(store, g, a, 'start')


class TagTests(unittest.TestCase):
    def setup_game(self, **s):
        store, g, admin, key, tok, (a, b) = mk('tag', dict({'useWindow': False}, **s), n=2)
        act(store, g, a, 'team_create', name='Red')
        act(store, g, b, 'team_create', name='Blue')
        act(store, g, admin, 'start')
        d = g['data']
        it_m = a if a['teamId'] == d['it'] else b
        run_m = b if it_m is a else a
        return store, g, admin, it_m, run_m

    def test_tag_is_real_life_with_tagger_cooldown(self):
        store, g, admin, it_m, run_m = self.setup_game(allStars=True, cooldownMin=5)
        d = g['data']
        with self.assertRaises(GameError):
            act(store, g, run_m, 'tag', targetTeamId=it_m['teamId'])  # only IT tags
        act(store, g, it_m, 'tag', targetTeamId=run_m['teamId'])  # no GPS, no distance
        self.assertEqual(d['it'], run_m['teamId'])
        with self.assertRaises(GameError):
            act(store, g, run_m, 'tag', targetTeamId=it_m['teamId'])  # Tagger cooldown
        self.assertGreater(G.view(g, run_m)['g']['itLockLeftMs'], 0)
        self.assertEqual(len(d['powers'][run_m['teamId']]), 2)
        self.assertTrue(core.verify_log(g))
        self.assertNotIn('immunityMin', g['settings'])
        self.assertIn('tagged', keys(g, run_m))

    def test_shield_power_blocks_tag_and_expires(self):
        store, g, admin, it_m, run_m = self.setup_game(allStars=True, cooldownMin=0)
        d = g['data']
        rt = run_m['teamId']
        d['powers'][rt] = {'shield': {'used': False}, 'radar': {'used': False}}
        act(store, g, run_m, 'use_power', power='shield')
        self.assertIn(rt, G.view(g, it_m)['g']['shielded'])
        with self.assertRaises(GameError):
            act(store, g, run_m, 'use_power', power='shield')  # one use
        with self.assertRaises(GameError) as e:
            act(store, g, it_m, 'tag', targetTeamId=rt)
        self.assertIn('shielded', str(e.exception))
        self.assertEqual(d['it'], it_m['teamId'])
        d['teams'][rt]['eff']['shield'] = core.now_ms() - 1  # expired
        act(store, g, it_m, 'tag', targetTeamId=rt)
        self.assertEqual(d['it'], rt)

    def test_money_destinations_tasks_and_shop(self):
        store, g, admin, it_m, run_m = self.setup_game(destReward=60, taskPayout=10, cooldownMin=0)
        d, rt = g['data'], run_m['teamId']
        self.assertEqual(len(d['dest']), 3)
        self.assertEqual(len(d['active']), 5)
        dest = d['dest'][0]
        act(store, g, run_m, 'claim_destination', destId=dest['id'])
        self.assertEqual(d['teams'][rt]['money'], 60)
        self.assertNotIn(dest['id'], [x['id'] for x in d['dest']])  # claimed -> replaced by a new one
        self.assertEqual(len(d['dest']), 3)
        self.assertEqual(G.view(g, run_m)['g']['teams'][rt]['money'], 60)
        self.assertNotIn(it_m['teamId'], G.view(g, run_m)['g']['teams'])  # others' money is private
        task = next(t for t in g['settings']['tasks'] if t['id'] == d['active'][0])
        act(store, g, run_m, 'complete_task', taskId=task['id'])
        self.assertEqual(d['teams'][rt]['money'], 60 + task['difficulty'] * 10)
        d['teams'][rt]['money'] = 100
        with self.assertRaises(GameError):
            act(store, g, run_m, 'buy', item='nope')
        act(store, g, run_m, 'buy', item='shield')  # 40
        self.assertEqual(d['teams'][rt]['money'], 60)
        with self.assertRaises(GameError):
            act(store, g, it_m, 'tag', targetTeamId=rt)  # the bought shield works
        act(store, g, run_m, 'buy', item='radar')  # costs 60: exactly enough
        self.assertEqual(d['teams'][rt]['money'], 0)
        with self.assertRaises(GameError):
            act(store, g, run_m, 'buy', item='peek')  # broke now
        d['teams'][rt]['money'] = 70
        act(store, g, run_m, 'buy', item='freeze_it')
        self.assertGreater(d['itLockUntil'], core.now_ms())
        with self.assertRaises(GameError):
            act(store, g, it_m, 'buy', item='freeze_it')

    def test_visibility_defaults_runners_do_not_see_it(self):
        store, g, admin, it_m, run_m = self.setup_game()
        at(g, it_m, RIGA)
        at(g, run_m, VALMIERA)

        def seen(viewer, tid):
            return next(p for p in G.view(g, viewer)['g']['positions'] if p['teamId'] == tid)
        self.assertEqual(len(seen(it_m, run_m['teamId'])['locs']), 1)  # IT sees runners live, no delay
        self.assertTrue(seen(run_m, it_m['teamId'])['hidden'])  # runners do not see IT by default
        self.assertEqual(len(seen(admin, run_m['teamId'])['locs']), 1)
        g['settings']['runnersSeeIt'] = True
        self.assertEqual(len(seen(run_m, it_m['teamId'])['locs']), 1)
        spec, _t = G.join(store, g, 'Watcher', 'spectator', '1234')
        self.assertTrue(all(p['hidden'] for p in G.view(g, spec)['g']['positions']))


if __name__ == '__main__':
    unittest.main()
