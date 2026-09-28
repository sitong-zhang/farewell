#!/usr/bin/env bash
# ui-icons-hub Linux 启动器
# 在本机 127.0.0.1 起一个静态服务（用系统自带的 python3），再用默认浏览器打开。
# 用 http:// 而不是 file://，是为了让 Service Worker 能注册，
# 这样「我的 → 已下载」里的自动缓存统计才准确。
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
  echo "需要 python3 或 xdg-open" >&2
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
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; else echo "请手动打开 $URL"; fi
# 保持服务，直到用户 Ctrl+C 或关闭终端
wait $SRV
