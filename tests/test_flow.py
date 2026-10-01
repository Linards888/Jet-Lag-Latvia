import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))
os.environ['JETLAG_DATA'] = tempfile.mkdtemp()
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


class RaceTests(unittest.TestCase):
    def setUp(self):
        self.store, self.g, self.admin, self.key, self.tok, (self.a, self.b) = mk('race', {'useWindow': False, 'requiredPerTerritory': 1}, n=2)
        act(self.store, self.g, self.a, 'team_create', name='Red')
        act(self.store, self.g, self.b, 'team_create', name='Blue')
        act(self.store, self.g, self.admin, 'start')
        self.ta, self.tb = self.a['teamId'], self.b['teamId']

    def test_task_flow_cards_and_finish(self):
        g, store, a, b = self.g, self.store, self.a, self.b
        self.assertEqual(g['settings']['cityTerritory']['jelgava'], 'zemgale')
        at(g, a, LIEPAJA)
        with self.assertRaises(GameError):  # wrong territory (ordered race)
            act(store, g, a, 'checkin', cityId='jelgava')
        act(store, g, a, 'checkin', cityId='liepaja')
        att = g['data']['teams'][self.ta]['attempts'][0]
        self.assertEqual(att['status'], 'choose')
        with self.assertRaises(GameError):  # open task blocks the next check-in
            act(store, g, a, 'checkin', cityId='ventspils')
        act(store, g, a, 'choose_task', aid=att['aid'], taskId='t06')  # difficulty 1
        fid = G.put_file(store, g, a, JPEG, 'members')
        act(store, g, a, 'proof', aid=att['aid'], fid=fid)
        with self.assertRaises(GameError):  # cannot review own team
            act(store, g, a, 'review', teamId=self.ta, aid=att['aid'], verdict='approve')
        act(store, g, b, 'review', teamId=self.ta, aid=att['aid'], verdict='approve')
        row = team_row(G.view(g, a), self.ta)
        self.assertEqual(len(row['picks']), 1)  # difficulty 1 = 1 pick
        self.assertEqual(len(row['picks'][0]['options']), 3)
        act(store, g, a, 'pick', pid=row['picks'][0]['pid'], index=1)
        self.assertEqual(len(team_row(G.view(g, a), self.ta)['cards']), 1)
        self.assertNotIn('cards', team_row(G.view(g, b), self.ta))  # other teams cannot see the hand
        self.assertIn('kurzeme', g['data']['claims'])
        for city, pt in (('jelgava', JELGAVA), ('riga', RIGA), ('valmiera', VALMIERA), ('daugavpils', DAUGAVPILS)):
            at(g, a, pt)
            act(store, g, a, 'checkin', cityId=city)
            act(store, g, a, 'skip', aid=g['data']['teams'][self.ta]['attempts'][-1]['aid'])
        act(store, g, a, 'finish')
        self.assertTrue(g['data']['teams'][self.ta]['finishedAt'])
        self.assertTrue(core.verify_log(g))
        json.dumps(G.view(g, b))

    def test_extra_task_gives_difficulty_picks(self):
        g, store, a, b = self.g, self.store, self.a, self.b
        act(store, g, a, 'start_extra', taskId='t36')  # difficulty 6
        att = g['data']['teams'][self.ta]['attempts'][0]
        with self.assertRaises(GameError):
            act(store, g, a, 'start_extra', taskId='t36')  # once per team
        act(store, g, a, 'proof', aid=att['aid'], fid=G.put_file(store, g, a, JPEG, 'members'))
        act(store, g, b, 'review', teamId=self.ta, aid=att['aid'], verdict='approve')
        self.assertEqual(len(g['data']['teams'][self.ta]['picks']), 6)

    def test_card_effects(self):
        g, store, a, b = self.g, self.store, self.a, self.b
        d_a, d_b = g['data']['teams'][self.ta], g['data']['teams'][self.tb]
        # time bonus
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'time_bonus', min=15))
        self.assertEqual(d_a['bonusMin'], 15)
        # freeze needs a target and blocks check-ins
        iid = give(g, self.ta, 'freeze', min=30)
        with self.assertRaises(GameError):
            act(store, g, a, 'play_card', iid=iid)
        act(store, g, a, 'play_card', iid=iid, targetTeamId=self.tb)
        at(g, b, LIEPAJA)
        with self.assertRaises(GameError):
            act(store, g, b, 'checkin', cityId='liepaja')
        # shield absorbs the next hostile card (and is consumed)
        give(g, self.tb, 'shield')
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'time_penalty', min=20), targetTeamId=self.tb)
        self.assertEqual(d_b['penaltyMin'], 0)
        self.assertEqual(d_b['cards'], [])
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'time_penalty', min=20), targetTeamId=self.tb)
        self.assertEqual(d_b['penaltyMin'], 20)
        # steal
        give(g, self.tb, 'spy', min=5)
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'steal'), targetTeamId=self.tb)
        self.assertEqual([c['card']['effect']['type'] for c in d_a['cards']], ['spy'])
        # passive cards cannot be played; spy shows everybody live
        with self.assertRaises(GameError):
            act(store, g, a, 'play_card', iid=give(g, self.ta, 'shield'))
        at(g, b, JELGAVA)
        act(store, g, a, 'play_card', iid=d_a['cards'][0]['iid'])
        self.assertTrue(team_row(G.view(g, a), self.tb)['locs'][0]['live'])
        # custom text card is announced
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'text'))
        self.assertTrue(any('Test text' in n['text'] for n in G.view(g, b)['notices']))

    def test_skip_free_and_review_rights(self):
        g, store, a, b = self.g, self.store, self.a, self.b
        at(g, a, LIEPAJA)
        act(store, g, a, 'checkin', cityId='liepaja')
        aid = g['data']['teams'][self.ta]['attempts'][0]['aid']
        act(store, g, a, 'play_card', iid=give(g, self.ta, 'skip_free'), aid=aid)
        self.assertEqual(g['data']['teams'][self.ta]['attempts'][0]['status'], 'skipped')
        self.assertEqual(g['data']['teams'][self.ta]['penaltyMin'], 0)


