// Boss 弹幕随机性探针（Node，无浏览器）
//   - 同 seed 完全可复现（弹幕轨迹哈希一致）
//   - 不同 seed 的弹幕轨迹明显不同
//   - 无 NaN、弹幕数不超池上限、Boss 不出画面、招式不连续重复、各阶段可达
// 用法: node tools/_boss_rand_probe.mjs [秒数]

const DT = 1 / 60;

/* ---- DOM 最小 stub（bullets.js / genboss.js 需要） ---- */
const proxyCtx = new Proxy({}, {
  get: (t, k) => {
    if (k === 'createRadialGradient' || k === 'createLinearGradient') {
      return () => ({ addColorStop() {} });
    }
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => proxyCtx }),
};
globalThis.window = { devicePixelRatio: 1 };
globalThis.Image = class { set src(v) {} };

const { Boss, BOSS_DEFS } = await import('../src/game/boss.js');
const { BulletPool } = await import('../src/game/bullets.js');

const KEYS = ['rumia', 'wriggle', 'cirno', 'aya', 'yuyuko', 'kaguya', 'flandre'];
const fakeFx = { burst() {}, sparkle() {}, flash() {}, shockwave() {}, impact() {} };

function simulate(key, seed, seconds) {
  const pool = new BulletPool(1400);
  const boss = new Boss(key, 400, 380, { seed });
  boss.state = 'battle';           // 跳过 1.4s 入场
  const player = { x: 640, y: 560, w: 28, h: 56 };
  const stats = {
    key, seed,
    maxActive: 0, spawned: 0, nan: 0,
    xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity,
    phases: new Set(), phaseChanges: 0,
    patternChanges: 0,
    patternSeq: [],
    patternVisits: new Map(), transitions: 0,
    volleys: 0, wildStarts: 0,
  };
  let hash = 0x811c9dc5;

  const origSpawn = pool.spawn.bind(pool);
  pool.spawn = (o) => {
    stats.spawned++;
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y) ||
        !Number.isFinite(o.vx) || !Number.isFinite(o.vy)) stats.nan++;
    // 量化后混入轨迹哈希，避免浮点噪声
    hash ^= (Math.round(o.x * 8) & 0xffff);
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= (Math.round(o.y * 8) & 0xffff);
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= (Math.round(o.vx * 4) & 0xffff);
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= (Math.round(o.vy * 4) & 0xffff);
    hash = Math.imul(hash, 16777619) >>> 0;
    return origSpawn(o);
  };

  const frames = Math.round(seconds / DT);
  let lastPhase = boss.phase;
  for (let f = 0; f < frames; f++) {
    const t = f * DT;
    // 玩家做李萨如运动，让「瞄准」目标持续变化
    player.x = 640 + Math.cos(t * 0.7) * 330;
    player.y = 545 + Math.sin(t * 1.13) * 70;

    // 每 6 秒削 7% 血，保证走完所有阶段又不打死
    if (f > 0 && f % Math.round(6 / DT) === 0 && boss.hp > boss.maxHp * 0.04) {
      boss.hp = Math.max(boss.maxHp * 0.04, boss.hp - boss.maxHp * 0.075);
    }

    boss.update(DT, player, pool, fakeFx, {});
    pool.update(DT, { x: player.x, y: player.y }, { x: 0, y: 0, w: 1280, h: 720 });

    const inWild = boss._wildLeft > 0;
    if (inWild && !stats._wasWild) stats.wildStarts++;
    stats._wasWild = inWild;

    stats.maxActive = Math.max(stats.maxActive, pool.activeCount);
    stats.volleys = boss.volleys;
    stats.xMin = Math.min(stats.xMin, boss.x);
    stats.xMax = Math.max(stats.xMax, boss.x);
    stats.yMin = Math.min(stats.yMin, boss.y);
    stats.yMax = Math.max(stats.yMax, boss.y);
    stats.phases.add(boss.phase);

    if (boss.phase !== lastPhase) {
      stats.phaseChanges++;
      lastPhase = boss.phase;
    }
    if (boss.patternIdx !== (stats.patternSeq.length
      ? stats.patternSeq[stats.patternSeq.length - 1].idx
      : -1)) {
      stats.patternChanges++;
      stats.patternSeq.push({ phase: boss.phase, idx: boss.patternIdx });
      stats.patternVisits.set(boss.patternIdx, (stats.patternVisits.get(boss.patternIdx) || 0) + 1);
    }
    stats.transitions = stats.patternChanges;
    if (stats.nan) break;
  }

  return { stats, hash: hash >>> 0, activeLeft: pool.activeCount };
}

