/**
 * score.js 自测（纯 Node，无浏览器）：计分 / 倍率 / 榜单 / 容错 / 每日种子。
 * 跑法：node tools/_score_selftest.mjs
 *
 * 用最小 localStorage 替身，测完把键删掉 —— 不污染真实存档目录。
 */
import assert from 'node:assert/strict';

// ---- localStorage 替身：只有 score.js 用到的那三个方法 ----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  SCORE, Score, formatScore, loadBoard, submitScore, bestScore, dailySeed, dailyKey,
} = await import('../src/game/score.js');

const KEY = 'hks.score.v1';
let pass = 0;
const ok = (name, fn) => {
  fn();
  pass++;
  console.log('  ok  ' + name);
};

// ---- formatScore ----
ok('formatScore 补零到 8 位', () => {
  assert.equal(formatScore(0), '00000000');
  assert.equal(formatScore(1234), '00001234');
  assert.equal(formatScore(99999999), '99999999');
  // 超出 8 位不截断（宁可变宽也不能显示错的分数）
  assert.equal(formatScore(123456789), '123456789');
});
ok('formatScore 容错非法值', () => {
  assert.equal(formatScore(NaN), '00000000');
  assert.equal(formatScore(-500), '00000000');
  assert.equal(formatScore('abc'), '00000000');
  assert.equal(formatScore(1.9), '00000001');
});

// ---- 擦弹倍率 ----
ok('擦弹基础分与倍率递增', () => {
  const s = new Score();
  assert.equal(s.mult, 1);
  s.graze(1);
  assert.equal(s.total, SCORE.graze);
  assert.equal(s.grazeCount, 1);
  // 累计到 50 颗后倍率应 +0.1
  s.graze(49);
  assert.equal(s.grazeCount, 50);
  assert.equal(s.mult, 1.1);
});
ok('擦弹倍率封顶', () => {
  const s = new Score();
  s.graze(5000);
  assert.equal(s.mult, SCORE.grazeMultMax);
  assert.equal(s.mult, 2);
});
ok('倍率在停手 hold 之后才衰减，并在 1.0 处归位', () => {
  const s = new Score();
  s.graze(500);                 // 倍率拉满
  const m0 = s.mult;
  s.tick(SCORE.grazeHold);      // 刚好到 hold：还没掉
  assert.equal(s.mult, m0);
  s.tick(SCORE.grazeFall);      // 掉一档
  assert.ok(s.mult < m0, '倍率应开始衰减');
  for (let i = 0; i < 100; i++) s.tick(0.1);
  assert.equal(s.mult, 1);
  // 归位后累计擦弹清零：下一次擦弹不会瞬间蹦回上限
  assert.equal(s.grazeCount, 0);
  s.graze(1);
  assert.equal(s.mult, 1);
});
ok('擦弹分数只增不减', () => {
  const s = new Score();
  s.graze(10);
  const t = s.total;
  s.graze(0);
  s.graze(-5);
  s.graze(NaN);
  assert.equal(s.total, t);
});

// ---- 拾取 / 击破 ----
ok('拾取计分', () => {
  const s = new Score();
  s.item('coin');
  s.item('power');
  s.item('oneup');
  assert.equal(s.total, SCORE.coin + SCORE.power + SCORE.oneup);
});
ok('击破计分 + 同 id 幂等', () => {
  const s = new Score();
  s.kill('fairy', 'e1');
  const t = s.total;
  s.kill('fairy', 'e1');        // 重复上报不重复计分
  assert.equal(s.total, t);
  s.kill('fairy', 'e2');        // 不同 id 正常计分
  assert.equal(s.total, t + SCORE.killFairy);
  s.kill('midboss', 'm1');
  s.kill('boss', 'b1');
  assert.equal(s.total, t + SCORE.killFairy + SCORE.killMidboss + SCORE.killBoss);
});
ok('无 id 的击破不去重（道中杂兵每只都算）', () => {
  const s = new Score();
  s.kill('fairy');
  s.kill('fairy');
  assert.equal(s.total, SCORE.killFairy * 2);
});

// ---- 符卡 ----
ok('符卡：按时 / 按时无伤 / 超时', () => {
  const a = new Score();
  a.cardClear({ onTime: true, noHit: false });
  assert.equal(a.total, SCORE.cardBase);

  const b = new Score();
  b.cardClear({ onTime: true, noHit: true });
  assert.equal(b.total, SCORE.cardBase * SCORE.cardNoHitMul);

  const c = new Score();
  c.cardClear({ onTime: false, noHit: true });  // 超时不给无伤系数
  assert.equal(c.total, SCORE.cardOvertime);
});
ok('符卡不给 POWER / 1UP（那套在 stage.js）', () => {
  const s = new Score();
  s.cardClear({ onTime: true, noHit: true });
  // 分数侧只管分数：除 total 外不该带出 power / extend 之类的字段
  const r = s.stageClear({ lives: 0, graze: 0, continues: 1 });
  assert.deepEqual(Object.keys(r).sort(), ['graze', 'lives', 'noContinue', 'total']);
});

// ---- 通关结算 ----
ok('通关结算：残机 + 擦弹 + 无续命', () => {
  const s = new Score();
  s.graze(100);
  const before = s.total;
  const r = s.stageClear({ lives: 3, graze: 100, continues: 0 });
  assert.equal(r.lives, 3 * SCORE.clearLife);
  assert.equal(r.graze, 100 * SCORE.clearGrazePer);
  assert.equal(r.noContinue, SCORE.clearNoContinue);
  assert.equal(s.total, before + r.lives + r.graze + r.noContinue);
  assert.equal(r.total, s.total);
});
ok('通关结算：用过续命就没加成', () => {
  const s = new Score();
  const r = s.stageClear({ lives: 0, graze: 0, continues: 2 });
  assert.equal(r.noContinue, 0);
});

