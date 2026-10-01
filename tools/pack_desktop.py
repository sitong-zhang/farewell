#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build installers for three platforms (Windows / macOS / Linux) x two variants (online / offline) plus an offline full archive.

Online variant: ships only the shell (pages / search index / skill pages); icon data is downloaded on demand from GitHub Pages and cached locally.
Offline variant: all 215 sets / 352,371 SVGs + 797 PNGs are bundled in, usable without a network.

    python3 tools/pack_desktop.py [all|online|offline]
"""
import os, shutil, struct, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)            # The parent directory of tools/ is the site root
DIST = os.environ.get("UIH_DIST", os.path.join(REPO, "dist"))
LAUN = os.path.join(HERE, "launcher")
VER = "1.0.0"

EXCLUDE_DIRS = {".git", "__pycache__", "dist", "tools", "android"}


def log(*a):
    print("[%s]" % time.strftime("%H:%M:%S"), *a, flush=True)


def copy_site(dst, online):
    """When online=True, skip data/ and app-icons/png/ (changed to fetch on demand from the web)"""
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
    """Minimal usable .icns: stuff the PNG directly into an icns container (ic07/ic08/ic09)"""
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
BrandingText "ui-icons-hub · UI Icons & Design Resource Library"

!define MUI_ICON "{ico}"
!define MUI_UNICON "{ico}"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "Site files"
  SetOutPath "$INSTDIR"
  File "{ico}"
  File "{cmdname}"
  File "{ps1}"
  SetOutPath "$INSTDIR\\site"
  File /r "{site_src}\\*.*"
  WriteUninstaller "$INSTDIR\\uninstall.exe"
SectionEnd

Section "Shortcuts"
  CreateDirectory "$SMPROGRAMS\\UI Icons Hub"
  CreateShortcut "$SMPROGRAMS\\UI Icons Hub\\UI Icons Hub{suffix}.lnk" "$INSTDIR\\{cmdname}" "" "$INSTDIR\\{ico}"
  CreateShortcut "$SMPROGRAMS\\UI Icons Hub\\Uninstall.lnk" "$INSTDIR\\uninstall.exe"
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
        label="(Offline)" if variant == "offline" else "(Online)",
        out=out, ico=ico, cmdname="UI Icons Hub.cmd", ps1=os.path.join(work, "serve.ps1"),
        site_src=site_src, suffix=" (Offline)" if variant == "offline" else ""))
    log("makensis %s …" % variant)
    r = subprocess.run(["makensis", "-V2", nsi], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-2000:], r.stderr[-1000:])
        return None
    log("Generated %s: %.1f MB" % (out, os.path.getsize(out) / 1024 / 1024))
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
        # For the offline variant, put the full site in Resources/site; the launcher opens it directly in a browser (file:// has been verified to work)
        shutil.copytree(site_src, os.path.join(app, "Contents", "Resources", "site"))
    if os.path.exists(out_zip):
        os.remove(out_zip)
    log("Packaging %s ..." % os.path.basename(out_zip))
    subprocess.run(["zip", "-r", "-q", "-9", out_zip, "UI Icons Hub.app"], cwd=work, check=True)
    log("Generated %s: %.1f MB" % (out_zip, os.path.getsize(out_zip) / 1024 / 1024))
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
    open(os.path.join(root, "install.sh"), "w").write(
        "#!/usr/bin/env bash\nset -e\n"
        "SRC=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\n"
        "BIN=\"$HOME/.local/share/ui-icons-hub\"\n"
        "mkdir -p \"$BIN\" \"$HOME/.local/bin\" \"$HOME/.local/share/applications\" \"$HOME/.local/share/icons/hicolor/512x512/apps\"\n"
        "cp -r \"$SRC\"/* \"$BIN\"/\n"
        "ln -sf \"$BIN/ui-icons-hub\" \"$HOME/.local/bin/ui-icons-hub\"\n"
        "cp \"$BIN/ui-icons-hub.png\" \"$HOME/.local/share/icons/hicolor/512x512/apps/ui-icons-hub.png\"\n"
        "sed \"s|^Exec=.*|Exec=$BIN/ui-icons-hub|\" \"$BIN/ui-icons-hub.desktop\" > \"$HOME/.local/share/applications/ui-icons-hub.desktop\"\n"
        "echo \"Installed to $BIN; search for 'UI Icons Hub' in the application menu to launch\"\n")
    os.chmod(os.path.join(root, "install.sh"), 0o755)
    shutil.copytree(site_src, os.path.join(root, "site"))
    log("Packaging %s ..." % os.path.basename(out_tgz))
    subprocess.run(["tar", "-czf", out_tgz, "-C", work, "ui-icons-hub"], check=True)
    log("Generated %s: %.1f MB" % (out_tgz, os.path.getsize(out_tgz) / 1024 / 1024))
    return out_tgz


OFFLINE_README = """ui-icons-hub Offline Edition
====================

