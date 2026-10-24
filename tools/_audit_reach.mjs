// 审计探针：纯 Node 生成 5 个平台关（与难度无关，地形只由 gen 决定），
// 扫描出生点 / 检查点 / Boss 场入口 / 舞台出口 / 中段妖梦舞台 附近的
// 高墙、天花板压顶、断头路、掉出地图隐患。只读，不改 src。
import { LEVELS } from '../src/assets/levels.js';
import { buildLevelRows } from '../src/assets/levelgen.js';

const SOLID = new Set(['#', 'G', 'B', 'I', 'V']);
const WATER = 'W';
const SPIKE = '^';
const ONE_WAY = '=';
const MAX_CLIMB_ROWS = 7;   // 二段跳理论抬升 ≈ 221px ≈ 6.9 行
const MAX_PIT_COLS = 6;     // 满速跳跃水平 ≈ 243px ≈ 7.6 列，留 1 列余量

const TILE = 32;
const results = [];
function add(levelId, sev, kind, col, detail) {
  results.push({ levelId, sev, kind, col, detail });
}

for (const def of LEVELS) {
  if (!def.gen || def.gen.kind !== 'platform') continue;
  const built = buildLevelRows(def.gen);
  const rows = built.rows;
  const R = rows.length, C = rows[0].length;
  const cell = (c, r) => (c >= 0 && c < C && r >= 0 && r < R ? rows[r][c] : '.');
  // 每列地表：第一个实心（含单向平台? 平台不是地面，单独算）
  const top = new Array(C).fill(-1);
  const gap = new Array(C).fill(true);
  for (let c = 0; c < C; c++) {
    for (let r = 0; r < R; r++) {
      const ch = cell(c, r);
      if (SOLID.has(ch)) { top[c] = r; gap[c] = false; break; }
    }
  }
  // 实体位置
  const findChar = (ch) => { const out = []; for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) if (cell(c, r) === ch) { out.push({ c, r }); break; } return out; };
  const spawn = findChar('P');
  const cps = findChar('C');
  const flag = findChar('F');
  const bossStart = C - 50;
  const mid = built.midboss || null;

  const keyPts = [];
  if (spawn[0]) keyPts.push({ name: '出生点', c: spawn[0].c });
  for (const cp of cps) keyPts.push({ name: '检查点', c: cp.c });
  keyPts.push({ name: 'Boss场入口', c: bossStart });
  keyPts.push({ name: '末旗', c: flag[0] ? flag[0].c : C - 8 });
  if (mid) { keyPts.push({ name: '妖梦舞台左界', c: mid.from }); keyPts.push({ name: '妖梦舞台右界', c: mid.to }); }

  // 1) 相邻列高差（下一列比当前列高 = 墙）
  let maxUp = 0, maxUpAt = -1;
  for (let c = 1; c < C; c++) {
    if (gap[c] || gap[c - 1]) continue;
    const up = top[c - 1] - top[c]; // >0 表示右列更高
    if (up > maxUp) { maxUp = up; maxUpAt = c; }
    if (up > 3) add(def.id, up >= MAX_CLIMB_ROWS ? 'P1' : 'P2', '高墙', c, `col ${c - 1}->${c} 抬高 ${up} 行 (${up * TILE}px)`);
  }
  // 2) 天花板压顶：地表上方 0..2 行内有实心
  for (let c = 0; c < C; c++) {
    if (gap[c]) continue;
    const t = top[c];
    let solidAbove = -1;
    for (let d = 1; d <= 3; d++) if (SOLID.has(cell(c, t - d)) || cell(c, t - d) === ONE_WAY) { solidAbove = d; break; }
    if (solidAbove === 2 || solidAbove === 3) add(def.id, 'P2', '天花板压顶', c, `col ${c} 地表 row ${t}，上方 ${solidAbove} 行即实心（通行高 ${solidAbove} 行）`);
    if (solidAbove === 1) add(def.id, 'P1', '天花板贴地', c, `col ${c} 地表 row ${t}，紧邻上方即实心`);
  }
  // 3) 无底坑宽度
  let run = 0, runStart = 0;
  for (let c = 0; c <= C; c++) {
    const isGap = c < C && gap[c];
    if (isGap) { if (run === 0) runStart = c; run++; }
    else if (run > 0) {
      if (run > MAX_PIT_COLS) add(def.id, 'P1', '宽无底坑', runStart, `col ${runStart}..${runStart + run - 1} 宽 ${run} 列 (${run * TILE}px)`);
      run = 0;
    }
  }
  // 4) 关键点上下文检查（±80 列窗口）
  for (const kp of keyPts) {
    const c0 = Math.max(1, kp.c - 80), c1 = Math.min(C - 1, kp.c + 80);
    // 关键点是否悬空/水上/刺上
    if (kp.name === '检查点' || kp.name === '出生点') {
      const r = kp.name === '出生点' ? spawn[0].r : cps.find((x) => x.c === kp.c).r;
      const under = cell(kp.c, r + 1);
      if (!SOLID.has(under) && under !== WATER) add(def.id, 'P0', '关键点悬空', kp.c, `${kp.name} col ${kp.c} 下方是 '${under}'`);
      if (under === WATER) add(def.id, 'P1', '检查点在水上', kp.c, `${kp.name} col ${kp.c} 下方是水`);
      if (cell(kp.c, r) === SPIKE || cell(kp.c, r + 1) === SPIKE) add(def.id, 'P0', '关键点在刺上', kp.c, `${kp.name} col ${kp.c}`);
      // 头顶空间
      for (let d = 1; d <= 2; d++) if (SOLID.has(cell(kp.c, r - d))) add(def.id, 'P1', '关键点头顶压顶', kp.c, `${kp.name} col ${kp.c} 头顶 ${d} 行实心`);
    }
    if (kp.name === 'Boss场入口') {
      const prevTop = top[bossStart - 1];
      const diff = prevTop - top[bossStart]; // >0 表示场地更低（跳下）
      if (diff >= 4) {
        // 允许通过单向平台缓冲；检查入口前 18 列是否有 '='
        let hasPlat = false;
        for (let c = bossStart - 1; c < Math.min(C, bossStart + 18); c++) for (let r = 0; r < R; r++) if (cell(c, r) === '=') hasPlat = true;
        if (!hasPlat) add(def.id, 'P1', 'Boss场入口落差无缓冲', bossStart, `入口前一列 row ${prevTop} -> 场地 row ${top[bossStart]}，落差 ${diff} 行且无单向平台`);
      }
    }
    // 窗口内的墙（供人工核查）
    const walls = [];
    for (let c = Math.max(1, c0); c <= c1; c++) {
      if (gap[c] || gap[c - 1]) continue;
      const up = top[c - 1] - top[c];
      if (up > 3) walls.push({ c, up });
    }
    if (walls.length) add(def.id, 'P2', `${kp.name}附近高墙`, kp.c, JSON.stringify(walls.slice(0, 6)));
  }
  // 5) 中段妖梦舞台几何复核（stage5）
  const midInfo = { level: def.id, C, bossStart, spawn: spawn[0]?.c, cps: cps.map((x) => x.c), flag: flag[0]?.c, topMaxUp: maxUp, topMaxUpAt: maxUpAt, mid };
  if (mid) {
    const h = R;
    const solidCh = SOLID;
    const topOf = (c) => { for (let r = 0; r < h; r++) if (solidCh.has(cell(c, r))) return r; return h; };
    const rampLen = Math.min(14, C - mid.to - 51);
    const rampInfo = { ms: mid.from, me: mid.to, rampLen, exitTop: topOf(mid.to + rampLen), tops: [] };
    for (let i = -2; i <= rampLen + 3; i++) rampInfo.tops.push({ c: mid.to + i, top: topOf(mid.to + i) });
    let stepMax = 0;
    for (let i = 0; i < rampLen; i++) stepMax = Math.max(stepMax, Math.abs(topOf(mid.to + i + 1) - topOf(mid.to + i)));
    rampInfo.stepMax = stepMax;
    // 坡道上方的残留实心（挖空是否生效）
    let overhangSolid = 0;
    for (let i = 0; i < rampLen; i++) for (let r = 0; r < topOf(mid.to + i); r++) if (solidCh.has(cell(mid.to + i, r))) overhangSolid++;
    rampInfo.overhangSolid = overhangSolid;
    // 舞台内是否真的是平地（all top == ground）
    let arenaMin = 1e9, arenaMax = -1;
    for (let c = mid.from; c < mid.to; c++) { arenaMin = Math.min(arenaMin, topOf(c)); arenaMax = Math.max(arenaMax, topOf(c)); }
    rampInfo.arenaTopRange = [arenaMin, arenaMax];
    midInfo.ramp = rampInfo;
    console.log(`\n[${def.id}] midboss ${JSON.stringify(rampInfo)}`);
  }
  console.log(`[${def.id}] C=${C} 高差最大 ${maxUp}@${maxUpAt} 检查点=${cps.length} 宽坑=${results.filter((r) => r.levelId === def.id && r.kind === '宽无底坑').length} 问题数=${results.filter((r) => r.levelId === def.id).length}`);
  console.log('  keyPts:', JSON.stringify(keyPts.map((k) => [k.name, k.c])));
}

console.log('\n=== 汇总 ===');
const bySev = (s) => results.filter((r) => r.sev === s);
for (const s of ['P0', 'P1', 'P2']) console.log(s, bySev(s).length);
const show = (s, limit = 40) => { for (const r of bySev(s).slice(0, limit)) console.log(`[${r.sev}][${r.levelId}] ${r.kind} @col ${r.col}: ${r.detail}`); };
show('P0'); show('P1'); 
console.log('--- P2 (前 30) ---'); show('P2', 30);
console.log('\nJSON_BEGIN');
console.log(JSON.stringify({ results, meta: null }, null, 1));
console.log('JSON_END');
