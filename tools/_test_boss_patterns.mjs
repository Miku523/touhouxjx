// 弹幕编排冒烟测试：用假 bullets/fx 驱动 Boss，检查新弹型能正常开火
import { Boss, BOSS_DEFS } from '../src/game/boss.js';

const fx = new Proxy({}, { get: () => () => {} });
const player = { x: 200, y: 500, w: 40, h: 92, alive: true, invuln: 9 };

function makeBullets() {
  const rec = [];
  const api = {
    activeCount: 0,
    clear() {},
    ring(x, y, n, speed, o) {
      for (let i = 0; i < n; i++) {
        const a = (o && o.angle || 0) + (i / n) * Math.PI * 2;
        api.spawn({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ...o });
      }
    },
    fan(x, y, n, spread, base, speed, o) {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1) - 0.5;
        const a = base + t * spread;
        api.spawn({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ...o });
      }
    },
    spawn(o) { rec.push(o); },
    update() {},
    hitTest() { return null; },
    grazeTest() { return 0; },
  };
  return { api, rec };
}

const cases = [
  ['rumia', 'bloom'],
  ['wriggle', 'vortex'],
  ['cirno', 'bloom'],
  ['aya', 'sweep'],
  ['yuyuko', 'bloom'],
  ['kaguya', 'sweep'],
  ['flandre', 'vortex'],
];

for (const [key, kind] of cases) {
  const def = BOSS_DEFS[key];
  const last = def.phases.length - 1;
  const idx = def.phases[last].patterns.findIndex((p) => p.typeName === kind);
  if (idx < 0) { console.log(key, kind, 'MISSING'); continue; }
  const boss = new Boss(key, 800, 300, { seed: 12345 });
  boss.state = 'battle';
  boss.introT = 2;
  boss.spellIdx = last;
  boss.spellHp = 9999;
  const { api, rec } = makeBullets();
  boss._startPattern(idx);
  boss.patternT = 0.02;
  boss.fireT = 5;
  boss.update(1 / 60, player, api, fx, { onPhase() {} });
  const bad = rec.filter((o) => !Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.vx) || !Number.isFinite(o.vy) || !Number.isFinite(o.r));
  console.log(key, kind, 'idx=', idx, 'name=', def.phases[last].patterns[idx].typeName, 'spawn=', rec.length, 'bad=', bad.length, 'types=', [...new Set(rec.map((o) => o.type))].join(','));
}