class AdminModeTests(unittest.TestCase):
    def test_modes_and_locks(self):
        store, g, admin, key, tok, (a, b) = mk('hide', {'hidesPerPlayer': 1}, plays=True, n=2)
        self.assertEqual(G.admin_mode(g), 'fair')
        act(store, g, admin, 'announce', text='hello')
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
        self.assertEqual(G.admin_mode(g), 'fair')  # a playing admin starts in fair mode
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

    def test_catalog_editing(self):
        store, g, admin, key, tok, _ = mk('race', n=0)
        act(store, g, admin, 'edit_catalog', kind='cards', items=[
            {'name': 'Mans prikols', 'desc': 'Dejo!', 'weight': 2, 'effect': {'type': 'text', 'target': True}},
            {'name': 'Bonuss', 'desc': '', 'weight': 9, 'effect': {'type': 'time_bonus', 'min': 999}}])
        cs = g['settings']['cards']
        self.assertEqual(len(cs), 2)
        self.assertEqual(cs[1]['effect']['min'], 180)  # clamped
        self.assertEqual(cs[1]['weight'], 8)
        with self.assertRaises(GameError):
            act(store, g, admin, 'edit_catalog', kind='cards', items=[{'name': 'x?', 'effect': {'type': 'nope'}}])
        act(store, g, admin, 'edit_catalog', kind='tasks', items=[{'title': 'Mans uzdevums', 'desc': 'x', 'difficulty': 4}])
        self.assertEqual(g['settings']['tasks'][0]['difficulty'], 4)
        act(store, g, admin, 'edit_catalog', kind='tasks', reset=True)
        self.assertEqual(len(g['settings']['tasks']), len(cards.DEFAULT_TASKS))
        self.assertEqual({t['difficulty'] for t in cards.DEFAULT_TASKS}, {1, 2, 3, 4, 5, 6})


