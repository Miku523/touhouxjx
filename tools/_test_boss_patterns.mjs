// 弹幕编排冒烟测试：用假 bullets/fx 驱动 Boss，检查弹型能正常开火。
// 覆盖：旧类型（bloom/vortex/sweep）+ 新增 cage/petal/meteor/snake/mine/arc/spiralPulse，
// 并驱动延迟队列（meteor/mine 的「壳弹 → 爆裂」），校验弹速上限与 cage 缺口。
import { Boss, BOSS_DEFS } from '../src/game/boss.js';

const fx = new Proxy({}, { get: () => () => {} });
const player = { x: 200, y: 500, w: 40, h: 92, alive: true, invuln: 9 };

function makeBullets() {
  const rec = [];
  const api = {
    activeCount: 0,
    clear() { rec.length = 0; api.activeCount = 0; },
    ring(x, y, n, speed, o) {
      for (let i = 0; i < n; i++) {
        const a = ((o && o.angle) || 0) + (i / n) * Math.PI * 2;
        api.spawn({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ...o });
      }
    },
    fan(x, y, n, spread, base, speed, o) {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1) - 0.5;
        const a = base + t * spread;
        api.spawn({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ...o });
      }
    },
    spawn(o) {
      // 模拟 BulletPool：返回子弹对象（延迟爆裂需要读它到点时的坐标）
      const b = { ...o, active: true, life: o.life != null ? o.life : 7, maxLife: o.life != null ? o.life : 7 };
      rec.push(b);
      api.activeCount = rec.filter((x) => x.active).length;
      return b;
    },
    update() {},
    hitTest() { return null; },
    grazeTest() { return 0; },
  };
  return { api, rec };
}

let failures = 0;
function check(cond, label) {
  if (!cond) { failures++; console.log('  FAIL:', label); }
}

function speedOf(o) {
  return Math.hypot(o.vx || 0, o.vy || 0);
}

const speedLimit = (boss) => boss.speedCap + 1e-6;

// 找某个 typeName 第一次出现的符卡位置（新类型都至少被一张真实符卡使用）
function findType(kind) {
  for (const key of Object.keys(BOSS_DEFS)) {
    const phases = BOSS_DEFS[key].phases;
    for (let s = 0; s < phases.length; s++) {
      const idx = phases[s].patterns.findIndex((p) => p.typeName === kind);
      if (idx >= 0) return { key, spell: s, idx, pat: phases[s].patterns[idx] };
    }
  }
  return null;
}

// 旧类型：确认重构后没把老弹型写坏
const legacy = [
  ['rumia', 'bloom'],
  ['wriggle', 'vortex'],
  ['cirno', 'bloom'],
  ['aya', 'sweep'],
  ['yuyuko', 'bloom'],
  ['kaguya', 'sweep'],
  ['flandre', 'vortex'],
];

for (const [key, kind] of legacy) {
  const def = BOSS_DEFS[key];
  const last = def.phases.length - 1;
  const idx = def.phases[last].patterns.findIndex((p) => p.typeName === kind);
  if (idx < 0) { console.log(key, kind, 'MISSING'); failures++; continue; }
  const boss = new Boss(key, 800, 300, { seed: 12345 });
  boss.state = 'battle';
  boss.introT = 2;
  boss.spellIdx = last;
  boss.spellHp = 9999;
  const { api, rec } = makeBullets();
  boss._startPattern(idx);
  boss.patternT = 0.02;
  boss.fireT = 5;
  boss.update(1 / 60, player, api, fx, { onPhase() {} });
  const bad = rec.filter((o) => !Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.vx) || !Number.isFinite(o.vy) || !Number.isFinite(o.r));
  check(rec.length > 0, `${key}/${kind} spawn`);
  check(bad.length === 0, `${key}/${kind} finite`);
  console.log(key, kind, 'idx=', idx, 'spawn=', rec.length, 'bad=', bad.length);
}