// ---- 榜单 ----
ok('submitScore 首次即为第一名 + 落盘', () => {
  store.delete(KEY);
  const r = submitScore('stage1', 'N', { score: 123456, char: 'reimu', graze: 88 });
  assert.equal(r.rank, 1);
  assert.equal(r.best, 0);
  assert.equal(r.isNew, true);
  const board = loadBoard();
  assert.equal(board.stage1.N.length, 1);
  assert.equal(board.stage1.N[0].score, 123456);
  assert.equal(board.stage1.N[0].char, 'reimu');
  assert.equal(board.stage1.N[0].graze, 88);
  assert.match(board.stage1.N[0].date, /^\d{4}-\d{2}-\d{2}$/);
});
ok('submitScore 排序、名次、isNew', () => {
  store.delete(KEY);
  submitScore('stage1', 'N', { score: 1000, char: 'reimu' });
  submitScore('stage1', 'N', { score: 5000, char: 'marisa' });
  const r = submitScore('stage1', 'N', { score: 3000, char: 'reimu' });
  assert.equal(r.rank, 2);
  assert.equal(r.best, 5000);
  assert.equal(r.isNew, false);
  const list = loadBoard().stage1.N;
  assert.deepEqual(list.map((e) => e.score), [5000, 3000, 1000]);
});
ok('榜单上限 5 条，第 6 名不进榜', () => {
  store.delete(KEY);
  for (let i = 1; i <= 5; i++) submitScore('stage2', 'H', { score: i * 100, char: 'reimu' });
  const r = submitScore('stage2', 'H', { score: 50, char: 'reimu' });
  assert.equal(r.rank, 0, '没进榜 rank 为 0');
  assert.equal(loadBoard().stage2.H.length, 5);
  // 再交一个高分：挤掉最低的
  submitScore('stage2', 'H', { score: 9999, char: 'marisa' });
  const list = loadBoard().stage2.H;
  assert.equal(list.length, 5);
  assert.equal(list[0].score, 9999);
  assert.ok(!list.some((e) => e.score === 100), '最低分被挤出');
});
ok('不同关卡 / 难度互不串档', () => {
  store.delete(KEY);
  submitScore('stage1', 'E', { score: 111, char: 'reimu' });
  submitScore('stage1', 'L', { score: 222, char: 'reimu' });
  submitScore('extra', 'EX', { score: 333, char: 'marisa' });
  const b = loadBoard();
  assert.equal(b.stage1.E[0].score, 111);
  assert.equal(b.stage1.L[0].score, 222);
  assert.equal(b.extra.EX[0].score, 333);
  assert.equal(bestScore('extra', 'EX'), 333);
  assert.equal(bestScore('stage1', 'N'), 0);
});
ok('同分不顶掉老纪录（稳定排序）', () => {
  store.delete(KEY);
  submitScore('stage3', 'N', { score: 777, char: 'reimu' });
  submitScore('stage3', 'N', { score: 777, char: 'marisa' });
  const list = loadBoard().stage3.N;
  assert.equal(list.length, 2);
  assert.equal(list[0].char, 'reimu', '先来的排前面');
});

// ---- 损坏数据容错 ----
ok('损坏 JSON → 空表，不抛错', () => {
  for (const bad of ['{{{', 'null', '"str"', '[]', '42']) {
    store.set(KEY, bad);
    assert.deepEqual(loadBoard(), {});
  }
});
ok('结构不合法 → 只丢坏的部分', () => {
  store.set(KEY, JSON.stringify({
    stage1: { N: [{ score: 100, char: 'reimu' }, { score: 'x' }, null, { char: 'noscore' }] },
    stage2: 'oops',
    stage3: { E: 'notarray' },
  }));
  const b = loadBoard();
  assert.equal(b.stage1.N.length, 1, '只保留结构合法的那条');
  assert.equal(b.stage2, undefined);
  assert.equal(b.stage3, undefined);
});
ok('localStorage 抛错（隐私模式）也不崩', () => {
  const orig = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
  };
  assert.deepEqual(loadBoard(), {});
  const r = submitScore('stage1', 'N', { score: 5, char: 'reimu' });
  assert.equal(r.rank, 1);
  globalThis.localStorage = orig;
  store.delete(KEY);
});

// ---- 每日种子 ----
ok('dailySeed 同一天稳定、不同天不同', () => {
  const d1 = new Date(2026, 10, 18, 0, 0, 1);
  const d2 = new Date(2026, 10, 18, 23, 59, 59);
  const d3 = new Date(2026, 10, 19, 0, 0, 1);
  assert.equal(dailySeed(d1), dailySeed(d2), '同一自然日必须一致');
  assert.notEqual(dailySeed(d1), dailySeed(d3));
  assert.equal(dailySeed(), dailySeed(new Date()));
});
ok('dailySeed 是非零 32 位整数（兼容 ?seed=）', () => {
  for (let i = 0; i < 400; i++) {
    const d = new Date(2026, 0, 1 + i);
    const v = dailySeed(d);
    assert.ok(Number.isInteger(v) && v > 0 && v <= 0xffffffff, 'seed 越界: ' + v);
  }
});
ok('dailyKey 是本地 YYYY-MM-DD', () => {
  assert.match(dailyKey(new Date(2026, 0, 5)), /^2026-01-05$/);
});

console.log(`\n_score_selftest: ${pass} 项全过`);
