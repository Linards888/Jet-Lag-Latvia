"""Cards (bonuses / curses) and tasks: effect catalogue, defaults and validation.

Admins can add, edit and remove cards and tasks per game. A card is
    {id, name, desc, weight, effect: {type, ...params}}
`weight` is the rarity (higher = drawn more often). Card instances copy the whole definition, so deleting a
definition never breaks a team's inventory.
"""
import random

import core
from core import GameError

# effect type -> spec. params: name -> (min, max, default).  target: needs another team.  passive: cannot be played.
RACE_EFFECTS = {
    'time_bonus': {'label': 'Time bonus (minutes off your time)', 'params': {'min': (1, 180, 15)}, 'target': False},
    'time_penalty': {'label': 'Time penalty for another team', 'params': {'min': (1, 180, 20)}, 'target': True},
    'freeze': {'label': 'Freeze another team (no check-in / finish)', 'params': {'min': (1, 180, 20)}, 'target': True},
    'skip_free': {'label': 'Skip a task without penalty', 'params': {}, 'target': False},
    'extra_picks': {'label': 'Extra card picks', 'params': {'n': (1, 4, 1)}, 'target': False},
    'steal': {'label': 'Steal a random card from another team', 'params': {}, 'target': True},
    'spy': {'label': 'See all teams live for a while', 'params': {'min': (1, 60, 10)}, 'target': False},
    'shield': {'label': 'Shield (blocks the next hostile card)', 'params': {}, 'target': False, 'passive': True},
    'text': {'label': 'Custom text (announced to everyone)', 'params': {}, 'target': False, 'optional_target': True},
}
HIDE_EFFECTS = {
    'time_bonus': {'label': 'Time bonus (counts at the end of the round)', 'params': {'min': (1, 180, 10)}, 'passive': True},
    'veto': {'label': 'Veto the question just asked', 'params': {}},
    'randomize': {'label': 'Replace the question with another one', 'params': {}},
    'question_lock': {'label': 'Seekers cannot ask for a while', 'params': {'min': (1, 60, 10)}},
    'hand_size': {'label': 'Bigger hand for this round', 'params': {'n': (1, 4, 1)}},
    'discard_draw': {'label': 'Discard 1 card, draw new ones', 'params': {'draw': (2, 5, 2)}},
    'text': {'label': 'Custom curse (announced to seekers)', 'params': {}},
}
EFFECTS = {'race': RACE_EFFECTS, 'hide': HIDE_EFFECTS}

# hide & seek: how many cards the hider draws / may keep per question category
DRAW = {'radar': (2, 1), 'thermo': (2, 1), 'matching': (3, 1), 'measuring': (3, 1), 'tentacles': (4, 2), 'photo': (1, 1)}


def _c(i, name, desc, weight, typ, **params):
    e = {'type': typ}
    e.update(params)
    return {'id': i, 'name': name, 'desc': desc, 'weight': weight, 'effect': e}


DEFAULT_RACE_CARDS = [
    _c('rc01', 'Pīrāgu pauze', 'Atņem savai komandai 10 minūtes no laika.', 5, 'time_bonus', min=10),
    _c('rc02', 'Rupjmaizes spēks', 'Atņem savai komandai 20 minūtes no laika.', 3, 'time_bonus', min=20),
    _c('rc03', 'Zelta saule', 'Atņem savai komandai 45 minūtes no laika.', 1, 'time_bonus', min=45),
    _c('rc04', 'Raganas slota', 'Izvēlētajai komandai tiek pieskaitītas 15 minūtes.', 3, 'time_penalty', min=15),
    _c('rc05', 'Pērkona negaiss', 'Izvēlētajai komandai tiek pieskaitītas 30 minūtes.', 1, 'time_penalty', min=30),
    _c('rc06', 'Miglas aizsegs', 'Izvēlētā komanda 15 minūtes nevar reģistrēties pilsētā vai finišēt.', 3, 'freeze', min=15),
    _c('rc07', 'Sals', 'Izvēlētā komanda 30 minūtes nevar reģistrēties pilsētā vai finišēt.', 1, 'freeze', min=30),
    _c('rc08', 'Lapsas gājiens', 'Izlaid vienu uzdevumu bez soda. Tas tāpat skaitās kā izpildīts.', 3, 'skip_free'),
    _c('rc09', 'Laimes kurpīte', 'Uzreiz saņem vēl vienu kārts izvēli.', 3, 'extra_picks', n=1),
    _c('rc10', 'Zaglēna roka', 'Nozādz nejaušu kārti no izvēlētās komandas.', 2, 'steal'),
    _c('rc11', 'Putna skatiens', '10 minūtes redzi visu komandu atrašanās vietu.', 3, 'spy', min=10),
    _c('rc12', 'Ozollapu vainags', 'Automātiski bloķē nākamo pret tevi vērsto kārti.', 3, 'shield'),
    _c('rc13', 'Dainu pavēle', 'Izvēlētajai komandai pirms nākamās reģistrēšanās publiski jānodzied vismaz viena rinda no latviešu tautasdziesmas.', 2, 'text', target=True),
    _c('rc14', 'Zaļumballes izaicinājums', 'Izvēlētajai komandai jāuzdejo 20 sekundes publiskā vietā, netraucējot citiem.', 2, 'text', target=True),
    _c('rc15', 'Līgo!', 'Visa tava komanda nākamās 10 minūtes sasveicinās ar “Līgo!”. Tikai jautrībai.', 2, 'text', target=False),
]

