/**
 * 基线探针：启动 → 标题 → 真键盘开一局 E/灵梦 → 跳过开场对话 → 实战 6 秒 → 暂停/恢复
 * 输出：_pt/boot/report.json + 截图
 */
import { launch, sleep, snapshot, installFrameProbe, readFrameProbe, saveJson, makeChecks } from './_pt_core.mjs';

const OUT = '_pt/boot';
const T = await launch({ port: 9401 });
const C = makeChecks();
const t0 = Date.now();
try {
  // ---------- 1. 冷启动 ----------
  await T.nav();
  const booted = await T.waitFor('!!window.__game', 30000);
  C.chk(booted, '冷启动：window.__game 出现');
  const titleRevealed = await T.waitFor('document.getElementById("boot")?.classList.contains("done")', 15000);
  const tTitle = Date.now() - t0;
  C.chk(titleRevealed, '启动幕在 15s 内揭幕', `title at ${tTitle}ms`);
  await sleep(700);
  const nav = await T.eval(`(() => { const n = performance.getEntriesByType('navigation')[0]; const rs = performance.getEntriesByType('resource');
    return { domReady: +(n?.domContentLoadedEventEnd||0).toFixed(0), load: +(n?.loadEventEnd||0).toFixed(0), resources: rs.length,
      bytes: rs.reduce((a,e)=>a+(e.transferSize||0),0), slow: rs.filter(e=>e.duration>800).map(e=>({u:e.name.split('/').slice(-2).join('/'),d:Math.round(e.duration)})) }; })()`);
  await T.shot(OUT + '/01-title.png');
  const titlePix = await T.eval(`(() => { const c=document.getElementById('game'); const x=c.getContext('2d'); const d=x.getImageData(0,0,c.width,c.height).data;
    let sum=0; for(let i=0;i<d.length;i+=4000) sum+=d[i]+d[i+1]+d[i+2]; return sum; })()`);
  C.chk(titlePix > 100000, '标题画面 canvas 有实际绘制内容', `sum=${titlePix}`);
  C.chk(!T.errors.length, '冷启动无 JS 错误', T.errors.join(' || '));
  const bad404 = T.httpBad.filter((h) => h.status === 404);
  C.chk(bad404.length === 0, '冷启动无 404 资源', bad404.map((b) => b.status + ' ' + b.url).join(' || '));

  // ---------- 2. 真键盘：标题 → 难度 → 主角 ----------
  await T.key('Enter');
  const diffShown = await T.waitFor('document.getElementById("title")?.textContent === "选择难度"', 3000);
  C.chk(diffShown, '标题 Enter 进入难度选择');
  await T.shot(OUT + '/02-difficulty.png');
  await T.key('KeyE');
  await T.waitFor('document.getElementById("title")?.textContent === "选择主角"', 3000);
  const charShown = await T.eval('document.getElementById("title")?.textContent');
  C.eq(charShown, '选择主角', 'E 键进入选人');
  await T.key('Digit1');
  const started = await T.waitFor('!!window.__game.stage || window.__game.dialogue.active || window.__game.state === "play"', 4000);
  C.chk(started, '选人后进入游戏（对话或 play）');
  await sleep(300);

  // ---------- 3. 跳过开场对话 ----------
  let skipped = 0;
  for (let i = 0; i < 40; i++) {
    const active = await T.eval('window.__game.dialogue.active');
    if (!active) break;
    await T.key('Enter', 20);
    skipped++;
    await sleep(120);
  }
  const st1 = await snapshot(T);
  C.chk(!st1.dialogue, '开场对话可推进并结束', `keys=${skipped}`);
  C.eq(st1.state, 'play', '对话结束进入 play', JSON.stringify(st1));
  C.eq(st1.level, 0, '从第 1 关开始');
  C.eq(st1.diff, 'E', '难度 E 生效');
  C.eq(st1.char, 'reimu', '角色灵梦生效');
  await sleep(400);
  await T.shot(OUT + '/03-stage1.png');

  // ---------- 4. 实战：按住 → + 射击 6 秒 ----------
  await installFrameProbe(T);
  const x0 = (await snapshot(T)).px;
  await T.keyDown('ArrowRight');
  await T.keyDown('KeyZ');
  await sleep(3000);
  // 跳两次
  await T.key('Space');
  await sleep(1800);
  await T.key('Space');
  await sleep(1200);
  await T.keyUp('KeyZ');
  await T.keyUp('ArrowRight');
  await sleep(300);
  const st2 = await snapshot(T);
  const fp = await readFrameProbe(T);
  C.chk(st2.px > x0 + 60, '按住 → 角色前进', `x ${x0} -> ${st2.px}`);
  C.chk(st2.px > 0 && Number.isFinite(st2.px), '坐标无 NaN/越界');
  C.chk(fp.avg < 25, '实战 6s 平均帧间隔 < 25ms', JSON.stringify(fp));
  saveJson(OUT + '/frames-stage1.json', fp);
  await T.shot(OUT + '/04-stage1-run.png');

  // ---------- 5. 暂停 / 恢复 ----------
  await T.key('Escape');
  await sleep(400);
  const paused = await T.eval('window.__game.state');
  C.eq(paused, 'paused', 'Esc 进入暂停');
  await T.shot(OUT + '/05-pause.png');
  const pmTitle = await T.eval('document.getElementById("title")?.textContent');
  C.chk(!!pmTitle, '暂停面板有标题', pmTitle);
  await T.key('Escape');
  await sleep(400);
  const resumed = await T.eval('window.__game.state');
  C.eq(resumed, 'play', '暂停再 Esc 恢复 play');
  await T.shot(OUT + '/06-resume.png');

  // ---------- 汇总 ----------
  const rep = await T.report({ checks: C.sum(), tTitleMs: tTitle, nav, stage: st2, frames: fp, skipped });
  saveJson(OUT + '/report.json', rep);
  console.log(JSON.stringify({ checks: C.sum(), tTitle, nav, stage: st2, frames: fp, errors: T.errors }, null, 2));
} catch (e) {
  const rep = await T.report({ checks: C.sum(), fatal: String(e && e.stack || e) }).catch(() => ({ fatal: String(e) }));
  saveJson(OUT + '/report.json', rep);
  console.error('FATAL', e);
  console.log(JSON.stringify({ checks: C.sum(), errors: T.errors, fatal: String(e) }, null, 2));
  process.exitCode = 1;
} finally {
  await T.close();
}