215 icon sets / 352,371 SVG icons + 797 iOS26-style app icon PNGs,
with the Software, Website, and Game design-skill sections all bundled in — fully usable offline.

How to use
----------
1. Extract to any directory (avoid Chinese characters and spaces in the path if possible).
2. Double-click index.html to open it in a browser.
   - Chrome: Menu -> More tools -> Create shortcut -> check "Open in window" to get a standalone app window.
   - macOS: Drag to the Dock, or in Safari use "File -> Add to Dock".
3. If the browser restricts local files, run this in the directory:
       python3 -m http.server 8899
   then visit http://127.0.0.1:8899

Directory layout
----------------
  index.html        Main site (full-library search + design-skill entry + bottom app navigation)
  search-data.js    Full search index (352,371 icon names + 32,142 aliases + 183 Chinese-intent entries)
  data/             Icon data chunks, loaded on demand (913 files)
  app-icons/        iOS26-style app icon section
  skills/           Design skills: Software / Website / Game
  vendor/           FlexSearch search engine (Apache-2.0)

License
-------
Icon assets are copyrighted by their respective upstream projects and have no single unified license; please refer to each set's actual upstream license.
See README.md for the full inclusion list and LICENSE for the licensing summary. This site's code and build scripts are MIT.
"""


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    os.makedirs(DIST, exist_ok=True)
    shell = os.path.join(DIST, "shell")
    offline = os.path.join(DIST, "offline")

    made = {}
    if which in ("all", "online"):
        log("Generating the online shell ...")
        n = copy_site(shell, online=True)
        log("Online shell: %d files" % n)
        made["win_online"] = build_windows("online", shell, os.path.join(DIST, "ui-icons-hub-online-windows-setup.exe"))
        made["linux_online"] = build_linux("online", shell, os.path.join(DIST, "ui-icons-hub-online-linux.tar.gz"))
        made["mac_online"] = build_macos("online", shell, os.path.join(DIST, "ui-icons-hub-online-macos.zip"))

    if which in ("all", "offline"):
        log("Generating the full offline site ...")
        n = copy_site(offline, online=False)
        log("Offline site: %d files" % n)
        # Tag each page with the __OFFLINE marker, hiding online-only actions like "Download all / Clear cache"
        tag = '<script>window.__OFFLINE=true;</script>'
        for rel in ["index.html", "app-icons/index.html",
                    "skills/software/index.html", "skills/website/index.html", "skills/game/index.html"]:
            p = os.path.join(offline, rel)
            if not os.path.exists(p) or tag in open(p, encoding="utf-8").read():
                continue
            s = open(p, encoding="utf-8").read()
            s = s.replace("<head>", "<head>" + tag, 1)
            open(p, "w", encoding="utf-8").write(s)
        open(os.path.join(offline, "OFFLINE-README.txt"), "w", encoding="utf-8").write(OFFLINE_README)
        open(os.path.join(offline, "OFFLINE-README.md"), "w", encoding="utf-8").write(OFFLINE_README)
        made["win_offline"] = build_windows("offline", offline, os.path.join(DIST, "ui-icons-hub-offline-windows-setup.exe"))
        made["mac_offline"] = build_macos("offline", offline, os.path.join(DIST, "ui-icons-hub-offline-macos.zip"))
        made["linux_offline"] = build_linux("offline", offline, os.path.join(DIST, "ui-icons-hub-offline-linux.tar.gz"))
        z = os.path.join(DIST, "ui-icons-hub-offline-full.zip")
        if os.path.exists(z):
            os.remove(z)
        log("Packaging the full offline archive ...")
        subprocess.run(["zip", "-r", "-q", "-9", z, "."], cwd=offline, check=True)
        made["zip_offline"] = z
        log("Generated %s: %.1f MB" % (z, os.path.getsize(z) / 1024 / 1024))

    print("\nArtifacts:")
    for k, v in made.items():
        print("  %-14s %s  %s" % (k, v, ("%.1f MB" % (os.path.getsize(v) / 1024 / 1024)) if v and os.path.exists(v) else "failed"))


if __name__ == "__main__":
    main()
