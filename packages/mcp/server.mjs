#!/usr/bin/env node
/*! ui-icons-hub MCP 服务器 v1.0.0 · MIT
 *
 * 让 AI 助手（Claude Desktop / Cursor / 任何 MCP 客户端）直接检索本站的
 * 215 套图标库 / 345,961 个 SVG 图标，支持中文意图，并能拿到 SVG 源码。
 *
 * 零依赖：不装 @modelcontextprotocol/sdk，直接实现 stdio 上的 JSON-RPC 2.0。
 * 数据来源（按优先级）：
 *   1) 环境变量 UIH_BASE 指定的本地/自建目录（需含 index.json 与 data/）
 *   2) 环境变量 UIH_CDN 指定的 CDN 目录（默认 jsDelivr 上的本仓库）
 * 索引只在第一次用到时拉取，之后缓存在内存里。
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

// ---------- 数据加载 ----------
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
  throw new Error("无法加载索引：" + (lastErr && lastErr.message));
}

function afterIndex() {
  for (const s of IDX.sets) {
    SET_INFO[s.slug] = s;
    NAMES[s.slug] = s.chunks;
  }
  ALIAS = IDX.sets.filter((s) => s.alias && s.alias.length).map((s) => [s.slug, s.alias]);
  SYN = IDX.syn || {};
}

// 分片：浏览器端是 window.__ADD2；Node 里用 new Function 造一个同名收集器
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

// ---------- 检索 ----------
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
  // 分片里若带了自定义 viewBox（4 元组），用它
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

// ---------- 工具定义 ----------
const TOOLS = [
  {
    name: "search_icons",
    description:
      "在 ui-icons-hub 的 215 套开源图标库（345,961 个 SVG 图标）里检索图标。支持中文意图（如「购物车」「齿轮」「游戏手柄」「曲线图」）与英文（cart、arrow-left），多词按 OR 匹配。默认只返回名字与归属（很快）；把 with_svg 设为 true 会连 SVG 源码一起返回。写页面缺图标时优先用它，比凭记忆编造图标名可靠。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "检索词，中文或英文，如「购物车」「齿轮」「home」「arrow-left」" },
        limit: { type: "number", description: "返回条数，默认 20，上限 100" },
        with_svg: { type: "boolean", description: "是否连 SVG 源码一起返回（会多下载一点数据），默认 false" },
        set: { type: "string", description: "限定在某套图标库内检索，传 slug，如 feathericons__feather（可先调 list_collections 查）" },
        mono_only: { type: "boolean", description: "只要单色图标（可用 CSS color 改色），默认 false" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_icon",
    description: "按图标库 slug 与图标名精确取一个图标的 SVG 源码。适合已经知道确切名字时直接拿源码。",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "图标库 slug，如 feathericons__feather" },
        name: { type: "string", description: "图标名，如 activity" },
      },
      required: ["slug", "name"],
    },
  },
  {
    name: "list_collections",
    description: "列出收录的 215 套图标库（名称 / slug / 图标数 / 许可证 / 星标 / 官网），可按 group 过滤。不知道有哪些库时先调它。",
    inputSchema: {
      type: "object",
      properties: {
        group: { type: "string", enum: ["general", "brand", "emoji"], description: "通用 UI / 品牌技术 / 表情旗帜" },
        keyword: { type: "string", description: "按名称或仓库关键词过滤，如 feather、tabler、品牌" },
        limit: { type: "number", description: "返回条数，默认 60" },
      },
    },
  },
  {
    name: "collection_info",
    description: "看某套图标库的详情：许可证、官网、图标总数、图标名样例（便于判断风格是否合用）。",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "图标库 slug" },
        sample: { type: "number", description: "返回多少个图标名样例，默认 30" },
      },
      required: ["slug"],
    },
  },
  {
    name: "pick_set",
    description: "根据需求描述推荐一套最合适的图标库，并说明理由（按风格关键词匹配：线性/实心、像素、品牌、emoji、开源协议宽松等）。",
    inputSchema: {
      type: "object",
      properties: {
        need: { type: "string", description: "需求描述，如「极简线性、用于后台管理界面」「要品牌 logo」「像素风游戏」" },
        limit: { type: "number", description: "最多推荐几套，默认 3" },
      },
      required: ["need"],
    },
  },
];

// pick_set 的粗略打分：风格关键词 + 协议宽松度 + 星标
function pickSet(need, limit) {
  const kw = String(need || "").toLowerCase();
  const wantMono = /线性|线框|描边|outline|stroke|minimal|极简|细|通用|后台|管理/.test(kw);
  const wantBrand = /品牌|logo|厂商|技术标|brand/.test(kw);
  const wantEmoji = /emoji|表情|旗帜|国旗|趣味/.test(kw);
  const wantPixel = /像素|pixel/.test(kw);
  const wantFill = /实心|填充|solid|fill|粗/.test(kw);
  const list = IDX.sets.map((s) => {
    let sc = 0;
    const nameLow = (s.name + " " + (s.desc || "") + " " + s.slug).toLowerCase();
    if (wantBrand && s.group === "brand") sc += 6;
    if (wantEmoji && s.group === "emoji") sc += 6;
    if (!wantBrand && !wantEmoji && s.group === "general") sc += 3;
    if (wantPixel && /pixel|像素|bitmap|dot/.test(nameLow)) sc += 6;
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
      x.s.group === "brand" ? "品牌/技术标专用集合" : x.s.group === "emoji" ? "表情与旗帜集合" : "通用 UI 图标集合",
      x.s.mono ? "单色，可用 CSS color 改色" : "含彩色图形",
      `许可证 ${x.s.license}`,
      x.s.stars ? `上游 ${x.s.stars} 星` : "",
    ].filter(Boolean).join(" · "),
  }));
}

// ---------- 工具执行 ----------
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
    if (!pos) return { error: `未找到 ${args.slug} / ${args.name}` };
    const map = await loadChunk(args.slug, pos.c);
    const pair = map[args.name];
    if (!pair) return { error: `分片里没有 ${args.name}` };
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
    if (!s) return { error: `没有这套图标库：${args.slug}（可调 list_collections 查看全部）` };
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

  throw new Error("未知工具：" + name);
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
  if (method === "notifications/initialized" || method === "initialized") return; // 通知，无需回复

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
        content: [{ type: "text", text: "调用失败：" + (e && e.message ? e.message : String(e)) }],
        isError: true,
      });
    }
  }

  if (method === "ping") return ok(id, {});
  if (method === "resources/list") return ok(id, { resources: [] });
  if (method === "prompts/list") return ok(id, { prompts: [] });
  return err(id, -32601, "不支持的方法：" + method);
}

let buf = "";
let inflight = 0;          // 正在处理的请求数
let ended = false;         // stdin 是否已结束
let drainCb = null;        // 排空后的回调

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
  // stdin 关掉时请求可能还在跑（比如首次要下载索引），给它们一点时间
  setTimeout(maybeExit, 250);
  setTimeout(() => process.exit(0), Number(process.env.UIH_EXIT_TIMEOUT || 600000));
});
