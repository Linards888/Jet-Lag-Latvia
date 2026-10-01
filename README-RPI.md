# Jet Lag Latvija: uzstādīšana uz Raspberry Pi (ar Tailscale)

Šajā failā ir viss, kas vajadzīgs, lai spēle strādātu uz tava Raspberry Pi (vai Rock Pi) un būtu pieejama **jebkuram cilvēkam jebkur Latvijā**, tikai ar saiti. Spēles noteikumi un lietošana ir otrā failā: [README.md](README.md).

Ja gribi tikai ātri, ej uz [**Lielā komanda**](#lielā-komanda-visu-vienā-reizē) apakšā. Tā izdara visu pati. Ir tikai divas lietas, ko vari izdarīt tikai tu pats: ielogoties Tailscale un vienreiz ieslēgt Funnel savā Tailscale kontā (abi ir paskaidroti zemāk).

---

## Kāpēc vajag Tailscale Funnel?

* Telefoni **GPS atļauj tikai `https://` lapās**. Ar parastu `http://192.168...` adresi atrašanās vieta nestrādās.
* Spēlētāji būs pa visu Latviju uz mobilajiem datiem, nevis tavā Wi-Fi.
* **Tailscale Funnel** dod Raspberry Pi īstu, drošu `https://` adresi un neprasa ne portu pāradresāciju, ne domēnu, ne maksu. Adrese ir pastāvīga (der arī spēlei, kas ilgst ilgāk par nedēļu).

Cilvēkiem, kas spēlē, **Tailscale nav jāinstalē**. Viņi vienkārši atver saiti.

## Kas vajadzīgs

* Raspberry Pi (vai līdzīgs) ar Raspberry Pi OS / Debian / Ubuntu un pieeju internetam
* Bezmaksas Tailscale konts (https://login.tailscale.com)
* Piekļuve Pi terminālim (tieši vai caur SSH)

Python 3.8 vai jaunāks jau ir gandrīz visos Pi (pārbaude: `python3 --version`). Papildu bibliotēkas nav vajadzīgas.

---

## 1. solis: sagatavot Pi

```bash
sudo apt update
sudo apt install -y git python3 curl
python3 --version
```

## 2. solis: lejupielādēt spēli

```bash
cd ~
git clone https://github.com/Linards888/Jet-Lag-Latvia.git
cd Jet-Lag-Latvia
```

> Ja jaunākās izmaiņas vēl nav iekļautas `main` zarā (pull request nav "merged"), pārslēdzies uz to zaru, kur tās ir:
> ```bash
> git fetch --all
> git checkout feature/jet-lag-latvia-app
> ```

## 3. solis: izmēģināt, vai spēle startē

```bash
python3 server/app.py --host 127.0.0.1 --port 8080
```

Jāparādās: `Jet Lag: Latvia running on http://127.0.0.1:8080`. Otrā terminālī:

```bash
curl -s http://127.0.0.1:8080/api/health
```

Jāatbild `{"ok":true,"games":0}`. Apturi serveri ar `Ctrl+C`. (Nākamajos soļos tas startēs pats.)

## 4. solis: uzstādīt Tailscale un ielogoties

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Terminālī parādīsies saite. Atver to jebkurā pārlūkā (var arī telefonā) un ielogojies savā Tailscale kontā. Pēc tam pārbaudi:

```bash
tailscale status
```

## 5. solis: ieslēgt Funnel savā Tailscale kontā (vienreiz)

Funnel pēc noklusējuma var būt izslēgts. Ieslēdz to pārlūkā:

1. Atver https://login.tailscale.com/admin/dns un pārliecinies, ka ir ieslēgts **MagicDNS** un **HTTPS Certificates**.
2. Atver https://login.tailscale.com/admin/acls (Access controls) un pārliecinies, ka politikā ir šāds bloks (parasti jau ir pēc noklusējuma):
   ```json
   "nodeAttrs": [
     { "target": ["autogroup:member"], "attr": ["funnel"] }
   ]
   ```
3. Ja komanda `tailscale funnel` vēlāk raksta `Funnel is not enabled on your tailnet` un parāda saiti, vienkārši atver to saiti un apstiprini.

## 6. solis: lai spēle startē pati (systemd pakalpojums)

Tas nodrošina, ka serveris ieslēdzas kopā ar Pi un pārstartējas pats, ja kaut kas noiet greizi. Spēles dati tiek glabāti mapē `~/jetlag-data` (ārpus git mapes, lai `git pull` tiem nekad neuzskrietu).

```bash
mkdir -p ~/jetlag-data
sudo tee /etc/systemd/system/jetlag.service >/dev/null <<EOF
[Unit]
Description=Jet Lag Latvia game server
After=network-online.target
Wants=network-online.target

[Service]
User=$(whoami)
WorkingDirectory=$HOME/Jet-Lag-Latvia
Environment=JETLAG_DATA=$HOME/jetlag-data
ExecStart=/usr/bin/python3 server/app.py --host 127.0.0.1 --port 8080
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now jetlag
sleep 2
systemctl status jetlag --no-pager
curl -s http://127.0.0.1:8080/api/health
```

Ja agrāk startēji serveri ar rokām un tajā jau bija spēles, ko gribi paturēt, pirms 6. soļa vari pārkopēt datus:

```bash
pkill -f "server/app.py" || true
cp -r ~/Jet-Lag-Latvia/data/. ~/jetlag-data/ 2>/dev/null || true
sudo systemctl restart jetlag
```

## 7. solis: publicēt internetā ar Funnel

```bash
sudo tailscale funnel --bg 8080
tailscale funnel status
```

Statusā redzēsi savu adresi, piemēram `https://rock-pi-4b-plus.tailabe992.ts.net`. **Šī ir tava spēles saite.** Tā nemainās pēc pārstartēšanas.

## 8. solis: pārbaude

1. Telefonā **izslēdz Wi-Fi** (lai būtu mobilie dati) un atver savu `https://...ts.net` adresi. Jāparādās spēles sākuma ekrānam.
2. Pēc spēles izveides lobby ekrānā nospied **Copy invite link** un nosūti draugiem. Saite izskatās šādi: `https://...ts.net/#/join/ABCDE`.
3. Pārliecinies, ka spēlētāja telefonā augšā redzams `GPS 12 m` (nevis `GPS error`).

> Pirmo reizi sertifikāts un DNS ieraksts var nokļūt pasaulē līdz ~10 minūtēm. Ja lapa uzreiz neatveras, pagaidi un mēģini vēlreiz.

## 9. solis: dienas rezerves kopija (ieteicams)

```bash
chmod +x ~/Jet-Lag-Latvia/deploy/backup.sh
(crontab -l 2>/dev/null | grep -v jetlag-backup; echo "0 4 * * * JETLAG_DATA=$HOME/jetlag-data $HOME/Jet-Lag-Latvia/deploy/backup.sh # jetlag-backup") | crontab -
crontab -l
```

Kopijas glabājas mapē `~/jetlag-data/backups` (14 dienas).

---

## Ikdienas komandas

| Ko darīt | Komanda |
|---|---|
| Vai spēle darbojas? | `systemctl status jetlag --no-pager` |
| Skatīties žurnālu (live) | `journalctl -u jetlag -f` |
| Pārstartēt serveri | `sudo systemctl restart jetlag` |
| Apturēt serveri | `sudo systemctl stop jetlag` |
| Vai atbild? | `curl -s http://127.0.0.1:8080/api/health` |
| Kāda ir publiskā saite? | `tailscale funnel status` |
| Izslēgt publisko piekļuvi | `sudo tailscale funnel --https=443 off` |
| Atkal ieslēgt | `sudo tailscale funnel --bg 8080` |

### Atjaunināt spēli uz jaunāko versiju

```bash
cd ~/Jet-Lag-Latvia && git pull && sudo systemctl restart jetlag
```

Notiekošās spēles turpinās, jo dati ir atsevišķā mapē un tiek saglabāti drošā veidā.

---

## Problēmu risināšana

**Lapa "griežas" un neatveras**

1. Pārbaudi, vai serveris atbild: `curl -s http://127.0.0.1:8080/api/health`. Ja nav atbildes: `sudo systemctl restart jetlag`.
2. Pārbaudi Funnel: `tailscale funnel status`. Jābūt rindai `proxy http://127.0.0.1:8080`.
3. Testē no telefona uz **mobilajiem datiem**, nevis no ierīces, kas pati ir tavā Tailscale tīklā.
4. Pagaidi līdz 10 minūtēm pēc pirmās ieslēgšanas.
5. No paša Pi pārbaudi publisko adresi: `curl -sv --max-time 20 https://TAVA-ADRESE.ts.net/api/health`.

**`Address already in use` (ports 8080 aizņemts)**

Kāds cits process jau izmanto 8080. Noskaidro, kas:

```bash
sudo ss -ltnp | grep 8080
```

* Ja tas ir vecs `python3 ... app.py`, aptur to: `pkill -f "server/app.py"` un tad `sudo systemctl restart jetlag`.
* Ja tā ir cita programma, izvēlies citu portu, piemēram 8090: nomaini `8080` uz `8090` failā `/etc/systemd/system/jetlag.service`, tad `sudo systemctl daemon-reload && sudo systemctl restart jetlag` un `sudo tailscale funnel --bg 8090`.

**Serveris ir ieslēgts, bet nereaģē** (savienojumi "karājas")

```bash
sudo systemctl restart jetlag
journalctl -u jetlag -n 50 --no-pager
```

**Telefonā augšā `GPS error` / "GPS needs HTTPS"**

Lapa nav atvērta caur `https://` adresi. Izmanto Funnel adresi, nevis `http://192...`.

**`Funnel is not enabled on your tailnet`**

Atver komandas izvadē parādīto saiti un apstiprini, vai skat. 5. soli.

**Spēles dati**

Viss atrodas failā `~/jetlag-data/games.json` (un augšupielādētās bildes `~/jetlag-data/uploads`). Rezerves kopijas: `~/jetlag-data/backups`.

---

## Lielā komanda (visu vienā reizē)

Ielīmē **visu bloku** terminālī un nospied Enter. Tas: instalē vajadzīgo, lejupielādē spēli, uztaisa pakalpojumu, kas startē pats, uzstāda Tailscale, publicē spēli ar Funnel un ieliek dienas rezerves kopiju.

Pirms ielīmēšanas ņem vērā:

* Ja jaunākās izmaiņas vēl nav `main` zarā, rindā `BRANCH=main; PORT=8080; set -e` nomaini `main` uz `feature/jet-lag-latvia-app`.
* Visu bloku ietver iekavas `( ... )`, lai kļūdas gadījumā nenoslēgtos tava termināļa sesija.
* Komanda **apstāsies uz `sudo tailscale up`**, līdz atvērsi parādīto saiti un ielogosies Tailscale (tikai pirmajā reizē). Pēc tam turpinās pati.
* Ja beigās `tailscale funnel` parāda saiti `Funnel is not enabled`, atver to, apstiprini un vēlreiz palaid tikai pēdējās divas komandas (`sudo tailscale funnel --bg 8080` un `tailscale funnel status`).

```bash
(
BRANCH=main; PORT=8080; set -e
sudo apt update && sudo apt install -y git python3 curl
cd "$HOME"
if [ -d Jet-Lag-Latvia/.git ]; then cd Jet-Lag-Latvia && git fetch --all && git checkout "$BRANCH" && git pull; else git clone -b "$BRANCH" https://github.com/Linards888/Jet-Lag-Latvia.git && cd Jet-Lag-Latvia; fi
pkill -f "server/app.py" 2>/dev/null || true
mkdir -p "$HOME/jetlag-data"
[ -d "$HOME/Jet-Lag-Latvia/data" ] && cp -rn "$HOME/Jet-Lag-Latvia/data/." "$HOME/jetlag-data/" 2>/dev/null || true
sudo tee /etc/systemd/system/jetlag.service >/dev/null <<EOF
[Unit]
Description=Jet Lag Latvia game server
After=network-online.target
Wants=network-online.target

[Service]
User=$(whoami)
WorkingDirectory=$HOME/Jet-Lag-Latvia
Environment=JETLAG_DATA=$HOME/jetlag-data
ExecStart=/usr/bin/python3 server/app.py --host 127.0.0.1 --port $PORT
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable jetlag && sudo systemctl restart jetlag
sleep 3 && curl -s "http://127.0.0.1:$PORT/api/health" && echo " <- serveris darbojas"
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
chmod +x "$HOME/Jet-Lag-Latvia/deploy/backup.sh"
(crontab -l 2>/dev/null | grep -v jetlag-backup; echo "0 4 * * * JETLAG_DATA=$HOME/jetlag-data $HOME/Jet-Lag-Latvia/deploy/backup.sh # jetlag-backup") | crontab -
sudo tailscale funnel --bg "$PORT"
tailscale funnel status
echo "=== Gatavs! Tava spēles saite ir redzama augstāk (https://...ts.net) ==="
)
```

Kad tas ir beidzies, atver redzamo `https://...ts.net` adresi telefonā (ar izslēgtu Wi-Fi), izveido spēli un nosūti draugiem uzaicinājuma saiti.
