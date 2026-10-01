/* ui-icons-hub search engine: FlexSearch + Chinese-intent synonyms + aliases + incremental indexing
 *
 * Design notes:
 * 1) The index stores only "icon name / alias", and uses numeric ids to resolve (set index, chunk index, name position),
 *    avoiding a second object array for hundreds of thousands of records; names are fetched on demand from SEARCH_DATA.
 * 2) Synchronously building an index for ~380k documents would block the main thread; here we build it incrementally in
 *    time-sliced chunks, and the UI can show progress.
 * 3) Only after a hit do we load the few corresponding data chunks; the SVG itself is needed only at render time,
 *    fully replacing the old approach of "pulling every set and every chunk for a linear scan".
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
      flush(new Error("Failed to load index data"));
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

  /* Aliases: alternative names for the same glyph; indexed as a separate entry that points to the parent icon on a hit */
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

  /* Chinese intent -> English keyword expansion */
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

  /* Relevance ranking: exact name > prefix hit > word-boundary hit > substring hit; ties broken by shorter name first */
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
      } catch (e) { /* A single word's error does not affect the whole */ }
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

  /* Warm up when idle so the first search doesn't stutter */
  function preload() {
    if (SD || loading) return;
    ensure(function (e) { if (!e) build(); });
  }
  if (window.addEventListener) {
    window.addEventListener("load", function () { setTimeout(preload, 600); });
  }
})();
