#!/usr/bin/env node
/**
 * 移动端 / 竖屏「4 语言 × 9 屏」截图矩阵（与桌面版 tools/_pt_i18n_matrix.mjs 平行，互不影响）。
 *
 *   python tools/serve_nocache.py 8140
 *   PT_BASE=http://127.0.0.1:8140 node tools/_pt_i18n_mobile.mjs
 *
 * 视口：390×844（dpr2 / mobile / 触摸）与 768×1024（dpr1 / 桌面），各跑一轮。
 * 语言：zh-Hans / zh-Hant / en / ja；屏幕：title settings keybinds difficulty
 *       charselect help music story ending。
 *
 * 产物（只写 _pt/mobile-matrix/）：
 *   <screen>-<lang>-<vp>.png        单张截图（vp = 390x844 / 768x1024）
 *   report.json                     诊断汇总（按 lang/vp/screen 分组）
 *   sheet-<screen>-<vp>.png         2×2 四语对照图（由 tools/_i18n_mobile_sheet.py 生成）
 *   4up-<screen>.png                推荐 4-up 跨视口对照（同上，脚本自动调用）
 *
 * 每个视口截图时采集：
 *   - document.documentElement.scrollWidth vs innerWidth、body.scrollHeight vs innerHeight
 *   - .btn / .set-row / .seg / .cc-card / .diff-card / .tbtn 的 boundingBox 与越界边
 *   - 文本元素 scrollWidth > clientWidth+2（被裁切）、计算字号 < 10px（移动端不可读）
 *   - 触控目标 < 24px、竖屏 letterbox 占比（派生指标）
 *
 * 拍摄期间若发现 src/ 文本资源被别的会话改动（哈希变化），整轮自动重拍一次。
 */
import { launch, sleep, BASE } from './_pt_core.mjs';
import { mkdirSync, writeFileSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, '_pt', 'mobile-matrix');
const OUT_REL = '_pt/mobile-matrix';
mkdirSync(OUT_DIR, { recursive: true });

const LANGS = ['zh-Hans', 'zh-Hant', 'en', 'ja'];
const SCREENS = [
  'title', 'settings', 'keybinds', 'difficulty', 'charselect',
  'help', 'music', 'story', 'ending',
];
const VPS = [
  { id: '390x844', width: 390, height: 844, dpr: 2, mobile: true, touch: true, kind: 'phone-portrait' },
  { id: '768x1024', width: 768, height: 1024, dpr: 1, mobile: false, touch: false, kind: 'tablet-portrait' },
];
const SEVERITY_LEGEND = {
  high: '内容丢失 / 错位：元素越出窗口或游戏画面、页面溢出、文字被裁切',
  medium: '可读性：文本计算字号 < 10px（移动端基本不可读）',
  low: '体验建议：触控目标 < 24px、竖屏 letterbox（黑边）占比过大',
};

/* ------------------------------------------------------------------ *
 * 拍摄期间源码快照：别的 DSH 会话若改了 src/**\/*.{js,css,html,json}，整轮重拍
 * ------------------------------------------------------------------ */
const HASH_EXT = new Set(['.js', '.mjs', '.css', '.html', '.json']);
function walkFiles(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walkFiles(p, acc);
    else if (HASH_EXT.has(extname(p).toLowerCase())) acc.push(p);
  }
}
function assetSnapshot() {
  const files = [join(ROOT, 'index.html')];
  try { walkFiles(join(ROOT, 'src'), files); } catch { /* src 不存在就只 hash index */ }
  files.sort();
  const h = createHash('sha256');
  for (const f of files) {
    h.update(relative(ROOT, f).replace(/\\/g, '/'));
    h.update('\0');
    try { h.update(readFileSync(f)); } catch { h.update('missing'); }
    h.update('\0');
  }
  return { hash: h.digest('hex'), files: files.length, at: new Date().toISOString() };
}

/* ------------------------------------------------------------------ *
 * 页面内诊断探针（在截图前运行；返回纯 JSON）
 * ------------------------------------------------------------------ */
