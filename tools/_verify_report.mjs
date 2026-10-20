#!/usr/bin/env node
/**
 * verifier 独立复核 · 汇总基线/改造后测量 → 表格 + JSON
 *
 * 输入：
 *   _pt/vb_<tag>_s1..s6.json, _pt/vb_<tag>_ex.json   （tools/_verify_stage.mjs 输出）
 *   --static <json>                                 （tools/_verify_static.mjs 输出）
 *   --bright <json>                                 （tools/_verify_bright.mjs 的 meta.json，含 png 路径）
 * 亮度数值由 Python 脚本单独算好放进 --luma（tools/_verify_luma.py --json 输出），可选。
 *
 * 用法：
 *   node tools/_verify_report.mjs --tag base --static _pt/verify_static_baseline.json \
 *        --bright _pt/bright/baseline/meta.json --luma _pt/verify_bright_baseline.json \
 *        --out _pt/verify_baseline.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';

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
const TAG = argv.tag || 'base';
const DIR = argv.dir || '_pt';
const OUT = argv.out || `_pt/verify_${TAG}.json`;
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const readJson = (p) => { try { return JSON.parse(readFileSync(resolve(p), 'utf8')); } catch { return null; } };

const stages = [1, 2, 3, 4, 5, 6, 'ex'];
const stageFiles = {};
for (const s of stages) {
  const name = s === 'ex' ? `${DIR}/vb_${TAG}_ex.json` : `${DIR}/vb_${TAG}_s${s}.json`;
  stageFiles[s] = readJson(name);
}
const stat = argv.static ? readJson(argv.static) : null;
const brightMeta = argv.bright ? readJson(argv.bright) : null;
const luma = argv.luma ? readJson(argv.luma) : null;

// 亮度：file basename -> center
const lumaByFile = {};
if (luma && luma.rows) for (const r of luma.rows) lumaByFile[basename(r.file)] = r.center;
const brightByStage = {};
if (brightMeta && brightMeta.rows) {
  for (const r of brightMeta.rows) {
    const pct = r.prog;
    const file = basename(r.file);
    const n = r.extra || r.stage === 'EXTRA' ? 7 : Number((String(r.stage).match(/(\d+)/) || [])[1]);
    (brightByStage[n] ||= {})[pct] = lumaByFile[file] ?? null;
  }
}

// 静态：stage index -> row
const statByIndex = {};
if (stat && stat.rows) for (const r of stat.rows) statByIndex[r.index] = r;

const rows = [];
for (const s of stages) {
  const n = s === 'ex' ? 7 : s;
  const v = stageFiles[s] || {};
  const st = statByIndex[n] || {};
  const b = v.boss || {};
  const row = {
    stage: n,
    label: s === 'ex' ? 'EX' : `S${n}`,
    mode: st.mode || v.mode || null,
    levelW: v.levelW || st.w || null,
    screens: r2(st.screens ?? (v.levelW ? v.levelW / 1280 : null)),
    midSec: v.midSec ?? null,
    bossSec: v.bossSec ?? null,
    totalSec: v.totalSec ?? null,
    midPct: v.ratios ? Math.round(v.ratios.mid * 1000) / 10 : null,
    bossPct: v.ratios ? Math.round(v.ratios.boss * 1000) / 10 : null,
    bossKey: b.key || null,
    maxHp: b.maxHp ?? null,
    spellCount: Array.isArray(b.phases) ? b.phases.length : null,
    poiseMax: v.poiseMaxFirst ?? b.poiseMax ?? null,
    staggerCount: v.staggers ?? null,
    maxPoise: v.maxPoise ?? null,
    maxBulletsBoss: v.maxBulletsBoss ?? null,
    maxBulletsAll: v.maxBulletsAll ?? null,
    spawnCount: st.spawn ? st.spawn.count : null,
    spawnPerScreen: st.perScreen ? st.perScreen.count : null,
    hpPerScreen: st.perScreen ? st.perScreen.hp : null,
    maxInScreen: st.perScreen ? st.perScreen.maxInScreen : null,
    deaths: v.deaths ?? null,
    gameovers: v.gameovers ?? null,
    consoleErrors: Array.isArray(v.consoleErrors) ? v.consoleErrors.length : null,
    stall: v.stall || null,
    ok: v.ok ?? false,
    bail: v.bail || null,
    bright: brightByStage[n] || null,
  };
  rows.push(row);
}

const out = { tag: TAG, generatedAt: new Date().toISOString(), rows, sources: { static: argv.static || null, bright: argv.bright || null, luma: argv.luma || null } };
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), JSON.stringify(out, null, 2));

const hdr = ['面', '模式', 'w', '屏', '道中s', 'Boss s', '合计s', '道中%', 'Boss%', 'Boss', 'maxHp', '符', '破势上限', '破次数', '峰Boss弹', '峰全弹', '生成数', '个/屏', 'HP/屏', 'p10', 'p50', 'p85', '死亡', 'err'];
console.log(hdr.join('\t'));
for (const r of rows) {
  const br = r.bright || {};
  console.log([
    r.label, r.mode, r.levelW, r.screens, r.midSec, r.bossSec, r.totalSec, r.midPct, r.bossPct,
    r.bossKey, r.maxHp, r.spellCount, r.poiseMax, r.staggerCount, r.maxBulletsBoss, r.maxBulletsAll,
    r.spawnCount, r.spawnPerScreen, r.hpPerScreen,
    br[10] ?? br['10'] ?? null, br[50] ?? br['50'] ?? null, br[85] ?? br['85'] ?? null,
    r.deaths, r.consoleErrors,
  ].join('\t'));
}
console.log('\nsaved ->', OUT);