DEFAULT_HIDE_CARDS = [
    _c('hc01', 'Pīrāga kumoss', 'Ja šī kārts ir rokā raunda beigās, tavs laiks palielinās par 5 minūtēm.', 5, 'time_bonus', min=5),
    _c('hc02', 'Rupjmaizes šķēle', 'Ja šī kārts ir rokā raunda beigās, tavs laiks palielinās par 10 minūtēm.', 4, 'time_bonus', min=10),
    _c('hc03', 'Kliņģeris', 'Ja šī kārts ir rokā raunda beigās, tavs laiks palielinās par 15 minūtēm.', 3, 'time_bonus', min=15),
    _c('hc04', 'Sklandrausis', 'Ja šī kārts ir rokā raunda beigās, tavs laiks palielinās par 25 minūtēm.', 2, 'time_bonus', min=25),
    _c('hc05', 'Zelta rudzi', 'Ja šī kārts ir rokā raunda beigās, tavs laiks palielinās par 40 minūtēm.', 1, 'time_bonus', min=40),
    _c('hc06', 'Nē, paldies', 'Atceļ tikko uzdoto jautājumu. Atbilde netiek parādīta, un jautājumu vairs nevar uzdot.', 2, 'veto'),
    _c('hc07', 'Kārtu jaukšana', 'Tikko uzdotais jautājums tiek aizstāts ar citu tās pašas kategorijas jautājumu.', 2, 'randomize'),
    _c('hc08', 'Miglas aizsegs', 'Meklētāji 10 minūtes nevar uzdot jautājumus.', 2, 'question_lock', min=10),
    _c('hc09', 'Biezā migla', 'Meklētāji 20 minūtes nevar uzdot jautājumus.', 1, 'question_lock', min=20),
    _c('hc10', 'Plašāka kabata', 'Roku limits šim raundam palielinās par 1.', 2, 'hand_size', n=1),
    _c('hc11', 'Maiņa', 'Izmet vienu kārti un velc divas jaunas.', 2, 'discard_draw', draw=2),
    _c('hc12', 'Līgo!', 'Katram meklētājam nākamo 10 minūšu laikā jāsasveicinās ar vismaz vienu svešinieku vārdiem “Līgo!”.', 2, 'text'),
    _c('hc13', 'Dainu pārbaude', 'Meklētājiem pirms nākamā jautājuma jānodzied rinda no latviešu tautasdziesmas.', 2, 'text'),
    _c('hc14', 'Rūķu solis', 'Meklētājiem nākamos 100 soļus jāiet mazos rūķa soļos.', 1, 'text'),
]


def _t(i, diff, title, desc):
    return {'id': i, 'difficulty': diff, 'title': title, 'desc': desc}


