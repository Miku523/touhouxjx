import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

const { rows } = buildLevelRows(LEVELS.find((l) => l.id === 'stage6').gen);
const cols = rows[0].length;
const solid = new Set('#GBIVM^=');
const topOf = (x) => { for (let y = 0; y < rows.length; y++) if (solid.has(rows[y][x])) return y; return -1; };
const floorOf = (x) => { for (let y = rows.length - 1; y >= 0; y--) if (solid.has(rows[y][x])) return y; return -1; };

console.log('cols=', cols, 'rows=', rows.length);
for (let x = 3660; x <= 3719; x++) {
  const t = topOf(x), f = floorOf(x);
  const chars = [23, 24, 30, 31, 32, 33].map((y) => rows[y][x]).join('');
  console.log(`${x}  top=${t} floor=${f}  r23..33=${chars}`);
}
