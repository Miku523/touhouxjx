#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * HKS 启动幕门禁 QA 套件
 *
 * 被测契约（改造后）：
 *   window.__hksBootGate = { art, kit, music, failed[], startedAt[, finishedAt, done] }
 *   揭幕（window.__boot.done === true / #boot.done）那一刻，art/kit/music 全 true，
 *   且 stage/bullets/story 与 honou_pre1/youma_stage1 的 responseEnd 早于揭幕；
 *   任一路失败只进 failed[] + console.warn，门禁照常放行（90s 硬超时兜底）。
 *
 * 场景：
 *   A 正常快网：门禁三路全绿、五件资源在揭幕前完成、进度单调、揭幕后标题可交互
 *   B 节流 700KB/s：揭幕被拉长但仍逐格推进、最终揭幕、pct=100
 *   C fail-server 404 src/game/stage.js：揭幕不被卡死、failed 含 'kit'、进关兜底不崩
 *   D fail-server 404 src/engine/songs/youma_stage1.js：failed 含 'music'、
 *     进关时 _ensureStageMusic 最多等 4s 不卡死
 *   E 进关冒烟（正常副本）：title→难度→选人→舞台已建、BGM=pre1、全程无 #kitLoad
 *   F ?bootgate=off 回归：只等标题图（kit/music 保持 false 但不进 failed），
 *     揭幕后仍会 _prefetchGameKit、无 JS 异常
 *
 * 用法：
 *   node tools/_boot_gate_qa.mjs --base http://127.0.0.1:8144 --scenario A,B,E,F
 *   node tools/_boot_gate_qa.mjs --base http://127.0.0.1:8145 --scenario all \
 *        --fail-base http://127.0.0.1:8143 --fail-root _gate/qa_after --label after
 *   node tools/_boot_gate_qa.mjs --scenario C --fail-base http://127.0.0.1:8143 \
 *        --fail-root _gate/qa_base --label base      # 外部不起服务时由本脚本拉起 fail-server
 *
 * 端口约定（team）：CDP 9424，fail-server 8143，qa_base 8144，qa_after 8145。
 * 只读 tools/_pt_core.mjs 与 tools/_gate_failserver.py，不改 src。
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './_pt_core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FAILSERVER = join(HERE, '_gate_failserver.py');
const SCENARIO_ORDER = ['A', 'B', 'E', 'F', 'C', 'D'];
const GATE_SCENARIOS = new Set(['A', 'B', 'C', 'D']);
const REQUIRED = [
  { needle: 'src/game/stage.js', short: 'stage' },
  { needle: 'src/game/bullets.js', short: 'bullets' },
  { needle: 'src/game/story.js', short: 'story' },
  { needle: 'src/engine/songs/honou_pre1.js', short: 'honou_pre1' },
  { needle: 'src/engine/songs/youma_stage1.js', short: 'youma_stage1' },
];
const FAIL_404 = {
  C: ['src/game/stage.js'],
  D: ['src/engine/songs/youma_stage1.js'],
};
const THROTTLE = {
  offline: false,
  latency: 220,
  downloadThroughput: 700 * 1024,
  uploadThroughput: 700 * 1024,
  connectionType: 'cellular3g',
};
const NO_THROTTLE = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
const E_PLAY_TIMEOUT_MS = 20000;

/* ------------------------------------------------------------------ */
/* 启动幕 trace：在页面脚本之前注入，精确记录「揭幕那一刻」的现场          */
/* ------------------------------------------------------------------ */

function gateTraceBootstrap() {
  if (window.__gateTrace) return;
  const tr = {
    installedAt: performance.now(),
    reveal: null,
    bootAtReveal: null,
    gateAtReveal: null,
    resourcesAtReveal: null,
    statusAtReveal: null,
    statusHistory: [],
    gateHistory: [],
    last: null,
  };
  window.__gateTrace = tr;
  // 资源条目可能超过默认 250，预热/进关后还要按 ResourceTiming 断言，先扩容
  try { if (performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(1200); } catch (e) { /* ignore */ }

  const cloneGate = (g) => {
    try {
      if (!g || typeof g !== 'object') return null;
      return {
        art: !!(g && g.art),
        kit: !!(g && g.kit),
        music: !!(g && g.music),
        failed: Array.isArray(g && g.failed) ? g.failed.slice(0, 12) : null,
        startedAt: g && typeof g.startedAt === 'number' ? g.startedAt : null,
        finishedAt: g && typeof g.finishedAt === 'number' ? g.finishedAt : null,
        done: !!(g && g.done),
      };
    } catch (e) {
      return { error: String(e) };
    }
  };
  const cloneBoot = (b) => {
    try {
      return {
        pct: b.pct,
        target: b.target,
        done: !!b.done,
        timeline: JSON.parse(JSON.stringify(b.timeline || [])),
      };
    } catch (e) {
      return null;
    }
  };
  const resourcesNow = () => {
    try {
      return performance.getEntriesByType('resource').map((r) => ({
        name: r.name,
        startTime: r.startTime,
        duration: r.duration,
        transferSize: r.transferSize,
        initiatorType: r.initiatorType,
      }));
    } catch (e) {
      return [];
    }
  };
  // 启动幕状态行（main.js _refreshBootStatus 动态插入的 .boot-status）
  const statusNow = () => {
    try {
      const bootEl = document.getElementById('boot');
      const el = bootEl ? bootEl.querySelector('.boot-status') : null;
      if (!el) return { exists: false };
      const rect = el.getBoundingClientRect();
      const sub = document.querySelector('#boot .boot-sub');
      const subRect = sub ? sub.getBoundingClientRect() : null;
      const cs = getComputedStyle(el);
      const prev = el.previousElementSibling;
      return {
        exists: true,
        text: String(el.textContent || '').trim(),
        on: el.classList.contains('on'),
        rect: { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
        subRect: subRect ? { top: Math.round(subRect.top), bottom: Math.round(subRect.bottom), width: Math.round(subRect.width), height: Math.round(subRect.height) } : null,
        domAfterSub: !!(prev && prev.classList && prev.classList.contains('boot-sub')),
        prevClass: prev ? String(prev.className || '') : null,
        style: { display: cs.display, visibility: cs.visibility, opacity: Number(cs.opacity) },
      };
    } catch (e) { return { error: String(e) }; }
  };
  const capture = (how) => {
    if (tr.reveal) return;
    const now = performance.now();
    tr.reveal = { t: now, at: Date.now(), how };
    tr.bootAtReveal = cloneBoot(window.__boot);
    tr.gateAtReveal = cloneGate(window.__hksBootGate);
    tr.resourcesAtReveal = resourcesNow();
    tr.statusAtReveal = statusNow();
    tr.gateHistory.push({ t: Math.round(now), gate: tr.gateAtReveal });
  };

  // ① 精确捕捉 __boot.done：bootScreen 构造时 window.__boot = {...}，
  //    hide() 里写 this._qa.done = true —— 那一刻就是「揭幕」。
  let bootStore;
  try {
    Object.defineProperty(window, '__boot', {
      configurable: true,
      enumerable: true,
      get() { return bootStore; },
      set(v) {
        bootStore = v;
        try {
          Object.defineProperty(v, 'done', {
            configurable: true,
            enumerable: true,
            get() { return !!v.__gateDone; },
            set(x) {
              v.__gateDone = !!x;
              if (x) { try { capture('__boot.done'); } catch (e) { /* ignore */ } }
            },
          });
        } catch (e) { /* ignore */ }
      },
    });
  } catch (e) { tr.bootHookError = String(e); }

  // ①.5 rAF 帧计数：进关对白靠主循环推进，帧停走时用它能直接看出来
  try {
    const frameTick = () => {
      tr.frames = (tr.frames || 0) + 1;
      requestAnimationFrame(frameTick);
    };
    requestAnimationFrame(frameTick);
  } catch (e) { tr.frameHookError = String(e); }

  // ①.6 长任务采样：E 进关卡顿时用来判断是不是主线程被一次性任务压住
  try {
    tr.longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (tr.longTasks.length < 80) tr.longTasks.push({ s: Math.round(e.startTime), d: Math.round(e.duration) });
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) { tr.longTaskHookError = String(e); }

  // ② #boot 加 .done class 的兜底（hide() 里与 __boot.done 同一帧，顺序略有差异）
  const watchBoot = () => {
    const el = document.getElementById('boot');
    if (!el) { setTimeout(watchBoot, 4); return; }
    tr.bootElFoundAt = performance.now();
    try {
      if (el.classList.contains('done')) capture('.done-initial');
      const mo = new MutationObserver(() => {
        if (el.classList.contains('done')) capture('.done-class');
      });
      mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { tr.classWatchError = String(e); }
  };
  watchBoot();

  // ③ 100ms 轮询兜底 + 最近现场（注入时机异常时也能拿到揭幕）
  try {
    setInterval(() => {
      const b = window.__boot;
      if (!b) return;
      tr.last = { t: Math.round(performance.now()), boot: { pct: b.pct, target: b.target, done: !!b.done }, gate: cloneGate(window.__hksBootGate) };
      if (b.done) capture('poll');
    }, 100);
  } catch (e) { tr.pollError = String(e); }

  // ④ 门禁字段变化历史（证据用）
  try {
    let prev = '';
    setInterval(() => {
      const g = window.__hksBootGate;
      if (!g) return;
      const snap = cloneGate(g);
      const key = JSON.stringify(snap);
      if (key !== prev) {
        prev = key;
        tr.gateHistory.push({ t: Math.round(performance.now()), gate: snap });
        if (tr.gateHistory.length > 120) tr.gateHistory.shift();
      }
    }, 150);
  } catch (e) { /* ignore */ }

  // ⑤ 状态行文案变化历史（证据用；?bootgate=off 下应始终为空）
  try {
    let prevStatus = '';
    setInterval(() => {
      try {
        const st = statusNow();
        if (!st || !st.exists) return;
        const key = st.text + '|' + st.on;
        if (key === prevStatus) return;
        prevStatus = key;
        tr.statusHistory.push({ t: Math.round(performance.now()), text: st.text, on: !!st.on });
        if (tr.statusHistory.length > 60) tr.statusHistory.shift();
      } catch (e) { /* ignore */ }
    }, 150);
  } catch (e) { /* ignore */ }
}

const TRACE_SOURCE = '(' + gateTraceBootstrap.toString() + ')();';

/* ------------------------------------------------------------------ */
/* 小工具                                                             */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const val = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`参数 ${a} 缺少值`);
      i += 1;
      return v;
    };
    if (a === '--base') out.base = val();
    else if (a === '--fail-base') out.failBase = val();
    else if (a === '--fail-root') out.failRoot = val();
    else if (a === '--scenario' || a === '--scenarios') out.scenarioArg = val();
    else if (a === '--label') out.label = val();
    else if (a === '--out') out.out = val();
    else if (a === '--cdp-port') out.cdpPort = Number(val());
    else if (a === '--md') out.md = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`未知参数: ${a}`);
  }
  return out;
}

