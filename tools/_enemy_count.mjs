// 小怪数量基线 / 验收：直接构建关卡并统计地面 s 与空中 f 实体数。
// 用法：node tools/_enemy_count.mjs [--json out.json]
import fs from 'node:fs';
import { LEVELS } from '../src/assets/levels.js';
import { Level } from '../src/game/level.js';

const out = [];
for (let i = 0; i < LEVELS.length; i++) {
  const def = LEVELS[i];
  const src = def.gen && def.gen.kind === 'stg' ? 'STG' : (def.extra ? 'EX' : 'platform');
  const lv = new Level(def, i);
  const fairies = lv.entities.filter((e) => e.type === 'fairy').length;
  const flyers = lv.entities.filter((e) => e.type === 'flyer').length;
  const power = lv.entities.filter((e) => e.type === 'power').length;
  const coins = lv.entities.filter((e) => e.type === 'coin').length;
  const life = lv.entities.filter((e) => e.type === 'life').length;
  const cps = lv.entities.filter((e) => e.type === 'checkpoint').length;
  const screens = lv.cols / 40;
  out.push({
    stage: i + 1, id: def.id || `stage${i + 1}`, mode: src,
    cols: lv.cols, screens: +screens.toFixed(2),
    fairies, flyers, total: fairies + flyers,
    perScreen: +((fairies + flyers) / screens).toFixed(2),
    power, coins, life, checkpoints: cps,
    midboss: lv.midbossInfo || null,
    bossArena: lv.bossArena || null,
  });
  console.log(
    `S${i + 1} ${src.padEnd(8)} cols=${lv.cols} screens=${screens.toFixed(1)}` +
    ` s=${fairies} f=${flyers} total=${fairies + flyers}` +
    ` perScreen=${((fairies + flyers) / screens).toFixed(2)}` +
    ` P=${power} coins=${coins} 1UP=${life} cp=${cps}`,
  );
}
const arg = process.argv.indexOf('--json');
if (arg > 0 && process.argv[arg + 1]) {
  fs.writeFileSync(process.argv[arg + 1], JSON.stringify(out, null, 2));
  console.log('written', process.argv[arg + 1]);
}
