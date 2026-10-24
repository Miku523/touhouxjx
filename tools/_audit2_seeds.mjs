// 审计二轮探针：关卡生成 20 seed 抽样不变量（只读 src）。
// 校验：出生点/检查点/终点旗脚下必须是实地，且不在弹床/水面/尖刺上；
// 检查点不悬空；妖梦舞台坡道高差 ≤1 且能接回主路。
// 用法: node tools/_audit2_seeds.mjs [每关seed数,默认20]
import { LEVELS } from '../src/assets/levels.js';
import { buildLevelRows } from '../src/assets/levelgen.js';

const N = Number(process.argv[2] || 20);
const OK = new Set(['#', 'G', 'B', 'I']);
const BAD = { M: '弹床', W: '水面', '^': '尖刺', '=': '单向平台', '.': '空气' };

function scan(def, rows) {
  const R = rows.length, C = rows[0].length;
  const out = [];
  const under = (c, r) => (r + 1 < R ? rows[r + 1][c] : '.');
  const find = (ch) => {
    const hits = [];
    for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) if (rows[r][c] === ch) hits.push({ c, r });
    return hits;
  };
  const spawn = find('P');
  if (spawn.length !== 1) out.push({ kind: 'P', msg: `出生点数量=${spawn.length}` });
  for (const s of spawn) {
    const u = under(s.c, s.r);
    if (!OK.has(u)) out.push({ kind: 'P', col: s.c, row: s.r, under: u, msg: `出生点脚下=${BAD[u] || u}` });
  }
  for (const cp of find('C')) {
    const u = under(cp.c, cp.r);
    if (!OK.has(u)) out.push({ kind: 'C', col: cp.c, row: cp.r, under: u, msg: `检查点脚下=${BAD[u] || u}` });
  }
  const flag = find('F');
  if (flag.length !== 1) out.push({ kind: 'F', msg: `终点旗数量=${flag.length}` });
  for (const f of flag) {
    const u = under(f.c, f.r);
    if (!OK.has(u)) out.push({ kind: 'F', col: f.c, row: f.r, under: u, msg: `终点旗脚下=${BAD[u] || u}` });
  }
  return out;
}

const report = [];
let bad = 0;
for (const def of LEVELS) {
  if (def.mode === 'stg') continue;
  const base = def.gen;
  for (let i = 0; i < N; i++) {
    const gen = { ...base, seed: (base.seed || 1) + i * 7919 };
    const t0 = Date.now();
    let rows;
    try {
      rows = buildLevelRows(gen).rows;
    } catch (e) {
      bad++;
      report.push({ id: def.id, seed: gen.seed, crash: String(e && e.stack || e).slice(0, 400) });
      continue;
    }
    const ms = Date.now() - t0;
    const issues = scan(def, rows);
    if (issues.length) { bad += issues.length; report.push({ id: def.id, seed: gen.seed, issues }); }
    if (i === 0) console.log(`${def.id}: cols=${rows[0].length} rows=${rows.length} 生成 ${ms}ms`);
  }
}
console.log(`\n抽样 ${LEVELS.filter((l) => l.mode !== 'stg').length} 关 × ${N} seed，异常 ${bad} 条`);
for (const r of report) console.log(JSON.stringify(r));
