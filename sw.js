/* ui-icons-hub Service Worker
 * 策略：外壳预缓存 + 数据分片「先缓存后网络」——看过/搜过的图标库会被自动存下来，
 * 之后断网也能打开和检索（这也是 App「我的 → 已下载」里那些数据块的来源）。
 */
var VERSION = "uih-v1-2026-09-29";
var SHELL = [
  "./", "./index.html", "./icons.js", "./kits.js", "./search.js", "./search-data.js",
  "./vendor/flexsearch.min.js", "./manifest.webmanifest",
  "./icons/app-icon-192.png", "./icons/app-icon-512.png",
  "./app-icons/index.html", "./app-icons/icons.js",
  "./skills/software/index.html", "./skills/website/index.html", "./skills/game/index.html"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return c.add(u).catch(function () { /* 单个资源失败不影响安装 */ });
    }));
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === VERSION ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isData(u) { return /\/data\/.+\.js$/.test(u.pathname) || /\/app-icons\/png\//.test(u.pathname); }

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 数据分片：命中缓存直接返回，否则取回网络并写入缓存（自动积累「已下载」）
  if (isData(url)) {
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === "basic") c.put(req, res.clone());
          return res;
        }).catch(function () { return new Response("", { status: 504 }); });
      });
    }));
    return;
  }

  // 外壳与页面：缓存优先，断网时保证可用
  e.respondWith(caches.match(req).then(function (hit) {
    if (hit) {
      fetch(req).then(function (res) {
        if (res && res.status === 200) caches.open(VERSION).then(function (c) { c.put(req, res.clone()); });
      }).catch(function () {});
      return hit;
    }
    return fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === "basic") {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      if (req.mode === "navigate") return caches.match("./index.html");
      return Response.error ? Response.error() : new Response("", { status: 504 });
    });
  }));
});

self.addEventListener("message", function (e) {
  if (e.data === "stats") {
    caches.open(VERSION).then(function (c) {
      c.keys().then(function (reqs) {
        var data = reqs.filter(function (r) { return isData(new URL(r.url)); });
        var msg = { count: data.length, urls: data.map(function (r) { return r.url; }) };
        e.source && e.source.postMessage(msg);
      });
    });
  }
});