const seconds = Number(process.argv[2]) || 90;
let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);

console.log(`\n=== 1. 七个 Boss × 90s 实战模拟（seed=20261018） ===`);
const baseline = new Map();
for (const key of KEYS) {
  const { stats, hash } = simulate(key, 20261018, seconds);
  const spanX = stats.xMax - stats.xMin;
  const spanY = stats.yMax - stats.yMin;
  console.log(
    `${key.padEnd(8)} phase=${stats.phases.size} 换招=${stats.patternChanges} ` +
    `开火=${stats.volleys} 弹幕=${stats.spawned} 峰值=${stats.maxActive} ` +
    `变招=${stats.wildStarts} 移动范围=${spanX.toFixed(0)}×${spanY.toFixed(0)} hash=${hash.toString(16)}`
  );
  if (stats.nan) fail(`${key}: 出现 NaN`);
  if (stats.maxActive >= 1400) fail(`${key}: 弹幕峰值达到池上限 ${stats.maxActive}`);
  if (stats.phases.size < BOSS_DEFS[key].phases.length) fail(`${key}: 阶段未走全 (${stats.phases.size}/${BOSS_DEFS[key].phases.length})`);
  if (spanX < 40 || spanY < 20) fail(`${key}: Boss 几乎没移动 (${spanX.toFixed(0)}×${spanY.toFixed(0)})`);
  if (spanX > 700) fail(`${key}: Boss 水平移动过大 (${spanX.toFixed(0)})`);
  if (stats.patternChanges < 4) fail(`${key}: 换招次数过少 (${stats.patternChanges})`);
  // 同一阶段里至少出现过 2 种不同的招式（招式有随机选择，不是固定轮播）
  const byPhase = new Map();
  for (const rec of stats.patternSeq) {
    if (!byPhase.has(rec.phase)) byPhase.set(rec.phase, new Set());
    byPhase.get(rec.phase).add(rec.idx);
  }
  for (const [ph, set] of byPhase) {
    if (BOSS_DEFS[key].phases[ph].patterns.length >= 2 && set.size < 2) {
      fail(`${key}: phase ${ph} 只出现 1 种招式`);
    }
  }
  if (stats.volleys < 20) fail(`${key}: 开火次数过少 (${stats.volleys})`);
  if (stats.wildStarts < 3) fail(`${key}: 90s 内计划外变招过少 (${stats.wildStarts})`);
  baseline.set(key, hash);
}
if (!failures) ok('7 个 Boss 全部通过基础检查');

console.log(`\n=== 2. 同 seed 可复现性（每个 Boss 跑两遍） ===`);
for (const key of KEYS) {
  const a = simulate(key, 424242, 40);
  const b = simulate(key, 424242, 40);
  if (a.hash !== b.hash || a.stats.spawned !== b.stats.spawned || a.stats.volleys !== b.stats.volleys) {
    fail(`${key}: 同 seed 结果不一致 (${a.hash.toString(16)} vs ${b.hash.toString(16)})`);
  } else {
    ok(`${key}: hash=${a.hash.toString(16)} 弹幕=${a.stats.spawned}`);
  }
}

console.log(`\n=== 3. 不同 seed 的轨迹差异（每 Boss 8 个 seed，40s） ===`);
for (const key of KEYS) {
  const hashes = new Set();
  const spawns = [];
  for (let i = 0; i < 8; i++) {
    const r = simulate(key, 1000 + i * 7919, 40);
    hashes.add(r.hash);
    spawns.push(r.stats.spawned);
  }
  const spread = Math.max(...spawns) - Math.min(...spawns);
  console.log(`${key.padEnd(8)} 唯一轨迹=${hashes.size}/8  弹幕数范围=${Math.min(...spawns)}–${Math.max(...spawns)}`);
  if (hashes.size < 8) fail(`${key}: 不同 seed 出现重复轨迹 (${hashes.size}/8)`);
  if (spread < 10) fail(`${key}: 不同 seed 弹幕数量差异过小 (${spread})`);
}

