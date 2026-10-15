"""Collectibles for player accounts (no real money anywhere: everything is unlocked by playing).

Five categories: themes, titles, avatar frames, mascot skins and symbols (shown under the profile name). Tiers, lowest to highest:
common < rare < epic < legendary < mythic. What a player may see before unlocking depends on the tier:
  common     given to everybody automatically (the Newcomer title only for the first week, see accounts.py),
  rare, epic locked, but tap the tile to see exactly how to unlock it,
  legendary  locked: the name is visible, nobody is told how to get it (it can be earned),
  mythic     not shown at all until unlocked.
Every non-common item has one unlock rule: a counter (see EVENT_XP / ACTION_STAT) that must reach a goal.
The site owner (JETLAG_OWNER / data/owner.json) owns everything and can grant or take any item from any account (owner console).
"""
RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic']
OWNER_SITE = 'https://linardsb.xyz'  # shown on the owner's profile for everybody
NEWCOMER_DAYS = 7  # a new account wears the Newcomer title, and cannot change it, for this long

# (id, kind, rarity, name, stat, goal)  stat None = everybody owns it
_ROWS = [
    # ---- themes
    ('sakura', 'theme', 'common', 'Sakura', None, 0), ('sora', 'theme', 'common', 'Sora', None, 0), ('latvija', 'theme', 'common', 'Latvija', None, 0),
    ('kintsugi', 'theme', 'rare', 'Kintsugi', 'wins', 3), ('mezs', 'theme', 'rare', 'Mežs', 'games_played', 3), ('okeans', 'theme', 'rare', 'Okeāns', 'tasks_done', 10),
    ('saulriets', 'theme', 'rare', 'Saulriets', 'territories', 10), ('arcade', 'theme', 'rare', 'Arcade', 'shop_buys', 15),
    ('aurora', 'theme', 'epic', 'Aurora', 'night', 25),
    ('killlakill', 'theme', 'legendary', 'Kill la Kill', 'wins', 25), ('hanabi', 'theme', 'legendary', 'Hanabi', 'wins', 15), ('hoshi', 'theme', 'legendary', 'Hoshi', 'first_claims', 15),
    ('zerotwo', 'theme', 'mythic', '02', 'found', 60), ('toradora', 'theme', 'mythic', 'Toradora', 'tags_made', 80), ('evangelion', 'theme', 'mythic', 'Evangelion', 'streak', 30),
    # ---- titles
    ('t_newcomer', 'title', 'common', 'Newcomer', None, 0),
    ('t_rupjmaize', 'title', 'rare', 'Rupjmaize Rider', 'tasks_done', 3), ('t_piragi', 'title', 'rare', 'Piragi Enjoyer', 'cards_played', 3), ('t_wanderer', 'title', 'rare', 'Daugava Drifter', 'territories', 8),
    ('t_ozols', 'title', 'rare', 'Oak Keeper', 'tasks_done', 25), ('t_balzams', 'title', 'rare', 'Black Balsam', 'questions_asked', 25),
    ('t_kokle', 'title', 'epic', 'Kokle Master', 'cards_played', 60), ('t_tram', 'title', 'epic', 'Last Tram', 'dest_claims', 20), ('t_wreath', 'title', 'epic', 'Midsummer Wreath', 'modes', 3),
    ('t_lacplesis', 'title', 'legendary', 'Bearslayer', 'tags_made', 50), ('t_otaku', 'title', 'legendary', 'Otaku', 'found', 40), ('t_saule', 'title', 'legendary', 'Daughter of the Sun', 'wins', 30),
    ('t_ghost', 'title', 'legendary', 'Ghost Runner', 'night', 100),
    ('t_chosen', 'title', 'mythic', 'The Chosen One', 'encounters', 1), ('t_senpai', 'title', 'mythic', 'Senpai Noticed Me', 'wins', 40),
    # ---- avatar frames
    ('f_plain', 'frame', 'common', 'Plain ring', None, 0), ('f_petal', 'frame', 'common', 'Petal ring', None, 0), ('f_wave', 'frame', 'common', 'Wave ring', None, 0),
    ('f_leaf', 'frame', 'rare', 'Leaf ring', 'territories', 5), ('f_sky', 'frame', 'rare', 'Sky ring', 'questions_asked', 15), ('f_ember', 'frame', 'rare', 'Ember ring', 'cards_played', 25),
    ('f_ornament', 'frame', 'epic', 'Latvian ornament', 'first_claims', 3), ('f_neon', 'frame', 'epic', 'Neon ring', 'tags_made', 15), ('f_ice', 'frame', 'epic', 'Ice ring', 'streak', 7),
    ('f_gold', 'frame', 'legendary', 'Gilded ring', 'wins', 8), ('f_rose', 'frame', 'legendary', 'Rose ring', 'dest_claims', 40), ('f_void', 'frame', 'legendary', 'Void ring', 'found', 15),
    ('f_prism', 'frame', 'mythic', 'Prism ring', 'wins', 30), ('f_storm', 'frame', 'mythic', 'Sakura storm', 'streak', 20), ('f_galaxy', 'frame', 'mythic', 'Galaxy ring', 'encounters', 1),
    # ---- mascot skins
    ('s_peach', 'skin', 'common', 'Peach Mochi', None, 0), ('s_rose', 'skin', 'common', 'Rose Mochi', None, 0), ('s_lemon', 'skin', 'common', 'Lemon Mochi', None, 0),
    ('s_mint', 'skin', 'rare', 'Mint Mochi', 'cards_played', 15), ('s_grape', 'skin', 'rare', 'Grape Mochi', 'questions_asked', 20), ('s_sky', 'skin', 'rare', 'Sky Mochi', 'territories', 6),
    ('s_shadow', 'skin', 'epic', 'Shadow Mochi', 'night', 10), ('s_ocean', 'skin', 'epic', 'Ocean Mochi', 'dest_claims', 15), ('s_ember', 'skin', 'epic', 'Ember Mochi', 'tags_made', 10),
    ('s_gold', 'skin', 'legendary', 'Golden Mochi', 'wins', 12), ('s_ghost', 'skin', 'legendary', 'Ghost Mochi', 'found', 20), ('s_sakura', 'skin', 'legendary', 'Sakura Mochi', 'streak', 14),
    ('s_rainbow', 'skin', 'mythic', 'Rainbow Mochi', 'wins', 40), ('s_glitch', 'skin', 'mythic', 'Glitch Mochi', 'night', 60), ('s_cosmic', 'skin', 'mythic', 'Cosmic Mochi', 'encounters', 1),
    # ---- symbols (up to three can be shown under the profile name)
    ('y_star', 'symbol', 'common', 'Star', None, 0), ('y_leaf', 'symbol', 'common', 'Leaf', None, 0), ('y_heart', 'symbol', 'common', 'Heart', None, 0),
    ('y_flame', 'symbol', 'rare', 'Flame', 'tasks_done', 15), ('y_wave', 'symbol', 'rare', 'Wave', 'territories', 12), ('y_moon', 'symbol', 'rare', 'Moon', 'night', 5),
    ('y_crown', 'symbol', 'epic', 'Crown', 'wins', 5), ('y_comet', 'symbol', 'epic', 'Comet', 'first_claims', 6), ('y_sun', 'symbol', 'epic', 'Sun', 'tags_made', 20),
    ('y_void', 'symbol', 'legendary', 'Void', 'found', 30), ('y_gem', 'symbol', 'legendary', 'Gem', 'cards_played', 100), ('y_bolt', 'symbol', 'legendary', 'Thunder', 'dest_claims', 60),
    ('y_phoenix', 'symbol', 'mythic', 'Phoenix', 'streak', 40), ('y_galaxy', 'symbol', 'mythic', 'Galaxy', 'encounters', 1), ('y_glitch', 'symbol', 'mythic', 'Glitch', 'wins', 60),
]
VIS = {'common': 'show', 'rare': 'show', 'epic': 'show', 'legendary': 'name', 'mythic': 'hidden'}
ITEMS = [{'id': i, 'kind': k, 'rarity': r, 'name': n, 'stat': s, 'goal': g, 'vis': VIS[r]} for i, k, r, n, s, g in _ROWS]
BY_ID = {i['id']: i for i in ITEMS}
BASE = [i['id'] for i in ITEMS if i['stat'] is None]
UNLOCKABLE = [i for i in ITEMS if i['stat'] is not None]
# a look that is not in the catalogue: only the owner finds it (a hidden place in the app) and only the owner can give or take it
SECRET = [{'id': 'onimai', 'kind': 'theme', 'rarity': 'mythic', 'name': 'Onimai', 'vis': 'hidden'}]
SECRET_IDS = [i['id'] for i in SECRET]
BY_ID.update({i['id']: i for i in SECRET})  # known to equip/unlock, but in no list (ITEMS, BASE, UNLOCKABLE) and never owned automatically
DEFAULT_EQUIP = {'theme': 'sakura', 'title': 't_newcomer', 'frame': 'f_plain', 'skin': 's_peach', 'symbols': []}
SYMBOLS_MAX = 3
RARE_ENCOUNTER_CHANCE = 1 / 900  # per counted game action; counts toward the 'encounters' stat

