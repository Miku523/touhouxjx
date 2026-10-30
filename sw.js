/* ============================================================
   Service Worker —— 《东方新纪行》离线壳
   ------------------------------------------------------------
   ⚠️ 升级版本时必须同时改三处（否则老用户会一直吃旧缓存）：
      1) 本文件 CACHE_VERSION（下面那一行）
      2) index.html 里 script/link 的 ?v=（platform.js 用 PLATFORM_VERSION）
      3) src/ui/platform.js 的 PLATFORM_VERSION
      （src/ 里被 import 的内层模块不用进 ?v= 清单：下面走网络优先，见策略）
   ------------------------------------------------------------
   策略：
     - install：预缓存离线壳（./、./index.html、manifest），单个失败不影响安装
     - activate：删掉所有旧版本 cache（hks-* 前缀）+ clients.claim() 立刻接管
     - navigation：network-first（4s 超时），失败回退缓存 index.html
     - 带 ?v= 的静态资源：cache-first（URL 变了缓存自然失效，永不脏）
     - 代码资源（.js / .css，含内层 import 的、不带 ?v= 的那些）：
       同一发布版本内 cache-first（复访 0 个网络往返，国内弱网感知最强），版本令牌
       变了就自动失效并整包从网络重抓（见下面「发布版本令牌」）。stale-while-revalidate
       会先吐缓存里的旧模块，部署后第一次刷新就成了「新入口 + 旧内层」，改动要刷两次
       才生效，所以代码不走它；而同一版本内代码不可能变，缓存优先既安全又最快。
       断网时回退缓存，离线壳照旧可用。
     - 其它同源 GET（图片 / 音频 / manifest 等）：stale-while-revalidate
     - 不碰：非 GET、跨域、range 请求、非 200、chrome-extension://、sw.js 自身
   ============================================================ */

const CACHE_VERSION = 'hks-v1.6.48';
const CACHE_PREFIX = 'hks-';
const OFFLINE_URL = './index.html';
const NETWORK_TIMEOUT = 4000;
/**
 * 没有缓存兜底时不再设人为超时（v1.6.48 起）。4s 只适用于「超时还能回缓存」的场景；
 * 冷缓存 / 换版本（purgeCodeCache 已清空代码缓存）时模块只能走网络，
 * 15KB/s 下 69 个模块排 6 条连接，队首到队尾光排队就要 30-40s，整图跑完 2 分钟以上。
 * 实测：30s 上限 → 一次重载 70 条 504；120s 上限 → 仍有 28-36 条（队尾请求），
 * 同时页面重试又白下 ~0.93MB。任何固定上限都会切到队尾，所以干脆不加：
 * 网络真断了 fetch 自己会 reject（network 已 catch 成 null），那时才回缓存 / 504。
 */
/**
 * hks:warm 预热预算（防止弱网 / 慢链路下把整站再下一遍，和前台立绘、音乐抢带宽）：
 *   · 字节：SW 生命周期内累计，最多额外下 1.5MB
 *   · 时间：单次预热最多跑 8s
 * 超预算就停，已经拿到的照常进缓存（离线壳不受影响，见 PRECACHE）。
 */
const WARM_MAX_BYTES = 1.5 * 1024 * 1024;
const WARM_MAX_MS = 8000;
/** 本次 SW 生命周期里 hks:warm 已经额外下载的字节数（两次 warm 共享同一份预算） */
let warmSpentBytes = 0;
/** 预缓存离线壳；单个失败（404/网络抖动）不影响安装 */
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './src/ui/platform.css?v=1.6.48'];

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
   发布版本令牌
   ------------------------------------------------------------
   index.html 里入口 script/link 都带 ?v=<版本>。导航抓到 HTML 时把版本号记下来：
     · 同版本 → 代码资源可以安全吃缓存（复访几乎 0 个网络往返）
     · 换版本 → 清掉缓存里的 .js / .css，本次加载全部从网络重抓，保证「一次刷新就生效」
   万一发布时漏改版本串（违反三处同升的纪律），最多混用到下一次升级；SW 脚本本身
   换 CACHE_VERSION 时 activate 会整包重建，属于兜底。
   ------------------------------------------------------------ */

const TOKEN_KEY = new URL('./__hks_version__', self.location.href).href;

/** SW 生命周期内缓存版本令牌，避免每个代码请求都读一次 Cache */
let tokenMemo = null;

async function readVersionToken() {
  if (tokenMemo !== null) return tokenMemo;
  try {
    const cache = await openCache();
    const res = await cache.match(TOKEN_KEY);
    tokenMemo = res ? (await res.text()).trim() : '';
  } catch (err) {
    tokenMemo = '';
  }
  return tokenMemo;
}

async function writeVersionToken(token) {
  tokenMemo = token;
  try {
    const cache = await openCache();
    await cache.put(
      TOKEN_KEY,
      new Response(token, {
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
      })
    );
  } catch (err) {
    /* 写不进去就退化成 network-first，功能不受影响 */
  }
}

