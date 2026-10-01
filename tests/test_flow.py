import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))
os.environ['JETLAG_DATA'] = tempfile.mkdtemp()
import core  # noqa: E402
import game as G  # noqa: E402
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


class RaceTests(unittest.TestCase):
    def test_full_race(self):
        store, g, admin, key, tok, (a, b) = mk('race', {'useWindow': False, 'requiredPerTerritory': 1}, n=2)
        act(store, g, a, 'team_create', name='Red')
        act(store, g, b, 'team_create', name='Blue')
        act(store, g, admin, 'start')
        self.assertEqual(g['status'], 'running')
        s = g['settings']
        self.assertEqual(s['cityTerritory']['jelgava'], 'zemgale')
        at(g, a, LIEPAJA)
        with self.assertRaises(GameError):  # wrong territory first (ordered race) and far away
            act(store, g, a, 'checkin', cityId='jelgava')
        act(store, g, a, 'checkin', cityId='liepaja')
        v = G.view(g, a)
        ci = v['g']['teams'][0]['checkins'][0] if v['g']['teams'][0]['id'] == a['teamId'] else v['g']['teams'][1]['checkins'][0]
        self.assertEqual(ci['status'], 'need_proof')
        self.assertIsNotNone(ci['challenge'])
        fid = G.put_file(store, g, a, JPEG, 'members')
        act(store, g, a, 'proof', cityId='liepaja', fid=fid)
        with self.assertRaises(GameError):  # cannot review own team
            act(store, g, a, 'review', teamId=a['teamId'], cityId='liepaja', verdict='approve')
        act(store, g, b, 'review', teamId=a['teamId'], cityId='liepaja', verdict='approve')
        self.assertIn('kurzeme', [t for t in g['data']['claims']])
        for city, pt in (('jelgava', JELGAVA), ('riga', RIGA), ('valmiera', VALMIERA), ('daugavpils', DAUGAVPILS)):
            at(g, a, pt)
            act(store, g, a, 'checkin', cityId=city)
            act(store, g, a, 'skip', cityId=city)
        self.assertEqual(G.view(g, a)['g']['teams'][0 if g['data']['teams'] and list(g['teams'])[0] == a['teamId'] else 1]['available'], [])
        act(store, g, a, 'finish')
        self.assertTrue(g['data']['teams'][a['teamId']]['finishedAt'])
        self.assertTrue(core.verify_log(g))
        json.dumps(G.view(g, b))

    def test_admin_single_and_locking(self):
        store, g, admin, key, tok, (a,) = mk('race', n=1)
        with self.assertRaises(GameError):
            G.admin_login(store, g, 'WRONG-KEY')
        admin2, tok2 = G.admin_login(store, g, key)
        self.assertIsNone(G.authenticate(store, g, tok))  # old admin session revoked
        self.assertIsNotNone(G.authenticate(store, g, tok2))
        self.assertEqual(sum(1 for m in g['members'].values() if m['role'] == 'admin'), 1)
        with self.assertRaises(GameError):
            act(store, g, a, 'start')  # players are not admin
        with self.assertRaises(GameError):
            act(store, g, a, 'announce', text='hi')


