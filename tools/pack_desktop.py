#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打包三端（Windows / macOS / Linux）× 两版（联网 / 离线）安装包 + 离线全量压缩包。

联网版：只带外壳（页面 / 检索索引 / 技能页），图标数据按需从 GitHub Pages 下载并缓存到本机。
离线版：215 套 / 352,371 个 SVG + 797 个 PNG 全部内置，断网可用。

    python3 tools/pack_desktop.py [all|online|offline]
"""
import os, shutil, struct, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)            # tools/ 的上级就是站点根目录
DIST = os.environ.get("UIH_DIST", os.path.join(REPO, "dist"))
LAUN = os.path.join(HERE, "launcher")
VER = "1.0.0"

EXCLUDE_DIRS = {".git", "__pycache__", "dist", "tools", "android"}


def log(*a):
    print("[%s]" % time.strftime("%H:%M:%S"), *a, flush=True)


def copy_site(dst, online):
    """online=True 时跳过 data/ 与 app-icons/png/（改成按需从线上拉取）"""
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    os.makedirs(dst)
    n = 0
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            relf = os.path.relpath(os.path.join(root, f), REPO)
            parts = relf.split(os.sep)
            if online and (parts[0] == "data" or (len(parts) > 1 and parts[0] == "app-icons" and parts[1] == "png")):
                continue
            out = os.path.join(dst, relf)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            shutil.copy2(os.path.join(root, f), out)
            n += 1
    return n


def build_ico(png, ico):
    from PIL import Image
    Image.open(png).convert("RGBA").save(
        ico, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    return ico


def build_icns(png, icns):
    """最小可用 .icns：把 PNG 直接塞进 icns 容器（ic07/ic08/ic09）"""
    from PIL import Image
    im = Image.open(png).convert("RGBA")
    chunks = b""
    for code, size in (("ic07", 128), ("ic08", 256), ("ic09", 512)):
        buf = os.path.join("/tmp", "icns_%d.png" % size)
        im.resize((size, size), Image.LANCZOS).save(buf, "PNG")
        data = open(buf, "rb").read()
        chunks += code.encode("ascii") + struct.pack(">I", len(data) + 8) + data
    open(icns, "wb").write(b"icns" + struct.pack(">I", 8 + len(chunks)) + chunks)
    return icns


NSI_TMPL = r"""
Unicode true
SetCompressor /SOLID zlib
SetCompressorDictSize 32
!include "MUI2.nsh"

Name "UI Icons Hub {label}"
OutFile "{out}"
InstallDir "$LOCALAPPDATA\\ui-icons-hub{suffix}"
RequestExecutionLevel user
BrandingText "ui-icons-hub · UI 图标与设计资源库"

!define MUI_ICON "{ico}"
!define MUI_UNICON "{ico}"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "站点文件"
  SetOutPath "$INSTDIR"
  File "{ico}"
  File "{cmdname}"
  File "{ps1}"
  SetOutPath "$INSTDIR\\site"
  File /r "{site_src}\\*.*"
  WriteUninstaller "$INSTDIR\\uninstall.exe"
SectionEnd

Section "快捷方式"
  CreateDirectory "$SMPROGRAMS\\UI Icons Hub"
  CreateShortcut "$SMPROGRAMS\\UI Icons Hub\\UI Icons Hub{suffix}.lnk" "$INSTDIR\\{cmdname}" "" "$INSTDIR\\{ico}"
  CreateShortcut "$SMPROGRAMS\\UI Icons Hub\\卸载.lnk" "$INSTDIR\\uninstall.exe"
  CreateShortcut "$DESKTOP\\UI Icons Hub{suffix}.lnk" "$INSTDIR\\{cmdname}" "" "$INSTDIR\\{ico}"
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\\UI Icons Hub{suffix}.lnk"
  RMDir /r "$SMPROGRAMS\\UI Icons Hub"
