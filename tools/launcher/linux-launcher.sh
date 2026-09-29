#!/usr/bin/env bash
# ui-icons-hub Linux launcher
# Serve the site locally on 127.0.0.1 (using the system python3), then open it
# in the default browser.
# Use http:// instead of file:// so the Service Worker can register, which keeps
# the auto-cache stats under "My Downloads" accurate.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SITE="$HERE/site"
[ -d "$SITE" ] || SITE="$HERE"

PY="$(command -v python3 || command -v python)"
if [ -z "${PY:-}" ]; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$SITE/index.html"
    exit 0
  fi
  echo "python3 or xdg-open is required" >&2
  exit 1
fi

PORT="$("$PY" -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
cd "$SITE"
"$PY" -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT INT TERM
sleep 1
URL="http://127.0.0.1:$PORT/index.html"
echo "ui-icons-hub: $URL"
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; else echo "Please open $URL manually"; fi
# Keep the server alive until the user presses Ctrl+C or closes the terminal
wait $SRV
