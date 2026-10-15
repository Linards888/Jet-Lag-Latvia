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
        self.assertGreaterEqual(a['tickets']['sakura'], 0)  # spent 10 (achievement rewards may give a few back)
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

    def test_owner_tools_only_for_named_account(self):
        me, _ = self.A.register('Owner', 'secret1')
        other, _ = self.A.register('Other', 'secret1')
        os.environ['JETLAG_OWNER'] = 'owner'
        try:
            self.assertTrue(self.A.me(me)['owner'])
            self.assertFalse(self.A.me(other)['owner'])
            with self.assertRaises(GameError):
                self.A.owner_action(other, {'action': 'give', 'dust': 99999})  # nobody else can
            self.A.owner_action(me, {'action': 'give', 'dust': 5000, 'sakura': 3, 'std': 2})
            self.assertEqual((me['tickets']['sakura'], me['tickets']['std']), (3, 2))
            self.assertGreaterEqual(me['dust'], 5000)
            self.A.owner_action(me, {'action': 'item', 'id': 'mochiy', 'have': True})
            self.assertIn('mochiy', me['inv'])
            self.A.equip(me, {'kind': 'font', 'item': 'mochiy'})
            self.A.owner_action(me, {'action': 'item', 'id': 'mochiy', 'have': False})
            self.assertNotIn('mochiy', me['inv'])
            self.assertEqual(me['equip']['font'], 'theme')  # an equipped item that is removed is unequipped
            self.A.owner_action(me, {'action': 'all_items'})
            self.A.owner_action(me, {'action': 'ach', 'id': 'all'})
            self.assertEqual(len(me['ach']), len(loot.ACH))
            self.A.owner_action(me, {'action': 'stat', 'stat': 'wins', 'value': 7})
            self.assertEqual(me['stats']['wins'], 7)
            with self.assertRaises(GameError):
                self.A.owner_action(me, {'action': 'stat', 'stat': 'items', 'value': 1})
            self.A.owner_action(me, {'action': 'reset'})
            self.assertEqual((me['inv'], me['ach']), ({}, {}))
        finally:
            del os.environ['JETLAG_OWNER']

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
