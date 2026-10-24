// 审计探针 7：静态可跳性规格核对（只读 src）。
// 对 5 个平台关扫描：相邻列地面高差、无底坑宽度、坑内是否有落脚、天花板净高。
// 用法: node tools/_audit_spec.mjs
import { LEVELS } from '../src/assets/levels.js';
import { buildLevelRows } from '../src/assets/levelgen.js';

const SOLID = new Set(['#', 'G', 'B', 'I', 'V']);
for (const def of LEVELS) {
  if (def.mode === 'stg') continue;
  const rows = buildLevelRows(def.gen).rows;
  const R = rows.length, C = rows[0].length;
  const cell = (c, r) => (c >= 0 && c < C && r >= 0 && r < R ? rows[r][c] : '.');
  const solid = (c, r) => SOLID.has(cell(c, r));
  const top = new Array(C).fill(R);
  for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) if (solid(c, r)) { top[c] = r; break; }

  // 相邻高差（忽略两侧都是坑的列）
  const steps = [];
  for (let c = 1; c < C; c++) {
    if (top[c - 1] >= R || top[c] >= R) continue;
    const d = top[c - 1] - top[c];
    if (d > 1) steps.push({ c, d, topL: top[c - 1], topR: top[c] });
  }
  // 无底坑：连续 top>=R 的列
  const gaps = [];
  for (let c = 0; c < C;) {
    if (top[c] < R) { c++; continue; }
    let e = c;
    while (e < C && top[e] >= R) e++;
    gaps.push({ from: c, to: e - 1, w: e - c });
    c = e;
  }
  const maxGap = gaps.reduce((a, g) => Math.max(a, g.w), 0);
  // 保留带：坑/台阶后 ±2 列内是否有 '=' 单向平台（可借力）
  const platNear = (c, rad = 3) => {
    for (let dc = -rad; dc <= rad; dc++) for (let r = 0; r < R; r++) if (cell(c + dc, r) === '=') return true;
    return false;
  };
  const bigSteps = steps.filter((s) => s.d > 2);
  const noHelper = bigSteps.filter((s) => !platNear(s.c));
  console.log(JSON.stringify({
    id: def.id, cols: C, maxGap,
    gapsOver4: gaps.filter((g) => g.w > 4),
    stepsOver1: steps.length,
    stepsOver2: bigSteps.length,
    stepsOver2NoPlatformNear: noHelper,
  }));
}
