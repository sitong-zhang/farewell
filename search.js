/* ui-icons-hub 检索引擎：FlexSearch + 中文意图同义词 + 别名 + 增量建索引
 *
 * 设计要点：
 * 1) 索引里只存「图标名 / 别名」，用数值 id 反解 (库下标, 分片下标, 名称位置)，
 *    避免为几十万条记录再建一份对象数组；名称按需从 SEARCH_DATA 取回。
 * 2) 38 万级文档同步建索引会卡住主线程，这里按时间切片增量构建，前端可显示进度。
 * 3) 命中后才去加载对应的少数几个数据分片，渲染时才需要 SVG 本体，
 *    彻底取代原来「拉全部库全部块做线性扫描」的方式。
 */
(function () {
  "use strict";
  var SD = null;
  var IDX = null, SETIDX = null, ALIAS = null;
  var loading = false, building = false, loadErr = false;
  var waiters = [], progress = 0, BUILD_MS = 0;
  var CHUNK = 1e6, SETM = 1e9, ALIASBASE = 1e12;

  function flush(err) {
    var ws = waiters; waiters = [];
    for (var i = 0; i < ws.length; i++) ws[i](err);
  }

  function ensure(cb) {
    if (SD) return cb(null);
    waiters.push(cb);
    if (loading) return;
    loading = true;
    var el = document.createElement("script");
    el.src = "search-data.js";
    el.async = true;
    el.onload = function () {
      loading = false;
      SD = window.SEARCH_DATA || { sets: [] };
      flush(null);
    };
    el.onerror = function () {
      loading = false; loadErr = true;
      SD = { sets: [] };
      flush(new Error("索引数据加载失败"));
    };
    document.head.appendChild(el);
  }

  function addSet(s) {
    var st = SD.sets[s], cs = st.chunks || [], c, p;
    for (c = 0; c < cs.length; c++) {
      var names = cs[c] || [];
      for (p = 0; p < names.length; p++) IDX.add(s * SETM + c * CHUNK + p, String(names[p] || ""));
    }
    SETIDX.add(s, (st.name || "") + " " + (st.repo || ""));
  }

  /* 别名：同一图形的其它叫法，索引里单列一条，命中后指向父图标 */
  function buildAlias() {
    ALIAS = [];
    for (var s = 0; s < SD.sets.length; s++) {
      var st = SD.sets[s], al = st.alias || [];
      if (!al.length) continue;
      var pos = {}, cs = st.chunks || [];
      for (var c = 0; c < cs.length; c++) {
        for (var p = 0; p < cs[c].length; p++) pos[cs[c][p]] = c * CHUNK + p;
      }
      for (var i = 0; i < al.length; i++) {
        var parent = al[i][1];
        if (pos[parent] === undefined) continue;
        ALIAS.push({ s: s, pack: pos[parent], name: al[i][0] });
      }
    }
    for (var k = 0; k < ALIAS.length; k++) IDX.add(ALIASBASE + k, ALIAS[k].name);
  }

  function build(cb) {
    if (IDX || building) return cb && cb();
    building = true;
    progress = 0;
    var t0 = Date.now(), s = 0;
    IDX = new FlexSearch.Index({ tokenize: "forward" });
    SETIDX = new FlexSearch.Index({ tokenize: "forward" });
    function step() {
      var start = Date.now();
      while (s < SD.sets.length && Date.now() - start < 16) addSet(s++);
      progress = SD.sets.length ? s / SD.sets.length : 1;
      if (s < SD.sets.length) { setTimeout(step, 0); return; }
      buildAlias();
      BUILD_MS = Date.now() - t0;
      window.__SEARCH_BUILD_MS = BUILD_MS;
      building = false; progress = 1;
      cb && cb();
    }
    setTimeout(step, 0);
  }

  /* 中文意图 -> 英文关键词展开 */
  function expand(q) {
    var out = [], seen = {};
    var lower = String(q || "").toLowerCase();
    seen[lower] = 1; out.push(lower);
    var syn = SD ? (SD.syn || {}) : {};
    function push(v) {
      v = String(v || "").toLowerCase();
      if (v && !seen[v]) { seen[v] = 1; out.push(v); }
    }
    if (syn[q]) { for (var i = 0; i < syn[q].length; i++) push(syn[q][i]); }
    for (var k in syn) {
      if (lower.indexOf(k) >= 0) { for (var j = 0; j < syn[k].length; j++) push(syn[k][j]); }
    }
    return out;
  }

  function decode(x) {
    if (x.charAt(0) === "s") return { t: "set", s: +x.slice(1) };
    var id = +x.slice(1);
    if (id >= ALIASBASE) {
      var a = ALIAS[id - ALIASBASE];
      if (!a) return null;
      var rest = a.pack % SETM;
      return { t: "icon", s: a.s, c: Math.floor(rest / CHUNK), p: rest % CHUNK, aka: a.name };
    }
    var s = Math.floor(id / SETM), r = id % SETM;
    return { t: "icon", s: s, c: Math.floor(r / CHUNK), p: r % CHUNK };
  }

  /* 相关性排序：完全同名 > 前缀命中 > 词边界命中 > 子串命中；同分按名字更短优先 */
  function nameOf(h) {
    if (!SD || !SD.sets) return "";
    var st = SD.sets[h.s];
    if (!st) return "";
    if (h.t === "set") return st.name || "";
    return String(((st.chunks || [])[h.c] || [])[h.p] || h.aka || "");
  }
  function rank(hits, terms) {
    var arr = [], i;
    for (i = 0; i < hits.length; i++) {
      var nm = nameOf(hits[i]).toLowerCase(), best = 9, t;
      for (var j = 0; j < terms.length; j++) {
        t = terms[j];
        if (!t) continue;
        if (nm === t) { if (best > 0) best = 0; }
        else if (nm.indexOf(t) === 0) { if (best > 1) best = 1; }
        else if (nm.indexOf("-" + t) > 0) { if (best > 2) best = 2; }
        else { if (best > 3) best = 3; }
      }
      arr.push({ h: hits[i], k: best * 1000 + Math.min(nm.length, 999), o: i });
    }
    arr.sort(function (a, b) { return a.k - b.k || a.o - b.o; });
    for (i = 0; i < arr.length; i++) hits[i] = arr[i].h;
    return hits;
  }

  function query(q, cap) {
    if (!SD || !IDX) return [];
    var terms = expand(q), got = [], seen = {}, i, j, r;
    for (i = 0; i < terms.length; i++) {
      var t = String(terms[i]).trim();
      if (!t) continue;
      try {
        r = IDX.search(t, cap) || [];
        for (j = 0; j < r.length; j++) { var key = "i" + r[j]; if (!seen[key]) { seen[key] = 1; got.push(key); } }
        r = SETIDX.search(t, 8) || [];
        for (j = 0; j < r.length; j++) { var k2 = "s" + r[j]; if (!seen[k2]) { seen[k2] = 1; got.push(k2); } }
      } catch (e) { /* 单个词异常不影响整体 */ }
    }
    var out = [];
    for (i = 0; i < got.length && out.length < cap; i++) {
      var d = decode(got[i]);
      if (d) out.push(d);
    }
    return rank(out, terms);
  }

  function info(h) {
    if (!SD || !SD.sets) return null;
    var st = SD.sets[h.s];
    if (!st) return null;
    if (h.t === "set") return { repo: st.repo, name: st.name, mono: st.mono, all: true };
    var nm = ((st.chunks || [])[h.c] || [])[h.p];
    return { repo: st.repo, name: st.name, mono: st.mono, icon: nm, aka: h.aka || "" };
  }

  window.__SEARCH = {
    init: function (cb) {
      ensure(function (e) {
        if (e) { cb && cb(e); return; }
        build(function () { cb && cb(null); });
      });
    },
    ready: function () { return !!(SD && IDX); },
    progress: function () { return progress; },
    states: function () {
      return {
        loaded: !!SD, built: !!IDX, err: loadErr, building: building,
        ms: BUILD_MS, sets: SD ? SD.sets.length : 0, names: window.__SEARCH_NAMES || 0
      };
    },
    search: query,
    info: info
  };

  /* 空闲时预热，让第一次搜索不卡 */
  function preload() {
    if (SD || loading) return;
    ensure(function (e) { if (!e) build(); });
  }
  if (window.addEventListener) {
    window.addEventListener("load", function () { setTimeout(preload, 600); });
  }
})();
