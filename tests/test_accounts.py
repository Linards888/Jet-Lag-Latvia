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
import owner  # noqa: E402
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
        self.assertIs(self.A.login('MOCHI', 'secret1')[0], a)
        with self.assertRaises(GameError):
            self.A.login('mochi', 'wrongpass')
        self.assertNotIn('secret1', str(a))  # only a salted hash is stored
        self.A.logout(a, tok)
        self.assertIsNone(self.A.by_token(tok))

    def test_character_themes_belong_to_the_owner_only(self):
        owner_themes = [i['id'] for i in loot.ITEMS if i['pool'] == 'owner']
        self.assertEqual(set(owner_themes), {'hoshi', 'hanabi', 'zerotwo', 'toradora', 'evangelion', 'killlakill'})
        me, _ = self.A.register('Boss', 'secret1')
        other, _ = self.A.register('Other', 'secret1')
        os.environ['JETLAG_OWNER'] = 'boss'
        try:
            for t in owner_themes:
                self.A.equip(me, {'kind': 'theme', 'item': t})  # the owner owns them all
                with self.assertRaises(GameError):
                    self.A.equip(other, {'kind': 'theme', 'item': t})
                self.assertFalse(self.A.grant_item(other, t, 'test'))  # and nobody else can ever be given one
            self.A.owner_action(me, {'action': 'item', 'target': other['id'], 'id': 'hoshi', 'have': True})
            self.assertNotIn('hoshi', self.A.me(other)['owned'])  # even the owner tool cannot make them count for others
            self.A.equip(other, {'kind': 'theme', 'item': 'arcade'})  # the new free themes are for everybody
        finally:
            del os.environ['JETLAG_OWNER']

    def test_equip_needs_ownership(self):
        a, _ = self.A.register('Look', 'secret1')
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'frame', 'item': 'f_gold'})
        self.A.equip(a, {'kind': 'theme', 'item': 'sora'})
        a['inv']['f_gold'] = {'t': 0, 'src': 'test'}
        self.A.equip(a, {'kind': 'frame', 'item': 'f_gold'})
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'frame', 'item': 'sora'})  # wrong kind
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'font', 'item': 'x'})

    def test_events_achievements_and_daily_cap(self):
        a, _ = self.A.register('Ach', 'secret1')
        for _ in range(5):
            self.A.event(a['id'], 'tasks_done')
        self.assertIn('task_rookie', a['ach'])
        self.assertIn('t_piragi', a['inv'])  # every achievement unlocks an item
        for _ in range(200):
            self.A.event(a['id'], 'tasks_done')
        self.assertIn('task_master', a['ach'])
        self.assertLessEqual(a['earned']['n'], accounts.DAILY_EVENT_XP_CAP)  # farming is capped per day
        self.assertTrue(self.A.public('ach')['ach'])
        a['public'] = False
        with self.assertRaises(GameError):
            self.A.public('Ach')
        self.assertTrue(all(it in loot.BY_ID for _, _, _, it, _ in loot.ACH))

    def test_owner_controls_every_account(self):
        me, _ = self.A.register('Linards888', 'secret1')
        user, utok = self.A.register('Friend', 'secret1')
        os.environ['JETLAG_OWNER'] = 'linards888'
        try:
            with self.assertRaises(GameError):
                self.A.owner_list(user)  # nobody else can
            with self.assertRaises(GameError):
                self.A.owner_action(user, {'action': 'all_items'})
            self.assertEqual({x['name'] for x in self.A.owner_list(me)}, {'Linards888', 'Friend'})
            self.A.owner_action(me, {'target': user['id'], 'action': 'all_items'})
            self.A.owner_action(me, {'target': user['id'], 'action': 'ach', 'id': 'all'})
            self.A.owner_action(me, {'target': user['id'], 'action': 'stat', 'stat': 'wins', 'value': 7})
            self.A.owner_action(me, {'target': user['id'], 'action': 'equip', 'kind': 'frame', 'item': 'f_storm'})
            v = self.A.owner_view(me, user['id'])
            self.assertEqual((len(user['ach']), user['stats']['wins'], v['equip']['frame']), (len(loot.ACH), 7, 'f_storm'))
            self.A.owner_action(me, {'target': user['id'], 'action': 'set_password', 'password': 'newpass9'})
            self.assertIsNone(self.A.by_token(utok))  # old sessions are dropped
            self.A.login('friend', 'newpass9')
            tok = self.A.owner_action(me, {'target': user['id'], 'action': 'impersonate'})['token']
            self.assertIs(self.A.by_token(tok), user)
            self.A.owner_action(me, {'target': user['id'], 'action': 'rename', 'name': 'Renamed'})
            self.assertIn('renamed', self.A.names)
            self.A.owner_action(me, {'target': user['id'], 'action': 'reset'})
            self.assertEqual((user['inv'], user['ach']), ({}, {}))
            self.A.owner_action(me, {'target': user['id'], 'action': 'delete'})
            self.assertNotIn(user['id'], self.A.users)
            with self.assertRaises(GameError):
                self.A.owner_action(me, {'action': 'delete'})  # not your own account
        finally:
            del os.environ['JETLAG_OWNER']

    def test_persistence_and_old_fields_are_dropped(self):
        a, tok = self.A.register('Keep', 'secret1')
        a['dust'] = 5
        a['equip']['font'] = 'mochiy'
        a['inv']['mochiy'] = {'t': 0}
        self.A.flush(True)
        B = accounts.Accounts(self.A.path)
        b = B.by_token(tok)
        self.assertEqual(b['name'], 'Keep')
        self.assertNotIn('dust', b)
        self.assertNotIn('mochiy', b['inv'])
        self.assertNotIn('font', b['equip'])

    def test_game_actions_count_anti_farm_and_owner_game_control(self):
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
        task = g['data']['teams'][m1['teamId']]['mine'][0]
        G.do_action(store, g, m1, 'complete_task', {'taskId': task})
        self.assertEqual(a1['stats'].get('tasks_done'), 1)
        self.assertEqual(a2['stats'].get('tasks_done', 0), 0)
        # the owner console: list, dump (no hashes), act as a member, edit by path, set a PIN, delete
        self.assertEqual(owner.list_games(store)[0]['code'], g['code'])
        d = owner.dump_game(store, self.A, g['code'])
        self.assertTrue(all('pinHash' not in m and 'tokenHash' not in m for m in d['members'].values()))
        self.assertEqual(d['members'][m1['id']]['accountName'], 'PlayerOne')
        owner.game_action(store, g, {'action': 'patch', 'path': ['data', 'teams', m1['teamId'], 'bonusMin'], 'value': 99})
        self.assertEqual(g['data']['teams'][m1['teamId']]['bonusMin'], 99)
        owner.game_action(store, g, {'action': 'act', 'memberId': admin['id'], 'type': 'pause', 'payload': {'reason': 'owner'}})
        self.assertEqual(g['status'], 'paused')
        owner.game_action(store, g, {'action': 'set_pin', 'memberId': m1['id'], 'pin': '9999'})
        self.assertIsNotNone(G.rejoin(store, g, 'P1', '9999'))
        G.do_action(store, g, admin, 'resume', {})
        G.do_action(store, g, admin, 'end', {})  # too short: no win / finish rewards
        self.assertEqual(a1['stats'].get('wins', 0) + a2['stats'].get('wins', 0), 0)
        owner.game_action(store, g, {'action': 'delete'})
        self.assertNotIn(g['code'], store.games)
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
