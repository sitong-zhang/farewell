/* ui-icons-hub 检索引擎：FlexSearch + 中文意图同义词 + 按需加载分片
 *
 * 设计要点：
 * 1) 索引里只存「图标名」，用一个数值 id 反解 (库下标, 分片下标, 名称位置)，
 *    避免为几十万条记录再建一份对象数组；名称从 SEARCH_DATA 里按下标取回。
 * 2) 命中后才去加载对应的少数几个数据分片，渲染时才需要 SVG 本体，
 *    彻底取代原来「拉全部库全部块做线性扫描」的方式。
 * 3) 中文意图通过同义词表展开成英文关键词再检索。
 */
(function () {
  "use strict";
  var SD = null;
  var IDX = null, SETIDX = null;
  var building = false, loading = false, loadErr = false;
  var waiters = [];
  var CHUNK = 1e6, SETM = 1e9;

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
      SD = window.SEARCH_DATA || { sets: [], syn: {} };
      flush(null);
    };
    el.onerror = function () {
      loading = false; loadErr = true;
      SD = { sets: [], syn: {} };
      flush(new Error("索引数据加载失败"));
    };
    document.head.appendChild(el);
  }

  function build() {
    if (IDX || building) return;
    building = true;
    var t0 = Date.now();
    IDX = new FlexSearch.Index({ tokenize: "forward" });
    SETIDX = new FlexSearch.Index({ tokenize: "forward" });
    var sets = SD.sets || [];
    for (var s = 0; s < sets.length; s++) {
      var cs = sets[s].chunks || [];
      for (var c = 0; c < cs.length; c++) {
        var names = cs[c] || [];
        for (var p = 0; p < names.length; p++) {
          IDX.add(s * SETM + c * CHUNK + p, String(names[p] || ""));
        }
      }
      SETIDX.add(s, (sets[s].name || "") + " " + (sets[s].repo || ""));
    }
    building = false;
    window.__SEARCH_BUILD_MS = Date.now() - t0;
  }

  /* 中文 -> 英文关键词展开 */
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

  function dedupe(arr, cap) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length && out.length < cap; i++) {
      var v = arr[i];
      if (seen[v]) continue;
      seen[v] = 1; out.push(v);
    }
    return out;
  }

  /* 返回命中：{t:'icon',s,c,p} 或 {t:'set',s} */
  function query(q, cap) {
    if (!SD || !IDX) return [];
    var terms = expand(q), got = [], i, j, r;
    for (i = 0; i < terms.length; i++) {
      var t = String(terms[i]).trim();
      if (!t) continue;
      try {
        r = IDX.search(t, cap) || [];
        for (j = 0; j < r.length; j++) got.push("i" + r[j]);
        r = SETIDX.search(t, 8) || [];
        for (j = 0; j < r.length; j++) got.push("s" + r[j]);
      } catch (e) { /* 单个词异常不影响整体 */ }
    }
    got = dedupe(got, cap);
    return got.map(function (x) {
      if (x.charAt(0) === "s") return { t: "set", s: +x.slice(1) };
      var id = +x.slice(1);
      var s = Math.floor(id / SETM), rest = id % SETM;
      return { t: "icon", s: s, c: Math.floor(rest / CHUNK), p: rest % CHUNK };
    });
  }

  function info(h) {
    if (!SD || !SD.sets) return null;
    var st = SD.sets[h.s];
    if (!st) return null;
    if (h.t === "set") return { repo: st.repo, name: st.name, mono: st.mono, all: true };
    var nm = ((st.chunks || [])[h.c] || [])[h.p];
    return { repo: st.repo, name: st.name, mono: st.mono, icon: nm };
  }

  window.__SEARCH = {
    init: function (cb) { ensure(function (e) { if (!e) build(); if (cb) cb(e); }); },
    ready: function () { return !!(SD && IDX); },
    states: function () {
      return {
        loaded: !!SD, built: !!IDX, err: loadErr,
        ms: window.__SEARCH_BUILD_MS || 0,
        sets: SD ? SD.sets.length : 0
      };
    },
    search: query,
    info: info
  };

  function preload() {
    if (SD || loading) return;
    ensure(function (e) { if (!e) build(); });
  }
  if (window.addEventListener) {
    window.addEventListener("load", function () { setTimeout(preload, 300); });
  }
})();
