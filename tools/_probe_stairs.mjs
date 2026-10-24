#!/usr/bin/env node
/** 探针：妖梦舞台出口能不能靠「按住右 + 定时跳」爬上去 */
import { LEVELS } from '../src/assets/levels.js';
import { Stage } from '../src/game/stage.js';
globalThis.document = { getElementById: () => null };

const def = LEVELS.find((l) => l.id === 'stage5');
const T = 32;
let jump = false;
let jumpPulse = 0;
const input = {
  _down: new Set(['right']),
  down(k) { return this._down.has(k); },
  pressed(k) { return k === 'jump' && jump; },
  released() { return false; },
  get axisX() { return this._down.has('right') ? 1 : 0; },
};

const stage = new Stage({ def, index: 4, char: 'reimu', difficulty: 'N', onEvent: () => {} });
stage.midbossCfg = null;
const p = stage.player;
// 放到舞台中间
const arenaCenter = stage.level.w - (def.gen.midboss.arenaFromEnd || 4600);
p.x = arenaCenter;
p.y = stage.level.groundY ? 0 : 0;
// 用关卡数据找地面
let landRow = -1;
for (let r = 0; r < stage.level.rows; r++) if (stage.level.isSolidTile(arenaCenter, r)) { landRow = r; break; }
p.y = landRow * T - p.h;
p.vx = 0; p.vy = 0;
stage.midbossDone = true;
stage.bossPending = false;

const dt = 1 / 60;
let best = p.x, stuckT = 0, log = [];
for (let f = 0; f < 60 * 30; f++) {
  jumpPulse++;
  jump = jumpPulse % 22 === 0;
  stage.update(dt, input);
  if (p.x > best + 0.5) { best = p.x; stuckT = 0; } else stuckT += dt;
  if (f % 30 === 0) log.push({ t: +(f / 60).toFixed(1), x: Math.round(p.x / T), y: +(p.y + p.h).toFixed(0), row: Math.round((p.y + p.h) / T) });
  if (stuckT > 4) break;
}
console.log('arenaCenter col', Math.round(arenaCenter / T), 'start row', landRow);
console.log('end x col', Math.round(p.x / T), 'row', Math.round((p.y + p.h) / T), 'stuck', stuckT.toFixed(2));
console.log(log.slice(-8).map((l) => JSON.stringify(l)).join('\n'));
// 打印卡住位置附近地形
const cx = Math.round(p.x / T);
for (let r = 14; r < stage.level.rows; r++) {
  let line = String(r).padStart(3) + ' ';
  for (let c = cx - 4; c <= cx + 8; c++) line += stage.level.isSolidTile(c, r) ? '#' : '.';
  console.log(line);
}
