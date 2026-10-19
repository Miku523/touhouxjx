/**
 * 优化前后数据分家：
 *  - perf.json 里保存着优化实施前的 env 矩阵（A 144.19ms 等），抽成 _pt/perf/env-before.json；
 *  - 当前 _pt/perf/env.json / env-summary.json 是优化实施后的重跑（A 30.83ms 等），复制为 env-after.json。
 * 只做数据整理，不重跑实验。  node tools/_pt_perf_split_before.mjs
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const R = (p) => JSON.parse(readFileSync(p, 'utf8'));
const W = (p, o) => writeFileSync(p, JSON.stringify(o, null, 1), 'utf8');

const perf = R('_pt/perf/perf.json');
const before = {
  generatedAt: perf.generatedAt,
  note: '优化实施前的数据（从 perf.json 的 envMatrix 抽取；原始 env.json 已被优化后的重跑覆盖）',
  summary: perf.envMatrix.game6s,
  baseSummary: perf.envMatrix.simplestCanvasPage,
  rendererStrings: perf.envMatrix.rendererStrings,
};
W('_pt/perf/env-before.json', before);

copyFileSync('_pt/perf/env.json', '_pt/perf/env-after.json');
copyFileSync('_pt/perf/env-summary.json', '_pt/perf/env-summary-after.json');
const after = R('_pt/perf/env-after.json');
console.log('[split] before configs:', before.summary.map((s) => `${s.config}=${s.avg}ms`).join(' '));
console.log('[split] after  configs:', after.summary.map((s) => `${s.config}=${s.avg}ms backing=${s.backing} canvas=${s.canvas} postLevel=${s.postLevel}`).join(' '));
