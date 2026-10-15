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


def reg(A, name, pw='special1'):
    return A.register('Test', name, name, pw)


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.A = fresh()

    def test_register_login_rules(self):
        a, tok = self.A.register('Mara', 'Ozola', 'Mochi', 'special1')
        self.assertEqual((a['first'], a['last'], a['name']), ('Mara', 'Ozola', 'Mochi'))
        self.assertTrue(self.A.by_token(tok) is a)
        for bad in (('Mara', 'Ozola', 'ab', 'special1'), ('Mara', 'Ozola', 'has space', 'special1'), ('Mara', 'Ozola', 'Okname', '123'), ('', 'Ozola', 'Okname', 'special1'), ('Mara', 'x' * 30, 'Okname', 'special1')):
            with self.assertRaises(GameError):
                self.A.register(*bad)
        with self.assertRaises(GameError):
            self.A.register('A', 'B', 'mochi', 'another1')  # usernames are case-insensitive unique
        self.assertIs(self.A.login('MOCHI', 'special1')[0], a)
        with self.assertRaises(GameError):
            self.A.login('mochi', 'wrongpass')
        self.assertNotIn('special1', str(a))  # only a salted hash is stored
        self.A.logout(a, tok)
        self.assertIsNone(self.A.by_token(tok))

    def test_bio_and_profile(self):
        a, _ = reg(self.A, 'Writer')
        self.A.update_profile(a, {'bio': 'x' * 500, 'first': 'Anna'})
        self.assertEqual((len(a['bio']), a['first']), (accounts.BIO_MAX, 'Anna'))
        self.assertEqual(self.A.public('writer')['bio'], a['bio'])
        with self.assertRaises(GameError):
            self.A.update_profile(a, {'last': ''})

    def test_catalog_tiers_and_visibility(self):
        by = {i['id']: i for i in loot.ITEMS}
        # tiers exactly as specified by the owner
        self.assertEqual({i['id'] for i in loot.ITEMS if i['kind'] == 'theme' and i['rarity'] == 'mythic'}, {'zerotwo', 'toradora', 'evangelion'})
        self.assertEqual({i['id'] for i in loot.ITEMS if i['kind'] == 'theme' and i['rarity'] == 'legendary'}, {'killlakill', 'hanabi', 'hoshi'})
        self.assertEqual({i['id'] for i in loot.ITEMS if i['kind'] == 'theme' and i['rarity'] == 'rare'}, {'kintsugi', 'mezs', 'okeans', 'saulriets', 'arcade'})
        self.assertEqual(set(loot.BASE) & {i['id'] for i in loot.ITEMS if i['kind'] == 'theme'}, {'sakura', 'sora', 'latvija'})
        self.assertEqual({i['id'] for i in loot.ITEMS if i['kind'] == 'title' and i['rarity'] == 'mythic'}, {'t_chosen', 't_senpai'})
        for kind in ('frame', 'skin', 'symbol'):
            for tier in loot.RARITIES:
                self.assertEqual(sum(1 for i in loot.ITEMS if i['kind'] == kind and i['rarity'] == tier), 3, (kind, tier))
        cat = {i['id']: i for i in loot.catalog()['items']}
        self.assertIn('goal', cat['mezs'])  # rare: the requirement can be looked up
        self.assertIn('goal', cat['t_kokle'])  # epic too
        self.assertEqual((by['hanabi']['vis'], 'goal' in cat['hanabi']), ('name', False))  # legendary: the name, but nobody is told how
        self.assertEqual(by['toradora']['vis'], 'hidden')  # mythic: not shown at all
        self.assertTrue(all(i['stat'] in loot.STATS for i in loot.UNLOCKABLE))

    def test_everything_unlocks_by_playing(self):
        a, _ = reg(self.A, 'Grinder')
        self.A.event(a['id'], 'tasks_done', 5)
        self.assertIn('t_rupjmaize', a['inv'])  # 3 tasks: a rare title
        self.assertNotIn('y_flame', a['inv'])  # the flame symbol needs 15
        self.assertNotIn('hanabi', a['inv'])
        self.A.event(a['id'], 'wins', 60)
        self.assertTrue({'hanabi', 'killlakill', 't_senpai', 'f_prism', 's_rainbow', 'y_glitch'} <= set(a['inv']))
        for _ in range(200):
            self.A.event(a['id'], 'tasks_done')
        self.assertLessEqual(a['earned']['n'], accounts.DAILY_EVENT_XP_CAP)  # farming xp is capped per day

    def test_newcomer_week_symbols_and_theme_privacy(self):
        a, _ = reg(self.A, 'Fresh')
        self.assertEqual(a['equip']['title'], 't_newcomer')
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'title', 'item': None})  # locked for the first week
        a['newcomerUntil'] = 0
        self.A.equip(a, {'kind': 'title', 'item': None})
        self.A.equip(a, {'kind': 'symbols', 'items': ['y_star', 'y_leaf', 'y_heart', 'y_star']})
        self.assertEqual(a['equip']['symbols'], ['y_star', 'y_leaf', 'y_heart'])
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'symbols', 'items': ['y_crown']})  # not unlocked
        self.A.equip(a, {'kind': 'theme', 'item': 'sora'})
        self.assertEqual(self.A.public('fresh')['equip']['theme'], 'sora')
        self.A.equip(a, {'kind': 'showTheme', 'value': False})
        self.assertIsNone(self.A.public('fresh')['equip']['theme'])  # others no longer see it
        self.assertEqual(self.A.me(a)['equip']['theme'], 'sora')  # the player still does

    def test_friends_messages_and_invites(self):
        x, _ = reg(self.A, 'Alice1')
        y, _ = reg(self.A, 'Bobby2')
        z, _ = reg(self.A, 'Carol3')
        with self.assertRaises(GameError):
            self.A.chat_send(x, 'Bobby2', 'hi')  # only friends can write
        self.A.friend_action(x, {'action': 'request', 'name': 'bobby2'})
        self.assertEqual([f['name'] for f in self.A.social(y)['incoming']], ['Alice1'])
        self.A.friend_action(y, {'action': 'accept', 'name': 'Alice1'})
        self.assertEqual([f['name'] for f in self.A.social(x)['friends']], ['Bobby2'])
        self.A.chat_send(x, 'Bobby2', 'hello there')
        self.A.chat_send(x, 'Bobby2', invite={'code': 'ab12c', 'game': 'My race', 'mode': 'race'})
        self.assertEqual(self.A.social(y)['unread'], 2)
        chat = self.A.chat_get(y, 'Alice1')['messages']
        self.assertEqual([(m['k'], m['f']) for m in chat], [('text', 1), ('invite', 1)])
        self.assertEqual(chat[1]['code'], 'AB12C')
        self.assertEqual(self.A.social(y)['unread'], 0)  # reading clears it
        with self.assertRaises(GameError):
            self.A.chat_send(x, 'Bobby2', '  ')
        self.A.friend_action(z, {'action': 'request', 'name': 'Alice1'})  # a request both ways is a yes
        self.A.friend_action(x, {'action': 'request', 'name': 'Carol3'})
        self.assertEqual(len(self.A.social(x)['friends']), 2)
        self.A.friend_action(x, {'action': 'remove', 'name': 'Bobby2'})
        self.assertEqual(self.A.social(y)['friends'], [])
        os.environ['JETLAG_OWNER'] = 'alice1'
        try:
            self.A.owner_action(x, {'target': z['id'], 'action': 'delete'})
            self.assertEqual(self.A.social(x)['friends'], [])  # a deleted account disappears from friend lists
        finally:
            del os.environ['JETLAG_OWNER']

    def test_community_people_leaderboards_and_profiles(self):
        x, _ = self.A.register('Anna', 'Berzina', 'Alice1', 'special1')
        y, _ = self.A.register('Bruno', 'Ozols', 'Bobby2', 'special1')
        z, _ = self.A.register('Cita', 'Liepa', 'Carol3', 'special1')
        hidden, _ = reg(self.A, 'Hidden4')
        self.A.update_profile(hidden, {})
        self.A.equip(hidden, {'kind': 'public', 'value': False})
        x['xp'], y['xp'], z['xp'] = 500, 900, 100
        y['stats']['wins'] = 3
        # search by username, first name and last name; hidden profiles never show up
        self.assertEqual([p['name'] for p in self.A.people(None, 'bruno')], ['Bobby2'])
        self.assertEqual([p['name'] for p in self.A.people(None, 'berz')], ['Alice1'])
        self.assertEqual([p['name'] for p in self.A.people(None, 'hidden')], [])
        top = self.A.community(x)
        self.assertEqual([p['name'] for p in top['top']['level']], ['Bobby2', 'Alice1', 'Carol3'])
        self.assertEqual([p['name'] for p in top['top']['wins']], ['Bobby2'])  # only those who have any
        self.assertEqual(top['total'], 3)
        self.assertEqual([p['rank'] for p in top['top']['level']], [1, 2, 3])
        # the relation to the viewer drives the Add friend / Accept / Friends buttons
        rel = lambda viewer, name: self.A.people(viewer, name)[0]['rel']
        self.assertEqual((rel(x, 'Alice1'), rel(x, 'Bobby2'), rel(None, 'Bobby2')), ('me', 'none', None))
        self.A.friend_action(x, {'action': 'request', 'name': 'Bobby2'})
        self.assertEqual((rel(x, 'Bobby2'), rel(y, 'Alice1')), ('out', 'in'))
        self.A.friend_action(y, {'action': 'accept', 'name': 'Alice1'})
        prof = self.A.public('Bobby2', x)
        self.assertEqual((prof['rel'], prof['rank'], prof['friendCount'], [f['name'] for f in prof['friends']]), ('friend', 1, 1, ['Alice1']))
        self.assertNotIn('hash', str(prof))

    def test_special_look_only_the_owner_finds_gives_and_takes(self):
        owner, _ = reg(self.A, 'Boss1')
        x, _ = reg(self.A, 'Alice1')
        os.environ['JETLAG_OWNER'] = 'boss1'
        try:
            self.assertFalse(self.A.owns(owner, 'onimai'))  # not even the owner has it without the special place
            self.assertNotIn('onimai', [i['id'] for i in loot.catalog()['items']])  # and it is in no public list
            self.assertNotIn('onimai', self.A.me(owner)['owned'])
            self.A.owner_action(owner, {'action': 'all_items'})
            self.assertFalse(self.A.owns(owner, 'onimai'))  # "give every item" does not include it
            with self.assertRaises(GameError) as e:
                self.A.special_action(x, {'action': 'claim'})  # everybody else: it does not exist
            self.assertEqual(e.exception.status, 404)
            self.A.special_action(owner, {'action': 'claim'})
            self.assertTrue(self.A.owns(owner, 'onimai'))
            self.A.equip(owner, {'kind': 'theme', 'item': 'onimai'})
            me = self.A.me(owner)
            self.assertEqual((me['equip']['theme'], [i['id'] for i in me['special']]), ('onimai', ['onimai']))
            self.assertNotIn('onimai', self.A.public('Boss1')['owned'])  # others never see that it exists
            self.A.special_action(owner, {'action': 'give', 'name': 'alice1'})
            self.assertEqual(self.A.special_action(owner, {'action': 'list'})['holders'], ['Alice1', 'Boss1'])
            self.A.equip(x, {'kind': 'theme', 'item': 'onimai'})
            with self.assertRaises(GameError):
                self.A.special_action(x, {'action': 'give', 'name': 'boss1'})  # holders cannot hand it on
            self.A.special_action(x, {'action': 'drop'})  # a holder can remove it from their own menus
            self.assertEqual((self.A.owns(x, 'onimai'), x['equip']['theme']), (False, 'sakura'))
            self.A.special_action(owner, {'action': 'give', 'name': 'alice1'})
            self.A.special_action(owner, {'action': 'revoke', 'name': 'alice1'})
            self.assertFalse(self.A.owns(x, 'onimai'))
        finally:
            del os.environ['JETLAG_OWNER']

    def test_special_pictures_are_validated_and_listed_for_holders_only(self):
        import specialart
        owner, _ = reg(self.A, 'Boss2')
        x, _ = reg(self.A, 'Alice2')
        os.environ['JETLAG_OWNER'] = 'boss2'
        try:
            png = bytes([0x89, 0x50, 0x4E, 0x47]) + b'0' * 50
            with self.assertRaises(GameError):
                specialart.save('hero', b'not an image')
            with self.assertRaises(GameError):
                specialart.save('../etc', png)  # only the fixed slots
            specialart.save('hero', png)
            self.assertIn('hero', specialart.listing())
            with self.assertRaises(GameError):
                specialart.save('hero', b'broken')
            self.assertIn('hero', specialart.listing())  # a bad upload does not destroy the picture that is there
            self.assertFalse(self.A.holds_special(x))
            self.assertNotIn('specialArt', self.A.me(x))
            self.A.special_action(owner, {'action': 'claim'})
            self.assertIn('hero', self.A.me(owner)['specialArt'])
            self.assertTrue(self.A.holds_special(owner))
            specialart.save('hero', b'')  # an empty body removes it
            self.assertNotIn('hero', specialart.listing())
            import owner as owner_mod
            self.assertIsNone(owner_mod.find_art('onimai', os.path.join(os.path.dirname(__file__), '..', 'public')))  # never via the public art route
            with self.assertRaises(GameError):
                owner_mod.save_art('onimai', png)
        finally:
            del os.environ['JETLAG_OWNER']

    def test_equip_needs_ownership_and_owner_owns_everything(self):
        a, _ = reg(self.A, 'Look')
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'frame', 'item': 'f_gold'})
        self.A.equip(a, {'kind': 'theme', 'item': 'sora'})
        a['inv']['f_gold'] = {'t': 0, 'src': 'test'}
        self.A.equip(a, {'kind': 'frame', 'item': 'f_gold'})
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'frame', 'item': 'sora'})  # wrong kind
        with self.assertRaises(GameError):
            self.A.equip(a, {'kind': 'badges', 'items': []})  # badges no longer exist
        os.environ['JETLAG_OWNER'] = 'look'
        try:
            for t in ('hanabi', 'zerotwo', 'toradora', 'evangelion', 'killlakill', 'aurora'):
                self.A.equip(a, {'kind': 'theme', 'item': t})
            v = self.A.me(a)
            self.assertTrue(v['owner'])
            self.assertEqual(len(v['owned']), len(loot.UNLOCKABLE))
        finally:
            del os.environ['JETLAG_OWNER']

    def test_owner_controls_every_account(self):
        me, _ = reg(self.A, 'Linards888')
        user, utok = reg(self.A, 'Friend')
        os.environ['JETLAG_OWNER'] = 'linards888'
        try:
            with self.assertRaises(GameError):
                self.A.owner_list(user)  # nobody else can
            with self.assertRaises(GameError):
                self.A.owner_action(user, {'action': 'all_items'})
            self.assertEqual({x['name'] for x in self.A.owner_list(me)}, {'Linards888', 'Friend'})
            self.A.owner_action(me, {'target': user['id'], 'action': 'all_items'})
            self.A.owner_action(me, {'target': user['id'], 'action': 'stat', 'stat': 'wins', 'value': 7})
            self.A.owner_action(me, {'target': user['id'], 'action': 'equip', 'kind': 'frame', 'item': 'f_storm'})
            self.A.owner_action(me, {'target': user['id'], 'action': 'profile', 'bio': 'hello', 'first': 'Fred'})
            v = self.A.owner_view(me, user['id'])
            self.assertEqual((len(user['inv']), user['stats']['wins'], v['equip']['frame'], v['bio'], v['first']), (len(loot.UNLOCKABLE), 7, 'f_storm', 'hello', 'Fred'))
            self.A.owner_action(me, {'target': user['id'], 'action': 'set_password', 'password': 'newpass9'})
            self.assertIsNone(self.A.by_token(utok))  # old sessions are dropped
            self.A.login('friend', 'newpass9')
            made = self.A.owner_action(me, {'target': user['id'], 'action': 'generate_password'})['password']  # shown once, stored only as a hash
            self.assertEqual(len(made), 12)
            self.A.login('friend', made)
            self.assertNotIn(made, str(user))
            tok = self.A.owner_action(me, {'target': user['id'], 'action': 'impersonate'})['token']
            self.assertIs(self.A.by_token(tok), user)
            self.A.owner_action(me, {'target': user['id'], 'action': 'rename', 'name': 'Renamed'})
            self.assertIn('renamed', self.A.names)
            self.A.owner_action(me, {'target': user['id'], 'action': 'reset'})
            self.assertEqual((user['inv'], user['bio']), ({}, ''))
            self.A.owner_action(me, {'target': user['id'], 'action': 'delete'})
            self.assertNotIn(user['id'], self.A.users)
            for act in ('delete', 'rename'):
                with self.assertRaises(GameError):
                    self.A.owner_action(me, {'action': act, 'name': 'Other99'})  # the owner account cannot be removed or renamed away
        finally:
            del os.environ['JETLAG_OWNER']

    def test_persistence_and_old_fields_are_migrated(self):
        a, tok = reg(self.A, 'Keep')
        a['dust'] = 5
        a['ach'] = {'x': 1}
        a['equip'].update(font='mochiy', badges=['b_star'], frame='f_nonexistent', symbols=['y_star', 'nope'])
        a['inv']['mochiy'] = {'t': 0}
        a.pop('bio')
        self.A.flush(True)
        b = accounts.Accounts(self.A.path).by_token(tok)
        self.assertEqual((b['name'], b['bio']), ('Keep', ''))
        self.assertTrue(all(k not in b for k in ('dust', 'ach')))
        self.assertNotIn('mochiy', b['inv'])
        self.assertEqual(b['equip'], dict(loot.DEFAULT_EQUIP, symbols=['y_star']))

    def test_account_join_rejoin_and_owner_game_control(self):
        store = core.Store(os.path.join(tempfile.mkdtemp(), 'g.json'))
        a0, _ = reg(self.A, 'Boss0')
        a1, _ = reg(self.A, 'PlayerOne')
        a2, _ = reg(self.A, 'PlayerTwo')
        g, key, tok, admin = G.create_game(store, 'race', 'Test one', a0['name'], '12345678', False, {'useWindow': False})
        admin['acct'] = a0['id']
        m1, t1 = G.account_join(store, g, a1, 'player')
        m2, _ = G.account_join(store, g, a2, 'player')
        self.assertEqual((m1['name'], m1['acct']), ('PlayerOne', a1['id']))  # the player name is the username
        again, _ = G.account_join(store, g, a1, 'player')
        self.assertIs(again, m1)  # joining twice just signs in again
        t1b = G.account_rejoin(store, g, a1)[1]
        self.assertNotEqual(t1, t1b)
        self.assertIsNone(G.authenticate(store, g, t1))
        with self.assertRaises(GameError):
            G.account_rejoin(store, g, reg(self.A, 'Stranger')[0])
        G.do_action(store, g, m1, 'team_join', {'cid': 'red'})
        G.do_action(store, g, m2, 'team_join', {'cid': 'blue'})
        G.do_action(store, g, admin, 'start', {})
        self.assertEqual(a1['stats'].get('games_played'), 1)
        task = g['data']['shared'][0]
        G.do_action(store, g, m1, 'complete_task', {'taskId': task})
        self.assertEqual(a1['stats'].get('tasks_done'), 1)
        # owner console: list, dump (no hashes), act as a member, edit by path, set a PIN, delete
        self.assertEqual(owner.list_games(store)[0]['code'], g['code'])
        d = owner.dump_game(store, self.A, g['code'])
        self.assertTrue(all('pinHash' not in m and 'tokenHash' not in m for m in d['members'].values()))
        self.assertEqual(d['members'][m1['id']]['accountName'], 'PlayerOne')
        owner.game_action(store, g, {'action': 'patch', 'path': ['data', 'teams', m1['teamId'], 'frozenUntil'], 'value': 99})
        self.assertEqual(g['data']['teams'][m1['teamId']]['frozenUntil'], 99)
        owner.game_action(store, g, {'action': 'act', 'memberId': admin['id'], 'type': 'pause', 'payload': {'reason': 'owner'}})
        self.assertEqual(g['status'], 'paused')
        owner.game_action(store, g, {'action': 'set_pin', 'memberId': m1['id'], 'pin': '9999'})
        self.assertIsNotNone(G.rejoin(store, g, 'PlayerOne', '9999'))
        G.do_action(store, g, admin, 'resume', {})
        G.do_action(store, g, admin, 'end', {})  # too short: no win / finish rewards
        self.assertEqual(a1['stats'].get('wins', 0) + a2['stats'].get('wins', 0), 0)
        owner.game_action(store, g, {'action': 'delete'})
        self.assertNotIn(g['code'], store.games)
        g2, key, tok, admin2 = G.create_game(store, 'race', 'Test two', 'Boss', '12345678', False, {'useWindow': False})
        n1, _ = G.account_join(store, g2, a1, 'player')
        n2, _ = G.account_join(store, g2, a2, 'player')
        G.do_action(store, g2, n1, 'team_join', {'cid': 'red'})
        G.do_action(store, g2, n2, 'team_join', {'cid': 'blue'})
        G.do_action(store, g2, admin2, 'start', {})
        g2['startedAt'] -= 3600000
        G.do_action(store, g2, admin2, 'end', {})
        self.assertEqual(a1['stats'].get('games_finished', 0) + a2['stats'].get('games_finished', 0), 2)
        self.assertEqual(a1['stats'].get('wins', 0) + a2['stats'].get('wins', 0), 1)

    def test_theme_art_upload_is_validated(self):
        owner.save_art('mezs', bytes([0xFF, 0xD8, 0xFF]) + b'0' * 50)
        self.assertTrue(owner.find_art('mezs', tempfile.mkdtemp()).endswith('mezs.jpg'))
        with self.assertRaises(GameError):
            owner.save_art('mezs', b'<script>alert(1)</script>')  # only real images
        with self.assertRaises(GameError):
            owner.save_art('not-a-theme', bytes([0xFF, 0xD8, 0xFF]))
        owner.save_art('mezs', b'')  # empty body removes it
        self.assertIsNone(owner.find_art('mezs', tempfile.mkdtemp()))


if __name__ == '__main__':
    unittest.main()
