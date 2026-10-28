// 一次性计算：各面 Boss 每张符卡运行期血量 → 小头目 / 道中杂兵目标血量。
// 2026-10-28 第十二轮：小头目 = 平均承伤符卡 ×1/10，道中杂兵基准 = 平均 × 1/64 × 兵种权重，
// 再分层：普通兵 ×1/2（很脆，占绝大多数）、精英兵 ×2（少数，按 15% 抽）。
// 逐卡可带 hpAdjust（默认 1），本轮露米娅两卡 0.992 / 0.982。
import {
  BOSS_CARD_TUNING, CARD_HP_ANCHOR, finalHpMulFor,
  cardAvgRuntimeHp, MINIBOSS_CARD_SHARE, MOB_CARD_SHARE, MOB_TRASH_SCALE, MOB_ELITE_SCALE,
} from '../src/game/bossTuning.js';

const KIND_WEIGHT = { fairy: 6, flyer: 6, weaver: 9, lancer: 12, spreader: 12, spinner: 12, bomber: 15 };

for (const key of ['rumia', 'wriggle', 'cirno', 'yuyuko', 'kaguya', 'aya']) {
  const cards = BOSS_CARD_TUNING[key]?.cards || [];
  const mul = finalHpMulFor(key);
  const hps = cards.map((t) => {
    const adjust = Number(t.hpAdjust) > 0 ? Number(t.hpAdjust) : 1;
    const roundAdjust = (hp) => Math.max(1, Math.round(Math.round(hp) * adjust));
    if (Number(t.hp) > 0) return Math.round(roundAdjust(Number(t.hp)) * mul);
    if (t.mode === 'survival') return null;
    return Math.round(roundAdjust(t.limit * t.dps * CARD_HP_ANCHOR) * mul);
  });
  const dmg = hps.filter((h) => h);
  const avg = cardAvgRuntimeHp(key);
  const recomputed = dmg.reduce((a, b) => a + b, 0) / dmg.length;
  const mobBase = avg * MOB_CARD_SHARE;
  const base = (k, scale) => Math.max(1, Math.round(mobBase * KIND_WEIGHT[k] / KIND_WEIGHT.fairy * scale));
  const mobs = Object.fromEntries(Object.entries(KIND_WEIGHT).map(([k]) => [k, {
    trash: base(k, MOB_TRASH_SCALE), elite: base(k, MOB_ELITE_SCALE),
  }]));
  console.log(key, 'mul=' + mul, 'cards=' + cards.length,
    'avgCardHp=' + Math.round(avg), 'miniboss=' + Math.max(1, Math.round(avg * MINIBOSS_CARD_SHARE)),
    'mobs=' + JSON.stringify(mobs), 'hpList=' + JSON.stringify(hps));
  if (Math.abs(avg - recomputed) > 0.6) {
    throw new Error(`cardAvgRuntimeHp 与本文件复算不一致：${key} ${avg} vs ${recomputed}`);
  }
}