class HideTests(unittest.TestCase):
    def test_round(self):
        store, g, admin, key, tok, (h, s1, s2) = mk('hide', {'cooldownMin': 0, 'hidesPerPlayer': 1}, n=3)
        act(store, g, admin, 'start')
        rounds = g['data']['rounds']
        self.assertEqual(len(rounds), 3)
        hider = g['members'][rounds[0]['hiderId']]
        seekers = [m for m in (h, s1, s2) if m is not hider]
        act(store, g, admin, 'start_round')
        at(g, hider, JELGAVA)
        act(store, g, hider, 'set_zone', lat=JELGAVA[0], lng=JELGAVA[1])
        at(g, seekers[0], RIGA)
        at(g, seekers[1], RIGA)
        act(store, g, hider, 'ready')
        self.assertEqual(rounds[0]['status'], 'seeking')
        # radar answered by server from hider's real position; nobody can lie
        act(store, g, seekers[0], 'ask', qtype='radar', radiusKm=50)
        q = rounds[0]['questions'][0]
        self.assertTrue(q['answer']['hit'])  # Jelgava is ~35 km from Riga
        act(store, g, seekers[0], 'ask', qtype='radar', radiusKm=10)
        self.assertFalse(rounds[0]['questions'][1]['answer']['hit'])
        act(store, g, seekers[0], 'ask', qtype='matching', kind='region')
        self.assertFalse(rounds[0]['questions'][2]['answer']['same'])  # Zemgale vs Pierīga
        # secrecy: a seeker's view contains neither the zone nor the hider's location
        blob = json.dumps(G.view(g, seekers[0]))
        self.assertNotIn(str(JELGAVA[0]), blob)
        self.assertIsNone(G.view(g, seekers[0])['g']['cur'].get('zone'))
        self.assertIsNotNone(G.view(g, hider)['g']['cur']['zone'])
        self.assertIsNotNone(G.view(g, admin)['g']['cur']['zone'])  # neutral referee sees it
        with self.assertRaises(GameError):  # too far to tag the hider
            act(store, g, seekers[0], 'found')
        at(g, seekers[0], (JELGAVA[0] + 0.0001, JELGAVA[1]))
        G._FAILS.clear()  # (the anti-probing throttle is covered separately)
        act(store, g, seekers[0], 'enter_endgame')
        self.assertIsNotNone(G.view(g, seekers[0])['g']['cur']['zone'])  # revealed only in the endgame
        act(store, g, seekers[0], 'found')
        self.assertEqual(rounds[0]['status'], 'done')
        self.assertGreaterEqual(rounds[0]['hiderMs'], 3 * 60000 - 1)  # credit for 3 questions (1+1+2 min)... at least some
        self.assertIsNotNone(G.view(g, seekers[1])['g']['rounds'][0]['reveal'])

    def test_playing_admin_sees_no_secrets(self):
        store, g, admin, key, tok, (p1,) = mk('hide', {'hidesPerPlayer': 1}, plays=True, n=1)
        act(store, g, admin, 'start')
        self.assertFalse(G.is_referee(g, admin))
        r = g['data']['rounds'][0]
        hider = g['members'][r['hiderId']]
        at(g, hider, JELGAVA)
        act(store, g, admin, 'start_round')
        act(store, g, hider, 'set_zone', lat=JELGAVA[0], lng=JELGAVA[1])
        other = admin if hider is p1 else p1
        cur = G.view(g, other)['g']['cur']
        self.assertNotIn('zone', cur)
        self.assertNotIn('hiderLoc', cur)
        with self.assertRaises(GameError):
            act(store, g, admin, 'force_found')


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


class TagTests(unittest.TestCase):
    def test_tag_needs_proximity(self):
        store, g, admin, key, tok, (a, b) = mk('tag', {'useWindow': False, 'allStars': True}, n=2)
        act(store, g, a, 'team_create', name='Red')
        act(store, g, b, 'team_create', name='Blue')
        act(store, g, admin, 'start')
        d = g['data']
        it_m = a if a['teamId'] == d['it'] else b
        run_m = b if it_m is a else a
        at(g, it_m, RIGA)
        at(g, run_m, VALMIERA)
        with self.assertRaises(GameError):
            act(store, g, run_m, 'tag', targetTeamId=it_m['teamId'])  # only IT tags
        with self.assertRaises(GameError):
            act(store, g, it_m, 'tag', targetTeamId=run_m['teamId'])  # too far
        at(g, run_m, (RIGA[0] + 0.0002, RIGA[1]))
        G._FAILS.clear()
        self.assertEqual(len(d['powers'][run_m['teamId']]), 2)
        act(store, g, it_m, 'tag', targetTeamId=run_m['teamId'])
        self.assertEqual(d['it'], run_m['teamId'])
        with self.assertRaises(GameError):  # tag-back immunity
            act(store, g, run_m, 'tag', targetTeamId=it_m['teamId'])
        v = G.view(g, it_m)['g']
        self.assertIn(it_m['teamId'], v['immune'])
        self.assertTrue(core.verify_log(g))

    def test_runner_location_is_delayed_for_it(self):
        store, g, admin, key, tok, (a, b) = mk('tag', {'useWindow': False, 'itDelayMin': 10}, n=2)
        act(store, g, a, 'team_create', name='Red')
        act(store, g, b, 'team_create', name='Blue')
        act(store, g, admin, 'start')
        d = g['data']
        it_m = a if a['teamId'] == d['it'] else b
        run_m = b if it_m is a else a
        at(g, run_m, VALMIERA)
        pos = {p['teamId']: p for p in G.view(g, it_m)['g']['positions']}
        self.assertEqual(pos[run_m['teamId']]['locs'], [])  # not visible yet (delay 10 min)
        pos = {p['teamId']: p for p in G.view(g, admin)['g']['positions']}
        self.assertEqual(len(pos[run_m['teamId']]['locs']), 1)  # referee sees live


if __name__ == '__main__':
    unittest.main()
