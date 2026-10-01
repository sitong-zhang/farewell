---
name: ui-icons-hub
description: Search and fetch icons from 215 open-source icon libraries (345,961 SVG icons), with Chinese-intent support (cart/gear/gamepad). Use this skill whenever a task involves finding icons, matching icons to a UI, writing SVG, choosing an icon library, or checking an icon's license — instead of inventing icon names from memory.
---

# ui-icons-hub · Icon Search & Fetch

## When to use

- The user wants icons for a page / app / slide deck / document but hasn't
  picked a library
- An icon with a specific meaning is needed: **cart, gear (settings), sun
  (theme), chart, mail, gamepad, QR scan, support…**
- Actual SVG source is needed (to paste into code or an `.svg` file)
- You need to confirm whether an icon's **license** allows commercial use
- You need to pick one stylistically consistent library (outline / solid /
  pixel / brand / emoji)

**Core rule: never invent icon names from memory.** Search this library for
real names and take real SVGs first.

## How to use

The skill ships a zero-dependency search CLI (any Python 3; works offline with
bundled data, falls back to the CDN automatically):

```bash
# Chinese-intent search (recommended first step)
python3 scripts/search.py "shopping cart" --limit 10

# Include SVG source in the output
python3 scripts/search.py "gear" --limit 3 --svg

# Restrict to one library (consistent style)
python3 scripts/search.py "arrow" --set lucide-icons__lucide --limit 10

# JSON output for programmatic use
python3 scripts/search.py "gamepad" --json --limit 5

# Which libraries are available
python3 scripts/search.py --collections

# Details of one set (license, homepage, sample names)
python3 scripts/search.py --info tabler__tabler-icons

# Recommend a library for a need
python3 scripts/search.py --pick "minimal outline, admin dashboard"
```

`scripts/search.py` is relative to the **skill directory**. Data source
priority: `UIH_BASE` env var → bundled `assets/` → jsDelivr CDN (per-chunk
fallback when local chunks are absent).

## Search capabilities & limits

- **Chinese intent runs on a dictionary** (183 entries) covering common UI
  semantics: cart, gear, sun, moon, arrow, back, home, user, settings, search,
  delete, edit, upload, download, notification, mail, phone, map, wallet,
  currency, chart, calendar, clock, lock, key, play, pause, volume, WiFi,
  cloud, folder, tag, shopping, payment, support, QR scan, gamepad…
- For Chinese words missing from the dictionary, **splitting into characters
  or switching to English keywords** usually works better
  (e.g. logistics → `truck` / `shipping`)
- English supports **multi-word OR**: `feather home` matches names containing
  feather OR home
- Ranking: exact name > prefix > word boundary > substring

## After you get an icon

1. **Coloring**: monochrome icons (`mono: true` in results) use
   `currentColor`; set `color` in CSS instead of rewriting the `fill`
   attribute.
2. **Attribution & compliance**: results include `license` and `homepage`.
   MIT / Apache-2.0 / CC0 / ISC / BSD are safe (keeping the original notice is
   appreciated). Brand icons (Simple Icons etc.): the artwork is free to use,
   but when a logo stands for its brand, **do not imply official endorsement**.
3. **Consistency**: stick to one library per project — mixing shows up as
   mismatched stroke widths / corner radii / grids. Lock it with `--set`.

## Quick picks

| Style | Recommendation | License | Icons |
| --- | --- | --- | --- |
| Minimal outline, general UI | Feather Icons | MIT | 286 |
| Minimal outline, large set | Lucide | ISC | 1,600+ |
| General, widest coverage | Tabler Icons | MIT | 6,268 |
| General, adjustable weight | Material Symbols | Apache-2.0 | 15,000+ |
| Outline + solid pairs | Phosphor Icons | MIT | 9,000+ |
| Brand / tech logos | Simple Icons | CC0-1.0 | 3,000+ |
| Pixel art | Pixelarticons | MIT | 1,306 |
| Emoji / flags | Twemoji / Noto Emoji | CC-BY-4.0 / OFL | thousands |

Full list: `python3 scripts/search.py --collections` (215 sets).

## License

Icon artwork is owned by each upstream project — there is **no unified
license**; each set follows its actual upstream license (the `license` field
in CLI output). Full listing:
<https://github.com/sitong-zhang/ui-icons-hub#readme>. The skill's scripts
are MIT.
