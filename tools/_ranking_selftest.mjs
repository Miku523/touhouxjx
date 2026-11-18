/**
 * ranking.js headless 自测。纯 Node，不进浏览器。
 *
 * score.js 和 ranking.js 都会摸 localStorage，所以必须在 import 之前
 * 把 globalThis.localStorage 换成一个假实现（用 node:fs 落一个临时文件，
 * 这样「写进去再读出来」这条路径是真的走了一遍）。
 *
 * 跑法：node tools/_ranking_selftest.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------- 假 localStorage（必须在 import 之前装好）----------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hks-ranking-'));
const storeFile = path.join(tmpDir, 'ls.json');
let store = {};
try {
  store = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
} catch {
  store = {};
}

const flush = () => {
  try {
    fs.writeFileSync(storeFile, JSON.stringify(store));
  } catch {
    /* 自测里写不进去就只是不持久，不影响断言 */
  }
};

globalThis.localStorage = {
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
  },
  setItem(k, v) {
    store[k] = String(v);
    flush();
  },
  removeItem(k) {
    delete store[k];
    flush();
  },
  clear() {
    store = {};
    flush();
  },
  key(i) {
    return Object.keys(store)[i] ?? null;
  },
  get length() {
    return Object.keys(store).length;
  },
};

// ---------- 然后才 import ----------
const score = await import('../src/game/score.js');
const ranking = await import('../src/game/ranking.js');

// ---------- 断言小工具 ----------
let passed = 0;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const ok = (cond, msg) => {
  if (!cond) fail(msg);
  passed++;
};

// 1. dailySeed：同一天两次相同、不同日期不同、非零 32 位整数
{
  const d1 = new Date(2026, 4, 17, 9, 30);
  const d2 = new Date(2026, 4, 17, 23, 59);
  const d3 = new Date(2026, 4, 18, 0, 0);
  const a = score.dailySeed(d1);
  const b = score.dailySeed(d2);
  const c = score.dailySeed(d3);
  ok(a === b, `dailySeed 同一天应相同：${a} vs ${b}`);
  ok(a !== c, `dailySeed 不同日期应不同：${a} vs ${c}`);
  ok(Number.isInteger(a) && a > 0 && a <= 0xffffffff, `dailySeed 应为非零 32 位整数：${a}`);
  ok(a !== 0, 'dailySeed 不应为 0');
  console.log(`  dailySeed 2026-05-17 = ${a} / 2026-05-18 = ${c}`);
}

// 2. dailyKey：格式合理（YYYY-MM-DD 且能还原）
{
  const d = new Date(2026, 0, 5, 13, 0);
  const k = score.dailyKey(d);
  ok(typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k), `dailyKey 格式应为 YYYY-MM-DD，实际 ${k}`);
  ok(k === '2026-01-05', `dailyKey 应补零，实际 ${k}`);
  console.log(`  dailyKey = ${k}`);
}

// 3. markDailyDone 之后 dailyInfo().done === true
{
  const d = new Date(2026, 4, 17, 12, 0);
  const before = ranking.dailyInfo(d);
  ok(before.done === false, `未挑战时 done 应为 false，实际 ${before.done}`);
  ok(before.best === 0, `未挑战时 best 应为 0，实际 ${before.best}`);

  const marked = ranking.markDailyDone(d, 4321);
  ok(marked.best === 4321, `markDailyDone 应返回 best=4321，实际 ${marked.best}`);
  ok(marked.seed === before.seed, 'markDailyDone 的 seed 应与 dailyInfo 一致');
  ok(marked.key === before.key, 'markDailyDone 的 key 应与 dailyInfo 一致');

  const after = ranking.dailyInfo(d);
  ok(after.done === true, `挑战后 done 应为 true，实际 ${after.done}`);
  ok(after.best === 4321, `挑战后 best 应为 4321，实际 ${after.best}`);

  // 同日再打一次分数更高：best 取最大，done 保持 true
  ranking.markDailyDone(d, 9999);
  const after2 = ranking.dailyInfo(d);
  ok(after2.best === 9999, `同日更高分应刷新 best，实际 ${after2.best}`);
  // 同日打更低分不应回退
  ranking.markDailyDone(d, 1);
  ok(ranking.dailyInfo(d).best === 9999, '同日更低分不应覆盖 best');

  // 另一天仍是未挑战
  const other = ranking.dailyInfo(new Date(2026, 4, 18, 12, 0));
  ok(other.done === false, '别的日期应仍未挑战');
  console.log(`  每日挑战 ${before.key}: seed=${before.seed} best=${after2.best}`);
}

