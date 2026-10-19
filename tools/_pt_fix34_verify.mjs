/**
 * 修复34 验收：画质档位（设置页 自动/高/低 + 当前渲染只读行）
 *          + 首帧尖峰（音频上下文预热 / 弹幕精灵预热 / 首帧跳过后处理）
 *
 *   node tools/_pt_fix34_verify.mjs [--gpu 1] [--out _pt/fix34/verify-gpu.json]
 *
 * 产出：_pt/fix34/verify-*.json + _pt/fix34/shots/*.png
 */
import { launchCfg, saveJson, sleep } from './_pt_perf_lib.mjs';

const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  if (eq > 0) { argv[a.slice(2, eq)] = a.slice(eq + 1); continue; }
  const key = a.slice(2);
  if (i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--')) argv[key] = process.argv[++i];
  else argv[key] = '1';
}
const gpu = argv.gpu !== '0' && argv.gpu !== 'false';
const outFile = argv.out || `_pt/fix34/verify-${gpu ? 'gpu' : 'soft'}.json`;

const checks = [];
const chk = (ok, name, detail) => {
  checks.push({ ok: !!ok, name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}` + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
};

const T = await launchCfg({ gpu, width: 1280, height: 720, dsf: 1 });
const rec = { generatedAt: new Date().toISOString(), gpu };
try {
  await T.boot();
  // 模拟真实玩家在标题页停留：等两条预热都跑完（软件光栅下弱机会晚一些）
  await T.waitFor('window.__prewarmInfo && window.__prewarmInfo.spritesDone === true', 20000);
  await sleep(200);

  /* ---------- 阶段 0：手势之前 ---------- */
  let ri = await T.eval('window.__rendererInfo');
  chk(ri && ri.quality === 'auto', 'V1 默认画质=自动（__rendererInfo.quality）', {
    quality: ri.quality, picked: ri.qualityPicked, label: ri.qualityLabel,
  });
  const info0 = await T.eval('window.__game.renderer.qualityInfo()');
  chk(info0.quality === 'auto' && /软件光栅|GPU 加速/.test(info0.detail), 'V2 qualityInfo() 给出硬件与档位描述', info0);

  const aud = await T.eval(`(() => {
    const a = window.__game.audio;
    return { ctx: !!a.ctx, state: a.ctx && a.ctx.state, prewarm: window.__prewarmInfo || null };
  })()`);
  // 无手势窗口里 ctx 已经存在 = 预热成功（headless 带 --autoplay-policy 时状态就是 running；
  // 真实浏览器里会是 suspended，等第一次手势 resume）
  chk(aud.ctx && !!aud.prewarm && Number.isFinite(aud.prewarm.audio),
    'V3 音频上下文已在空闲帧预热（第一个手势之前就绪）', aud);

  const warm = await T.eval(`(async () => {
    const m = await import('/src/game/bullets.js');
    return m.prewarmSpriteCache({ budgetMs: 200 });
  })()`);
  chk(warm.done && warm.baked === 0, 'V4 常见弹幕精灵变体已预热（再烤 0 张）', warm);

  /* ---------- 阶段 1：第一次按键 ---------- */
  await T.eval(`(() => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {} return 1; })()`);
  await T.key('Enter');            // 标题 → 选择难度（游戏第一次用户手势）
  await sleep(900);
  const long1 = await T.eval('window.__long.slice()');
  rec.firstKey = { long: long1 };
  if (gpu) {
    chk(!long1.some((d) => d >= 50), 'V5 首次按键不再有 ≥50ms 长任务（旧版 114ms）', long1);
  } else {
    chk(true, 'V5(soft) 首次按键长任务仅记录（WARP 伪影，见 perf PF-1/PF-3）', long1);
  }
  const aud2 = await T.eval('(() => { const a = window.__game.audio; return { state: a.ctx && a.ctx.state }; })()');
  chk(aud2.state === 'running', 'V6 手势后音频恢复 running', aud2);
  const pageDiff = await T.eval(`document.getElementById('title')?.textContent`);
  chk(pageDiff === '选择难度', 'V7 Enter 正常打开难度页', pageDiff);

  /* ---------- 阶段 2：设置页画质 ---------- */
  await T.key('Escape'); await sleep(420);  // 回标题
  await T.key('KeyS'); await sleep(420);    // 标题 → 设置页
  const page = await T.eval(`(() => ({
    title: document.getElementById('title')?.textContent,
    labels: [...document.querySelectorAll('#buttons .set-row .set-label')].map((e) => e.textContent),
    segs: [...document.querySelectorAll('#buttons .set-row .seg')].map((e) => e.querySelector('b.on')?.textContent),
    info: [...document.querySelectorAll('#buttons .set-row.info .set-ctl')].map((e) => e.textContent.trim()),
    n: document.querySelectorAll('#buttons .btn').length,
  }))()`);
  chk(page.labels.includes('画质'), 'V8 设置页出现「画质」行', page.labels);
  chk(page.n === 13, 'V9 设置页 13 行（含画质与当前渲染）', page.n);
  chk(page.segs[0] === '自动', 'V10 画质分段控件默认高亮自动', page.segs);
  chk(page.info.length === 1 && /软件光栅|GPU 加速/.test(page.info[0]), 'V11 只读行显示当前渲染模式', page.info);
  await T.shot('_pt/fix34/shots/quality-auto.png');

  await T.key('KeyG'); await sleep(380);   // 自动 → 高
  ri = await T.eval('window.__rendererInfo');
  chk(ri.quality === 'high' && ri.postLevel === 2 && ri.bloom === true, 'V12 G → 高画质（后期全开）', ri);
  const segHigh = await T.eval(`document.querySelectorAll('#buttons .set-row .seg')[0].querySelector('b.on')?.textContent`);
  chk(segHigh === '高', 'V13 高画质 UI 高亮', segHigh);
  await T.shot('_pt/fix34/shots/quality-high.png');

  await T.key('KeyG'); await sleep(380);   // 高 → 低
  ri = await T.eval('window.__rendererInfo');
  chk(ri.quality === 'low' && ri.postLevel === 0 && ri.bloom === false, 'V14 G → 低画质（后期全关）', ri);
  chk(ri.backing <= 1.25 + 1e-6, 'V15 低画质 backing ≤1.25×', ri.backing);
  await T.shot('_pt/fix34/shots/quality-low.png');
  const stored = await T.eval(`(() => { try { return JSON.parse(localStorage.getItem('hks.settings.v1')).quality; } catch (e) { return 'ERR'; } })()`);
  chk(stored === 'low', 'V16 画质写盘 hks.settings.v1', stored);

  await T.key('KeyG'); await sleep(320);   // 低 → 自动
  ri = await T.eval('window.__rendererInfo');
  chk(ri.quality === 'auto', 'V17 轮换闭合回自动', ri.quality);
  await T.key('Escape'); await sleep(450); // 回标题

  /* ---------- 阶段 3：真实开一局 ---------- */
  await T.eval(`(() => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {} return 1; })()`);
  await T.key('Enter');
  await T.waitFor('document.getElementById("title")?.textContent === "选择难度"', 6000);
  await T.key('KeyH');                       // 明日行
  await T.waitFor('document.getElementById("title")?.textContent === "选择主角"', 6000);
  await T.key('Digit1');                     // 灵梦 → 开局（开场对话先播）
  await T.waitFor('!!window.__game.stage || window.__game.state === "play" || !!window.__game.dialogue.active', 8000);
  for (let i = 0; i < 60; i++) {
    const active = await T.eval('!!window.__game.dialogue.active').catch(() => false);
    if (!active) break;
    await T.key('Enter', 20);
    await sleep(140);
  }
  await T.waitFor('window.__game.state === "play" && !!window.__game.stage', 8000);
  await sleep(600);
  const st = await T.eval('(() => ({ state: window.__game.state, hasStage: !!window.__game.stage, stage: window.__game.stage && window.__game.stage.index }))()');
  const long2 = await T.eval('window.__long.slice()');
  rec.stageStart = { play: st, long: long2 };
  chk(st.state === 'play' && st.hasStage, 'V18 真实进入关卡（play + stage）', st);
  if (gpu) {
    chk(!long2.some((d) => d >= 80), 'V19 进关卡 / 首帧没有 ≥80ms 长任务', long2);
  } else {
    chk(true, 'V19(soft) 进关卡长任务仅记录（WARP 合成伪影）', long2);
  }
  await T.shot('_pt/fix34/shots/stage-start.png');

  rec.frameMs = await T.eval(`(async () => {
    const g = window.__game; const out = [];
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const t = performance.now(); g.render(0.5); out.push(performance.now() - t);
    }
    out.sort((a, b) => a - b);
    return { median: +out[Math.floor(out.length / 2)].toFixed(2), worst: +out[out.length - 1].toFixed(2) };
  })()`);
  chk(rec.frameMs.median < 20, 'V20 游戏中单帧渲染 <20ms', rec.frameMs);

  rec.consoleErrors = T.errors.slice(0, 5);
  chk(T.errors.length === 0, 'V21 无 JS 异常', T.errors.slice(0, 3));
} catch (e) {
  rec.error = String((e && e.stack) || e).slice(0, 1200);
  chk(false, 'V0 脚本执行完成', rec.error);
} finally {
  rec.checks = checks;
  rec.pass = checks.filter((c) => c.ok).length;
  rec.total = checks.length;
  saveJson(outFile, rec);
  console.log(`\n[verify] ${rec.pass}/${rec.total} passed → ${outFile}`);
  await T.close().catch(() => {});
}
