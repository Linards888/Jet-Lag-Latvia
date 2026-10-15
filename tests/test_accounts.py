import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))
os.environ['JETLAG_DATA'] = tempfile.mkdtemp()
os.environ['JETLAG_PUSH'] = 'off'
import accounts  # noqa: E402
import core  # noqa: E402
import game as G  # noqa: E402
import loot  # noqa: E402
from core import GameError  # noqa: E402


def fresh():
    return accounts.init(os.path.join(tempfile.mkdtemp(), 'accounts.json'))


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.A = fresh()

    def test_register_login_rules(self):
        a, tok = self.A.register('Mochi', 'secret1')
        self.assertTrue(self.A.by_token(tok) is a)
        for bad in (('ab', 'secret1'), ('has space', 'secret1'), ('Okname', '123')):
            with self.assertRaises(GameError):
                self.A.register(*bad)
        with self.assertRaises(GameError):
            self.A.register('mochi', 'another1')  # names are case-insensitive unique
        b, _ = self.A.login('MOCHI', 'secret1')
        self.assertIs(a, b)
        with self.assertRaises(GameError):
            self.A.login('mochi', 'wrongpass')
        self.A.logout(a, tok)
        self.assertIsNone(self.A.by_token(tok))

    def test_pools_keep_anime_fonts_exclusive(self):
        std_kinds = {(i['kind'], i['id']) for i in loot.POOLS['std']}
        self.assertFalse([k for k in std_kinds if k[0] == 'font'])
        self.assertEqual({i['id'] for i in loot.ITEMS if i['kind'] == 'font'}, {i['id'] for i in loot.POOLS['anime'] if i['kind'] == 'font'})
        a, _ = self.A.register('Rich', 'secret1')
        a['dust'] = 10 ** 6
        for _ in range(300):
            for r in self.A.summon(a, 'std', 10):
                self.assertNotEqual(loot.BY_ID[r['item']]['kind'], 'font')
        self.assertFalse([f for f in loot.ANIME_FONTS if f in a['inv']])

    def test_summon_costs_pity_and_duplicates(self):
        a, _ = self.A.register('Pull', 'secret1')
        a['dust'] = 100
        with self.assertRaises(GameError):
            self.A.summon(a, 'std', 10)  # 900 needed
        with self.assertRaises(GameError):
            self.A.summon(a, 'anime', 1)  # needs a Sakura ticket
        self.A.summon(a, 'std', 1)
        self.assertEqual(a['dust'], 0)
        a['dust'] = 10 ** 6
        legendary_gap, worst = 0, 0
        for _ in range(400):
            r = self.A.summon(a, 'std', 1)[0]
            legendary_gap = 0 if loot.RARITIES.index(r['rarity']) >= 3 else legendary_gap + 1
            worst = max(worst, legendary_gap)
        self.assertLess(worst, 91)  # hard pity: a legendary at least every 90 pulls
        a['tickets']['sakura'] = 10
        first = a['dust']
        res = self.A.summon(a, 'anime', 10)
        self.assertEqual(len(res), 10)
        self.assertEqual(a['tickets']['sakura'], 0)
        self.assertTrue(any(loot.RARITIES.index(r['rarity']) >= 3 for r in res))  # anime pity: legendary within 10
        self.assertGreaterEqual(a['dust'], first)  # duplicates only ever add stardust

    def test_equip_needs_ownership(self):
        a, _ = self.A.register('Look', 'secret1')
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'font', 'item': 'mochiy'})
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'theme', 'item': 'hanabi'})
        self.A.equip(a, {'kind': 'theme', 'item': 'sora'})  # free theme
        self.assertEqual(a['equip']['theme'], 'sora')
        a['inv']['mochiy'] = {'n': 1, 't': 0, 'src': 'test'}
        self.A.equip(a, {'kind': 'font', 'item': 'mochiy'})
        self.assertEqual(self.A.me(a)['equip']['font'], 'mochiy')
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'font', 'item': 'sora'})  # wrong kind

    def test_achievements_rewards_and_daily_cap(self):
        a, _ = self.A.register('Ach', 'secret1')
        for _ in range(5):
            self.A.event(a['id'], 'tasks_done')
        self.assertIn('task_rookie', a['ach'])
        self.assertEqual(a['ach'].keys() & {'task_master'}, set())
        for _ in range(200):
            self.A.event(a['id'], 'tasks_done')
        self.assertIn('task_master', a['ach'])
        self.assertLessEqual(a['earnedToday']['n'], accounts.DAILY_EVENT_DUST_CAP)  # farming is capped per day
        self.A.event(a['id'], 'summons', 10)
        self.assertIn('summoner', a['ach'])
        self.assertTrue(self.A.public('ach')['ach'])
        a['public'] = False
        with self.assertRaises(GameError):
            self.A.public('Ach')

    def test_cheat_codes(self):
        import json
        path = self.A._cheats_path()
        self.assertTrue(os.path.exists(path))  # created on first start with a random master code
        with open(path, encoding='utf8') as f:
            codes = json.load(f)
        master = next(k for k in codes if k.startswith('MASTER-'))
        with open(path, 'w', encoding='utf8') as f:
            json.dump({'gift one': {'dust': 500, 'sakura': 2, 'items': ['mochiy', 'sakura'], 'achievements': ['first_win']}, master: codes[master]}, f)
        a, _ = self.A.register('Cheater', 'secret1')
        with self.assertRaises(GameError):
            self.A.redeem(a, 'nope')
        before = a['dust']
        self.A.redeem(a, 'GIFT ONE')  # case and spaces do not matter
        self.assertEqual(a['dust'] - before >= 500, True)
        self.assertEqual(a['tickets']['sakura'], 2)
        self.assertIn('mochiy', a['inv'])
        self.assertNotIn('sakura', a['inv'])  # base items are owned by everybody already
        self.assertIn('first_win', a['ach'])
        with self.assertRaises(GameError):
            self.A.redeem(a, 'gift one')  # one-time code
        self.A.redeem(a, master)
        self.A.redeem(a, master)  # repeatable
        self.assertEqual(len(a['ach']), len(loot.ACH))
        self.assertTrue(all(i['id'] in a['inv'] for i in loot.ITEMS if i['pool'] != 'base'))

    def test_persistence(self):
        a, tok = self.A.register('Keep', 'secret1')
        a['dust'] = 777
        self.A.flush(True)
        B = accounts.Accounts(self.A.path)
        self.assertEqual(B.by_token(tok)['dust'], 777)

    def test_game_actions_count_and_anti_farm(self):
        store = core.Store(os.path.join(tempfile.mkdtemp(), 'g.json'))
        g, key, tok, admin = G.create_game(store, 'race', 'Test one', 'Boss', '1234', False, {'useWindow': False})
        a1, _ = self.A.register('PlayerOne', 'secret1')
        a2, _ = self.A.register('PlayerTwo', 'secret1')
        m1, _ = G.join(store, g, 'P1', 'player', '1111')
        m2, _ = G.join(store, g, 'P2', 'player', '1111')
        m1['acct'], m2['acct'] = a1['id'], a2['id']
        G.do_action(store, g, m1, 'team_create', {'name': 'Red'})
        G.do_action(store, g, m2, 'team_create', {'name': 'Blue'})
        G.do_action(store, g, admin, 'start', {})
        self.assertEqual(a1['stats'].get('games_played'), 1)
        self.assertIn('race', a1['modes'])
        task = g['data']['teams'][m1['teamId']]['mine'][0]
        G.do_action(store, g, m1, 'complete_task', {'taskId': task})
        self.assertEqual(a1['stats'].get('tasks_done'), 1)
        self.assertEqual(a2['stats'].get('tasks_done', 0), 0)
        self.assertGreater(a1['dust'], 300)
        G.do_action(store, g, admin, 'end', {})  # too short: no win / finish rewards
        self.assertTrue(g['settled'])
        self.assertEqual(a1['stats'].get('wins', 0) + a2['stats'].get('wins', 0), 0)
        # a long enough game with two accounts rewards finishing, and exactly one side wins
        g2, key, tok, admin2 = G.create_game(store, 'race', 'Test two', 'Boss', '1234', False, {'useWindow': False})
        n1, _ = G.join(store, g2, 'P1', 'player', '1111')
        n2, _ = G.join(store, g2, 'P2', 'player', '1111')
        n1['acct'], n2['acct'] = a1['id'], a2['id']
        G.do_action(store, g2, n1, 'team_create', {'name': 'Red'})
        G.do_action(store, g2, n2, 'team_create', {'name': 'Blue'})
        G.do_action(store, g2, admin2, 'start', {})
        g2['startedAt'] -= 3600000
        G.do_action(store, g2, admin2, 'end', {})
        self.assertEqual(a1['stats'].get('games_finished', 0) + a2['stats'].get('games_finished', 0), 2)
        self.assertEqual(a1['stats'].get('wins', 0) + a2['stats'].get('wins', 0), 1)


if __name__ == '__main__':
    unittest.main()
