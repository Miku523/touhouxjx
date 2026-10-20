// 统计每关 POWER 供给：平台关「p」道具数量 / 飞行关击破数（kill 走 POWER.kill）
import { readFileSync } from 'node:fs';

const levelsSrc = readFileSync(new URL('../src/assets/levels.js', import.meta.url), 'utf8');
console.log('levels.js 字节', levelsSrc.length);

// 直接按数据格式统计：每个 LEVELS 项里的 rows/gen 中 'p'、's'、'f' 的出现次数
const blocks = levelsSrc.split(/\n\s*\{\s*\n\s*id:/).slice(1);
for (const b of blocks) {
  const idm = /^'([^']+)'/.exec(b.trim());
  const id = idm ? idm[1] : '(?)';
  const nameM = /name:\s*'([^']*)'/.exec(b);
  const modeM = /mode:\s*'([^']*)'/.exec(b);
  const genM = /gen:\s*\{[^}]*\}/.exec(b);
  const rows = b;
  const count = (ch) => (rows.match(new RegExp(`'[^']*${ch}[^']*'`, 'g')) || []).reduce((n, s) => n + (s.match(new RegExp(ch, 'g')) || []).length, 0);
  console.log(JSON.stringify({
    id, name: nameM && nameM[1], mode: modeM && modeM[1],
    p: count('p'), s: count('s'), f: count('f'), gen: genM ? genM[0].slice(0, 80) : null,
  }));
}
