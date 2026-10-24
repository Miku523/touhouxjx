// 审计探针 9：数值一致性（只读 src）。
// 输出：四档难度关键倍率 vs README 表；各 Boss 各难度实际总血量；E/N 裁卡是否生效。
// 用法: node tools/_audit_numeric.mjs
import { DIFFICULTIES, DIFFICULTY_KEYS, bossPhasesFor, scaleBossHp } from '../src/game/difficulty.js';
import { BOSS_DEFS, BOSS_HP_MUL } from '../src/game/boss.js';
import { PLAYER_ATK_SCALE, ENEMY_HP_SCALE } from '../src/game/balance.js';

console.log('PLAYER_ATK_SCALE=', PLAYER_ATK_SCALE, 'ENEMY_HP_SCALE=', ENEMY_HP_SCALE, 'BOSS_HP_MUL=', BOSS_HP_MUL);
console.log('\n--- 难度倍率 ---');
for (const k of DIFFICULTY_KEYS) {
  const d = DIFFICULTIES[k];
  console.log(k, JSON.stringify({
    stageCount: d.stageCount, unlockExtra: d.unlockExtra, trimHardCards: d.trimHardCards,
    hpScale: d.hpScale, bulletCountScale: d.bulletCountScale, bulletSpeedScale: d.bulletSpeedScale,
    fireIntervalScale: d.fireIntervalScale, bulletSpeedCap: d.bulletSpeedCap, bulletBudget: d.bulletBudget,
    ringGapPx: d.ringGapPx,
  }));
}
const ex = DIFFICULTIES.EX;
console.log('EX', JSON.stringify({
  hpScale: ex.hpScale, bulletCountScale: ex.bulletCountScale, bulletSpeedScale: ex.bulletSpeedScale,
  fireIntervalScale: ex.fireIntervalScale, bulletSpeedCap: ex.bulletSpeedCap, bulletBudget: ex.bulletBudget,
  ringGapPx: ex.ringGapPx, bossRingCap: ex.bossRingCap, pressureStart: ex.pressureStart,
  pressureFloor: ex.pressureFloor, wildAbort: ex.wildAbort,
}));

console.log('\n--- 裁卡生效性（E/N 的 trimHardCards 为空 = bossPhasesFor 为死代码）---');
for (const k of ['E', 'N']) {
  console.log(k, 'trimHardCards=', JSON.stringify(DIFFICULTIES[k].trimHardCards));
}

console.log('\n--- 各 Boss 实际总血量（卡数 × hpScale × ENEMY_HP_SCALE）---');
for (const [key, def] of Object.entries(BOSS_DEFS)) {
  const base = def.hp * BOSS_HP_MUL;
  const sum = (def.phases || []).reduce((a, p) => a + (p.hp || 0), 0);
  const hp = (d) => scaleBossHp(bossPhasesFor(def.phases, d, 1), d, base).reduce((a, p) => a + p.hp, 0);
  console.log(key, JSON.stringify({
    cards: (def.phases || []).length, sumHp: sum,
    E: hp('E'), N: hp('N'), H: hp('H'), L: hp('L'), EX: hp('EX'),
  }));
}
// 芙兰「×1.8」的字面预期 vs 实际（README:139 约 4.82 万）
{
  const def = BOSS_DEFS.flandre;
  const base = (def.phases || []).reduce((a, p) => a + (p.hp || 0), 0);
  const literal = base * 1.8;
  const actual = scaleBossHp(def.phases, 'EX', def.hp * BOSS_HP_MUL).reduce((a, p) => a + p.hp, 0);
  console.log('\n芙兰 EX：原始合计', base, '字面 ×1.8 =', Math.round(literal), '实际 =', actual,
    '实际倍率 =', (actual / base).toFixed(3));
}
