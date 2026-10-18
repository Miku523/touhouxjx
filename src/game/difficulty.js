/**
 * 难度配置
 *
 * E / N / H / L 四档，影响：
 *  - 主线面数（E 没有第 6 面）
 *  - 通关是否解锁 Extra（N 及以上）
 *  - 第 4 / 5 / 6 面是否移除一张「难符卡」
 *  - Boss 符卡血量、弹幕密度 / 速度 / 开火间隔
 *  - 道中敌人的开火频率与弹速（EnemyManager / StgStage）
 *  - 弹幕护栏：单发速度上限、同屏弹数预算、环状弹幕最小缝隙
 *
 * 「难符卡」的判定：该面 HP 最高（最耐打）的一张，HP 相同时取靠后的一张。
 * 裁剪只作用于主线 4/5/6 面；Extra 是固定挑战，不裁剪（stageNumber = 0）。
 *
 * —— 弹幕梯度总览（N 为基准 1.00）——
 *   E：弹数 0.64×  弹速 0.84×  开火 1.24×（更慢）
 *   N：弹数 0.96×  弹速 1.00×  开火 1.02×（几乎等于基准）
 *   H：弹数 1.16×  弹速 1.10×  开火 0.93×
 *   L：弹数 1.45×  弹速 1.22×  开火 0.80×
 * 三道护栏保证「有缝可解」：
 *   1) bulletSpeedCap  单发弹速硬上限，L 也不会到反应不过来的程度；
 *   2) bulletBudget    同屏敌弹预算，超了主弹幕直接停火、变招让路；
 *   3) ringGapPx       环状 / 绽放弹幕同样半径下的最小弹间距，永远留出人形判定缝；
 * 另外 Boss 还有密度自适应（pressure）：屏幕越满，新开的一招弹数越薄。
 */

/** 可选难度（顺序即开始界面按钮顺序） */
export const DIFFICULTY_KEYS = ['E', 'N', 'H', 'L'];

export const DIFFICULTIES = {
  E: {
    key: 'E',
    label: 'EASY',
    cn: '简单',
    stageCount: 5,
    unlockExtra: false,
    trimHardCards: [4, 5],
    hpScale: 0.85,
    // 弹幕：弹数砍掉三成多、弹速压到八成，开火间隔拉长
    bulletCountScale: 0.64,
    bulletSpeedScale: 0.84,
    fireIntervalScale: 1.24,
    // 护栏
    bulletSpeedCap: 250,
    bulletBudget: 520,
    ringGapPx: 54,
    // 道中 / 平台杂兵
    enemyBulletScale: 0.82,
    enemyFireScale: 1.45,
    flyerShots: 1,
    stgScoutShots: 1,
    stgGunnerShots: 2,
    enemyDifficulty: 'easy',
    blurb: '5 面 · 不解锁 Extra · 第 4、5 面各少一张难符卡 · 弹数 −50%、弹速 −16%',
  },
  N: {
    key: 'N',
    label: 'NORMAL',
    cn: '普通',
    stageCount: 6,
    unlockExtra: true,
    trimHardCards: [4, 5, 6],
    hpScale: 1,
    // 弹幕：比满配略稀一点点，弹速保持正常
    bulletCountScale: 0.96,
    bulletSpeedScale: 1,
    fireIntervalScale: 1.02,
    // 护栏
    bulletSpeedCap: 340,
    bulletBudget: 720,
    ringGapPx: 44,
    // 道中 / 平台杂兵
    enemyBulletScale: 1,
    enemyFireScale: 1,
    flyerShots: 1,
    stgScoutShots: 1,
    stgGunnerShots: 3,
    enemyDifficulty: 'normal',
    blurb: '6 面 · 解锁 Extra · 第 4、5、6 面各少一张难符卡 · 弹数略减、弹速正常',
  },
  H: {
    key: 'H',
    label: 'HARD',
    cn: '困难',
    stageCount: 6,
    unlockExtra: true,
    trimHardCards: [],
    hpScale: 1.15,
    // 弹幕：适度加密加速，开火间隔略缩
    bulletCountScale: 1.16,
    bulletSpeedScale: 1.1,
    fireIntervalScale: 0.93,
    // 护栏
    bulletSpeedCap: 400,
    bulletBudget: 950,
    ringGapPx: 36,
    // 道中 / 平台杂兵
    enemyBulletScale: 1.12,
    enemyFireScale: 0.78,
    flyerShots: 2,
    stgScoutShots: 2,
    stgGunnerShots: 4,
    enemyDifficulty: 'hard',
    blurb: '6 面 · 解锁 Extra · 完整符卡 · 弹数约 +35%、弹速约 +10%',
  },
  L: {
    key: 'L',
    label: 'LUNATIC',
    cn: '狂气',
    stageCount: 6,
    unlockExtra: true,
    trimHardCards: [],
    hpScale: 1.3,
    // 弹幕：大幅加密加速，靠护栏兜底
    bulletCountScale: 1.45,
    bulletSpeedScale: 1.22,
    fireIntervalScale: 0.8,
    // 护栏
    bulletSpeedCap: 470,
    bulletBudget: 1180,
    ringGapPx: 30,
    // 道中 / 平台杂兵
    enemyBulletScale: 1.25,
    enemyFireScale: 0.6,
    flyerShots: 3,
    stgScoutShots: 3,
    stgGunnerShots: 5,
    enemyDifficulty: 'hard',
    blurb: '6 面 · 解锁 Extra · 完整符卡 · 弹数约 +80%、弹速约 +22%，最凶弹幕',
  },
};

/** 取难度配置；未知键回退到 N */
export function getDifficulty(key) {
  return DIFFICULTIES[key] || DIFFICULTIES.N;
}

/** 该难度下的主线面数 */
export function stageCountOf(key) {
  return getDifficulty(key).stageCount;
}

/**
 * 按难度裁剪 Boss 的符卡列表。
 * 只返回新数组，不修改 BOSS_DEFS 里的原数组。
 * @param {Array<object>} phases
 * @param {string} difficulty
 * @param {number} stageNumber 1 起的关卡号；0 表示 Extra / 不裁剪
 */
export function bossPhasesFor(phases, difficulty, stageNumber) {
  const list = Array.isArray(phases) ? phases : [];
  const diff = getDifficulty(difficulty);
  if (!list.length) return list;
  if (!diff.trimHardCards.includes(Number(stageNumber))) return list;

  // 找 HP 最高的一张；同 HP 取靠后的
  let hardIdx = 0;
  let hardHp = -1;
  list.forEach((p, i) => {
    const hp = Number(p.hp) || 0;
    if (hp >= hardHp) {
      hardHp = hp;
      hardIdx = i;
    }
  });
  return list.filter((_, i) => i !== hardIdx);
}

/** 给每条符卡血条套上难度血量倍率，返回新数组 */
export function scaleBossHp(phases, difficulty, fallbackHp = 100) {
  const diff = getDifficulty(difficulty);
  return (Array.isArray(phases) ? phases : []).map((p) => ({
    ...p,
    hp: Math.max(1, Math.round((Number(p.hp) || fallbackHp) * diff.hpScale)),
  }));
}
