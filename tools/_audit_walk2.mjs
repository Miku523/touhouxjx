// 审计探针 4：整关无头物理跑图（纯 Node）。增强版：
//  - 无敌（每帧 invuln 抬高）隔离地形可达性，避免被弹幕打死导致误判
//  - 真按键边沿：落地即跳、空中下坠时补二段跳、卡住回退重试
//  - 卡死时 dump 玩家状态 + 附近 ASCII 地形
// 只读，不改 src。用法: node tools/_audit_walk2.mjs [stageIdx] [maxSec]
import { LEVELS } from '../src/assets/levels.js';
import { Stage } from '../src/game/stage.js';
import { buildLevelRows } from '../src/assets/levelgen.js';
globalThis.document = { getElementById: () => null };

const T = 32;
const idxArg = process.argv[2];
const maxSec = Number(process.argv[3] || 150);

function makeInput() {
  const down = new Set();
  const pressedSet = new Set();
  return {
    down: (k) => down.has(k),
    pressed: (k) => pressedSet.has(k),
    released: (k) => pressedSet.has('rel:' + k),
    beginFrame() { pressedSet.clear(); },
    hold(k, v) {
      if (v) { if (!down.has(k)) { down.add(k); pressedSet.add(k); } }
      else if (down.has(k)) { down.delete(k); pressedSet.add('rel:' + k); }
    },
    clear() { down.clear(); pressedSet.clear(); },
    endFrame() { pressedSet.clear(); },
    get axisX() { return (down.has('right') ? 1 : 0) - (down.has('left') ? 1 : 0); },
    get axisY() { return (down.has('down') ? 1 : 0) - (down.has('up') ? 1 : 0); },
  };
}

const list = LEVELS.filter((l) => l.gen && l.gen.kind === 'platform');
const targets = idxArg != null ? [Number(idxArg)] : list.map((_, i) => i);

function ascii(level, cx, halfW = 10, up = 8, down = 4) {
  const lines = [];
  const c0 = Math.max(0, cx - halfW), c1 = Math.min(level.cols - 1, cx + halfW);
  for (let r = 0; r < level.rows; r++) {
    let top = false;
    for (let i = 0; i < level.cells[r].length; i++) if (i >= c0 && i <= c1 && level.cells[r][i] !== '.' && level.cells[r][i] !== ' ') top = true;
    if (!top) continue;
    lines.push(String(r).padStart(2) + ' ' + level.cells[r].slice(c0, c1 + 1).join(''));
  }
  return 'cols ' + c0 + '..' + c1 + '\n' + lines.join('\n');
}

for (const si of targets) {
  const def = list[si];
  const stage = new Stage({ def, index: si, char: 'reimu', difficulty: 'N', onEvent: () => {} });
  stage.midbossCfg = null;
  const p = stage.player;
  const level = stage.level;
  p.x = level.playerSpawn.x; p.vx = 0; p.vy = 0;
  {
    const c0 = Math.floor((p.x + p.w / 2) / T);
    let r = 0;
    for (; r < level.rows; r++) if (level.isSolidTile(c0, r)) break;
    p.y = r * T - p.h;
  }
  const rowsForAscii = buildLevelRows(def.gen).rows;
  const input = makeInput();
  const dt = 1 / 60;
  let bestX = p.x, bestCol = 3, stuck = 0, respawns = 0, deaths = 0;
  const marks = [];
  const startX = p.x;
  const frames = Math.round(maxSec * 60);
  let airSince = 0, retreat = 0, wantDJ = false, djd = 0;
  let f = 0;
  for (; f < frames; f++) {
    input.beginFrame();
    p.invuln = 99; p.hurtT = 0;
    // —— 决策 ——
    input.hold('right', retreat === 0);
    input.hold('left', retreat > 0);
    if (retreat > 0) retreat--;
    const grounded = p.onGround || p.coyote > 0;
    // 落地即跳；空中下坠后「松一帧 → 再按」补二段跳；上升期保持不松（拿满跳跃高度）
    if (grounded) {
      airSince = 0; wantDJ = false; djd = 0;
      input.hold('jump', true);
    } else {
      airSince++;
      if (p.vy > 40 && airSince > 6 && djd < 1) wantDJ = true;
      if (wantDJ) {
        if (input.down('jump')) input.hold('jump', false); // 释放造边沿
        else { input.hold('jump', true); wantDJ = false; djd++; }
      } else if (p.vy < -120) {
        input.hold('jump', true);
      } else {
        input.hold('jump', false);
      }
    }
    const prevState = stage.state;
    stage.update(dt, input);
    if (stage.state === 'dead' && prevState !== 'dead') deaths++;
    if (p.x > bestX + 0.5) { bestX = p.x; bestCol = Math.round(bestX / T); stuck = 0; }
    else stuck++;
    if (stuck > 150) {
      marks.push({
        col: bestCol, x: Math.round(bestX), y: Math.round(p.y), vy: Math.round(p.vy),
        onGround: p.onGround, inWater: !!p.inWater, state: stage.state, deaths, respawns,
        checkpointX: Math.round(p.checkpoint?.x ?? -1), t: +(f / 60).toFixed(1),
        ascii: ascii(rowsForAscii, bestCol, 8),
      });
      // 回退 25 帧再冲（蹭台阶/助跑）
      retreat = 25;
      stuck = 0;
      if (marks.length >= 3) break;
    }
  }
  const w = level.w;
  console.log(JSON.stringify({
    id: def.id, cols: level.cols, w, sec: +(f / 60).toFixed(1), deaths,
    startX: Math.round(startX), bestX: Math.round(bestX), bestCol,
    done: bestX > w - 420, progressPct: +(100 * (bestX - startX) / (w - 420 - startX)).toFixed(1),
    marks, stageState: stage.state, finished: !!stage.finished,
  }, null, 1));
}
