// stage6 最后一个检查点之后 → Boss 场入口的地形精确剖面（精简输出）
import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

const lv = LEVELS.find((l) => l.id === 'stage6');
const { rows } = buildLevelRows(lv.gen);
const H = rows.length, W = rows[0].length;
const SOLID = new Set(['#', 'G', 'B', 'I', 'V', 'M', '^']);

function floorOf(x) { for (let y = H - 1; y >= 0; y--) if (SOLID.has(rows[y][x])) return y; return -1; }
function topOf(x) { for (let y = 0; y < H; y++) if (SOLID.has(rows[y][x])) return y; return -1; }
function col(x) { return Array.from({ length: H }, (_, y) => rows[y][x]).join(''); }

console.log(`H=${H} W=${W}`);
console.log('\n=== void 段 (没有实心列) 3221..${W - 1} ===');
const gaps = [];
let start = -1;
for (let x = 3221; x <= W; x++) {
  const v = x < W ? floorOf(x) < 0 : false;
  if (v && start < 0) start = x;
  if (!v && start >= 0) { gaps.push([start, x - 1]); start = -1; }
}
for (const [a, b] of gaps) console.log(`void ${a}..${b} width=${b - a + 1}`);
if (!gaps.length) console.log('(none)');

console.log('\n=== 3640..3719 逐列 top/floor ===');
let line = '';
for (let x = 3640; x <= 3719; x++) {
  const t = topOf(x), f = floorOf(x);
  line += `${x}:t${t}/f${f}  `;
  if ((x - 3639) % 5 === 0) { console.log(line); line = ''; }
}
if (line) console.log(line);

console.log('\n=== 3640..3719 rows 20..33 ===');
for (let y = 20; y < H; y++) console.log(String(y).padStart(2) + '|' + rows[y].slice(3640, 3720));

console.log('\n=== 3220..3250 rows 18..25 ===');
for (let y = 18; y < 26; y++) console.log(String(y).padStart(2) + '|' + rows[y].slice(3220, 3251));

console.log('\n=== 检查点/C/B 位置 ===');
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const ch = rows[y][x];
    if (ch === 'C' || ch === 'F') console.log(`${ch} at col=${x} row=${y}`);
  }
}
