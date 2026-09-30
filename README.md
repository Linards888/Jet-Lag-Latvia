# Jet Lag: Latvia 🇱🇻

Play **Jet Lag: The Game**-style games across your own country - on Latvian trams, trains and buses, with Latvian discounts.
One small web app, three games, runs on a Raspberry Pi, works on every phone browser.

| Mode | Inspired by | Length |
|---|---|---|
| 🚆 **Race Across Latvia** | "We Raced The Entire Length Of Japan" | 3-10 days |
| 🫣 **Hide & Seek Across Latvia** | "We Played Hide And Seek Across Japan" | 1 round/day - 3 players × 2 hides = 6 days |
| 🏃 **Tag Across Latvia** (+ All-Stars) | "We Played Tag Across Europe" | 1-14 play days |

## Quick start (any computer, no installs besides Python)

```bash
python3 server/app.py --port 8080      # Python 3.8+, zero dependencies
```
Open `http://localhost:8080`, press **Create a game**, pick a mode. Others join with the 5-letter code (or the invite link) as **Player** or **Spectator**.

> **Phones need HTTPS for GPS.** Browsers only allow location access on `https://` pages (or `localhost`). See *Hosting* below - it takes 5 minutes.

## Roles & how cheating is prevented

* **Admin - exactly one per game.** Created together with the game. You get a one-time **admin key**; logging in with it on another device *revokes the old admin session*, so there is never more than one. Nobody else can become admin (8 wrong keys = 15 min lockout).
* **Player** - on a team (Race/Tag) or individual (Hide & Seek). **Spectator** - read-only; only sees public/delayed info.
* **Fair-play admin:** tick *"I also want to play"* and the server automatically withholds all secret information from you (hider's position, other teams' live GPS...) and you cannot judge your own team. Untick it and you're a neutral referee who sees everything.
* **The server is the referee.** Nothing is honour-system:
  * Hide & Seek questions (Radar, Thermometer, Matching, Measuring, Tentacles) are **answered by the server from the hider's real GPS**. Seekers never receive the hider's position; the hider can't lie.
  * "Found" and "Tag" need **both phones' GPS** within the distance. Check-ins need GPS inside the city radius.
  * Probing is throttled, so GPS checks can't be used as a free oracle.
* **Public, hash-chained log.** Every event - and every admin override with its reason - is in a log everyone can read. Each entry contains the SHA-256 of the previous one, so history can't be edited silently (badge in the *Log* tab).
* Speeds above 140 km/h get flagged publicly (car/taxi alert).
* Tokens are random, stored hashed on the server; PINs let people get back in from another device.

*What it can't stop:* a player spoofing their phone's GPS, or handing their phone to someone else. It's a game among friends - the log + flags make that obvious.

## The three games

**Race** - Latvia is split into **territories** (default: Kurzeme → Zemgale → Rīga & Pierīga → Vidzeme → Latgale; built from the official 43 administrative territories). In the lobby the admin repaints the map by tapping municipalities, renames/reorders/adds territories and disables cities. Teams must check in (GPS-verified) to cities **inside** their current territory, do a photo challenge (approved by the other teams or the referee), and clear `N` cities per territory. First to clear a territory gets a time bonus. Reach the finish city to stop the clock. A daily play window (e.g. 08:00-21:00) freezes the clock overnight.
*Is this city inside the territory?* The **Map** tab colours every municipality and city by territory, every city popup says "Inside X - open to you / locked", and there's a search box plus a "Where am I?" readout.

**Hide & Seek** - each player hides `hidesPerPlayer` times. Hider picks a zone (tap the map), then seekers ask questions, enter the zone, and find them. Score = survival time + question credit; longest total wins.

**Tag** - one team is IT and must tag another team physically. IT sees runners with a delay; score = total time spent as IT (lowest wins). *All-Stars* adds one-use powers (Ghost, Shield, Radar).

All numbers (radii, cooldowns, delays, windows, days...) are editable by the admin in the lobby.

## Hosting on a Raspberry Pi (runs for weeks)

Why it survives long games: no database to babysit; all state is one JSON file written atomically (temp file + `fsync` + rename, with a `.bak`), flushed a few seconds after every action and every 45 s for GPS data, and on shutdown. The process restarts itself (`systemd`) and time-based rules are computed from timestamps, so a reboot loses nothing.

1. **Install** (Raspberry Pi OS already has Python 3):
   ```bash
   git clone https://github.com/<you>/Jet-Lag-Latvia.git && cd Jet-Lag-Latvia
   python3 server/app.py --port 8080      # try it
   ```
2. **Run on boot:** edit the `User=`/paths in `deploy/jetlag.service`, then
   ```bash
   sudo cp deploy/jetlag.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now jetlag
   ```
   Data lives in `~/jetlag-data` (`JETLAG_DATA`). Logs: `journalctl -u jetlag -f`.
3. **Get HTTPS + a public address** (no port forwarding, works behind any router). Pick one:
   * **Tailscale Funnel** (free, stable `https://pi.<tailnet>.ts.net` address, no domain needed): install Tailscale on the Pi, enable Funnel in the admin console, then `sudo tailscale funnel --bg 8080`.
   * **Cloudflare Tunnel** (needs a domain on Cloudflare): `cloudflared tunnel create jetlag`, route `jetlag.yourdomain.com` to `http://localhost:8080`, `sudo cloudflared service install`. (A quick `cloudflared tunnel --url http://localhost:8080` works for testing, but its URL changes on restart - don't use it for a week-long game.)
4. **Backups:** `crontab -e` → `0 4 * * * /home/pi/Jet-Lag-Latvia/deploy/backup.sh`.
5. **Tip:** a USB SSD or a good SD card is nicer than a cheap one - the file is rewritten every ~45 s while a game is live (a few hundred KB).

Update later with `git pull && sudo systemctl restart jetlag` - running games continue.

## Playing tips

* Everyone opens the site in their phone browser and taps *Share → Add to Home Screen*.
* **Keep the screen on and the page open** while playing - browsers can't track GPS in the background. The app requests a screen wake-lock automatically; a cheap power bank in the pocket helps.
* Allow location ("precise") when the browser asks. The 📍 chip in the top bar shows GPS accuracy.
* Lost your phone? *Join → Get back in* with your name + PIN. Admin: *Join → Admin* with the admin key.

## Development

```bash
python -m unittest discover -s tests -v     # 16 tests: rules, anti-cheat, HTTP, SSE, uploads
python tools/build_geodata.py               # rebuild territories from tools/raw (optional)
```
* `server/` - pure-stdlib Python: `app.py` (HTTP + SSE), `game.py` (members, auth, lifecycle), `race.py` / `hide.py` / `tag.py` (rules), `geo.py`, `core.py`.
* `public/` - no-build front end (Preact + htm + Leaflet, vendored so it works without a CDN).
* Change cities: edit `tools/build_cities.py` and run it. Map tiles come from OpenStreetMap (needs internet on the phones); the territory colours work even without tiles.
* Boundary data: geoBoundaries / Valsts zemes dienests (CC BY 4.0).