const DIAG_JS = String.raw`(() => {
  const vw = innerWidth, vh = innerHeight;
  const wrapEl = document.getElementById('wrap');
  const wrapBox = wrapEl ? wrapEl.getBoundingClientRect()
    : { x: 0, y: 0, width: vw, height: vh, left: 0, top: 0, right: vw, bottom: vh };
  const winBox = { left: 0, top: 0, right: vw, bottom: vh };
  const g = window.__game;
  const num = (v) => Math.round(v * 10) / 10;
  const rectOf = (r) => ({ x: num(r.x), y: num(r.y), w: num(r.width), h: num(r.height), right: num(r.right), bottom: num(r.bottom) });
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const pretty = (el) => {
    const bits = [];
    let e = el;
    for (let i = 0; i < 4 && e && e.nodeType === 1; i++) {
      let s = e.tagName.toLowerCase();
      if (e.id) s += '#' + e.id;
      else if (e.classList.length) s += '.' + [...e.classList].slice(0, 3).join('.');
      bits.unshift(s);
      e = e.parentElement;
    }
    return bits.join('>');
  };
  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const outOfBox = (r, b) => {
    const o = [];
    if (r.left < b.left - 0.5) o.push('left');
    if (r.right > b.right + 0.5) o.push('right');
    if (r.top < b.top - 0.5) o.push('top');
    if (r.bottom > b.bottom + 0.5) o.push('bottom');
    return o;
  };

  const issues = [];
  const boxes = [];
  const KEY_SELECTORS = ['.btn', '.set-row', '.seg', '.cc-card', '.diff-card', '.tbtn'];
  const tapAgg = {};
  for (const sel of KEY_SELECTORS) {
    for (const el of document.querySelectorAll(sel)) {
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      const outWin = outOfBox(r, winBox);
      const outGame = outOfBox(r, wrapBox);
      const text = clean(el.textContent).slice(0, 60);
      boxes.push({
        selector: sel, text, rect: rectOf(r),
        outOfWindow: outWin, outOfGameViewport: outGame,
      });
      if (outWin.length || outGame.length) {
        issues.push({
          kind: 'element-overflow',
          severity: 'high',
          scope: outWin.length ? 'window' : 'game-viewport',
          selector: sel, text,
          rect: rectOf(r),
          edges: outWin.length ? outWin : outGame,
        });
      }
      const minSide = Math.min(r.width, r.height);
      if (minSide < 24) {
        if (!tapAgg[sel]) tapAgg[sel] = { count: 0, minSide: minSide, samples: [] };
        tapAgg[sel].count++;
        tapAgg[sel].minSide = Math.min(tapAgg[sel].minSide, minSide);
        if (tapAgg[sel].samples.length < 4) tapAgg[sel].samples.push(text.slice(0, 30));
      }
    }
  }
  for (const sel of Object.keys(tapAgg)) {
    issues.push({
      kind: 'tap-target-too-small',
      severity: 'low',
      selector: sel,
      count: tapAgg[sel].count,
      minSide: num(tapAgg[sel].minSide),
      threshold: 24,
      samples: tapAgg[sel].samples,
    });
  }

  let fontAgg = null;
  const clipped = [];
  let textCount = 0;
  for (const el of document.querySelectorAll('#ui *')) {
    if (!isVisible(el)) continue;
    const direct = clean([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
    if (!direct) continue;
    textCount++;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    if (fs && fs < 10) {
      if (!fontAgg) fontAgg = { kind: 'font-too-small', severity: 'medium', count: 0, under6: 0, minFontSize: fs, samples: [] };
      fontAgg.count++;
      fontAgg.minFontSize = Math.min(fontAgg.minFontSize, fs);
      if (fs < 6) fontAgg.under6++;
      if (fontAgg.samples.length < 8) fontAgg.samples.push({ path: pretty(el), fontSize: num(fs), text: direct.slice(0, 40) });
    }
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
      const hard = ['hidden', 'clip'].includes(cs.overflowX) || cs.textOverflow === 'ellipsis';
      clipped.push({
        kind: 'text-clipped',
        severity: hard ? 'high' : 'low',
        path: pretty(el),
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
        overflowX: cs.overflowX, whiteSpace: cs.whiteSpace,
        fontSize: num(fs), text: direct.slice(0, 50),
      });
    }
  }
  if (fontAgg) {
    fontAgg.minFontSize = num(fontAgg.minFontSize);
    issues.push(fontAgg);
  }
  for (const c of clipped) issues.push(c);

  const docEl = document.documentElement;
  const body = document.body;
  const page = {
    innerWidth: vw, innerHeight: vh, devicePixelRatio: devicePixelRatio,
    docScrollWidth: docEl.scrollWidth, docScrollHeight: docEl.scrollHeight,
    bodyScrollWidth: body.scrollWidth, bodyScrollHeight: body.scrollHeight,
    hOverflow: docEl.scrollWidth - vw,
    vOverflow: body.scrollHeight - vh,
  };
  if (page.hOverflow > 1) {
    issues.push({ kind: 'page-horizontal-overflow', severity: 'high', overflowPx: page.hOverflow, scrollWidth: docEl.scrollWidth, innerWidth: vw });
  }
  if (page.vOverflow > 1) {
    issues.push({ kind: 'page-vertical-overflow', severity: 'medium', overflowPx: page.vOverflow, scrollHeight: body.scrollHeight, innerHeight: vh });
  }

  const gameBox = rectOf(wrapBox);
  const fill = {
    widthRatio: num((wrapBox.width / vw) * 100) / 100,
    heightRatio: num((wrapBox.height / vh) * 100) / 100,
  };
  if (fill.heightRatio < 0.6) {
    issues.push({
      kind: 'portrait-letterbox',
      severity: 'low',
      gameViewport: gameBox,
      fill,
      note: '竖屏下 1280×720 等比缩放到宽度，上下留出大块黑边',
    });
  }
  const cssScale = getComputedStyle(docEl).getPropertyValue('--s').trim();
  const overlay = document.querySelector('.overlay:not(.hidden)');
  return {
    page,
    viewport: { width: vw, height: vh, devicePixelRatio, cssScale: Number(cssScale) || null },
    gameViewport: gameBox,
    gameViewportFill: fill,
    context: {
      state: g ? g.state : null,
      overlayClass: overlay ? overlay.className : null,
      musicRoomVisible: !!document.querySelector('#musicRoom:not(.hidden)'),
      dialogueVisible: !!document.querySelector('#dialogue:not(.hidden)'),
      endingVisible: !!document.querySelector('#ending:not(.hidden)'),
      touchPadVisible: !!document.querySelector('#touch:not(.hidden)'),
      rotateHintVisible: (() => { const el = document.querySelector('.rotate-hint'); return !!el && getComputedStyle(el).display !== 'none'; })(),
    },
    textElementCount: textCount,
    boxes,
    issues,
  };
})()`;

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */
let portSeq = Number(process.env.PT_PORT || 9460);
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  viewports: VPS.map((v) => ({ id: v.id, kind: v.kind, width: v.width, height: v.height, deviceScaleFactor: v.dpr, mobile: v.mobile, touch: v.touch })),
  languages: LANGS,
  screens: SCREENS,
  severityLegend: SEVERITY_LEGEND,
  assets: null,
  passes: 0,
  shots: [],
  grouped: {},
  summary: null,
  errors: [],
  notes: [],
};

