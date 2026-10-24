// 审计探针 2：复核第一轮扫描的可疑点（高墙是否真有绕行/平台，检查点是否落在弹床等）。
// 只读，不改 src。
import { LEVELS } from '../src/assets/levels.js';
import { buildLevelRows } from '../src/assets/levelgen.js';

const SOLID = new Set(['#', 'G', 'B', 'I', 'V']);
const T = 32;

function load(def) {
  const built = buildLevelRows(def.gen);
  const rows = built.rows;
  const R = rows.length, C = rows[0].length;
  const cell = (c, r) => (c >= 0 && c < C && r >= 0 && r < R ? rows[r][c] : '.');
  const top = new Array(C).fill(-1), gap = new Array(C).fill(true);
  for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) { if (SOLID.has(cell(c, r))) { top[c] = r; gap[c] = false; break; } }
  return { built, rows, R, C, cell, top, gap };
}

function dump(L, c0, c1, r0 = 0, r1 = L.R - 1) {
  console.log(`--- col ${c0}..${c1} ---`);
  const head = '    '; let h = '';
  for (let c = c0; c < c1; c++) h += c % 10 === 0 ? String(Math.floor(c / 10) % 10) : ' ';
  console.log(head + h);
  for (let r = r0; r < r1; r++) {
    let line = '';
    for (let c = c0; c < c1; c++) line += L.cell(c, r);
    console.log(String(r).padStart(3) + ' ' + line);
  }
}

function platformsIn(L, c0, c1, r0, r1) {
  const out = [];
  for (let c = Math.max(0, c0); c <= Math.min(L.C - 1, c1); c++) for (let r = Math.max(0, r0); r <= Math.min(L.R - 1, r1); r++) if (L.cell(c, r) === '=') out.push({ c, r });
  return out;
}

const si = Number(process.argv[2]);
const cols = (process.argv[3] || '').split(',').filter(Boolean).map(Number);
const def = LEVELS[si];
const L = load(def);
console.log(`[${si}] ${def.id} C=${L.C} R=${L.R}`);

// 关键列上下文：墙点附近高差 + 附近 30 列内单向平台
for (const c of cols) {
  console.log(`\n>>> col ${c}: top[${c - 1}]=${L.top[c - 1]} top[${c}]=${L.top[c]} 高差 ${L.top[c - 1] - L.top[c]} 行`);
  const plats = platformsIn(L, c - 12, c + 12, Math.min(L.top[c - 1], L.top[c]) - 6, L.top[c] - 1);
  console.log('  附近单向平台:', JSON.stringify(plats));
  dump(L, Math.max(0, c - 14), Math.min(L.C, c + 14), Math.max(0, Math.min(L.top[c - 1], L.top[c]) - 8), Math.min(L.R, Math.max(L.top[c - 1], L.top[c]) + 4));
}

// 检查点/出生点脚下的瓦片
if (cols.length === 0) {
  for (let c = 0; c < L.C; c++) {
    for (let r = 0; r < L.R; r++) {
      if (L.cell(c, r) === 'C' || L.cell(c, r) === 'P') {
        const ch = L.cell(c, r);
        const under = L.cell(c, r + 1);
        console.log(`${ch} @ col ${c} row ${r} 脚下='${under}' ${under === 'M' ? '  <<< 弹床' : ''} ${under === 'W' ? '  <<< 水' : ''} ${under === '^' ? '  <<< 刺' : ''}`);
      }
    }
  }
  // 所有弹床/水面上的检查点
  let n = 0;
  for (let c = 0; c < L.C; c++) for (let r = 0; r < L.R; r++) {
    if (L.cell(c, r) === 'C') {
      const under = L.cell(c, r + 1);
      if (under === 'M' || under === 'W') { console.log(`!! 检查点 col ${c} 脚下 '${under}'`); n++; }
    }
  }
  console.log('异常检查点数:', n);
}
