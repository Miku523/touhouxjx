/**
 * WebP 化验收：运行时资源检查 + 场景截图（headless Edge + CDP）
 *
 * 依赖同目录 _pt_core.mjs，以及本地静态服务：
 *   python tools/serve_nocache.py 8139
 *   PT_BASE=http://127.0.0.1:8139 node tools/_opt_art_check.mjs
 *
 *   1) 逐张 HEAD 校验 62 个 .webp：200 + image/webp + Content-Length == 报告字节数
 *   2) 标题页后把所有 .webp 用 new Image()+decode() 逐个解码，断言尺寸与报告一致
 *   3) 全程 CDP Network：0 个 4xx/5xx / 素材 404；除 4 图标外无 .png/.jpg 图片请求
 *   4) 截图（_pt/opt_art/）：01_title 02_dialogue 03_stage1 04_bg_moon 05_boss_flandre
 *
 * 参数：--port 9551  --out _pt/opt_art  --base http://127.0.0.1:8139
 * 退出码：0 = 全过；1 = 有 FAIL
 */
import { launch, saveJson } from './_pt_core.mjs';
import { readFileSync, existsSync, statSync } from 'node:fs';

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
const CDP_PORT = Number(argv.port || 9551);
const OUT_DIR = argv.out || '_pt/opt_art';
const BASE = argv.base || process.env.PT_BASE || 'http://127.0.0.1:8139';
const REPORT = 'tools/_opt/webp_report.json';
const RESULT_JSON = 'tools/_opt/webp_runtime_check.json';
const ICONS = ['/src/art/favicon.png', '/src/art/apple-touch-icon.png', '/src/art/pwa-192.png', '/src/art/pwa-512.png'];
const sh = (name) => OUT_DIR + '/' + name;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
const chk = (ok, name, detail = '') => { rows.push({ ok: !!ok, name, detail: String(detail).slice(0, 800) }); return !!ok; };
const log = (...a) => console.log(...a);

