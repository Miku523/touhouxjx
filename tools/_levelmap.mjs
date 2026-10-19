// 关卡结构探针：检查点数量/间距、危险地形分布
// 用法: node tools/_levelmap.mjs [port] [stages]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9480);
const STAGES = (process.argv[3] ?? '0,1,2,3,4,5,6').split(',').map(Number);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = `http://127.0.0.1:8141/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-lvlmap-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p; } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200));
  return r.result?.result?.value;
};

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
  await sleep(800);

  for (const si of STAGES) {
    const out = await ev(`(() => {
      const g = window.__game;
      g.lives = 9; g.char = 'reimu';
      g.startStage(${si});
      let n = 0; while (g.state === 'dialogue' && n++ < 100) g.dialogue.advance();
      const st = g.stage, lv = st.level;
      const cps = (st.checkpoints || []).map(c => Math.round(c.x / 32));
      let maxGap = 0, cur = 0, wide = 0;
      for (let c = 0; c < lv.cols; c++) {
        let solid = false;
        for (let r = 0; r < lv.rows; r++) if (lv.isSolidTile(c, r)) { solid = true; break; }
        if (!solid) { cur++; } else { if (cur > 0) { if (cur > 3) wide++; if (cur > maxGap) maxGap = cur; } cur = 0; }
      }
      return JSON.stringify({
        idx: ${si}, id: lv.id, mode: st.mode, cols: lv.cols, rows: lv.rows,
        boss: (st.def && st.def.boss) || null, extra: !!st.extra,
        cps, cpCount: cps.length,
        cpGap: cps.length > 1 ? cps.slice(1).map((v, i) => v - cps[i]) : [],
        firstCpCol: cps[0] ?? null,
        wideGaps: wide, maxGapCols: maxGap,
      });
    })()`);
    const d = JSON.parse(out);
    console.log(`\n[${d.idx}] ${d.id} mode=${d.mode} cols=${d.cols} boss=${d.boss}${d.extra ? ' EXTRA' : ''}`);
    console.log(`  检查点 ${d.cpCount} 个 @ col ${JSON.stringify(d.cps)}`);
    console.log(`  首个检查点 col=${d.firstCpCol}  间距=${JSON.stringify(d.cpGap)}`);
    console.log(`  宽坑(>3列) ${d.wideGaps} 处，最宽 ${d.maxGapCols} 列`);
  }
} catch (e) { console.error('FATAL', e.message); }
finally { try { ws.close(); } catch {} proc.kill(); }
