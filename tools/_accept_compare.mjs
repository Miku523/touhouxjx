// 验收对比：基线 _pt/base_*.json vs 改后 _pt/after_*.json
// 用法: node tools/_accept_compare.mjs [--after-prefix _pt/after]
import fs from 'node:fs';
import { existsSync } from 'node:fs';

const argv = (() => {
  const a = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2);
    const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : '1';
    o[k] = v;
  }
  return o;
})();
const P = argv['after-prefix'] || '_pt/after';
const STAGES = [['S1', '_pt/base_s1.json', `${P}_s1.json`], ['S2', '_pt/base_s2.json', `${P}_s2.json`],
  ['S3', '_pt/base_s3.json', `${P}_s3.json`], ['S4', '_pt/base_s4.json', `${P}_s4.json`],
  ['S5', '_pt/base_s5.json', `${P}_s5.json`], ['S6', '_pt/base_s6.json', `${P}_s6.json`],
  ['EX', '_pt/base_ex.json', `${P}_ex.json`]];

const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const r1 = (v) => (v == null ? '—' : Math.round(v * 10) / 10);
let bad = 0;
console.log('stage | midSec base→after | bossSec base→after | maxBullets base→after (%Δ) | errors | verdict');
for (const [name, bf, af] of STAGES) {
  const b = rd(bf), a = rd(af);
  if (!a) { console.log(`${name} | MISSING ${af}`); bad++; continue; }
  const errs = (a.consoleErrors || []).length;
  const bulletDelta = b && b.maxBulletsAll > 0 ? (a.maxBulletsAll / b.maxBulletsAll - 1) * 100 : null;
  const midDelta = b && b.midSec != null && a.midSec != null ? (a.midSec / b.midSec - 1) * 100 : null;
  const flags = [];
  if (!a.ok) flags.push('not-ok' + (a.bail ? `(${a.bail})` : ''));
  if (errs) flags.push(`consoleErrors=${errs}`);
  if (bulletDelta != null && bulletDelta > 35) flags.push(`bullets+${bulletDelta.toFixed(0)}%`);
  // 道中时间只作观察：小怪翻倍 + 小头目会自然变长，>60% 才提示
  if (midDelta != null && midDelta > 60) flags.push(`mid+${midDelta.toFixed(0)}%`);
  const verdict = flags.length ? 'WARN ' + flags.join(',') : 'PASS';
  if (flags.length) bad++;
  console.log(`${name} | ${r1(b?.midSec)}→${r1(a.midSec)}${midDelta == null ? '' : ` (${midDelta >= 0 ? '+' : ''}${midDelta.toFixed(0)}%)`}`
    + ` | ${r1(b?.bossSec)}→${r1(a.bossSec)} | ${b?.maxBulletsAll ?? '—'}→${a.maxBulletsAll}`
    + `${bulletDelta == null ? '' : ` (${bulletDelta >= 0 ? '+' : ''}${bulletDelta.toFixed(0)}%)`} | ${errs} | ${verdict}`);
}
console.log(bad ? `\n${bad} 项需人工复核` : '\n全部 PASS');