DEFAULT_TASKS = [
    # ---- 1 (1 card pick)
    _t('t01', 1, 'Karoga krāsas', 'Atrodiet jebko karmīnsarkanā un baltā krāsā (Latvijas karoga krāsas): krūzi, jaku, ielas zīmi, ziedu. Nofotografējieties ar to visi komandas dalībnieki. Kadrā jābūt redzamam gan priekšmetam, gan visai komandai.'),
    _t('t02', 1, 'Pilsētas vārds', 'Atrodiet pilsētas vai pagasta nosaukuma zīmi (ceļa zīme, stacijas ēka, ielas stends). Visa komanda nofotografējas blakus tā, lai nosaukums ir skaidri salasāms.'),
    _t('t03', 1, 'Ozols', 'Ozols ir latviešu svētais koks. Atrodiet ozolu (pazīsiet pēc ieliektajām lapām un zīlēm) un visi komandas dalībnieki tam pieskaras. Foto: koks un visa komanda. Ja ozola nav, der bērzs vai liepa, bet piezīmē uzrakstiet, kāds koks tas ir.'),
    _t('t04', 1, 'Kefīrs un sula', 'Veikalā nopērciet jebkuru Latvijā ražotu dzērienu (kefīrs, sula, bezalkoholisks kvass). Foto: visa komanda ar dzērienu un čeku.'),
    _t('t05', 1, 'Baznīcas tornis', 'Atrodiet baznīcas vai zvanu torni. Nofotografējiet visu komandu tā, lai tornis ir redzams aiz muguras.'),
    _t('t06', 1, 'Pieturas zīme', 'Nofotografējiet komandu pie sabiedriskā transporta pieturas vai stacijas nosaukuma. Kadrā jābūt redzamam transporta līdzeklim vai sliedēm.'),
    # ---- 2 (2 card picks)
    _t('t07', 2, 'Rupjmaize', 'Latviešu rupjmaize ir svēta lieta. Nopērciet šķēli vai klaipu, katrs komandas dalībnieks nokož gabaliņu. Foto: komanda ar iekostu maizi un čeku.'),
    _t('t08', 2, 'Speķa pīrāgi', 'Nopērciet speķa pīrāgus (var dalīt uz pusēm). Foto: visa komanda ar pīrāgiem rokās.'),
    _t('t09', 2, 'Pūt, vējiņi', 'Nodziediet kopā pirmo pantu no “Pūt, vējiņi” vai citas latviešu tautasdziesmas, vismaz 20 sekundes un skaļi. Foto dziedot; piezīmē ierakstiet, kuru dziesmu dziedājāt.'),
    _t('t10', 2, 'Tirgus laime', 'Apmeklējiet tirgu vai tirdziņu. Nopērciet kaut ko vietēju par ne vairāk kā 2 eiro (ābols, medus, siers, burkāni). Foto: prece, cenas zīme un komanda.'),
    _t('t11', 2, 'Veca ēka', 'Atrodiet ēku, kurai ir vismaz 100 gadu (gadskaitlis uz fasādes vai informācijas plāksne). Foto: komanda un gadskaitlis vienā kadrā.'),
    _t('t12', 2, 'Karogs vējā', 'Atrodiet Latvijas karogu, kas plīvo. Visa komanda ar rokām atdarina karoga viļņošanos. Foto kopā ar karogu.'),
    # ---- 3 (3 card picks)
    _t('t13', 3, 'Jāņu vainags', 'Savijiet vainagu no pļavas ziediem vai lapām (nelauziet aizsargājamus augus un neplūkājiet svešus dārzus!). Katrs komandas dalībnieks uzliek savu vainagu. Foto: visi ar vainagiem.'),
    _t('t14', 3, 'Dainas vārdi', 'Pieklājīgi pajautājiet vietējam iedzīvotājam, vai viņš zina kādu dainu, tautasdziesmu vai sakāmvārdu. Pierakstiet to piezīmē. Foto ar cilvēku (tikai ar viņa atļauju) vai ar pierakstu.'),
    _t('t15', 3, 'Latviešu saldumi', 'Nogaršojiet tradicionālu latvisku kārumu (sklandrausis, kliņģeris, Rīgas torte, “Gotiņa”, Jāņu siers). Foto: visa komanda ar kārumu.'),
    _t('t16', 3, 'Latvju zīme', 'Atrodiet latviešu ornamenta zīmi (Auseklis, Saulīte, Mārtiņa roze, Jumis, Lielvārdes josta) uz ēkas, suvenīriem vai apģērba. Foto ar zīmi; piezīmē uzrakstiet, kā tā saucas.'),
    _t('t17', 3, 'Pieminekļa poza', 'Atrodiet pieminekli vai skulptūru. Visa komanda atdarina tā pozu. Foto, kur redzams gan piemineklis, gan jūsu poza.'),
    _t('t18', 3, 'Vietas vēsture', 'Atrodiet informācijas stendu par vietas vēsturi. Foto ar stendu un komandu; piezīmē uzrakstiet vienu faktu, ko uzzinājāt.'),
    # ---- 4 (4 card picks)
    _t('t19', 4, 'Dūraiņu raksts', 'Atrodiet tirdziņa galdu vai veikalu ar adītiem dūraiņiem vai zeķēm ar latviešu rakstiem. Foto: komanda blakus dūraiņiem ar cenas zīmi; piezīmē aprakstiet rakstu.'),
    _t('t20', 4, 'Zaļumballe', 'Publiskā vietā (netraucējot garāmgājējiem) uzdejojiet 30 sekunžu polku vai apli. Foto dejas vidū, visi dalībnieki kustībā.'),
    _t('t21', 4, 'Vietējais sveiciens', 'Uzziniet no diviem vietējiem, kā šajā novadā (kurzemnieku, latgaliešu, zemgaliešu vai vidzemnieku izloksne) saka “labdien” vai citu vārdu. Piezīmē ierakstiet vārdus un kur tos uzzinājāt. Foto ar komandu.'),
    _t('t22', 4, 'Ķekatas', 'Ķekatas ir maskās tērpti ziemas dziesminieki. Izgatavojiet maskas no tā, ko atrodat apkārt (papīrs, salvetes, lapas) un nofotografējieties maskās. Neko neplēsiet nost no augiem.'),
    _t('t23', 4, 'Latviešu pikniks', 'Veikalā par ne vairāk kā 5 eiro kopā nopērciet rupjmaizi, sieru un dārzeņus un pagatavojiet sviestmaizes visiem. Foto: sviestmaizes ar komandu un čeks.'),
    _t('t24', 4, 'Latvijas zīmoli', 'Veikalā atrodiet 5 latviešu ražotus produktus (Laima, Spilva, Selga, Gutta, Smiltenes piens u.c.), salieciet tos kopā un nofotografējiet ar komandu. Piezīmē uzrakstiet zīmolus.'),
    # ---- 5 (5 card picks)
    _t('t25', 5, 'Tautas tērps', 'Atrodiet tautastērpu (muzejā, veikala skatlogā, suvenīros vai uz cilvēka) un uzziniet, no kura novada tas ir. Foto ar tērpu; piezīmē uzrakstiet novadu un vienu detaļu (josta, villaine, sakta).'),
    _t('t26', 5, 'Vecākais koks vai ēka', 'Pajautājiet vietējiem vai atrodiet informāciju, kurš ir vecākais koks vai vecākā ēka šajā pilsētā. Aizejiet pie tā. Foto ar komandu; piezīmē uzrakstiet vecumu.'),
    _t('t27', 5, 'Latviešu pusdienas', 'Paēdiet vienu vietējo latvisku ēdienu (pelēkie zirņi ar speķi, rasols, kāpostu zupa) kādā ēstuvē. Foto: komanda ar ēdieniem un čeks.'),
    _t('t28', 5, 'Intervija', 'Pajautājiet trim vietējiem: “Kāpēc ir vērts apmeklēt šo pilsētu?” (ar viņu atļauju). Pierakstiet atbildes piezīmē. Foto ar vienu no cilvēkiem.'),
    _t('t29', 5, 'Mazā daina', 'Sacerējiet četru rindu dziesmiņu (dainu) par šo pilsētu ar atskaņu. Pierakstiet to piezīmē un nolasiet skaļi pilsētas centrā. Foto lasīšanas laikā.'),
    _t('t30', 5, 'Amatnieks', 'Atrodiet amatnieku vai vietējo ražotāju (keramiķis, maiznieks, medus tirgotājs, audēja) un uzziniet, kas viņa darbā ir tipiski latvisks. Foto ar cilvēku (ar atļauju); piezīmē viena atziņa.'),
    # ---- 6 (6 card picks)
    _t('t31', 6, 'Līgo vakars', 'Katram vainags no ziediem vai lapām, visi kopā nodzied “Līgo” piedziedājumu vismaz 10 sekundes un kopā apēdiet gabalu siera ar ķimenēm vai cita latviska siera. Foto: visi ar vainagiem un sieru. Piezīmē ierakstiet dziesmas pirmo rindu.'),
    _t('t32', 6, 'Trīs zīmes', 'Atrodiet trīs dažādas latvju zīmes (Auseklis, Saulīte, Jumis, Mārtiņa roze). Katrs komandas dalībnieks uzzīmē vienu uz papīra. Foto: lapa ar zīmēm un komanda; piezīmē nosauciet zīmes un kur tās redzējāt.'),
    _t('t33', 6, 'Lāčplēša izrāde', 'Visa komanda atveido 60 sekunžu minilugu par Lāčplēsi un Melno bruņinieku sabiedriskā vietā, netraucējot citiem. Foto izrādes laikā; piezīmē uzrakstiet lomas.'),
    _t('t34', 6, 'Maizes maratons', 'Nogaršojiet trīs dažādus maizes izstrādājumus no trim dažādiem veikaliem un sarindojiet tos. Kopā ne vairāk kā 6 eiro. Foto: trīs izstrādājumi ar jūsu vērtējuma lapu; piezīmē reitings.'),
    _t('t35', 6, 'Teika no vietas', 'Uzziniet vietējo teiku, leģendu vai stāstu par šo vietu (no cilvēkiem, bibliotēkā vai informācijas centrā). Pierakstiet to piezīmē 3-5 teikumos. Foto ar cilvēku vai vietu, kur stāsts norisinās.'),
    _t('t36', 6, 'Augstākais punkts', 'Atrodiet augstāko publiski pieejamo un drošo punktu pilsētā (skatu tornis, kalns, tilts, kāpas). Foto no augšas ar visu komandu un skatu aiz muguras. Droši! Nekāpiet uz norobežotām vietām.'),
]


