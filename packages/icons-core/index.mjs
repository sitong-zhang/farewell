/*! @ui-icons-hub/icons v1.0.0 · MIT
 * Search API for 215 open-source icon sets / 345,961 SVG icons. Zero dependencies, works in browsers and Node 18+.
 *
 *   import { searchSvg, icon, list } from "@ui-icons-hub/icons";
 *   const hits = await searchSvg("cart");               // [{name, set, license, svg, ...}]
 *   const one  = await icon("feathericons__feather", "activity");
 *   const sets = await list();                          // 215 sets
 *
 * Data sources (in priority order):
 *   1) options.base / UIH_BASE env var -- local directory (must contain index.json and data/, e.g. an extracted offline bundle)
 *   2) This repo on jsDelivr (default)
 * The index is fetched on first call (≈1.4 MB gzipped); SVGs are downloaded on demand from the chunk containing the hit.
 */

const DEFAULT_CDN = "https://cdn.jsdelivr.net/gh/sitong-zhang/ui-icons-hub@main/";
const IS_NODE = typeof process !== "undefined" && !!(process.versions && process.versions.node);
const ENV_BASE = IS_NODE ? (process.env.UIH_BASE || "") : "";

let OPT = { base: "" };
let IDX = null, loading = null, IDX_FROM = "";
const SETS = {}, NAMES = {}, CHUNK = {};
let ALIAS = [], SYN = {};

function normBase(b) { return String(b || "").replace(/\/?$/, "/"); }