function resolveConfig(argv) {
  const args = parseArgs(argv);
  const base = (args.base || process.env.GATE_BASE || 'http://127.0.0.1:8144').replace(/\/+$/, '');
  const failBase = (args.failBase || process.env.GATE_FAIL_BASE || 'http://127.0.0.1:8143').replace(/\/+$/, '');
  const label = args.label || process.env.GATE_LABEL || 'run';
  const out = args.out || process.env.GATE_OUT || '_gate/report';
  const cdpPort = args.cdpPort || Number(process.env.GATE_CDP_PORT || 9424);
  const raw = args.scenarioArg || process.env.GATE_SCENARIO || 'all';
  const scenarios = String(raw).toUpperCase() === 'ALL'
    ? SCENARIO_ORDER.slice()
    : String(raw).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const failRoot = args.failRoot || process.env.GATE_FAIL_ROOT || '';
  if (args.help) {
    console.log('用法: node tools/_boot_gate_qa.mjs [--base URL] [--fail-base URL] [--fail-root DIR] '
      + '[--scenario A|B|C|D|E|F|all] [--label NAME] [--out DIR] [--cdp-port N] [--md]');
    process.exit(0);
  }
  for (const s of scenarios) {
    if (!SCENARIO_ORDER.includes(s)) throw new Error(`未知场景: ${s}（可选 ${SCENARIO_ORDER.join('/')}/all）`);
  }
  return { base, failBase, failRoot, label, out, cdpPort, scenarios, order: scenarios.slice(), md: !!args.md };
}

