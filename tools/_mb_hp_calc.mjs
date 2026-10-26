// 一次性计算：各面 Boss 每张符卡运行期血量 → 小头目目标血量（约半张卡）。
import { BOSS_CARD_TUNING, CARD_HP_ANCHOR, finalHpMulFor } from '../src/game/bossTuning.js';

for (const key of ['rumia', 'wriggle', 'cirno', 'yuyuko', 'kaguya', 'aya']) {
  const cards = BOSS_CARD_TUNING[key]?.cards || [];
  const mul = finalHpMulFor(key);
  const hps = cards.map((t) => {
    if (Number(t.hp) > 0) return Math.round(Number(t.hp) * mul);
    if (t.mode === 'survival') return null;
    return Math.round(t.limit * t.dps * CARD_HP_ANCHOR * mul);
  });
  const dmg = hps.filter((h) => h);
  const avg = dmg.reduce((a, b) => a + b, 0) / dmg.length;
  console.log(key, 'mul=' + mul, 'cards=' + cards.length,
    'avgCardHp=' + Math.round(avg), 'half=' + Math.round(avg / 2),
    'hpList=' + JSON.stringify(hps));
}
