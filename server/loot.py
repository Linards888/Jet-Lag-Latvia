"""Collectibles for player accounts (no real money anywhere: everything is unlocked by playing).

Four categories (themes, titles, avatar frames, mascot skins) with exactly three items in each of the five tiers
common < rare < epic < legendary < mythic. Every item has one unlock rule: a counter (see EVENT_XP / ACTION_STAT) that must reach a goal.
How much of it the player may see before unlocking depends on `vis`:
  'show'    name and requirement are visible (common and rare),
  'mystery' only a "?" tile: the player knows it exists but not what it is or how to get it (epic and above),
  'hidden'  not shown at all until unlocked (the character themes Hanabi, 02, Toradora, Evangelion, Kill la Kill and two titles).
The site owner (JETLAG_OWNER / data/owner.json) owns everything and can grant or take any item from any account (owner console).
"""
RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic']
OWNER_SITE = 'https://linardsb.xyz'  # shown on the owner's profile for everybody

# (id, kind, rarity, name, stat, goal)  stat None = everybody owns it
_ROWS = [
    # ---- themes
    ('sakura', 'theme', 'common', 'Sakura', None, 0), ('sora', 'theme', 'common', 'Sora', None, 0), ('latvija', 'theme', 'common', 'Latvija', None, 0),
    ('mezs', 'theme', 'rare', 'Mežs', 'games_played', 3), ('okeans', 'theme', 'rare', 'Okeāns', 'tasks_done', 10), ('saulriets', 'theme', 'rare', 'Saulriets', 'territories', 10),
    ('kintsugi', 'theme', 'epic', 'Kintsugi', 'wins', 3), ('arcade', 'theme', 'epic', 'Arcade', 'shop_buys', 15), ('hoshi', 'theme', 'epic', 'Hoshi', 'first_claims', 5),
    ('hanabi', 'theme', 'legendary', 'Hanabi', 'wins', 15), ('zerotwo', 'theme', 'legendary', '02', 'found', 25), ('toradora', 'theme', 'legendary', 'Toradora', 'tags_made', 30),
    ('evangelion', 'theme', 'mythic', 'Evangelion', 'streak', 30), ('killlakill', 'theme', 'mythic', 'Kill la Kill', 'wins', 50), ('aurora', 'theme', 'mythic', 'Aurora', 'night', 50),
    # ---- titles
    ('t_newcomer', 'title', 'common', 'Newcomer', 'games_played', 1), ('t_rupjmaize', 'title', 'common', 'Rupjmaize Rider', 'tasks_done', 3), ('t_piragi', 'title', 'common', 'Piragi Enjoyer', 'cards_played', 3),
    ('t_wanderer', 'title', 'rare', 'Daugava Drifter', 'territories', 8), ('t_ozols', 'title', 'rare', 'Oak Keeper', 'tasks_done', 25), ('t_balzams', 'title', 'rare', 'Black Balsam', 'questions_asked', 25),
    ('t_kokle', 'title', 'epic', 'Kokle Master', 'cards_played', 60), ('t_tram', 'title', 'epic', 'Last Tram', 'dest_claims', 20), ('t_wreath', 'title', 'epic', 'Midsummer Wreath', 'modes', 3),
    ('t_lacplesis', 'title', 'legendary', 'Bearslayer', 'tags_made', 50), ('t_otaku', 'title', 'legendary', 'Otaku', 'found', 40), ('t_senpai', 'title', 'legendary', 'Senpai Noticed Me', 'wins', 20),
    ('t_saule', 'title', 'mythic', 'Daughter of the Sun', 'wins', 40), ('t_ghost', 'title', 'mythic', 'Ghost Runner', 'night', 100), ('t_chosen', 'title', 'mythic', 'The Chosen One', 'encounters', 1),
    # ---- avatar frames
    ('f_plain', 'frame', 'common', 'Plain ring', None, 0), ('f_petal', 'frame', 'common', 'Petal ring', 'games_played', 2), ('f_wave', 'frame', 'common', 'Wave ring', 'tasks_done', 5),
    ('f_leaf', 'frame', 'rare', 'Leaf ring', 'territories', 5), ('f_sky', 'frame', 'rare', 'Sky ring', 'questions_asked', 15), ('f_ember', 'frame', 'rare', 'Ember ring', 'cards_played', 25),
    ('f_ornament', 'frame', 'epic', 'Latvian ornament', 'first_claims', 3), ('f_neon', 'frame', 'epic', 'Neon ring', 'tags_made', 15), ('f_ice', 'frame', 'epic', 'Ice ring', 'streak', 7),
    ('f_gold', 'frame', 'legendary', 'Gilded ring', 'wins', 8), ('f_rose', 'frame', 'legendary', 'Rose ring', 'dest_claims', 40), ('f_void', 'frame', 'legendary', 'Void ring', 'found', 15),
    ('f_prism', 'frame', 'mythic', 'Prism ring', 'wins', 30), ('f_storm', 'frame', 'mythic', 'Sakura storm', 'streak', 20), ('f_galaxy', 'frame', 'mythic', 'Galaxy ring', 'encounters', 1),
    # ---- mascot skins
    ('s_peach', 'skin', 'common', 'Peach Mochi', None, 0), ('s_rose', 'skin', 'common', 'Rose Mochi', 'games_played', 4), ('s_lemon', 'skin', 'common', 'Lemon Mochi', 'tasks_done', 8),
    ('s_mint', 'skin', 'rare', 'Mint Mochi', 'cards_played', 15), ('s_grape', 'skin', 'rare', 'Grape Mochi', 'questions_asked', 20), ('s_sky', 'skin', 'rare', 'Sky Mochi', 'territories', 6),
    ('s_shadow', 'skin', 'epic', 'Shadow Mochi', 'night', 10), ('s_ocean', 'skin', 'epic', 'Ocean Mochi', 'dest_claims', 15), ('s_ember', 'skin', 'epic', 'Ember Mochi', 'tags_made', 10),
    ('s_gold', 'skin', 'legendary', 'Golden Mochi', 'wins', 12), ('s_ghost', 'skin', 'legendary', 'Ghost Mochi', 'found', 20), ('s_sakura', 'skin', 'legendary', 'Sakura Mochi', 'streak', 14),
    ('s_rainbow', 'skin', 'mythic', 'Rainbow Mochi', 'wins', 40), ('s_glitch', 'skin', 'mythic', 'Glitch Mochi', 'night', 60), ('s_cosmic', 'skin', 'mythic', 'Cosmic Mochi', 'encounters', 1),
]
HIDDEN = {'hanabi', 'zerotwo', 'toradora', 'evangelion', 'killlakill', 't_otaku', 't_senpai'}


