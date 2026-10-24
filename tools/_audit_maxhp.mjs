// 实测各 Boss 在运行时（走 bossTuning 反推血量之后）的真实 maxHp。
// 用法：node tools/_audit_maxhp.mjs [port]
// 依赖 8138 的静态服务器（tools/serve_nocache.py 8138）。
import { launch } from './_pt_core.mjs';
import fs from 'node:fs';

const PORT = Number(process.argv[2]) || 9721;

const script = `(async () => {
  const m = await import('/src/game/boss.js');
  const keys = ['rumia','wriggle','cirno','aya','yuyuko','youmu','kaguya','remilia','flandre'];
  const diffs = ['E','N','H','L','EX'];
  const out = {};
  for (const k of keys) {
    out[k] = {};
    for (const d of diffs) {
      try {
        const b = new m.Boss(k, 0, 0, { difficulty: d, stageNumber: 0, seed: 1 });
        out[k][d] = { maxHp: b.maxHp, cards: b.phases.length, cardHp: b.phases.map(p => p.hp) };
      } catch (e) { out[k][d] = { error: String((e && e.message) || e) }; }
    }
  }
  return out;
})()`;

const T = await launch({ port: PORT, headless: true });
try {
  await T.boot({ query: '?v=test', waitTitle: 15000 });
  const data = await T.eval(script);
  const lines = ['key'.padEnd(10) + ['E', 'N', 'H', 'L', 'EX'].map((d) => d.padStart(9)).join('')];
  for (const [k, v] of Object.entries(data)) {
    lines.push(k.padEnd(10) + ['E', 'N', 'H', 'L', 'EX'].map((d) => {
      const c = v[d];
      return (c && c.maxHp != null ? String(c.maxHp) : 'ERR').padStart(9);
    }).join(''));
  }
  const text = lines.join('\n');
  console.log(text);
  fs.mkdirSync('_pt/audit', { recursive: true });
  fs.writeFileSync('_pt/audit/audit_maxhp.json', JSON.stringify(data, null, 2));
  fs.writeFileSync('_pt/audit/audit_maxhp.txt', text + '\n');
} finally {
  await T.close().catch(() => {});
}