function pad2(n) { return String(n).padStart(2, '0'); }
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} `
    + `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function shorten(s, n = 380) {
  const str = String(s == null ? '' : s);
  return str.length > n ? `${str.slice(0, n)}…` : str;
}
function addCheck(list, id, ok, detail) {
  const item = { id, ok: !!ok, detail: shorten(detail, 600) };
  list.push(item);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? `  ${shorten(detail, 300)}` : ''}`);
  return item;
}
function downsample(rows, max = 240) {
  if (!Array.isArray(rows) || rows.length <= max) return rows;
  const step = rows.length / max;
  const out = [];
  for (let i = 0; i < max; i += 1) out.push(rows[Math.floor(i * step)]);
  out.push(rows[rows.length - 1]);
  return out;
}
function scenarioUrl(cfg, scenario) {
  const isFail = scenario === 'C' || scenario === 'D';
  const base = isFail ? cfg.failBase : cfg.base;
  const q = new URLSearchParams({ qa: scenario, t: String(Date.now()) });
  if (scenario === 'F') q.set('bootgate', 'off');
  // 诊断用：GATE_E_QUERY 可给 E 场景追加 query（例如 bootgate=off），默认不生效
  if (scenario === 'E' && process.env.GATE_E_QUERY) {
    for (const [k, v] of new URLSearchParams(process.env.GATE_E_QUERY)) q.set(k, v);
  }
  return `${base}/index.html?${q.toString()}`;
}

/* ------------------------------------------------------------------ */
/* CDP / 页面读取                                                      */
/* ------------------------------------------------------------------ */

async function installTrace(T) {
  const res = await T.send('Page.addScriptToEvaluateOnNewDocument', { source: TRACE_SOURCE });
  return res && res.identifier ? res.identifier : null;
}

async function coldStart(T, url, { throttle = null } = {}) {
  const origin = new URL(url).origin;
  const step = async (name, fn) => {
    const s = Date.now();
    try { await fn(); } catch (e) { /* 清理类步骤失败不算产品问题 */ }
    const d = Date.now() - s;
    if (d > 400) console.log(`   [cold] ${name} ${d}ms`);
  };
  await T.clearCollection();
  // 先把上一页卸载到 about:blank，再做站点数据清理：
  // 旧实现在「还跑着游戏」的页面上 unregister SW / 清 cache，偶发 Runtime.evaluate
  // 要等 20s CDP 超时才回来，直接污染 revealWallMs。卸载后再清又快又稳。
  await step('about:blank', () => T.nav('about:blank'));
  await step('clearDataForOrigin', () => T.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }));
  await step('network-enable', () => T.send('Network.enable'));
  await step('cache-disabled', () => T.send('Network.setCacheDisabled', { cacheDisabled: true }));
  await step('throttle', () => T.send('Network.emulateNetworkConditions', throttle || NO_THROTTLE));
  await step('nav', () => T.nav(url));
  // headless 下连续 about:blank ↔ 目标页之后，偶发文档被判定为后台/冻结（rAF 停走）：
  // 菜单靠 keydown 还能动，但进关对白由主循环 update() 推进，会像「按 Enter 没反应」。
  // 显式把页签拉到前台并声明 active 生命周期，消除这个环境坑（不影响产品行为）。
  await step('front', () => T.send('Page.bringToFront'));
  await step('lifecycle', () => T.send('Page.setWebLifecycleState', { state: 'active' }));
}

async function waitReveal(T, maxMs) {
  const t0 = Date.now();
  const samples = [];
  let lastErr = null;
  let revealed = false;
  let traceT = 0;
  let how = null;
  const probe = `(() => {
    const b = window.__boot;
    const tr = window.__gateTrace;
    return {
      t: tr && tr.reveal ? tr.reveal.t : 0,
      how: tr && tr.reveal ? tr.reveal.how : null,
      pct: b ? b.pct : null,
      target: b ? b.target : null,
      done: !!(b && b.done),
      state: window.__game ? window.__game.state : null,
      page: window.__game ? window.__game._page : null,
    };
  })()`;
  while (Date.now() - t0 < maxMs) {
    let snap = null;
    try {
      snap = await T.eval(probe);
    } catch (e) {
      lastErr = String((e && e.message) || e).slice(0, 200);
      if (Date.now() - t0 > 2000 && !revealed) console.log(`   [probe] eval 失败（累计 ${Date.now() - t0}ms）：${shorten(lastErr, 160)}`);
      await sleep(120);
      continue;
    }
    if (snap) {
      samples.push([Date.now() - t0, snap.pct, snap.target]);
      if (snap.t || snap.done) {
        revealed = true;
        traceT = snap.t;
        how = snap.how;
        break;
      }
    }
    await sleep(80);
  }
  return { revealed, waitedMs: Date.now() - t0, samples, lastErr, traceT, how };
}

async function readTrace(T) {
  try {
    return await T.eval(`(() => {
      const t = window.__gateTrace;
      if (!t) return null;
      return {
        installedAt: t.installedAt,
        reveal: t.reveal,
        bootAtReveal: t.bootAtReveal,
        gateAtReveal: t.gateAtReveal,
        resourcesAtReveal: t.resourcesAtReveal,
        statusAtReveal: t.statusAtReveal || null,
        statusHistory: (t.statusHistory || []).slice(-40),
        gateHistory: (t.gateHistory || []).slice(-80),
        hooks: {
          bootHookError: t.bootHookError || null,
          classWatchError: t.classWatchError || null,
          pollError: t.pollError || null,
        },
        last: t.last,
      };
    })()`);
  } catch (e) {
    return null;
  }
}

async function readSnapshot(T) {
  try {
    return await T.eval(`(() => {
      const b = window.__boot;
      const g = window.__hksBootGate;
      const el = document.getElementById('boot');
      const cs = el ? getComputedStyle(el) : null;
      const kl = document.getElementById('kitLoad');
      const kcs = kl ? getComputedStyle(kl) : null;
      const ga = window.__game;
      return {
        boot: b ? { pct: b.pct, target: b.target, done: !!b.done, timeline: JSON.parse(JSON.stringify(b.timeline || [])) } : null,
        gate: g ? {
          art: !!g.art, kit: !!g.kit, music: !!g.music,
          failed: Array.isArray(g.failed) ? g.failed.slice(0, 12) : null,
          startedAt: typeof g.startedAt === 'number' ? g.startedAt : null,
          finishedAt: typeof g.finishedAt === 'number' ? g.finishedAt : null,
          done: !!g.done,
        } : null,
        bootEl: el ? {
          present: true, display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
          classes: String(el.className || ''), ariaHidden: el.getAttribute('aria-hidden'),
        } : { present: false },
        kitLoad: kl ? {
          present: true, display: kcs.display, visibility: kcs.visibility,
          text: String(kl.textContent || '').slice(0, 80),
          visible: !(kcs.display === 'none' || kcs.visibility === 'hidden' || Number(kcs.opacity) < 0.02),
        } : { present: false, visible: false },
        game: ga ? {
          state: ga.state, page: ga._page, char: ga.char, levelIndex: ga.levelIndex,
          stageBuilt: !!ga.stage,
          soundingSong: ga.audio ? (ga.audio.soundingSong || null) : null,
        } : null,
      };
    })()`);
  } catch (e) {
    return null;
  }
}

async function readGameState(T) {
  try {
    return await T.eval(`(() => {
      const ga = window.__game;
      const dlg = (ga && ga.dialogue) || null;
      const kl = document.getElementById('kitLoad');
      const kcs = kl ? getComputedStyle(kl) : null;
      return {
        state: ga ? ga.state : null,
        page: ga ? ga._page : null,
        stageBuilt: !!(ga && ga.stage),
        dlgActive: !!(dlg && dlg.active),
        dlgIndex: dlg && Number.isFinite(dlg.index) ? dlg.index : null,
        dlgLen: dlg && Array.isArray(dlg.script) ? dlg.script.length : null,
        dlgTyping: !!(dlg && dlg.isTyping),
        soundingSong: ga && ga.audio ? (ga.audio.soundingSong || null) : null,
        vis: document.visibilityState,
        frames: (window.__gateTrace && window.__gateTrace.frames) || 0,
        loopRunning: ga && ga.loop ? !!ga.loop.running : null,
        longTasks: (window.__gateTrace && Array.isArray(window.__gateTrace.longTasks)
          ? window.__gateTrace.longTasks.slice(-6) : null),
        kitLoadVisible: !!kl && !(kcs.display === 'none' || kcs.visibility === 'hidden'),
        kitLoadText: kl ? String(kl.textContent || '').slice(0, 60) : null,
      };
    })()`);
  } catch (e) {
    return null;
  }
}

async function readReport(T) {
  try {
    const r = await T.report();
    return {
      errors: (r.errors || []).slice(0, 60),
      warns: (r.warns || []).slice(0, 60),
      httpBad: (r.httpBad || []).slice(0, 60),
      netFails: (r.netFails || []).slice(0, 30),
      resources: (r.resources || []).slice(0, 180),
    };
  } catch (e) {
    return { errors: [], warns: [], httpBad: [], netFails: [], resources: [], error: shorten(String((e && e.message) || e), 160) };
  }
}

async function pressUntil(T, expr, { maxMs = 6000, retryMs = 700 } = {}) {
  const t0 = Date.now();
  let presses = 0;
  let last = -1e9;
  while (Date.now() - t0 < maxMs) {
    let ok = false;
    try { ok = await T.eval(expr); } catch (e) { /* ignore */ }
    if (ok) return { ok: true, ms: Date.now() - t0, presses };
    if (Date.now() - last >= retryMs) {
      await T.key('Enter');
      presses += 1;
      last = Date.now();
    }
    await sleep(90);
  }
  return { ok: false, ms: Date.now() - t0, presses };
}

/** 一路按 Enter 穿过开场对白，直到 stage 已建（用于 D/E） */
async function skipToStage(T, { maxMs = 24000 } = {}) {
  const t0 = Date.now();
  const out = { ok: false, presses: 0, dialogueAt: null, stageAt: null, kitLoadSeen: 0, last: null };
  let last = -1e9;
  let lastFrames = null;
  let frozen = 0;
  let recoveredAt = 0;
  let clicks = 0;
  while (Date.now() - t0 < maxMs) {
    const st = await readGameState(T);
    if (st) {
      out.last = st;
      if (st.kitLoadVisible) out.kitLoadSeen += 1;
      if (st.state === 'dialogue' && out.dialogueAt === null) out.dialogueAt = Date.now() - t0;
      if (st.stageBuilt) {
        out.stageAt = Date.now() - t0;
        out.ok = true;
        return out;
      }
      // headless 偶发把文档判成 hidden，rAF 被降频甚至停走；对白推进又依赖主循环
      // update()，于是表现为「Enter 完全没反应」。检测帧数停滞时用 CDP 强制前台/
      // active 生命周期捞一次，并用鼠标点击（dialogue 的 click 走同步 advance，不依赖 rAF）
      // 作为兜底输入——两条都只是驱动游戏自身逻辑，不改变产品行为。
      if (st.state === 'dialogue') {
        if (lastFrames !== null && st.frames === lastFrames) frozen += 1;
        else frozen = 0;
        lastFrames = st.frames;
        if (frozen >= 6 && Date.now() - recoveredAt > 2000) {
          recoveredAt = Date.now();
          try { await T.send('Page.bringToFront'); } catch (e) {}
          try { await T.send('Page.setWebLifecycleState', { state: 'active' }); } catch (e) {}
          try { await T.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) {}
          if (process.env.GATE_DEBUG_ENTRY) console.log(`   [entry] rAF 停滞 ${frozen} 次，尝试恢复（vis=${st.vis} frames=${st.frames}）`);
        }
      }
      // 只在真正进入对白后才推进：startGame 等立绘 / ensureGameKit 期间 state
      // 还是 'menu'，此时按 Enter 会把难度页重新点开，污染冒烟结果。
      if (st.state === 'dialogue' && Date.now() - last >= 150) {
        await T.key('Enter');
        out.presses += 1;
        if (frozen >= 3) { // 帧停走时补一次点击：click → dialogue._onClick 不经过主循环
          try { await T.mouse(640, 360); clicks += 1; } catch (e) {}
        }
        last = Date.now();
        if (process.env.GATE_DEBUG_ENTRY && out.presses % 5 === 0) {
          console.log(`   [entry] press=${out.presses} ${JSON.stringify(st)}`);
        }
      }
    }
    await sleep(70);
  }
  out.clicks = clicks;
  return out;
}

/* ------------------------------------------------------------------ */
/* 断言辅助                                                            */
/* ------------------------------------------------------------------ */

function resourceEnd(r) {
  if (!r) return null;
  return (Number(r.startTime) || 0) + (Number(r.duration) || 0);
}
function gateFailed(gate) {
  return Array.isArray(gate && gate.failed) ? gate.failed : [];
}
function findResource(list, needle) {
  return (list || []).find((r) => String((r && r.name) || '').includes(needle)) || null;
}
function checkResource(results, resourcesAtReveal, report, revealT, item, label) {
  const r = findResource(resourcesAtReveal, item.needle);
  const bad = ((report && report.httpBad) || []).find((h) => String((h && h.url) || '').includes(item.needle));
  const fail = ((report && report.netFails) || []).find((f) => String((f && f.url) || '').includes(item.needle));
  const end = resourceEnd(r);
  const hasBytes = !!r && ((Number(r.transferSize) || 0) > 0 || (Number(r.duration) || 0) > 0);
  const beforeReveal = end !== null && revealT !== null && end <= revealT + 80;
  const ok = !!r && !bad && !fail && hasBytes && beforeReveal;
  const parts = [];
  if (r) parts.push(`transferSize=${r.transferSize} duration=${Number(r.duration || 0).toFixed(1)} start=${Number(r.startTime || 0).toFixed(1)} end=${Number(end || 0).toFixed(1)}`);
  else parts.push('无 resource entry');
  parts.push(`revealT=${Number(revealT || 0).toFixed(1)}`);
  if (!beforeReveal && r) parts.push('响应晚于揭幕');
  if (bad) parts.push(`httpBad=${bad.status}`);
  if (fail) parts.push(`netFail=${fail.err}`);
  addCheck(results, label, ok, parts.join(' '));
  return ok;
}

function checkGateShape(list, scenario, gate) {
  const ok = !!gate
    && typeof gate.art === 'boolean'
    && typeof gate.kit === 'boolean'
    && typeof gate.music === 'boolean'
    && Array.isArray(gate.failed)
    && typeof gate.startedAt === 'number'
    && gate.startedAt > 0;
  return addCheck(list, `${scenario}-gate-probe`, ok, gate ? JSON.stringify(gate) : 'window.__hksBootGate 缺失（旧版本 / 注入失败）');
}

function progressChecks(list, scenario, revealWait, revealSnap) {
  const pcts = (revealWait.samples || [])
    .map((s) => s[1])
    .filter((v) => typeof v === 'number');
  let drops = 0;
  for (let i = 1; i < pcts.length; i += 1) if (pcts[i] < pcts[i - 1] - 1e-6) drops += 1;
  addCheck(list, `${scenario}-pct-monotonic`, pcts.length >= 2 && drops === 0, `样本=${pcts.length} 回退次数=${drops} 首=${pcts[0]} 末=${pcts[pcts.length - 1]}`);

  const bootAtReveal = revealSnap && revealSnap.bootAtReveal;
  const pctAtReveal = bootAtReveal ? bootAtReveal.pct : null;
  addCheck(list, `${scenario}-pct-100-at-reveal`, pctAtReveal === 100, `__boot.pct@reveal=${pctAtReveal}（期望 100）`);

  const targets = (revealWait.samples || []).map((s) => s[2]).filter((v) => typeof v === 'number');
  const distinctTargets = Array.from(new Set(targets.map((v) => Math.round(v * 100)))).length;
  return { pcts, targets, distinctTargets };
}

function errorChecks(list, scenario, report, { allowResourceErrors = false } = {}) {
  const errs = (report && report.errors) || [];
  const exceptions = errs.filter((e) => /EXCEPTION|Uncaught/i.test(String(e)));
  const consoleErrors = errs.filter((e) => /^CONSOLE:/.test(String(e)));
  const resourceErrors = errs.filter((e) => /Failed to load resource|net::ERR_|404/i.test(String(e)));
  addCheck(list, `${scenario}-no-exception`, exceptions.length === 0, exceptions.length ? exceptions.slice(0, 3).join(' | ') : '无未捕获异常');
  if (allowResourceErrors) {
    const other = consoleErrors.filter((e) => !/gamekit|Failed to load resource/.test(String(e)));
    addCheck(list, `${scenario}-no-unexpected-console-error`, other.length === 0, other.length ? other.slice(0, 3).join(' | ') : `console.error 仅来自失败路径（${consoleErrors.length} 条，已容忍）`);
  } else {
    addCheck(list, `${scenario}-no-console-error`, consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : '无 console.error');
  }
}

/* ------------------------------------------------------------------ */
/* v2：状态行 + 揭幕后曲库预热断言                                      */
/* ------------------------------------------------------------------ */

// 复刻 lazy_preload.linkTier() 的「标题素材实测吞吐」判定，用于判断预热是否按实现跳过。
function measuredTier(resources, cutoffMs) {
  try {
    const re = /(?:title_bg|_title)\.[a-z0-9]+(?:\?|$)/i;
    let bytes = 0, t0 = Infinity, t1 = -Infinity;
    for (const e of resources || []) {
      if (!e || !re.test(String(e.name || ''))) continue;
      // 复刻 linkTier() 在「门禁结束那一刻」看到的窗口：之后才完成的标题图（如延迟加载的
      // sakuya_title，transferSize=0）不能算进来，否则会把已缓存的 tier 误判成 constrained。
      const end = e.startTime + Number(e.duration || 0);
      if (Number.isFinite(cutoffMs) && end > cutoffMs + 10) continue;
      const b = Number(e.transferSize || 0);
      if (b > 0) bytes += b;
      if (e.startTime < t0) t0 = e.startTime;
      if (end > t1) t1 = end;
    }
    const wall = (t1 - t0) / 1000;
    if (bytes > 0 && wall > 0.25) {
      return { tier: (bytes / wall) < 350 * 1024 ? 'constrained' : 'fast', bytes, wall };
    }
  } catch (e) { /* ignore */ }
  return { tier: 'unknown', bytes: 0, wall: 0 };
}

async function readSongTiming(T) {
  try {
    return await T.eval(`(() => {
      const list = performance.getEntriesByType('resource') || [];
      const names = [];
      const seen = new Set();
      for (const e of list) {
        const n = String(e.name || '');
        const base = n.split('?')[0];
        if (base.indexOf('/engine/songs/') < 0 || !base.endsWith('.js')) continue;
        if (seen.has(base)) continue;
        seen.add(base);
        names.push({
          n: base.split('/').slice(-1)[0],
          startTime: Math.round(e.startTime),
          transferSize: e.transferSize,
          duration: Math.round(e.duration),
        });
      }
      const conn = (typeof navigator !== 'undefined' && navigator.connection) || null;
      return {
        count: names.length,
        names: names.slice(0, 24),
        totalResources: list.length,
        connection: conn ? { effectiveType: conn.effectiveType || null, saveData: !!conn.saveData } : null,
      };
    })()`);
  } catch (e) {
    return null;
  }
}

function checkBootStatus(results, scenario, trace) {
  const st = trace && trace.statusAtReveal;
  const exists = !!(st && st.exists);
  const text = exists ? String(st.text || '') : '';
  const rect = exists ? st.rect : null;
  const sub = exists ? st.subRect : null;
  const rectOk = !!(rect && rect.width > 0 && rect.height > 0);
  addCheck(results, `${scenario}-status-exists`, exists,
    exists ? `text=${JSON.stringify(text)} rect=${rect.width}x${rect.height}@top${rect.top}` : '揭幕时 .boot-status 不存在');
  addCheck(results, `${scenario}-status-text`, text.length > 0, `text=${JSON.stringify(text)}`);
  const below = !!(rectOk && sub && rect.top >= sub.bottom - 2 && rect.top > sub.top);
  addCheck(results, `${scenario}-status-below-sub`, below,
    rectOk && sub ? `status.top=${rect.top} status.bottom=${rect.bottom} sub.top=${sub.top} sub.bottom=${sub.bottom}` : '.boot-status 无尺寸或 .boot-sub 缺失');
  const domAfter = !!(exists && st.domAfterSub);
  addCheck(results, `${scenario}-status-dom-after-sub`, domAfter,
    exists ? `previousElementSibling=${JSON.stringify(st.prevClass)}` : '.boot-status 不存在');
}

function checkStatusHiddenF(results, trace) {
  const st = trace && trace.statusAtReveal;
  if (!st || !st.exists) {
    addCheck(results, 'F-status-hidden', true, '?bootgate=off 下 .boot-status 不存在（等价不可见）');
    return;
  }
  const text = String(st.text || '');
  const style = st.style || {};
  const invisible = !st.on || Number(style.opacity) < 0.02 || style.display === 'none' || style.visibility === 'hidden';
  addCheck(results, 'F-status-hidden', text === '' && invisible,
    `text=${JSON.stringify(text)} on=${st.on} opacity=${style.opacity} display=${style.display} visibility=${style.visibility}`);
}

function checkWarmup(results, scenario, warm, tierInfo) {
  const count = warm ? warm.count : 0;
  const eff = warm && warm.connection ? warm.connection : null;
  const constrainedByEff = !!(eff && (eff.saveData || ['slow-2g', '2g', '3g'].includes(String(eff.effectiveType || ''))));
  const constrained = tierInfo.tier === 'constrained' || constrainedByEff;
  const sample = warm && Array.isArray(warm.names) ? warm.names.slice(0, 8).map((x) => x.n).join(',') : '';
  const basis = '档位=' + tierInfo.tier + '（' + Math.round(tierInfo.bytes / 1024) + 'KB/'
    + tierInfo.wall.toFixed(2) + 's） connection=' + JSON.stringify(eff);
  if (constrained) {
    addCheck(results, `${scenario}-song-warmup-10s`, count < 10,
      '受限链路按实现跳过全曲库预热：揭幕 10s 后 song 模块去重 ' + count + ' 条（期望 <10）；'
      + basis + ' 样本=' + sample);
  } else {
    addCheck(results, `${scenario}-song-warmup-10s`, count >= 10,
      '揭幕 10s 后 /engine/songs/*.js 去重 ' + count + ' 条（期望 ≥10）；' + basis + ' 样本=' + sample);
  }
}

/* ------------------------------------------------------------------ */
/* 场景执行                                                            */
/* ------------------------------------------------------------------ */

async function runGateScenario(T, cfg, scenario) {
  const results = [];
  const isFailScenario = scenario === 'C' || scenario === 'D';
  const url = scenarioUrl(cfg, scenario);
  const throttle = scenario === 'B' ? THROTTLE : null;
  const pollMax = scenario === 'B' ? 95000 : isFailScenario ? 95000 : 20000;
  const t0 = Date.now();

  await coldStart(T, url, { throttle });
  const revealWait = await waitReveal(T, pollMax);
  const revealWallMs = Date.now() - t0;
  const trace = await readTrace(T);
  const reportReveal = await readReport(T);
  const gate = trace && trace.gateAtReveal ? trace.gateAtReveal : null;
  const revealT = trace && trace.reveal ? trace.reveal.t : null;

  addCheck(results, `${scenario}-reveal`, !!revealWait.revealed,
    `揭幕用时 ${revealWallMs}ms（预算 ${pollMax}ms）`
    + (trace && trace.reveal ? ` trace.t=${Math.round(revealT)}ms how=${trace.reveal.how}` : ' trace 无 reveal')
    + (revealWait.lastErr ? ` evalErr=${revealWait.lastErr}` : ''));

  checkGateShape(results, scenario, gate);
  if (gate) {
    if (scenario === 'A' || scenario === 'B') {
      addCheck(results, `${scenario}-gate-art`, gate.art === true, `art=${gate.art}`);
      addCheck(results, `${scenario}-gate-kit`, gate.kit === true, `kit=${gate.kit}`);
      addCheck(results, `${scenario}-gate-music`, gate.music === true, `music=${gate.music}`);
      addCheck(results, `${scenario}-gate-failed-empty`, gateFailed(gate).length === 0, `failed=${JSON.stringify(gate.failed)}`);
      addCheck(results, `${scenario}-gate-done`, gate.done === true, `done=${gate.done}`);
      const finishedOk = typeof gate.finishedAt === 'number' && gate.finishedAt > 0
        && gate.finishedAt >= gate.startedAt && revealT !== null && gate.finishedAt <= revealT + 80;
      addCheck(results, `${scenario}-gate-finished-before-reveal`, finishedOk,
        `startedAt=${gate.startedAt == null ? null : Math.round(gate.startedAt)} finishedAt=${gate.finishedAt == null ? null : Math.round(gate.finishedAt)} revealT=${revealT == null ? null : Math.round(revealT)}`);
    } else if (scenario === 'C') {
      addCheck(results, `${scenario}-gate-art`, gate.art === true, `art=${gate.art}`);
      addCheck(results, `${scenario}-gate-kit-false`, gate.kit === false, `kit=${gate.kit}（期望 false）`);
      addCheck(results, `${scenario}-gate-music-true`, gate.music === true, `music=${gate.music}（kit 失败不应拖累 music）`);
      addCheck(results, `${scenario}-gate-failed-kit`, gateFailed(gate).includes('kit'), `failed=${JSON.stringify(gate.failed)}`);
      addCheck(results, `${scenario}-gate-no-timeout`, !gateFailed(gate).includes('timeout'), `failed=${JSON.stringify(gate.failed)}`);
      addCheck(results, `${scenario}-gate-done`, gate.done === true, `done=${gate.done}`);
      const bad404 = (reportReveal.httpBad || []).some((h) => String(h.url || '').includes('src/game/stage.js') && Number(h.status) === 404);
      addCheck(results, `${scenario}-failserver-404-stage`, bad404, bad404 ? '已观测到 stage.js 404' : '未观测到 stage.js 404（fail-server 未注入？）');
      const warn = (reportReveal.warns || []).filter((w) => /boot|kit/i.test(String(w)));
      addCheck(results, `${scenario}-console-warn`, warn.length > 0, warn.length ? warn.slice(0, 2).join(' | ') : `warns=${JSON.stringify((reportReveal.warns || []).slice(0, 3))}`);
    } else if (scenario === 'D') {
      addCheck(results, `${scenario}-gate-art`, gate.art === true, `art=${gate.art}`);
      addCheck(results, `${scenario}-gate-kit-true`, gate.kit === true, `kit=${gate.kit}`);
      addCheck(results, `${scenario}-gate-music-false`, gate.music === false, `music=${gate.music}（期望 false）`);
      addCheck(results, `${scenario}-gate-failed-music`, gateFailed(gate).includes('music'), `failed=${JSON.stringify(gate.failed)}`);
      addCheck(results, `${scenario}-gate-no-timeout`, !gateFailed(gate).includes('timeout'), `failed=${JSON.stringify(gate.failed)}`);
      addCheck(results, `${scenario}-gate-done`, gate.done === true, `done=${gate.done}`);
      const bad404 = (reportReveal.httpBad || []).some((h) => String(h.url || '').includes('src/engine/songs/youma_stage1.js') && Number(h.status) === 404);
      addCheck(results, `${scenario}-failserver-404-youma`, bad404, bad404 ? '已观测到 youma_stage1.js 404' : '未观测到 youma_stage1.js 404（fail-server 未注入？）');
      const warn = (reportReveal.warns || []).filter((w) => /music|boot/i.test(String(w)));
      addCheck(results, `${scenario}-console-warn`, warn.length > 0, warn.length ? warn.slice(0, 2).join(' | ') : `warns=${JSON.stringify((reportReveal.warns || []).slice(0, 3))}`);
    }
  }

  // 资源时序：五件套
  if (scenario === 'A' || scenario === 'B') {
    for (const item of REQUIRED) checkResource(results, trace && trace.resourcesAtReveal, reportReveal, revealT, item, `${scenario}-res-${item.short}`);
  } else if (scenario === 'C') {
    for (const item of REQUIRED.filter((x) => x.short !== 'stage')) checkResource(results, trace && trace.resourcesAtReveal, reportReveal, revealT, item, `${scenario}-res-${item.short}`);
  } else if (scenario === 'D') {
    for (const item of REQUIRED.filter((x) => x.short !== 'youma_stage1')) checkResource(results, trace && trace.resourcesAtReveal, reportReveal, revealT, item, `${scenario}-res-${item.short}`);
  }

  // 进度模型
  const progress = progressChecks(results, scenario, revealWait, trace);

  // v2：启动幕状态行（门禁开启的场景）
  if (scenario === 'A' || scenario === 'B' || scenario === 'E') checkBootStatus(results, scenario, trace);

  // 揭幕后现场（等淡出）
  await sleep(1500);
  const after = await readSnapshot(T);
  const bootEl = after && after.bootEl;
  const bootHidden = !!bootEl && bootEl.present
    && (bootEl.display === 'none' || bootEl.visibility === 'hidden' || Number(bootEl.opacity) < 0.02);
  addCheck(results, `${scenario}-boot-hidden`, bootHidden,
    bootEl ? `display=${bootEl.display} visibility=${bootEl.visibility} opacity=${bootEl.opacity} classes=${bootEl.classes}` : '#boot 不存在');
  addCheck(results, `${scenario}-state-menu`, !!(after && after.game && after.game.state === 'menu'),
    after && after.game ? `state=${after.game.state} page=${after.game.page}` : 'window.__game 缺失');

  if (scenario === 'B') {
    const distinctPct = Array.from(new Set(progress.pcts.map((v) => Math.round(v)))).length;
    // __boot.target 在 BootScreen 里初始化成 8 后不再同步（只同步 pct），
    // 门禁每档 setTarget 会记进 timeline（t10/t42/...），所以「逐格推进」用 pct + timeline 目标档判定。
    const milestones = Array.from(new Set(
      ((trace && trace.bootAtReveal && trace.bootAtReveal.timeline) || [])
        .map((it) => (it && typeof it === 'object' ? it.n : it))
        .filter((n) => /^t\d+$/.test(String(n))),
    )).length;
    addCheck(results, `${scenario}-stepwise`, distinctPct >= 5 && milestones >= 3,
      `distinct pct=${distinctPct} timeline 目标档=${milestones}（期望 >=5 / >=3；__boot.target 实现上恒为 8，不参与判定）`);
    addCheck(results, `${scenario}-reveal-slower`, revealWallMs >= 1000,
      `节流下揭幕 ${revealWallMs}ms（期望 >1000ms，门禁确实占满加载时间）`);
  }

  // 标题可交互：Enter → 难度页
  const interactive = await pressUntil(T, `(() => !!(window.__game && window.__game._page === 'difficulty'))()`, { maxMs: 6000 });
  addCheck(results, `${scenario}-title-interactive`, interactive.ok,
    `Enter→难度页 ${interactive.ok ? '成功' : '失败'}（${interactive.ms}ms, ${interactive.presses} 次 Enter）`);

  let entry = null;
  if (scenario === 'C') {
    entry = await runEntryGuardC(T, results);
  } else if (scenario === 'D') {
    entry = await runEntryMusicD(T, results);
  } else if (scenario === 'E') {
    entry = await runEntrySmokeE(T, results);
  }

  // v2：揭幕后空闲预热全曲库 —— 等到揭幕满 10s 再按 ResourceTiming 去重数判定
  let warmup = null;
  if (scenario === 'A' || scenario === 'B' || scenario === 'E') {
    const targetAt = t0 + Number(revealT || 0) + 10400;
    const wait = targetAt - Date.now();
    if (wait > 0) await sleep(wait);
    warmup = await readSongTiming(T);
    const gateFinishedAt = trace && trace.gateAtReveal ? trace.gateAtReveal.finishedAt : null;
    checkWarmup(results, scenario, warmup, measuredTier(trace && trace.resourcesAtReveal, gateFinishedAt));
  }

  const reportEnd = await readReport(T);
  errorChecks(results, scenario, reportEnd, { allowResourceErrors: isFailScenario });
  if (isFailScenario) {
    const warns = (reportEnd.warns || []);
    addCheck(results, `${scenario}-warn-not-only-log-error`, warns.length > 0, warns.length ? shorten(warns.slice(0, 2).join(' | '), 300) : 'warn 为空');
  }

  return {
    results,
    evidence: {
      scenario,
      url,
      throttle: scenario === 'B' ? THROTTLE : null,
      startedAt: nowStamp(),
      reveal: { wallMs: revealWallMs, pollMax, trace: trace && trace.reveal, bootAtReveal: trace && trace.bootAtReveal },
      gate,
      gateHistory: (trace && trace.gateHistory) || [],
      hooks: (trace && trace.hooks) || null,
      resourcesAtReveal: (trace && trace.resourcesAtReveal) || null,
      statusAtReveal: (trace && trace.statusAtReveal) || null,
      statusHistory: (trace && trace.statusHistory) || [],
      warmup,
      after,
      entry,
      consoleAtReveal: reportReveal,
      consoleEnd: reportEnd,
      progress: {
        samples: downsample((revealWait.samples || []).map((s) => [s[0], s[1], s[2]]), 240),
        totalSamples: (revealWait.samples || []).length,
        distinctPct: Array.from(new Set(progress.pcts.map((v) => Math.round(v)))).length,
        distinctTarget: progress.distinctTargets,
      },
    },
  };
}

/* C：404 stage.js 后进关兜底 —— 只要求不崩、退回难度页 */
async function runEntryGuardC(T, results) {
  const toChar = await pressUntil(T, `(() => !!(window.__game && window.__game._page === 'charselect'))()`, { maxMs: 5000 });
  let entered = false;
  if (toChar.ok) {
    await T.key('Enter'); // 选灵梦 → startGame → ensureGameKit 再次 import 失败 → 退回难度页
    entered = true;
  }
  const t0 = Date.now();
  let st = null;
  while (Date.now() - t0 < 8000) {
    st = await readGameState(T);
    if (st && st.page === 'difficulty' && st.state === 'menu' && !st.kitLoadVisible) break;
    await sleep(150);
  }
  const finalState = st || (await readGameState(T));
  addCheck(results, 'C-entry-fallback', !!finalState && finalState.state === 'menu' && finalState.page === 'difficulty' && finalState.stageBuilt === false,
    finalState ? `page=${finalState.page} state=${finalState.state} stageBuilt=${finalState.stageBuilt} kitLoadVisible=${finalState.kitLoadVisible} kitLoad=${finalState.kitLoadText}` : '读不到 __game');
  addCheck(results, 'C-entry-kitload-hidden', !!finalState && finalState.kitLoadVisible === false,
    finalState ? `kitLoadVisible=${finalState.kitLoadVisible}` : '读不到 #kitLoad');
  return { toChar, entered, finalState };
}

/* D：404 youma_stage1 后进关 —— _ensureStageMusic 最多等 4s，不卡死 */
async function runEntryMusicD(T, results) {
  const toChar = await pressUntil(T, `(() => !!(window.__game && window.__game._page === 'charselect'))()`, { maxMs: 5000 });
  let startAt = null;
  if (toChar.ok) {
    await T.key('Enter');
    startAt = Date.now();
  }
  const stageWait = await skipToStage(T, { maxMs: 24000 });
  const totalMs = startAt ? Date.now() - startAt : null;
  addCheck(results, 'D-entry-stage-built', stageWait.ok,
    stageWait.ok
      ? `舞台已建（startGame 起 ${totalMs}ms，对话后段耗时 ${Math.round((stageWait.stageAt || 0))}ms，presses=${stageWait.presses}）`
      : `24s 内未建舞台（last=${JSON.stringify(stageWait.last)}）`);
  if (stageWait.ok) {
    // 开场对白结束后 _ensureStageMusic 最多等 4s：舞台在 8s 内出现即证明没卡死
    const apx = stageWait.stageAt;
    addCheck(results, 'D-entry-music-wait-bounded', apx !== null && apx <= 20000,
      `从选人确认到舞台建立总耗时 ${totalMs}ms（含 18 行开场对白，音乐兜底上限 4s）`);
    const finalState = stageWait.last;
    addCheck(results, 'D-entry-no-crash', !!finalState && (finalState.state === 'play' || finalState.state === 'dialogue'),
      finalState ? `state=${finalState.state} stageBuilt=${finalState.stageBuilt}` : '读不到 __game');
  }
  return { toChar, stageWait, totalMs };
}

/* E：正常路径进关冒烟 */
async function runEntrySmokeE(T, results) {
  const toChar = await pressUntil(T, `(() => !!(window.__game && window.__game._page === 'charselect'))()`, { maxMs: 5000 });
  let startAt = null;
  if (toChar.ok) {
    await T.key('Enter');
    startAt = Date.now();
  }
  const stageWait = await skipToStage(T, { maxMs: E_PLAY_TIMEOUT_MS });
  addCheck(results, 'E-entry-stage-built', stageWait.ok,
    stageWait.ok
      ? `舞台已建（对话 ${Math.round(stageWait.dialogueAt || 0)}ms 出现，舞台 ${Math.round(stageWait.stageAt || 0)}ms，presses=${stageWait.presses}）`
      : `${E_PLAY_TIMEOUT_MS}ms 内未建舞台（last=${JSON.stringify(stageWait.last)}）`);
  addCheck(results, 'E-entry-no-kitload', stageWait.kitLoadSeen === 0,
    `进关全程 #kitLoad 可见采样次数=${stageWait.kitLoadSeen}（期望 0，门禁已预载）`);

  let song = null;
  let stateNow = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    const st = await readGameState(T);
    if (st) {
      stateNow = st;
      song = st.soundingSong;
      if (song && String(song).includes('pre1')) break;
    }
    await sleep(120);
  }
  addCheck(results, 'E-entry-bgm-pre1', !!song && String(song).includes('pre1'),
    `audio.soundingSong=${JSON.stringify(song)}（期望含 pre1）`);
  const final = stateNow || (await readGameState(T));
  addCheck(results, 'E-entry-state-play', !!final && (final.state === 'play' || final.state === 'dialogue'),
    final ? `state=${final.state} stageBuilt=${final.stageBuilt}` : '读不到 __game');
  return { toChar, stageWait, song, final };
}

