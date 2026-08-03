#!/usr/bin/env bash
# Launch one mobile-flagged Chromium demo instance with a throwaway
# profile in /tmp so it stays scriptable over CDP.
#
#   scripts/demo-mobile.sh [--port 5173] [--debug-port 9222]
#
# --port is the dev server the instance loads; --debug-port is its CDP
# endpoint. The instance keeps running after this script exits; kill it
# with
#   pkill -f 'chromium-mobile-demo-'
# and the profile is a plain /tmp dir (safe to rm -rf once closed).
# The blink-settings below force a coarse primary pointer with no hover
# (the app's touch UI: drag grips hidden, long-press drag armed).
# --touch-events alone only enables the TouchEvent API; the primary
# pointer stays fine and the desktop grip handles render. DPR is NOT
# emulated. After launch, demo-touch-emulate.ts adds DevTools-style
# touch emulation over CDP so mouse input fires TouchEvents (this is
# what makes long-press drag work with a mouse). It stays resident —
# CDP emulation resets when the client disconnects — and exits on its
# own when the browser closes.
set -euo pipefail

PORT=5173
DEBUG_PORT=9222

UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="${2:?--port needs a value}"; shift 2 ;;
    --port=*) PORT="${1#--port=}"; shift ;;
    --debug-port) DEBUG_PORT="${2:?--debug-port needs a value}"; shift 2 ;;
    --debug-port=*) DEBUG_PORT="${1#--debug-port=}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

APP_URL="http://localhost:${PORT}"

if (exec 3<>"/dev/tcp/127.0.0.1/${DEBUG_PORT}") 2>/dev/null; then
  echo "port ${DEBUG_PORT} is already in use — pass a different --debug-port." >&2
  exit 1
fi

profile=$(mktemp -d /tmp/chromium-mobile-demo-XXXXXXXX)
flatpak run org.chromium.Chromium \
  --user-data-dir="$profile" \
  --remote-debugging-port="$DEBUG_PORT" \
  --remote-allow-origins='*' \
  --app="$APP_URL" \
  --window-size=390,844 \
  --user-agent="$UA" \
  --touch-events=enabled \
  --blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1 \
  --no-first-run \
  --no-default-browser-check \
  >/dev/null 2>&1 &

deadline=$((SECONDS + 15))
until curl -sf "http://127.0.0.1:${DEBUG_PORT}/json/version" >/dev/null 2>&1; do
  (( SECONDS < deadline )) || {
    echo "Chromium on port ${DEBUG_PORT} never opened its DevTools endpoint" >&2
    exit 1
  }
  sleep 0.25
done

# DevTools-style touch emulation (mouse → TouchEvents, maxTouchPoints)
# is CDP-only, and Chromium resets the overrides when the CDP client
# disconnects — so the helper stays resident, holding its session until
# the browser exits (then it quits on its own).
ready_file="$profile/touch-emulation.ready"
bun "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/demo-touch-emulate.ts" \
  --debug-port "$DEBUG_PORT" --url "$APP_URL" --ready-file "$ready_file" \
  >"$profile/touch-emulation.log" 2>&1 &

deadline=$((SECONDS + 15))
until [[ -f "$ready_file" ]]; do
  (( SECONDS < deadline )) || {
    echo "touch emulation never applied — see $profile/touch-emulation.log" >&2
    exit 1
  }
  sleep 0.25
done

echo "instance  port=${DEBUG_PORT}  profile=${profile}"
