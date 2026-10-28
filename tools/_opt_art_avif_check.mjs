/**
 * AVIF 化验收：素材完整性 + 运行期 AVIF/WebP 双路径 + 场景截图 + CDP 网络证据
 *
 * 依赖同目录 _pt_core.mjs 与本地静态服务：
 *   python tools/serve_nocache.py 8138
 *   node tools/_opt_art_avif_check.mjs --base http://127.0.0.1:8138
 *
 *   1) 读 tools/_opt/avif_report.json：60 转 / 2 跳过；逐张 HEAD 断言
 *      .avif 200 + image/avif + Content-Length == 报告字节；跳过的图检查没有 .avif 残留
 *   2) src/art/avif_manifest.js 与报告的 converted 集合逐一比对
 *   3) 模式 A（?nosw=1，默认走 AVIF）：标题/对白/第1面/moon/overlay 场景/Boss 截图；
 *      全部 62 张素材（60 avif + 2 webp）new Image()+decode() 断言尺寸；
 *      CDP Network 断言 avif 全 200 + image/avif，无 404，无非法 .webp 直连
 *   4) 回退探针：Network.setBlockedURLs 挡住 aya.avif，断言 onArtError 只回退一次到 webp
 *   5) 模式 B（?nosw=1&noavif=1）：断言完全不走 .avif、全部走 .webp，标题/第1面对白截图
 *   6) 模式 A2（临时 index 副本，把 3 条 preload 改 avif + 补 2 条 modulepreload）：
 *      验证 Lead 改完 index.html 之后的干净首屏（无 webp 双下载）
 *
 * 参数：--port 9552  --out _pt/opt_avif  --base http://127.0.0.1:8138
 * 退出码：0 = 全过；1 = 有 FAIL
 */
import { launch, saveJson } from './_pt_core.mjs';
import { readFileSync, existsSync, statSync, writeFileSync, rmSync, readdirSync } from 'node:fs';

const argv = {};
{
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) argv[a.slice(2, eq)] = a.slice(eq + 1);
    else argv[a.slice(2)] = (i + 1 < raw.length && !raw[i + 1].startsWith('--')) ? raw[++i] : '1';
  }
}
const CDP_PORT = Number(argv.port || 9552);
const OUT_DIR = argv.out || '_pt/opt_avif';
const BASE = argv.base || process.env.PT_BASE || 'http://127.0.0.1:8138';
const REPORT = 'tools/_opt/avif_report.json';
const WEBP_REPORT = 'tools/_opt/webp_report.json';
const RESULT_JSON = 'tools/_opt/avif_runtime_check.json';
const MANIFEST = 'src/art/avif_manifest.js';
const IMG_JS = 'src/art/img.js';
const INDEX = 'index.html';
const TMP_PAGE = 'index_avif_final_test.html';
const GEN = 'src/art/gen/';
const ICONS = ['/src/art/favicon.png', '/src/art/apple-touch-icon.png', '/src/art/pwa-192.png', '/src/art/pwa-512.png'];
const TITLES = ['title_bg', 'reimu_title', 'marisa_title'];
const REF_FILES = ['src/art/genboss.js', 'src/art/genchars.js', 'src/art/genfairy.js', 'src/game/dialogue.js',
  'src/game/ending.js', 'src/game/spellCutin.js', 'src/game/stage.js', 'src/main.js'];
/* dialogue.js 的 AI 立绘表：验证对白立绘请求的是对应 .avif */
const DLG_PORTRAITS = Object.fromEntries([...readFileSync('src/game/dialogue.js', 'utf8')
  .matchAll(/(\w+):\s*'([\w/]+\.webp)'/g)].map((m) => [m[1], m[2]]));