SectionEnd
"""


def build_windows(variant, site_src, out):
    work = os.path.join(DIST, "nsi_%s" % variant)
    if os.path.isdir(work):
        shutil.rmtree(work)
    os.makedirs(work)
    ico = build_ico(os.path.join(REPO, "icons", "app-icon-512.png"), os.path.join(work, "uih.ico"))
    shutil.copy2(os.path.join(LAUN, "serve.ps1"), os.path.join(work, "serve.ps1"))
    shutil.copy2(os.path.join(LAUN, "UI Icons Hub.cmd"), os.path.join(work, "UI Icons Hub.cmd"))
    nsi = os.path.join(work, "%s.nsi" % variant)
    open(nsi, "w", encoding="utf-8").write(NSI_TMPL.format(
        label="（离线版）" if variant == "offline" else "（联网版）",
        out=out, ico=ico, cmdname="UI Icons Hub.cmd", ps1=os.path.join(work, "serve.ps1"),
        site_src=site_src, suffix="（离线）" if variant == "offline" else ""))
    log("makensis %s …" % variant)
    r = subprocess.run(["makensis", "-V2", nsi], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-2000:], r.stderr[-1000:])
        return None
    log("生成 %s：%.1f MB" % (out, os.path.getsize(out) / 1024 / 1024))
    return out


def build_macos(variant, site_src, out_zip):
    work = os.path.join(DIST, "macos_%s" % variant)
    app = os.path.join(work, "UI Icons Hub.app")
    if os.path.isdir(work):
        shutil.rmtree(work)
    os.makedirs(os.path.join(app, "Contents", "MacOS"))
    os.makedirs(os.path.join(app, "Contents", "Resources"))
    exe = os.path.join(app, "Contents", "MacOS", "ui-icons-hub")
    shutil.copy2(os.path.join(LAUN, "macos-launcher.sh"), exe)
    os.chmod(exe, 0o755)
    shutil.copy2(os.path.join(LAUN, "Info.plist"), os.path.join(app, "Contents", "Info.plist"))
    build_icns(os.path.join(REPO, "icons", "app-icon-512.png"),
               os.path.join(app, "Contents", "Resources", "AppIcon.icns"))
    open(os.path.join(app, "Contents", "Resources", "mode.txt"), "w").write(variant)
    if variant == "offline":
        # 离线版把全量站点放 Resources/site，启动器直接用浏览器打开（file:// 已验证可用）
        shutil.copytree(site_src, os.path.join(app, "Contents", "Resources", "site"))
    if os.path.exists(out_zip):
        os.remove(out_zip)
    log("打包 %s …" % os.path.basename(out_zip))
    subprocess.run(["zip", "-r", "-q", "-9", out_zip, "UI Icons Hub.app"], cwd=work, check=True)
    log("生成 %s：%.1f MB" % (out_zip, os.path.getsize(out_zip) / 1024 / 1024))
    return out_zip


def build_linux(variant, site_src, out_tgz):
    work = os.path.join(DIST, "linux_%s" % variant)
    root = os.path.join(work, "ui-icons-hub")
    if os.path.isdir(work):
        shutil.rmtree(work)
    os.makedirs(root)
    shutil.copy2(os.path.join(LAUN, "linux-launcher.sh"), os.path.join(root, "ui-icons-hub"))
    os.chmod(os.path.join(root, "ui-icons-hub"), 0o755)
    shutil.copy2(os.path.join(LAUN, "ui-icons-hub.desktop"), os.path.join(root, "ui-icons-hub.desktop"))
    shutil.copy2(os.path.join(REPO, "icons", "app-icon-512.png"), os.path.join(root, "ui-icons-hub.png"))
    open(os.path.join(root, "安装.sh"), "w").write(
        "#!/usr/bin/env bash\nset -e\n"
        "SRC=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\n"
        "BIN=\"$HOME/.local/share/ui-icons-hub\"\n"
        "mkdir -p \"$BIN\" \"$HOME/.local/bin\" \"$HOME/.local/share/applications\" \"$HOME/.local/share/icons/hicolor/512x512/apps\"\n"
        "cp -r \"$SRC\"/* \"$BIN\"/\n"
        "ln -sf \"$BIN/ui-icons-hub\" \"$HOME/.local/bin/ui-icons-hub\"\n"
        "cp \"$BIN/ui-icons-hub.png\" \"$HOME/.local/share/icons/hicolor/512x512/apps/ui-icons-hub.png\"\n"
        "sed \"s|^Exec=.*|Exec=$BIN/ui-icons-hub|\" \"$BIN/ui-icons-hub.desktop\" > \"$HOME/.local/share/applications/ui-icons-hub.desktop\"\n"
        "echo \"已安装到 $BIN，在应用菜单搜索「UI Icons Hub」即可启动\"\n")
    os.chmod(os.path.join(root, "安装.sh"), 0o755)
    shutil.copytree(site_src, os.path.join(root, "site"))
    log("打包 %s …" % os.path.basename(out_tgz))
    subprocess.run(["tar", "-czf", out_tgz, "-C", work, "ui-icons-hub"], check=True)
    log("生成 %s：%.1f MB" % (out_tgz, os.path.getsize(out_tgz) / 1024 / 1024))
    return out_tgz


OFFLINE_README = """ui-icons-hub 离线版
====================

