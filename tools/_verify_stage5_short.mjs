// STAGE5 短图改造（取消第一个道中 → 开场准备区 → 妖梦 → 掉落 1UP → 第二道中 → 幽幽子）浏览器冒烟
// 用法: node tools/_verify_stage5_short.mjs [port]
// 与 _verify_stage5_youmu.mjs（纯 Node 状态机自测）互补：这里跑真浏览器，验证绘制 / 拾取 / 掉落 / 检查点。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] || 8139);
const W = 1280;
const H = 720;
const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const EDGE = EDGE_CANDIDATES.find((p) => existsSync(p));
const DBG_PORT = 9337;
const profile = mkdtempSync(join(tmpdir(), 'edge-s5short-'));

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
  const shot = async (file, clip) => {
    const s = await send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
    writeFileSync(file, Buffer.from(s.data, 'base64'));
    console.log('  IMG', file);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?short=${Date.now()}` });

  let booted = false;
  for (let i = 0; i < 160; i++) {
    // 等真正的启动页结束（素材烘焙完再开图，截出来的画面才是关卡本体）
    booted = await ev('!!window.__game && !!(window.__boot && window.__boot.done)');
    if (booted) break;
    await sleep(200);
  }
  if (!booted) throw new Error('game did not boot');
  await ev(`window.__errs=[];addEventListener('error',e=>__errs.push('error: '+e.message));addEventListener('unhandledrejection',e=>__errs.push('reject: '+(e.reason&&e.reason.message||e.reason)));1`);

  // ---- 进 STAGE5 ----
  await ev(`(()=>{const g=__game;g.startStage(4,{skipIntro:true});g.state='play';g.dialogue?.close?.();return 1})()`);
  for (let i = 0; i < 60; i++) { if (await ev('!!(__game.stage&&__game.stage.level)')) break; await sleep(150); }
  // 关掉剧情对白：战后对话会让关卡暂停，纯粹挡住截图和走位断言（对白契约另有 Node 自测覆盖）
  await ev(`(()=>{__game.stage.skipBossDialogue=true;return 1})()`);

  const meta = await ev(`(()=>{const g=__game,s=g.stage,p=s.player;const it=s.pickups;
    return JSON.stringify({w:s.level.w, cols:s.level.gen.cols, ground:s.level.gen.ground,
      power:it.filter(i=>i.kind==='power').length, oneup:it.filter(i=>i.kind==='oneup').length,
      coins:it.filter(i=>i.kind==='coin').length, checkpoints:s.checkpoints.length,
      spawnX:Math.round(p.x), lives:p.lives, pw:p.power,
      mid:!!s.midbossCfg, midKey:s.midbossCfg&&s.midbossCfg.key,
      triggerPx:Math.round(s.level.w - s.midbossCfg.triggerFromEnd)})})()`);
  const M = JSON.parse(meta);
  console.log('  META', meta);
  ok(M.cols === 208 && M.w === 208 * 32, `关卡缩短到 208 列（w=${M.w}）`);
  ok(M.mid && M.midKey === 'youmu', 'STAGE5 仍挂着妖梦中途战配置');
  ok(M.power === 4, `地图上摆着 4 枚 P 点（实际 ${M.power}）`);
  ok(M.oneup === 1, `地图上摆着 1 枚 1UP（实际 ${M.oneup}）`);
  ok(M.checkpoints === 1, `第二道中补了 1 个检查点（实际 ${M.checkpoints}）`);
  ok(M.spawnX < 200, `出生点在准备区左端（x=${M.spawnX}）`);
  ok(M.lives === 3, `开局残机 3（实际 ${M.lives}）`);

  // ---- 开场准备区渲染：把玩家挪到准备区中段，截一张看 4P + 1UP ----
  const prep = await ev(`(()=>{const g=__game,s=g.stage,p=s.player;
    const up=s.pickups.find(i=>i.kind==='oneup');
    p.x=up.x-420; p.vx=0; p.vy=0;
    for(let i=0;i<40;i++)g.update(1/60);
    g.render(0);
    return JSON.stringify({camX:Math.round(s.camera.x),camY:Math.round(s.camera.y),ux:Math.round(up.x),uy:Math.round(up.y)})})()`);
  const PR = JSON.parse(prep);
  console.log('  PREP', prep);
  await shot('tools/_stage5_short_prep.png');
  // 1UP 徽章特写（准备区月光明亮，适合看专属掉落图）
  await shot('tools/_stage5_short_1up_icon.png', {
    x: Math.max(0, PR.ux - PR.camX - 55),
    y: Math.max(0, PR.uy - PR.camY - 55),
    width: 110, height: 110, scale: 5,
  });

  // ---- 真实走位：从出生点走到妖梦触发线，一路上捡 4P + 1UP ----
  const walk = await ev(`(()=>{
    const g=__game,s=g.stage,p=s.player,inp=g.input;
    g.dialogue?.close?.(); g.state='play'; s.state='play';
    // 截准备区那张图时顺路吃掉了一枚 P：复原成开局状态再走一遍
    s.pickups.forEach(it=>{it.taken=false;});
    s.extendPts=0; s.extendCount=0; p.lives=3;
    const floorY=s.level.gen.ground*32;
    p.x=64; p.y=floorY-p.h-2; p.vx=0; p.vy=0; p.alive=true; p.hurtT=0;
    const trigger=s.level.w-s.midbossCfg.triggerFromEnd;
    const power0=p.power, lives0=p.lives;
    inp._set('right',true);
    let stuck=0, best=p.x, frames=0;
    for(;frames<1600;frames++){
      g.update(1/60);
      if(s.bossPending) break;
      if(p.x>best+0.5){best=p.x;stuck=0;} else stuck++;
      if(p.x+p.w/2>trigger+120) break;
    }
    inp._set('right',false);
    return JSON.stringify({frames,stuck,power0,lives0,power:p.power,lives:p.lives,
      extendCount:s.extendCount||0,px:Math.round(p.x),trigger:Math.round(trigger),
      pending:s.bossPending,started:s.bossStarted,
      left:s.pickups.filter(i=>!i.taken&&(i.kind==='power'||i.kind==='oneup')).length,
      cpActive:s.checkpoints[0]&&s.checkpoints[0].active});
  })()`);
  const WK = JSON.parse(walk);
  console.log('  WALK', walk);
  ok(WK.power - WK.power0 === 16, `路上捡满 4 枚 P → 火力 +${WK.power - WK.power0}（${WK.power0} → ${WK.power}）`);
  ok(WK.lives - WK.lives0 === 1, `路上的 1UP → 残机 +${WK.lives - WK.lives0}`);
  ok(WK.extendCount === 1, '1UP 走 extend 通道（HUD 横幅/音效）');
  ok(WK.left === 0, '走到触发线前，准备区补给全部捡完');
  ok(WK.pending === true, '越过触发线 → 妖梦被排队');
  ok(WK.cpActive === false, '准备区没有检查点（出生点即复活点）');

  // ---- 妖梦登场：开战不额外补火力 ----
  const started = await ev(`(()=>{
    const g=__game,s=g.stage,p=s.player;
    g.dialogue?.close?.(); g.state='play'; s.state='play';
    const pw=p.power;
    s.beginBoss();
    return JSON.stringify({key:s.boss&&s.boss.key,mid:s.bossMid,bx:Math.round(s.boss&&s.boss.x),w:s.level.w,pw,pwAfter:p.power});
  })()`);
  const S = JSON.parse(started);
  console.log('  BOSS', started);
  ok(S.key === 'youmu' && S.mid === true, '妖梦以中途 Boss 登场');
  ok(S.bx === S.w - 4600, '妖梦站舞台中心（w-4600）');
  ok(S.pwAfter === S.pw, '开战不再自动补火力（补给只在准备区）');

  // ---- 击破妖梦 → 掉落 1UP ----
  const kill = await ev(`(()=>{
    const g=__game,s=g.stage,b=s.boss,p=s.player;
    let guard=0;
    while(b.state!=='dead'&&guard++<60000){
      if(b.state==='battle')b.damage(b.maxHp);
      p.hurtT=0; g.update(1/60);
    }
    p.hurtT=0; g.update(1/60);
    const drop=s.pickups.find(i=>i.kind==='oneup'&&!i.taken);
    return JSON.stringify({dead:b.state==='dead',midDone:s.midbossDone,bossNull:s.boss===null,
      drop:drop?{x:Math.round(drop.x),y:Math.round(drop.y),drop:drop.drop,floorY:Math.round(drop.floorY)}:null,
      lives:p.lives,power:p.power,camX:Math.round(s.camera.x),camY:Math.round(s.camera.y)});
  })()`);
  const K = JSON.parse(kill);
  console.log('  KILL', kill);
  ok(K.dead && K.midDone && K.bossNull, '妖梦击破 → midbossClear 收尾');
  ok(!!K.drop && K.drop.drop === true, '击破后掉下一枚 1UP（一开始在空中）');

  // ---- 等它落地（人站远），再走过去捡 ----
  const pick = await ev(`(()=>{
    const g=__game,s=g.stage,p=s.player;
    const drop=s.pickups.find(i=>i.kind==='oneup'&&!i.taken);
    // 站在掉落物左边 260px（>42px 拾取半径）：既能拍到画面，又不会提前吃掉
    p.x=drop.x-260; p.vx=0; p.vy=0;
    for(let i=0;i<120;i++){p.hurtT=0;g.update(1/60);}
    // 妖梦击破 1.8s 后 main.js 会自动弹战后对话并暂停关卡：截图前顺手关掉
    g.dialogue?.close?.(); g.state='play'; s.state='play';
    for(let i=0;i<10;i++){p.hurtT=0;g.update(1/60);}
    g.render(0);
    const landed={drop:drop.drop,y:Math.round(drop.y),taken:drop.taken,lives:p.lives,camX:Math.round(s.camera.x),camY:Math.round(s.camera.y)};
    return JSON.stringify({landed});
  })()`);
  const P1 = JSON.parse(pick);
  ok(P1.landed.drop === false, '1UP 落到舞台地面（不再是空中状态）');
  ok(P1.landed.taken === false, '没走过去之前不会被捡走');
  // 整屏上这枚 1UP 在舞台地面上的可读性
  await shot('tools/_stage5_short_1up_spot.png');
  // 落地后的 1UP 特写：确认专属掉落图（粉色徽章 + 1UP 字样）画出来了
  await shot('tools/_stage5_short_1up.png', {
    x: Math.max(0, K.drop.x - P1.landed.camX - 60),
    y: Math.max(0, P1.landed.y - P1.landed.camY - 60),
    width: 120, height: 120, scale: 5,
  });

  const pick2 = await ev(`(()=>{
    const g=__game,s=g.stage,p=s.player;
    // 妖梦战后对话会暂停关卡；先跳过它，再走到掉落物上
    g.dialogue?.close?.(); g.state='play'; s.state='play';
    const drop=s.pickups.find(i=>i.kind==='oneup'&&!i.taken);
    const livesBefore=p.lives;
    const floorY=s.level.gen.ground*32;
    p.alive=true; p.hurtT=0; p.vx=0; p.vy=0;
    p.x=drop.x-p.w/2; p.y=floorY-p.h-2;
    for(let i=0;i<8;i++){p.hurtT=0;g.update(1/60);}
    return JSON.stringify({taken:drop.taken,livesBefore,lives:p.lives,extend:s.extendCount,
      gstate:g.state,px:Math.round(p.x),dx:Math.round(drop.x),py:Math.round(p.y),dy:Math.round(drop.y)});
  })()`);
  const P2 = JSON.parse(pick2);
  console.log('  PICK', JSON.stringify({ first: P1.landed, after: P2 }));
  ok(P2.taken === true, '走到掉落位置 → 1UP 被捡起');
  ok(P2.lives === P2.livesBefore + 1, `捡起 1UP 后残机 +1（${P2.livesBefore} → ${P2.lives}）`);
  ok(P2.extend === 2, '两枚 1UP 都走统一 extend 通道');

  // ---- 第二道中：检查点点亮 + 走到关底触发线 ----
  const corridor = await ev(`(()=>{
    const g=__game,s=g.stage,p=s.player,inp=g.input,cp=s.checkpoints[0];
    g.dialogue?.close?.(); g.state='play'; s.state='play';
    p.alive=true; p.vx=0; p.vy=0; p.hurtT=0;
    // 检查点灯笼站在 row 22，cp.y 是它那格的底边 = 第二道中的地面
    p.x=cp.x-300; p.y=cp.y-p.h-2;
    for(let i=0;i<40;i++){p.hurtT=0;g.update(1/60);}
    const cpActiveBefore=cp.active;
    inp._set('right',true);
    let frames=0;
    while(frames++<2400){
      p.hurtT=0; g.update(1/60);
      if(s.bossPending) break;
    }
    inp._set('right',false);
    return JSON.stringify({cpActiveBefore,cpActive:cp.active,bossPending:s.bossPending,key:s.pendingBossKey,mid:s.pendingBossMid,
      px:Math.round(p.x),line:Math.round(Math.max(200,Math.min(s.goalX-120,s.level.w-520-420))),
      sameStage:g.stage===s,gstate:g.state,alive:p.alive,cpx:Math.round(cp.x),cpy:Math.round(cp.y)});
  })()`);
  const C = JSON.parse(corridor);
  console.log('  CORRIDOR', corridor);
  ok(C.cpActive === true, '第二道中的检查点点亮了');
  ok(C.bossPending === true && C.key === 'yuyuko' && C.mid === false, '跑完第二道中 → 关底幽幽子被排队');
  ok(C.px >= C.line - 40, `关底在触发线附近才排队（x=${C.px}, line=${C.line}）`);

  // ---- 幽幽子登场 ----
  const finalBoss = await ev(`(()=>{
    const g=__game,s=g.stage;
    g.dialogue?.close?.(); g.state='play'; s.state='play'; s.beginBoss();
    for(let i=0;i<30;i++)g.update(1/60);
    g.render(0);
    return JSON.stringify({key:s.boss&&s.boss.key,mid:s.bossMid,name:s.boss&&s.boss.def.name});
  })()`);
  const F = JSON.parse(finalBoss);
  console.log('  FINAL', finalBoss);
  ok(F.key === 'yuyuko' && F.mid === false, '幽幽子正常登场（关底）');
  await shot('tools/_stage5_short_yuyuko.png');

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
