# Jet Lag Latvija

Spēles, kas iedvesmotas no **Jet Lag: The Game**, bet pielāgotas Latvijai: tramvaji, vilcieni, autobusi, pilsētas, tautasdziesmas un pīrāgi. Viena mājaslapa, trīs spēles, strādā jebkura telefona pārlūkā.

| Spēle | Īsumā | Ilgums |
|---|---|---|
| **Race Across Latvia** | Komandas sacenšas no rietumiem uz austrumiem, ieņem teritorijas, pilda latviskus uzdevumus un vāc kartiņas | 3-10 dienas |
| **Hide & Seek Across Latvia** | Viens slēpjas, pārējie uzdod jautājumus. Serveris atbild pēc slēpēja īstās GPS atrašanās vietas | pa raundam dienā (3 spēlētāji × 2 = 6 dienas) |
| **Tag Across Latvia** | Viena komanda ir "IT" un ķer citas. Pēc izvēles All-Stars spējas | 1-14 spēles dienas |

> **Uzstādīšana uz Raspberry Pi:** skatīt [README-RPI.md](README-RPI.md). Šis fails ir par pašu spēli.

---

## Saturs

1. [Ātrā sākšana](#ātrā-sākšana)
2. [Kā pieslēgties spēlei](#kā-pieslēgties-spēlei)
3. [Lomas un admin režīmi](#lomas-un-admin-režīmi)
4. [Lobby: komandas un iestatījumi](#lobby-komandas-un-iestatījumi)
5. [Race](#race-across-latvia)
6. [Hide & Seek](#hide--seek-across-latvia)
7. [Tag](#tag-across-latvia)
8. [Savas kartiņas un uzdevumi](#savas-kartiņas-un-uzdevumi)
9. [Izskats, tēmas un paziņojumi](#izskats-tēmas-un-paziņojumi)
10. [Padomi un ierobežojumi](#padomi-un-ierobežojumi)
11. [Izstrādātājiem](#izstrādātājiem)

---

## Ātrā sākšana

**Kā host (spēles veidotājs):**

1. Atver spēles adresi (piemēram `https://tavs-pi.tailXXXX.ts.net`).
2. Nospied **Create a game**.
3. Izvēlies spēli (Race / Hide & Seek / Tag).
4. Ieraksti savu vārdu un PIN (4-8 cipari). Ja arī pats gribi spēlēt, atstāj ieslēgtu **I also play**.
5. Nospied **Create game**. Parādīsies:
   * **Spēles kods** (5 burti), kuru dod draugiem
   * **Admin atslēga**. Tā tiek rādīta **tikai vienreiz**, uzraksti to. Tā ir vienīgais veids, kā kļūt par adminu citā ierīcē.
6. Atver **lobby**, iestati noteikumus, pagaidi, kamēr visi pievienojas, un nospied **Start the game**.

## Kā pieslēgties spēlei

1. Atver to pašu adresi un nospied **Join with a code** (vai atver draugu atsūtīto uzaicinājuma saiti `.../#/join/ABCDE`).
2. Ieraksti kodu un nospied **Find**.
3. Cilnē **New here** ieraksti vārdu, izvēlies PIN un lomu:
   * **Player**: tu spēlē. Pievienoties kā spēlētājs var tikai pirms spēles sākuma.
   * **Spectator**: tu tikai skaties. Spektatori nekad neredz noslēpumus.
4. **Pazaudēji telefonu vai aizvēri lapu?** Join → **Get back in** un ieraksti savu vārdu un PIN.
5. **Admins citā ierīcē:** Join → **Admin** un ieraksti admin atslēgu. Vecā admina sesija tiek atslēgta, tāpēc adminu vienmēr ir tieši viens.

Spēlē jāļauj **atrašanās vieta (GPS)**. Augšā redzēsi `GPS 12 m` (precizitāte). Atver spēli ar ieslēgtu ekrānu un neaizver lapu, jo pārlūks fonā GPS nesūta.

---

## Lomas un admin režīmi

Katrā spēlē ir **tieši viens admins**. Lai admins neizdara kaut ko nejauši vai nepamana to, ko nedrīkst, viņš var pārslēgties starp trim režīmiem (poga augšā labajā pusē, atver logu "Admin mode"):

| Režīms | Ko drīkst | Ko redz |
|---|---|---|
| **Player** | Spēlē kā parasts spēlētājs. **Visas admina pogas ir bloķētas**, tāpēc nevar nejauši neko nospiest. | Tikai to, ko redz parasts spēlētājs |
| **Admin** | Visas admina iespējas: sākt, pauzēt, beigt, paziņojumi, kartiņu un uzdevumu rediģēšana, vērtēšana, koriģēšana | Tikai to, ko redzētu spēlētājs vai skatītājs. **Neredz citu komandu informāciju** |
| **Admin (all-seeing)** | Viss, ko var "Admin" | **Pilnīgi visu**: visu komandu atrašanās vietas, slēpēja pozīciju, visas kartiņas |

Noteikumi:

* Ja admins **nespēlē** (nav ielikts "I also play"), pēc noklusējuma ir *all-seeing*. Režīms *Player* nav pieejams.
* Ja admins **spēlē**, pēc noklusējuma ir *Admin*. *All-seeing* šādam adminam ir bloķēts, kamēr spēle notiek (citādi viņš redzētu slēpēja vietu). Lobby un spēles beigās to var ieslēgt.
* Katra režīma maiņa tiek ierakstīta notikumu žurnālā (Log).
* Parasti spēlētāji **neredz žurnālu**. **Log** cilne ir tikai adminam. Spēlētāji redz īsus paziņojumus ekrāna augšā (kad izspēlēta kartiņa, ir atbilde u.tml.).
* Admins, kas spēlē, **nevar vērtēt savas komandas uzdevumus** un nevar koriģēt savas komandas laiku.

Papildu drošība: atbildes uz Hide & Seek jautājumiem rēķina serveris; nepareizi ievadītus PIN un admin atslēgas serveris uz laiku bloķē; notikumu žurnāls ir "ķēdē" (katrs ieraksts satur iepriekšējā ieraksta kontrolsummu), tāpēc vēsturi nevar nemanāmi mainīt. Atrašanās vietas viltošanu telefonā (GPS spoofing) neviena sistēma nevar pilnībā novērst, tāpēc spēle balstās uz draugu godaprātu. Ātrums virs 140 km/h tiek atzīmēts adminam kā iespējama braukšana ar auto.

---

## Lobby: komandas un iestatījumi

**Komandas (Race un Tag):** katrs izveido savu komandu (nosaukums + krāsa) vai pievienojas esošai (līdz 4 cilvēkiem komandā). Admins var pārvietot cilvēkus. Hide & Seek komandu nav, spēlē katrs par sevi.

**Iestatījumi (tikai admins, nospied Edit pie "Game settings"):**

* *Race:* starta un finiša pilsēta, cik reģistrēšanās vajag katrā teritorijā, reģistrēšanās rādiuss, bonusi un sodi, dienas spēles logs, teritoriju krāsošana, uzdevumi un kartiņas
* *Hide & Seek:* cik reižu katrs slēpjas, **slēpšanās laiks**, zonas rādiuss, jautājumu atkārtošanās pauze, slēpēja reakcijas laiks, roku limits, sods par iziešanu no zonas
* *Tag:* spēles garums, **Tagger cooldown**, vai skrējēji redz IT, dienas logs, All-Stars

Kad viss gatavs, nospied **Start the game**. Pēc starta komandas un iestatījumi vairs nemainās (kartiņas un uzdevumus admins var mainīt arī spēles laikā).

---

## Race Across Latvia

### Ideja

Komandas ar **sabiedrisko transportu** (vilciens, tramvajs, autobuss, kājām; bez auto un taksometra) sacenšas, kura pirmā iziet cauri visām Latvijas **teritorijām** un nonāk finišā. Spēles laiks skrien tikai **dienas spēles logā** (piemēram 08:00-21:00), naktī visi atpūšas.

### Teritorijas un "vai pilsēta ir iekšā?"

Latvija ir sadalīta krāsainās teritorijās (pēc noklusējuma Kurzeme, Zemgale un Sēlija, Rīga un Pierīga, Vidzeme, Latgale). Teritorijas sastāv no **oficiālajām Latvijas administratīvajām teritorijām** (novadiem un valstspilsētām). Lobby admins var:

* izvēlēties otu un **nokrāsot novadus** uz kartes, lai pārbīdītu robežas
* pārdēvēt, pārkrāsot un pārkārtot teritorijas, pievienot jaunas
* ieslēgt un izslēgt atsevišķas pilsētas kā kontrolpunktus

Spēles laikā **Map** cilnē:

* katra pilsēta ir krāsota savas teritorijas krāsā, un tās uznirstošajā logā rakstīts *"Inside Zemgale: open to you / locked"*
* ir meklēšanas lauks **Inside or outside?**: ieraksti pilsētu un uzreiz redzi tās teritoriju
* ja ir GPS, redzi, kurā novadā un teritorijā tu atrodies

### Kā virzīties uz priekšu

1. Savā **pašreizējā teritorijā** dodies uz pilsētu un spied **Check in**. Telefona GPS jābūt tuvu pilsētas centram (rādiuss iestatāms).
2. Pēc reģistrēšanās **izvēlies uzdevumu** (skatīt zemāk), izpildi to un augšupielādē foto kā pierādījumu.
3. Pierādījumu apstiprina **citas komandas** (vai neitrāls admins). Tikai tad tas dod atlīdzību.
4. Kad teritorijā ir pietiekami daudz reģistrēšanos, tā ir **iekarota**. Ja ieslēgts "Territories open in order", atveras nākamā. **Pirmā komanda, kas iekaro teritoriju, saņem laika bonusu.**
5. Kad iekarotas visas teritorijas, ej uz **finiša pilsētu** un spied **Finish the race**.

### Uzdevumi (Tasks)

* Tabā **Tasks** ir redzams viss saraksts, sakārtots pēc grūtības no **1 (viegli)** līdz **6 (grūti)**. Nospied uzdevumu, lai atvērtu **precīzu aprakstu, kā to izdarīt**.
* Uzdevumi ir latviski un ar latvisku noskaņu: ozols, rupjmaize, speķa pīrāgi, Jāņu vainags, dainas, latvju zīmes, tautastērpi, Lāčplēsis, ķekatas un citi.
* **Uzdevuma grūtība = kartiņu izvēļu skaits.** Grūtības 1 uzdevums dod 1 izvēli, grūtības 6 dod 6 izvēles.
* Katrai reģistrēšanās pilsētā jāizpilda **viens** uzdevums (tu pats izvēlies, kuru). Vari to arī izlaist pret **laika sodu**.
* Papildus var izpildīt **bonusa uzdevumus** (poga "Do as bonus task"), lai ātrāk iegūtu kartiņas. Vienlaikus drīkst būt atvērti 2.
* Katru uzdevumu komanda var izpildīt vienu reizi.
* Uzdevumos nav alkohola, bīstamu triku vai neatļautu darbību. Cienīgi izturies pret cilvēkiem, kurus fotografē (vispirms jautā atļauju!).

### Kartiņas

* Pēc apstiprināta uzdevuma tabā **Cards** parādās "card picks". Katra izvēle parāda **3 kartiņas** (ar apgriešanās animāciju). Tu paņem **vienu**.
* Kartiņas pieder **komandai**. **Jebkurš komandas biedrs** var tās spēlēt (nospied kartiņu, tad **Play card**).
* Citas komandas tavas kartiņas neredz.
* Kad kāds izspēlē kartiņu, **visi dabū paziņojumu**.

Noklusējuma kartiņu veidi:

| Efekts | Ko dara |
|---|---|
| Time bonus | Atņem savai komandai X minūtes no laika |
| Time penalty | Pieskaita citai komandai X minūtes |
| Freeze | Cita komanda X minūtes nevar reģistrēties vai finišēt |
| Skip without penalty | Izlaid uzdevumu bez soda, un tas tāpat skaitās |
| Extra card picks | Uzreiz saņem vēl vienu kartiņas izvēli |
| Steal | Nozog nejaušu kartiņu no citas komandas |
| Spy | X minūtes redzi visu komandu atrašanās vietu |
| Shield | Pats bloķē nākamo pret tevi vērsto kartiņu (darbojas automātiski) |
| Custom text | Jautra kartiņa ar tavu tekstu (piem. "nodziedi tautasdziesmu") |

### Punkti

**Rezultāts = nospēlētais laiks (tikai spēles logā) + sodi - bonusi.** Uzvar mazākais laiks. Tabulā **Board** redzams katras komandas progress; nepabeigušās komandas tiek kārtotas pēc progresa.

### Admins Race laikā

Cilnē **Board** admins (neitrāls, nespēlējot) var pieskaitīt vai atņemt komandai minūtes (obligāti ar iemeslu), vai reģistrēt komandu pilsētā ar roku (ja telefonam beidzies akumulators).

---

## Hide & Seek Across Latvia

### Ideja

Katrs spēlētājs slēpjas vienādu skaitu reižu (pēc noklusējuma **2**). Katra slēpšanās ir viens **raunds** (viena diena). Visi pārējie ir meklētāji. 3 spēlētāji × 2 = 6 raundi.

### Raunda gaita

1. **Admins** (režīmā *Admin*) nospiež **Start round**. Sākas **slēpšanās laiks** (iestatāms, pēc noklusējuma 60 min).
2. **Slēpējs** ceļo un uz kartes izvēlas **slēpšanās zonu** (pieskaras kartei). Kad ir zonā, var nospiest **I am in position**, vai arī pagaidīt, kamēr beidzas laiks. Meklētāji gaida.
3. Sākas **meklēšana**. **Taimeris skrien, līdz slēpēju atrod.** Laika limita nav.
4. Meklētāji tabā **Questions** izvēlas jautājumus (skatīt zemāk).
5. Kad slēpēju atrod, **kāds no meklētājiem (vai slēpējs) nospiež "We found the hider"**. Attāluma pārbaudes nav. Raunds beidzas, un parādās visa slēpēja trajektorija.
6. Ja meklētāji padodas, visi nospiež **Give up**, un raunds beidzas ar līdz tam nospēlēto laiku.

Ja slēpējs ilgāk par 3 minūtēm iziet no savas zonas, viņš saņem sodu.

### Jautājumu saraksts

Ir **fiksēts jautājumu saraksts** (kā īstajā spēlē), kategorijās:

| Kategorija | Jautājumi |
|---|---|
| **Radar** | Vai tu esi 1 / 2 / 5 / 10 / 25 / 50 / 100 km attālumā no manis? |
| **Thermometer** | Es nobraucu vismaz 0,5 / 1 / 2 / 5 km. Vai tagad esmu karstāk vai aukstāk? |
| **Matching** | Vai mēs abi esam tajā pašā vēsturiskajā reģionā / novadā / pie tās pašas tuvākās pilsētas / pie tās pašas tuvākās republikas pilsētas? |
| **Measuring** | Vai tu esi tuvāk Latvijas robežai vai krastam / pilsētas centram / Rīgai / Daugavpilij / Liepājai / u.c. nekā es? |
| **Tentacles** | Pie kuras pilsētas tu esi vistuvāk 10 / 25 / 50 km rādiusā no manis? |
| **Photo** | Slēpējs atsūta foto: debesis, zeme zem kājām, augstākais objekts, ielas zīme u.c. |

Svarīgi:

* **Katru konkrēto jautājumu raundā var uzdot tikai vienu reizi.** Uzdotie jautājumi paliek sarakstā ar atbildi un vairs nav nospiežami.
* Starp jautājumiem ir **pauze** (iestatāma, pēc noklusējuma 5 min).
* Atbildes **rēķina serveris** pēc slēpēja īstās atrašanās vietas. Slēpējs nevar melot, un meklētāji slēpēja atrašanās vietu nekad neredz. Atbilde parādās pēc īsa **reakcijas loga** (45 sekundes), kurā slēpējs var izspēlēt Veto vai Randomize kartiņu.
* **Thermometer** un citi jautājumi izmanto tavu GPS, tāpēc turi lapu atvērtu.
* Meklētāji uz kartes redz saviem Radar jautājumiem atbilstošus apļus (zaļš = "jā", sarkans = "nē") un thermometer līnijas.

### Kartiņas (slēpējam)

* Katrs atbildētais jautājums ļauj slēpējam **vilkt kartiņas**. Radar un Thermometer: velc 2, paturi 1. Matching un Measuring: velc 3, paturi 1. Tentacles: velc 4, paturi 2. Photo: velc 1, paturi 1.
* Roku limits pēc noklusējuma 6. Ja roka pilna, vispirms jāizmet kāda kartiņa.
* **Time bonus kartiņas**: ja tās ir rokā raunda beigās, pievieno minūtes slēpēja rezultātam.
* **Power kartiņas**: *Veto* (atceļ uzdoto jautājumu, un to vairs nevar uzdot), *Randomize* (nomaina jautājumu pret citu tās pašas kategorijas), *Question lock* (meklētāji X minūtes nevar jautāt), *Bigger hand*, *Discard and draw*.
* **Jautrās kartiņas** (piem. "nodziedi tautasdziesmas rindu"): paziņo meklētājiem uzdevumu.
* **Meklētāji vienmēr dabū paziņojumu, kad slēpējs izspēlē kartiņu.**

### Punkti

**Slēpēja rezultāts = nospēlētais laiks + Time bonus kartiņas rokā - sodi.** Visu savu slēpšanās raundu rezultāti tiek summēti, un **uzvar tas, kuram laiks kopā ir lielākais**.

---

## Tag Across Latvia

* Viena komanda ir **IT**. Tā cenšas **reālajā dzīvē** noķert citu komandu un nospiež **Tag!** (izvēlas, kuru noķēra). Nekādas GPS attāluma pārbaudes nav, spēle balstās uz godaprātu.
* Noķertā komanda kļūst par **IT**.
* **Tagger cooldown:** pēc noķeršanas jaunajam IT jāgaida iestatītais minūšu skaits (pēc noklusējuma 5), pirms tas drīkst ķert tālāk. Tas dod skrējējiem laiku aizbēgt.
* **IT redz skrējējus kartē.** Skrējēji **IT neredz** (pēc noklusējuma). Adminam ir slēdzis **"Do runners see IT?"**, ko var ieslēgt.
* Skaitās laiks, kamēr komanda ir IT, un tikai dienas spēles logā. **Uzvar komanda ar vismazāko laiku kā IT.**
* **All-Stars izdevums** (iestatījums lobby): katra komanda saņem **2 nejaušas vienreizlietojamas spējas**:
  * **Ghost**: komanda uz laiku pazūd no IT izsekotāja
  * **Shield**: komandu nevar noķert uz laiku
  * **Radar**: uz laiku redzi visas komandas
* Cilnē **Play** redzama tabula, kurā var redzēt, kam cik IT laika.

---

## Savas kartiņas un uzdevumi

Admins (režīmā *Admin* vai *all-seeing*) var **jebkurā brīdī** pievienot, mainīt un dzēst kartiņas un uzdevumus. Tas ir paredzēts, lai taisi savus "prikolus".

**Kur:** lobby → *Game settings* → *Edit* → **Edit cards** / **Edit tasks**, vai spēles laikā cilnē **Admin** → **Cards** / **Tasks**.

**Kartiņas pievienošana:**

1. Nospied **Add**.
2. Ieraksti **nosaukumu** un **aprakstu** (to redzēs visi, uz ko tā attiecas).
3. Izvēlies **What it does**. Ja gribi tikai jautru uzdevumu bez automātiska efekta, izvēlies **Custom text**.
4. Ja vajag, ieraksti minūtes vai daudzumu.
5. Izvēlies **Rarity** (Common / Uncommon / Rare). Retākas kartiņas tiek vilktas retāk.
6. Nospied **Add**, tad **Save changes**.

**Efektu saraksts**

| Race | Hide & Seek (slēpēja kartiņas) |
|---|---|
| Time bonus | Time bonus (pēc raunda) |
| Time penalty (citai komandai) | Veto |
| Freeze (cita komanda) | Randomize |
| Skip a task without penalty | Question lock |
| Extra card picks | Bigger hand |
| Steal a card | Discard 1, draw new |
| Spy | Custom curse (paziņo meklētājiem) |
| Shield (pasīvs) | |
| Custom text (var vērst pret komandu) | |

**Piemērs:** "Zaļumballes izaicinājums". Efekts: *Custom text*, ieslēgts *Aimed at another team*. Apraksts: *"Jāuzdejo 20 sekundes publiskā vietā."* Kad kāds to izspēlē pret komandu, tā dabū paziņojumu ar šo tekstu un izpilda uz goda vārda.

**Uzdevuma pievienošana:** nosaukums, "How to do it" (precīzs apraksts), **Difficulty** 1-6 (tas pats ir kartiņu izvēļu skaits). **Reset to defaults** atjauno oriģinālo sarakstu.

Dzēsta kartiņa neizzūd no jau paņemtajām rokām, jo kartiņas definīcija tiek nokopēta pie paņemšanas.

---

## Izskats, tēmas un paziņojumi

* Noklusējuma izskats ir mīksts **kawaii / japāņu** stils ("Sakura") ar mazu maskotu.
* **Tēmas maiņa:** sākuma ekrānā **Theme**, vai spēlē cilnē **More**. Ir 7 tēmas: Sakura (noklusējums), Matcha, Sora, Yuzu, Latvija, Yoru (tumša), Sumi (melnbalta). Tēma tiek atcerēta tavā ierīcē.
* Augšā redzams **savienojuma indikators**: *Connected* / *Connecting* / *Offline*. Ja redzi *Offline*, tev nav interneta vai nav sasaistes ar serveri.
* **Paziņojumi** parādās ekrāna augšā (piemēram "Reds played Freeze on Blues", "Answer: ...", "X tagged Y"). Ierīcēm ar vibrāciju tā īsi iedrebas.
* **How to play** poga (grāmatiņa augšā) atver visu īso instrukciju vienā logā.
* Neeksistējošai lapai ir sava 404 lapa.

---

## Padomi un ierobežojumi

* **Turi ekrānu ieslēgtu un lapu atvērtu.** Pārlūks GPS fonā nesūta. Lapa lūdz ekrānu neizslēgt, bet ērti ir ņemt līdzi powerbank.
* Ļauj **precīzu** atrašanās vietu un pievieno lapu sākuma ekrānam ("Add to Home Screen").
* Hide & Seek jautājumiem vajag **svaigu GPS** gan meklētājam, gan slēpējam. Ja kaut kas "nav gatavs", pagaidi dažas sekundes.
* Kartes plāksnes (OpenStreetMap) vajag internetu. Teritoriju krāsas redzamas arī bez tām.
* Pilsētu koordinātas ir aptuvenas (pilsētas centrs), bet spēlei pietiek.
* Spēle nevar novērst GPS viltošanu vai telefona nodošanu citam. Tāpēc notikumu žurnāls un brīdinājumi ir adminam redzami.

### Problēmas

| Problēma | Risinājums |
|---|---|
| Augšā `GPS error` / "needs HTTPS" | Atver spēli caur `https://` adresi |
| `GPS denied` | Pārlūka iestatījumos atļauj atrašanās vietu šai lapai |
| Check-in saka "get within X km" | Pagaidi, kamēr GPS precizitāte kļūst < 50 m, vai iestatījumos palielini reģistrēšanās rādiusu |
| Neredzu admina pogas | Pārbaudi režīmu augšā labajā pusē. *Player* režīmā admina pogas ir bloķētas |
| Iznācu no spēles | Join → Get back in (vārds + PIN), admins: Join → Admin (atslēga) |
| Lapa neatveras | Skat. [README-RPI.md](README-RPI.md) sadaļu "Problēmu risināšana" |

---

## Izstrādātājiem

```bash
python3 server/app.py --port 8080                 # palaist (Python 3.8+, bez ārējām bibliotēkām)
python3 -m unittest discover -s tests -v          # testi: noteikumi, krāpšanās aizsardzība, HTTP, SSE
python3 tools/seed_demo.py                        # izveido demo spēles (serverim jādarbojas)
```

* `server/`: tīrs Python (`app.py` HTTP un SSE, `game.py` dalībnieki un admin režīmi, `race.py`, `hide.py`, `tag.py` noteikumi, `cards.py` kartiņas un uzdevumi, `geo.py`, `core.py`)
* `public/`: bez būvēšanas (Preact, htm, Leaflet, fonti ir iekļauti projektā)
* Pilsētu saraksts: `tools/build_cities.py`. Robežu dati: `tools/build_geodata.py` (geoBoundaries / Valsts zemes dienests, CC BY 4.0)
* Fonti: M PLUS Rounded 1c un Quicksand (SIL Open Font License)