215 套图标库 / 352,371 个 SVG 图标 + 797 个 iOS26 风格应用图标 PNG，
软件 · 网站 · 游戏三个设计技能分区全部内置，断网也能完整使用。

怎么用
------
1. 解压到任意目录（路径尽量不含中文和空格）。
2. 双击 index.html 用浏览器打开即可。
   - Chrome：菜单 → 更多工具 → 创建快捷方式 → 勾选「在窗口中打开」，就是独立 App 窗口。
   - macOS：拖到 Dock，或 Safari 里「文件 → 添加到 Dock」。
3. 若浏览器限制本地文件，在本目录执行：
       python3 -m http.server 8899
   然后访问 http://127.0.0.1:8899

目录
----
  index.html        主站（全库检索 + 设计技能入口 + 底部 App 导航）
  search-data.js    全量检索索引（352,371 个图标名 + 32,142 个别名 + 183 条中文意图）
  data/             图标数据分片，按需加载（913 个文件）
  app-icons/        iOS26 风格应用图标分区
  skills/           设计技能：软件 / 网站 / 游戏
  vendor/           FlexSearch 检索引擎（Apache-2.0）

许可证
------
图标素材版权归各上游项目所有，没有统一许可证，请以每个集合上游的实际许可证为准。
完整收录清单见 README.md，授权口径见 LICENSE。本站代码与生成脚本为 MIT。
"""


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    os.makedirs(DIST, exist_ok=True)
    shell = os.path.join(DIST, "shell")
    offline = os.path.join(DIST, "offline")

    made = {}
    if which in ("all", "online"):
        log("生成联网版外壳 …")
        n = copy_site(shell, online=True)
        log("联网版外壳：%d 个文件" % n)
        made["win_online"] = build_windows("online", shell, os.path.join(DIST, "ui-icons-hub-online-windows-setup.exe"))
        made["linux_online"] = build_linux("online", shell, os.path.join(DIST, "ui-icons-hub-online-linux.tar.gz"))
        made["mac_online"] = build_macos("online", shell, os.path.join(DIST, "ui-icons-hub-online-macos.zip"))

    if which in ("all", "offline"):
        log("生成离线版全量站点 …")
        n = copy_site(offline, online=False)
        log("离线版站点：%d 个文件" % n)
        # 给每个页面打上 __OFFLINE 标记，隐藏「下载全部 / 清除缓存」等联网版操作
        tag = '<script>window.__OFFLINE=true;</script>'
        for rel in ["index.html", "app-icons/index.html",
                    "skills/software/index.html", "skills/website/index.html", "skills/game/index.html"]:
            p = os.path.join(offline, rel)
            if not os.path.exists(p) or tag in open(p, encoding="utf-8").read():
                continue
            s = open(p, encoding="utf-8").read()
            s = s.replace("<head>", "<head>" + tag, 1)
            open(p, "w", encoding="utf-8").write(s)
        open(os.path.join(offline, "使用说明.txt"), "w", encoding="utf-8").write(OFFLINE_README)
        open(os.path.join(offline, "OFFLINE-README.md"), "w", encoding="utf-8").write(OFFLINE_README)
        made["win_offline"] = build_windows("offline", offline, os.path.join(DIST, "ui-icons-hub-offline-windows-setup.exe"))
        made["mac_offline"] = build_macos("offline", offline, os.path.join(DIST, "ui-icons-hub-offline-macos.zip"))
        made["linux_offline"] = build_linux("offline", offline, os.path.join(DIST, "ui-icons-hub-offline-linux.tar.gz"))
        z = os.path.join(DIST, "ui-icons-hub-offline-full.zip")
        if os.path.exists(z):
            os.remove(z)
        log("打包离线全量压缩包 …")
        subprocess.run(["zip", "-r", "-q", "-9", z, "."], cwd=offline, check=True)
        made["zip_offline"] = z
        log("生成 %s：%.1f MB" % (z, os.path.getsize(z) / 1024 / 1024))

    print("\n产物：")
    for k, v in made.items():
        print("  %-14s %s  %s" % (k, v, ("%.1f MB" % (os.path.getsize(v) / 1024 / 1024)) if v and os.path.exists(v) else "失败"))


if __name__ == "__main__":
    main()
