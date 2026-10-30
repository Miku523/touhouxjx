// 首绘门控验证库：慢网/屏蔽/注入 + 快照 + 契约判定（只读产品代码）
import { sleep } from './_pt_core.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { colorStats } from './_x_blanklib.mjs';

export const LOCAL = process.env.VERIFY_BASE || 'http://127.0.0.1:8138';
export const GATE_EXPR = readFileSync(new URL('./_x_gate_src.js', import.meta.url), 'utf8');
export { sleep, colorStats };

export const block = (T, urls) => T.send('Network.setBlockedURLs', { urls });
export const unblock = (T) => T.send('Network.setBlockedURLs', { urls: [] });
export const throttle = (T, p) => T.send('Network.emulateNetworkConditions', {
  offline: !!p.offline, latency: p.latency || 0,
  downloadThroughput: p.down == null ? -1 : p.down, uploadThroughput: p.up == null ? -1 : p.up,
  connectionType: p.type || 'cellular3g'
});
export const cold = async (T) => {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.send('Network.clearBrowserCache', {});
  try { await T.send('Network.clearBrowserCookies', {}); } catch (e) {}
};

/** 导航 + 等待文档提交（Page.navigate 返回时可能仍在旧文档上，冷启动/慢网尤其明显） */
export async function nav(T, url) {
  await T.nav(url);
  const marker = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0] || '/';
  const ok = await T.waitFor('location.pathname.indexOf(' + JSON.stringify(marker) + ') >= 0', 10000, 25);
  if (process.env.GATE_DEBUG) console.log('NAV ' + marker + ' committed=' + ok + ' href=' + (await T.eval('location.pathname').catch(() => '?')));
  return ok;
}

export async function snap(T) {
  const r = await T.eval(GATE_EXPR);
  return typeof r === 'string' ? JSON.parse(r) : (r || null);
}

export async function bootState(T) {
  const r = await T.eval('JSON.stringify(window.__hksBootState?window.__hksBootState():null)');
  return r ? JSON.parse(r) : null;
}

/** 采样：times 单位为「秒」（相对文档 performance.now()）；保存截图 + 像素统计 */
export async function sample(T, times, opts) {
  const o = Object.assign({ dir: 'tools/shots/net_gate', tag: 's' }, opts || {});
  mkdirSync(o.dir, { recursive: true });
  const rows = [];
  for (const at of times) {
    // 以页面自身 performance.now() 为基准对齐采样点（导航提交时刻因冷启动/慢网而漂移）
    let pt = null;
    for (let guard = 0; guard < 120; guard++) {
      try { pt = await T.eval('Math.round(performance.now())'); } catch (e) { pt = null; }
      if (pt == null) { await sleep(100); continue; }
      const wait = at * 1000 - pt;
      if (process.env.GATE_DEBUG) console.log('  SAMPLE at=' + at + ' pt=' + JSON.stringify(pt) + ' wait=' + wait + ' guard=' + guard);
      if (wait <= 0) break;
      await sleep(Math.min(wait, 200));
    }
    let dom = null;
    try { dom = await snap(T); } catch (e) { dom = { err: String(e).slice(0, 200) }; }
    const wall = (dom && typeof dom.t === 'number') ? dom.t : pt;
    const file = o.dir + '/' + o.tag + '_' + String(at).padStart(3, '0') + 's.png';
    let img = null, shotMs = 0;
    try {
      const s0 = Date.now();
      await T.shot(file);
      shotMs = Date.now() - s0;
      const buf = readFileSync(file);
      const { decodePng } = await import('./_x_blanklib.mjs');
      img = colorStats(decodePng(buf));
    } catch (e) { img = null; }
    rows.push({ at, wall, dom, img, shot: file, shotMs });
  }
  return rows;
}

const glyph = (s) => String(s || '');

/** 契约判定（首绘门控）：任何未就绪时刻都不得出现可见的 #ui 非 #boot 子元素 */
export function gate(dom, img) {
  const d = dom || {};
  const st = d.state || {};
  const kids = (d.ui || []).filter((k) => k && k.id !== 'boot');
  const leaked = kids.filter((k) => k.vis && glyph(k.tx).length > 0);
  const hudRaw = !!(d.hud && d.hud.vis && glyph(d.hud.tx).length > 0);
  const chipRaw = !!(d.bct && d.bct.vis && glyph(d.bct.tx).length > 0);
  const panelVis = !!(d.panel && d.panel.vis);
  const hintVis = !!(d.hint && d.hint.vis && glyph(d.hint.tx).length > 0);
  const bootVis = !!(d.boot && d.boot.vis);
  const bootStyled = !!(d.boot && (String(d.boot.bgi).indexOf('gradient') >= 0 || String(d.boot.bg) !== 'rgba(0, 0, 0, 0)'));
  const bootCover = bootVis && d.boot && d.boot.r && d.boot.r.w >= (d.viewport.w * 0.85) && d.boot.r.h >= (d.viewport.h * 0.85);
  const hksReady = !!d.hksClass;
  const cssReady = !!d.cssClass;
  const uiReady = !!st.uiReady;
  const exposed = !hksReady && (hudRaw || chipRaw || leaked.length > 0);
  const feedback = hksReady || bootVis || panelVis || hintVis;
  const blankNoFeedback = !feedback;
  return {
    t: d.t, hksReady, cssReady, uiReady, hksClass: d.htmlClass || '',
    hudRaw, chipRaw, leak: leaked.map((k) => '#' + k.id), exposed, blankNoFeedback,
    panelVis, panelTitle: d.panel && d.panel.tx ? d.panel.tx.slice(0, 90) : '', panelBtns: d.panel && d.panel.btns,
    hintVis, hintTx: d.hint && d.hint.tx, bootVis, bootStyled, bootCover,
    bootLogo: d.boot && d.boot.logo, bootBg: d.boot && d.boot.bg, bootBgi: d.boot && d.boot.bgi,
    covers: (d.covers || []).map((c) => c.id || c.cls || '?'),
    game: d.game, sheets: (d.links || []).filter((l) => l.sheet).length,
    bodyText: d.bodyText, errs: (d.errors || []).length,
    lightPct: img ? img.lightPct : null, top: img ? ((img.top || [])[0] || {}).c : null,
    vw: d.viewport && d.viewport.w, vh: d.viewport && d.viewport.h
  };
}

export function judgeRow(dom, img) { return gate(dom, img); }
