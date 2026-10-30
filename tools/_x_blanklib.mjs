// blank-screen 复现/验证共用库（teammate harness，不改产品代码）
// 依赖 tools/_pt_core.mjs；代理 tools/_x_slowproxy.mjs 提供 挂起/延迟/404 注入。
// 页面侧代码放在 tools/_x_probe_src.js / tools/_x_dom_src.js（纯 JS，便于单独调试）。
import { launch, sleep, BASE } from './_pt_core.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export const PROXY = process.env.BLANK_PROXY || 'http://127.0.0.1:8139';
export const LOCAL = process.env.BLANK_LOCAL || 'http://127.0.0.1:8138';
export { sleep, BASE };

export const PROBE_SRC = readFileSync(new URL('./_x_probe_src.js', import.meta.url), 'utf8');
export const DOM_EXPR = readFileSync(new URL('./_x_dom_src.js', import.meta.url), 'utf8');

/* ---------- PNG 解码：客观量「背景是什么颜色」，不引第三方依赖 ---------- */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let off = 8, w = 0, h = 0, bitDepth = 8, colorType = 6;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth);
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * bpp);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const cur = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, bpp, px: out };
}
export const pixelAt = (img, x, y) => { const i = (Math.min(img.h - 1, y) * img.w + Math.min(img.w - 1, x)) * img.bpp; return [img.px[i], img.px[i + 1], img.px[i + 2]]; };
export const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
/** 4bit/通道直方图主色 + 采样点 + 亮像素占比（裸白底/浅字 vs 深色主题） */
export function colorStats(img) {
  const bins = new Map();
  for (let y = 0; y < img.h; y += 4) for (let x = 0; x < img.w; x += 4) {
    const [r, g, b] = pixelAt(img, x, y);
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    bins.set(k, (bins.get(k) || 0) + 1);
  }
  const total = [...bins.values()].reduce((a, b) => a + b, 0);
  const top = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({
    c: hex([((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17]), pct: +(100 * n / total).toFixed(1),
  }));
  const pts = [[64, 64], [640, 200], [1270, 710], [10, 8], [100, 700]].map(([x, y]) => ({ x, y, c: hex(pixelAt(img, x, y)) }));
  let light = 0, n = 0;
  for (let y = 0; y < img.h; y += 4) for (let x = 0; x < img.w; x += 4) { const [r, g, b] = pixelAt(img, x, y); n++; if (r + g + b > 360) light++; }
  return { top, pts, lightPct: +(100 * light / n).toFixed(2) };
}

export async function installProbe(T) { await T.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE_SRC }); }
export async function readProbe(T) {
  const s = await T.eval('window.__bp ? JSON.stringify(window.__bp) : null').catch(() => null);
  return s ? JSON.parse(s) : null;
}
export async function domState(T) {
  const s = await T.eval(DOM_EXPR).catch(() => null);
  return s ? JSON.parse(s) : null;
}

/* ---------- 网络条件 ---------- */
export const WARM = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
export async function throttle(T, { latency = 0, downKBps = 0, upKBps = 0, offline = false } = {}) {
  await T.send('Network.emulateNetworkConditions', {
    offline: offline, latency: latency,
    downloadThroughput: downKBps > 0 ? Math.round(downKBps * 1024) : -1,
    uploadThroughput: upKBps > 0 ? Math.round(upKBps * 1024) : -1,
  });
}
export async function cold(T) {
  try { await T.send('Network.setCacheDisabled', { cacheDisabled: true }); } catch {}
  try { await T.send('Network.clearBrowserCache'); } catch {}
}

/* ---------- 代理控制 ---------- */
export async function ctl(params) {
  const q = new URLSearchParams(params).toString();
  return (await fetch(PROXY + '/__ctl?' + q)).json();
}
export async function proxyLog() { return (await fetch(PROXY + '/__log')).json(); }

/* ---------- 采样：按墙钟时刻抓 DOM + 截图 ---------- */
export async function sampleAt(T, times, { dir, tag, shot = true } = {}) {
  const rows = [];
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  for (const at of times) {
    const wait = at * 1000 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    const row = { at: +(Date.now() - t0) / 1000 };
    try { row.dom = await domState(T); } catch (e) { row.domErr = String(e).slice(0, 200); }
    if (shot) {
      const f = dir + '/' + tag + '_' + at + 's.png';
      try {
        await T.shot(f);
        row.shot = f;
        try { row.img = colorStats(decodePng(readFileSync(f))); } catch (e) { row.imgErr = String(e).slice(0, 120); }
      } catch (e) { row.shotErr = String(e).slice(0, 160); }
    }
    rows.push(row);
  }
  return rows;
}

/* ---------- 判据：用户是否正在看「没样式的裸 DOM」 ---------- */
export function judge(dom) {
  if (!dom) return { exposed: true, reason: 'no-dom' };
  const vw = (dom.viewport && dom.viewport.w) || 1280, vh = (dom.viewport && dom.viewport.h) || 720;
  const covers = (b) => !!(b && b.vis && b.r && b.r.w >= vw * 0.9 && b.r.h >= vh * 0.9);
  const bootCovers = covers(dom.boot), overlayCovers = covers(dom.overlay);
  const hiddenLeak = (dom.hiddenVisible || []).length > 0;
  const hudRaw = !!(dom.hud && dom.hud.vis) && /POWER|博丽神社|STAGE/.test(dom.hud.text || '');
  const chipRaw = !!(dom.bct && dom.bct.vis);
  const covered = bootCovers || overlayCovers;
  const exposed = (hudRaw || chipRaw || hiddenLeak) && !covered;
  return { exposed, hiddenLeak, hudRaw, chipRaw, bootCovers, overlayCovers, cssReady: !!dom.cssReady,
    sheetsLoaded: (dom.links || []).filter((l) => l.sheet && l.rules !== 0).length,
    hiddenVisible: dom.hiddenVisible };
}

export function saveJson(file, obj) {
  const dir = file.lastIndexOf('/') > 0 ? file.slice(0, file.lastIndexOf('/')) : '.';
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2));
}
