// 平台关 Boss 近战系统冒烟测试：
//   踩踏 / 冲刺破势 / 破势硬直（坠地 + 伤害加成）/ 俯冲状态机（落地冲击波）
// 只用假 bullets/fx/player 驱动 Boss，不依赖浏览器。
import { Boss } from '../src/game/boss.js';
import { scalePlayerDamage } from '../src/game/balance.js';

const fx = new Proxy({}, { get: () => () => {} });

function makeBullets() {
  const rec = [];
  const api = {
    activeCount: 0,
    clear() { rec.length = 0; api.activeCount = 0; },
    spawn(o) {
      const b = { ...o, active: true, life: o.life != null ? o.life : 7 };
      rec.push(b);
      api.activeCount = rec.length;
      return b;
    },
    update() {},
    hitTest() { return null; },
    grazeTest() { return 0; },
    ring() {},
    fan() {},
  };
  api.rec = rec;
  return api;
}

function makePlayer(x, y) {
  return {
    x, y, w: 40, h: 92, vy: 0, alive: true, invuln: 0, jumpsLeft: 0, hurtN: 0,
    hurt() { this.hurtN++; },
    get centerX() { return this.x + this.w / 2; },
    get centerY() { return this.y + this.h / 2; },
  };
}

let failures = 0;
function check(cond, label) {
  if (!cond) { failures++; console.log('  FAIL:', label); }
}

const DT = 1 / 60;
const GROUND = 608;              // 22 行关地表
const BASE_Y = 464;              // stage 的 Boss 出生高度 level.h - 240
const HOME_X = 1000;

function makeBoss(opts = {}) {
  const b = new Boss('rumia', HOME_X, BASE_Y, {
    seed: 1234,
    difficulty: 'normal',
    stageNumber: 1,
    platformMelee: true,
    groundY: GROUND,
    ...opts,
  });
  b.state = 'battle';
  b.alpha = 1;
  return b;
}

function tick(b, player, bullets, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) b.update(DT, player, bullets, fx, {});
}

/* ---------------- 1. STG 关不启用 ---------------- */
{
  const b = makeBoss({ platformMelee: false });
  const bullets = makeBullets();
  const p = makePlayer(HOME_X - 20, 300);
  p.vy = 300;
  tick(b, p, bullets, 1.5);
  check(b.platformMelee === false, 'STG: platformMelee 关闭');
  check(b._dive.state === 'idle', 'STG: 不会俯冲');
  check(b.stompBy(p, fx) === false, 'STG: 不能踩 Boss');
  const before = b.spellHp;
  b.spellLock = 0;
  b.hurtCd = 0;
  p.x = b.x - 10; p.y = b.y - 40;
  const ok = b.hitByDash(p, fx);
  check(ok === true, 'STG: 冲刺仍可撞 Boss');
  check(Math.abs(before - b.spellHp - scalePlayerDamage(28)) < 1e-6, 'STG: 冲刺伤害仍是 28 基准');
  check(b.poise === 0, 'STG: 不累积破势');
}

/* ---------------- 2. 俯冲状态机 ---------------- */
{
  const b = makeBoss();
  const bullets = makeBullets();
  const p = makePlayer(HOME_X - 40, GROUND - 92);
  const seen = [];
  let landSpawn = 0;
  const n = Math.round(20 / DT);
  for (let i = 0; i < n; i++) {
    const prev = b._dive.state;
    const recBefore = bullets.rec.length;
    b.update(DT, p, bullets, fx, {});
    if (b._dive.state !== prev) seen.push(b._dive.state);
    if (b._dive.state === 'land' && prev !== 'land') landSpawn = bullets.rec.length - recBefore;
  }
  check(seen[0] === 'charge', '俯冲: 先蓄力');
  check(seen.includes('dive'), '俯冲: 有俯冲段');
  check(seen.includes('land'), '俯冲: 有落地段');
  check(seen.includes('rise'), '俯冲: 有升空段');
  check(seen.filter((s) => s === 'land').length >= 1, '俯冲: 落地结算了');
  check(landSpawn >= 6, `俯冲: 落地生成贴地冲击波（实际 ${landSpawn} 发）`);
  check(bullets.rec.some((x) => Math.abs(x.vy) < 0.5 && Math.abs(x.vx) > 100), '俯冲: 冲击波是横向贴地弹');
  check(b._dive.state === 'idle', '俯冲: 结束后回到 idle');
  check(Math.abs(b.x - b.homeX) < 1 && Math.abs(b.y - b.baseY) < 1, '俯冲: 结束后回到悬停位');
}

