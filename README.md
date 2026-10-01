# Jet Lag Latvija

Spēles, kas iedvesmotas no **Jet Lag: The Game**, bet pielāgotas Latvijai: vilcieni, autobusi, pilsētas, tautasdziesmas un pīrāgi. Viena mājaslapa, trīs spēles, strādā jebkura telefona pārlūkā.

| Spēle | Īsumā | Ilgums |
|---|---|---|
| **Race Across Latvia** | Komandas sacenšas, kura pirmā tiek ārā no visām teritorijām un nonāk finišā. Visi pilda vieniem un tiem pašiem uzdevumiem un vāc kartiņas | 3-10 dienas |
| **Hide & Seek Across Latvia** | Viens slēpjas, pārējie uzdod jautājumus. Serveris atbild pēc slēpēja īstās GPS vietas, un karte rāda, kur slēpējs vēl var atrasties | pa raundam dienā |
| **Tag Across Latvia** | Viena komanda ķer citas. Mērķi, nauda, uzdevumi un veikals | 1-14 spēles dienas |

> **Uzstādīšana uz Raspberry Pi / Rock Pi:** skatīt [README-RPI.md](README-RPI.md). Šis fails ir par pašu spēli.

---

## Saturs

1. [Ātrā sākšana](#ātrā-sākšana)
2. [Kā pieslēgties spēlei](#kā-pieslēgties-spēlei)
3. [Iestatījumi (zobrats), valodas, tēmas](#iestatījumi-zobrats-valodas-tēmas)
4. [Paziņojumi telefonā](#paziņojumi-telefonā)
5. [Lomas un admin režīmi](#lomas-un-admin-režīmi)
6. [Lobby](#lobby)
7. [Race](#race-across-latvia)
8. [Hide & Seek](#hide--seek-across-latvia)
9. [Tag](#tag-across-latvia)
10. [Savas kartiņas un uzdevumi](#savas-kartiņas-un-uzdevumi)
11. [Padomi un problēmas](#padomi-un-problēmas)
12. [Izstrādātājiem](#izstrādātājiem)

---

## Ātrā sākšana

**Kā host (spēles veidotājs):**

1. Atver spēles adresi (piemēram `https://tavs-pi.tailXXXX.ts.net`).
2. Nospied **Izveidot spēli**, izvēlies spēli (Race / Hide & Seek / Tag).
3. Ieraksti savu vārdu un PIN (4-8 cipari). Ja pats gribi spēlēt, atstāj ieslēgtu "Es arī spēlēju".
4. Parādīsies **spēles kods** (5 burti), ko dod draugiem, un **admin atslēga**. Atslēga tiek rādīta **tikai vienreiz**, uzraksti to. Tā ir vienīgais veids, kā kļūt par adminu citā ierīcē.
5. Lobby iestati noteikumus, pagaidi, kamēr visi pievienojas, un nospied **Sākt spēli**.

## Kā pieslēgties spēlei

1. Atver to pašu adresi un nospied **Pievienoties ar kodu** (vai atver draugu atsūtīto saiti `.../#/join/ABCDE`).
2. Ieraksti kodu, tad vārdu, PIN un lomu: **spēlētājs** (tikai pirms spēles sākuma) vai **skatītājs** (neredz noslēpumus).
3. **Pazaudēji telefonu vai aizvēri lapu?** Pievienoties, tad "Atgriezties" un ieraksti savu vārdu un PIN.
4. **Admins citā ierīcē:** ieraksti admin atslēgu. Vecā admina sesija tiek atslēgta, tāpēc adminu vienmēr ir tieši viens.

Spēlē jāļauj **atrašanās vieta (GPS)**. Augšā redzēsi GPS precizitāti. Pārlūks fonā GPS nesūta, tāpēc spēli turi atvērtu. Race spēlē GPS pat nav obligāts (reģistrēšanās notiek ar pieskārienu kartē).

---

## Iestatījumi (zobrats), valodas, tēmas

Nekādu cilņu nav: viss ir vienā logā. Augšējā labajā stūrī ir **zobrata** poga, kas atver iestatījumus:

* **Kā spēlēt**: visa īsā instrukcija vienā logā.
* **Valoda**: angļu, latviešu, krievu, ukraiņu. Valoda tiek atcerēta ierīcē. Spēles noklusējuma uzdevumi un kartiņas ir tulkoti uz angļu un krievu valodu (ukraiņu valodā tie rādās angliski). Tavi paša uzdevumi un kartiņas paliek tavā rakstītajā valodā.
* **Izskats**: 7 tēmas, kas atšķiras ne tikai pēc krāsām, bet arī pēc formas, burtu veida un izkārtojuma: *Sakura* (mīksta kawaii), *Matcha*, *Sora*, *Yuzu* (rupjas melnas apmales un ēnas), *Latvija* (grāmatas stils ar serifiem), *Yoru* (tumša "terminālis"), *Sumi* (melnbalta, žurnāla stils). Papildus var mainīt akcenta krāsu, noapaļojumu, teksta izmēru, blīvumu, fonu, kartiņu un pogu stilu, kartes izskatu un animācijas.
* **Paziņojumi**: telefona paziņojumi (skat. zemāk).
* **Cilvēki** un **Admins** (tikai adminam): admin režīms, pauze, beigt spēli, paziņojums visiem, kartiņu un uzdevumu redaktors, žurnāls.

Augšā redzams **savienojuma indikators** (zaļš = savienots) un GPS stāvoklis.

---

## Paziņojumi telefonā

Spēle var sūtīt **paziņojumus un vibrāciju arī tad, kad lapa ir aizvērta** (kāds izspēlēja kartiņu, nāk jautājums, tevi noķēra utt.). Ieslēdz tos zobrata logā sadaļā *Paziņojumi*.

Vajag:

* **HTTPS adresi** (Tailscale Funnel to dod). Ar parastu `http://` paziņojumi nestrādā.
* **iPhone:** vispirms pievieno lapu sākuma ekrānam (Share, "Add to Home Screen") un atver no turienes (vajag iOS 16.4 vai jaunāku).
* Android: Chrome vai Firefox, atļauj paziņojumus, kad pārlūks jautā.

Serveris pats ģenerē atslēgas (`data/vapid.json`). Nekā cita nav jāiestata. Ja spēlētājs lapu aktīvi lieto, paziņojums netiek sūtīts divreiz.

---

## Lomas un admin režīmi

Katrā spēlē ir **tieši viens admins**. Lai admins neizdara kaut ko nejauši vai nepamana to, ko nedrīkst, viņš var pārslēgties starp trim režīmiem (zobrata logā vai pogā augšā):

| Režīms | Ko drīkst | Ko redz |
|---|---|---|
| **Spēlētājs** | Spēlē kā parasts spēlētājs. **Visas admina pogas ir bloķētas** | Tikai to, ko redz parasts spēlētājs |
| **Admins** | Visas admina iespējas | Tikai to, ko redzētu spēlētājs vai skatītājs |
| **Admins (redz visu)** | Viss, ko var "Admins" | **Pilnīgi visu**: atrašanās vietas, slēpēja pozīciju, visas kartiņas |

* Ja admins **nespēlē**, pēc noklusējuma ir *redz visu*.
* Ja admins **spēlē**, pēc noklusējuma ir *Admins*. *Redz visu* šādam adminam ir bloķēts, kamēr spēle notiek.
* Katra režīma maiņa tiek ierakstīta **žurnālā**. Žurnāls ir **tikai adminam**; spēlētāji redz īsus paziņojumus.
* Admins, kas spēlē, **nevar vērtēt savas komandas pierādījumus** un nevar koriģēt savas komandas laiku.

Drošība: visu noteikumu pārbaudi un atbildes rēķina serveris; nepareizi ievadītus PIN un admin atslēgas serveris uz laiku bloķē; žurnāls ir "ķēdē" (katrs ieraksts satur iepriekšējā kontrolsummu). GPS viltošanu neviena sistēma nevar pilnībā novērst, tāpēc spēle balstās uz godaprātu. Ātrums virs 140 km/h tiek atzīmēts adminam.

---

## Lobby

**Komandas (Race un Tag):** katrs izveido savu komandu (nosaukums + krāsa) vai pievienojas esošai (līdz 4 cilvēkiem). Admins var pārvietot cilvēkus. Hide & Seek komandu nav.

**Iestatījumi** (admins, poga "Labot" pie spēles iestatījumiem). Pēc starta komandas un iestatījumi vairs nemainās, bet kartiņas un uzdevumus admins var mainīt arī spēles laikā.

* *Race:* starta un finiša pilsēta, bonuss pirmajam, kas tiek ārā no teritorijas, uzdevumu skaits, kāršu limits rokā, dienas spēles logs, **prasīt foto pierādījumu** (pēc noklusējuma izslēgts), teritoriju krāsošana, uzdevumi un kartiņas.
* *Hide & Seek:* cik reižu katrs slēpjas, **slēpšanās laiks (pēc noklusējuma 2,5 h)**, zonas rādiuss, slēpēja reakcijas laiks, roku limits, **brīdinājumi slēpējam, ja viņš ir ārpus zonas** (var izslēgt).
* *Tag:* spēles garums, pauze pēc noķeršanas, vai skrējēji redz IT, dienas logs, All-Stars, **ekonomika** (mērķu skaits un atlīdzība, naudas summa par uzdevumiem, veikala cenas), foto pierādījums.

---

## Race Across Latvia

### Ideja

Komandas ar **sabiedrisko transportu** (vilciens, tramvajs, autobuss, kājām; bez auto un taksometra) sacenšas, kura pirmā tiek **ārā no visām teritorijām** un nonāk finišā. Spēles laiks skrien tikai **dienas spēles logā** (pēc noklusējuma 08:00-21:00), naktī visi atpūšas.

### Teritorijas

Latvija ir sadalīta krāsainās teritorijās (Kurzeme, Zemgale un Sēlija, Rīga un Pierīga, Vidzeme, Latgale). **Teritorija ir reģions, no kura tev jātiek ārā.** Tu esi pirmajā, un kad ieraksti kādu pilsētu nākamajā teritorijā, tu esi "tikusi ārā" un sākas nākamā teritorija. Pirmā komanda, kas tiek ārā no teritorijas, saņem **laika bonusu** (pēc noklusējuma 20 min).

Admins lobby var pārkrāsot novadus, pārdēvēt un pārkārtot teritorijas, pievienot jaunas un izslēgt atsevišķas pilsētas.

### Reģistrēšanās

* Nav "reģistrēšanās rādiusa" un nav GPS pārbaudes: **tu pats pieskaries pilsētai kartē** (vai ieraksti meklēšanas laukā) un spied **Atzīmēties šeit**. Spēle balstās uz godaprātu, un žurnālā viss redzams.
* Ja ieslēgta secība, vari atzīmēties tikai nākamajā teritorijā.
* Kad visas teritorijas izietas, pieskaries finiša pilsētai un spied **Fināls**. Uzvar mazākais laiks.

### Uzdevumi

* Visas komandas redz **tos pašus 5 nejaušos uzdevumus**. Nav pogas "sākt uzdevumu": izdari to un spied **Mēs izdarījām**. Pēc noklusējuma pierādījums (foto) nav vajadzīgs; adminam to var ieslēgt lobby, tad citas komandas vai admins to apstiprina.
* Katrs uzdevums ir 1-6 grūtības, un **grūtība = kartiņu izvēļu skaits**.
* Katru uzdevumu komanda var izpildīt vienu reizi. Izpildītais uzdevums tiek aizstāts ar jaunu.
* Katra komanda var **aizsargāt vienu uzdevumu**, lai to nenomainītu kartiņa "Virpulis".
* Kartiņa **Shuffle tasks** pārmaisa visus uzdevumus visām komandām, izņemot katras komandas aizsargāto.

### Kartiņas

* Pēc uzdevuma tu saņem "kartiņu izvēles". Katra izvēle rāda **3 kartiņas** (ar apgriešanās animāciju), tu paņem **vienu**.
* Kartiņas pieder **komandai**, un jebkurš komandas biedrs tās var izspēlēt. Citas komandas tavas kartiņas neredz.
* **Kāršu limits rokā: 6.** Ja roka pilna, tu izvēlies: izmest kādu savu kartiņu vai atteikties no jaunās.
* Kad kāds izspēlē kartiņu, **visi dabū paziņojumu**.

| Efekts | Ko dara |
|---|---|
| Time bonus | Atņem savai komandai X minūtes no laika |
| Time penalty | Pieskaita citai komandai X minūtes |
| Freeze | Cita komanda X minūtes nevar atzīmēties vai finišēt |
| Shuffle tasks | Pārmaisa uzdevumus (izņemot aizsargātos) |
| Extra picks | Uzreiz vēl viena kartiņu izvēle |
| Steal | Nozog nejaušu kartiņu no citas komandas |
| Spy | X minūtes redzi visu komandu atrašanās vietu |
| Shield | Pats bloķē nākamo pret tevi vērsto kartiņu |
| Custom text | Jautra kartiņa ar tavu tekstu |

### Punkti

**Rezultāts = nospēlētais laiks (tikai spēles logā) + sodi - bonusi.** Uzvar mazākais laiks. Admins (neitrāls) var pieskaitīt vai atņemt komandai minūtes (obligāti ar iemeslu) vai atzīmēt komandu ar roku.

---

## Hide & Seek Across Latvia

### Ideja

Katrs spēlētājs slēpjas vienādu skaitu reižu (pēc noklusējuma **2**). Katra slēpšanās ir viens **raunds**. Visi pārējie ir meklētāji.

### Raunda gaita

1. **Admins** nospiež **Sākt raundu**. Sākas **slēpšanās laiks** (pēc noklusējuma **2,5 h**).
2. **Slēpējs** ceļo un uz kartes izvēlas **slēpšanās zonu**. Kad ir zonā, spiež "Esmu vietā", vai pagaida, kamēr beidzas laiks.
3. Sākas **meklēšana**. Taimeris skrien, līdz slēpēju atrod.
4. Meklētāji uzdod jautājumus (zemāk). **Nav pauzes starp jautājumiem**: katru jautājumu var uzdot vienu reizi raundā.
5. Kad slēpēju atrod, kāds nospiež **"Mēs atradām slēpēju"**. Ja meklētāji padodas, visi nospiež "Padoties".

**Ja slēpējs iziet no zonas, sods netiek skaitīts**, bet viņš saņem **brīdinājumu (paziņojumu un vibrāciju) ik pēc 10 sekundēm**, kamēr ir ārpus zonas. Brīdinājumu var izslēgt lobby vai slēpēja ekrānā.

### Jautājumi un karte

Jautājumi ir fiksēti (kā īstajā spēlē): **Radar, Thermometer, Matching, Measuring, Tentacles, Photo**.

* Atbildes **rēķina serveris** pēc slēpēja īstās atrašanās vietas. Atbilde parādās pēc īsa **reakcijas loga** (45 s), kurā slēpējs var izspēlēt kartiņu (Veto, Randomize u.c.).
* Meklētājiem ir **karte "Kur var būt slēpējs?"**: katra atbilde (radars, termometrs, matching, measuring, tentacles) izslēdz daļu Latvijas, tumšie apgabali ir izslēgti, krāsotie novadi vēl iespējami. Parādās arī radara apļi un termometra līnijas.

### Slēpēja kartiņas

* Katrs atbildētais jautājums ļauj slēpējam **vilkt kartiņas** (Radar, Thermometer: velc 2, paturi 1; Matching, Measuring: 3/1; Tentacles: 4/2; Photo: 1/1). Roku limits 6.
* **Time bonus** kartiņas rokā raunda beigās pieskaita minūtes. Power kartiņas: Veto, Randomize, Question lock, Bigger hand, Discard and draw. Jautrās kartiņas paziņo uzdevumu meklētājiem.
* Meklētāji vienmēr dabū paziņojumu, kad slēpējs izspēlē kartiņu.

### Punkti

**Slēpēja rezultāts = nospēlētais laiks + Time bonus kartiņas rokā.** Visu raundu rezultāti tiek summēti, **uzvar tas, kuram laiks kopā ir lielākais**.

---

## Tag Across Latvia

* Viena komanda ir **IT**. Tā **reālajā dzīvē** ķer citu komandu un spiež **Noķert**. Noķertā komanda kļūst par IT. GPS attāluma pārbaudes nav.
* **Pauze:** pēc noķeršanas jaunajam IT jāgaida iestatītais minūšu skaits (pēc noklusējuma 5).
* **IT redz skrējējus kartē**, skrējēji IT neredz (ja admins to neieslēdz vai skrējēji nenopērk "Peek").
* **Uzvar komanda ar vismazāko laiku kā IT.** Laiks skrien tikai dienas logā.
* **Mērķi:** kartē ir vairāki mērķu pilsētas (parasti 3). Kad esi pilsētā, pieskaries tai un spied **Ieņemt**: saņem naudu (pēc noklusējuma 60), un parādās jauns mērķis.
* **Uzdevumi:** izpildi uzdevumus, lai nopelnītu vēl vairāk naudas (grūtāks = vairāk).
* **Veikals:** nopērc par naudu **Shield** (komandu nevar noķert), **Ghost** (pazūd no izsekotāja), **Radar** (redzi visus), **Peek** (redzi IT), **Freeze IT** (IT nevar ķert), **Time cut** (noņem laiku no sava IT laika). Cenas un ilgumi ir iestatāmi.
* **All-Stars** (pēc izvēles): katra komanda saņem 2 bezmaksas vienreizlietojamas spējas (Ghost, Shield, Radar).
* Tabulā redzams, kam cik IT laika.

---

## Savas kartiņas un uzdevumi

Admins (režīmā *Admins* vai *redz visu*) var **jebkurā brīdī** pievienot, mainīt un dzēst kartiņas un uzdevumus: lobby iestatījumos vai spēles laikā zobrata logā sadaļā *Admins*.

**Kartiņas pievienošana:** Pievienot, nosaukums un apraksts, izvēlies efektu (vai "Custom text" tikai jautram tekstam), pēc vajadzības minūtes vai daudzumu, retumu (retākas tiek vilktas retāk), Saglabāt.

**Piemērs:** "Zaļumballes izaicinājums": efekts *Custom text*, ieslēgts "vērsts pret citu komandu", apraksts "Jāuzdejo 20 sekundes publiskā vietā". Kad kāds to izspēlē, komanda dabū paziņojumu ar šo tekstu.

**Uzdevums:** nosaukums, "Kā to izdarīt", grūtība 1-6 (= kartiņu izvēļu skaits Race spēlē). "Atjaunot noklusējumu" atjauno oriģinālo sarakstu.

---

## Padomi un problēmas

* **Turi ekrānu ieslēgtu un lapu atvērtu.** Pārlūks GPS fonā nesūta. Ērti ir ņemt līdzi powerbank. Paziņojumi (skat. augstāk) strādā arī ar aizvērtu lapu.
* Ļauj **precīzu** atrašanās vietu un pievieno lapu sākuma ekrānam.
* Hide & Seek jautājumiem vajag **svaigu GPS** gan meklētājam, gan slēpējam. Ja kaut kas "nav gatavs", pagaidi dažas sekundes.
* Kartes plāksnes (OpenStreetMap) vajag internetu. Lapa ir ātra: faili tiek kešoti telefonā un otrreiz ielādējas uzreiz.

| Problēma | Risinājums |
|---|---|
| Augšā GPS kļūda ("vajag HTTPS") | Atver spēli caur `https://` adresi |
| GPS liegts | Pārlūka iestatījumos atļauj atrašanās vietu šai lapai |
| Nav paziņojumu | Vajag HTTPS; iPhone gadījumā pievieno sākuma ekrānam; atļauj paziņojumus |
| Neredzu admina pogas | Pārbaudi admina režīmu. *Spēlētāja* režīmā admina pogas ir bloķētas |
| Iznācu no spēles | Pievienoties, "Atgriezties" (vārds + PIN); admins: admin atslēga |
| Lapa neatveras | Skat. [README-RPI.md](README-RPI.md) sadaļu "Problēmu risināšana" |

---

## Izstrādātājiem

```bash
python3 server/app.py --port 8080                 # palaist (Python 3.8+, bez ārējām bibliotēkām)
python3 -m unittest discover -s tests -v          # testi: noteikumi, krāpšanās aizsardzība, HTTP, SSE
python3 tools/build_i18n.py                       # pārbauda un saliek tulkojumus (public/i18n)
```

* `server/`: tīrs Python (`app.py` HTTP, SSE un statika, `game.py` dalībnieki un admin režīmi, `race.py`, `hide.py`, `tag.py` noteikumi, `cards.py` kartiņas un uzdevumi, `push.py` Web Push, `geo.py`, `core.py`)
* `public/`: bez būvēšanas (Preact, htm, Leaflet, fonti iekļauti), `sw.js` service worker keša un paziņojumiem
* Tulkojumi: `tools/i18n/<valoda>.py` un `errors_<valoda>.py`; pēc izmaiņām palaid `tools/build_i18n.py`. Jaunu valodu pievieno `tools/build_i18n.py` un `public/js/i18n.js`.
* Pilsētu saraksts: `tools/build_cities.py`. Robežu dati: `tools/build_geodata.py` (geoBoundaries / Valsts zemes dienests, CC BY 4.0)
* Fonti: Nunito, M PLUS Rounded 1c, Comfortaa, Cormorant Garamond, IBM Plex Sans, JetBrains Mono, Lora, Playfair Display, Rubik, Source Sans 3, Unbounded (SIL Open Font License)
