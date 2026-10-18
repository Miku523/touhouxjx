/**
 * 难度配置
 *
 * E / N / H / L 四档，影响：
 *  - 主线面数（E 没有第 6 面）
 *  - 通关是否解锁 Extra（N 及以上）
 *  - 第 4 / 5 / 6 面是否移除一张「难符卡」
 *  - Boss 符卡血量、弹幕密度 / 速度 / 开火间隔
 *  - 道中敌人的开火频率（EnemyManager 的 easy / normal / hard）
 *
 * 「难符卡」的判定：该面 HP 最高（最耐打）的一张，HP 相同时取靠后的一张。
 * 裁剪只作用于主线 4/5/6 面；Extra 是固定挑战，不裁剪（stageNumber = 0）。
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
    bulletCountScale: 0.8,
    bulletSpeedScale: 0.85,
    fireIntervalScale: 1.25,
    enemyDifficulty: 'easy',
    blurb: '5 面 · 不解锁 Extra · 第 4、5 面各少一张难符卡',
  },
  N: {
    key: 'N',
    label: 'NORMAL',
    cn: '普通',
    stageCount: 6,
    unlockExtra: true,
    trimHardCards: [4, 5, 6],
    hpScale: 1,
    bulletCountScale: 1,
    bulletSpeedScale: 1,
    fireIntervalScale: 1,
    enemyDifficulty: 'normal',
    blurb: '6 面 · 解锁 Extra · 第 4、5、6 面各少一张难符卡',
  },
  H: {
    key: 'H',
    label: 'HARD',
    cn: '困难',
    stageCount: 6,
    unlockExtra: true,
    trimHardCards: [],
    hpScale: 1.15,
    bulletCountScale: 1.1,
    bulletSpeedScale: 1.08,
    fireIntervalScale: 0.92,
    enemyDifficulty: 'hard',
    blurb: '6 面 · 解锁 Extra · 完整符卡，弹幕更密更快',
  },
  L: {
    key: 'L',
    label: 'LUNATIC',
    cn: '狂气',
    stageCount: 6,
    unlockExtra: true,
    trimHardCards: [],
    hpScale: 1.3,
    bulletCountScale: 1.2,
    bulletSpeedScale: 1.15,
    fireIntervalScale: 0.84,
    enemyDifficulty: 'hard',
    blurb: '6 面 · 解锁 Extra · 完整符卡，最凶弹幕',
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
