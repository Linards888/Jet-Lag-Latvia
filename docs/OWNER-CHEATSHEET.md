# Īpašnieka špikeris

Visas komandas un vērtības, ko vari lietot Owner console (`#/owner`).


## Kā lietot spēles paneli (Owner console, Visas spēles)

Atver spēli sarakstā. Zem tās ir: (1) pogas Pauze, Atsākt, Beigt, Paziņojums (darbojas kā spēles admins); (2) Dalībnieki ar viņu ID; (3) PIN maiņa; (4) 'Darboties kā izvēlētais dalībnieks': izvēlies dalībnieku, ieraksti darbības nosaukumu (type) un JSON datus (payload), spied Izpildīt. Tā ir tā pati darbība, ko dalībnieks izdara spēlē, tāpēc spēles noteikumi paliek spēkā (piem. kārti var spēlēt tikai tad, ja tā ir rokā); (5) 'Mainīt jebkuru vērtību' ignorē noteikumus: ieraksti ceļu ar punktiem un JSON vērtību; (6) 'Spēles neapstrādātie dati' rāda visu spēles saturu, no kura vari nolasīt ID.


## Komandu darbības (jebkurā režīmā, tikai lobby)

Komanda ir krāsa: red, blue, green, yellow, orange, purple, pink, teal. Dara dalībnieks, kuram ir komanda.


| Nosaukums / ceļš | Piemērs | Ko dara |
|---|---|---|
| `team_join` | `{"cid":"red"}` | Pievienojas komandai ar šo krāsu (izveido to, ja vēl nav; līdz 4 cilvēkiem) |
| `team_leave` | `{}` | Iziet no komandas |

## Admina darbības (galvenais admins vai līdzadmins)

Lobby un spēles laikā.


| Nosaukums / ceļš | Piemērs | Ko dara |
|---|---|---|
| `start` | `{}` | Sāk spēli (jābūt komandām un spēlētājiem) |
| `pause` | `{"reason":"pauze"}` | Pauzē (pulkstenis stāv) |
| `resume` | `{}` | Atsāk |
| `end` | `{}` | Beidz spēli (izmaksā kontu balvas, ja izpildīti nosacījumi) |
| `announce` | `{"text":"Ziņa visiem"}` | Paziņojums visiem |
| `lock_join` | `{"locked":true}` | Aizver vai atver pievienošanos |
| `assign_team` | `{"memberId":"...","cid":"blue"}` | Ieliek dalībnieku komandā ar krāsu cid (cid null = bez komandas) |
| `kick` | `{"memberId":"..."}` | Izmet dalībnieku (tikai lobby) |
| `update_settings` | `{"settings":{"handLimit":8}}` | Maina spēles iestatījumus (tikai lobby) |
| `edit_catalog` | `{"kind":"tasks","items":[...]}` | Aizstāj uzdevumu vai kāršu sarakstu ({"kind":"tasks","reset":true} atjauno noklusējumu) |
| `admin_mode` | `{"mode":"full"}` | Admina režīms: player, fair vai full |
| `set_admin` | `{"memberId":"...","on":true}` | Tikai galvenais admins: dod vai atņem līdzadmina tiesības |

## Race darbības

Jāspēlē kā dalībnieks, kas ir komandā. Kartes un uzdevumu ID redzami Raw game data.


| Nosaukums / ceļš | Piemērs | Ko dara |
|---|---|---|
| `checkin` | `{"muniId":"liepajas"} vai {"cityId":"jelgava"}` | Atzīmēties blakus novadā (tikai pēc uzdevuma izpildes pašreizējā novadā; vienā novadā uz vienu uzdevumu). Admins: {"manual":true,"teamId":"...","muniId":"..."} |
| `finish` | `{"cityId":"daugavpils"}` | Finišēt finiša pilsētā (pirmā komanda uzvar) |
| `complete_task` | `{"taskId":"t07"}` | Izpildīt kopīgu uzdevumu (ar foto: pievieno fid un note). Pēc tam jāatzīmējas blakus novadā, citādi nākamais uzdevums ir bloķēts |
| `vote_tasks` | `{"taskIds":["t01","t02","t03"]}` | Vakara balsojums: 3 uzdevumi, ko nomainīt (nomaina tos, ko izvēlējās visas komandas) |
| `review` | `{"teamId":"...","taskId":"t07","verdict":"approve"}` | Apstiprina vai noraida pierādījumu (approve/reject) |
| `pick` | `{"pid":"...","index":0,"discardIid":"..."}` | Paņem vienu no piedāvātajām kārtīm (discardIid vajadzīgs, ja roka pilna; "pass":true = neņemt nevienu) |
| `discard` | `{"iid":"..."}` | Izmet kārti no rokas |
| `play_card` | `{"iid":"...","targetTeamId":"..."}` | Izspēlē kārti (targetTeamId pret citu komandu; swap_task kārtij {"taskId":"..."}) |

## Hide & Seek darbības