/* F：?bootgate=off 回归 */
async function runF(T, cfg) {
  const results = [];
  const url = scenarioUrl(cfg, 'F');
  const t0 = Date.now();
  await coldStart(T, url, { throttle: null });
  const revealWait = await waitReveal(T, 25000);
  const revealWallMs = Date.now() - t0;
  const trace = await readTrace(T);
  const reportReveal = await readReport(T);
  const gate = trace && trace.gateAtReveal ? trace.gateAtReveal : null;
  const revealT = trace && trace.reveal ? trace.reveal.t : null;

  addCheck(results, 'F-reveal', !!revealWait.revealed, `揭幕用时 ${revealWallMs}ms（预算 25000ms）`);
  checkGateShape(results, 'F', gate);
  if (gate) {
    addCheck(results, 'F-gate-art', gate.art === true, `art=${gate.art}`);
    addCheck(results, 'F-gate-kit-off', gate.kit === false, `kit=${gate.kit}（bootgate=off 只跑标题图，期望 false）`);
    addCheck(results, 'F-gate-music-off', gate.music === false, `music=${gate.music}（期望 false）`);
    addCheck(results, 'F-gate-failed-empty', gateFailed(gate).length === 0, `failed=${JSON.stringify(gate.failed)}`);
    addCheck(results, 'F-gate-done', gate.done === true, `done=${gate.done}`);
  }
  progressChecks(results, 'F', revealWait, trace);
  checkStatusHiddenF(results, trace);

  await sleep(1500);
  const afterOff = await readSnapshot(T);
  addCheck(results, 'F-state-menu', !!(afterOff && afterOff.game && afterOff.game.state === 'menu'),
    afterOff && afterOff.game ? `state=${afterOff.game.state} page=${afterOff.game.page}` : 'window.__game 缺失');

  // 揭幕后仍会 _prefetchGameKit：等最多 6s，看到 stage.js 的请求（且 startTime >= 揭幕附近）
  let prefetch = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 6000) {
    const rep = await readReport(T);
    const entry = (rep.resources || []).find((r) => String(r.n || '').includes('game/stage.js'));
    if (entry) { prefetch = { entry, report: rep }; break; }
    await sleep(250);
  }
  addCheck(results, 'F-prefetch-after-reveal', !!prefetch,
    prefetch ? `stage.js 已在揭幕后被请求（n=${prefetch.entry.n} s=${prefetch.entry.s} d=${prefetch.entry.d}）` : '6s 内没看到 game/stage.js 请求（_prefetchGameKit 未触发？）');
  addCheck(results, 'F-kit-off-no-timeout', gate ? !gateFailed(gate).includes('timeout') : false,
    gate ? `failed=${JSON.stringify(gate.failed)}` : 'gate 缺失');

  const interactive = await pressUntil(T, `(() => !!(window.__game && window.__game._page === 'difficulty'))()`, { maxMs: 6000 });
  addCheck(results, 'F-title-interactive', interactive.ok, `Enter→难度页 ${interactive.ok ? '成功' : '失败'}（${interactive.ms}ms）`);

  const reportEnd = await readReport(T);
  errorChecks(results, 'F', reportEnd, { allowResourceErrors: false });

  return {
    results,
    evidence: {
      scenario: 'F',
      url,
      startedAt: nowStamp(),
      reveal: { wallMs: revealWallMs, trace: trace && trace.reveal, bootAtReveal: trace && trace.bootAtReveal },
      gate,
      gateHistory: (trace && trace.gateHistory) || [],
      resourcesAtReveal: (trace && trace.resourcesAtReveal) || null,
      statusAtReveal: (trace && trace.statusAtReveal) || null,
      statusHistory: (trace && trace.statusHistory) || [],
      after: afterOff,
      prefetch: prefetch ? { entry: prefetch.entry } : null,
      consoleAtReveal: reportReveal,
      consoleEnd: reportEnd,
      progress: { samples: downsample((revealWait.samples || []).map((s) => [s[0], s[1], s[2]]), 240), totalSamples: (revealWait.samples || []).length },
    },
  };
}

