#!/bin/sh
# Daily backup of the game state (keeps 14 days).  Cron example:  0 4 * * *  /home/pi/Jet-Lag-Latvia/deploy/backup.sh
DATA="${JETLAG_DATA:-$HOME/jetlag-data}"
DEST="$DATA/backups"
mkdir -p "$DEST"
[ -f "$DATA/games.json" ] && cp "$DATA/games.json" "$DEST/games-$(date +%Y%m%d-%H%M).json"
find "$DEST" -name 'games-*.json' -mtime +14 -delete
