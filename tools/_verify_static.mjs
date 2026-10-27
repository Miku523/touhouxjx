#!/usr/bin/env node
/**
 * verifier 独立复核 · 静态小怪数量 / 有效血量（纯 Node，不依赖浏览器、不改 src）
 *
 * 口径（BALANCE_TARGETS.md §2.2）：
 *  - 数量：level.entities 里 ENTITY_CHARS 's'(fairy) / 'f'(flyer) 的个数；
 *          另用 EnemyManager 实际生成的 list（含高面数空中护航）做交叉核对。
 *  - 血量：直接累加 EnemyManager 里 enemies 的 hp（平台面 2026-10-27 第六轮起 = 本面 Boss 平均
 *          承伤符卡血量 × MOB_CARD_SHARE × 兵种权重，不再吃 ENEMY_HP_SCALE；STG 杂兵仍走 0.9）。
 *  - 「每屏」= 1280px 宽（画面宽），每屏数 = 总数 / (level.w / 1280)。
 *
 * 用法：
 *   node tools/_verify_static.mjs [--root <repo>] [--out _pt/verify_static.json]
 * 基线：node tools/_verify_static.mjs --root C:/Users/GuSheng/Downloads/HKS_baseline --out _pt/verify_static_baseline.json
 */
import { pathToFileURL } from 'node:url';
import { join, resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

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
const SCREEN_W = 1280;

const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { LEVELS } = await imp('src/assets/levels.js');
const { Level } = await imp('src/game/level.js');
const { EnemyManager } = await imp('src/game/enemies.js');
const { StgStage } = await imp('src/game/stg.js');
const { getDifficulty, enemyStageDensityOf } = await imp('src/game/difficulty.js');
const { ENEMY_HP_SCALE } = await imp('src/game/balance.js');

// STG 敌机血量表（src/game/stg.js 的 const ENEMY_KINDS 未导出，按源码解析 hp 字段）
const stgSrc = readFileSync(join(ROOT, 'src/game/stg.js'), 'utf8');
const STG_KIND_HP = {};
{
  const block = stgSrc.match(/const ENEMY_KINDS\s*=\s*\{([\s\S]*?)\n\};/);
  if (block) {
    const re = /(\w+)\s*:\s*\{\s*hp:\s*(\d+)/g;
    let m;
    while ((m = re.exec(block[1]))) STG_KIND_HP[m[1]] = Number(m[2]);
  }
}

const DIFF = String(argv.diff || 'N');
const diff = getDifficulty(DIFF);
const round = (v, d = 2) => +(+v).toFixed(d);
const rows = [];

for (let i = 0; i < LEVELS.length; i++) {
  const def = LEVELS[i];
  const level = new Level(def, i);
  const screens = level.w / SCREEN_W;
  const row = {
    index: i + 1,
    id: def.id,
    name: level.name || def.name || def.id,
    mode: level.mode,
    theme: level.theme,
    w: level.w,
    screens: round(screens),
    density: enemyStageDensityOf(i + 1),
  };

  if (level.mode === 'platform') {
    const counts = {};
    for (const e of level.entities) counts[e.type] = (counts[e.type] || 0) + 1;
    const em = new EnemyManager(level, {
      difficulty: diff.enemyDifficulty,
      diff,
      stageDensity: enemyStageDensityOf(i + 1),
    });
    const kinds = {};
    const hpByKind = {};
    let totalHp = 0;
    for (const e of em.list) {
      kinds[e.kind] = (kinds[e.kind] || 0) + 1;
      hpByKind[e.kind] = round((hpByKind[e.kind] || 0) + e.hp, 2);
      totalHp += e.hp;
    }
    // 理论同屏峰值：按 x 排序后滑窗统计 1280px 内的最大敌人数
    const xs = em.list.map((e) => e.x).sort((a, b) => a - b);
    let maxInScreen = 0;
    for (let a = 0, b = 0; b < xs.length; b++) {
      while (xs[b] - xs[a] > SCREEN_W) a++;
      maxInScreen = Math.max(maxInScreen, b - a + 1);
    }
    row.entity = {
      fairy: counts.fairy || 0,
      flyer: counts.flyer || 0,
      s_plus_f: (counts.fairy || 0) + (counts.flyer || 0),
    };
    row.spawn = { count: em.list.length, kinds, hpByKind, tier: em.tier };
    row.hp = { total: round(totalHp), perEnemy: round(totalHp / Math.max(1, em.list.length)) };
    row.perScreen = {
      count: round(em.list.length / screens),
      hp: round(totalHp / screens),
      entityCount: round(((counts.fairy || 0) + (counts.flyer || 0)) / screens),
      maxInScreen,
    };
  } else {
    const st = new StgStage(level, diff, enemyStageDensityOf(i + 1));
    const waves = st.waves.slice();
    let spawnCount = 0;
    const kinds = {};
    for (const w of waves) {
      spawnCount += Math.max(1, w.count | 0);
      kinds[w.kind] = (kinds[w.kind] || 0) + Math.max(1, w.count | 0);
    }
    const hpByKind = {};
    let totalHp = 0;
    for (const [k, n] of Object.entries(kinds)) {
      const base = STG_KIND_HP[k] || 0;
      const h = n * base * ENEMY_HP_SCALE;
      hpByKind[k] = round(h, 2);
      totalHp += h;
    }
    row.spawn = { count: spawnCount, waves: waves.length, kinds, hpByKind, note: def.id === 'extra' ? 'EX 波表由 stage.js 时间轴生成，静态数字仅供量级参考' : undefined };
    row.hp = { total: round(totalHp), perEnemy: round(totalHp / Math.max(1, spawnCount)) };
    row.perScreen = {
      count: round(spawnCount / screens),
      hp: def.id === 'extra' ? null : round(totalHp / screens),
      entityCount: round(spawnCount / screens),
      maxInScreen: null,
      note: def.id === 'extra' ? 'EX 波表运行时生成' : undefined,
    };
  }
  rows.push(row);
}

const out = {
  root: ROOT,
  diff: DIFF,
  screenW: SCREEN_W,
  generatedAt: new Date().toISOString(),
  rows,
};
if (OUT) {
  mkdirSync(dirname(resolve(OUT)), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
}
const pad = (s, n) => String(s).padEnd(n);
console.log(`root=${ROOT} diff=${DIFF}`);
console.log(pad('stg', 5) + pad('mode', 10) + pad('w', 8) + pad('screens', 9) + pad('s+f', 7) + pad('spawn', 7) + pad('count/屏', 10) + pad('HP总', 9) + pad('HP/屏', 9) + 'max/屏');
for (const r of rows) {
  console.log(
    pad(r.index, 5) + pad(r.mode, 10) + pad(r.w, 8) + pad(r.screens, 9) +
    pad(r.entity ? r.entity.s_plus_f : '-', 7) +
    pad(r.spawn.count, 7) + pad(r.perScreen.count, 10) +
    pad(r.hp.total ?? '-', 9) + pad(r.perScreen.hp ?? '-', 9) +
    (r.perScreen.maxInScreen ?? '-')
  );
}
if (OUT) console.log('json ->', OUT);
