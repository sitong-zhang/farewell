/* ui-icons-hub Service Worker
 * Strategy: pre-cache the shell + "cache-then-network" for data chunks — any
 * icon set you've viewed or searched is stored automatically, so the site keeps
 * working offline (this is also where the app's "My Downloads" blocks come from).
 */
var VERSION = "uih-v1-2026-09-29";
var SHELL = [
  "./", "./index.html", "./icons.js", "./kits.js", "./search.js", "./search-data.js",
  "./vendor/flexsearch.min.js", "./manifest.webmanifest",
  "./icons/app-icon-192.png", "./icons/app-icon-512.png",
  "./app-icons/index.html", "./app-icons/icons.js",
  "./skills/software/index.html", "./skills/website/index.html", "./skills/game/index.html",
  "./cdn.html", "./cdn.js"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return c.add(u).catch(function () { /* one failed resource does not block install */ });
    }));
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === VERSION ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isData(u) { return /\/data\/.+\.js$/.test(u.pathname) || /\/app-icons\/png\//.test(u.pathname); }

/* The online (connected) install packages ship only the shell, not the 300+ MB
 * of icon data. Local requests then 404, so we fall back to GitHub Pages to
 * fetch the chunk, write it into the local cache, and that way the "My
 * Downloads" section fills up little by little and stays usable offline later.
 * On the live site (origin is already Pages) this fallback branch never fires. */
var REMOTE = "https://sitong-zhang.github.io/ui-icons-hub";
function isSelfHosted() { return self.location.origin !== REMOTE; }

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Data chunks: return from cache on hit, otherwise fetch over the network and
  // write into the cache (auto-accumulating "My Downloads").
  if (isData(url)) {
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === "basic") { c.put(req, res.clone()); return res; }
          if (url.origin === REMOTE || !isSelfHosted()) return res;
          // Local shell has no this chunk -> fetch from the live repo
          return fetch(REMOTE + url.pathname, { mode: "cors" }).then(function (r2) {
            if (r2 && r2.status === 200) c.put(req, r2.clone());
            return r2;
          });
        }).catch(function () {
          if (url.origin === REMOTE || !isSelfHosted()) return new Response("", { status: 504 });
          return fetch(REMOTE + url.pathname, { mode: "cors" }).catch(function () {
            return new Response("", { status: 504 });
          });
        });
      });
    }));
    return;
  }

  // Shell and pages: cache-first, so they stay usable offline
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
