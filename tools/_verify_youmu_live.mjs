// STAGE5 妖梦 midboss 浏览器实机冒烟（独立 headless Edge + 本地静态服务器）
// 用法: node tools/_verify_youmu_live.mjs [port]
// 验证链：跑图触发 → 妖梦中涂战（3 卡）→ midbossClear → 呼吸区 → 幽幽子 → 收起
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] || 8137);
const W = 1280;
const H = 720;
const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const EDGE = EDGE_CANDIDATES.find((p) => existsSync(p));
const DBG_PORT = 9336;
const profile = mkdtempSync(join(tmpdir(), 'edge-youmu-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = [];
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fail.push(msg); };

const server = spawn(process.execPath, ['tools/_static_server.mjs', String(PORT)], { stdio: 'ignore' });
await sleep(700);
if (!EDGE) throw new Error('找不到 Edge');
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`, `--remote-debugging-port=${DBG_PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DBG_PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

let ws;
try {
  const page = await getTarget();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
    return r.result?.value;
  };
  const shot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(s.data, 'base64'));
    console.log('  IMG', file);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?live=${Date.now()}` });

  let booted = false;
  for (let i = 0; i < 100; i++) { booted = await ev('!!window.__game'); if (booted) break; await sleep(150); }
  if (!booted) throw new Error('game did not boot');
  await ev(`window.__errs=[];addEventListener('error',e=>__errs.push('error: '+e.message));addEventListener('unhandledrejection',e=>__errs.push('reject: '+(e.reason&&e.reason.message||e.reason)));1`);

  // ---- 进 STAGE5 ----
  await ev(`(()=>{const g=__game;g.startStage(4,{skipIntro:true});g.state='play';g.dialogue?.close?.();return 1})()`);
  for (let i = 0; i < 40; i++) { if (await ev('!!(__game.stage&&__game.stage.level)')) break; await sleep(150); }

  const meta = await ev(`(()=>{const s=__game.stage;return JSON.stringify({mode:s.mode,boss:s.level.boss,mid:!!s.midbossCfg,midKey:s.midbossCfg&&s.midbossCfg.key,w:s.level.w,ground:s.level.gen.ground,rows:s.level.gen.rows})})()`);
  const M = JSON.parse(meta);
  console.log('  META', meta);
  ok(M.mode === 'platform' && M.boss === 'yuyuko', 'STAGE5 是平台关、关底仍是 yuyuko');
  ok(M.mid && M.midKey === 'youmu', '关卡挂上了 midboss 配置（key=youmu）');

  // ---- 把玩家放到妖梦舞台内（触发线以内），让真实触发逻辑自己跑 ----
  const armed = await ev(`(()=>{
    const g=__game,s=g.stage,p=s.player;
    const floorY=s.level.gen.ground*32;
    p.alive=true;p.hearts=999;p.invuln=9999;p.vx=0;p.vy=0;
    p.x=s.level.w-5200; p.y=floorY-p.h-2;
    g.state='play';s.state='play';
    for(let i=0;i<8;i++)g.update(1/60);
    return JSON.stringify({pending:s.bossPending,started:s.bossStarted,px:Math.round(p.x),midDone:s.midbossDone});
  })()`);
  const A = JSON.parse(armed);
  console.log('  TRIGGER', armed);
  ok(A.pending === true || A.started === true, '越过触发线后 Boss 被排队（bossPending）');

  const queued = await ev(`(()=>{const s=__game.stage;return JSON.stringify({key:s.pendingBossKey,mid:s.pendingBossMid,done:s.midbossDone})})()`);
  const Q = JSON.parse(queued);
  ok(Q.key === 'youmu' && Q.mid === true && Q.done === false, `排队的是中途 Boss youmu（实际 key=${Q.key} mid=${Q.mid}）`);

  // ---- 真实登场（走 beginBoss，读 pendingBoss*）----
  const started = await ev(`(()=>{
    const g=__game,s=g.stage;
    g.dialogue?.close?.(); g.state='play'; s.state='play';
    s.beginBoss();
    return JSON.stringify({started:s.bossStarted,key:s.boss&&s.boss.key,mid:s.bossMid,bx:Math.round(s.boss.x),state:s.boss.state,
      name:s.boss.def.name,title:s.boss.def.title,cards:s.boss.def.phases.map(p=>p.name)});
  })()`);
  const S = JSON.parse(started);
  console.log('  BOSS', started);
  ok(S.key === 'youmu' && S.mid === true, '妖梦以 midboss 身份登场');
  ok(S.name === '魂魄妖梦' && S.title === '半人半灵的庭师', '名字/称号正确');
  ok(S.bx === M.w - 4600, '登场站位在舞台中心（w-4600）');
  ok(Array.isArray(S.cards) && S.cards.length === 3, `三张符卡（${S.cards && S.cards.join(' / ')}）`);

  // 让镜头追上并跑出第一张卡
  await ev(`(()=>{const g=__game;for(let i=0;i<150;i++)g.update(1/60);g.render(0);return 1})()`);
  await shot('tools/_live_youmu_1.png');

  // ---- 依次推卡，各截一张 ----
  const seen = [];
  for (let k = 0; k < 3; k++) {
    const info = await ev(`(()=>{
      const g=__game,s=g.stage,b=s.boss;
      let guard=0;
      while(b.state!=='battle'&&guard++<600){g.update(1/60);}
      // 打到当前 phase 剩 42%，等弹幕铺开
      if(b.state==='battle')b.damage(b.hp*0.58);
      for(let i=0;i<260;i++)g.update(1/60);
      g.render(0);
      return JSON.stringify({state:b.state,phase:b.phase,phaseName:b.phaseName,pat:b.patternIdx,hp:Math.round(b.hp),bullets:s.bullets.activeCount,
        phantom:!!b.phantom,phX:b.phantom&&Math.round(b.phantom.x),phY:b.phantom&&Math.round(b.phantom.y),slot:Math.round(b.phantom&&b.phantom.slot)});
    })()`);
    const I = JSON.parse(info);
    console.log(`  CARD${k + 1}`, info);
    seen.push(I);
    await shot(`tools/_live_youmu_${k + 2}.png`);
  }
  ok(seen.some((s) => s.bullets > 0), '妖梦确实在发弹');
  ok(seen.every((s) => s.phantom === true), '半灵实体全程存在');

  // ---- 断灵槽 + 半灵消散 ----
  const slot = await ev(`(()=>{
    const g=__game,s=g.stage,b=s.boss,ph=b.phantom;
    const before={gauge:Math.round(ph.gauge),gaugeMax:ph.gaugeMax};
    let n=0;
    while(n++<400&&!(ph.dissipateT>0)){
      // 一帧一次命中（引擎有「每帧涨幅 ≤10」的上限，正好验证它）
      b._onPhantomHit(4, ph.x, ph.y, null);
      g.update(1/60);
    }
    return JSON.stringify({before,gauge:Math.round(ph.gauge),breaks:ph.breaks,dissipateT:+ph.dissipateT.toFixed(2),
      fade:+ph.fade.toFixed(2),shotK:b.phantomShotK,slowK:b.phantomSlowK,vulnK:b.phantomVulnK,ixBreak:b._ix.phantomBreak});
  })()`);
  const SL = JSON.parse(slot);
  console.log('  PHANTOM', slot);
  ok(SL.before.gaugeMax === 100, '断灵槽上限 100');
  ok(SL.breaks >= 1 && SL.dissipateT > 0, '打满断灵槽触发「半灵消散」');
  ok(SL.shotK === 0.5 && SL.slowK === 0.55 && SL.vulnK === 1.35, '消散期间发弹/移速/易伤倍率生效');

  const afterDiss = await ev(`(()=>{const g=__game,s=g.stage,b=s.boss,ph=b.phantom;for(let i=0;i<420;i++)g.update(1/60);return JSON.stringify({dissipateT:+ph.dissipateT.toFixed(2),fade:+ph.fade.toFixed(2),gauge:Math.round(ph.gauge),shotK:b.phantomShotK})})()`);
  const AD = JSON.parse(afterDiss);
  console.log('  PHANTOM_BACK', afterDiss);
  ok(AD.dissipateT === 0 && AD.shotK === 1 && AD.fade > 0.9, '消散结束后半灵恢复（槽清零、淡入、发弹恢复）');

  // ---- 击破妖梦 → midbossClear → 呼吸区 → 幽幽子 ----
  const kill = await ev(`(()=>{
    const g=__game,s=g.stage,b=s.boss;
    let guard=0;
    while(b.state!=='dead'&&guard++<40000){
      if(b.state==='battle')b.damage(b.maxHp);
      g.update(1/60);
    }
    for(let i=0;i<200;i++)g.update(1/60);
    return JSON.stringify({dead:b.state==='dead',midDone:s.midbossDone,midClearX:Math.round(s._midClearX),midClearT:+s._midClearT.toFixed(2),bossNull:s.boss===null,state:s.state,phase:s.state});
  })()`);
  const K = JSON.parse(kill);
  console.log('  CLEAR', kill);
  ok(K.dead && K.bossNull && K.midDone === true, '妖梦击破后进入 midbossClear 收尾（boss 置空 / midbossDone）');

  // ---- 妖梦打完之后，玩家必须真的能自己走出去（真实回归 bug：出口是一堵墙）----
  const walk = await ev(`(()=>{
    const g=__game,s=g.stage,p=s.player,inp=g.input;
    g.dialogue?.close?.(); g.state='play'; s.state='play';
    p.x=s._midClearX||p.x; p.y=0; p.vx=0; p.vy=0; p.hurtT=0;
    const startX=p.x; let best=p.x; let stuckFrames=0;
    inp._set('right',true);
    const bossLine=s.level.w-940;
    for(let i=0;i<720;i++){
      // 走出舞台就收手，别一路冲到关底触发线（后面还要单独验「呼吸区」）
      if(p.x>bossLine-700){inp._set('right',false);break;}
      if(i%18===0){inp._emitAction('jump');} else if(i%18===2){inp._set('jump',false);}
      p.hurtT=0;
      g.update(1/60);
      if(p.x>best+0.5){best=p.x;stuckFrames=0;} else stuckFrames++;
    }
    for(let i=0;i<30;i++){p.hurtT=0;g.update(1/60);}
    inp._set('right',false); inp._set('jump',false);
    const w=s.level.w;
    return JSON.stringify({startX:Math.round(startX),endX:Math.round(p.x),best:Math.round(best),
      moved:Math.round(best-startX),stuckFrames,rampTop:Math.round(w-4600-900+0),bossLine:Math.round(w-940)});
  })()`);
  const WK = JSON.parse(walk);
  console.log('  WALKOUT', walk);
  ok(WK.moved > 1500, `妖梦打完后能自己走出舞台（前进了 ${WK.moved}px）`);
  ok(WK.stuckFrames < 60, `没有卡在台阶上（最长停滞 ${WK.stuckFrames} 帧）`);
  await shot('tools/_live_youmu_ramp.png');

  // 呼吸区：先原地等，不应触发幽幽子
  const breath = await ev(`(()=>{
    const g=__game,s=g.stage;
    g.dialogue?.close?.(); g.state='play'; s.state='play';
    for(let i=0;i<90;i++)g.update(1/60);
    return JSON.stringify({pending:s.bossPending,started:s.bossStarted,key:s.pendingBossKey});
  })()`);
  const B = JSON.parse(breath);
  console.log('  BREATH', breath);
  ok(B.pending === false && B.started === false, '呼吸区内（原地不动）不会立刻放出幽幽子');

  const go = await ev(`(()=>{
    const g=__game,s=g.stage,p=s.player;
    // 关底触发线 = min(goalX-120, bossX-420) = w-940；从妖梦舞台（w-4600）跑过去要 ~3600px
    p.x=s.level.w-600; p.vx=0;
    for(let i=0;i<180;i++)g.update(1/60);
    return JSON.stringify({pending:s.bossPending,key:s.pendingBossKey,mid:s.pendingBossMid,done:s.midbossDone,px:Math.round(p.x),line:s.level.w-940});
  })()`);
  const G = JSON.parse(go);
  console.log('  NEXT', go);
  ok(G.pending === true && G.key === 'yuyuko' && G.mid === false, '前进后触发关底幽幽子（key=yuyuko, mid=false）');

  const yFinal = await ev(`(()=>{
    const g=__game,s=g.stage;
    g.dialogue?.close?.(); g.state='play'; s.state='play'; s.beginBoss();
    for(let i=0;i<40;i++)g.update(1/60);
    return JSON.stringify({key:s.boss&&s.boss.key,mid:s.bossMid,name:s.boss&&s.boss.def.name});
  })()`);
  const Y = JSON.parse(yFinal);
  console.log('  FINAL', yFinal);
  ok(Y.key === 'yuyuko' && Y.mid === false, '幽幽子正常登场（关底）');
  await ev(`(()=>{const g=__game;for(let i=0;i<120;i++)g.update(1/60);g.render(0);return 1})()`);
  await shot('tools/_live_youmu_5_yuyuko.png');

  const errs = await ev('JSON.stringify(window.__errs||[])');
  ok(errs === '[]', `运行期无 JS 异常（${errs}）`);
} finally {
  try { ws?.close(); } catch {}
  try { edge.kill(); } catch {}
  try { server.kill(); } catch {}
  await sleep(300);
}

console.log(fail.length ? `\n结果：${fail.length} 项失败` : '\n结果：全部通过');
console.log(fail.map((f) => ' - ' + f).join('\n'));
process.exit(fail.length ? 1 : 0);
