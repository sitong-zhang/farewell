/*! ui-icons-hub cdn.js v1.0.0 · MIT
 * 一行引入，即可在任意网页里检索 215 套图标库 / 345,961 个 SVG 图标，支持中文意图。
 *
 *   <script src="https://cdn.jsdelivr.net/gh/sitong-zhang/ui-icons-hub@v1.0.0/cdn.js"></script>
 *   <script>
 *     UIH.searchSvg('购物车').then(r => console.log(r[0].name, r[0].svg));
 *     UIH.list().then(list => console.log(list.length));   // 215
 *   </script>
 *
 * 设计要点：
 *  - 索引（index-compact.json，gzip 后约 1.4 MB）首次检索时按需拉取，之后交给浏览器缓存。
 *  - 命中之后才去拉对应数据分片（data/<slug>__<i>.js），不会为了搜一个词把 300 MB 全下下来。
 *  - 分片沿用本站既有格式 window.__ADD2(repo,[[name,body]],idx)，这里实现一个最小收集器。
 */
(function (global) {
  "use strict";

  var VERSION = "1.0.0";

  var base = (function () {
    var s = document.currentScript;
    if (!s) {
      var all = document.getElementsByTagName("script");
      for (var i = all.length - 1; i >= 0; i--) if (/cdn\.js(\?|$)/.test(all[i].src)) { s = all[i]; break; }
    }
    var src = s && s.src ? s.src : "";
    return src ? src.replace(/cdn\.js(\?.*)?$/, "") : "./";
  })();

  // 分片收集器：__ADD2 把数据推进来，我们在 onload 之后取走
  var pending = null;
  global.__ADD2 = function (repo, pairs, idx) { pending = { repo: repo, pairs: pairs, idx: idx }; };

  var IDX = null, loading = null;
  var SET_INFO = {}, SET_LIST = [], NAMES = {}, ALIAS = [], SYN = {}, CHUNK = {};

  function scriptOnce(url) {
    return new Promise(function (res, rej) {
      var e = document.createElement("script");
      e.src = url; e.async = true;
      e.onload = function () { res(url); };
      e.onerror = function () { rej(new Error("加载失败：" + url)); };
      document.head.appendChild(e);
    });
  }

  function afterIndex() {
    IDX.s.forEach(function (row, i) {
      var slug = row[0];
      SET_INFO[slug] = {
        slug: slug, name: row[1], repo: row[2], group: row[3], license: row[4],
        mono: !!row[5], count: row[6], nchunks: row[7],
        wrap: row[8], stars: row[9], homepage: row[10]
      };
      NAMES[slug] = IDX.n[i];
    });
    ALIAS = IDX.a || [];
    SYN = IDX.y || {};
    SET_LIST = IDX.s.map(function (row) { return SET_INFO[row[0]]; });
  }

  function loadIndex() {
    if (IDX) return Promise.resolve(IDX);
    if (loading) return loading;
    loading = fetch(base + "index-compact.json")
      .then(function (r) {
        if (!r.ok) throw new Error("索引加载失败 HTTP " + r.status + "：" + base + "index-compact.json");
        return r.json();
      })
      .then(function (j) { IDX = j; afterIndex(); return j; })
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }

  // 把 query 拆成若干候选词：
  //   "购物车" → ["购物车","cart","shopping-cart","basket"]（查中文意图词典）
  //   "feather home" → 先试整串，再拆成 ["feather","home"] 各查一次（多词 OR）
  function expand(q) {
    var whole = String(q == null ? "" : q).trim();
    var out = [];
    function push(v) { if (v && out.indexOf(v) < 0) out.push(v); }

    push(whole);
    var hit = SYN[whole];
    if (!hit) {
      for (var k in SYN) {
        if (k.length >= 2 && whole.indexOf(k) >= 0) { hit = SYN[k]; break; }
      }
    }
    if (hit) hit.forEach(push);

    if (/\s/.test(whole)) {
      whole.split(/\s+/).forEach(function (w) {
        if (!w) return;
        push(w);
        var h2 = SYN[w];
        if (h2) h2.forEach(push);
      });
    }
    return out;
  }

  // 0 完全同名 · 1 前缀 · 2 词边界 · 3 子串
  function score(name, terms) {
    var ln = name.toLowerCase(), best = 99, where = -1;
    for (var i = 0; i < terms.length; i++) {
      var t = String(terms[i] || "").toLowerCase();
      if (!t) continue;
      var p = ln.indexOf(t);
      if (p < 0) continue;
      var s = (p === 0 && ln.length === t.length) ? 0 : p === 0 ? 1 : /[-_ ]/.test(ln.charAt(p - 1)) ? 2 : 3;
      if (s < best) { best = s; where = i; }
      if (best === 0) break;
    }
    return { s: best, t: where };
  }

  function indexOfName(slug, name) {
    var arr = NAMES[slug];
    if (!arr) return null;
    for (var c = 0; c < arr.length; c++) {
      var i = arr[c].indexOf(name);
      if (i >= 0) return { c: c, i: i };
    }
    return null;
  }

  function search(q, opt) {
    opt = opt || {};
    var limit = opt.limit || 60;
    return loadIndex().then(function () {
      var terms = expand(String(q == null ? "" : q).trim());
      var hits = [], slug, c, k, sc;

      for (slug in NAMES) {
        var arr = NAMES[slug];
        for (c = 0; c < arr.length; c++) {
          var names = arr[c];
          for (k = 0; k < names.length; k++) {
            sc = score(names[k], terms);
            if (sc.s < 99) hits.push({ name: names[k], slug: slug, chunk: c, s: sc.s, t: sc.t, len: names[k].length });
          }
        }
      }
      for (var i = 0; i < ALIAS.length; i++) {
        var pairs = ALIAS[i][1];
        for (var j = 0; j < pairs.length; j++) {
          sc = score(pairs[j][0], terms);
          if (sc.s < 99) {
            var owner = pairs[j][1], pos = indexOfName(ALIAS[i][0], owner);
            if (pos) hits.push({ name: owner, via: pairs[j][0], slug: ALIAS[i][0], chunk: pos.c, s: sc.s + 1, t: sc.t, len: owner.length });
          }
        }
      }
      if (opt.set) hits = hits.filter(function (h) { return h.slug === opt.set; });

      hits.sort(function (a, b) {
        return (a.s - b.s) || (a.t - b.t) || (a.len - b.len) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      });

      var seen = {}, out = [];
      for (var z = 0; z < hits.length && out.length < limit; z++) {
        var key = hits[z].slug + "/" + hits[z].name;
        if (seen[key]) continue;
        seen[key] = 1;
        out.push(hits[z]);
      }
      return out;
    });
  }

  function describe(h) {
    var st = SET_INFO[h.slug] || {};
    return {
      name: h.name, alias: h.via || null, slug: h.slug, chunk: h.chunk,
      set: st.name, repo: st.repo, license: st.license, homepage: st.homepage,
      group: st.group, mono: st.mono, svg: null
    };
  }

  // 分片按序加载：__ADD2 的收集器是共享的，并发会互相覆盖，所以串行化
  var chain = Promise.resolve();

  function loadChunk(slug, i) {
    var run = function () {
      var key = slug + "__" + i;
      if (CHUNK[key]) return Promise.resolve(CHUNK[key]);
      // 分片里 __ADD2 的第一个参数是图标库的原始 repo（保留大小写），以索引里的为准
      var st = SET_INFO[slug] || {};
      var expect = st.repo || slug.replace("__", "/");
      return scriptOnce(base + "data/" + key + ".js").then(function () {
        var map = {};
        if (pending && pending.repo === expect) {
          var pairs = pending.pairs || [];
          for (var k = 0; k < pairs.length; k++) map[pairs[k][0]] = pairs[k];
        }
        pending = null;
        CHUNK[key] = map;
        return map;
      });
    };
    chain = chain.then(run, run);
    return chain;
  }

  function wrapSvg(slug, body, pair) {
    if (pair && pair.length > 2) {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + pair[2] + " " + pair[3] + '">' + body + "</svg>";
    }
    var st = SET_INFO[slug] || {};
    var w = st.wrap || '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
    var cut = w.indexOf("</svg>");
    if (cut > 0) w = w.slice(0, cut);
    return w + body + "</svg>";
  }

  var API = {
    version: VERSION,
    base: base,

    /** 加载索引，返回 Promise<API>（也接受回调） */
    ready: function (cb) {
      var p = loadIndex();
      if (typeof cb === "function") p.then(function () { cb(API); });
      return p.then(function () { return API; });
    },

    /** 检索：返回 [{name, slug, set, repo, license, homepage, alias}]，不含 svg */
    search: function (q, opt) {
      return search(q, opt).then(function (list) { return list.map(describe); });
    },

    /** 检索并取回 svg 源码（会加载命中所在的那些分片） */
    searchSvg: function (q, opt) {
      return search(q, opt).then(function (list) {
        return Promise.all(list.map(function (h) {
          return loadChunk(h.slug, h.chunk).then(function (map) {
            var o = describe(h), pair = map[h.name];
            o.svg = pair ? wrapSvg(h.slug, pair[1], pair) : null;
            return o;
          });
        }));
      });
    },

    /** 取单个图标（含 svg 源码） */
    icon: function (slug, name) {
      return loadIndex().then(function () {
        var pos = indexOfName(slug, name);
        if (!pos) return null;
        return loadChunk(slug, pos.c).then(function (map) {
          var pair = map[name];
          if (!pair) return null;
          var st = SET_INFO[slug] || {};
          return {
            name: name, slug: slug, set: st.name, repo: st.repo, license: st.license,
            homepage: st.homepage, group: st.group, mono: st.mono,
            svg: wrapSvg(slug, pair[1], pair)
          };
        });
      });
    },

    /** 215 套图标库清单，可按 group 过滤（general / brand / emoji） */
    list: function (group) {
      return loadIndex().then(function () {
        return SET_LIST.filter(function (s) { return !group || s.group === group; });
      });
    },

    /** 单套图标库的图标名单 */
    names: function (slug) {
      return loadIndex().then(function () {
        var arr = NAMES[slug];
        if (!arr) return null;
        var out = [];
        arr.forEach(function (c, i) { c.forEach(function (n) { out.push({ name: n, chunk: i }); }); });
        return out;
      });
    },

    /** 中文意图词典（183 条） */
    synonyms: function () { return loadIndex().then(function () { return IDX.y; }); },

    /** 测试用：清空内存缓存 */
    _reset: function () {
      IDX = null; loading = null; CHUNK = {}; NAMES = {}; ALIAS = []; SYN = {};
      SET_INFO = {}; SET_LIST = [];
    }
  };

  global.UIH = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
