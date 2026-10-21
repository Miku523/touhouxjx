#!/usr/bin/env node
/**
 * #6 验收：子机「特殊副弹」运行时伤害断言（只读工具，不改 src）。
 *
 * 判定依据（docs/BALANCE_TARGETS.md #6）：
 *   - 灵梦 special.damage 2.4 → 1.55；魔理沙 special.damage 3.2 → 2.05（profile 值）
 *   - 主弹 damage 不变（4 / 8）
 *   - 运行时 b.damage = scalePlayerDamage(profile) = profile × PLAYER_ATK_SCALE
 *       期望值不写死，直接 import balance.js 现算，倍率调整后断言自动跟随：
 *       灵梦副弹 1.55×倍率、魔理沙副弹 2.05×倍率；灵梦主弹 4×倍率、魔理沙主弹 8×倍率。
 *
 * 实测方式：页面内 startStage(0) 并冻结 rAF，用官方自动玩家连续 240 逻辑步，
 * 逐帧从 stage.shots.pool 采样 active 子弹的 damage（special / 主弹分开），
 * 得到去重后的伤害集合与期望值比对。
 *
 * 用法：
 *   node tools/_verify_shots.mjs --url http://127.0.0.1:8141/index.html --port 9160 --out _pt/verify_shots.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PLAYER_ATK_SCALE } from '../src/game/balance.js';

const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1';
  argv[k] = v;
}

const URL = argv.url || 'http://127.0.0.1:8141/index.html';
const PORT = Number(argv.port || 9160);
const OUT = argv.out || '';
const URL_BASE = URL.replace(/\/index\.html(?:[?#].*)?$/, '');
process.env.PT_BASE = URL_BASE; // _pt_core 在 import 时读 BASE

const { launch } = await import('./_pt_core.mjs');

const EXPECT = {
  reimu: { special: 1.55 * PLAYER_ATK_SCALE, main: 4 * PLAYER_ATK_SCALE },
  marisa: { special: 2.05 * PLAYER_ATK_SCALE, main: 8 * PLAYER_ATK_SCALE },
};
const TOL = 1e-3;

const out = {
  tool: '_verify_shots',
  url: URL,
  proto: 'startStage(0,{skipIntro}) + loop.paused + sim_bot 240 逻辑步，逐帧采样 shots.pool',
  audits: [],
  consoleErrors: [],
  pass: null,
};

let T = null;
try {
  T = await launch({ port: PORT, width: 1280, height: 720 });
  out.consoleErrors = [...(T.errors || [])];
  await T.boot({ timeout: 45000 });
  const ready = await T.eval(`(async () => {
    const g = window.__game;
    if (!g || typeof g.startStage !== 'function') return { ok: false, why: 'no startStage' };
    g.loop.paused = true;
    const m = await import('/tools/sim_bot.js');
    window.__sb = m.install({ god: true, maxRetries: 1, maxCast: 400 });
    return { ok: !!window.__sb, paused: !!g.loop.paused };
  })()`);
  out.ready = ready;

  for (const char of ['reimu', 'marisa']) {
    const audit = await T.eval(`(() => {
      const g = window.__game;
      const B = window.__sb;
      const errs = [];
      let steps = 0;
      try {
        g.char = ${JSON.stringify(char)};
        g.difficulty = 'N';
        g.carryPower = 128;
        g.levelIndex = 0;
        g.startStage(0, { skipIntro: true });
        g.loop.paused = true;
      } catch (e) { errs.push('start: ' + String((e && e.stack) || e)); }
      const special = new Set(), main = new Set();
      let sampleFrames = 0, maxActive = 0;
      for (let i = 0; i < 240; i++) {
        try {
          B.decide();
          g.update(1 / 60);
          if (B.after) B.after();
        } catch (e) { errs.push('step ' + i + ': ' + String((e && e.stack) || e)); break; }
        steps++;
        const st = g.stage;
        const pool = (st && st.shots && st.shots.pool) || [];
        let n = 0;
        for (const b of pool) {
          if (!b || !b.active) continue;
          n++;
          const d = +(+b.damage).toFixed(4);
          if (b.special) special.add(d); else main.add(d);
        }
        if (n) sampleFrames++;
        if (n > maxActive) maxActive = n;
      }
      const st = g.stage;
      return {
        char: g.char, steps, sampleFrames, maxActive,
        state: g.state, stState: st && st.state,
        stMode: st && st.mode, levelW: st && st.level && st.level.w,
        specialDmg: [...special].sort((a, b) => a - b),
        mainDmg: [...main].sort((a, b) => a - b),
        errors: errs.slice(0, 4),
      };
    })()`);
    const e = EXPECT[char];
    const near = (arr, want) => arr.length === 1 && Math.abs(arr[0] - want) <= TOL;
    audit.expect = e;
    audit.specialOk = near(audit.specialDmg, e.special);
    audit.mainOk = near(audit.mainDmg, e.main);
    audit.errors = audit.errors || [];
    audit.pass = audit.specialOk && audit.mainOk && audit.errors.length === 0;
    out.audits.push(audit);
  }
} catch (e) {
  out.bail = String((e && e.stack) || e);
}
if (T) {
  try {
    out.consoleErrors = [...(T.errors || [])];
    out.warns = [...(T.warns || [])].slice(0, 10);
  } catch {}
  try { await T.close(); } catch {}
}

out.pass = !out.bail && out.audits.length === 2 && out.audits.every((a) => a.pass);
out.verdict = out.pass ? 'PASS' : 'FAIL';
out.at = new Date().toISOString();

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
}
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 2);
