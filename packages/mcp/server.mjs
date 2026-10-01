#!/usr/bin/env node
/*! ui-icons-hub MCP Server v1.0.0 · MIT
 *
 * Lets AI assistants (Claude Desktop / Cursor / any MCP client) search this
 * site's 215 icon sets / 345,961 SVG icons, with Chinese-intent support, and
 * retrieve SVG source code.
 *
 * Zero dependencies: no @modelcontextprotocol/sdk; implements JSON-RPC 2.0 over
 * stdio directly.
 * Data sources (in priority order):
 *   1) Local/self-hosted directory set by the UIH_BASE env var (must contain index.json and data/)
 *   2) CDN directory set by the UIH_CDN env var (defaults to this repo on jsDelivr)
 * The index is fetched only on first use, then cached in memory.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = { name: "ui-icons-hub", version: "1.0.0" };
const DEFAULT_CDN = "https://cdn.jsdelivr.net/gh/sitong-zhang/ui-icons-hub@main/";
const LOCAL_BASE = process.env.UIH_BASE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CDN_BASE = (process.env.UIH_CDN || DEFAULT_CDN).replace(/\/?$/, "/");

let IDX = null, IDX_FROM = null, SET_INFO = {}, NAMES = {}, ALIAS = [], SYN = {}, CHUNK = {};

// ---------- Data loading ----------
function isUrl(s) { return /^https?:\/\//.test(s); }

async function readText(base, rel) {
  if (isUrl(base)) {
    const r = await fetch(base + rel, { redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${base + rel}`);
    return r.text();
  }
  return readFile(path.join(base, rel), "utf8");
}

async function loadIndex() {
  if (IDX) return IDX;
  const candidates = [];
  if (!isUrl(LOCAL_BASE) && existsSync(path.join(LOCAL_BASE, "index.json"))) candidates.push(LOCAL_BASE);
  candidates.push(CDN_BASE);
  let lastErr = null;
  for (const base of candidates) {
    try {
      const txt = await readText(base, "index.json");
      IDX = JSON.parse(txt);
      IDX_FROM = base;
      afterIndex();
      return IDX;
    } catch (e) { lastErr = e; }
  }
  throw new Error("Failed to load index: " + (lastErr && lastErr.message));
}

function afterIndex() {
  for (const s of IDX.sets) {
    SET_INFO[s.slug] = s;
    NAMES[s.slug] = s.chunks;
  }
  ALIAS = IDX.sets.filter((s) => s.alias && s.alias.length).map((s) => [s.slug, s.alias]);
  SYN = IDX.syn || {};
}

// Chunks: in the browser this is window.__ADD2; in Node we build a same-named collector with new Function
async function loadChunk(slug, i) {
  const key = `${slug}__${i}`;
  if (CHUNK[key]) return CHUNK[key];
  const code = await readText(IDX_FROM, `data/${key}.js`);
  let captured = null;
  const sandbox = { __ADD2: (repo, pairs) => { captured = { repo, pairs }; } };
  new Function("window", "__ADD2", code)(sandbox, sandbox.__ADD2);
  const map = {};
  if (captured) for (const p of captured.pairs) map[p[0]] = p;
  CHUNK[key] = map;
  return map;
}

// ---------- Search ----------
function expand(q) {
  const whole = String(q ?? "").trim();
  const out = [];
  const push = (v) => { if (v && out.indexOf(v) < 0) out.push(v); };
  push(whole);
  let hit = SYN[whole];
  if (!hit) for (const k of Object.keys(SYN)) if (k.length >= 2 && whole.indexOf(k) >= 0) { hit = SYN[k]; break; }
  if (hit) hit.forEach(push);
  if (/\s/.test(whole)) for (const w of whole.split(/\s+/)) { if (!w) continue; push(w); if (SYN[w]) SYN[w].forEach(push); }
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

function indexOfName(slug, name) {
  const arr = NAMES[slug];
  if (!arr) return null;
  for (let c = 0; c < arr.length; c++) { const i = arr[c].indexOf(name); if (i >= 0) return { c, i }; }
  return null;
}

function search(q, opt = {}) {
  const terms = expand(q);
  const setFilter = opt.set || null;
  const hits = [];
  for (const slug of Object.keys(NAMES)) {
    if (setFilter && slug !== setFilter) continue;
    const arr = NAMES[slug];
    for (let c = 0; c < arr.length; c++) {
      const names = arr[c];
      for (const n of names) {
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
        const pos = indexOfName(slug, owner);
        if (pos) hits.push({ name: owner, via: a, slug, chunk: pos.c, s: sc.s + 1, t: sc.t, len: owner.length });
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

function clampW(slug, body) {
  // If a chunk carries a custom viewBox (4-tuple), use it
  return body;
}

function wrapSvg(slug, body, pair) {
  if (pair && pair.length > 2) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pair[2]} ${pair[3]}">${body}</svg>`;
  const s = SET_INFO[slug] || {};
  let w = s.wrap || '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
  const cut = w.indexOf("</svg>");
  if (cut > 0) w = w.slice(0, cut);
  return w + body + "</svg>";
}

function brief(slug) {
  const s = SET_INFO[slug] || {};
  return { set: s.name, repo: s.repo, license: s.license, homepage: s.homepage, group: s.group, mono: s.mono };
}

// ---------- Tool definitions ----------
const TOOLS = [
  {
    name: "search_icons",
    description:
      "Search icons across ui-icons-hub's 215 open-source icon sets (345,961 SVG icons). Supports Chinese-intent queries (e.g. cart, gear, gamepad, line chart) as well as English (cart, arrow-left); multiple words match as OR. By default it returns only names and set attribution (very fast); set with_svg to true to also return the SVG source. Prefer this when you need an icon for a page — more reliable than inventing icon names from memory.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term, Chinese or English, e.g. cart, gear, home, arrow-left" },
        limit: { type: "number", description: "Number of results to return, default 20, max 100" },
        with_svg: { type: "boolean", description: "Whether to also return the SVG source (downloads a bit more data), default false" },
        set: { type: "string", description: "Restrict search to one icon set; pass its slug, e.g. feathericons__feather (call list_collections first to look it up)" },
        mono_only: { type: "boolean", description: "Only monochrome icons (recolorable via CSS color), default false" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_icon",
    description: "Fetch the SVG source of one icon by its set slug and icon name. Best when you already know the exact name and want the source directly.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Icon set slug, e.g. feathericons__feather" },
        name: { type: "string", description: "Icon name, e.g. activity" },
      },
      required: ["slug", "name"],
    },
  },
  {
    name: "list_collections",
    description: "List the 215 included icon sets (name / slug / icon count / license / stars / homepage), filterable by group. Call this first when you don't know which sets exist.",
    inputSchema: {
      type: "object",
      properties: {
        group: { type: "string", enum: ["general", "brand", "emoji"], description: "General UI / Brand & tech / Emoji & flags" },
        keyword: { type: "string", description: "Filter by name or repo keyword, e.g. feather, tabler, brand" },
        limit: { type: "number", description: "Number of results to return, default 60" },
      },
    },
  },
  {
    name: "collection_info",
    description: "View details of one icon set: license, homepage, total icon count, and sample icon names (to judge whether the style fits).",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Icon set slug" },
        sample: { type: "number", description: "How many sample icon names to return, default 30" },
      },
      required: ["slug"],
    },
  },
  {
    name: "pick_set",
    description: "Recommend the most suitable icon set based on a need description, with reasoning (matches style keywords: outline/solid, pixel, brand, emoji, permissive license, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        need: { type: "string", description: "Need description, e.g. 'minimalist outline, for admin dashboard UI', 'need a brand logo', 'pixel-style game'" },
        limit: { type: "number", description: "Maximum number of sets to recommend, default 3" },
      },
      required: ["need"],
    },
  },
];

// pick_set rough scoring: style keywords + license permissiveness + stars
function pickSet(need, limit) {
  const kw = String(need || "").toLowerCase();
  const wantMono = /linear|wireframe|outline|stroke|minimal|thin|generic|dashboard|admin|backend/.test(kw);
  const wantBrand = /brand|logo|vendor|tech-logo/.test(kw);
  const wantEmoji = /emoji|emoticon|flag|fun/.test(kw);
  const wantPixel = /pixel/.test(kw);
  const wantFill = /solid|fill|filled|bold/.test(kw);
  const list = IDX.sets.map((s) => {
    let sc = 0;
    const nameLow = (s.name + " " + (s.desc || "") + " " + s.slug).toLowerCase();
    if (wantBrand && s.group === "brand") sc += 6;
    if (wantEmoji && s.group === "emoji") sc += 6;
    if (!wantBrand && !wantEmoji && s.group === "general") sc += 3;
    if (wantPixel && /pixel|bitmap|dot/.test(nameLow)) sc += 6;
    if (wantMono && s.mono) sc += 2;
    if (wantFill && !s.mono) sc += 2;
    if (/^MIT$|CC0|Apache|ISC|BSD|Unlicense/.test(s.license || "")) sc += 1.5;
    if (/lucide|feather|tabler|heroicons|phosphor|material|remix|bootstrap|ionicons/.test(nameLow)) sc += 1.5;
    sc += Math.min(3, Math.log10(Math.max(s.stars || 1, 1)) - 3);
    return { s, sc };
  });
  list.sort((a, b) => b.sc - a.sc);
  return list.slice(0, limit || 3).map((x) => ({
    slug: x.s.slug, name: x.s.name, repo: x.s.repo, license: x.s.license,
    count: x.s.count, stars: x.s.stars, homepage: x.s.homepage,
    group: x.s.group, mono: x.s.mono,
    why: [
      x.s.group === "brand" ? "Brand / tech-logo collection" : x.s.group === "emoji" ? "Emoji & flag collection" : "General UI icon collection",
      x.s.mono ? "Monochrome, recolorable via CSS color" : "Contains colored graphics",
      `License ${x.s.license}`,
      x.s.stars ? `Upstream ${x.s.stars} stars` : "",
    ].filter(Boolean).join(" · "),
  }));
}

// ---------- Tool execution ----------
async function callTool(name, args = {}) {
  await loadIndex();

  if (name === "search_icons") {
    let list = search(args.query, { limit: Math.min(args.limit || 20, 100), set: args.set });
    if (args.mono_only) list = list.filter((h) => (SET_INFO[h.slug] || {}).mono);
    const out = [];
    for (const h of list) {
      const item = { name: h.name, slug: h.slug, chunk: h.chunk, ...brief(h.slug) };
      if (h.via) item.matched_alias = h.via;
      if (args.with_svg) {
        try {
          const map = await loadChunk(h.slug, h.chunk);
          const pair = map[h.name];
          item.svg = pair ? wrapSvg(h.slug, pair[1], pair) : null;
        } catch (e) { item.svg_error = e.message; }
      }
      out.push(item);
    }
    return { query: args.query, count: out.length, results: out, index_from: IDX_FROM };
  }

  if (name === "get_icon") {
    const pos = indexOfName(args.slug, args.name);
    if (!pos) return { error: `Not found: ${args.slug} / ${args.name}` };
    const map = await loadChunk(args.slug, pos.c);
    const pair = map[args.name];
    if (!pair) return { error: `Chunk does not contain ${args.name}` };
    return { name: args.name, slug: args.slug, ...brief(args.slug), svg: wrapSvg(args.slug, pair[1], pair) };
  }

  if (name === "list_collections") {
    let arr = IDX.sets;
    if (args.group) arr = arr.filter((s) => s.group === args.group);
    if (args.keyword) {
      const k = String(args.keyword).toLowerCase();
      arr = arr.filter((s) => (s.name + " " + s.repo + " " + s.slug).toLowerCase().includes(k));
    }
    const limit = args.limit || 60;
    return {
      total: arr.length,
      collections: arr.slice(0, limit).map((s) => ({
        slug: s.slug, name: s.name, repo: s.repo, group: s.group, license: s.license,
        count: s.count, stars: s.stars, mono: s.mono, homepage: s.homepage,
      })),
      groups: IDX.sets.reduce((a, s) => { a[s.group] = (a[s.group] || 0) + 1; return a; }, {}),
    };
  }

  if (name === "collection_info") {
    const s = SET_INFO[args.slug];
    if (!s) return { error: `No such icon set: ${args.slug} (call list_collections to see all)` };
    const flat = [];
    for (let c = 0; c < s.chunks.length; c++) for (const n of s.chunks[c]) flat.push(n);
    const sample = args.sample || 30;
    const step = Math.max(1, Math.floor(flat.length / sample));
    const picks = [];
    for (let i = 0; i < flat.length && picks.length < sample; i += step) picks.push(flat[i]);
    return {
      slug: s.slug, name: s.name, repo: s.repo, group: s.group, license: s.license,
      count: s.count, chunks: s.nchunks, stars: s.stars, mono: s.mono,
      homepage: s.homepage, url: s.url, desc: s.desc,
      aliases: (s.alias || []).length, names_sample: picks,
    };
  }

  if (name === "pick_set") {
    return { need: args.need, recommendations: pickSet(args.need, Math.min(args.limit || 3, 10)) };
  }

  throw new Error("Unknown tool: " + name);
}

// ---------- JSON-RPC over stdio ----------
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
function ok(id, result) { send({ jsonrpc: "2.0", id, result }); }
function err(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

async function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: SERVER,
    });
  }
  if (method === "notifications/initialized" || method === "initialized") return; // Notification, no reply needed

  if (method === "tools/list") return ok(id, { tools: TOOLS });

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};
    try {
      const data = await callTool(name, args);
      return ok(id, {
        content: [{ type: "text", text: JSON.stringify(data, null, 1) }],
        isError: false,
      });
    } catch (e) {
      return ok(id, {
        content: [{ type: "text", text: "Call failed: " + (e && e.message ? e.message : String(e)) }],
        isError: true,
      });
    }
  }

  if (method === "ping") return ok(id, {});
  if (method === "resources/list") return ok(id, { resources: [] });
  if (method === "prompts/list") return ok(id, { prompts: [] });
  return err(id, -32601, "Method not found: " + method);
}

let buf = "";
let inflight = 0;          // Number of requests currently being processed
let ended = false;         // Whether stdin has ended
let drainCb = null;        // Callback invoked after draining

function maybeExit() {
  if (ended && inflight === 0) {
    if (drainCb) { const cb = drainCb; drainCb = null; cb(); }
    else process.exit(0);
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let req;
    try { req = JSON.parse(line); } catch { continue; }
    inflight++;
    Promise.resolve()
      .then(() => handle(req))
      .catch((e) => { if (req && req.id != null) err(req.id, -32603, String(e && e.message || e)); })
      .finally(() => { inflight--; maybeExit(); });
  }
});
process.stdin.on("end", () => {
  ended = true;
  // When stdin closes, requests may still be running (e.g. first-time index download); give them some time
  setTimeout(maybeExit, 250);
  setTimeout(() => process.exit(0), Number(process.env.UIH_EXIT_TIMEOUT || 600000));
});
