import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

const { rows } = buildLevelRows(LEVELS.find((l) => l.id === 'stage6').gen);
const W = rows[0].length;
// 每列地表字符（从上往下第一个非空气）
const surf = (c) => {
  for (let y = 0; y < rows.length; y++) if (rows[y][c] !== '.' && rows[y][c] !== ' ') return rows[y][c];
  return '.';
};
for (const [a, b] of [[629, 646], [671, 674], [2608, 2612], [3248, 3250]]) {
  const chars = [];
  for (let x = a; x <= b; x++) chars.push(surf(x));
  console.log(a, '-', b, 'surface chars:', JSON.stringify(chars));
}
