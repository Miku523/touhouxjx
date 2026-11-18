/**
 * 符卡练习 / 图鉴 数据层自测。
 *
 * 只测纯数据部分（不碰 DOM）：这两个模块的全部正确性风险都在「从 Boss 表推出什么」，
 * 页面部分只是渲染那批数据。用 node 直接跑，不需要浏览器：
 *
 *   node tools/_practice_selftest.mjs
 */

import {
  PRACTICE_KEY, PRACTICE_RULES, listBossCards, listPracticeTargets,
  buildPracticeRun, practiceRecord,
} from '../src/game/practice.js';
import { GALLERY_KEY, listEnemies, ensureGallery, galleryStats } from '../src/game/gallery.js';
import { BOSS_DEFS } from '../src/game/boss.js';
import { LEVELS } from '../src/assets/levels.js';

let fails = 0;
const ok = (cond, msg) => {
  if (cond) { console.log('  ok   ' + msg); return; }
  fails++;
  console.log('  FAIL ' + msg);
};

console.log('\n[1] listPracticeTargets');
const all = listPracticeTargets({ extraUnlocked: false });
const unlocked = listPracticeTargets({ extraUnlocked: true });
const expectTotal = Object.values(BOSS_DEFS).reduce((s, d) => s + (d.phases || []).length, 0);
ok(all.length > 0, `非空（${all.length} 条）`);
ok(all.length === expectTotal, `条数 = BOSS_DEFS 全部卡数（${expectTotal}）`);
ok(unlocked.length === all.length, '两个解锁状态下条数相同（锁定只是标记）');

const need = ['bossKey', 'bossName', 'stageId', 'stageName', 'cardIndex', 'cardName', 'difficulty'];
for (const k of need) {
  ok(all.every((t) => k in t), `每条都有字段 ${k}`);
}
ok(all.every((t) => typeof t.cardName === 'string' && t.cardName.length > 0), '卡名都是非空字符串');
ok(all.every((t) => Number.isInteger(t.cardIndex) && t.cardIndex >= 0), 'cardIndex 都是非负整数');
ok(all.every((t) => !!t.stageId && !!t.stageName), '都推出了所属面');

// 卡名必须逐字等于 BOSS_DEFS —— 这是「不硬编码卡名」的硬证据
const nameOk = all.every((t) => BOSS_DEFS[t.bossKey].phases[t.cardIndex].name === t.cardName);
ok(nameOk, '每条 cardName 与 BOSS_DEFS[key].phases[i].name 逐字一致');

// 同一 Boss 的 cardIndex 必须是 0..n-1 连续
const byBoss = new Map();
for (const t of all) {
  if (!byBoss.has(t.bossKey)) byBoss.set(t.bossKey, []);
  byBoss.get(t.bossKey).push(t.cardIndex);
}
const contiguous = [...byBoss.values()].every((xs) => xs.every((v, i) => v === i));
ok(contiguous, '每个 Boss 的 cardIndex 从 0 连续递增');
ok([...byBoss.keys()].length === Object.keys(BOSS_DEFS).length,
  `覆盖全部 ${Object.keys(BOSS_DEFS).length} 个 Boss`);

console.log('\n[2] 解锁口径');
const extraBosses = new Set(all.filter((t) => t.extra).map((t) => t.bossKey));
ok(extraBosses.size > 0, `EXTRA 专属 Boss ${[...extraBosses].join(', ')} 被识别出来了`);
ok(all.filter((t) => t.extra).every((t) => t.locked), '未解锁 EXTRA 时，EXTRA 卡全部 locked');
ok(all.filter((t) => !t.extra).every((t) => !t.locked), '未解锁 EXTRA 时，普通卡仍全部可选');
ok(unlocked.every((t) => !t.locked), '解锁 EXTRA 后全部可选');
ok(all.filter((t) => t.extra).every((t) => t.hostStageId === 'stage4'),
  'EXTRA Boss 借 STAGE 4 的场地（不落在 extra 关里）');
ok(all.filter((t) => !t.extra).every((t) => t.hostStageId === t.stageId),
  '普通 Boss 就在自己那一面开打');