function addError(msg) {
  report.errors.push(msg);
  console.log('[error] ' + msg);
}

function saveReport() {
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
}

function severityCounts(issues) {
  const c = { high: 0, medium: 0, low: 0 };
  for (const it of issues) if (c[it.severity] !== undefined) c[it.severity]++;
  return c;
}

/* ------------------------------------------------------------------ *
 * 单屏拍摄 + 诊断
 * ------------------------------------------------------------------ */
async function capture(T, vp, lang, screen) {
  const fileRel = `${OUT_REL}/${screen}-${lang}-${vp.id}.png`;
  const diag = await T.eval(DIAG_JS);
  await T.shot(join(ROOT, fileRel));
  const issues = diag.issues || [];
  const counts = severityCounts(issues);
  const rec = {
    screen, lang, vp: vp.id,
    path: fileRel,
    viewport: diag.viewport,
    gameViewport: diag.gameViewport,
    gameViewportFill: diag.gameViewportFill,
    page: diag.page,
    context: diag.context,
    textElementCount: diag.textElementCount,
    elements: diag.boxes,
    issues,
    issueCounts: counts,
  };
  report.shots.push(rec);

  const fontIssue = issues.find((i) => i.kind === 'font-too-small');
  console.log(
    `[shot] ${screen.padEnd(10)} ${lang.padEnd(7)} ${vp.id.padEnd(8)} ` +
    `boxes=${String(rec.elements.length).padStart(2)} texts=${String(rec.textElementCount).padStart(3)} ` +
    `fontMin=${fontIssue ? fontIssue.minFontSize + 'px' : '-'} ` +
    `high=${counts.high} medium=${counts.medium} low=${counts.low} -> ${fileRel}`
  );
  for (const it of issues) {
    let detail = '';
    if (it.kind === 'font-too-small') detail = `count=${it.count} under6px=${it.under6} min=${it.minFontSize}px`;
    else if (it.kind === 'tap-target-too-small') detail = `selector=${it.selector} count=${it.count} minSide=${it.minSide}px`;
    else if (it.kind === 'element-overflow') detail = `selector=${it.selector} edges=${it.edges.join(',')} rect=${JSON.stringify(it.rect)} "${it.text}"`;
    else if (it.kind === 'text-clipped') detail = `path=${it.path} scroll=${it.scrollWidth}>client=${it.clientWidth} overflowX=${it.overflowX} "${it.text}"`;
    else if (it.kind === 'portrait-letterbox') detail = `gameH=${it.gameViewport.h} fillH=${it.fill.heightRatio} fillW=${it.fill.widthRatio}`;
    else if (it.kind === 'page-horizontal-overflow') detail = `scrollWidth=${it.scrollWidth} innerWidth=${it.innerWidth}`;
    else if (it.kind === 'page-vertical-overflow') detail = `scrollHeight=${it.scrollHeight} innerHeight=${it.innerHeight}`;
    console.log(`[issue][${it.severity}][${it.kind}] ${screen}/${lang}/${vp.id} ${detail}`);
  }
  return rec;
}