# xp per game event (capped per day, see accounts.py) and the game action that counts as which event
EVENT_XP = {'tasks_done': 4, 'territories': 6, 'first_claims': 12, 'cards_played': 2, 'picks_taken': 1, 'questions_asked': 1, 'found': 8, 'tags_made': 8, 'dest_claims': 6, 'shop_buys': 2}
ACTION_STAT = {'complete_task': 'tasks_done', 'checkin': 'territories', 'play_card': 'cards_played', 'pick': 'picks_taken', 'ask': 'questions_asked',
               'found': 'found', 'tag': 'tags_made', 'claim_destination': 'dest_claims', 'buy': 'shop_buys', 'draw_keep': 'picks_taken'}
# counters that are not plain per-account sums: modes (distinct game modes played), streak (best login streak)
STATS = ['games_played', 'games_finished', 'wins', 'tasks_done', 'territories', 'first_claims', 'cards_played', 'picks_taken', 'questions_asked', 'found',
         'tags_made', 'dest_claims', 'shop_buys', 'encounters', 'night', 'modes', 'streak']


def catalog():
    """Public catalog. Only rare and epic items tell how to unlock them; legendary ones only have a name, mythic ones are never shown."""
    out = []
    for i in ITEMS:
        row = {'id': i['id'], 'kind': i['kind'], 'rarity': i['rarity'], 'name': i['name'], 'vis': i['vis']}
        if i['vis'] == 'show' and i['stat']:
            row.update(stat=i['stat'], goal=i['goal'])
        out.append(row)
    return {'rarities': RARITIES, 'items': out, 'base': BASE, 'ownerSite': OWNER_SITE}