/* ---------------- 3. 踩踏判定 ---------------- */
{
  const b = makeBoss();
  const bullets = makeBullets();
  const headTop = b.y - b.h * 0.88;
  // 太高的地方不算踩到
  const far = makePlayer(HOME_X - 20, headTop - 200);
  far.vy = 300;
  check(b.stompBy(far, fx) === false, '踩踏: 太高不结算');
  // 在身体侧面不算
  const side = makePlayer(HOME_X + 200, headTop - 120);
  side.vy = 300;
  check(b.stompBy(side, fx) === false, '踩踏: 太远不结算');
  // 上升中不算
  const rising = makePlayer(HOME_X - 20, headTop - 120);
  rising.vy = -200;
  check(b.stompBy(rising, fx) === false, '踩踏: 上升中不结算');
  // 正常下落命中
  const p = makePlayer(HOME_X - 20, headTop - 120);
  p.vy = 420;
  const hp0 = b.spellHp;
  const poise0 = b.poise;
  check(b.stompBy(p, fx) === true, '踩踏: 下落命中头顶');
  check(hp0 - b.spellHp >= scalePlayerDamage(96) * 0.99, '踩踏: 造成高额伤害');
  check(Math.abs(b.poise - poise0 - 34) < 1e-6, '踩踏: 破势 +34');
  check(p.vy === -620 && p.jumpsLeft === 1, '踩踏: 玩家被弹起并可二段跳');
  check(p.invuln >= 0.4, '踩踏: 落地带护身时间');
  check(b.stompBy(p, fx) === false, '踩踏: 冷却内不重复结算');
}

/* ---------------- 4. 冲刺破势 ---------------- */
{
  const b = makeBoss();
  b.hurtCd = 0;
  const p = makePlayer(b.x - 20, b.y - 40);
  const hp0 = b.spellHp;
  check(b.hitByDash(p, fx) === true, '冲刺: 命中');
  check(Math.abs(hp0 - b.spellHp - scalePlayerDamage(64)) < 1e-6, '冲刺: 平台关伤害 64 基准');
  check(Math.abs(b.poise - 20) < 1e-6, '冲刺: 破势 +20');
}

/* ---------------- 5. 破势硬直 ---------------- */
{
  const b = makeBoss();
  const bullets = makeBullets();
  const p = makePlayer(HOME_X - 200, GROUND - 92);
  const poiseMax0 = b.poiseMax;
  b._addPoise(100, fx);
  check(b.staggerT > 0, '硬直: 破势满进入硬直');
  check(b.poise === 0, '硬直: 破势清空');
  check(b.poiseMax === Math.min(240, poiseMax0 + 25), '硬直: 破势上限提高');
  check(b.staggerCount === 1, '硬直: 计数 +1');

  // 硬直期间停火
  const before = bullets.rec.length;
  b.update(DT, p, bullets, fx, {});
  check(bullets.rec.length === before, '硬直: 停火');
  // 前 0.35 秒坠地
  for (let i = 0; i < 20; i++) b.update(DT, p, bullets, fx, {});
  check(Math.abs(b.y - GROUND) < 2, `硬直: 坠到地面（y=${b.y.toFixed(1)}）`);

  // 硬直期间伤害 ×1.7
  const hp0 = b.spellHp;
  b.damage(100);
  check(Math.abs(hp0 - b.spellHp - 170) < 1e-6, '硬直: 伤害 ×1.7');

  // 硬直中踩踏仍可结算（但不再加破势）
  const headTop = b.y - b.h * 0.88;
  const stomper = makePlayer(HOME_X - 20, headTop - 120);
  stomper.vy = 400;
  b.stompCd = 0;
  const poiseBefore = b.poise;
  check(b.stompBy(stomper, fx) === true, '硬直: 头顶仍可踩');
  check(b.poise === poiseBefore, '硬直: 踩踏不再叠破势');

  // 硬直结束升空回位
  tick(b, p, bullets, 3);
  check(b.staggerT === 0, '硬直: 计时归零');
  check(b._dive.state === 'idle', '硬直: 结束进入升空并回 idle');
  check(Math.abs(b.x - b.homeX) < 1 && Math.abs(b.y - b.baseY) < 1, '硬直: 回到悬停位');
}

/* ---------------- 6. 破势自然衰减 ---------------- */
{
  const b = makeBoss();
  const bullets = makeBullets();
  const p = makePlayer(HOME_X - 300, GROUND - 92);
  b.poise = 60;
  tick(b, p, bullets, 2);
  check(b.poise < 60, `破势: 会自然衰减（剩余 ${b.poise.toFixed(1)}）`);
}

console.log(failures === 0 ? 'ALL OK' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
