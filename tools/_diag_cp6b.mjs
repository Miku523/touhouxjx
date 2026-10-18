// 聚焦 stage6 最后一个检查点（col 3220）附近地形，逐列给出水面/平台/坑信息
import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

const lv = LEVELS.find((l) => l.id === 'stage6');
const { rows } = buildLevelRows(lv.gen);
const H = rows.length, W = rows[0].length;
const SOLID = new Set(['#', 'G', 'B', 'I', 'V', 'M', '^']);

console.log('--- ASCII cols 3140..3320 (rows 14..34) ---');
for (let y = 14; y < H; y++) {
  console.log(String(y).padStart(2) + ' |' + rows[y].slice(3140, 3320));
}
console.log('     ' + '^'.repeat(1));
console.log('col marker 3140 -> 3320, width', 3320 - 3140);

// 每列：最上层实体 + 地面（含 '=' 平台标为 p）
console.log('\n--- per-column: col:groundRow(surface) upperPlatformRows ---');
const out = [];
for (let x = 3140; x < 3320; x++) {
  let ground = -1, gch = '.';
  const platforms = [];
  for (let y = H - 1; y >= 0; y--) {
    const ch = rows[y][x];
    if (ch === '=') platforms.push(y);
    else if (SOLID.has(ch) && ground < 0) { ground = y; gch = ch; }
  }
  // 地面 = 最下面连续实心段的顶
  let g = -1, gc = '.';
  for (let y = H - 1; y >= 0; y--) {
    const ch = rows[y][x];
    if (SOLID.has(ch) || ch === 'W') { g = y; gc = ch; break; }
  }
  out.push(`${x}:${g}${gc}${platforms.length ? '[' + platforms.sort((a, b) => a - b).join(',') + ']' : ''}`);
}
for (let i = 0; i < out.length; i += 8) console.log(out.slice(i, i + 8).join('  '));

// 找出该区间的“坑”：没有任何实心/水柱的列
console.log('\n--- void columns (no floor at all) in 3140..3320 ---');
const voids = [];
for (let x = 3140; x < 3320; x++) {
  let has = false;
  for (let y = 0; y < H; y++) if (SOLID.has(rows[y][x])) { has = true; break; }
  if (!has) voids.push(x);
}
console.log(voids.join(', ') || '(none)');

// 每列的最低可站立面（考虑 '=' 单向平台也能站）
console.log('\n--- standing surfaces per col (lowest solid or "=" ) ---');
for (let x = 3140; x < 3320; x += 1) {
  let surf = [];
  for (let y = 0; y < H; y++) if (SOLID.has(rows[y][x]) || rows[y][x] === '=') surf.push(y);
  if (surf.length === 0) process.stdout.write(`\n${x}: VOID`);
}
console.log('');
