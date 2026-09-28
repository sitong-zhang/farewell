# Android 端

一个极薄的 WebView 壳，业务逻辑与数据全在站点里。两个 flavor：

| flavor | 包名后缀 | 启动地址 | 体积 | 说明 |
| --- | --- | --- | --- | --- |
| `online` | `.online` | `https://sitong-zhang.github.io/ui-icons-hub/` | 约 3 MB | 联网版。内置全库检索索引，命中后按需从线上仓库拉取图标数据，存到 App 内，「我的 → 已下载」可查看 |
| `offline` | `.offline` | `file:///android_asset/site/index.html` | 约 120 MB | 离线版。215 套 / 352,371 个 SVG + 797 个 PNG 全部内置，断网可用 |

## 本地构建

```bash
# 联网版
./gradlew assembleOnlineDebug

# 离线版：先把站点复制到 assets
mkdir -p app/src/offline/assets
rsync -a --exclude .git ../ app/src/offline/assets/site/
./gradlew assembleOfflineDebug
```

产物在 `app/build/outputs/apk/{online,offline}/debug/`。

GitHub Actions 会自动完成上面两步并把两个 APK 传到 Release。
