import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

const { rows } = buildLevelRows(LEVELS.find((l) => l.id === 'stage6').gen);
const from = 3440, to = 3500;
for (let y = 14; y < rows.length; y++) {
  console.log(String(y).padStart(2) + ' ' + rows[y].slice(from, to));
}
console.log('    ' + Array.from({ length: to - from }, (_, i) => ((from + i) % 10)).join(''));
