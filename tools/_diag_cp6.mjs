// 诊断 stage6 最后一个检查点附近地形（生成器产出的字符地图）
import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

const lv = LEVELS.find((l) => l.id === 'stage6');
const { rows } = buildLevelRows(lv.gen);
const H = rows.length;
const W = rows[0].length;
console.log('stage6 rows', H, 'cols', W);

const cp = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) if (rows[y][x] === 'C') cp.push({ x, y });
}
console.log('checkpoints', cp.length);
console.log(cp.map((c) => `col ${c.x} row ${c.y}`).join('\n'));

// 从最后一个检查点附近开始，打印地形剖面：每列最上面的实心/平台行
const last = cp[cp.length - 1];
const from = Math.max(0, last.x - 30);
const to = Math.min(W, W - 40);
console.log('\n--- top surface profile (col: topRow/char) ' + from + '..' + to);
const SOLID = new Set(['#', 'G', 'B', 'I', 'V', 'M', '=']);
let line = '';
const prof = [];
for (let x = from; x < to; x++) {
  let top = -1, ch = '.';
  for (let y = 0; y < H; y++) {
    if (SOLID.has(rows[y][x]) || rows[y][x] === '^') { top = y; ch = rows[y][x]; break; }
  }
  prof.push({ x, top, ch });
}
for (let i = 0; i < prof.length; i += 10) {
  console.log(prof.slice(i, i + 10).map((p) => `${p.x}:${p.top}${p.ch}`).join(' '));
}
console.log('\n--- ASCII around last checkpoint, cols ' + (last.x - 24) + '..' + (last.x + 30));
for (let y = Math.max(0, last.y - 10); y < H; y++) {
  console.log(String(y).padStart(2) + ' ' + rows[y].slice(Math.max(0, last.x - 24), last.x + 30));
}
