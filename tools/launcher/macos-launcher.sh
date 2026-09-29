#!/bin/bash
# ui-icons-hub macOS launcher
# Offline build: open the bundled full site directly in the browser (file://,
# verified to search / view source / collect favorites correctly).
# Online build: open the live site (on Apple platforms the only compliant "App"
# form is a Dock-installed Web App).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SITE="$HERE/../Resources/site"
URL=""
MODE="$(cat "$HERE/../Resources/mode.txt" 2>/dev/null || echo offline)"

if [ -f "$SITE/index.html" ]; then
  URL="file://$SITE/index.html"
fi

if [ "$MODE" = "online" ]; then
  URL="https://sitong-zhang.github.io/ui-icons-hub/"
fi

if [ -z "$URL" ]; then
  osascript -e 'display alert "ui-icons-hub" message "Site files are missing. Please re-download the installer."' >/dev/null 2>&1
  exit 1
fi

open "$URL"

# Extra hint for the online build: adding to the Dock makes it a standalone app
if [ "$MODE" = "online" ]; then
  osascript -e 'display notification "Online version opened. In Safari choose Share → Add to Dock to launch it like a standalone app." with title "ui-icons-hub"' >/dev/null 2>&1
fi