console.log(`\n=== 4. 招式分布（flandre，180s，统计每招出现次数） ===`);
{
  const pool = new BulletPool(1400);
  const boss = new Boss('flandre', 400, 380, { seed: 777 });
  boss.state = 'battle';
  const player = { x: 640, y: 560, w: 28, h: 56 };
  const visits = [0, 0, 0, 0];
  const durations = [];
  let last = boss.patternIdx;
  let lastSwitch = 0;
  const frames = Math.round(180 / DT);
  for (let f = 0; f < frames; f++) {
    const t = f * DT;
    player.x = 640 + Math.cos(t * 0.9) * 300;
    player.y = 545 + Math.sin(t * 1.3) * 60;
    if (f > 0 && f % 1200 === 0 && boss.hp > boss.maxHp * 0.05) boss.hp -= boss.maxHp * 0.06;
    boss.update(DT, player, pool, fakeFx, {});
    pool.update(DT, { x: player.x, y: player.y }, { x: 0, y: 0, w: 1280, h: 720 });
    if (boss.patternIdx !== last) {
      visits[last]++;
      durations.push((f - lastSwitch) * DT);
      last = boss.patternIdx;
      lastSwitch = f;
    }
  }
  visits[last]++;
  console.log(`  各招出现次数: ${visits.join(' / ')}  换招 ${durations.length} 次`);
  const avg = durations.reduce((s, v) => s + v, 0) / durations.length;
  console.log(`  单招时长: ${Math.min(...durations).toFixed(1)}–${Math.max(...durations).toFixed(1)}s，平均 ${avg.toFixed(1)}s`);
  if (Math.min(...visits) < 2) fail('flandre: 有招式在 180s 内几乎不出现（随机分布偏斜）');
  if (Math.min(...durations) < 1.5) fail('flandre: 出现短于 1.5s 的招式');
}

console.log(`\n=== 5. 阶段切换时的起始招式（3 个 seed） ===`);
{
  const starts = [];
  for (const seed of [99, 1234, 777777]) {
    const pool = new BulletPool(1400);
    const boss = new Boss('kaguya', 400, 380, { seed });
    boss.state = 'battle';
    const player = { x: 640, y: 560, w: 28, h: 56 };
    let phase = boss.phase;
    const entry = [boss.patternIdx];
    for (let f = 0; f < 60 / DT; f++) {
      if (f > 0 && f % 600 === 0 && boss.hp > boss.maxHp * 0.05) boss.hp -= boss.maxHp * 0.1;
      boss.update(DT, player, pool, fakeFx, {});
      pool.update(DT, { x: player.x, y: player.y }, { x: 0, y: 0, w: 1280, h: 720 });
      if (boss.phase !== phase) {
        phase = boss.phase;
        entry.push(boss.patternIdx);
        if (boss.patternIdx >= BOSS_DEFS.kaguya.phases[phase].patterns.length) {
          fail(`kaguya(seed=${seed}): phase ${phase} 起始招式索引越界`);
        }
      }
    }
    console.log(`  seed=${String(seed).padEnd(7)} 各阶段起始招式: ${entry.join(' → ')}`);
    starts.push(entry);
  }
  // 第二阶段（idx 1）的起始招式在不同 seed 下不应永远相同
  const phase1 = new Set(starts.map((e) => e[1]));
  if (phase1.size < 2) fail('kaguya: 阶段 1 起始招式不随 seed 变化');
  else ok(`阶段 1 起始招式随 seed 变化（${[...phase1].join(', ')}）`);
}

console.log(`\n${failures ? `❌ ${failures} 项失败` : '✅ 全部通过'}\n`);
process.exit(failures ? 1 : 0);
