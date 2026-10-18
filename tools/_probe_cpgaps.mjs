import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

const { rows } = buildLevelRows(LEVELS.find((l) => l.id === 'stage6').gen);
const W = rows[0].length;
const cps = [];
for (let c = 0; c < W; c++) {
  for (let y = 0; y < rows.length; y++) {
    if (rows[y][c] === 'C') { cps.push(c); break; }
  }
}
// 坑 = 最底行是空气（整列贯穿到地下）
const isVoid = (c) => rows[rows.length - 1][c] === '.';
for (const c of cps) {
  const hits = [];
  for (let x = c + 1; x < Math.min(c + 80, W); x++) if (isVoid(x)) hits.push(x);
  const segs = [];
  let s = -1, prev = -2;
  for (const x of hits) { if (x !== prev + 1) { if (s >= 0) segs.push([s, prev]); s = x; } prev = x; }
  if (s >= 0) segs.push([s, prev]);
  console.log('checkpoint col', c, 'void gaps(<80):', JSON.stringify(segs));
}
console.log('--- 最后一个检查点后到 Boss 场（3670）的全部 void 段 ---');
const last = cps[cps.length - 1];
const all = [];
for (let x = last + 1; x < 3670; x++) if (isVoid(x)) all.push(x);
const segs2 = [];
let s2 = -1, p2 = -2;
for (const x of all) { if (x !== p2 + 1) { if (s2 >= 0) segs2.push([s2, p2]); s2 = x; } p2 = x; }
if (s2 >= 0) segs2.push([s2, p2]);
console.log('last cp', last, '-> 3670 voids:', JSON.stringify(segs2));
