/*!
 * sw.js — 离线缓存（仅在通过 http/https 打开时生效）
 * 策略：同源 GET 请求优先走缓存，后台更新；离线时直接回退缓存。
 * 发布新版本时把下面的版本号 +1 即可强制刷新所有客户端缓存。
 */
var CACHE = 'fruit-puzzle-v16';
var ASSETS = [
  './',
  './index.html',
  './404.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/layout.css',
  './css/games.css',
  './js/core/util.js',
  './js/core/i18n.js',
  './js/core/store.js',
  './js/core/audio.js',
  './js/core/canvas.js',
  './js/core/input.js',
  './js/core/ui.js',
  './js/games/g2048.js',
  './js/games/match3.js',
  './js/games/memory.js',
  './js/main.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS).catch(function () { /* 个别资源缺失不影响安装 */ });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 离线时若无缓存则返回 503
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