async function resetToTitle(T) {
  await T.eval(`(() => {
    try { window.__game.musicRoom?.hide?.(); } catch (e) {}
    window.__game.showTitle();
  })()`);
  await T.waitFor(`!document.getElementById('overlay').classList.contains('hidden')`, 6000);
  await T.eval(`window.__game._skipTitleIntro?.()`);
  await T.waitFor(
    `document.getElementById('buttons')?.getAnimations({ subtree: true }).every(a => a.playState !== 'running')`,
    8000
  ).catch(() => false);
  await sleep(220);
}

/* ------------------------------------------------------------------ *
 * 启动（带重试：dev server 偶尔并发拉模块超时，会整页没有 __game）
 * ------------------------------------------------------------------ */
async function bootLang(T, lang) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await T.nav(`${BASE}/index.html?lang=${lang}`);
      const hasGame = await T.waitFor('!!window.__game', 45000);
      if (!hasGame) { await sleep(1200); continue; }
      const booted = await T.waitFor('window.__game._bootDone === true', 35000);
      if (!booted) { await sleep(1200); continue; }
      await T.eval('document.fonts.ready.then(() => true)').catch(() => {});
      await T.eval(`(() => { try { window.__game.audio?.setMuted?.(true); } catch (e) {} return window.__game.audio?.muted; })()`).catch(() => {});
      await sleep(250);
      return { ok: true, attempts: attempt };
    } catch (e) {
      await sleep(600);
    }
  }
  return { ok: false, attempts: 3 };
}

