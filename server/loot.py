"""Collectibles and achievements for player accounts (no real money anywhere: everything is earned by playing).

Rarity tiers: common < rare < epic < legendary < mythic < secret.
Pools: 'std'   = the standard summon (stardust),
       'anime' = the Anime banner (Sakura tickets, which only rare achievements and rare encounters give). The anime fonts
                 can ONLY be won there,
       'achv'  = never summoned, only given by an achievement,
       'base'  = everybody owns it.
"""
RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic', 'secret']
SHARDS = {'common': 10, 'rare': 25, 'epic': 60, 'legendary': 150, 'mythic': 400, 'secret': 1000}  # stardust for a duplicate

STD_WEIGHTS = {'common': 62, 'rare': 25, 'epic': 9.5, 'legendary': 3.5}
ANIME_WEIGHTS = {'rare': 52, 'epic': 28, 'legendary': 16, 'mythic': 3.4, 'secret': 0.6}
STD_COST, ANIME_COST = 100, 1  # stardust per pull / Sakura tickets per pull


def _i(iid, kind, rarity, pool, name, d=''):
    return {'id': iid, 'kind': kind, 'rarity': rarity, 'pool': pool, 'name': name, 'd': d}


ITEMS = [
    # ---- themes (the three free ones are 'base')
    _i('sakura', 'theme', 'common', 'base', 'Sakura'), _i('sora', 'theme', 'common', 'base', 'Sora'), _i('latvija', 'theme', 'common', 'base', 'Latvija'),
    _i('hoshi', 'theme', 'epic', 'std', 'Hoshi', 'A night sky full of stars.'),
    _i('kintsugi', 'theme', 'legendary', 'std', 'Kintsugi', 'Black lacquer mended with gold.'),
    _i('hanabi', 'theme', 'mythic', 'anime', 'Hanabi', 'Fireworks over a summer festival.'),
    # ---- titles
    _i('t_newcomer', 'title', 'common', 'std', 'Newcomer'), _i('t_rupjmaize', 'title', 'common', 'std', 'Rupjmaize Rider'),
    _i('t_piragi', 'title', 'common', 'std', 'Piragi Enjoyer'), _i('t_wanderer', 'title', 'rare', 'std', 'Daugava Drifter'),
    _i('t_ozols', 'title', 'rare', 'std', 'Oak Keeper'), _i('t_balzams', 'title', 'rare', 'std', 'Black Balsam'),
    _i('t_wreath', 'title', 'rare', 'std', 'Midsummer Wreath'), _i('t_kokle', 'title', 'epic', 'std', 'Kokle Master'),
    _i('t_tram', 'title', 'epic', 'std', 'Last Tram'), _i('t_saule', 'title', 'legendary', 'std', 'Daughter of the Sun'),
    _i('t_lacplesis', 'title', 'legendary', 'std', 'Bearslayer'),
    _i('t_otaku', 'title', 'epic', 'anime', 'Otaku'), _i('t_senpai', 'title', 'legendary', 'anime', 'Senpai Noticed Me'),
    _i('t_chosen', 'title', 'secret', 'achv', 'The Chosen One'), _i('t_hider', 'title', 'epic', 'achv', 'Hider of Hiders'),
    _i('t_ghost', 'title', 'legendary', 'achv', 'Ghost Runner'), _i('t_collector', 'title', 'epic', 'achv', 'Collector'),
    # ---- avatar frames
    _i('f_plain', 'frame', 'common', 'base', 'Plain ring'),
    _i('f_petal', 'frame', 'rare', 'std', 'Petal ring'), _i('f_wave', 'frame', 'rare', 'std', 'Wave ring'),
    _i('f_ornament', 'frame', 'epic', 'std', 'Latvian ornament'), _i('f_neon', 'frame', 'epic', 'std', 'Neon ring'),
    _i('f_gold', 'frame', 'legendary', 'std', 'Gilded ring'), _i('f_prism', 'frame', 'mythic', 'achv', 'Prism ring'),
    _i('f_storm', 'frame', 'mythic', 'anime', 'Sakura storm'),
    # ---- mascot skins
    _i('s_peach', 'skin', 'common', 'base', 'Peach Mochi'),
    _i('s_mint', 'skin', 'rare', 'std', 'Mint Mochi'), _i('s_grape', 'skin', 'rare', 'std', 'Grape Mochi'), _i('s_sky', 'skin', 'rare', 'std', 'Sky Mochi'),
    _i('s_shadow', 'skin', 'epic', 'std', 'Shadow Mochi'), _i('s_gold', 'skin', 'legendary', 'std', 'Golden Mochi'),
    _i('s_rainbow', 'skin', 'secret', 'anime', 'Rainbow Mochi', 'It cycles through every colour.'),
    # ---- badges
    _i('b_star', 'badge', 'common', 'std', 'Star'), _i('b_leaf', 'badge', 'common', 'std', 'Leaf'), _i('b_flame', 'badge', 'rare', 'std', 'Flame'),
    _i('b_wave', 'badge', 'rare', 'std', 'Wave'), _i('b_crown', 'badge', 'epic', 'std', 'Crown'), _i('b_moon', 'badge', 'epic', 'std', 'Moon'),
    _i('b_comet', 'badge', 'legendary', 'std', 'Comet'), _i('b_sun', 'badge', 'legendary', 'std', 'Sun'),
    _i('b_void', 'badge', 'mythic', 'achv', 'Void'), _i('b_one', 'badge', 'secret', 'anime', 'One of One'),
    # ---- profile widgets
    _i('w_stats', 'widget', 'common', 'base', 'Stats'), _i('w_ach', 'widget', 'common', 'base', 'Achievements'), _i('w_collection', 'widget', 'common', 'base', 'Collection'),
    _i('w_streak', 'widget', 'rare', 'std', 'Login streak'), _i('w_timeline', 'widget', 'rare', 'std', 'Recent finds'),
    _i('w_cabinet', 'widget', 'epic', 'std', 'Trophy cabinet'), _i('w_rarest', 'widget', 'epic', 'std', 'Rarest finds'),
    _i('w_radar', 'widget', 'legendary', 'std', 'Luck radar', 'Shows your summon odds and pity counters.'),
]
BY_ID = {i['id']: i for i in ITEMS}
BASE = [i['id'] for i in ITEMS if i['pool'] == 'base']
POOLS = {p: [i for i in ITEMS if i['pool'] == p] for p in ('std', 'anime')}
THEMES = [i['id'] for i in ITEMS if i['kind'] == 'theme']
DEFAULT_EQUIP = {'theme': 'sakura', 'title': None, 'frame': 'f_plain', 'skin': 's_peach', 'badges': [], 'widgets': ['w_stats', 'w_ach', 'w_collection']}