class HideTests(unittest.TestCase):
    def setup_round(self, **settings):
        store, g, admin, key, tok, ps = mk('hide', dict({'cooldownMin': 0, 'hidesPerPlayer': 1, 'reactSec': 45}, **settings), n=3)
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

    def test_questions_answer_once_and_secrecy(self):
        store, g, admin, r, hider, seekers = self.setup_round()
        self.assertEqual(r['status'], 'seeking')
        act(store, g, seekers[0], 'ask', qid='radar:50')
        q = r['questions'][0]
        self.assertEqual(q['status'], 'pending')
        self.assertIsNone(next(x for x in G.view(g, seekers[0])['g']['cur']['questions'] if x['id'] == q['id']).get('answer'))
        self.assertTrue(next(x for x in G.view(g, hider)['g']['cur']['questions'] if x['id'] == q['id'])['answer']['hit'])  # Jelgava ~35 km
        with self.assertRaises(GameError):  # the same question cannot be asked twice
            act(store, g, seekers[1], 'ask', qid='radar:50')
        hide.tick(g, core.now_ms() + 60000)  # reaction window over -> answer revealed
        self.assertEqual(q['status'], 'answered')
        self.assertTrue(next(x for x in G.view(g, seekers[0])['g']['cur']['questions'] if x['id'] == q['id'])['answer']['hit'])
        self.assertEqual(len(r['draws']), 1)  # radar: draw 2
        self.assertEqual(len(r['draws'][0]['options']), 2)
        act(store, g, hider, 'draw_keep', did=r['draws'][0]['did'], indexes=[0])
        self.assertEqual(len(r['hand']), 1)
        act(store, g, seekers[0], 'ask', qid='radar:10')
        self.assertFalse(r['questions'][1]['answer']['hit'])
        act(store, g, seekers[0], 'ask', qid='match:region')
        self.assertFalse(r['questions'][2]['answer']['same'])  # Zemgale vs Pierīga
        blob = json.dumps(G.view(g, seekers[0]))
        self.assertNotIn(str(JELGAVA[0]), blob)
        self.assertIsNone(G.view(g, seekers[0])['g']['cur'].get('zone'))
        self.assertIsNotNone(G.view(g, hider)['g']['cur']['zone'])
        self.assertIsNotNone(G.view(g, admin)['g']['cur']['zone'])  # all-seeing admin
        act(store, g, admin, 'admin_mode', mode='fair')
        self.assertIsNone(G.view(g, admin)['g']['cur'].get('zone'))  # fair-mode admin sees nothing secret
        self.assertFalse(any('Question' in n['text'] for n in G.view(g, seekers[0])['notices']))  # hider-only notice

    def test_found_has_no_radius_and_timer_has_no_cap(self):
        store, g, admin, r, hider, seekers = self.setup_round()
        r['hand'].append({'iid': 'b', 'card': {'id': 'h', 'name': 'bonus', 'desc': '', 'weight': 1, 'effect': {'type': 'time_bonus', 'min': 10}}})
        r['seekStartedAt'] -= 3 * 3600 * 1000  # three hours of seeking - nothing ends the round by itself
        hide.tick(g, core.now_ms())
        self.assertEqual(r['status'], 'seeking')
        act(store, g, seekers[0], 'found')  # seekers far away - no GPS check, they press the button
        self.assertEqual(r['status'], 'done')
        self.assertGreaterEqual(r['hiderMs'], (3 * 60 + 10) * 60000 - 5000)
        self.assertIsNotNone(G.view(g, seekers[1])['g']['rounds'][0]['reveal'])

    def test_veto_randomize_lock(self):
        store, g, admin, r, hider, seekers = self.setup_round()

        def card(t, **e):
            r['hand'].append({'iid': core.new_id(3), 'card': {'id': 'x', 'name': 'C ' + t, 'desc': 'desc', 'weight': 1, 'effect': dict(type=t, **e)}})
            return r['hand'][-1]['iid']
        act(store, g, seekers[0], 'ask', qid='radar:5')
        q = r['questions'][0]
        act(store, g, hider, 'play_card', iid=card('veto'), qid=q['id'])
        self.assertEqual(q['status'], 'vetoed')
        with self.assertRaises(GameError):  # a vetoed question is still used up
            act(store, g, seekers[0], 'ask', qid='radar:5')
        self.assertTrue(any('cancelled' in n['text'] for n in G.view(g, seekers[1])['notices']))  # seekers are told
        self.assertFalse(any('cancelled' in n['text'] for n in G.view(g, hider)['notices']))
        act(store, g, seekers[0], 'ask', qid='radar:25')
        q2 = r['questions'][1]
        act(store, g, hider, 'play_card', iid=card('randomize'), qid=q2['id'])
        self.assertEqual(q2['status'], 'answered')
        self.assertNotEqual(q2['qid'], 'radar:25')
        act(store, g, hider, 'play_card', iid=card('question_lock', min=10))
        with self.assertRaises(GameError):
            act(store, g, seekers[0], 'ask', qid='radar:100')
        with self.assertRaises(GameError):  # time bonus cards are passive
            act(store, g, hider, 'play_card', iid=card('time_bonus', min=5))

    def test_thermometer_two_step_and_hand_limit(self):
        store, g, admin, r, hider, seekers = self.setup_round(handLimit=2)
        act(store, g, seekers[0], 'ask', qid='thermo:500')
        with self.assertRaises(GameError):
            act(store, g, seekers[0], 'thermo_end', qid=r['questions'][0]['id'])  # has not travelled yet
        at(g, seekers[0], (RIGA[0], RIGA[1] + 0.02))  # ~1.2 km east, away from Jelgava -> colder
        act(store, g, seekers[0], 'thermo_end', qid=r['questions'][0]['id'])
        self.assertIn('COLDER', r['questions'][0]['answer']['text'])
        for i in range(2):
            r['hand'].append({'iid': 'h%d' % i, 'card': {'id': 'x', 'name': 'n', 'desc': '', 'weight': 1, 'effect': {'type': 'veto'}}})
        hide.tick(g, core.now_ms() + 60000)
        with self.assertRaises(GameError):  # hand is full
            act(store, g, hider, 'draw_keep', did=r['draws'][0]['did'], indexes=[0])
        act(store, g, hider, 'discard', iid='h0')
        act(store, g, hider, 'draw_keep', did=r['draws'][0]['did'], indexes=[0])
        self.assertEqual(len(r['hand']), 2)

    def test_catalog_is_complete(self):
        ids = [q['id'] for q in hide.QUESTIONS]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual({q['cat'] for q in hide.QUESTIONS}, {c for c, _ in hide.CATS})
        for q in hide.QUESTIONS:
            if q['cat'] not in ('thermo', 'photo'):
                self.assertIn('text', hide._answer(q['id'], RIGA, JELGAVA))


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

    def test_tag_is_in_real_life_and_has_cooldown(self):
        store, g, admin, it_m, run_m = self.setup_game(allStars=True, cooldownMin=5)
        d = g['data']
        with self.assertRaises(GameError):
            act(store, g, run_m, 'tag', targetTeamId=it_m['teamId'])  # only IT tags
        act(store, g, it_m, 'tag', targetTeamId=run_m['teamId'])  # no GPS / distance needed
        self.assertEqual(d['it'], run_m['teamId'])
        with self.assertRaises(GameError):  # tagger cooldown for the new IT
            act(store, g, run_m, 'tag', targetTeamId=it_m['teamId'])
        self.assertGreater(G.view(g, run_m)['g']['itLockLeftMs'], 0)
        self.assertEqual(len(d['powers'][run_m['teamId']]), 2)
        self.assertTrue(core.verify_log(g))

    def test_zero_cooldown_and_shield(self):
        store, g, admin, it_m, run_m = self.setup_game(allStars=True, cooldownMin=0)
        d = g['data']
        d['powers'][run_m['teamId']] = {'shield': {'used': False, 'until': 0}}
        act(store, g, run_m, 'use_power', power='shield')
        with self.assertRaises(GameError):
            act(store, g, it_m, 'tag', targetTeamId=run_m['teamId'])  # shielded

    def test_visibility_defaults_runners_do_not_see_it(self):
        store, g, admin, it_m, run_m = self.setup_game()
        at(g, it_m, RIGA)
        at(g, run_m, VALMIERA)

        def seen(viewer, tid):
            return next(p for p in G.view(g, viewer)['g']['positions'] if p['teamId'] == tid)
        self.assertEqual(len(seen(it_m, run_m['teamId'])['locs']), 1)  # IT sees runners live (no delay)
        self.assertTrue(seen(run_m, it_m['teamId'])['hidden'])  # runners do not see IT by default
        self.assertEqual(len(seen(admin, run_m['teamId'])['locs']), 1)  # all-seeing admin
        g['settings']['runnersSeeIt'] = True
        self.assertEqual(len(seen(run_m, it_m['teamId'])['locs']), 1)
        spec, _t = G.join(store, g, 'Watcher', 'spectator', '1234')
        self.assertTrue(all(p['hidden'] for p in G.view(g, spec)['g']['positions']))  # spectators see no positions


if __name__ == '__main__':
    unittest.main()