/* ------------------------------------------------------------------ */
/* fail-server 子进程（C/D 自动拉起 8143）                             */
/* ------------------------------------------------------------------ */

async function startFailServer({ port, root, patterns, log }) {
  const child = spawn(process.env.GATE_PYTHON || 'python', [
    FAILSERVER, '--port', String(port), '--root', root, '--404', ...patterns,
  ], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const base = `http://127.0.0.1:${port}`;
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    if (child.exitCode !== null && child.exitCode !== undefined) {
      throw new Error(`fail-server 启动即退出（code=${child.exitCode}）：${shorten(out, 400)}`);
    }
    try {
      const res = await fetch(`${base}/index.html`, { method: 'HEAD' });
      if (res.status) {
        if (log) console.log(`  [fail-server] ${base} root=${root} 404=${patterns.join(',')}`);
        return { child, base, out: () => out, port, root, patterns };
      }
    } catch (e) { /* 还没起来 */ }
    await sleep(150);
  }
  try { child.kill(); } catch (e) { /* ignore */ }
  throw new Error(`fail-server 启动超时：${shorten(out, 400)}`);
}

async function stopFailServer(srv) {
  if (!srv || !srv.child) return;
  const child = srv.child;
  try { child.kill(); } catch (e) { /* ignore */ }
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } finish(); }, 2000);
    child.once('exit', () => { clearTimeout(timer); finish(); });
  });
  await sleep(150);
}

