import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

const { rows } = buildLevelRows(LEVELS.find((l) => l.id === 'stage6').gen);
console.log('cols', rows[0].length);
for (let c = 3660; c <= 3695; c++) {
  const col = rows.map((r) => r[c]);
  const top = col.findIndex((ch) => ch && ch !== '.' && ch !== ' ');
  console.log(c, 'topRow=', top, 'chars=', col.slice(20, 34).join(''));
}
