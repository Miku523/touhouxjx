import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

let ok = true;
for (const def of LEVELS) {
  if (!def.gen) continue;
  const { rows, crumble } = buildLevelRows(def.gen);
  const len = rows[0].length;
  const bad = rows.some((r) => r.length !== len);
  // Boss 场入口列（最后 50 列的左边缘）
  const bossStart = Math.max(0, len - 50);
  const top = (c) => rows.findIndex((r) => r[c] !== '.' && r[c] !== ' ');
  const before = top(bossStart - 1);
  const after = top(bossStart);
  console.log(def.id, 'rows', rows.length, 'cols', len, 'uniform', !bad,
    'crumble', crumble.length, 'bossEntry', before, '->', after, 'drop', after - before);
  if (bad) ok = false;
}
console.log(ok ? 'ALL OK' : 'MISMATCH');
