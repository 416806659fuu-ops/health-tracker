const CACHE = 'health-tracker-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './intake.js',
  './history.js',
  './settings.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // 跨域请求（比如 Google Apps Script 的 /api 数据接口）直接走网络，
  // 不进缓存逻辑——Cache API 也不支持缓存 POST 请求。
  if (url.origin !== location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }
  // 静态文件用「网络优先」：在线时永远拿最新代码，只有离线才退回缓存，
  // 避免每次改代码都要手动清缓存/记得改版本号。
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
