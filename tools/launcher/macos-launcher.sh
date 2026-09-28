#!/bin/bash
# ui-icons-hub macOS 启动器
# 离线版：直接用浏览器打开随包内置的全量站点（file:// 已验证可正常检索、看源码、收藏）
# 联网版：打开线上站点（Apple 平台唯一合规的「App」形态就是安装到 Dock 的 Web App）
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
  osascript -e 'display alert "ui-icons-hub" message "站点文件缺失，请重新下载安装包。"' >/dev/null 2>&1
  exit 1
fi

open "$URL"

# 联网版额外提示：安装到 Dock 后即为独立 App
if [ "$MODE" = "online" ]; then
  osascript -e 'display notification "已打开在线版。在 Safari 中「分享 → 添加到 Dock」，即可像 App 一样独立启动。" with title "ui-icons-hub"' >/dev/null 2>&1
fi