// 新类型：每种至少打一帧，并在 EX 护栏下校验单发速度上限
const NEW = ['cage', 'petal', 'meteor', 'snake', 'mine', 'arc', 'spiralPulse'];
for (const kind of NEW) {
  const hit = findType(kind);
  if (!hit) { console.log(kind, 'NOT USED BY ANY SPELL'); failures++; continue; }
  const boss = new Boss(hit.key, 800, 300, { seed: 424242, difficulty: 'EX' });
  boss.state = 'battle';
  boss.introT = 2;
  boss.spellIdx = hit.spell;
  boss.spellHp = 999999;
  const { api, rec } = makeBullets();
  boss._startPattern(hit.idx);
  boss.patternT = 0.02;
  boss.fireT = 5;
  boss.update(1 / 60, player, api, fx, { onPhase() {} });
  const bad = rec.filter((o) => !Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.vx) || !Number.isFinite(o.vy) || !Number.isFinite(o.r));
  const over = rec.filter((o) => speedOf(o) > speedLimit(boss));
  check(rec.length > 0, `${kind} spawn`);
  check(bad.length === 0, `${kind} finite`);
  check(over.length === 0, `${kind} speed cap (${over.map(speedOf).slice(0, 3).join(',')} > ${boss.speedCap})`);

  // cage：所有弹都在以玩家为中心的同半径圆上，并且留出至少一个可读缺口
  if (kind === 'cage') {
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    const rs = rec.map((o) => Math.hypot(o.x - cx, o.y - cy));
    const rErr = Math.max(...rs.map((r) => Math.abs(r - rs[0])));
    check(rErr < 1e-6, `cage ring radius consistent (err=${rErr})`);
    const angs = rec.map((o) => Math.atan2(o.y - cy, o.x - cx)).sort((a, b) => a - b);
    let maxGap = angs.length ? angs[0] + Math.PI * 2 - angs[angs.length - 1] : 0;
    for (let i = 1; i < angs.length; i++) maxGap = Math.max(maxGap, angs[i] - angs[i - 1]);
    check(maxGap > 0.5, `cage has a readable gap (maxGap=${maxGap.toFixed(2)} rad)`);
    console.log('  cage radius=', rs[0].toFixed(1), 'maxGap=', maxGap.toFixed(2), 'n=', rec.length);
  }

  console.log(kind, 'used-by=', `${hit.key}.phase${hit.spell + 1}`, 'spawn=', rec.length, 'bad=', bad.length, 'overCap=', over.length);
}

// 延迟队列：meteor / mine 壳弹到点要在屏幕内炸开，且爆裂不越过速度上限
for (const kind of ['meteor', 'mine']) {
  const hit = findType(kind);
  const boss = new Boss(hit.key, 800, 300, { seed: 777, difficulty: 'EX' });
  boss.state = 'battle';
  boss.introT = 2;
  boss.spellIdx = hit.spell;
  boss.spellHp = 999999;
  const { api, rec } = makeBullets();
  boss._startPattern(hit.idx);
  boss.patternT = 0.02;
  boss.fireT = 5;
  // 先打一帧拿到壳弹，再推进 2.6s 让队列全部到点
  boss.update(1 / 60, player, api, fx, { onPhase() {} });
  const shells = rec.length;
  for (let i = 0; i < Math.ceil(2.6 * 60); i++) {
    // 清掉已到寿的弹，模拟对象池回收（否则 activeCount 一直涨）
    for (const b of rec) if (b.active && b.life > 0) { b.life -= 1 / 60; if (b.life <= 0) b.active = false; }
    api.activeCount = rec.filter((x) => x.active).length;
    boss.update(1 / 60, player, api, fx, { onPhase() {} });
    if (boss.patternT > boss.patternDur) break;
  }
  const over = rec.filter((o) => speedOf(o) > speedLimit(boss));
  const exploded = rec.length > shells;
  check(exploded, `${kind} delayed burst spawned ${rec.length - shells} extra`);
  check(over.length === 0, `${kind} burst speed cap`);
  // 切卡 / 清屏路径会调用 _flushLater：清空后不应再补出弹幕
  const beforeFlush = rec.length;
  boss._flushLater();
  check(boss._laterQ.length === 0, `${kind} flushLater empties queue`);
  boss.update(1 / 60, player, api, fx, { onPhase() {} });
  console.log(kind, 'burst: shells=', shells, 'total=', rec.length, 'afterFlush=', beforeFlush, 'queue=0', 'overCap=', over.length);
}

// 确定性：同一 seed + 同一帧序列，两场 Boss 的弹幕记录必须逐发一致
function runSeed(seed) {
  const boss = new Boss('flandre', 800, 300, { seed, difficulty: 'EX' });
  boss.state = 'battle';
  boss.introT = 2;
  const { api, rec } = makeBullets();
  for (let i = 0; i < 180; i++) boss.update(1 / 60, player, api, fx, { onPhase() {} });
  return rec.map((o) => [o.x, o.y, o.vx, o.vy, o.type].map((v) => (v == null ? v : Math.round(v * 1000) / 1000)).join(',')).join('|');
}
check(runSeed(9001) === runSeed(9001), 'deterministic with same seed');
console.log('determinism: same-seed identical =', runSeed(9001) === runSeed(9001));

console.log(failures === 0 ? 'ALL OK' : `FAILED ${failures}`);
process.exit(failures === 0 ? 0 : 1);
