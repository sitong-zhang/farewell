# @ui-icons-hub/icons

ESM core for [ui-icons-hub](https://github.com/sitong-zhang/ui-icons-hub) —
search **215 open-source icon libraries / 345,961 SVG icons** from Node.js,
with intent-based search support.

Zero dependencies. Data chunks load on demand from a CDN (or a local
directory) — a search never downloads the full 300 MB dataset.

## Install

```bash
npm i @ui-icons-hub/icons
```

## Quick start

```js
import { search, searchSvg, icon, list, configure } from '@ui-icons-hub/icons';

// Search (names only, no SVG bodies)
const hits = await search('shopping cart', { limit: 5 });   // intent: shopping cart
// → [{ name: 'cart', set: 'Ionicons', license: 'MIT', ... }]

// Search and fetch SVG source (loads matched chunks)
const svgs = await searchSvg('shopping cart', { limit: 3 });
console.log(svgs[0].svg);   // '<svg xmlns="http://www.w3.org/2000/svg" ...>...</svg>'

// One exact icon
const one = await icon('tabler__tabler-icons', 'shopping-cart');

// All 215 collections, filterable by group: general / brand / emoji
const sets = await list('brand');
```

## API

| Export | Signature | Purpose |
| --- | --- | --- |
| `search(q, opt?)` | → `Promise<Hit[]>` | Keyword search, names only |
| `searchSvg(q, opt?)` | → `Promise<Hit[]>` | Search + real SVG source |
| `icon(slug, name)` | → `Promise<Icon?>` | One icon by set slug + name |
| `list(group?)` | → `Promise<Set[]>` | All collections, optional group filter |
| `names(slug)` | → `Promise<Name[]>` | Every icon name in one set |
| `synonyms()` | → `Promise<Dict>` | The 183-entry Chinese-intent dictionary |
| `configure({ base })` | → `void` | Data source: local dir or CDN URL |
| `source()` | → `string` | Where the index was loaded from |

Options: `{ limit, set }` — cap results and/or restrict to one collection.

## Data sources

Priority: explicit `configure({ base })` → `UIH_BASE` env (local dir with
`index.json` + `data/`) → `UIH_CDN` env → jsDelivr (`@main`).
Pin a version by setting `UIH_CDN` to e.g.
`https://cdn.jsdelivr.net/gh/sitong-zhang/ui-icons-hub@v1.0.0/`.

## License

MIT (this package's code). Icon artwork follows each upstream collection's
own license — see the [upstream listing](https://github.com/sitong-zhang/ui-icons-hub#readme).
