// 审计探针 8：检查点 / 出生点脚下瓦片（只读 src）。
// 设计约定：检查点必须落在实地上（跳过水面 / 冰面 / 尖刺 / 弹床）。
// 用法: node tools/_audit_checkpoints.mjs
import { LEVELS } from '../src/assets/levels.js';
import { buildLevelRows } from '../src/assets/levelgen.js';

const OK = new Set(['#', 'G', 'B', 'I']);
let anomalies = 0;
for (const def of LEVELS) {
  if (def.mode === 'stg') continue;
  const rows = buildLevelRows(def.gen).rows;
  const R = rows.length, C = rows[0].length;
  const list = [];
  for (let c = 0; c < C; c++) {
    for (let r = 0; r < R; r++) {
      const ch = rows[r][c];
      if (ch !== 'C' && ch !== 'P') continue;
      const under = r + 1 < R ? rows[r + 1][c] : '.';
      const entry = { kind: ch, col: c, row: r, under };
      list.push(entry);
      if (!OK.has(under)) {
        anomalies++;
        entry.BAD = under === 'M' ? '弹床：复活即在原地连续弹跳'
          : under === 'W' ? '水面：复活即落水'
            : under === '^' ? '尖刺：复活即受伤' : '悬空：脚下无实地';
        console.log(`[异常] ${def.id} ${ch}@col${c} row${r} 脚下='${under}' → ${entry.BAD}`);
      }
    }
  }
  console.log(`${def.id}: ${list.map((e) => `${e.kind}@${e.col}`).join(' ')}`);
}
console.log('异常总数:', anomalies);