/* ------------------------------------------------------------------ *
 * 每个视口 × 语言：9 屏
 * ------------------------------------------------------------------ */
async function runLanguage(T, vp, lang) {
  T.clearCollection();
  const boot = await bootLang(T, lang);
  if (!boot.ok) {
    addError(`boot failed: ${lang}/${vp.id} (3 attempts)`);
    return;
  }
  if (boot.attempts > 1) report.notes.push(`${lang}/${vp.id}: boot 重试成功（第 ${boot.attempts} 次）`);

  const failures = [];
  const step = async (screen, fn) => {
    try {
      await fn();
      return await capture(T, vp, lang, screen);
    } catch (e) {
      failures.push(`${screen}/${lang}/${vp.id}: ${e.message}`);
      addError(`capture failed: ${screen}/${lang}/${vp.id}: ${e.message}`);
      return null;
    }
  };

  try {
    // 1. title —— 跳过 2.4s 开屏入场，等按钮动画全部结束
    await resetToTitle(T);
    await step('title', async () => {
      await T.eval(`window.__game.showTitle()`);
      await T.waitFor(`document.getElementById('overlay').classList.contains('title-mode')`, 5000);
      await T.eval(`window.__game._skipTitleIntro?.()`);
      await T.waitFor(
        `document.getElementById('buttons')?.getAnimations({ subtree: true }).every(a => a.playState !== 'running')`,
        8000
      );
      await sleep(280);
    });

    // 2. settings
    await step('settings', async () => {
      await T.eval(`window.__game._showSettings(0, 'title')`);
      await T.waitFor(`document.querySelectorAll('.set-row').length > 0`, 5000).catch(() => {});
      await sleep(320);
    });

    // 3. keybinds
    await step('keybinds', async () => {
      await T.eval(`window.__game.showKeybinds(0)`);
      await sleep(320);
    });

    // 4. difficulty
    await step('difficulty', async () => {
      await T.eval(`window.__game.showDifficultySelect()`);
      await T.waitFor(`document.querySelectorAll('.diff-card').length > 0`, 5000).catch(() => {});
      await sleep(320);
    });

    // 5. charselect
    await step('charselect', async () => {
      await T.eval(`window.__game.showCharSelect()`);
      await T.waitFor(`document.querySelectorAll('.cc-card').length > 0`, 5000).catch(() => {});
      await sleep(320);
    });

    // 6. help
    await step('help', async () => {
      await T.eval(`window.__game.showHelp()`);
      await sleep(360);
    });

    // 7. music（整屏页，会吃按键；拍完点 .mr-back 退出）
    await step('music', async () => {
      await T.eval(`window.__game.showMusicRoom()`);
      const opened = await T.waitFor(`!!document.querySelector('.mr-heading, .mr-list')`, 8000);
      if (!opened) failures.push(`music/${lang}/${vp.id}: music room not opened`);
      await sleep(520);
    });
    await T.eval(`document.querySelector('.mr-back')?.click()`).catch(() => {});
    const left = await T.waitFor(
      `document.querySelector('#musicRoom')?.classList.contains('hidden') !== false`,
      7000
    ).catch(() => false);
    if (!left) failures.push(`music/${lang}/${vp.id}: music room did not close`);
    await T.eval(`window.__game._skipTitleIntro?.()`).catch(() => {});
    await sleep(340);

    // 8. story：难度 → Enter → .cc-card → Enter → 等对白铺开
    await step('story', async () => {
      await T.eval(`window.__game.showDifficultySelect()`);
      await sleep(280);
      await T.key('Enter');
      const cc = await T.waitFor(`!!document.querySelector('.cc-card')`, 9000);
      await sleep(240);
      await T.key('Enter');
      const dlg = await T.waitFor(`!document.getElementById('dialogue').classList.contains('hidden')`, 25000);
      await sleep(1500);
      if (!cc) failures.push(`story/${lang}/${vp.id}: char-select card missing`);
      if (!dlg) failures.push(`story/${lang}/${vp.id}: dialogue timeout`);
    });

    // 9. ending：直接播 good ending，等字幕上屏
    await step('ending', async () => {
      await T.eval(`(() => {
        const g = window.__game;
        try { g.dialogue?.stop?.(); } catch (e) {}
        g.char = 'reimu';
        g._playEnding('good');
      })()`);
      const ed = await T.waitFor(`(document.getElementById('edText')?.textContent || '').trim().length > 2`, 15000);
      await sleep(450);
      if (!ed) failures.push(`ending/${lang}/${vp.id}: ending text timeout`);
    });
  } finally {
    for (const f of failures) addError(f);
    const rep = await T.report().catch(() => ({ errors: [], netFails: [], httpBad: [] }));
    for (const e of rep.errors || []) report.errors.push(`js ${vp.id}/${lang}: ${e}`);
    for (const f of (rep.netFails || []).slice(0, 8)) report.errors.push(`net ${vp.id}/${lang}: ${f.err} ${f.url}`);
    for (const h of (rep.httpBad || []).slice(0, 8)) report.errors.push(`http ${vp.id}/${lang}: ${h.status} ${h.url}`);
  }
}