async function readText(base, rel) {
  if (/^https?:\/\//.test(base)) {
    const r = await fetch(base + rel, { redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + base + rel);
    return r.text();
  }
  if (IS_NODE) {
    const fs = await import("node:fs/promises");
    return fs.readFile((await import("node:path")).join(base, rel), "utf8");
  }
  const r = await fetch(base + rel);
  if (!r.ok) throw new Error("HTTP " + r.status + " " + base + rel);
  return r.text();
}

export function configure(options = {}) {
  if (options.base != null) OPT.base = normBase(options.base);
}

async function loadIndex() {
  if (IDX) return IDX;
  if (loading) return loading;
  const bases = [];
  if (OPT.base) bases.push(OPT.base);
  if (ENV_BASE) bases.push(normBase(ENV_BASE));
  bases.push(DEFAULT_CDN);
  loading = (async () => {
    let last = null;
    for (const b of bases) {
      try {
        IDX = JSON.parse(await readText(b, "index.json"));
        IDX_FROM = b;
        for (const s of IDX.sets) { SETS[s.slug] = s; NAMES[s.slug] = s.chunks; }
        ALIAS = IDX.sets.filter((s) => s.alias && s.alias.length).map((s) => [s.slug, s.alias]);
        SYN = IDX.syn || {};
        return IDX;
      } catch (e) { last = e; }
    }
    loading = null;
    throw new Error("Failed to load index: " + (last && last.message));
  })();
  return loading;
}

async function loadChunk(slug, i) {
  const key = slug + "__" + i;
  if (CHUNK[key]) return CHUNK[key];
  const code = await readText(IDX_FROM, "data/" + key + ".js");
  const start = code.indexOf("[[");
  if (start < 0) { CHUNK[key] = {}; return CHUNK[key]; }
  let depth = 0, instr = false, esc = false, end = -1;
  for (let k = start; k < code.length; k++) {
    const c = code[k];
    if (instr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') instr = false;
      continue;
    }
    if (c === '"') instr = true;
    else if (c === "[") depth++;
    else if (c === "]") { depth--; if (!depth) { end = k + 1; break; } }
  }
  const pairs = end > 0 ? JSON.parse(code.slice(start, end)) : [];
  const map = {};
  for (const p of pairs) map[p[0]] = p;
  CHUNK[key] = map;
  return map;
}

function expand(q) {
  const whole = String(q == null ? "" : q).trim();
  const out = [];
  const push = (v) => { if (v && out.indexOf(v) < 0) out.push(v); };
  push(whole);
  let hit = SYN[whole];
  if (!hit) for (const k of Object.keys(SYN)) if (k.length >= 2 && whole.indexOf(k) >= 0) { hit = SYN[k]; break; }
  if (hit) hit.forEach(push);
  if (/\s/.test(whole)) {
    for (const w of whole.split(/\s+/)) {
      if (!w) continue;
      push(w);
      if (SYN[w]) SYN[w].forEach(push);
    }
  }
  return out;
}

function score(name, terms) {
  const ln = name.toLowerCase();
  let best = 99, where = -1;
  for (let i = 0; i < terms.length; i++) {
    const t = String(terms[i] || "").toLowerCase();
    if (!t) continue;
    const p = ln.indexOf(t);
    if (p < 0) continue;
    const s = (p === 0 && ln.length === t.length) ? 0 : p === 0 ? 1 : /[-_ ]/.test(ln.charAt(p - 1)) ? 2 : 3;
    if (s < best) { best = s; where = i; }
    if (best === 0) break;
  }
  return { s: best, t: where };
}

function indexOfChunk(slug, name) {
  const arr = NAMES[slug];
  if (!arr) return -1;
  for (let c = 0; c < arr.length; c++) if (arr[c].indexOf(name) >= 0) return c;
  return -1;
}

function brief(slug) {
  const s = SETS[slug] || {};
  return { set: s.name, repo: s.repo, license: s.license, homepage: s.homepage, group: s.group, mono: s.mono };
}

function wrapSvg(slug, body, pair) {
  if (pair && pair.length > 2) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + pair[2] + " " + pair[3] + '">' + body + "</svg>";
  let w = (SETS[slug] || {}).wrap || '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
  const cut = w.indexOf("</svg>");
  if (cut > 0) w = w.slice(0, cut);
  return w + body + "</svg>";
}

async function rawSearch(q, opt = {}) {
  await loadIndex();
  const terms = expand(q);
  const setFilter = opt.set || null;
  const hits = [];
  for (const slug of Object.keys(NAMES)) {
    if (setFilter && slug !== setFilter) continue;
    const arr = NAMES[slug];
    for (let c = 0; c < arr.length; c++) {
      for (const n of arr[c]) {
        const sc = score(n, terms);
        if (sc.s < 99) hits.push({ name: n, slug, chunk: c, s: sc.s, t: sc.t, len: n.length });
      }
    }
  }
  for (const [slug, pairs] of ALIAS) {
    if (setFilter && slug !== setFilter) continue;
    for (const [a, owner] of pairs) {
      const sc = score(a, terms);
      if (sc.s < 99) {
        const c = indexOfChunk(slug, owner);
        if (c >= 0) hits.push({ name: owner, via: a, slug, chunk: c, s: sc.s + 1, t: sc.t, len: owner.length });
      }
    }
  }
  hits.sort((a, b) => (a.s - b.s) || (a.t - b.t) || (a.len - b.len) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const seen = new Set(), out = [];
  for (const h of hits) {
    const k = h.slug + "/" + h.name;
    if (seen.has(k)) continue;
    seen.add(k); out.push(h);
    if (out.length >= (opt.limit || 30)) break;
  }
  return out;
}

/** Search: [{name, slug, set, repo, license, homepage, group, mono, alias}] (no svg, very fast) */
export async function search(q, opt = {}) {
  const list = await rawSearch(q, opt);
  return list.map((h) => Object.assign({ name: h.name, slug: h.slug, alias: h.via || null }, brief(h.slug)));
}

/** Search and retrieve SVG source (auto-loads the chunk containing the hit) */
export async function searchSvg(q, opt = {}) {
  const list = await rawSearch(q, opt);
  return Promise.all(list.map(async (h) => {
    const o = Object.assign({ name: h.name, slug: h.slug, alias: h.via || null }, brief(h.slug));
    const map = await loadChunk(h.slug, h.chunk);
    const pair = map[h.name];
    o.svg = pair ? wrapSvg(h.slug, pair[1], pair) : null;
    return o;
  }));
}

/** Fetch a single icon precisely (with SVG source) */
export async function icon(slug, name) {
  await loadIndex();
  const c = indexOfChunk(slug, name);
  if (c < 0) return null;
  const map = await loadChunk(slug, c);
  const pair = map[name];
  if (!pair) return null;
  return Object.assign({ name, slug, svg: wrapSvg(slug, pair[1], pair) }, brief(slug));
}

/** List of 215 icon sets, filterable by group (general/brand/emoji) */
export async function list(group) {
  await loadIndex();
  return IDX.sets
    .filter((s) => !group || s.group === group)
    .map((s) => ({ slug: s.slug, name: s.name, repo: s.repo, group: s.group, license: s.license,
                   count: s.count, stars: s.stars, mono: s.mono, homepage: s.homepage }));
}

/** All icon names of a set */
export async function names(slug) {
  await loadIndex();
  const arr = NAMES[slug];
  return arr ? arr.flat() : null;
}

/** Chinese-intent dictionary (183 entries) */
export async function synonyms() {
  await loadIndex();
  return SYN;
}

/** Where the current index came from (for debugging) */
export function source() { return IDX_FROM || null; }

export default { search, searchSvg, icon, list, names, synonyms, configure, source };
