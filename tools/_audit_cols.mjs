// 审计探针 5：打印指定关卡指定列区间的完整高度 ASCII（含所有行）。
// 用法: node tools/_audit_cols.mjs <LEVELS index> <c0> <c1>
import { LEVELS } from '../src/assets/levels.js';
import { buildLevelRows } from '../src/assets/levelgen.js';

const si = Number(process.argv[2]);
const c0 = Number(process.argv[3]);
const c1 = Number(process.argv[4]);
const def = LEVELS[si];
const rows = buildLevelRows(def.gen).rows;
const R = rows.length, C = rows[0].length;
console.log(`[${si}] ${def.id} C=${C} R=${R}  cols ${c0}..${c1}`);
let hdr = '    ';
for (let c = c0; c <= c1; c++) hdr += c % 10 === 0 ? String(Math.floor(c / 10) % 10) : (c % 5 === 0 ? '+' : ' ');
console.log(hdr);
for (let r = 0; r < R; r++) {
  let line = '';
  for (let c = c0; c <= c1; c++) line += (c >= 0 && c < C) ? rows[r][c] : '.';
  if (!/[^.]/.test(line)) continue;
  console.log(String(r).padStart(3) + ' ' + line);
}