/* ------------------------------------------------------------------ *
 * 一轮完整拍摄（2 视口 × 4 语言 × 9 屏）
 * ------------------------------------------------------------------ */
async function runPass() {
  report.shots.length = 0;
  report.errors.length = 0;
  report.passes += 1;
  console.log(`\n=== pass ${report.passes} @ ${new Date().toISOString()} (${BASE}) ===`);
  for (const vp of VPS) {
    console.log(`\n--- viewport ${vp.id} (${vp.width}×${vp.height} dpr${vp.dpr} mobile=${vp.mobile}) ---`);
    let T = null;
    try {
      T = await launch({
        port: portSeq++,
        width: vp.width, height: vp.height,
        deviceScaleFactor: vp.dpr, mobile: vp.mobile,
        timeoutMs: 60000,
      });
      if (vp.touch) await T.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      for (const lang of LANGS) {
        console.log(`  [lang ${lang}]`);
        await runLanguage(T, vp, lang);
      }
    } catch (e) {
      addError(`viewport ${vp.id} crashed: ${e.message}`);
    } finally {
      if (T) { try { await T.close(); } catch {} }
    }
  }
  buildSummary();
  saveReport();
}

function buildSummary() {
  const byKind = {};
  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byVp = {};
  const byLang = {};
  const grouped = {};
  for (const vp of VPS) {
    grouped[vp.id] = { width: vp.width, height: vp.height, byScreen: {} };
    byVp[vp.id] = { shots: 0, high: 0, medium: 0, low: 0 };
  }
  for (const lang of LANGS) byLang[lang] = { shots: 0, high: 0, medium: 0, low: 0 };

  for (const rec of report.shots) {
    const c = rec.issueCounts;
    for (const k of Object.keys(bySeverity)) bySeverity[k] += c[k] || 0;
    for (const it of rec.issues) byKind[it.kind] = (byKind[it.kind] || 0) + 1;
    if (byVp[rec.vp]) { const b = byVp[rec.vp]; b.shots++; for (const k of Object.keys(b)) if (k !== 'shots') b[k] += c[k] || 0; }
    if (byLang[rec.lang]) { const b = byLang[rec.lang]; b.shots++; for (const k of Object.keys(b)) if (k !== 'shots') b[k] += c[k] || 0; }
    const slot = grouped[rec.vp].byScreen[rec.screen] || (grouped[rec.vp].byScreen[rec.screen] = {});
    slot[rec.lang] = {
      path: rec.path,
      issueCounts: rec.issueCounts,
      issueKinds: rec.issues.map((i) => i.kind),
      fontMin: (rec.issues.find((i) => i.kind === 'font-too-small') || {}).minFontSize ?? null,
      gameViewportFill: rec.gameViewportFill,
    };
  }
  report.grouped = grouped;

  const fontIssues = report.shots
    .map((r) => ({ screen: r.screen, lang: r.lang, vp: r.vp, f: r.issues.find((i) => i.kind === 'font-too-small') }))
    .filter((x) => x.f);
  const worstFont = fontIssues.slice().sort((a, b) => a.f.minFontSize - b.f.minFontSize).slice(0, 5);

  report.summary = {
    expectedShots: VPS.length * LANGS.length * SCREENS.length,
    shots: report.shots.length,
    issuesBySeverity: bySeverity,
    issuesByKind: byKind,
    shotsWithIssues: report.shots.filter((r) => r.issues.length).length,
    screensWithElementOverflow: [...new Set(report.shots.filter((r) => r.issues.some((i) => i.kind === 'element-overflow')).map((r) => r.screen))],
    screensWithTextClipping: [...new Set(report.shots.filter((r) => r.issues.some((i) => i.kind === 'text-clipped')).map((r) => r.screen))],
    screensWithHOverflow: [...new Set(report.shots.filter((r) => r.issues.some((i) => i.kind === 'page-horizontal-overflow')).map((r) => r.screen))],
    fontTooSmallShots: fontIssues.length,
    worstFontSize: worstFont.map((x) => ({ screen: x.screen, lang: x.lang, vp: x.vp, minFontSize: x.f.minFontSize, count: x.f.count })),
    byVp,
    byLang,
  };
}

