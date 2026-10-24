/* ============================================================
   Service Worker —— 《东方新纪行》离线壳
   ------------------------------------------------------------
   ⚠️ 升级版本时必须同时改三处（否则老用户会一直吃旧缓存）：
      1) 本文件 CACHE_VERSION（下面那一行）
      2) index.html 里 script/link 的 ?v=（platform.js 用 PLATFORM_VERSION）
      3) src/ui/platform.js 的 PLATFORM_VERSION
   ------------------------------------------------------------
   策略：
     - install：预缓存离线壳（./、./index.html、manifest），单个失败不影响安装
     - activate：删掉所有旧版本 cache（hks-* 前缀）+ clients.claim() 立刻接管
     - navigation：network-first（4s 超时），失败回退缓存 index.html
     - 带 ?v= 的静态资源：cache-first（URL 变了缓存自然失效，永不脏）
     - 其它同源 GET：stale-while-revalidate
     - 不碰：非 GET、跨域、range 请求、非 200、chrome-extension://、sw.js 自身
   ============================================================ */

const CACHE_VERSION = 'hks-v1.6.6';
const CACHE_PREFIX = 'hks-';
const OFFLINE_URL = './index.html';
const NETWORK_TIMEOUT = 4000;
/** 预缓存离线壳；单个失败（404/网络抖动）不影响安装 */
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './src/ui/platform.css?v=1.6.6'];

const OFFLINE_HTML =
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<title>东方新纪行 · 离线</title><style>' +
  'html,body{margin:0;height:100%;background:#05030a;color:#f2e9d8;' +
  'font:14px/1.7 "Songti SC","SimSun",serif;display:flex;align-items:center;justify-content:center;text-align:center}' +
  'h1{font-size:18px;letter-spacing:.1em;color:#f2d24b;margin:0 0 8px}p{margin:0;color:rgba(242,233,216,.6)}' +
  'button{margin-top:16px;padding:8px 20px;border-radius:999px;border:1px solid rgba(242,210,75,.5);' +
  'background:transparent;color:#f2d24b;font:inherit;cursor:pointer}</style></head><body><div>' +
  '<h1>东方新纪行</h1><p>离线中：本页面还没缓存完整资源</p>' +
  '<button onclick="location.reload()">重新加载</button></div></body></html>';

/* ------------------------------------------------------------
   install / activate
   ------------------------------------------------------------ */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            // cache: 'reload' 绕过 HTTP 缓存，确保拿到最新一份
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (err) {
            /* 单个资源失败不影响 SW 安装 */
          }
        })
      );
      // 新版立刻进入 waiting → activate，避免用户长时间停留在旧缓存
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
      if (self.registration.navigationPreload) {
        // 导航预加载：让 network-first 在弱网下更快拿到首屏
        try {
          await self.registration.navigationPreload.disable();
        } catch (err) {
          /* 忽略 */
        }
      }
      await self.clients.claim();
    })()
  );
});

/* ------------------------------------------------------------
   工具
   ------------------------------------------------------------ */

function isCacheable(res) {
  if (!res) return false;
  if (res.status !== 200) return false;
  // 同源请求是 basic；cors/opaque 不缓存（避免把第三方页面缓存下来）
  if (res.type !== 'basic' && res.type !== 'default') return false;
  return true;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function openCache() {
  return caches.open(CACHE_VERSION);
}

/** 带 ?v= 的资源：缓存优先，命中即返回（版本号变了 URL 就变，无需失效逻辑） */
async function cacheFirst(request) {
  const cache = await openCache();
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (isCacheable(res)) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

/** 其余同源 GET：先给缓存，同时后台静默更新 */
async function staleWhileRevalidate(request) {
  const cache = await openCache();
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (isCacheable(res)) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  if (hit) {
    network.catch(() => {});
    return hit;
  }
  const res = await network;
  if (res) return res;
  return new Response('', { status: 504, statusText: 'Offline' });
}

/** 导航：网络优先（4s 超时），抓不到就回退离线壳 */
async function navigationHandler(request) {
  try {
    const res = await withTimeout(fetch(request), NETWORK_TIMEOUT);
    if (res && res.ok) {
      const cache = await openCache();
      // 顺手把最新 index.html 存成离线壳
      cache.put(OFFLINE_URL, res.clone()).catch(() => {});
      return res;
    }
    throw new Error('bad status: ' + (res && res.status));
  } catch (err) {
    const cache = await openCache();
    const cached =
      (await cache.match(request)) ||
      (await cache.match(OFFLINE_URL)) ||
      (await cache.match('./')) ||
      (await cache.match('./index.html'));
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

/* ------------------------------------------------------------
   fetch 路由
   ------------------------------------------------------------ */

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  if (url.origin !== self.location.origin) return; // 跨域一律放行
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return; // chrome-extension:// 等
  if (request.headers.has('range')) return; // 音视频分片不缓存
  if (url.pathname.endsWith('/sw.js')) return; // SW 脚本本身绝不缓存，否则升不了级

  // DevTools 的 only-if-cached 请求需要同源，否则直接抛错
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  const versioned = /[?&]v=[\w.\-]+/.test(url.search);
  event.respondWith(versioned ? cacheFirst(request) : staleWhileRevalidate(request));
});

/* ------------------------------------------------------------
   message：页面加载完后把真实请求过的资源「预热」进 SW 缓存
   （首访也能在断网时进入标题页，而不只是白屏 index.html）
   ------------------------------------------------------------ */

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'hks:warm') {
    event.waitUntil(
      (async () => {
        const cache = await openCache();
        const urls = Array.isArray(data.urls) ? data.urls.slice(0, 400) : [];
        for (const raw of urls) {
          try {
            const abs = new URL(String(raw), self.location.href);
            if (abs.origin !== self.location.origin) continue;
            if (abs.pathname.endsWith('/sw.js')) continue;
            const key = abs.href;
            const existed = await cache.match(key);
            if (existed) continue;
            const res = await fetch(abs.href, { cache: 'no-cache' });
            if (isCacheable(res)) await cache.put(key, res.clone());
          } catch (err) {
            /* 单个资源失败忽略 */
          }
        }
      })()
    );
    return;
  }

  if (data.type === 'hks:stats') {
    const port = event.ports && event.ports[0];
    if (!port) return;
    event.waitUntil(
      (async () => {
        try {
          const cache = await openCache();
          const keys = await cache.keys();
          port.postMessage({ ok: true, version: CACHE_VERSION, count: keys.length, keys: keys.map((r) => r.url).slice(0, 60) });
        } catch (err) {
          port.postMessage({ ok: false, version: CACHE_VERSION, error: String(err) });
        }
      })()
    );
    return;
  }

  if (data.type === 'hks:clear') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k)));
      })()
    );
  }
});
