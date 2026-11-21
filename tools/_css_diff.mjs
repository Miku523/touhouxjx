// 临时工具：比对 _css_snapshot.mjs 指纹，并用「同版本两次抓取的噪声路径」做容差。
// 用法: node tools/_css_diff.mjs before.json after.json [noise.json]
import { readFileSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const before = load(process.argv[2]);
const after = load(process.argv[3]);
const noise = process.argv[4] ? load(process.argv[4]) : null;

const diffPaths = (A, B) => {
  const out = new Set();
  for (const k of new Set([...Object.keys(A.map), ...Object.keys(B.map)])) if (A.map[k] !== B.map[k]) out.add(k);
  return out;
};

const noiseSet = new Set();
if (noise) for (const k of Object.keys(before)) if (noise[k]) for (const p of diffPaths(before[k], noise[k])) noiseSet.add(k + '|' + p);

let bad = 0;
for (const key of Object.keys(before)) {
  const A = before[key], B = after[key];
  if (!B) { console.log(key.padEnd(22), 'MISSING AFTER'); bad++; continue; }
  const d = diffPaths(A, B);
  const unexpected = [...d].filter((p) => !noiseSet.has(key + '|' + p));
  if (d.size || unexpected.length) {
    bad += unexpected.length;
    console.log(key.padEnd(22), `diff=${d.size}`.padEnd(10), `unexpected=${unexpected.length}`,
      unexpected.slice(0, 4).join('  '));
  }
}
console.log(bad === 0 ? 'VERDICT: OK (only known-volatile elements differ)' : `VERDICT: ${bad} unexpected element diffs`);
process.exit(bad === 0 ? 0 : 1);