const sh = (n) => OUT_DIR + '/' + n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
const chk = (ok, name, detail = '') => { rows.push({ ok: !!ok, name, detail: String(detail).slice(0, 900) }); return !!ok; };
const log = (...a) => console.log(...a);
const pn = (u) => { try { return new URL(u).pathname; } catch { return u; } };
const norm = (p) => p.replace(/\\/g, '/').replace(/^\.?\//, '');
const toStem = (rel) => norm(rel).replace(GEN, '').replace(/\.(webp|avif)$/, '');
const KiB = (n) => (n / 1024).toFixed(1);

/* ---------------------------------------------------------------- 1. 报告清单 */
const rep = JSON.parse(readFileSync(REPORT, 'utf8'));
const wrep = JSON.parse(readFileSync(WEBP_REPORT, 'utf8').replace(/:\s*-?Infinity\b/g, ': null').replace(/:\s*NaN\b/g, ': null'));
const images = rep.images.map((it) => {
  const webpRel = norm(it.webp);
  const stem = toStem(webpRel);
  return {
    stem, webpRel, avifRel: GEN + stem + '.avif',
    webpUrl: '/' + webpRel, avifUrl: '/' + GEN + stem + '.avif',
    w: it.width, h: it.height, webpBytes: it.webp_bytes, avifBytes: it.avif_bytes,
    quality: it.quality, converted: !!it.converted, reason: it.reason, category: it.category, mode: it.mode,
  };
});
const conv = images.filter((i) => i.converted);
const skip = images.filter((i) => !i.converted);
const masterOf = new Map(wrep.images.map((it) => [toStem(it.webp), norm(it.path)]));
log('[清单] 62 张素材：转 ' + conv.length + ' / 不转 ' + skip.length + '；报告 after 总字节', rep.totals.afterTotal);

chk(images.length === 62, '报告素材数 62', 'got ' + images.length);
chk(conv.length === rep.totals.converted && skip.length === rep.totals.skipped, 'converted/skipped 与 totals 一致',
  JSON.stringify({ conv: conv.length, skip: skip.length, totals: rep.totals }));
chk(conv.every((i) => existsSync(i.avifRel) && statSync(i.avifRel).size === i.avifBytes && i.avifBytes < i.webpBytes),
  '转换的图 .avif 存在且字节 == 报告', JSON.stringify(conv.filter((i) => !existsSync(i.avifRel) || statSync(i.avifRel).size !== i.avifBytes).slice(0, 6)));
chk(skip.every((i) => !existsSync(i.avifRel)), '跳过的图没有残留 .avif（避免白吃 404）', JSON.stringify(skip.map((i) => i.avifRel)));
chk(images.every((i) => existsSync(i.webpRel)), '全部 .webp 回退文件保留', '');
chk(images.every((i) => masterOf.has(i.stem) && existsSync(masterOf.get(i.stem))), 'PNG/JPG 母版全部保留', '');
chk(ICONS.every((p) => existsSync('.' + p)), '4 个应用图标仍为 PNG 且存在', ICONS.join(','));

/* 目录里不能有清单外的 .avif */
const walkAvif = (dir, acc = []) => {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = norm(dir).replace(/\/+$/, '') + '/' + d.name;
    if (d.isDirectory()) walkAvif(p, acc);
    else if (/\.avif$/i.test(d.name)) acc.push(p);
  }
  return acc;
};
const diskAvif = walkAvif(GEN);
const convSet = new Set(conv.map((i) => i.stem));
const diskStems = new Set(diskAvif.map((p) => toStem(p)));
const diskDiff = diskAvif.filter((p) => !convSet.has(toStem(p)));
chk(diskAvif.length === conv.length && diskDiff.length === 0, '磁盘 .avif 集合 == 报告 converted 集合',
  JSON.stringify({ disk: diskAvif.length, want: conv.length, diff: diskDiff.slice(0, 6) }));

/* ---------------------------------------------------------------- 2. manifest / img.js */
const manTxt = readFileSync(MANIFEST, 'utf8');
const listed = [...manTxt.matchAll(/"([^"\\]+)"/g)].map((m) => m[1]).sort();
const listedSet = new Set(listed);
const wantStems = [...convSet].sort();
chk(manTxt.includes('export const AVIF_ASSETS') && listed.length === wantStems.length && listed.every((s, i) => s === wantStems[i]),
  'avif_manifest.js 与转换集合一致', JSON.stringify({ listed: listed.length, want: wantStems.length, onlyDisk: [...diskStems].filter((s) => !listedSet.has(s)).slice(0, 5) }));
chk(existsSync(IMG_JS) && /export function artUrl/.test(readFileSync(IMG_JS, 'utf8')) && /export function onArtError/.test(readFileSync(IMG_JS, 'utf8')),
  'src/art/img.js 导出 artUrl/onArtError', IMG_JS);