/** 从 index.html 里读发布版本：入口 script/style 的 ?v= 就是本次发布号 */
function parseVersionToken(html) {
  const m = /(?:main\.js|style\.css|platform\.js)\?v=([0-9A-Za-z._-]+)/.exec(html || '');
  return m ? m[1] : '';
}

/** 发布版本变了：清掉旧代码，逼本次加载从网络重抓（图片 / 音频 / 离线壳不动） */
async function purgeCodeCache() {
  try {
    const cache = await openCache();
    const keys = await cache.keys();
    await Promise.all(
      keys.map((req) => {
        let pathname = '';
        try {
          pathname = new URL(req.url).pathname;
        } catch (err) {
          return null;
        }
        return /\.(?:m?js|css)$/i.test(pathname) ? cache.delete(req).catch(() => {}) : null;
      })
    );
  } catch (err) {
    /* 清不掉最多多吃一次旧代码，下次升级整包重建 */
  }
}
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

/** 代码资源（脚本 / 样式）：这类请求 SW 走网络优先，保证改完代码一次刷新就生效 */
function isCodeRequest(request, url) {
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'worker'
  ) {
    return true;
  }
  return /\.(?:m?js|css)$/i.test(url.pathname);
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

/**
 * 代码资源（.js / .css，含 main.js 里 import 进来的那些不带 ?v= 的内层模块）：
 * 网络优先，断网回退缓存。
 *
 * 为什么不沿用 stale-while-revalidate：它命中缓存时直接吐旧文件、后台再更新。
 * 部署后第一次刷新的顺序是「index.html（导航，网络优先）→ main.js?v=新（URL 变了，
 * 必然走网络）→ main.js 再 import ./engine/audio.js（URL 没变，命中旧缓存）」，
 * 于是新入口对着旧内层跑，改动要刷新两次才生效。代码文件不大、浏览器还有 HTTP
 * 校验，发布换版本那次多一轮 304 换「一次刷新生效」是划算的；同版本内由 codeHandler
 * 直接吃缓存，不需要这里兜底。断网时照样回退缓存。
 */