async function withFailServer(cfg, scenario, fn) {
  if (!cfg.failRoot) {
    // 外部已起好 fail-server（GATE_404 由外部注入），直接沿用
    return fn();
  }
  const port = Number(new URL(cfg.failBase).port || 80);
  const patterns = FAIL_404[scenario] || [];
  let srv = null;
  try {
    srv = await startFailServer({ port, root: cfg.failRoot, patterns, log: true });
    return await fn();
  } finally {
    await stopFailServer(srv);
  }
}

/* ------------------------------------------------------------------ */
/* 产物                                                                */
/* ------------------------------------------------------------------ */

function scenarioMeta(ev) {
  const gate = ev && ev.gate;
  return {
    scenario: ev.scenario,
    url: ev.url,
    revealMs: ev.reveal && ev.reveal.wallMs,
    gate: gate ? { art: gate.art, kit: gate.kit, music: gate.music, failed: gate.failed, done: gate.done } : null,
  };
}

function renderMarkdown(label, runInfo, scenarios) {
  const lines = [];
  lines.push(`# HKS 启动幕门禁 QA 报告（${label}）`);
  lines.push('');
  lines.push(`- 运行时间：${nowStamp()}`);
  lines.push(`- base：${runInfo.base}　fail-base：${runInfo.failBase}${runInfo.failRoot ? `（fail-root=${runInfo.failRoot}）` : ''}`);
  lines.push(`- CDP 端口：${runInfo.cdpPort}　场景：${scenarios.map((s) => s.scenario).join(' / ')}`);
  lines.push('');
  lines.push('## 结论表');
  lines.push('');
  lines.push('| 场景 | 揭幕 | gate(art/kit/music) | failed | 断言通过 |');
  lines.push('| --- | --- | --- | --- | --- |');
  let total = 0;
  let passed = 0;
  for (const s of scenarios) {
    total += s.results.length;
    passed += s.results.filter((r) => r.ok).length;
    const m = scenarioMeta(s.evidence);
    const g = m.gate;
    lines.push(`| ${s.evidence.scenario} | ${m.revealMs == null ? '-' : `${m.revealMs}ms`} | ${g ? `${g.art}/${g.kit}/${g.music}` : '缺失'} | ${g ? JSON.stringify(g.failed) : '-'} | ${s.results.filter((r) => r.ok).length}/${s.results.length} |`);
  }
  lines.push('');
  lines.push(`**总计：${passed}/${total} 通过**`);
  lines.push('');
  for (const s of scenarios) {
    lines.push(`## 场景 ${s.evidence.scenario}`);
    lines.push('');
    lines.push(`- URL：${s.evidence.url}`);
    const ev = s.evidence;
    if (ev.reveal) {
      lines.push(`- 揭幕：${ev.reveal.wallMs}ms${ev.reveal.trace ? `（trace.t=${Math.round(ev.reveal.trace.t)}ms）` : ''}`);
    }
    if (ev.gate) lines.push(`- __hksBootGate@reveal：${JSON.stringify(ev.gate)}`);
    if (ev.entry) lines.push(`- 进关：${shorten(JSON.stringify(ev.entry), 500)}`);
    lines.push('');
    lines.push('| 断言 | 结果 | 实测 |');
    lines.push('| --- | --- | --- |');
    for (const r of s.results) lines.push(`| ${r.id} | ${r.ok ? 'PASS' : '**FAIL**'} | ${String(r.detail).replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  return lines.join('\n');
}

function writeArtifacts(cfg, runInfo, scenarios) {
  mkdirSync(cfg.out, { recursive: true });
  const summary = {
    label: cfg.label,
    runAt: nowStamp(),
    base: runInfo.base,
    failBase: runInfo.failBase,
    failRoot: runInfo.failRoot || null,
    cdpPort: runInfo.cdpPort,
    scenarios: scenarios.map((s) => ({
      scenario: s.evidence.scenario,
      meta: scenarioMeta(s.evidence),
      checks: s.results,
      evidenceFile: `${cfg.out}/qa_${cfg.label}_${s.evidence.scenario}.json`,
    })),
  };
  writeFileSync(`${cfg.out}/qa_${cfg.label}_summary.json`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  for (const s of scenarios) {
    writeFileSync(`${cfg.out}/qa_${cfg.label}_${s.evidence.scenario}.json`, `${JSON.stringify({ label: cfg.label, ...s.evidence, checks: s.results }, null, 2)}\n`, 'utf8');
  }
  if (cfg.md) {
    writeFileSync(`${cfg.out}/qa_${cfg.label}.md`, `${renderMarkdown(cfg.label, runInfo, scenarios)}\n`, 'utf8');
  }
  return summary;
}

function printSummary(cfg, runInfo, scenarios) {
  const all = scenarios.flatMap((s) => s.results);
  const failed = all.filter((r) => !r.ok);
  console.log('');
  console.log(`== ${cfg.label} 结果：${all.length - failed.length}/${all.length} 通过 ==`);
  for (const s of scenarios) {
    const rs = s.results;
    const bad = rs.filter((r) => !r.ok);
    console.log(`  ${s.evidence.scenario}: ${bad.length ? `FAIL (${bad.map((b) => b.id).join(', ')})` : 'PASS'}`);
  }
  if (failed.length) {
    console.log('  FAIL 明细：');
    for (const f of failed) console.log(`   - ${f.id}: ${shorten(f.detail, 400)}`);
  }
  return failed;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const cfg = resolveConfig(process.argv.slice(2));
  const runInfo = { base: cfg.base, failBase: cfg.failBase, failRoot: cfg.failRoot, cdpPort: cfg.cdpPort };
  console.log(`[boot-gate-qa] label=${cfg.label} base=${cfg.base} failBase=${cfg.failBase} failRoot=${cfg.failRoot || '(外部)'} scenarios=${cfg.scenarios.join(',')}`);

  // 启动前探活：避免把「服务没起」误判成产品失败。
  // fail-base 只在需要外部 fail-server（C/D 且没给 --fail-root）时才探活；
  // 给了 --fail-root 时 fail-server 由本套件按场景拉起。
  const probes = [['base', cfg.base]];
  const needsExternalFail = cfg.scenarios.some((s) => s === 'C' || s === 'D') && !cfg.failRoot;
  if (needsExternalFail) probes.push(['failBase', cfg.failBase]);
  for (const [name, base] of probes) {
    try {
      const res = await fetch(`${base}/index.html`, { method: 'HEAD' });
      if (!res.status) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      throw new Error(`${name} 站点不可达：${base}（${shorten(String((e && e.message) || e), 200)}）——先起静态服务器再跑本套件`);
    }
  }

  const T = await launch({ port: cfg.cdpPort, width: 1280, height: 720 });
  const scenarios = [];
  let crashed = null;
  try {
    await installTrace(T);
    for (const scenario of cfg.order) {
      console.log(`\n[boot-gate-qa] 场景 ${scenario}`);
      try {
        let out;
        if (scenario === 'F') out = await runF(T, cfg);
        else if (scenario === 'C' || scenario === 'D') {
          out = await withFailServer(cfg, scenario, async () => runGateScenario(T, cfg, scenario));
        } else out = await runGateScenario(T, cfg, scenario);
        scenarios.push(out);
      } catch (e) {
        const msg = shorten(String((e && e.stack) || e), 800);
        console.error(`  场景 ${scenario} 执行异常：${msg}`);
        scenarios.push({
          results: [{ id: `${scenario}-run`, ok: false, detail: `场景执行异常：${msg}` }],
          evidence: { scenario, url: scenarioUrl(cfg, scenario), startedAt: nowStamp(), error: msg },
        });
        crashed = msg;
      }
    }
  } finally {
    try { await T.close(); } catch (e) { /* ignore */ }
  }

  const summary = writeArtifacts(cfg, runInfo, scenarios);
  const failed = printSummary(cfg, runInfo, scenarios);
  console.log(`[boot-gate-qa] 证据：${cfg.out}/qa_${cfg.label}_summary.json 与 qa_${cfg.label}_<场景>.json`);
  if (failed.length || crashed) process.exitCode = 1;
  return summary;
}

main().catch((e) => {
  console.error('[boot-gate-qa] 致命错误:', (e && e.stack) || e);
  process.exit(2);
});