# stardust per game event (capped per day, see accounts.py)
EVENT_DUST = {'tasks_done': 4, 'territories': 6, 'first_claims': 12, 'cards_played': 2, 'picks_taken': 1, 'questions_asked': 1, 'found': 8, 'tags_made': 8, 'dest_claims': 6, 'shop_buys': 2}
ACTION_STAT = {'complete_task': 'tasks_done', 'checkin': 'territories', 'play_card': 'cards_played', 'pick': 'picks_taken', 'ask': 'questions_asked',
               'found': 'found', 'tag': 'tags_made', 'claim_destination': 'dest_claims', 'buy': 'shop_buys', 'draw_keep': 'picks_taken'}

# ---- achievements: id, stat, goal, reward {dust, std, sakura, item}, texts {lang: (name, description)}
# stats are plain counters, except: modes (distinct game modes played), items (collection size), streak (best login streak),
# mythics / themes_owned (collection checks), secret (owns a secret item), night (actions between 00:00 and 04:00)
ACH = [
    ('first_steps', 'games_played', 1, {'dust': 50}, {'en': ('First Steps', 'Start your first game.'), 'lv': ('Pirmie soļi', 'Sāc savu pirmo spēli.'), 'ru': ('Первые шаги', 'Начните первую игру.')}),
    ('regular', 'games_played', 10, {'dust': 150, 'std': 1}, {'en': ('Regular', 'Play 10 games.'), 'lv': ('Pastāvīgais', 'Nospēlē 10 spēles.'), 'ru': ('Завсегдатай', 'Сыграйте 10 игр.')}),
    ('veteran', 'games_played', 50, {'dust': 600, 'sakura': 1, 'item': 't_wanderer'}, {'en': ('Veteran', 'Play 50 games.'), 'lv': ('Veterāns', 'Nospēlē 50 spēles.'), 'ru': ('Ветеран', 'Сыграйте 50 игр.')}),
    ('first_win', 'wins', 1, {'dust': 100}, {'en': ('Winner', 'Win a game.'), 'lv': ('Uzvarētājs', 'Uzvari spēlē.'), 'ru': ('Победитель', 'Выиграйте игру.')}),
    ('champion', 'wins', 5, {'dust': 300, 'std': 2}, {'en': ('Champion', 'Win 5 games.'), 'lv': ('Čempions', 'Uzvari 5 spēlēs.'), 'ru': ('Чемпион', 'Выиграйте 5 игр.')}),
    ('legend', 'wins', 25, {'dust': 1000, 'sakura': 2, 'item': 'f_gold'}, {'en': ('Living Legend', 'Win 25 games.'), 'lv': ('Dzīvā leģenda', 'Uzvari 25 spēlēs.'), 'ru': ('Живая легенда', 'Выиграйте 25 игр.')}),
    ('task_rookie', 'tasks_done', 5, {'dust': 60}, {'en': ('Task Rookie', 'Complete 5 tasks.'), 'lv': ('Uzdevumu jauniņais', 'Izpildi 5 uzdevumus.'), 'ru': ('Новичок заданий', 'Выполните 5 заданий.')}),
    ('task_master', 'tasks_done', 50, {'dust': 300, 'std': 2}, {'en': ('Task Master', 'Complete 50 tasks.'), 'lv': ('Uzdevumu meistars', 'Izpildi 50 uzdevumus.'), 'ru': ('Мастер заданий', 'Выполните 50 заданий.')}),
    ('task_legend', 'tasks_done', 250, {'dust': 900, 'sakura': 2}, {'en': ('Task Legend', 'Complete 250 tasks.'), 'lv': ('Uzdevumu leģenda', 'Izpildi 250 uzdevumus.'), 'ru': ('Легенда заданий', 'Выполните 250 заданий.')}),
    ('explorer', 'territories', 5, {'dust': 80}, {'en': ('Explorer', 'Leave 5 territories.'), 'lv': ('Pētnieks', 'Tiec ārā no 5 teritorijām.'), 'ru': ('Исследователь', 'Выйдите из 5 территорий.')}),
    ('pathfinder', 'territories', 25, {'dust': 400, 'std': 2, 'item': 't_tram'}, {'en': ('Pathfinder', 'Leave 25 territories.'), 'lv': ('Ceļu meklētājs', 'Tiec ārā no 25 teritorijām.'), 'ru': ('Следопыт', 'Выйдите из 25 территорий.')}),
    ('first_arrival', 'first_claims', 1, {'dust': 100}, {'en': ('First to Arrive', 'Be the first team out of a territory.'), 'lv': ('Pirmais klāt', 'Esi pirmā komanda, kas tiek ārā no teritorijas.'), 'ru': ('Первым на месте', 'Станьте первой командой, вышедшей из территории.')}),
    ('trailblazer', 'first_claims', 10, {'dust': 500, 'sakura': 1}, {'en': ('Trailblazer', 'Be first out of a territory 10 times.'), 'lv': ('Ceļa skaldītājs', 'Esi pirmais 10 teritorijās.'), 'ru': ('Первопроходец', 'Будьте первыми в 10 территориях.')}),
    ('card_shark', 'cards_played', 10, {'dust': 120}, {'en': ('Card Shark', 'Play 10 cards.'), 'lv': ('Kāršu haizivs', 'Izspēlē 10 kārtis.'), 'ru': ('Карточная акула', 'Сыграйте 10 карт.')}),
    ('card_baron', 'cards_played', 60, {'dust': 400, 'std': 2}, {'en': ('Card Baron', 'Play 60 cards.'), 'lv': ('Kāršu barons', 'Izspēlē 60 kārtis.'), 'ru': ('Карточный барон', 'Сыграйте 60 карт.')}),
    ('picker', 'picks_taken', 30, {'dust': 200}, {'en': ('Careful Picker', 'Take 30 card picks.'), 'lv': ('Rūpīgais izvēlētājs', 'Paņem 30 kāršu izvēles.'), 'ru': ('Внимательный выбор', 'Сделайте 30 выборов карт.')}),
    ('detective', 'questions_asked', 10, {'dust': 100}, {'en': ('Detective', 'Ask 10 questions as a seeker.'), 'lv': ('Detektīvs', 'Uzdod 10 jautājumus kā meklētājs.'), 'ru': ('Детектив', 'Задайте 10 вопросов как ищущий.')}),
    ('sherlock', 'questions_asked', 100, {'dust': 500, 'sakura': 1}, {'en': ('Sherlock', 'Ask 100 questions.'), 'lv': ('Šerloks', 'Uzdod 100 jautājumus.'), 'ru': ('Шерлок', 'Задайте 100 вопросов.')}),
    ('hunter', 'found', 5, {'dust': 150}, {'en': ('Hunter', 'Find the hider 5 times.'), 'lv': ('Mednieks', 'Atrodi slēpēju 5 reizes.'), 'ru': ('Охотник', 'Найдите прячущегося 5 раз.')}),
    ('tagger', 'tags_made', 5, {'dust': 100}, {'en': ('Tagger', 'Tag 5 teams.'), 'lv': ('Ķērājs', 'Noķer 5 komandas.'), 'ru': ('Салка', 'Осалите 5 команд.')}),
    ('tag_terror', 'tags_made', 30, {'dust': 450, 'std': 2}, {'en': ('Terror of the Streets', 'Tag 30 teams.'), 'lv': ('Ielu šausmas', 'Noķer 30 komandas.'), 'ru': ('Гроза улиц', 'Осалите 30 команд.')}),
    ('traveler', 'dest_claims', 5, {'dust': 100}, {'en': ('Traveler', 'Reach 5 destinations.'), 'lv': ('Ceļotājs', 'Sasniedz 5 mērķus.'), 'ru': ('Путешественник', 'Достигните 5 пунктов.')}),
    ('globetrotter', 'dest_claims', 40, {'dust': 500, 'sakura': 1}, {'en': ('Globetrotter', 'Reach 40 destinations.'), 'lv': ('Pasaules ceļotājs', 'Sasniedz 40 mērķus.'), 'ru': ('Глобтроттер', 'Достигните 40 пунктов.')}),
    ('shopper', 'shop_buys', 5, {'dust': 80}, {'en': ('Shopper', 'Buy 5 things in the shop.'), 'lv': ('Pircējs', 'Nopērc 5 lietas veikalā.'), 'ru': ('Покупатель', 'Купите 5 вещей в магазине.')}),
    ('all_modes', 'modes', 3, {'dust': 300, 'sakura': 1}, {'en': ('All Rounder', 'Play Race, Hide & Seek and Tag.'), 'lv': ('Visu prasmju meistars', 'Nospēlē Race, Hide & Seek un Tag.'), 'ru': ('Универсал', 'Сыграйте в Race, Hide & Seek и Tag.')}),
    ('streak3', 'streak', 3, {'dust': 60}, {'en': ('Warming Up', 'Log in 3 days in a row.'), 'lv': ('Iesilšanās', 'Pieslēdzies 3 dienas pēc kārtas.'), 'ru': ('Разогрев', 'Заходите 3 дня подряд.')}),
    ('streak7', 'streak', 7, {'dust': 200, 'std': 1}, {'en': ('Weekly Habit', 'Log in 7 days in a row.'), 'lv': ('Nedēļas ieradums', 'Pieslēdzies 7 dienas pēc kārtas.'), 'ru': ('Недельная привычка', 'Заходите 7 дней подряд.')}),
    ('streak30', 'streak', 30, {'dust': 900, 'sakura': 2, 'item': 'b_void'}, {'en': ('Unbreakable', 'Log in 30 days in a row.'), 'lv': ('Nesalaužamais', 'Pieslēdzies 30 dienas pēc kārtas.'), 'ru': ('Несокрушимый', 'Заходите 30 дней подряд.')}),
    ('collector', 'items', 15, {'dust': 200, 'item': 't_collector'}, {'en': ('Collector', 'Own 15 collectibles.'), 'lv': ('Kolekcionārs', 'Savāc 15 priekšmetus.'), 'ru': ('Коллекционер', 'Соберите 15 предметов.')}),
    ('hoarder', 'items', 40, {'dust': 800, 'sakura': 2}, {'en': ('Dragon Hoard', 'Own 40 collectibles.'), 'lv': ('Pūķa krājums', 'Savāc 40 priekšmetus.'), 'ru': ('Сокровища дракона', 'Соберите 40 предметов.')}),
    ('mythic', 'mythics', 1, {'dust': 500, 'item': 'f_prism'}, {'en': ('Mythic Find', 'Obtain a mythic item.'), 'lv': ('Mītisks atradums', 'Iegūsti mītisku priekšmetu.'), 'ru': ('Мифическая находка', 'Получите мифический предмет.')}),
    ('all_themes', 'themes_owned', 6, {'dust': 700, 'sakura': 1}, {'en': ('Wardrobe', 'Own every theme.'), 'lv': ('Garderobe', 'Savāc visas tēmas.'), 'ru': ('Гардероб', 'Соберите все темы.')}),
    ('night_owl', 'night', 5, {'dust': 120, 'item': 't_ghost'}, {'en': ('Night Owl', 'Play 5 actions between midnight and 4 am.'), 'lv': ('Naktssikspārnis', 'Veic 5 darbības starp pusnakti un 4:00.'), 'ru': ('Ночная сова', 'Сделайте 5 действий между полуночью и 4:00.')}),
    ('lucky', 'encounters', 1, {'dust': 300, 'item': 't_chosen'}, {'en': ('Lucky Star', 'Meet a rare encounter during a game.'), 'lv': ('Laimes zvaigzne', 'Sastop retu notikumu spēles laikā.'), 'ru': ('Счастливая звезда', 'Встретьте редкое событие во время игры.')}),
    ('secret', 'secret', 1, {'dust': 2000, 'sakura': 3, 'item': 't_hider'}, {'en': ('Beyond Rare', 'Own a secret item.'), 'lv': ('Pāri retumam', 'Iegūsti slepenu priekšmetu.'), 'ru': ('Реже не бывает', 'Получите секретный предмет.')}),
]
ACH_BY_ID = {a[0]: a for a in ACH}
RARE_ENCOUNTER_CHANCE = 1 / 900  # per counted game action


def catalog():
    return {
        'rarities': RARITIES, 'shards': SHARDS, 'items': ITEMS, 'base': BASE, 'stdCost': STD_COST, 'animeCost': ANIME_COST,
        'weights': {'std': STD_WEIGHTS, 'anime': ANIME_WEIGHTS},
        'ach': [{'id': a[0], 'stat': a[1], 'goal': a[2], 'reward': a[3], 'tr': {l: {'name': v[0], 'desc': v[1]} for l, v in a[4].items()}} for a in ACH],
    }