/* 1. 报告清单 */
const repTxt = readFileSync(REPORT, 'utf8').replace(/:\s*-?Infinity\b/g, ': null').replace(/:\s*NaN\b/g, ': null');
const rep = JSON.parse(repTxt);
const assets = rep.images.map((it) => ({
  path: it.webp.replace(/\\/g, '/'),
  url: '/' + it.webp.replace(/\\/g, '/').replace(/^\.?\//, ''),
  w: it.width, h: it.height, bytes: it.webp_bytes,
  orig: it.path.replace(/\\/g, '/'), origBytes: it.orig_bytes,
  category: it.category, mode: it.mode,
}));
log('[清单] 报告资产', assets.length, '个；报告 after 总字节', rep.totals.after);

const origMissing = assets.filter((a) => !existsSync(a.orig));
chk(assets.length === 62, '报告资产数 62', 'got ' + assets.length);
chk(origMissing.length === 0, '原图全部保留未删除', origMissing.map((a) => a.orig).join(', '));
chk(ICONS.every((p) => existsSync('.' + p)), '4 个应用图标仍为 PNG 且存在', ICONS.join(','));

/* 2. HTTP HEAD 校验 */
const head = [];
for (const a of assets) {
  try {
    const r = await fetch(BASE + a.url, { method: 'HEAD' });
    head.push({ url: a.url, status: r.status, type: r.headers.get('content-type'), len: Number(r.headers.get('content-length')), want: a.bytes });
  } catch (e) { head.push({ url: a.url, status: -1, type: '', len: -1, want: a.bytes, err: String(e) }); }
}
const headBad = head.filter((h) => h.status !== 200 || !/image\/webp/i.test(h.type || '') || h.len !== h.want);
chk(headBad.length === 0, 'HEAD 200/image-webp/字节数一致', JSON.stringify(headBad.slice(0, 5)));

/* 3. 浏览器 */
const T = await launch({ port: CDP_PORT, width: 1280, height: 720, url: 'about:blank' });
const shots = [];
let result = {};
try {
  await T.clearCollection();
  await T.boot();
  const titleLoaded = await T.waitFor(
    "['title_bg.webp','reimu_title.webp','marisa_title.webp'].every(n => performance.getEntriesByType('resource').some(e => e.name.endsWith('/' + n)))", 15000);
  /* 开屏 loading 走完（__boot.done）且 3 张标题图解码完成后再截，才看得到 reimu/marisa 标题立绘 */
  const bootDone = await T.waitFor(
    "!!(window.__boot && window.__boot.done) && !!window.__titleArt && window.__titleArt.every(i => i && i.complete && i.naturalWidth > 0)", 20000);
  await T.eval("(() => { try { window.__game._skipTitleIntro?.(); } catch (e) {} return true; })()");
  await sleep(1200);
  const titleArt = await T.eval("({ bootPct: window.__boot && window.__boot.pct, bootDone: !!(window.__boot && window.__boot.done)," +
    " chars: (window.__titleArt || []).map(i => [i.src.split('/').pop(), i.complete, i.naturalWidth])," +
    " introOn: !!window.__game._titleIntroOn," +
    " bootVisible: !!document.getElementById('boot') && getComputedStyle(document.getElementById('boot')).display !== 'none' })");
  await T.shot(sh('01_title.png')); shots.push(sh('01_title.png'));
  const titleState = await T.eval('({ state: window.__game.state, dpr: devicePixelRatio, w: innerWidth, h: innerHeight })');
  chk(titleLoaded, '标题页 3 张标题素材已加载', JSON.stringify(titleState));
  chk(bootDone && titleArt.chars.length === 3 && titleArt.chars.every((c) => c[1] && c[2] > 0) && !titleArt.bootVisible,
    '开屏结束且标题立绘就位', JSON.stringify(titleArt));
  /* 1b. marisa 标题立绘（标题页换角色，验证 marisa_title.webp 实际绘制） */
  const marisaArt = await T.eval("(() => { const g = window.__game; g.char = 'marisa'; g._skipTitleIntro?.();" +
    " try { g.render?.(0.016); } catch (e) {}" +
    " return { char: g.char, art: (window.__titleArt || []).map(i => [i.src.split('/').pop(), i.complete, i.naturalWidth]) }; })()");
  await sleep(900);
  await T.shot(sh('01b_title_marisa.png')); shots.push(sh('01b_title_marisa.png'));
  chk(marisaArt.char === 'marisa' && marisaArt.art.length === 3 && marisaArt.art.every((a) => a[1] && a[2] > 0),
    'marisa 标题立绘就位', JSON.stringify(marisaArt));

  /* 3.1 逐张 decode */
  const decoded = [];
  const decodeOne = (batch) => ' (async () => {' +
    ' const list = ' + JSON.stringify(batch) + ';' +
    ' const out = [];' +
    ' for (const it of list) {' +
    '  const im = new Image(); im.decoding = "async";' +
    '  const loaded = new Promise((res) => { im.onload = () => res("load"); im.onerror = () => res("error"); });' +
    '  const t0 = performance.now(); im.src = it.url;' +
    '  const st = await Promise.race([loaded, new Promise((r) => setTimeout(() => r("timeout"), 8000))]);' +
    '  let dec = false; try { await im.decode(); dec = true; } catch (e) { dec = String((e && e.name) || e); }' +
    '  out.push({ url: it.url, st, dec, nw: im.naturalWidth, nh: im.naturalHeight, ms: Math.round(performance.now() - t0) });' +
    ' }' +
    ' return out;' +
    ' })()';
  for (let i = 0; i < assets.length; i += 10) {
    const batch = assets.slice(i, i + 10).map((a) => ({ url: a.url }));
    decoded.push(...(await T.eval(decodeOne(batch))));
  }
  const decodeByUrl = new Map(decoded.map((d) => [d.url, d]));
  const decodeBad = assets.filter((a) => {
    const d = decodeByUrl.get(a.url);
    return !d || d.st !== 'load' || d.dec !== true || d.nw !== a.w || d.nh !== a.h;
  });
  chk(decodeBad.length === 0, '62 张 webp 全部 decode 成功且尺寸一致',
    JSON.stringify(decodeBad.slice(0, 8).map((a) => ({ url: a.url, want: [a.w, a.h], got: decodeByUrl.get(a.url) }))));
  const decodeMs = decoded.reduce((s, d) => s + (d.ms || 0), 0);
  log('[decode]', decoded.length, '张，累计', decodeMs, 'ms，失败', decodeBad.length);

  /* 3.2 开场对白立绘 */
  const dlg = await T.eval("(async () => { const g = window.__game; g.char = 'reimu'; g.startGame();" +
    " for (let i = 0; i < 100 && !(g.dialogue && g.dialogue.active); i++) await new Promise((r) => setTimeout(r, 40));" +
    " for (let i = 0; i < 14; i++) { if (g.dialogue.leftChar || g.dialogue.rightChar) break;" +
    "  g.dialogue.advance(); await new Promise((r) => setTimeout(r, 50));" +
    "  g.dialogue.advance(); await new Promise((r) => setTimeout(r, 50)); }" +
    " await new Promise((r) => setTimeout(r, 900));" +
    " return { active: !!(g.dialogue && g.dialogue.active), index: g.dialogue.index, speaker: g.dialogue.speaker," +
    "  left: g.dialogue.leftChar, right: g.dialogue.rightChar," +
    "  portraitRActive: !!document.getElementById('portraitR')?.parentElement?.classList.contains('active')," +
    "  portraitLActive: !!document.getElementById('portraitL')?.parentElement?.classList.contains('active') }; })()");
  await T.shot(sh('02_dialogue.png')); shots.push(sh('02_dialogue.png'));
  chk(!!(dlg.left || dlg.right), '对白页出现立绘', JSON.stringify(dlg));

  /* 3.3 第 1 面 */
  const st1 = await T.eval("(async () => { const g = window.__game; try { g.dialogue?.stop?.(); } catch (e) {}" +
    " g._warpToStage(1); let s = g.stage;" +
    " for (let i = 0; i < 200; i++) { const lays = s._bgLayers && s._bgLayers['shrine']; if (lays && lays.filter(Boolean).length >= 2) break; await new Promise((r) => setTimeout(r, 50)); }" +
    " await new Promise((r) => setTimeout(r, 2600)); s = g.stage;" +
    " return { state: g.state, level: g.levelIndex, theme: s.level.theme, mode: s.mode," +
    "  bgLayers: (s._bgLayers?.['shrine'] || []).filter(Boolean).length, enemies: s.enemies?.list?.length ?? null, fps: +(g.loop?.fps || 0).toFixed(1) }; })()");
  await T.shot(sh('03_stage1.png')); shots.push(sh('03_stage1.png'));
  chk(st1.state === 'play' && st1.level === 0 && st1.bgLayers >= 2, '第 1 面实机画面', JSON.stringify(st1));

  /* 3.4 moon 背景 */
  const bgMoon = await T.eval("(async () => { const g = window.__game; try { g.dialogue?.stop?.(); } catch (e) {}" +
    " g._warpToStage(6); let s = g.stage;" +
    " for (let i = 0; i < 240; i++) { const lays = s._bgLayers && s._bgLayers['moon']; if (lays && lays.filter(Boolean).length >= 2) break; await new Promise((r) => setTimeout(r, 50)); }" +
    " for (const hid of ['hud', 'banner']) { const el = document.getElementById(hid); if (el) el.style.display = 'none'; }" +
    " await new Promise((r) => setTimeout(r, 1400)); s = g.stage;" +
    " return { state: g.state, level: g.levelIndex, theme: s.level.theme, bgLayers: (s._bgLayers?.['moon'] || []).filter(Boolean).length, cameraX: Math.round(s.camera?.x ?? 0) }; })()");
  await T.shot(sh('04_bg_moon.png')); shots.push(sh('04_bg_moon.png'));
  chk(bgMoon.level === 5 && bgMoon.theme === 'moon' && bgMoon.bgLayers >= 2, 'moon 背景画面', JSON.stringify(bgMoon));

  /* 3.5 EXTRA 芙兰 Boss 立绘 */
  const boss = await T.eval("(async () => { const g = window.__game; try { g.dialogue?.stop?.(); } catch (e) {}" +
    " g.extraChar = 'reimu'; g.char = 'reimu'; g.musicOn = false;" +
    " for (const hid of ['hud', 'banner']) { const el = document.getElementById(hid); if (el) el.style.display = 'none'; }" +
    " g._startExtraStage({ chainFrom: 3 }); let artErr = null;" +
    " try { const m = await import('/src/art/genboss.js'); await m.ensureBossArt('flandre'); } catch (e) { artErr = String(e); }" +
    " const s = g.stage; const upd = g.update.bind(g); g.update = () => {}; const p = s.player;" +
    " if (p) { p.invuln = 999; p.alive = true; }" +
    " for (let i = 0; i < 300; i++) { try { upd(1 / 60); } catch (e) { break; } if (p && i % 20 === 0) p.invuln = 999; }" +
    " for (let i = 0; i < 3; i++) g.render(0.5); const b = s.boss;" +
    " return { artErr, mode: s.mode, chainIdx: s.chainIdx," +
    "  boss: b ? { key: b.key, state: b.state, hp: Math.round(b.hp), maxHp: b.maxHp, cards: b.cards?.length ?? null } : null," +
    "  bullets: s.bullets?.length ?? null, shots: s.shots?.length ?? null," +
    "  player: p ? { x: Math.round(p.x), y: Math.round(p.y), alive: !!p.alive } : null }; })()");
  await sleep(150);
  await T.shot(sh('05_boss_flandre.png')); shots.push(sh('05_boss_flandre.png'));
  chk(!!(boss.boss && boss.boss.key === 'flandre') && !boss.artErr, 'EXTRA 芙兰 Boss 战斗立绘', JSON.stringify(boss));

  /* 4. 网络汇总 */
  const pn = (u) => { try { return new URL(u).pathname; } catch { return u; } };
  const report = await T.report();
  const resp = [...T.responses.values()];
  const respByPath = new Map();
  for (const r of resp) respByPath.set(pn(r.url), { status: r.status, mime: r.mime });
  const asset404 = assets.filter((a) => { const r = respByPath.get(a.url); return !r || r.status !== 200; });
  chk(asset404.length === 0, '全部 62 个 webp 在浏览器里 200', JSON.stringify(asset404.slice(0, 8).map((a) => a.url)));

  const imgReq = [...new Set(T.requests.filter((r) => /\.(webp|png|jpe?g)(?:$|[?#])/i.test(r.url)).map((r) => pn(r.url)))];
  const pngJpg = imgReq.filter((u) => /\.(png|jpe?g)$/i.test(u));
  const strayPngJpg = pngJpg.filter((u) => !ICONS.includes(u));
  chk(strayPngJpg.length === 0, '除 4 个图标外无 .png/.jpg 图片请求', JSON.stringify(strayPngJpg));

  const badAny = report.httpBad;
  chk(badAny.length === 0, 'Network 无 4xx/5xx', JSON.stringify(badAny.slice(0, 8)));
  const nf = report.netFails;
  chk(nf.length === 0, '无 Network.loadingFailed（非取消）', JSON.stringify(nf.slice(0, 8)));

  const webpEntries = new Map();
  for (const e of report.resources || []) {
    if (!/\.webp(\?|$)/.test(e.n)) continue;
    const name = e.n.split('/').slice(-1)[0];
    webpEntries.set(name, Math.max(webpEntries.get(name) || 0, e.s || 0));
  }
  const webpBytesLoaded = [...webpEntries.values()].reduce((a, b) => a + b, 0);
  const shotRows = shots.map((f) => ({ file: f, bytes: existsSync(f) ? statSync(f).size : 0 }));
  chk(shotRows.every((s) => s.bytes > 20000), '场景截图全部生成', JSON.stringify(shotRows));

  const sum = { pass: rows.filter((r) => r.ok).length, fail: rows.filter((r) => !r.ok).length, rows };
  result = { base: BASE, cdpPort: CDP_PORT, generatedAt: new Date().toISOString(), assets: assets.length,
    reportTotals: rep.totals, headBad: headBad.length, decoded: decoded.length, decodeBad: decodeBad.map((a) => a.url),
    network: { respCount: resp.length, bad: badAny, netFails: nf, pngJpg, strayPngJpg, imgReqCount: imgReq.length },
    webpBytesLoadedUnique: webpBytesLoaded, titleState, dlg, st1, bgMoon, boss, shots: shotRows, checks: sum };
  saveJson(RESULT_JSON, result);
  console.log('');
  console.log('[场景] 标题:', JSON.stringify(titleState));
  console.log('[场景] 对白:', JSON.stringify(dlg));
  console.log('[场景] 第1面:', JSON.stringify(st1));
  console.log('[场景] moon:', JSON.stringify(bgMoon));
  console.log('[场景] 芙兰:', JSON.stringify(boss));
  console.log('[网络] 图片请求', imgReq.length, '个；png/jpg =', JSON.stringify(pngJpg), '；4xx/5xx =', badAny.length, '；loadingFailed =', nf.length);
  console.log('[网络] webp 去重实收', webpBytesLoaded, 'bytes');
  console.log('[截图]', shotRows.map((s) => s.file + ' ' + (s.bytes / 1024).toFixed(0) + 'KB').join(' | '));
  console.log('');
  console.log('===== CHECKS ' + sum.pass + ' pass / ' + sum.fail + ' fail =====');
  for (const r of sum.rows) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : ' :: ' + r.detail));
  console.log('JSON:', RESULT_JSON);
  process.exitCode = sum.fail ? 1 : 0;
} finally {
  try { await T.close(); } catch (e) {}
}