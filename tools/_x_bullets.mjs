/** 弹幕数量→渲染/更新成本标定（软光栅 & GPU），只读 src。 */
import { launchCfg, sleep, saveJson, manualRenderScript } from './_pt_perf_lib.mjs';

const OUT = 'tools/_pt/';
const SPAWN = (n) => `(() => {
  const g = window.__game; const s = g.stage;
  if (!s || !s.bullets) return { err: 'no stage' };
  s.bullets.clear();
  const types = [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = ['#ff5ea8', '#7fd4ff', '#ffe066', '#b78cff', '#8dffb0'];
  const cols1 = 32, rows = 20;
  for (let i = 0; i < 0 + n; i++) {
    const k = i % (cols1 * rows);
    const cx = 80 + (k % cols1) * 36, cy = 120 + Math.floor(k / cols1) * 33;
    s.bullets.spawn({ type: types[i % types.length], x: cx, y: cy, vx: 0, vy: 0, r: 6, color: cols[i % cols.length], life: 999 });
  }
  return { n: s.bullets.activeCount };
})()`;

const COUNTS = [0, 200, 400, 800, 1200];

async function run(key, gpu, port) {
  const T = await launchCfg({ port, gpu, width: 1280, height: 720, headless: true });
  const out = { key, cfg: { gpu }, rows: [], errors: [] };
  try {
    await T.boot();
    await T.waitFor('window.__game._bootDone === true', 20000);
    await sleep(400);
    await T.eval(`(() => { const g = window.__game; g.showTitle(); g._startExtraStage({ chainFrom: 3 }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; if (s.boss) { s.boss.state = 'dead'; s.boss.hp = 0; } if (window.__ph) {} return { mode: s.mode, boss: s.boss && s.boss.key }; })()`);
    await sleep(800);
    out.rinfo = await T.eval('window.__rendererInfo');
    // 逐档：清场 → 铺 N 发静止弹 → 手动 render / update 计时
    for (const n of COUNTS) {
      const spawned = await T.eval(SPAWN(n));
      const rr = await T.eval(manualRenderScript(30));
      const uu = await T.eval(`(() => { const g = window.__game; const s = g.stage; const t = []; for (let i = 0; i < 40; i++) { const a = performance.now(); g.update(1 / 60); t.push(performance.now() - a); } const st = t.slice().sort((a, b) => a - b); return { avg: +(t.reduce((x, y) => x + y, 0) / t.length).toFixed(3), p50: +st[20].toFixed(3), p95: +st[38].toFixed(3), worst: +Math.max.apply(null, t).toFixed(3) }; })()`);
      out.rows.push({ n, bullets: spawned && spawned.n, render: { avg: rr.avg, p50: rr.p50, p95: rr.p95, worst: rr.worst }, update: uu, renderer: rr.renderer });
      console.log(key, 'N=' + n, JSON.stringify({ bullets: spawned && spawned.n, render: rr.avg, update: uu.avg }));
    }
    await T.eval('(() => { const s = window.__game.stage; if (s && s.bullets) s.bullets.clear(); return 1; })()');
  } catch (e) {
    out.errors.push(String(e).slice(0, 400));
    console.log('!! ' + key, String(e).slice(0, 300));
  } finally {
    saveJson(OUT + 'perf_bullets_' + key + '.json', out);
    try { await T.close(); } catch {}
  }
  return out;
}

const res = {};
res.soft = await run('soft-1280', false, 9467);
res.gpu = await run('gpu-1280', true, 9468);
saveJson(OUT + 'perf_bullets_summary.json', res);
console.log('DONE bullets');
