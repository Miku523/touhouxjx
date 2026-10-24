// 审计探针 3：整关无头物理跑图（纯 Node，无浏览器）。
// 假 input 按住右 + 定时跳，检测真实卡死点（连续 N 秒 x 不前进）。
// 只读，不改 src。用法: node tools/_audit_walk.mjs [levelIdx] [maxSec]
import { LEVELS } from '../src/assets/levels.js';
import { Stage } from '../src/game/stage.js';
globalThis.document = { getElementById: () => null };

const idxArg = process.argv[2];
const maxSec = Number(process.argv[3] || 260);

function makeInput() {
  const down = new Set(['right']);
  let jumpPulse = 0;
  return {
    _down: down,
    down(k) { return down.has(k); },
    pressed(k) { return k === 'jump' && jumpPulse === 0; },
    released() { return false; },
    get axisX() { return down.has('right') ? 1 : 0; },
    tick() { jumpPulse = (jumpPulse + 1) % 20; },
  };
}

const list = LEVELS.filter((l) => l.gen && l.gen.kind === 'platform');
const targets = idxArg != null ? [Number(idxArg)] : list.map((_, i) => i);

for (const si of targets) {
  const def = list[si];
  const stage = new Stage({ def, index: si, char: 'reimu', difficulty: 'N', onEvent: () => {} });
  stage.midbossCfg = null;
  const p = stage.player;
  const level = stage.level;
  const T = 32;
  // 出生点
  p.x = 3 * T; p.vx = 0; p.vy = 0;
  let landRow = -1;
  for (let r = 0; r < level.rows; r++) if (level.isSolidTile && level.isSolidTile(p.x + p.w / 2, r)) { landRow = r; break; }
  p.y = (landRow < 0 ? 18 : landRow) * T - p.h;
  const input = makeInput();
  const dt = 1 / 60;
  let bestX = p.x, bestCol = Math.round(p.x / T), stuck = 0, maxStuck = 0, maxStuckAt = bestCol;
  let minY = p.y, maxDeaths = 0, hurtFrames = 0;
  const marks = [];
  const startX = p.x;
  const frames = Math.round(maxSec * 60);
  let f = 0;
  for (; f < frames; f++) {
    input.tick();
    p.hurtT = 0;
    stage.update(dt, input);
    if (p.x > bestX + 0.5) { bestX = p.x; bestCol = Math.round(bestX / T); stuck = 0; }
    else { stuck++; }
    if (stuck > 120) { // 2 秒不动
      marks.push({ col: bestCol, x: Math.round(bestX), y: Math.round(p.y), vy: Math.round(p.vy), t: +(f / 60).toFixed(1) });
      maxStuck = Math.max(maxStuck, stuck); maxStuckAt = bestCol;
      // 卡住后尝试冲刺/二段跳组合再试 3 秒
      const chord = { ...input, down: (k) => k === 'right' || k === 'dash' || k === 'jump', pressed: (k) => k === 'jump' || k === 'dash', released: () => false, axisX: 1 };
      for (let g = 0; g < 180; g++) { p.hurtT = 0; stage.update(dt, chord); if (p.x > bestX + 0.5) break; }
      if (p.x > bestX + 0.5) { marks.pop(); stuck = 0; continue; }
      break;
    }
  }
  const w = level.w;
  const done = bestX > w - 400;
  console.log(JSON.stringify({
    id: def.id, mode: def.mode, w, cols: Math.round(w / T), frames: f, sec: +(f / 60).toFixed(1),
    startX: Math.round(startX), bestX: Math.round(bestX), bestCol, done,
    progressPct: +(100 * (bestX - startX) / (w - 400 - startX)).toFixed(1),
    marks, stage: stage.state, finished: !!stage.finished,
  }));
}
