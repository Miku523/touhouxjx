// 一次性计算：各面 Boss 每张符卡运行期血量 → 小头目 / 道中杂兵目标血量。
// 2026-10-27 第八轮：小头目 = 平均承伤符卡 ×1/6（第六轮 ×0.25 再削 1/3），
// 普通小怪 = 平均承伤符卡 ×1/12（第六轮 1/6 再削 1/2，正好是小头目的一半），
// 其它兵种按 6:9:12:15 权重放大。
import {
  BOSS_CARD_TUNING, CARD_HP_ANCHOR, finalHpMulFor,
  cardAvgRuntimeHp, MINIBOSS_CARD_SHARE, MOB_CARD_SHARE,
} from '../src/game/bossTuning.js';

const KIND_WEIGHT = { fairy: 6, flyer: 6, weaver: 9, lancer: 12, spreader: 12, spinner: 12, bomber: 15 };

for (const key of ['rumia', 'wriggle', 'cirno', 'yuyuko', 'kaguya', 'aya']) {
  const cards = BOSS_CARD_TUNING[key]?.cards || [];
  const mul = finalHpMulFor(key);
  const hps = cards.map((t) => {
    if (Number(t.hp) > 0) return Math.round(Number(t.hp) * mul);
    if (t.mode === 'survival') return null;
    return Math.round(t.limit * t.dps * CARD_HP_ANCHOR * mul);
  });
  const dmg = hps.filter((h) => h);
  const avg = cardAvgRuntimeHp(key);
  const recomputed = dmg.reduce((a, b) => a + b, 0) / dmg.length;
  const mobBase = avg * MOB_CARD_SHARE;
  const mobs = Object.fromEntries(Object.entries(KIND_WEIGHT).map(([k, w]) => [k, Math.max(1, Math.round(mobBase * w / KIND_WEIGHT.fairy))]));
  console.log(key, 'mul=' + mul, 'cards=' + cards.length,
    'avgCardHp=' + Math.round(avg), 'miniboss=' + Math.max(1, Math.round(avg * MINIBOSS_CARD_SHARE)),
    'fairyMob=' + mobs.fairy, 'mobs=' + JSON.stringify(mobs), 'hpList=' + JSON.stringify(hps));
  if (Math.abs(avg - recomputed) > 0.6) {
    throw new Error(`cardAvgRuntimeHp 与本文件复算不一致：${key} ${avg} vs ${recomputed}`);
  }
}
