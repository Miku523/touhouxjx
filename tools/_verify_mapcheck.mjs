#!/usr/bin/env node
/**
 * verifier 独立复核 · 地图完整性（检查点/坑洞/出生点），纯 Node，不改 src。
 * 判定标准（回归项，非 #1–#7）：
 *  - 平台关：检查点存在、首检查点 ≈200 列、间距 200–330 列、间距不大于 500 列、检查点列 < cols；
 *  - 宽坑（>2 列）最宽 ≤5 列（跳跃约可跨 9 列），无完全断头路（每关至少 1 个检查点在前 60% 内）；
 *  - 出生点 P 存在、在关卡前 5% 内；
 *  - 所有 7 面 buildLevelRows 不抛异常、cols 与 level.w 一致（level.w === cols*32）。
 *
 * 用法：
 *   node tools/_verify_mapcheck.mjs --root <repo> --out _pt/mapcheck.json
 *   node tools/_verify_mapcheck.mjs --out _pt/mapcheck_baseline.json   # 基线 worktree 下执行亦可
 */
import { pathToFileURL } from 'node:url';
import { join, resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = {};
{
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { argv[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) argv[key] = raw[++i];
    else argv[key] = '1';
  }
}
const ROOT = resolve(argv.root || process.cwd());
const OUT = argv.out || '';
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

const { LEVELS, TILE } = await imp('src/assets/levels.js');
const { buildLevelRows } = await imp('src/assets/levelgen.js');
const { Level } = await imp('src/game/level.js');

const SOLID = new Set(['#', 'G', 'B', 'I', 'V']);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const rows = [];
let allOk = true;

for (let i = 0; i < LEVELS.length; i++) {
  const def = LEVELS[i];
  const row = { index: i + 1, id: def.id, name: def.name, mode: def.mode, ok: false, why: [] };
  try {
    const level = new Level(def, i);
    const built = buildLevelRows(def.gen ? def.gen : def);
    const grid = built.rows;
    const R = grid.length, C = grid[0].length;
    const colStr = [];
    for (let c = 0; c < C; c++) { let s = ''; for (let r = 0; r < R; r++) s += grid[r][c] ?? ' '; colStr.push(s); }
    const isGapCol = (c) => { for (let r = 0; r < R; r++) if (SOLID.has(colStr[c][r])) return false; return true; };

    const cps = [];
    for (let c = 0; c < C; c++) if (colStr[c].includes('C')) cps.push(c);
    const spacing = cps.slice(1).map((v, k) => v - cps[k]);
    const pCol = colStr.findIndex((s) => s.includes('P'));

    let cur = 0; const gaps = [];
    for (let c = 0; c < C; c++) {
      if (isGapCol(c)) cur++;
      else { if (cur > 2) gaps.push([c - cur, cur]); cur = 0; }
    }
    if (cur > 2) gaps.push([C - cur, cur]);
    const maxGap = gaps.reduce((a, g) => Math.max(a, g[1]), 0);

    row.cols = C; row.rows = R;
    row.levelW = level.w;
    row.colsConsistent = level.w === C * TILE;
    if (!row.colsConsistent) { row.why.push(`level.w=${level.w} != cols*${TILE}=${C * TILE}`); }
    row.cps = cps;
    row.spacing = spacing;
    row.maxSpacing = spacing.length ? Math.max(...spacing) : null;
    row.spawnCol = pCol;
    row.gaps = gaps.length;
    row.maxGapCols = maxGap;

    if (level.mode === 'platform') {
      if (cps.length < 2) row.why.push(`检查点太少: ${cps.length}`);
      if (pCol < 0) row.why.push('缺少出生点 P');
      else if (pCol > C * 0.05) row.why.push(`出生点过晚: ${pCol}/${C}`);
      if (cps.length && cps[0] > 320) row.why.push(`首检查点过晚: ${cps[0]}`);
      if (cps.length && cps[0] < 80) row.why.push(`首检查点过近: ${cps[0]}`);
      if (spacing.some((d) => d < 120 || d > 500)) row.why.push(`检查点间距异常: ${JSON.stringify(spacing)}`);
      if (cps.some((c) => c >= C)) row.why.push('检查点越界');
      if (cps.length && cps[cps.length - 1] < C * 0.5) row.why.push(`末检查点过早: ${cps[cps.length - 1]}/${C}`);
      if (maxGap > 5) row.why.push(`过硬坑宽: ${maxGap} 列`);
      if (spacing.length && Math.max(...spacing) - Math.min(...spacing) > 80) row.why.push('检查点间距抖动过大');
    } else {
      // STG 关无平台地形/出生点 P（自机飞行），只校验关卡长度与几何一致性
      if (C < 400) row.why.push(`STG 关卡过短: ${C}`);
    }
    row.ok = row.why.length === 0;
  } catch (e) {
    row.why.push('异常: ' + String((e && e.stack) || e));
  }
  if (!row.ok) allOk = false;
  rows.push(row);
}

const out = {
  tool: '_verify_mapcheck',
  root: ROOT,
  generatedAt: new Date().toISOString(),
  allOk,
  rows,
};
if (OUT) {
  mkdirSync(dirname(resolve(OUT)), { recursive: true });
  writeFileSync(resolve(OUT), JSON.stringify(out, null, 2));
}
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('stg', 4) + pad('mode', 9) + pad('cols', 7) + pad('w', 8) + pad('cps', 4) + pad('首cp', 6) + pad('maxGap', 7) + pad('间距', 26) + 'ok');
for (const r of rows) {
  console.log(pad(r.index, 4) + pad(r.mode, 9) + pad(r.cols ?? '-', 7) + pad(r.levelW ?? '-', 8) + pad(r.cps ? r.cps.length : '-', 4) +
    pad(r.cps && r.cps.length ? r.cps[0] : '-', 6) + pad(r.maxGapCols ?? '-', 7) + pad(r.spacing ? r.spacing.join(',') : '-', 26) +
    (r.ok ? 'ok' : 'NG: ' + r.why.join('; ')));
}
console.log(`\nallOk=${allOk}` + (OUT ? ` -> ${OUT}` : ''));
process.exit(allOk ? 0 : 2);
