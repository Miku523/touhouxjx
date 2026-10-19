// 纯逻辑：直接跑 levelgen 生成关卡，统计检查点/坑洞分布，可打印指定区段地形
// 用法: node tools/_mapdump.mjs [stageIdx] [col0] [col1]
import { LEVELS, TILE } from '../src/assets/levels.js';
import { buildLevelRows } from '../src/assets/levelgen.js';

const si = Number(process.argv[2] ?? 0);
const c0 = Number(process.argv[3] ?? -1);
const c1 = Number(process.argv[4] ?? -1);

const def = LEVELS[si];
console.log(`[${si}] ${def.id} ${def.name} mode=${def.mode} boss=${def.boss}`);
console.log('gen:', JSON.stringify(def.gen));

const built = buildLevelRows(def.gen ? def.gen : def);
const grid = built.rows;              // 每元素 = 一行字符串
const R = grid.length, C = grid[0].length;
const rowsOfCols = [];                // 转成每元素 = 一列
for (let c = 0; c < C; c++) { let s = ''; for (let r = 0; r < R; r++) s += grid[r][c] ?? ' '; rowsOfCols.push(s); }

const cols = rowsOfCols.length, rows = rowsOfCols[0].length;
console.log(`cols=${cols} rows=${rows}`);

const isSolid = (ch) => ch === '#' || ch === 'G' || ch === 'B' || ch === 'I' || ch === 'V';
const isGapCol = (c) => { for (let r = 0; r < rows; r++) if (isSolid(rowsOfCols[c][r])) return false; return true; };

// 检查点
const cps = [];
for (let c = 0; c < cols; c++) if (rowsOfCols[c].includes('C')) cps.push(c);
console.log('检查点列:', JSON.stringify(cps.sort((a, b) => a - b)));
if (cps.length > 1) {
  const s = cps.sort((a, b) => a - b);
  console.log('检查点间距:', JSON.stringify(s.slice(1).map((v, i) => v - s[i])));
  console.log('出生点(第一个 P)到首个检查点距离:', (() => { for (let c = 0; c < cols; c++) if (rowsOfCols[c].includes('P')) return s[0] - c; return -1; })());
}

// 宽坑
let cur = 0; const runs = [];
for (let c = 0; c < cols; c++) {
  if (isGapCol(c)) cur++;
  else { if (cur > 2) runs.push([c - cur, cur]); cur = 0; }
}
if (cur > 2) runs.push([cols - cur, cur]);
console.log(`宽坑(>2列) ${runs.length} 处:`, JSON.stringify(runs.slice(0, 20)));
const maxRun = runs.reduce((a, r) => Math.max(a, r[1]), 0);
console.log('最宽坑:', maxRun, '列 =', maxRun * TILE, 'px  (玩家跳跃水平距离参考: 380px/s × ~0.75s ≈ 285px ≈ 9列)');

if (c0 >= 0) {
  const a = Math.max(0, c0), b = Math.min(cols, c1 > 0 ? c1 : c0 + 60);
  console.log(`\n--- 地形 col ${a}..${b} ---`);
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = a; c < b; c++) line += rowsOfCols[c][r] ?? ' ';
    console.log(String(r).padStart(2) + ' ' + line);
  }
}
