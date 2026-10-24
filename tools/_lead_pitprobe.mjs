/**
 * Lead 探针 2：从第 6 面检查点（x≈31426）连续跑，精确定位自动玩家每次送死的位置与原因。
 * 全程逐帧记录环形缓冲，死亡瞬间打印最后 40 帧。
 *   node tools/_lead_pitprobe.mjs
 */
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9422, width: 1280, height: 720, headless: true });
const G = (expr) => T.eval(`(() => { const g = window.__game; return (${expr}); })()`);

try {
  await T.boot();
  await sleep(700);
  await T.eval('window.__game._warpToStage(6)');
  await sleep(800);
  // 站到第 6 面最后一个检查点（col 980）
  await T.eval(`(() => { const g = window.__game; const p = g.stage.player;
    p.x = 31426; p.y = 680; p.vx = 0; p.vy = 0; p.onGround = true;
    g.stage.camera?.snapTo?.(p.x + p.w / 2); })()`);
  await sleep(300);
  await T.eval(`import('/tools/sim_bot.js?t=${Date.now()}').then(m => !!m.install({ god: true, maxRetries: 3 }))`);

  const ring = [];
  let deathsBefore = 0;
  for (let i = 0; i < 1400; i++) {
    const s = await T.eval(`(() => { const B = window.__game.input.__simBot;
      const g = window.__game; const p = g.stage.player;
      B.run(1);
      return { i: B.steps, x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy),
        g: p.onGround ? 1 : 0, hp: p.hearts, air: B.airPlan ? B.airPlan.hold + ':' + B.airPlan.i : '',
        held: [...B.held].join(','), jumps: B.jumps, deaths: B.deaths, st: g.stage.state, jump: p.jumpsLeft,
        tiles: (() => { const L = g.stage.level; const out = [];
          for (let cy = 20; cy <= 26; cy++) { let s = ''; const cx0 = Math.floor((p.x - 64) / 32), cx1 = cx0 + 75;
            for (let cx = cx0; cx <= cx1; cx++) s += L.tileAt ? (L.tileAt(cx, cy) || '.') : '.'; out.push(s); }
          return out; })() }; })()`);
    if (s.x >= 35300 && s.x <= 36500) ring.push(s);
    else if (ring.length > 120) ring.shift();
    if (s.deaths > deathsBefore) {
      console.log('DEATH at', s.deaths, 'steps', s.i, 'x', s.x, 'y', s.y, 'hp', s.hp);
      if (s.tiles) { console.log('rows20-26 @x', s.x); for (const r of s.tiles) console.log('  ' + r); }
      const tail = ring.slice(-45);
      for (const r of tail) console.log(JSON.stringify({ x: r.x, y: r.y, vx: r.vx, vy: r.vy, g: r.g, hp: r.hp, air: r.air, held: r.held, jumps: r.jumps, st: r.st, jl: r.jump }));
      break;
    }
  }
} catch (e) {
  console.error('ERR', e && e.message);
} finally {
  try { await T.close(); } catch {}
}