const noImport = REF_FILES.filter((f) => !/(from '\.\.?\/[^']*img\.js'|from '\.\/img\.js')/.test(readFileSync(f, 'utf8')));
chk(noImport.length === 0, '8 个运行期引用文件都接了 img.js', JSON.stringify(noImport));

/* ---------------------------------------------------------------- 3. HEAD 校验 */
const head = [];
for (const a of conv) {
  try {
    const r = await fetch(BASE + a.avifUrl, { method: 'HEAD' });
    head.push({ url: a.avifUrl, status: r.status, type: r.headers.get('content-type'), len: Number(r.headers.get('content-length')), want: a.avifBytes });
  } catch (e) { head.push({ url: a.avifUrl, status: -1, type: '', len: -1, want: a.avifBytes, err: String(e) }); }
}
const headBad = head.filter((h) => h.status !== 200 || !/image\/avif/i.test(h.type || '') || h.len !== h.want);
chk(headBad.length === 0, '60 个 .avif HEAD 200/image-avif/字节一致', JSON.stringify(headBad.slice(0, 5)));
const skipHeadBad = [];
for (const a of skip) {
  try {
    const r = await fetch(BASE + a.webpUrl, { method: 'HEAD' });
    if (r.status !== 200 || !/image\/webp/i.test(r.headers.get('content-type') || '')) skipHeadBad.push({ url: a.webpUrl, status: r.status });
  } catch (e) { skipHeadBad.push({ url: a.webpUrl, err: String(e) }); }
}
chk(skipHeadBad.length === 0, '跳过的 2 张 webp 仍 200', JSON.stringify(skipHeadBad));

/* ---------------------------------------------------------------- 4. 浏览器 */
const T = await launch({ port: CDP_PORT, width: 1280, height: 720, url: 'about:blank' });
const shots = [];
const respBytes = (list, match) => {
  const best = new Map();
  for (const r of list) {
    if (r.status !== 200 || !match(pn(r.url))) continue;
    let n = 0;
    for (const k of Object.keys(r.headers || {})) if (k.toLowerCase() === 'content-length') n = Number(r.headers[k]) || 0;
    const p = pn(r.url);
    best.set(p, Math.max(best.get(p) || 0, n));
  }
  return { bytes: [...best.values()].reduce((a, b) => a + b, 0), n: best.size, paths: [...best.keys()] };
};
const isImgPath = (p) => /\.(avif|webp|png|jpe?g)(\?|$)/i.test(p);
const isTitlePath = (p) => TITLE_RE_SAFE(p);
const TITLE_RE_SAFE = (p) => new RegExp('/(title_bg|reimu_title|marisa_title)\\.(avif|webp)$').test(p);
let result = {};
try {
  /* ---------- 模式 A：AVIF ---------- */
  await T.clearCollection();
  await T.boot({ query: '?nosw=1' });
  const titleAvif = await T.waitFor(
    "['title_bg.avif','reimu_title.avif','marisa_title.avif'].every(n => performance.getEntriesByType('resource').some(e => e.name.endsWith('/' + n)))", 20000);
  const bootDone = await T.waitFor(
    '!!(window.__boot && window.__boot.done) && !!window.__titleArt && window.__titleArt.every(i => i && i.complete && i.naturalWidth > 0)', 25000);
  await T.eval("(() => { try { window.__game._skipTitleIntro?.(); } catch (e) {} return true; })()");
  await sleep(1200);
  const titleState = await T.eval('({ bootPct: window.__boot && window.__boot.pct, bootDone: !!(window.__boot && window.__boot.done),' +
    ' chars: (window.__titleArt || []).map(i => [i.src.split("/").pop(), i.complete, i.naturalWidth]),' +
    ' bootVisible: !!document.getElementById("boot") && getComputedStyle(document.getElementById("boot")).display !== "none" })');
  await T.shot(sh('01_title_avif.png')); shots.push(sh('01_title_avif.png'));
  const respAtTitleA = [...T.responses.values()];
  const titleBytesA = respBytes(respAtTitleA, isTitlePath);
  chk(titleAvif && bootDone, '标题 3 张 .avif 已加载、开屏已揭幕', JSON.stringify(titleState));
  chk(titleState.chars.length === 3 && titleState.chars.every((c) => c[0].endsWith('.avif') && c[1] && c[2] > 0),
    '标题立绘实际用 .avif 且解码成功', JSON.stringify(titleState.chars));
  chk(titleBytesA.n === 3, '首屏标题图去重后正好 3 个 200 响应', JSON.stringify(titleBytesA.paths));

  /* marisa 标题立绘 */
  const marisaArt = await T.eval("(() => { const g = window.__game; g.char = 'marisa'; g._skipTitleIntro?.();" +
    " try { g.render?.(0.016); } catch (e) {}" +
    " return { char: g.char, art: (window.__titleArt || []).map(i => [i.src.split('/').pop(), i.complete, i.naturalWidth]) }; })()");
  await sleep(900);
  await T.shot(sh('01b_title_marisa_avif.png')); shots.push(sh('01b_title_marisa_avif.png'));
  chk(marisaArt.char === 'marisa' && marisaArt.art.length === 3 && marisaArt.art.every((a) => a[1] && a[2] > 0),
    'marisa 标题立绘就位（avif）', JSON.stringify(marisaArt));

  /* 全部素材 decode（60 avif + 2 webp） */
  const decoded = [];
  const decodeOne = (batch) => ' (async () => {' +
    ' const list = ' + JSON.stringify(batch) + '; const out = [];' +
    ' for (const it of list) {' +
    '  const im = new Image(); im.decoding = "async";' +
    '  const loaded = new Promise((res) => { im.onload = () => res("load"); im.onerror = () => res("error"); });' +
    '  const t0 = performance.now(); im.src = it.url;' +
    '  const st = await Promise.race([loaded, new Promise((r) => setTimeout(() => r("timeout"), 8000))]);' +
    '  let dec = false; try { await im.decode(); dec = true; } catch (e) { dec = String((e && e.name) || e); }' +
    '  out.push({ url: it.url, st, dec, nw: im.naturalWidth, nh: im.naturalHeight, ms: Math.round(performance.now() - t0) });' +
    ' } return out; })()';
  const decodeTargets = images.map((a) => ({ url: a.converted ? a.avifUrl : a.webpUrl, want: [a.w, a.h], stem: a.stem }));
  for (let i = 0; i < decodeTargets.length; i += 10) {
    decoded.push(...(await T.eval(decodeOne(decodeTargets.slice(i, i + 10).map((a) => ({ url: a.url }))))));
  }
  const decodeByUrl = new Map(decoded.map((d) => [d.url, d]));
  const decodeBad = decodeTargets.filter((a) => {
    const d = decodeByUrl.get(a.url);
    return !d || d.st !== 'load' || d.dec !== true || d.nw !== a.want[0] || d.nh !== a.want[1];
  });
  chk(decodeBad.length === 0, '62 张素材全部 decode 成功且尺寸一致（60 avif + 2 webp）',
    JSON.stringify(decodeBad.slice(0, 8).map((a) => ({ url: a.url, want: a.want, got: decodeByUrl.get(a.url) }))));
  const decodeMs = decoded.reduce((s, d) => s + (d.ms || 0), 0);
  log('[decode]', decoded.length, '张，累计', decodeMs, 'ms，失败', decodeBad.length);

  /* 对白立绘 */
  const dlg = await T.eval("(async () => { const g = window.__game; g.char = 'reimu'; g.startGame();" +
    " for (let i = 0; i < 100 && !(g.dialogue && g.dialogue.active); i++) await new Promise((r) => setTimeout(r, 40));" +
    " for (let i = 0; i < 14; i++) { if (g.dialogue.leftChar || g.dialogue.rightChar) break;" +
    "  g.dialogue.advance(); await new Promise((r) => setTimeout(r, 50));" +
    "  g.dialogue.advance(); await new Promise((r) => setTimeout(r, 50)); }" +
    " await new Promise((r) => setTimeout(r, 900));" +
    " const painted = (id) => { const cv = document.getElementById(id); if (!cv || !cv.getContext) return null;" +
    "  const ctx = cv.getContext('2d'); const w = cv.width, h = cv.height; if (!w || !h) return false;" +
    "  try { const d = ctx.getImageData(0, 0, w, h).data; let n = 0; for (let i = 3; i < d.length; i += 41) if (d[i] > 8) n++;" +
    "   return n > 50; } catch (e) { return 'tainted:' + ((e && e.name) || e); } };" +
    " return { active: !!(g.dialogue && g.dialogue.active), index: g.dialogue.index, speaker: g.dialogue.speaker," +
    "  left: g.dialogue.leftChar, right: g.dialogue.rightChar, paintedL: painted('portraitL'), paintedR: painted('portraitR') }; })()");
  await T.shot(sh('02_dialogue_avif.png')); shots.push(sh('02_dialogue_avif.png'));
  chk(!!(dlg.left || dlg.right), '对白页出现立绘', JSON.stringify(dlg));
  // #portraitL/#portraitR 是 <canvas> 不是 <img>：立绘由 loadPortrait()->artUrl 取图后画进 canvas。
  // 这里断言 canvas 真的画出了像素 + 对应角色的 .avif 有 200 响应（若是 .webp 会同时落进 strayWebp 断言）。
  const dlgFiles = [dlg.left, dlg.right].filter((k) => k && DLG_PORTRAITS[k]).map((k) => DLG_PORTRAITS[k]);
  const dlgExpectAvif = dlgFiles.map((f) => '/src/art/gen/' + f.replace(/\.webp$/, '.avif'));
  const dlgAvifResp = new Set([...T.responses.values()].map((r) => pn(r.url)));
  chk(dlgFiles.length > 0 && (dlg.paintedL === true || dlg.paintedR === true) && dlgExpectAvif.every((p) => dlgAvifResp.has(p)),
    '对白立绘已绘制（canvas）且对应 .avif 有 200 响应', JSON.stringify({ dlg, dlgExpectAvif }));

  /* 第 1 面 */
  const st1 = await T.eval("(async () => { const g = window.__game; try { g.dialogue?.stop?.(); } catch (e) {}" +
    " g._warpToStage(1); let s = g.stage;" +
    " for (let i = 0; i < 200; i++) { const lays = s._bgLayers && s._bgLayers['shrine']; if (lays && lays.filter(Boolean).length >= 2) break; await new Promise((r) => setTimeout(r, 50)); }" +
    " await new Promise((r) => setTimeout(r, 2600)); s = g.stage;" +
    " return { state: g.state, level: g.levelIndex, theme: s.level.theme, mode: s.mode," +
    "  bgLayers: (s._bgLayers?.['shrine'] || []).filter(Boolean).length, fps: +(g.loop?.fps || 0).toFixed(1) }; })()");
  await T.shot(sh('03_stage1_avif.png')); shots.push(sh('03_stage1_avif.png'));
  chk(st1.state === 'play' && st1.level === 0 && st1.bgLayers >= 2, '第 1 面实机画面', JSON.stringify(st1));

  /* moon 背景 */
  const bgMoon = await T.eval("(async () => { const g = window.__game; try { g.dialogue?.stop?.(); } catch (e) {}" +
    " g._warpToStage(6); let s = g.stage;" +
    " for (let i = 0; i < 240; i++) { const lays = s._bgLayers && s._bgLayers['moon']; if (lays && lays.filter(Boolean).length >= 2) break; await new Promise((r) => setTimeout(r, 50)); }" +
    " for (const hid of ['hud', 'banner']) { const el = document.getElementById(hid); if (el) el.style.display = 'none'; }" +
    " await new Promise((r) => setTimeout(r, 1400)); s = g.stage;" +
    " return { state: g.state, level: g.levelIndex, theme: s.level.theme, bgLayers: (s._bgLayers?.['moon'] || []).filter(Boolean).length }; })()");
  await T.shot(sh('04_bg_moon_avif.png')); shots.push(sh('04_bg_moon_avif.png'));
  chk(bgMoon.level === 5 && bgMoon.theme === 'moon' && bgMoon.bgLayers >= 2, 'moon 背景画面', JSON.stringify(bgMoon));

  /* overlay 场景底图（CSS background 路径） */
  const ovBg = await T.eval("(async () => { const g = window.__game; g._applyScene('shrine');" +
    " await new Promise((r) => setTimeout(r, 700));" +
    " const el = document.querySelector('.ov-bg-img');" +
    " return { scene: g._sceneId, bg: el ? el.style.backgroundImage : null }; })()");
  await T.shot(sh('05_overlay_scene_avif.png')); shots.push(sh('05_overlay_scene_avif.png'));
  chk(!!ovBg.bg && /\.avif/.test(ovBg.bg), 'overlay 场景底图走 .avif（CSS 路径）', JSON.stringify(ovBg));
  await T.eval("(() => { try { window.__game._applyScene(''); } catch (e) {} return true; })()");

  /* EXTRA 芙兰 Boss */
  const boss = await T.eval("(async () => { const g = window.__game; try { g.dialogue?.stop?.(); } catch (e) {}" +
    " g.extraChar = 'reimu'; g.char = 'reimu'; g.musicOn = false;" +
    " for (const hid of ['hud', 'banner']) { const el = document.getElementById(hid); if (el) el.style.display = 'none'; }" +
    " g._startExtraStage({ chainFrom: 3 }); let artErr = null;" +
    " try { const m = await import('/src/art/genboss.js'); await m.ensureBossArt('flandre'); } catch (e) { artErr = String(e); }" +
    " const s = g.stage; const upd = g.update.bind(g); g.update = () => {}; const p = s.player;" +
    " if (p) { p.invuln = 999; p.alive = true; }" +
    " for (let i = 0; i < 300; i++) { try { upd(1 / 60); } catch (e) { break; } if (p && i % 20 === 0) p.invuln = 999; }" +
    " for (let i = 0; i < 3; i++) g.render(0.5); const b = s.boss;" +
    " return { artErr, boss: b ? { key: b.key, state: b.state, hp: Math.round(b.hp) } : null }; })()");
  await sleep(150);
  await T.shot(sh('06_boss_flandre_avif.png')); shots.push(sh('06_boss_flandre_avif.png'));
  chk(!!(boss.boss && boss.boss.key === 'flandre') && !boss.artErr, 'EXTRA 芙兰 Boss 战斗立绘（avif）', JSON.stringify(boss));

  /* 网络汇总（模式 A） */
  const reportA = await T.report();
  const respA = [...T.responses.values()];
  const rpA = new Map();
  for (const r of respA) rpA.set(pn(r.url), r);
  const avifResp = [...rpA.entries()].filter(([p]) => /\.avif$/.test(p));
  const avifBad = avifResp.filter(([, r]) => r.status !== 200 || !/image\/avif/i.test(r.mime || ''));
  chk(avifBad.length === 0, '所有 .avif 响应均 200 + image/avif', JSON.stringify(avifBad.slice(0, 5)));
  chk(avifResp.length >= 20, '.avif 实际请求数 >= 20（证明运行期真在用）', 'avif=' + avifResp.length);
  const titleRespA = avifResp.filter(([p]) => TITLE_RE_SAFE(p));
  chk(titleRespA.length === 3, '3 张标题图在 CDP 里记录到 .avif 200', JSON.stringify(titleRespA.map(([p, r]) => [p, r.status, r.mime])));

  const idxHtml = readFileSync(INDEX, 'utf8');
  const stalePreload = /href="\.\/src\/art\/gen\/(?:title_bg|reimu_title|marisa_title)\.webp"/.test(idxHtml);
  const allowedWebp = new Set([...(stalePreload ? TITLES.map((t) => '/src/art/gen/' + t + '.webp') : []), ...skip.map((i) => i.webpUrl)]);
  const webpReq = [...new Set(T.requests.map((r) => pn(r.url)))].filter((p) => /\.webp$/.test(p));
  const strayWebp = webpReq.filter((p) => !allowedWebp.has(p));
  chk(webpReq.length === 0 || strayWebp.length === 0, '运行期没有绕过 img.js 的 .webp 直连',
    JSON.stringify({ webpReq, allowed: [...allowedWebp], stray: strayWebp }));
  if (stalePreload) log('[注意] index.html 仍是 webp preload（Lead 尚未改），首屏会多下载 3 张 webp；模式 A2 模拟改好后的状态');
  const pngJpg = [...new Set(T.requests.map((r) => pn(r.url)))].filter((p) => /\.(png|jpe?g)$/i.test(p));
  chk(pngJpg.every((p) => ICONS.includes(p)), '除 4 图标外无 .png/.jpg 图片请求', JSON.stringify(pngJpg));
  chk(reportA.httpBad.length === 0, 'Network 无 4xx/5xx（模式 A）', JSON.stringify(reportA.httpBad.slice(0, 8)));
  chk(reportA.netFails.length === 0, '无 Network.loadingFailed（非取消，模式 A）', JSON.stringify(reportA.netFails.slice(0, 8)));
  chk(reportA.errors.length === 0, '无 console error / 异常（模式 A）', JSON.stringify(reportA.errors.slice(0, 6)));
  const fullBytesA = respBytes(respA, isImgPath);

  /* 回退探针：挡住 aya.avif，onArtError 应只回退一次到 webp */
  await T.clearCollection();
  let blockOk = false;
  try { await T.send('Network.setBlockedURLs', { urls: ['*aya.avif'] }); blockOk = true; } catch (e) { log('[跳过] setBlockedURLs:', String(e).slice(0, 120)); }
  let fb = null;
  if (blockOk) {
    fb = await T.eval("(async () => { const m = await import('/src/art/img.js');" +
      " const webp = location.origin + '/src/art/gen/aya.webp'; const im = new Image(); let errs = 0, first = '';" +
      " im.onerror = () => { errs++; if (m.onArtError(im, webp)) return; };" +
      " im.src = m.artUrl(webp); first = im.src;" +
      " const t0 = performance.now(); while (performance.now() - t0 < 8000) { if (im.complete && im.naturalWidth > 0) break; await new Promise((r) => setTimeout(r, 50)); }" +
      " const again = m.onArtError(im, webp);" +
      " return { first, finalSrc: im.currentSrc || im.src, nw: im.naturalWidth, errs, again }; })()");
    await T.send('Network.setBlockedURLs', { urls: [] });
    chk(!!fb && /\.avif$/.test(pn(fb.first)) && /\.webp$/.test(pn(fb.finalSrc)) && fb.nw > 0 && fb.errs === 1 && fb.again === false,
      'avif 加载失败时 onArtError 只回退一次到 .webp 并成功解码', JSON.stringify(fb));
  }

  /* ---------- 模式 B：?noavif=1 强制 WebP ---------- */
  await T.clearCollection();
  await T.boot({ query: '?nosw=1&noavif=1' });
  const titleWebp = await T.waitFor(
    "['title_bg.webp','reimu_title.webp','marisa_title.webp'].every(n => performance.getEntriesByType('resource').some(e => e.name.endsWith('/' + n)))", 20000);
  const bootDoneB = await T.waitFor(
    '!!(window.__boot && window.__boot.done) && !!window.__titleArt && window.__titleArt.every(i => i && i.complete && i.naturalWidth > 0)', 25000);
  const helperB = await T.eval("(async () => { const m = await import('/src/art/img.js');" +
    " const w = location.origin + '/src/art/gen/title_bg.webp';" +
    " return { enabled: m.isAvifEnabled(), url: m.artUrl(w), search: location.search }; })()");
  await T.eval("(() => { try { window.__game._skipTitleIntro?.(); } catch (e) {} return true; })()");
  await sleep(1200);
  const titleStateB = await T.eval('({ chars: (window.__titleArt || []).map(i => [i.src.split("/").pop(), i.complete, i.naturalWidth]) })');
  await T.shot(sh('07_title_noavif.png')); shots.push(sh('07_title_noavif.png'));
  const respAtTitleB = [...T.responses.values()];
  const titleBytesB = respBytes(respAtTitleB, isTitlePath);
  chk(titleWebp && bootDoneB, '?noavif=1 标题 3 张 .webp 已加载、开屏已揭幕', JSON.stringify(titleStateB));
  chk(titleStateB.chars.length === 3 && titleStateB.chars.every((c) => c[0].endsWith('.webp') && c[1] && c[2] > 0),
    '?noavif=1 标题立绘全部走 .webp 且解码成功', JSON.stringify(titleStateB.chars));
  chk(!!helperB && helperB.enabled === false && /\.webp$/.test(pn(helperB.url)), '?noavif=1 让 artUrl 返回 .webp', JSON.stringify(helperB));

  const dlgB = await T.eval("(async () => { const g = window.__game; g.char = 'reimu'; g.startGame();" +
    " for (let i = 0; i < 100 && !(g.dialogue && g.dialogue.active); i++) await new Promise((r) => setTimeout(r, 40));" +
    " for (let i = 0; i < 14; i++) { if (g.dialogue.leftChar || g.dialogue.rightChar) break;" +
    "  g.dialogue.advance(); await new Promise((r) => setTimeout(r, 50));" +
    "  g.dialogue.advance(); await new Promise((r) => setTimeout(r, 50)); }" +
    " await new Promise((r) => setTimeout(r, 900));" +
    " const pick = (id) => { const el = document.getElementById(id); const s = el && el.querySelector('img'); return s ? s.currentSrc || s.src : null; };" +
    " return { left: g.dialogue.leftChar, right: g.dialogue.rightChar, leftSrc: pick('portraitL'), rightSrc: pick('portraitR') }; })()");
  await T.shot(sh('08_dialogue_noavif.png')); shots.push(sh('08_dialogue_noavif.png'));
  const st1B = await T.eval("(async () => { const g = window.__game; try { g.dialogue?.stop?.(); } catch (e) {}" +
    " g._warpToStage(1); let s = g.stage;" +
    " for (let i = 0; i < 200; i++) { const lays = s._bgLayers && s._bgLayers['shrine']; if (lays && lays.filter(Boolean).length >= 2) break; await new Promise((r) => setTimeout(r, 50)); }" +
    " await new Promise((r) => setTimeout(r, 2000)); s = g.stage;" +
    " return { state: g.state, level: g.levelIndex, bgLayers: (s._bgLayers?.['shrine'] || []).filter(Boolean).length }; })()");
  await T.shot(sh('09_stage1_noavif.png')); shots.push(sh('09_stage1_noavif.png'));
  chk(!!(dlgB.left || dlgB.right), '?noavif=1 对白立绘正常', JSON.stringify(dlgB));
  chk(st1B.state === 'play' && st1B.bgLayers >= 2, '?noavif=1 第 1 面画面正常', JSON.stringify(st1B));

  const reportB = await T.report();
  const respB = [...T.responses.values()];
  const avifB = [...new Set(T.requests.map((r) => pn(r.url)))].filter((p) => /\.avif$/.test(p));
  // 静态 preload 读不到 ?noavif=1：index.html 的 3 条 avif preload 仍会发请求（预期）。
  // 除这 3 条外不允许任何 .avif，证明运行期取图确实全走 WebP。
  const preloadAvif = /href="\.\/src\/art\/gen\/(?:title_bg|reimu_title|marisa_title)\.avif"/.test(idxHtml)
    ? TITLES.map((t) => '/src/art/gen/' + t + '.avif') : [];
  const avifBStray = avifB.filter((p) => !preloadAvif.includes(p));
  chk(avifBStray.length === 0 && avifB.length <= preloadAvif.length,
    '?noavif=1 除静态 avif preload 外 0 个 .avif 请求', JSON.stringify({ avifB, preloadAvif }));
  chk(reportB.httpBad.length === 0, 'Network 无 4xx/5xx（模式 B）', JSON.stringify(reportB.httpBad.slice(0, 8)));
  chk(reportB.netFails.length === 0, '无 Network.loadingFailed（非取消，模式 B）', JSON.stringify(reportB.netFails.slice(0, 8)));
  chk(reportB.errors.length === 0, '无 console error / 异常（模式 B）', JSON.stringify(reportB.errors.slice(0, 6)));
  const fullBytesB = respBytes(respB, isImgPath);

  /* ---------- 模式 A2：模拟 Lead 改好 index.html 的首屏 ---------- */
  const idxLines = idxHtml.split('\n');
  const preloadIdx = [];
  idxLines.forEach((l, i) => { if (/rel="preload" as="image"/.test(l) && /(title_bg|reimu_title|marisa_title)\.(webp|avif)/.test(l)) preloadIdx.push(i); });
  const kept = idxLines.filter((_, i) => !preloadIdx.includes(i));
  const newPreloads = TITLES.map((t) => '  <link rel="preload" as="image" type="image/avif" href="./src/art/gen/' + t + '.avif" fetchpriority="high" />');
  const at = preloadIdx.length ? preloadIdx[0] : kept.findIndex((l) => /modulepreload:start/.test(l));
  kept.splice(at, 0, ...newPreloads);
  if (!/href="\.\/src\/art\/img\.js"/.test(idxHtml)) {
    const mp = kept.findIndex((l) => /modulepreload:start/.test(l));
    kept.splice(mp, 0, '  <link rel="modulepreload" href="./src/art/img.js" />', '  <link rel="modulepreload" href="./src/art/avif_manifest.js" />');
  }
  writeFileSync(TMP_PAGE, kept.join('\n'), 'utf8');
  let a2 = {};
  try {
    await T.clearCollection();
    await T.nav(BASE + '/' + TMP_PAGE + '?nosw=1');
    const okBoot = await T.waitFor('!!window.__game', 30000);
    await T.waitFor("['title_bg.avif','reimu_title.avif','marisa_title.avif'].every(n => performance.getEntriesByType('resource').some(e => e.name.endsWith('/' + n)))", 20000);
    const done2 = await T.waitFor('!!(window.__boot && window.__boot.done) && !!window.__titleArt && window.__titleArt.every(i => i && i.complete && i.naturalWidth > 0)', 25000);
    await T.eval("(() => { try { window.__game._skipTitleIntro?.(); } catch (e) {} return true; })()");
    await sleep(1000);
    await T.shot(sh('10_title_avif_preload.png')); shots.push(sh('10_title_avif_preload.png'));
    const resp2 = [...T.responses.values()];
    const titleBytes2 = respBytes(resp2, isTitlePath);
    const titleWebp2 = [...new Set(T.requests.map((r) => pn(r.url)))].filter((p) => /\/src\/art\/gen\/(?:title_bg|reimu_title|marisa_title)\.webp$/.test(p));
    const titleAvif2 = [...new Set([...T.responses.values()].filter((r) => r.status === 200 && TITLE_RE_SAFE(pn(r.url))).map((r) => pn(r.url)))];
    a2 = { boot: okBoot, done: done2, titleBytes: titleBytes2, titleAvif: titleAvif2, titleWebp: titleWebp2 };
    chk(okBoot && done2, 'A2（preload 改 avif 后）正常启动', JSON.stringify({ okBoot, done2 }));
    chk(titleAvif2.length === 3 && titleBytes2.n === 3, 'A2 首屏只有 3 张 .avif、无 webp 双下载', JSON.stringify({ avif: titleAvif2, bytes: titleBytes2 }));
    chk(titleWebp2.length === 0, 'A2 首屏 3 张 title webp 请求为 0', JSON.stringify(titleWebp2));
    const bad2 = (await T.report()).httpBad;
    chk(bad2.length === 0, 'A2 无 4xx/5xx', JSON.stringify(bad2.slice(0, 5)));
  } finally {
    try { rmSync(TMP_PAGE, { force: true }); } catch (e) {}
  }

  /* ---------- 汇总 ---------- */
  const shotRows = shots.map((f) => ({ file: f, bytes: existsSync(f) ? statSync(f).size : 0 }));
  chk(shotRows.every((s) => s.bytes > 20000), '场景截图全部生成', JSON.stringify(shotRows));
  const sum = { pass: rows.filter((r) => r.ok).length, fail: rows.filter((r) => !r.ok).length, rows };
  const firstScreen = rep.firstScreen || [];
  result = {
    base: BASE, cdpPort: CDP_PORT, generatedAt: new Date().toISOString(),
    assets: { total: images.length, converted: conv.length, skipped: skip.map((i) => ({ stem: i.stem, reason: i.reason })) },
    reportTotals: rep.totals,
    headBad: headBad.length, decoded: decoded.length, decodeBad: decodeBad.map((a) => a.url),
    networkA: { avif: avifResp.length, avifBad: avifBad.length, webp: webpReq, strayWebp, pngJpg, httpBad: reportA.httpBad, netFails: reportA.netFails, errors: reportA.errors },
    networkB: { avif: avifB, httpBad: reportB.httpBad, netFails: reportB.netFails, errors: reportB.errors },
    bytes: {
      titleImageBytesAvifMode: titleBytesA.bytes, titleImageBytesWebpMode: titleBytesB.bytes,
      titleImageBytesA2: a2.titleBytes ? a2.titleBytes.bytes : null,
      allImageBytesAvifMode: fullBytesA.bytes, allImageBytesWebpMode: fullBytesB.bytes,
      allImageCountAvifMode: fullBytesA.n, allImageCountWebpMode: fullBytesB.n,
    },
    fallbackProbe: fb, a2, shots: shotRows, checks: sum,
  };
  saveJson(RESULT_JSON, result);
  console.log('');
  console.log('[首屏标题 3 图字节] AVIF 模式(含旧 webp preload 双下载):', KiB(titleBytesA.bytes), 'KiB',
    '| WebP 模式:', KiB(titleBytesB.bytes), 'KiB',
    '| A2(preload 改好):', a2.titleBytes ? KiB(a2.titleBytes.bytes) : 'n/a', 'KiB');
  console.log('[全场景图片实收] AVIF 模式:', KiB(fullBytesA.bytes), 'KiB /', fullBytesA.n, '个 | WebP 模式:', KiB(fullBytesB.bytes), 'KiB /', fullBytesB.n, '个');
  console.log('[素材总量] 62 张 WebP', KiB(rep.totals.webpTotal), 'KiB -> 转换后', KiB(rep.totals.afterTotal), 'KiB，省',
    KiB(rep.totals.saved), 'KiB (' + (rep.totals.savedRatio * 100).toFixed(1) + '%)');
  console.log('[网络 A] avif 响应', avifResp.length, '；webp 请求', JSON.stringify(webpReq), '；4xx/5xx', reportA.httpBad.length, '；loadingFailed', reportA.netFails.length);
  console.log('[网络 B] avif 请求', JSON.stringify(avifB), '；4xx/5xx', reportB.httpBad.length, '；loadingFailed', reportB.netFails.length);
  console.log('[截图]', shotRows.map((s) => s.file + ' ' + (s.bytes / 1024).toFixed(0) + 'KB').join(' | '));
  console.log('');
  console.log('===== CHECKS ' + sum.pass + ' pass / ' + sum.fail + ' fail =====');
  for (const r of sum.rows) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : ' :: ' + r.detail));
  console.log('JSON:', RESULT_JSON);
  process.exitCode = sum.fail ? 1 : 0;
} finally {
  try { await T.close(); } catch (e) {}
}