def _vis(iid, rarity):
    return 'hidden' if iid in HIDDEN else 'show' if rarity in ('common', 'rare') else 'mystery'


ITEMS = [{'id': i, 'kind': k, 'rarity': r, 'name': n, 'stat': s, 'goal': g, 'vis': _vis(i, r)} for i, k, r, n, s, g in _ROWS]
BY_ID = {i['id']: i for i in ITEMS}
BASE = [i['id'] for i in ITEMS if i['stat'] is None]
UNLOCKABLE = [i for i in ITEMS if i['stat'] is not None]
DEFAULT_EQUIP = {'theme': 'sakura', 'title': None, 'frame': 'f_plain', 'skin': 's_peach'}
RARE_ENCOUNTER_CHANCE = 1 / 900  # per counted game action; counts toward the 'encounters' stat

# xp per game event (capped per day, see accounts.py) and the game action that counts as which event
EVENT_XP = {'tasks_done': 4, 'territories': 6, 'first_claims': 12, 'cards_played': 2, 'picks_taken': 1, 'questions_asked': 1, 'found': 8, 'tags_made': 8, 'dest_claims': 6, 'shop_buys': 2}
ACTION_STAT = {'complete_task': 'tasks_done', 'checkin': 'territories', 'play_card': 'cards_played', 'pick': 'picks_taken', 'ask': 'questions_asked',
               'found': 'found', 'tag': 'tags_made', 'claim_destination': 'dest_claims', 'buy': 'shop_buys', 'draw_keep': 'picks_taken'}
# counters that are not plain per-account sums: modes (distinct game modes played), streak (best login streak)
STATS = ['games_played', 'games_finished', 'wins', 'tasks_done', 'territories', 'first_claims', 'cards_played', 'picks_taken', 'questions_asked', 'found',
         'tags_made', 'dest_claims', 'shop_buys', 'encounters', 'night', 'modes', 'streak']


def catalog():
    """Public catalog. The requirement of epic-and-above items is not sent: the player only learns that such an item exists."""
    out = []
    for i in ITEMS:
        row = {'id': i['id'], 'kind': i['kind'], 'rarity': i['rarity'], 'name': i['name'], 'vis': i['vis']}
        if i['vis'] == 'show' and i['stat']:
            row.update(stat=i['stat'], goal=i['goal'])
        out.append(row)
    return {'rarities': RARITIES, 'items': out, 'base': BASE, 'ownerSite': OWNER_SITE}
