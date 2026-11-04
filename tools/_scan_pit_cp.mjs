// 全关卡静态扫描：1 列宽无底坑、检查点 ±8 列内的地面刷点（s）
// 用法: node tools/_scan_pit_cp.mjs
import { LEVELS } from '../src/assets/levels.js';
import { buildLevelRows } from '../src/assets/levelgen.js';

const SOLID = new Set(['#', 'G', 'B', 'I', 'V']);
let bad = 0;

LEVELS.forEach((def, si) => {
  if (def.mode !== 'platform' || !def.gen) return;   // STG 关没有地形坑
  const built = buildLevelRows(def.gen);
  const grid = built.rows;
  const R = grid.length, C = grid[0].length;
  const colArr = [];
  for (let c = 0; c < C; c++) { let s = ''; for (let r = 0; r < R; r++) s += grid[r][c] ?? ' '; colArr.push(s); }
  const isGapCol = (c) => { for (let r = 0; r < R; r++) if (SOLID.has(colArr[c][r])) return false; return true; };

  // 连续 1 列的无底坑（左右都是实地）
  const pits1 = [];
  for (let c = 1; c < C - 1; c++) {
    if (isGapCol(c) && !isGapCol(c - 1) && !isGapCol(c + 1)) pits1.push(c);
  }

  // 检查点列与贴脸刷点
  const cps = [];
  for (let c = 0; c < C; c++) if (colArr[c].includes('C')) cps.push(c);
  const nearS = [];
  for (let c = 0; c < C; c++) {
    const ci = colArr[c].indexOf('s');
    if (ci < 0) continue;
    for (const cp of cps) if (Math.abs(cp - c) <= 8) { nearS.push([c, cp]); break; }
  }

  console.log(`[${si}] ${def.id} cols=${C} 1列坑=${pits1.length ? pits1.join(',') : '无'} 检查点±8刷点=${nearS.length ? JSON.stringify(nearS) : '无'}`);
  bad += pits1.length + nearS.length;
});
console.log(bad ? `\n共 ${bad} 处问题` : '\n全部干净');
process.exit(bad ? 1 : 0);
