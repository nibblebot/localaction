#!/usr/bin/env bash
# Launch N mobile-flagged Chromium demo instances for side-by-side
# comparison. Each gets a throwaway profile in /tmp and a sequential
# CDP debug port (base, base+1, ...) so every instance stays scriptable.
#
# Change SERVER_PORT here to point all instances at a different dev
# server; optionally override per run:
#   scripts/demo-mobile.sh [--count N] [serverPort] [debugBasePort]
# Defaults: count 2, serverPort 5173, debugBasePort 9222.
#
# The instances keep running after this script exits; kill them with
#   pkill -f 'chromium-mobile-demo-'
# and the profiles are plain /tmp dirs (safe to rm -rf once closed).
# Mobile emulation (pointer: coarse, DPR) is NOT applied here — attach
# CDP per instance with the printed commands, e.g. the emulation script
# from the pairing session (bun /tmp/emulate-mobile.mjs <port> <host>).
set -euo pipefail

# Dev server every instance loads. The one place to change.
SERVER_PORT=5173
DEBUG_BASE_PORT=9222
COUNT=2

UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

positional=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --count) COUNT="${2:?--count needs a value}"; shift 2 ;;
    --count=*) COUNT="${1#--count=}"; shift ;;
    *) positional+=("$1"); shift ;;
  esac
done
[[ ${#positional[@]} -ge 1 ]] && SERVER_PORT="${positional[0]}"
[[ ${#positional[@]} -ge 2 ]] && DEBUG_BASE_PORT="${positional[1]}"

if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || (( COUNT < 1 )); then
  echo "--count must be an integer >= 1, got \"$COUNT\"" >&2
  exit 1
fi

APP_URL="http://localhost:${SERVER_PORT}"
APP_HOST="localhost:${SERVER_PORT}"

port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

wait_for_devtools() {
  local port=$1 deadline=$((SECONDS + 15))
  until curl -sf "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1; do
    (( SECONDS < deadline )) || {
      echo "Chromium on port ${port} never opened its DevTools endpoint" >&2
      exit 1
    }
    sleep 0.25
  done
}

ports=()
for ((i = 0; i < COUNT; i++)); do
  ports+=($((DEBUG_BASE_PORT + i)))
done

for port in "${ports[@]}"; do
  if port_busy "$port"; then
    echo "port ${port} is already in use — pass a different debug base port (instances use base, base+1, ...)." >&2
    exit 1
  fi
done

profiles=()
for port in "${ports[@]}"; do
  profile=$(mktemp -d /tmp/chromium-mobile-demo-XXXXXXXX)
  profiles+=("$profile")
  flatpak run org.chromium.Chromium \
    --user-data-dir="$profile" \
    --remote-debugging-port="$port" \
    --remote-allow-origins='*' \
    --app="$APP_URL" \
    --window-size=390,844 \
    --user-agent="$UA" \
    --touch-events=enabled \
    --no-first-run \
    --no-default-browser-check \
    >/dev/null 2>&1 &
  wait_for_devtools "$port"
done

for i in "${!ports[@]}"; do
  echo "instance  port=${ports[$i]}  profile=${profiles[$i]}"
  echo "  emulate: bun /tmp/emulate-mobile.mjs ${ports[$i]} ${APP_HOST}"
done
