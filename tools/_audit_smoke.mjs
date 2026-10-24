// 审计探针 6：崩溃 / NaN 冒烟测试（纯 Node，无浏览器）。
// 对 7 个关卡 × 4 难度：建 Stage，跑随机输入 900 帧；再强制开 Boss 跑 1800 帧。
// 捕获异常、非有限坐标、非法 state。只读，不改 src。
// 用法: node tools/_audit_smoke.mjs
import { LEVELS } from '../src/assets/levels.js';
import { Stage } from '../src/game/stage.js';
import { DIFFICULTY_KEYS } from '../src/game/difficulty.js';
globalThis.document = { getElementById: () => null };

const DT = 1 / 60;
function rnd(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

function makeInput(rand) {
  const down = new Set();
  const pressedSet = new Set();
  return {
    down: (k) => down.has(k),
    pressed: (k) => pressedSet.has(k),
    released: () => false,
    endFrame() { pressedSet.clear(); },
    get axisX() { return (down.has('right') ? 1 : 0) - (down.has('left') ? 1 : 0); },
    get axisY() { return (down.has('down') ? 1 : 0) - (down.has('up') ? 1 : 0); },
    step() {
      pressedSet.clear();
      // 每 ~10 帧翻一次方向键；跳跃/射击/施法/冲刺随机脉冲
      if (rand() < 0.08) { down.clear(); const pick = rand(); if (pick < 0.45) down.add('right'); else if (pick < 0.9) down.add('left'); if (rand() < 0.5) down.add('shoot'); }
      for (const k of ['jump', 'shoot', 'cast', 'dash', 'slow']) {
        if (rand() < 0.12) { if (!down.has(k)) { down.add(k); pressedSet.add(k); } } else down.delete(k);
      }
    },
  };
}

const bad = [];
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
let runs = 0;

for (const def of LEVELS) {
  for (const diffKey of DIFFICULTY_KEYS) {
    const rand = rnd(0x1234 + diffKey.charCodeAt(0) + (def.id.length << 8));
    let stage;
    try {
      stage = new Stage({ def, index: 0, char: 'reimu', difficulty: diffKey, onEvent: () => {} });
    } catch (e) {
      bad.push({ level: def.id, diff: diffKey, phase: 'ctor', err: String(e && e.stack || e) });
      continue;
    }
    const input = makeInput(rand);
    const p = stage.player;
    const steps = def.mode === 'stg' ? 1200 : 900;
    try {
      for (let f = 0; f < steps; f++) {
        if (f === 60) stage.beginBoss?.();       // 立刻开 Boss，覆盖 Boss 弹幕路径
        input.step();
        stage.update(DT, input);
        runs++;
        if (p) {
          const px = def.mode === 'stg' ? p.worldX : p.x;
          const py = def.mode === 'stg' ? p.worldY : p.y;
          if (!finite(px) || !finite(py) || !finite(p.vx) || !finite(p.vy)) {
            bad.push({ level: def.id, diff: diffKey, phase: 'player-nan', f, x: p.x, y: p.y, vx: p.vx, vy: p.vy });
            break;
          }
        }
        if (!finite(stage.time)) { bad.push({ level: def.id, diff: diffKey, phase: 'time-nan', f, t: stage.time }); break; }
        if (stage.boss) {
          const b = stage.boss;
          if (!finite(b.x) || !finite(b.y) || !finite(b.hp) || !finite(b.maxHp)) {
            bad.push({ level: def.id, diff: diffKey, phase: 'boss-nan', f, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp });
            break;
          }
          if (b.maxHp <= 0) { bad.push({ level: def.id, diff: diffKey, phase: 'boss-maxhp', f, maxHp: b.maxHp }); break; }
        }
      }
    } catch (e) {
      bad.push({ level: def.id, diff: diffKey, phase: 'update', err: String(e && e.stack || e).split('\n').slice(0, 4).join(' | ') });
    }
    // 检查 stage.hudState 的关键字段
    try {
      const h = stage.hudState;
      for (const k of ['maxPower', 'power', 'extendNeed']) {
        if (!finite(h[k])) bad.push({ level: def.id, diff: diffKey, phase: 'hudState-' + k, v: h[k] });
      }
      if (h.maxPower <= 0) bad.push({ level: def.id, diff: diffKey, phase: 'hudState-maxPower<=0', v: h.maxPower });
    } catch (e) {
      bad.push({ level: def.id, diff: diffKey, phase: 'hudState', err: String(e && e.stack || e) });
    }
  }
}
console.log(JSON.stringify({ runs, badCount: bad.length, bad }, null, 1));