/* ------------------------------------------------------------------ *
 * 主流程：哈希 → 拍摄 → 哈希；若 src 在拍摄期间被改动，重拍一次
 * ------------------------------------------------------------------ */
try {
  console.log(`[matrix] BASE=${BASE}  output=${OUT_REL}`);
  const before = assetSnapshot();
  console.log(`[matrix] src snapshot ${before.hash.slice(0, 12)} (${before.files} text files)`);
  await runPass();
  const mid = assetSnapshot();
  report.assets = { before: before.hash, afterPass1: mid.hash, after: mid.hash, files: before.files, stable: before.hash === mid.hash };
  if (before.hash !== mid.hash) {
    report.notes.push('检测到 src/ 在拍摄期间被改动 → 自动重拍一轮');
    console.log('[matrix] src/ 在拍摄期间被改动，重拍一轮…');
    await runPass();
    const after = assetSnapshot();
    report.assets.after = after.hash;
    report.assets.stable = after.hash === mid.hash;
    if (!report.assets.stable) report.notes.push('重拍期间 src/ 仍在变化，截图可能不对应同一版本');
  }
  buildSummary();
  saveReport();

  const s = report.summary;
  console.log('\n=== 汇总 ===');
  console.log(`shots=${s.shots}/${s.expectedShots} issues high=${s.issuesBySeverity.high} medium=${s.issuesBySeverity.medium} low=${s.issuesBySeverity.low}`);
  console.log(`byKind=${JSON.stringify(s.issuesByKind)}`);
  console.log(`font-too-small shots=${s.fontTooSmallShots}/${s.shots}`);
  if (report.errors.length) console.log(`errors=${report.errors.length}\n  ` + report.errors.slice(0, 12).join('\n  '));

  if (!process.env.NO_SHEET) {
    const py = process.env.PYTHON || 'python';
    const sheetPy = join(ROOT, 'tools', '_i18n_mobile_sheet.py');
    console.log(`\n[matrix] 拼对照图：${py} tools/_i18n_mobile_sheet.py`);
    const r = spawnSync(py, [sheetPy], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    if (r.status !== 0) console.log(`[matrix] 拼图脚本退出码 ${r.status}（截图与 report.json 不受影响）`);
  }
  process.exit(report.errors.some((e) => e.includes('boot failed') || e.includes('crashed')) ? 1 : 0);
} catch (e) {
  addError('fatal: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)));
  try { buildSummary(); saveReport(); } catch {}
  process.exit(1);
}
