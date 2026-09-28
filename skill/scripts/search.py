#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ui-icons-hub 检索工具（离线可用，零依赖）

    python3 search.py "购物车"                    # 中文意图检索，默认 20 条
    python3 search.py "齿轮" --svg --limit 3      # 连 SVG 源码一起输出
    python3 search.py home --set feathericons__feather
    python3 search.py --collections               # 列出 215 套图标库
    python3 search.py --info tabler__tabler-icons # 某套库的详情
    python3 search.py --pick "极简线性，做后台管理界面"

数据来源（按顺序自动选择）：
  1) 环境变量 UIH_BASE 指向的目录（需含 index.json 与 data/）
  2) 本脚本所在技能的 assets/ 目录
  3) 环境变量 UIH_CDN（默认 jsDelivr 上的本仓库）
"""
import argparse
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets"))
DEFAULT_CDN = "https://cdn.jsdelivr.net/gh/sitong-zhang/ui-icons-hub@main/"

_IDX = None
_IDX_FROM = None
_SETS = {}
_CHUNK = {}


def _read(base, rel):
    if base.startswith("http"):
        with urllib.request.urlopen(base + rel, timeout=120) as r:
            return r.read().decode("utf-8")
    with open(os.path.join(base, rel), encoding="utf-8") as f:
        return f.read()


def load_index(base=None):
    global _IDX, _IDX_FROM
    if _IDX is not None:
        return _IDX
    cands = []
    for b in (base, os.environ.get("UIH_BASE"), ASSETS, os.environ.get("UIH_CDN") or DEFAULT_CDN):
        if not b:
            continue
        if b.startswith("http") or os.path.exists(os.path.join(b, "index.json")):
            cands.append(b.rstrip("/") + "/")
    last = None
    for b in cands:
        try:
            _IDX = json.loads(_read(b, "index.json"))
            _IDX_FROM = b
            for s in _IDX["sets"]:
                _SETS[s["slug"]] = s
            return _IDX
        except Exception as e:  # noqa: BLE001
            last = e
    raise SystemExit("无法加载索引：%s" % last)


def load_chunk(slug, i):
    """读取一个数据分片。

    分片格式：window.__ADD2("owner/repo", [[name, body, (w, h)?], ...], idx);
    这里不用 exec（分片首行的中文注释会让 compile 报编码错），直接截取 JSON 数组再解析。
    """
    key = "%s__%d" % (slug, i)
    if key in _CHUNK:
        return _CHUNK[key]
    code = _read(_IDX_FROM, "data/%s.js" % key)
    start = code.find("[[")
    if start < 0:
        _CHUNK[key] = {}
        return _CHUNK[key]
    depth, instr, esc = 0, False, False
    end = None
    for k in range(start, len(code)):
        ch = code[k]
        if instr:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                instr = False
            continue
        if ch == '"':
            instr = True
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = k + 1
                break
    pairs = json.loads(code[start:end]) if end else []
    m = {p[0]: p for p in pairs}
    _CHUNK[key] = m
    return m


def expand(q):
    syn = _IDX.get("syn", {})
    whole = (q or "").strip()
    out = []

    def push(v):
        if v and v not in out:
            out.append(v)

    push(whole)
    hit = syn.get(whole)
    if hit is None:
        for k in syn:
            if len(k) >= 2 and k in whole:
                hit = syn[k]
                break
    if hit:
        for t in hit:
            push(t)
    if re.search(r"\s", whole):
        for w in whole.split():
            push(w)
            for t in syn.get(w, []):
                push(t)
    return out


def score(name, terms):
    ln = name.lower()
    best, where = 99, -1
    for i, t in enumerate(terms):
        t = (t or "").lower()
        if not t or t not in ln:
            continue
        p = ln.index(t)
        s = 0 if (p == 0 and len(ln) == len(t)) else 1 if p == 0 else 2 if ln[p - 1] in "-_ " else 3
        if s < best:
            best, where = s, i
        if best == 0:
            break
    return best, where


def index_of(slug, name):
    arr = _SETS.get(slug, {}).get("chunks") or []
    for c, names in enumerate(arr):
        if name in names:
            return c
    return None


def search(q, limit=20, set_filter=None):
    terms = expand(q)
    hits = []
    for slug, s in _SETS.items():
        if set_filter and slug != set_filter:
            continue
        for c, names in enumerate(s["chunks"]):
            for n in names:
                sc, where = score(n, terms)
                if sc < 99:
                    hits.append((sc, where, len(n), n, slug, c, None))
        for a, owner in (s.get("alias") or []):
            sc, where = score(a, terms)
            if sc < 99:
                pos = index_of(slug, owner)
                if pos is not None:
                    hits.append((sc + 1, where, len(owner), owner, slug, pos, a))
    hits.sort(key=lambda x: (x[0], x[1], x[2], x[3]))
    seen, out = set(), []
    for h in hits:
        k = h[4] + "/" + h[3]
        if k in seen:
            continue
        seen.add(k)
        out.append(h)
        if len(out) >= limit:
            break
    return out


def wrap_svg(slug, body, pair):
    if len(pair) > 2:
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s %s">%s</svg>' % (pair[2], pair[3], body)
    w = _SETS.get(slug, {}).get("wrap") or '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    cut = w.find("</svg>")
    if cut > 0:
        w = w[:cut]
    return w + body + "</svg>"


def brief(slug):
    s = _SETS.get(slug, {})
    return {"set": s.get("name"), "repo": s.get("repo"), "license": s.get("license"),
            "homepage": s.get("homepage"), "group": s.get("group"), "mono": s.get("mono")}


def pick(need, limit=3):
    kw = (need or "").lower()
    want_mono = bool(re.search(r"线性|线框|描边|outline|stroke|minimal|极简|细|通用|后台|管理", kw))
    want_brand = bool(re.search(r"品牌|logo|厂商|brand", kw))
    want_emoji = bool(re.search(r"emoji|表情|旗帜|国旗", kw))
    want_pixel = bool(re.search(r"像素|pixel", kw))
    out = []
    for s in _IDX["sets"]:
        sc = 0.0
        low = (s["name"] + " " + (s.get("desc") or "") + " " + s["slug"]).lower()
        if want_brand and s["group"] == "brand":
            sc += 6
        if want_emoji and s["group"] == "emoji":
            sc += 6
        if not want_brand and not want_emoji and s["group"] == "general":
            sc += 3
        if want_pixel and re.search(r"pixel|像素|dot", low):
            sc += 6
        if want_mono and s.get("mono"):
            sc += 2
        if re.match(r"^(MIT|CC0|Apache|ISC|BSD|Unlicense)", s.get("license") or ""):
            sc += 1.5
        if re.search(r"lucide|feather|tabler|heroicons|phosphor|material|bootstrap|ionicons", low):
            sc += 1.5
        sc += min(3, max(0.0, (len(str(s.get("stars") or 1)) - 4)))
        out.append((sc, s))
    out.sort(key=lambda x: -x[0])
    return [s for _, s in out[:limit]]


def main():
    ap = argparse.ArgumentParser(description="ui-icons-hub 图标检索（离线可用）")
    ap.add_argument("query", nargs="?", help="检索词，中文或英文")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--svg", action="store_true", help="连 SVG 源码一起输出")
    ap.add_argument("--set", dest="set_filter", help="限定图标库 slug")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    ap.add_argument("--collections", action="store_true", help="列出全部图标库")
    ap.add_argument("--info", help="查看某套图标库详情")
    ap.add_argument("--pick", help="按需求推荐图标库")
    ap.add_argument("--base", help="索引所在目录或 CDN 地址")
    a = ap.parse_args()

    load_index(a.base)

    if a.collections:
        groups = {}
        for s in _IDX["sets"]:
            groups[s["group"]] = groups.get(s["group"], 0) + 1
        if a.json:
            print(json.dumps({"total": len(_IDX["sets"]), "groups": groups,
                              "collections": [{k: s.get(k) for k in
                                               ("slug", "name", "repo", "group", "license", "count", "stars", "mono", "homepage")}
                                              for s in _IDX["sets"]]}, ensure_ascii=False, indent=1))
        else:
            print("共 %d 套图标库 · %s 个图标（general %d / brand %d / emoji %d）\n"
                  % (len(_IDX["sets"]), "{:,}".format(_IDX["total"]),
                     groups.get("general", 0), groups.get("brand", 0), groups.get("emoji", 0)))
            for s in sorted(_IDX["sets"], key=lambda x: -(x.get("stars") or 0)):
                print("  %-34s %-9s %7s 个  %-14s %s" % (
                    s["name"][:34], s["license"][:9], "{:,}".format(s["count"]), s["slug"],
                    "★%s" % s.get("stars") if s.get("stars") else ""))
        return

    if a.info:
        s = _SETS.get(a.info)
        if not s:
            raise SystemExit("没有这套图标库：%s" % a.info)
        flat = [n for c in s["chunks"] for n in c]
        step = max(1, len(flat) // 30)
        sample = flat[::step][:30]
        d = {k: s.get(k) for k in ("slug", "name", "repo", "group", "license", "count", "nchunks",
                                   "stars", "mono", "homepage", "url", "desc")}
        d["aliases"] = len(s.get("alias") or [])
        d["names_sample"] = sample
        if a.json:
            print(json.dumps(d, ensure_ascii=False, indent=1))
        else:
            for k, v in d.items():
                if k == "names_sample":
                    print("  图标名样例：", ", ".join(v))
                else:
                    print("  %-12s %s" % (k, v))
        return

    if a.pick:
        recs = pick(a.pick, a.limit)
        if a.json:
            print(json.dumps([{k: s.get(k) for k in ("slug", "name", "repo", "license", "count", "stars", "homepage")}
                              for s in recs], ensure_ascii=False, indent=1))
        else:
            for s in recs:
                print("· %s（%s）" % (s["name"], s["license"]))
                print("    slug: %s" % s["slug"])
                print("    %s 个图标 · ★%s · %s" % ("{:,}".format(s["count"]), s.get("stars"), s.get("homepage")))
        return

    if not a.query:
        ap.print_help()
        return

    hits = search(a.query, a.limit, a.set_filter)
    if a.json:
        out = []
        for sc, _w, _l, name, slug, chunk, via in hits:
            item = {"name": name, "slug": slug, "chunk": chunk}
            item.update(brief(slug))
            if via:
                item["matched_alias"] = via
            if a.svg:
                m = load_chunk(slug, chunk)
                item["svg"] = wrap_svg(slug, m[name][1], m[name]) if name in m else None
            out.append(item)
        print(json.dumps({"query": a.query, "count": len(out), "results": out}, ensure_ascii=False, indent=1))
        return

    print("「%s」命中 %d 条（索引来自 %s）\n" % (a.query, len(hits), _IDX_FROM))
    for sc, _w, _l, name, slug, chunk, via in hits:
        b = brief(slug)
        print("  %-30s %s" % (name, b["set"]))
        print("      %s · %s · %s%s" % (slug, b["license"], b["homepage"] or "",
                                        ("  （别名命中：%s）" % via) if via else ""))
        if a.svg:
            m = load_chunk(slug, chunk)
            if name in m:
                print("      " + wrap_svg(slug, m[name][1], m[name]))


if __name__ == "__main__":
    main()