def default_cards(mode):
    return [dict(c, effect=dict(c['effect'])) for c in (DEFAULT_RACE_CARDS if mode == 'race' else DEFAULT_HIDE_CARDS)]


def default_tasks():
    return [dict(t) for t in DEFAULT_TASKS]


def effects_public():
    out = {}
    for mode, eff in EFFECTS.items():
        out[mode] = {k: {'label': v['label'], 'params': {p: list(r) for p, r in v['params'].items()},
                         'target': bool(v.get('target')), 'optionalTarget': bool(v.get('optional_target')), 'passive': bool(v.get('passive'))}
                     for k, v in eff.items()}
    return out


# ---------------------------------------------------------------- validation
def _clamp(v, lo, hi, dflt):
    try:
        return max(lo, min(hi, int(float(v))))
    except (TypeError, ValueError):
        return dflt


def clean_card(mode, c):
    eff = EFFECTS[mode]
    e = c.get('effect') or {}
    typ = e.get('type')
    if typ not in eff:
        raise GameError('Unknown card effect')
    name = str(c.get('name') or '').replace('<', '').replace('>', '').strip()[:40]
    if len(name) < 2:
        raise GameError('Every card needs a name')
    out = {'type': typ}
    for p, (lo, hi, dflt) in eff[typ]['params'].items():
        out[p] = _clamp(e.get(p, dflt), lo, hi, dflt)
    if typ == 'text' and mode == 'race':
        out['target'] = bool(e.get('target'))
    cid = str(c.get('id') or '')
    if not cid or len(cid) > 16 or not cid.replace('_', '').isalnum():
        cid = 'c' + core.new_id(3)
    return {'id': cid, 'name': name, 'desc': str(c.get('desc') or '').replace('<', '').replace('>', '').strip()[:240],
            'weight': _clamp(c.get('weight', 3), 1, 8, 3), 'effect': out}