async function networkFirst(request) {
  const cache = await openCache();
  // 先看一眼有没有缓存兜底（这一步很便宜）：它决定这次敢不敢用 4s 短超时。
  //   有兜底 → 保持弱网 / 断网体验：4s 内没拿到就吃缓存；
  //   无兜底（首访 / 换版本后 purgeCodeCache 已清空）→ 短超时会系统性地掐断
  //             慢但健康的模块请求，改用一个只防卡死的长上限。
  const cached = await cache.match(request);
  let network;
  try {
    // cache: 'no-cache' 强制向服务器校验，避免浏览器 HTTP 缓存把旧文件再端回来
    network = fetch(new Request(request, { cache: 'no-cache' }));
  } catch (err) {
    return cached || new Response('', { status: 504, statusText: 'Offline' });
  }
  // 不管这次等不等它，都让这次 fetch 跑完并写进缓存：玩家已经付过的字节不能白付
  // （超时只影响「这次响应用什么」，不影响这次下载继续落地）。
  network = network
    .then((res) => {
      if (res && res.ok && isCacheable(res)) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);

  if (cached) {
    // 有兜底：最多等 4s，超时 / 失败 / 状态不对都先用旧缓存顶上，网络那次继续在后台跑
    const res = await withTimeout(network, NETWORK_TIMEOUT).catch(() => null);
    if (res && res.ok) return res;
    return cached;
  }

  // 无兜底：这次请求就是玩家真正在下载的那一次，不要给它加人为超时。
  // 15KB/s 下 69 个模块排 6 条连接，队尾要等两分钟以上——加 120s 上限只会把队尾
  // 掐成 504 再让页面重试、白付一遍字节（实测复访 28 条 504 / 0.93MB 重下）。
  // 网络真断了 fetch 会自己 reject（network 已 catch 成 null），落到缓存兜底。
  const res = await network;
  if (res && res.ok) return res;
  if (cached) return cached;
  return new Response('', { status: 504, statusText: 'Offline' });
}

/**
 * 代码资源：同一发布版本内缓存优先，跨版本 / 无缓存时网络优先。
 *
 * 复访时几十个入口模块全部命中 SW 缓存 → 启动只剩 1 个导航往返（弱网下省 2~3 个 RTT，
 * 也不会在弱网里反复等 85 个 304）。版本令牌变了 → purgeCodeCache 已清空 .js/.css，
 * 这里自然全部走网络；断网时 networkFirst 内部回退缓存，离线壳照旧可用。
 */
async function codeHandler(request) {
  const token = await readVersionToken();
  if (token) {
    const cache = await openCache();
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  return networkFirst(request);
}
/**
 * 记住本次发布版本的令牌：版本变了就清掉旧代码缓存
 * （本次加载的 .js/.css 全部从网络重抓，不吃旧内层的缓存）。
 */
async function rememberVersionToken(htmlText) {
  try {
    const token = parseVersionToken(htmlText);
    if (!token) return;
    const prev = await readVersionToken();
    if (prev !== token) {
      await writeVersionToken(token);
      if (prev) await purgeCodeCache();
    }
  } catch (err) {
    /* 解析失败不影响导航 */
  }
}

/**
 * 弱网兜底的后台补拉：本次导航 4s 超时、只能拿缓存壳时，在后台再拉一次网络版
 * index.html，更新离线壳与版本令牌（顺便清掉版本不匹配的旧代码缓存），
 * 保证「这次能玩、下次刷新就是新版」，而不是一直卡在旧壳上。
 * 用 event.waitUntil 续命，绝不阻塞本次响应。
 */
async function refreshShellInBackground(request) {
  // 先让出首屏带宽：等一会再补拉
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const res = await withTimeout(fetch(new Request(request.url, { cache: 'no-store', credentials: 'same-origin' })), 20000);
    if (!res || !res.ok) return;
    const cache = await openCache();
    cache.put(OFFLINE_URL, res.clone()).catch(() => {});
    await rememberVersionToken(await res.clone().text());
  } catch (err) {
    /* 后台补拉失败不打扰用户 */
  }
}

/** 导航：网络优先（4s 超时），抓不到就回退离线壳 */
async function navigationHandler(request, event) {
  try {
    const res = await withTimeout(fetch(request), NETWORK_TIMEOUT);
    if (res && res.ok) {
      const cache = await openCache();
      // 顺手把最新 index.html 存成离线壳
      cache.put(OFFLINE_URL, res.clone()).catch(() => {});
      // 记下本次发布的版本令牌；版本变了就清掉旧代码（本次加载全部从网络重抓）
      await rememberVersionToken(await res.clone().text());
      return res;
    }
    throw new Error('bad status: ' + (res && res.status));
  } catch (err) {
    // 弱网 / 断网：本次先用缓存壳顶上，同时在后台补拉网络版（下次刷新即新版）
    try {
      if (event && typeof event.waitUntil === 'function') {
        event.waitUntil(refreshShellInBackground(request));
      }
    } catch (e) {
      /* 不支持 waitUntil 也不影响返回 */
    }
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
    event.respondWith(navigationHandler(request, event));
    return;
  }

  // 代码资源：同一发布版本内缓存优先（复访 0 往返）；换版本后 network-first 重抓，
  // 保证「改完代码刷新一次就生效」，而不是先跑一轮旧模块。
  if (isCodeRequest(request, url)) {
    event.respondWith(codeHandler(request));
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
        const started = Date.now();
        const stats = { fetched: 0, cached: 0, failed: 0, bytes: 0, elapsed: 0, stop: 'done' };
        try {
          const cache = await openCache();
          const urls = Array.isArray(data.urls) ? data.urls.slice(0, 400) : [];
          for (const raw of urls) {
            // 预算：超时 / 超字节就停，剩下的下次加载再说，绝不跟前台抢带宽
            if (Date.now() - started >= WARM_MAX_MS) { stats.stop = 'time'; break; }
            if (warmSpentBytes >= WARM_MAX_BYTES) { stats.stop = 'bytes'; break; }
            try {
              const abs = new URL(String(raw), self.location.href);
              if (abs.origin !== self.location.origin) continue;
              if (abs.pathname.endsWith('/sw.js')) continue;
              const key = abs.href;
              if (await cache.match(key)) { stats.cached++; continue; }
              // 默认 cache 模式：尊重 HTTP 缓存，新鲜 / 刚校验过的资源不会再下一次
              const res = await fetch(abs.href);
              if (!isCacheable(res)) { stats.failed++; continue; }
              // 没有 content-length（分块传输）时按 64KB 记一笔，避免预算被绕过
              const cost = Number(res.headers.get('content-length') || 0) || 64 * 1024;
              if (warmSpentBytes + cost > WARM_MAX_BYTES) { stats.stop = 'bytes'; break; }
              await cache.put(key, res.clone());
              warmSpentBytes += cost;
              stats.bytes += cost;
              stats.fetched++;
            } catch (err) {
              stats.failed++; /* 单个资源失败继续下一个 */
            }
          }
        } catch (err) {
          stats.stop = 'error';
        }
        stats.elapsed = Date.now() - started;
        // 统计回传（页面可观测，也方便 QA 量这次预热到底额外下了多少字节）
        const report = Object.assign(
          { type: 'hks:warm-done', version: CACHE_VERSION, urls: Array.isArray(data.urls) ? data.urls.length : 0 },
          stats
        );
        try {
          const port = event.ports && event.ports[0];
          if (port) port.postMessage(report);
        } catch (err) { /* ignore */ }
        try {
          const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          for (const client of all) client.postMessage(report);
        } catch (err) { /* ignore */ }
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