Slēpējs, meklētāji un admins. Jautājumu ID ir formā radar:50, thermo:1000 utt. (skat. Raw game data).


| Nosaukums / ceļš | Piemērs | Ko dara |
|---|---|---|
| `start_round` | `{}` | Admins sāk nākamo raundu |
| `set_zone` | `{"lat":56.95,"lng":24.1}` | Slēpējs izvēlas zonas centru |
| `ready` | `{}` | Slēpējs ir vietā: sākas meklēšana |
| `ask` | `{"qid":"radar:50"}` | Meklētājs uzdod jautājumu |
| `thermo_end` | `{"qid":"..."}` | Beidz atvērto termometru |
| `answer_photo` | `{"qid":"...","fid":"..."}` | Slēpējs atbild ar foto |
| `found` | `{}` | Meklētājs vai slēpējs: slēpēju atrada |
| `give_up` | `{}` | Balso par padošanos |
| `force_found` | `{}` | Admins: piespiež 'atrasts' |
| `draw_keep` | `{"did":"...","indexes":[0],"discard":[]}` | Slēpējs izvēlas, kuras no izvilktajām kārtīm paturēt |
| `draw_skip` | `{"did":"..."}` | Neņem nevienu kārti |
| `discard` | `{"iid":"..."}` | Izmet kārti |
| `play_card` | `{"iid":"...","qid":"..."}` | Izspēlē slēpēja kārti (qid vajadzīgs Veto un Randomize kartēm) |

## Tag darbības


| Nosaukums / ceļš | Piemērs | Ko dara |
|---|---|---|
| `tag` | `{"targetTeamId":"..."}` | IT komanda noķer citu |
| `use_power` | `{"power":"shield"}` | All-Stars spēja: ghost, shield vai radar |
| `buy` | `{"item":"shield"}` | Veikals: shield, ghost, radar, peek, freeze_it, time_cut |
| `claim_destination` | `{"destId":"..."}` | Ieņem mērķi un saņem naudu |
| `complete_task` | `{"taskId":"..."}` | Izpilda uzdevumu par naudu |
| `review` | `{"teamId":"...","taskId":"...","verdict":"approve"}` | Apstiprina pierādījumu |

## Mainīt jebkuru vērtību (ceļš ar punktiem + JSON)

Ieraksti ceļu un JSON vērtību (skaitlis 10, teksts "abc", true/false, null, masīvs [1,2], objekts {"a":1}). Nekādu noteikumu pārbaužu nav. Ceļu redzi lauciņā zem ceļa un Raw game data.


| Nosaukums / ceļš | Piemērs | Ko dara |
|---|---|---|
| `status` | `"paused"` | Spēles stāvoklis: lobby, running, paused, finished |
| `name` | `"Jauns nosaukums"` | Spēles nosaukums |
| `joinLocked` | `false` | Atver pievienošanos |
| `startedAt` | `1790000000000` | Spēles sākuma laiks (milisekundes) |
| `data.teams.<teamId>.frozenUntil` | `0` | Race: aizsalšanas beigas (ms; 0 = nav). Uzliec nākotnes laiku, lai komandu iesaldētu |
| `data.teams.<teamId>.cards` | `[]` | Race: komandas kārtis (rokas saturs) |
| `data.teams.<teamId>.money` | `500` | Tag: komandas nauda |
| `data.it` | `"<teamId>"` | Tag: kura komanda ir IT |
| `data.itLockUntil` | `0` | Tag: pauze pēc noķeršanas (ms; 0 = nav) |
| `settings.handLimit` | `8` | Kāršu limits rokā |
| `settings.window.start` | `"06:00"` | Dienas spēles loga sākums (arī .end) |
| `members.<memberId>.name` | `"Anna"` | Dalībnieka vārds |
| `teams.<teamId>.name` | `"Sarkanie"` | Komandas nosaukums |
| `data.shared` | `["t01","t02","t03","t04","t05"]` | Race: pašreizējie kopīgie uzdevumi |
| `data.teams.<teamId>.finishedAt` | `1790000000000` | Race: komandas finiša laiks (null = vēl nav finišējusi) |
| `settings.days` | `0` | Race: plānotās dienas (0 = bez ierobežojuma) |
| `data.teams.<teamId>.unlocked` | `["liepajas"]` | Race: novadi, kuros komanda izpildījusi uzdevumu (to kaimiņi ir atvērti) |
| `data.teams.<teamId>.at` | `"liepajas"` | Race: novads, kurā komanda atrodas |

## Konti (Owner console, Visi konti)

Meklē pēc lietotājvārda, vārda vai uzvārda. Katram kontam: vārds, uzvārds, apraksts, tēma, tituls, rāmis, talismans, priekšmeti (pieskaries, lai pievienotu vai noņemtu), statistika un xp, jauna parole (vai nejauši izveidota, parādās vienreiz), pārdēvēšana, ieiet kā šis konts, atiestatīšana, dzēšana. Īpašnieka kontu (Linards888) nevar dzēst vai pārdēvēt.