def clean_cards(mode, items):
    if not isinstance(items, list) or len(items) > 80:
        raise GameError('Too many cards (max 80)')
    out, seen = [], set()
    for c in items:
        c = clean_card(mode, c)
        while c['id'] in seen:
            c['id'] = 'c' + core.new_id(3)
        seen.add(c['id'])
        out.append(c)
    return out


def clean_tasks(items):
    if not isinstance(items, list) or len(items) > 120:
        raise GameError('Too many tasks (max 120)')
    out, seen = [], set()
    for t in items:
        title = str(t.get('title') or '').replace('<', '').replace('>', '').strip()[:60]
        if len(title) < 2:
            raise GameError('Every task needs a title')
        tid = str(t.get('id') or '')
        if not tid or len(tid) > 16 or not tid.replace('_', '').isalnum() or tid in seen:
            tid = 't' + core.new_id(3)
        seen.add(tid)
        out.append({'id': tid, 'title': title, 'desc': str(t.get('desc') or '').replace('<', '').replace('>', '').strip()[:600],
                    'difficulty': _clamp(t.get('difficulty', 1), 1, 6, 1)})
    return out


# ---------------------------------------------------------------- drawing
def draw(cards, n):
    """n distinct cards by weight (with repeats only if the catalogue is smaller than n). Returns copies."""
    pool = list(cards)
    out = []
    while pool and len(out) < n:
        c = random.choices(pool, weights=[x['weight'] for x in pool])[0]
        pool.remove(c)
        out.append(c)
    while cards and len(out) < n:
        out.append(random.choice(cards))
    return [dict(c, effect=dict(c['effect'])) for c in out]