// 4. 空存档 listBoard 返回 []
{
  const empty = ranking.listBoard('stage1', 'N');
  ok(Array.isArray(empty) && empty.length === 0, `空存档 listBoard 应返回 []，实际 ${JSON.stringify(empty)}`);
  // 不存在的关卡/难度也不应炸
  ok(ranking.listBoard('stageX', 'nope').length === 0, '不存在的关卡应返回 []');
  ok(ranking.listBoard().length === 0, 'listBoard() 无参应返回 []');
}

// 5. submitScore 之后能读回、降序、最多 TOP_N 条
// 用 main.js 真实存的难度键 'N'（DIFFICULTY_KEYS 短键）造数据：这样一旦 ranking 的
// tab id 与存档键脱钩，这里就会红，而不是两边同错自洽通过。
{
  const TOP_N = 5;
  const scores = [1200, 8800, 300, 5500, 9400, 77, 6600];
  for (const s of scores) {
    score.submitScore('stage1', 'N', { score: s, char: 'reimu', graze: s / 10, date: '2026-05-17' });
  }
  const list = ranking.listBoard('stage1', 'N');
  ok(list.length === TOP_N, `listBoard 应最多 ${TOP_N} 条，实际 ${list.length}`);
  ok(list.length > 0, 'listBoard 不应为空');

  const nums = list.map((e) => e.score);
  ok(JSON.stringify(nums) === JSON.stringify([...nums].sort((a, b) => b - a)), `榜单应降序，实际 ${nums}`);
  ok(nums[0] === 9400, `榜首应是 9400，实际 ${nums[0]}`);
  ok(list.every((e) => typeof e.char === 'string'), '每条应带 char 字段');
  ok(list.every((e) => Number.isFinite(e.graze)), '每条应带 graze 字段');

  // 不同难度互不污染
  ok(ranking.listBoard('stage1', 'H').length === 0, '别的难度应仍是空的');
  console.log(`  stage1/N 榜单：${nums.join(' > ')}`);
}

// 6. TABS 非空、id 无重复
{
  const { DIFFICULTY_TABS, STAGE_TABS } = ranking;
  ok(Array.isArray(DIFFICULTY_TABS) && DIFFICULTY_TABS.length > 0, 'DIFFICULTY_TABS 不应为空');
  ok(Array.isArray(STAGE_TABS) && STAGE_TABS.length > 0, 'STAGE_TABS 不应为空');
  ok(DIFFICULTY_TABS.every((t) => typeof t.id === 'string' && t.id && typeof t.label === 'string' && t.label),
     'DIFFICULTY_TABS 每项应有 id 和 label');
  ok(STAGE_TABS.every((t) => typeof t.id === 'string' && t.id && typeof t.label === 'string' && t.label),
     'STAGE_TABS 每项应有 id 和 label');
  const dIds = DIFFICULTY_TABS.map((t) => t.id);
  ok(new Set(dIds).size === dIds.length, `DIFFICULTY_TABS id 有重复：${dIds}`);
  const sIds = STAGE_TABS.map((t) => t.id);
  ok(new Set(sIds).size === sIds.length, `STAGE_TABS id 有重复：${sIds}`);
  // 难度 id 必须和 score.js 的存档键一致，否则读不到榜
  ok(dIds.includes('EX') && !dIds.includes('extra'), `EXTRA 的存档键应是 'EX'，实际 ${dIds}`);
  ok(['E', 'N', 'H', 'L'].every((k) => dIds.includes(k)),
     `难度 id 应是 difficulty.js 的 DIFFICULTY_KEYS 短键 E/N/H/L，实际 ${dIds}`);
  ok(sIds.includes('extra'), `STAGE_TABS 应含 'extra'，实际 ${sIds}`);
  console.log(`  难度：${dIds.join('/')}`);
  console.log(`  关卡：${sIds.join('/')}`);
}

// 7. formatScore
{
  ok(score.formatScore(12345) === '00012345', `formatScore(12345) 应为 '00012345'，实际 ${score.formatScore(12345)}`);
  ok(score.formatScore(0) === '00000000', `formatScore(0) 应为 '00000000'，实际 ${score.formatScore(0)}`);
  ok(score.formatScore() === '00000000', 'formatScore() 无参应为 8 个 0');
  console.log(`  formatScore(12345) = ${score.formatScore(12345)}`);
}

// clearRankingData 之后每日记录应清空
{
  ranking.clearRankingData();
  const cleared = ranking.dailyInfo(new Date(2026, 4, 17, 12, 0));
  ok(cleared.done === false, 'clearRankingData 之后今日应显示未挑战');
  ok(cleared.best === 0, 'clearRankingData 之后 best 应为 0');
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n✓ 全部通过（${passed} 项断言）`);
process.exit(0);
