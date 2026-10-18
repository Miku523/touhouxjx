// stage6 最后一个检查点(3220) 之后到 Boss 场的地形剖面 + 所有缺口宽度
import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

const lv = LEVELS.find((l) => l.id === 'stage6');
const { rows } = buildLevelRows(lv.gen);
const H = rows.length, W = rows[0].length;
const SOLID = new Set(['#', 'G', 'B', 'I', 'V', 'M', '^']);

function floorOf(x) {
  for (let y = H - 1; y >= 0; y--) if (SOLID.has(rows[y][x])) return y;
  return -1;
}
function topOf(x) {
  for (let y = 0; y < H; y++) if (SOLID.has(rows[y][x])) return y;
  return -1;
}

console.log('=== 3220..3660 surface profile ===');
for (let x = 3220; x < 3660; x += 10) {
  const seg = [];
  for (let i = 0; i < 10 && x + i < 3660; i++) seg.push(`${x + i}:${topOf(x + i)}`);
  console.log(seg.join(' '));
}

console.log('\n=== gaps (void cols) from 3220 to W ===');
const gaps = [];
let start = -1;
for (let x = 3220; x <= W; x++) {
  const voidc = x < W ? floorOf(x) < 0 : false;
  if (voidc && start < 0) start = x;
  if (!voidc && start >= 0) { gaps.push([start, x - 1, x - start]); start = -1; }
}
for (const [a, b, n] of gaps) console.log(`void ${a}..${b}  width ${n}`);
if (!gaps.length) console.log('(none)');

console.log('\n=== ASCII 3220..3400 rows 14..33 ===');
for (let y = 14; y < H; y++) console.log(String(y).padStart(2) + '|' + rows[y].slice(3220, 3400));
console.log('\n=== ASCII 3400..3580 rows 14..33 ===');
for (let y = 14; y < H; y++) console.log(String(y).padStart(2) + '|' + rows[y].slice(3400, 3580));
console.log('\n=== ASCII 3580..3720 rows 14..33 ===');
for (let y = 14; y < H; y++) console.log(String(y).padStart(2) + '|' + rows[y].slice(3580, 3720));

// 终点旗 / Boss 场
for (let y = 0; y < H; y++) {
  const i = rows[y].indexOf('F');
  if (i >= 0) console.log('\nflag F at col', i, 'row', y);
}
