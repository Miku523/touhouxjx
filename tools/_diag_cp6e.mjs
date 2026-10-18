// 打印 stage6 检查点 3220 前后完整 ASCII（含浮空平台 =），判断"平台中间缺一段"在哪
import { buildLevelRows } from '../src/assets/levelgen.js';
import { LEVELS } from '../src/assets/levels.js';

const lv = LEVELS.find((l) => l.id === 'stage6');
const { rows } = buildLevelRows(lv.gen);
const H = rows.length;

const ranges = [[3160, 3300], [3300, 3440]];
for (const [a, b] of ranges) {
  console.log(`\n===== ${a}..${b} =====`);
  console.log('     ' + String(a).padEnd(6) + String(Math.floor((a + b) / 2)).padEnd(String(Math.floor((b - a) / 2) + 4) + 6) + b);
  for (let y = 0; y < H; y++) {
    const s = rows[y].slice(a, b);
    console.log(String(y).padStart(2) + '|' + s.replace(/\./g, ' '));
  }
}