console.log('\n[3] buildPracticeRun');
const sample = all[0];
const run = buildPracticeRun(sample);
ok(!!run && run.kind === 'practice', '返回 kind=practice 的配置');
ok(run.lives === PRACTICE_RULES.lives && run.lives === 3, '残机 = 3');
ok(run.power === PRACTICE_RULES.power, '火力 = PRACTICE_RULES.power');
ok(run.power > 0, '火力非 0（否则玩家放不出符卡）');
ok(run.opts.cardFrom === sample.cardIndex && run.opts.cardCount === 1,
  'opts.cardFrom/cardCount 指向这一张卡');
ok(run.opts.resumeBoss === true && run.opts.practice === true, 'opts 带 resumeBoss + practice 标记');
ok(typeof run.hostStageIndex === 'number' && run.hostStageIndex >= 0
  && run.hostStageIndex < LEVELS.length, 'hostStageIndex 是合法的 LEVELS 下标');
ok(!LEVELS[run.hostStageIndex].extra, 'hostStageIndex 指向的不是 EXTRA 关');

// 每一张卡都能单独成局
let runBad = 0;
for (const t of unlocked) {
  const r = buildPracticeRun(t);
  if (!r || r.opts.cardFrom !== t.cardIndex || r.cardCount !== undefined) runBad++;
}
ok(runBad === 0, `全部 ${unlocked.length} 条都能 buildPracticeRun`);
ok(buildPracticeRun(null) === null && buildPracticeRun({}) === null, '无效输入返回 null');

// 越界保护
const oob = buildPracticeRun({ bossKey: 'rumia', cardIndex: 99 });
ok(oob && oob.opts.cardFrom === BOSS_DEFS.rumia.phases.length - 1, 'cardIndex 越界时夹到最后一卡');

console.log('\n[4] 练习记录键');
ok(PRACTICE_KEY === 'hks.practice.v1', '存档键是 hks.practice.v1（与 hks.progress.v1 分开）');
const rec = practiceRecord('rumia', 0);
ok(rec && typeof rec.tries === 'number' && typeof rec.best === 'number',
  'practiceRecord 返回 {tries,best}（node 环境无 localStorage 也安全）');

console.log('\n[5] listEnemies');
const enemies = listEnemies();
ok(enemies.length > 0, `非空（${enemies.length} 种）`);
const groups = new Set(enemies.map((e) => e.group));
ok(groups.size >= 2, `至少两类：${[...groups].join(', ')}`);
for (const k of ['id', 'name', 'group', 'groupLabel', 'appear', 'color', 'hp', 'desc']) {
  ok(enemies.every((e) => k in e), `每种都有字段 ${k}`);
}
ok(enemies.every((e) => typeof e.desc === 'string' && e.desc.length > 8), '每种都有一句描述');
ok(enemies.every((e) => /^#[0-9a-f]{6}$/i.test(e.color)), '每种都有合法主题色');
ok(enemies.every((e) => Number.isInteger(e.appear) && e.appear >= 1), '每种都有首次出现面');
ok(new Set(enemies.map((e) => e.id)).size === enemies.length, 'id 无重复');

console.log('\n[6] 图鉴档案');
ok(GALLERY_KEY === 'hks.gallery.v1', '存档键是 hks.gallery.v1');
ok(ensureGallery({ extraUnlocked: false }).seeded === false,
  '未解锁 EXTRA 时不回填（从零开始收）');
const st = galleryStats();
ok(st.cardTotal === all.length && st.enemyTotal === enemies.length, '总数与列表一致');

console.log('\n[7] 抽样');
console.log('  练习：', JSON.stringify(all[0], null, 0));
console.log('  练习：', JSON.stringify(all.find((t) => t.bossKey === 'flandre'), null, 0));
console.log('  敌机：', JSON.stringify(enemies[0], null, 0));
console.log('  敌机：', JSON.stringify(enemies[enemies.length - 1], null, 0));

console.log(fails ? `\n✗ ${fails} 项失败\n` : '\n✓ 全部通过\n');
process.exit(fails ? 1 : 0);
