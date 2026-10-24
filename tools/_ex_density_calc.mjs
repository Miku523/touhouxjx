// 一次性质检辅助：用与游戏相同的确定性扩编逻辑，对比旧 6:00 / 新 3:00 道中的
// 波次数量、敌机数量、兵种与编队构成（只算数学，不连浏览器）。
// 用法: node tools/_ex_density_calc.mjs

function hashSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function buildBase(usable, step) {
  const waves = [];
  let n = 0;
  for (let s = 420; s < usable; s += step, n++) {
    const zone = Math.floor(n / 14);
    const heavy = zone % 3 === 2;
    const roll = n % 7;
    if (roll === 0) waves.push({ at: s, kind: 'scout', count: heavy ? 5 : 4, gapY: 0 });
    else if (roll === 1) waves.push({ at: s, kind: 'gunner', count: heavy ? 3 : 2, gapY: 130 });
    else if (roll === 2) waves.push({ at: s, kind: 'diver', count: 5, gapY: 0 });
    else if (roll === 3) {
      waves.push({ at: s, kind: 'scout', count: 3, gapY: 180 });
      waves.push({ at: s + 150, kind: 'diver', count: 3, gapY: -160 });
    } else if (roll === 4) waves.push({ at: s, kind: 'gunner', count: 3, gapY: 0 });
    else if (roll === 5) {
      waves.push({ at: s, kind: 'scout', count: 2, gapY: -120 });
      waves.push({ at: s + 120, kind: 'gunner', count: 2, gapY: 150 });
    } else {
      waves.push({ at: s, kind: 'diver', count: 4, gapY: 90 });
      waves.push({ at: s + 240, kind: 'scout', count: 5, gapY: 40 });
    }
  }
  return waves;
}

function enrich(waves, usable, cfg) {
  let a = (hashSeed('extra') ^ 0x9e3779b9) >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const kinds = ['sniper', 'spinner', 'bomber', 'turret'];
  const forms = cfg.forms;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    const r = rng();
    if (r < cfg.mutate) {
      const kind = kinds[Math.floor(rng() * kinds.length)];
      w.kind = kind;
      w.form = forms[Math.floor(rng() * forms.length)];
      if (kind === 'turret') { w.count = 1; w.gapY = 30; w.form = 'line'; }
      else if (kind === 'sniper') w.count = Math.max(1, Math.min(2, w.count - 1));
      else if (kind === 'bomber') w.count = Math.max(2, Math.min(cfg.bomberMax, w.count));
    } else if (r < cfg.insert) {
      const at = w.at + 90;
      if (at > usable) continue;
      const kind = kinds[Math.floor(rng() * kinds.length)];
      waves.splice(i + 1, 0, {
        at, kind, count: kind === 'turret' ? 1 : 4,
        gapY: (rng() < 0.5 ? -1 : 1) * (90 + Math.floor(rng() * 90)),
        form: forms[Math.floor(rng() * forms.length)],
      });
      i++;
    }
  }
  for (const w of waves) w.count = Math.max(1, Math.min(8, Math.round(w.count * cfg.mul)));
  waves.sort((x, y) => x.at - y.at);
  return waves;
}

function stats(waves, dur) {
  const kinds = {}, forms = {};
  let total = 0;
  for (const w of waves) {
    kinds[w.kind] = (kinds[w.kind] || 0) + 1;
    forms[w.form || 'line'] = (forms[w.form || 'line'] || 0) + 1;
    total += w.count;
  }
  const k = (x) => Object.fromEntries(Object.entries(x).sort((p, q) => q[1] - p[1]));
  return {
    waves: waves.length, total,
    perSec: +(total / dur).toFixed(2), wavesPerSec: +(waves.length / dur).toFixed(2),
    kinds: k(kinds), forms: k(forms),
  };
}

// 旧：cols 1900 → w 60,800，usable 59,400，step 470，6:00，1.32，换兵种 28%，插波 28%
const oldBase = buildBase(60800 - 1480, 470);
const old = enrich(oldBase, 60800 - 1480, {
  forms: ['v', 'column', 'pincer', 'cross'], mutate: 0.28, insert: 0.56, mul: 1.32, bomberMax: 3,
});
// 新：cols 990 → w 31,680，usable 30,200，step 450，3:00，1.72（单波 ≤8），换兵种 40%，插波 70%
const newBase = buildBase(31680 - 1480, 450);
const fresh = enrich(newBase, 31680 - 1480, {
  forms: ['v', 'column', 'pincer', 'cross', 'arc', 'wall'], mutate: 0.40, insert: 0.70, mul: 1.72, bomberMax: 4,
});

console.log('旧 6:00 基线          ', JSON.stringify(stats(buildBase(60800 - 1480, 470), 360)));
console.log('旧 6:00 扩编后        ', JSON.stringify(stats(old, 360)));
console.log('新 3:00 基线          ', JSON.stringify(stats(buildBase(31680 - 1480, 450), 180)));
console.log('新 3:00 扩编后        ', JSON.stringify(stats(fresh, 180)));
const so = stats(old, 360), sn = stats(fresh, 180);
console.log('\n敌机/秒 : 旧 %s → 新 %s (%s%%)', so.perSec, sn.perSec, (((sn.perSec / so.perSec) - 1) * 100).toFixed(1));
console.log('波次/秒 : 旧 %s → 新 %s (%s%%)', so.wavesPerSec, sn.wavesPerSec, (((sn.wavesPerSec / so.wavesPerSec) - 1) * 100).toFixed(1));
