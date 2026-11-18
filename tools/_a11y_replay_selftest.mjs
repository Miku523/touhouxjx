/**
 * a11y + replay 数据层自测（无浏览器，纯 Node）。
 * 跑法：node tools/_a11y_replay_selftest.mjs
 *
 * 只测「数据」这一层：设置读写/损坏容错、颜色映射、录像编解码往返、
 * 5 分钟录像的真实字节数、旧版本录像的优雅失效。绘制需要浏览器，见报告。
 */

import assert from 'node:assert/strict';
import {
  A11Y_PALETTES,
  loadA11y, saveA11y, getA11y, setA11y, cyclePalette,
  remapBulletColor, getHitboxColor, getFxLevel, isReducedFx,
  installPool, paletteDotsHtml, drawContrastVeil, drawHitboxAura,
} from '../src/game/a11y.js';
import {
  Recorder, ReplayStore, Player, decodeReplay, verifyReplay, REPLAY_VERSION, bitsToActions,
} from '../src/game/replay.js';

let pass = 0;
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };
const section = (t) => console.log(`\n${t}`);

/* ============================ a11y ============================ */

section('a11y: 默认值');
{
  // Node 里没有 localStorage / window，模块必须能安静降级
  const s = loadA11y();
  assert.equal(s.v, 1);
  assert.equal(s.contrast, false);
  assert.equal(s.palette, 'default');
  assert.ok(s.fxLevel === 'full' || s.fxLevel === 'reduced');
  ok('无 localStorage 时返回默认值且不抛');
}

section('a11y: 假 localStorage 往返');
{
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  setA11y({ contrast: true, palette: 'deutan', fxLevel: 'reduced' });
  const raw = JSON.parse(mem.get('hks.a11y.v1'));
  assert.equal(raw.contrast, true);
  assert.equal(raw.palette, 'deutan');
  assert.equal(raw.fxLevel, 'reduced');
  assert.equal(raw.v, 1);
  ok('setA11y 自动落盘到 hks.a11y.v1');

  const re = loadA11y();
  assert.equal(re.contrast, true);
  assert.equal(re.palette, 'deutan');
  assert.equal(re.fxLevel, 'reduced');
  ok('loadA11y 读回一致');

  assert.equal(getFxLevel(), 'reduced');
  assert.equal(isReducedFx(), true);
  assert.equal(getHitboxColor().startsWith('#'), true);
  ok('getFxLevel / isReducedFx / getHitboxColor 生效');
}

section('a11y: 损坏数据容错');
{
  const cases = [
    ['{坏 JSON', '非法 JSON'],
    ['null', 'null'],
    ['[]', '数组'],
    ['"str"', '字符串'],
    ['{"v":99,"contrast":true,"palette":"contrast"}', '未知版本'],
    ['{"v":1,"contrast":"yes","palette":"rainbow","fxLevel":"max"}', '字段类型全错'],
  ];
  for (const [raw, label] of cases) {
    globalThis.localStorage.setItem('hks.a11y.v1', raw);
    const s = loadA11y();
    assert.equal(s.v, 1);
    assert.equal(s.contrast, false, `${label} 应回默认`);
    assert.equal(s.palette, 'default', `${label} 应回默认`);
    ok(`${label} → 默认值`);
  }
  // 部分损坏：只坏一个字段，好的字段要留住
  globalThis.localStorage.setItem('hks.a11y.v1', '{"v":1,"contrast":true,"palette":"nope"}');
  const s = loadA11y();
  assert.equal(s.contrast, true);
  assert.equal(s.palette, 'default');
  ok('部分损坏：好字段保留，坏字段丢弃');
}

section('a11y: 颜色映射与预设');
{
  assert.equal(remapBulletColor('#ff5ea8', 'default'), '#ff5ea8');
  ok('default 恒等');

  const c = remapBulletColor('#ff5ea8', 'contrast');
  assert.notEqual(c, '#ff5ea8');
  assert.match(c, /^#[0-9a-f]{6}$/);
  ok(`高对比把粉弹推到 ${c}`);

  // 红绿友好：暖色/冷色必须落到两组截然不同的色相
  const warm = remapBulletColor('#ff3040', 'deutan');
  const cool = remapBulletColor('#30ff40', 'deutan');
  const hue = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    let x = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return x * 60;
  };
  const d = Math.abs(hue(warm) - hue(cool));
  assert.ok(d > 120, `红绿友好两色相差 ${d}° 应 > 120°（实测 ${warm}/${cool}）`);
  ok(`红绿色弱：暖→${warm} 冷→${cool}，色相差 ${d.toFixed(0)}°`);

  const bw = remapBulletColor('#1e90ff', 'tritan');
  const by = remapBulletColor('#ffe000', 'tritan');
  assert.ok(Math.abs(hue(bw) - hue(by)) > 120, '蓝黄色弱两色相要拉开');
  ok(`蓝黄色弱：蓝→${bw} 黄→${by}`);

  assert.equal(remapBulletColor('#ffffff', 'deutan'), '#ffffff');
  ok('近白弹在色弱预设下保持白（明度差已足够）');

  assert.match(remapBulletColor('garbage', 'contrast'), /^#[0-9a-f]{6}$/);
  ok('坏色值不崩，退回可解析颜色');

  assert.equal(A11Y_PALETTES.length, 4);
  ok('四个预设齐备');
}

section('a11y: 弹池补丁');
{
  // 最小可用弹池替身：字段与真实 BulletPool 一致（pool 数组 + active + spawn 返单颗）
  const pool = {
    pool: [],
    spawn(o) {
      const b = { active: true, color: o.color || '#ff5ea8' };
      this.pool.push(b);
      return b;
    },
  };
  installPool(pool);
  setA11y({ palette: 'deutan' });
  const b = pool.spawn({ color: '#ff5ea8' });
  assert.equal(b._a11ySrc, '#ff5ea8');
  assert.notEqual(b.color, '#ff5ea8');
  ok(`新弹出生即被映射：${b._a11ySrc} → ${b.color}`);

  // 换预设后存活弹要即时重刷，且不能在上一次结果上叠乘
  setA11y({ palette: 'default' });
  assert.equal(b.color, '#ff5ea8');
  setA11y({ palette: 'contrast' });
  const again = remapBulletColor('#ff5ea8', 'contrast');
  assert.equal(b.color, again, '重刷应基于原始色，不是叠乘');
  ok('换预设即时重刷存活弹，且不叠乘');

  installPool(pool);
  assert.equal(typeof pool.__a11yPatched, 'boolean');
  ok('installPool 幂等');
}

section('a11y: 玩家切预设 & DOM 片段');
{
  setA11y({ palette: 'default' });
  cyclePalette(1);
  assert.equal(getA11y().palette, 'contrast');
  cyclePalette(-1);
  assert.equal(getA11y().palette, 'default');
  cyclePalette(-1);
  assert.equal(getA11y().palette, 'tritan', '负向循环要绕回末尾');
  ok('cyclePalette 双向循环');

  const html = paletteDotsHtml('deutan');
  assert.match(html, /hks-a11y-dots/);
  assert.equal((html.match(/<i /g) || []).length, 3);
  ok('paletteDotsHtml 输出三个色块');
}

section('a11y: 绘制辅助对空 ctx 的防御');
{
  const noop = () => {};
  const ctx = {
    save: noop, restore: noop, beginPath: noop, arc: noop, fill: noop, stroke: noop,
    fillRect: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
    set globalAlpha(v) {}, set globalCompositeOperation(v) {},
  };
  drawContrastVeil(ctx, 1280, 720); // contrast 关 → 直接返回，不抛
  drawHitboxAura(ctx, { x: 100, y: 100, r: 3 }, 1.2);
  drawHitboxAura(ctx, null);
  ok('drawContrastVeil / drawHitboxAura 在纯桩 ctx 上不抛');
}

/* ============================ replay ============================ */

/** 造一个可控的假 Input（接口只用到 down()） */
function makeInput(bitsFn) {
  return { down: (a) => bitsFn().includes(a) };
}

section('replay: 录制 → 编码 → 解码 往返');
{
  const rec = new Recorder();
  rec.start({ seed: 12345, stage: 1, difficulty: 'N', char: 'reimu', lives: 3 });

  const N = 600;
  for (let f = 0; f < N; f++) {
    // 造点真实感：前 200 帧向右射，中间松开，末段带低速
    const actions = [];
    if (f < 200) actions.push('right', 'shoot');
    else if (f % 7 < 3) actions.push('left');
    if (f > 400) actions.push('slow');
    const player = {
      x: 100 + Math.sin(f * 0.02) * 60,
      y: 400 + Math.cos(f * 0.03) * 20,
      focus: f > 400,
      alive: f < 580,
      get hitPoint() { return { x: this.x, y: this.y + 16, r: 3 }; },
    };
    rec.frame(makeInput(() => actions), player, f === 300);
  }

  const record = rec.stop();
  assert.ok(record && record.frames === N);
  assert.equal(record.v, REPLAY_VERSION);
  ok(`录 ${N} 帧，${record.bytes.byteLength} 字节`);

  const dec = decodeReplay(record.bytes);
  assert.equal(dec.ok, true, JSON.stringify(dec));
  assert.equal(dec.frames, N);
  assert.equal(dec.meta.seed, 12345);
  assert.equal(dec.meta.char, 'reimu');
  assert.deepEqual(dec.meta.castFrames, [300]);
  ok('解码 ok，meta 完整');

  const v = verifyReplay(dec);
  assert.equal(v.ok, true, JSON.stringify(v));
  ok('verifyReplay 自洽');

  // 输入位必须逐帧一致
  let mismatch = 0;
  for (let f = 0; f < N; f++) {
    const expected = [];
    if (f < 200) expected.push('right', 'shoot');
    else if (f % 7 < 3) expected.push('left');
    if (f > 400) expected.push('slow');
    const got = bitsToActions(dec.inputs[f]).sort();
    if (got.join() !== expected.sort().join()) mismatch++;
  }
  assert.equal(mismatch, 0, `${mismatch} 帧输入不一致`);
  ok('600 帧输入位逐帧一致');

  // 幽灵轨迹按 0.5px 量化，误差 <= 0.25px
  let maxErr = 0;
  for (let f = 0; f < N; f++) {
    const px = 100 + Math.sin(f * 0.02) * 60;
    const py = 400 + Math.cos(f * 0.03) * 20 + 16;
    maxErr = Math.max(maxErr, Math.abs(dec.xs[f] - px), Math.abs(dec.ys[f] - py));
  }
  assert.ok(maxErr <= 0.25, `轨迹误差 ${maxErr}`);
  ok(`幽灵轨迹量化误差 ≤ ${maxErr.toFixed(3)}px`);

  // 状态位
  assert.equal(dec.states[500] & 1, 1, 'focus');
  assert.equal(dec.states[590] & 2, 0, 'dead');
  ok('focus / alive 状态位正确');
}

section('replay: Player 帧游标');
{
  const rec = new Recorder();
  rec.start({ seed: 1 });
  for (let f = 0; f < 120; f++) {
    rec.frame(makeInput(() => ['left']), { x: f, y: 100, focus: false, alive: true });
  }
  const dec = decodeReplay(rec.stop().bytes);

  const p = new Player(dec);
  assert.equal(p.ok, true);
  assert.equal(p.totalFrames, 120);
  assert.ok(Math.abs(p.duration - 2) < 1e-9);
  assert.ok(Math.abs(p.x - 0) < 1);
  p.step();
  assert.equal(p.frame, 1);
  p.seek(60);
  assert.ok(Math.abs(p.x - 60) < 1);
  ok('step / seek / x 取值正确');

  p.seek(0);
  p.play();
  p.tick(1 / 60);          // 正好一帧
  assert.equal(p.frame, 1);
  p.speed = 2;
  p.tick(1 / 60);          // 两帧
  assert.equal(p.frame, 3);
  ok('tick 尊重 speed');

  p.seek(p.totalFrames);
  assert.equal(p.done, true);
  p.tick(1);
  assert.equal(p.playing, false);
  ok('播完自动停');
}

section('replay: 旧版本 / 损坏文件优雅失效');
{
  const rec = new Recorder();
  rec.start({ seed: 7 });
  for (let f = 0; f < 30; f++) rec.frame(makeInput(() => []), { x: 0, y: 0, alive: true });
  const bytes = rec.stop().bytes;

  const badVer = new Uint8Array(bytes);
  badVer[4] = 99;
  assert.deepEqual(decodeReplay(badVer), { ok: false, reason: 'version', version: 99 });
  ok('未知版本 → {ok:false, reason:"version"}');

  assert.equal(decodeReplay(new Uint8Array(0)).reason, 'too-short');
  assert.equal(decodeReplay(new Uint8Array([1, 2, 3, 4, 1, 0, 0, 0, 1])).reason, 'not-replay');
  ok('空/非录像 → 拒绝且不抛');

  const truncated = bytes.subarray(0, Math.floor(bytes.length / 2));
  const t = decodeReplay(truncated);
  assert.equal(t.ok, false);
  ok(`截断文件 → ${t.reason}`);

  // 反序列化后任意破坏字节也不能抛
  let threw = false;
  for (let k = 0; k < 200; k++) {
    const dup = new Uint8Array(bytes);
    dup[9 + (k % (dup.length - 9))] = k & 0xff;
    try {
      decodeReplay(dup);
    } catch {
      threw = true;
      break;
    }
  }
  assert.equal(threw, false);
  ok('200 次随机字节破坏：零异常');
}

section('replay: 存储（IndexedDB 缺席 → 内存退化）');
{
  const store = new ReplayStore();
  const rec = new Recorder();
  rec.start({ seed: 42, stage: 2, difficulty: 'L', char: 'marisa' });
  for (let f = 0; f < 300; f++) {
    rec.frame(makeInput(() => (f % 5 ? ['shoot'] : ['shoot', 'jump'])), {
      x: 300 + f * 0.5, y: 500, focus: f % 3 === 0, alive: true,
    });
  }
  const record = rec.stop();

  const id = await store.save(record);
  assert.ok(typeof id === 'string' && id.length > 8);
  ok(`save → id ${id}`);

  const list = await store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].meta.seed, 42);
  assert.ok(list[0].size > 0);
  assert.equal(list[0].bytes, undefined, 'list 不应带 bytes');
  ok('list 只返回元信息');

  const loaded = await store.load(id);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.frames, 300);
  ok('load 解码成功');

  assert.ok((await store.usage()) > 0);
  await store.remove(id);
  assert.equal((await store.list()).length, 0);
  assert.equal((await store.load(id)).reason, 'not-found');
  ok('remove 后查不到');

  const missing = await store.load('nope');
  assert.equal(missing.ok, false);
  ok('读不存在的 id 不抛');
}

section('replay: 5 分钟录像实际体积');
{
  // 模拟真实对局：60fps × 5min = 18000 帧。
  // 输入用「每秒变化 6 次」的随机段，幽灵轨迹用平滑的 8 字轨迹（贴近实际走位熵）。
  const FPS = 60;
  const MIN = 5;
  const N = FPS * 60 * MIN;

  const rec = new Recorder();
  rec.start({ seed: 20260101, stage: 3, difficulty: 'H', char: 'reimu', lives: 3 });

  let dir = 0;
  for (let f = 0; f < N; f++) {
    if (f % 10 === 0) dir = (dir + 1) % 4; // 每 1/6 秒换一次方向
    const actions = [];
    if (dir === 0) actions.push('right');
    else if (dir === 1) actions.push('left');
    else if (dir === 2) actions.push('down');
    else actions.push('up');
    if (f % 3 !== 0) actions.push('shoot');   // 射击大体按住
    if (f % 47 < 20) actions.push('slow');   // 低速成段
    if (f % 300 === 0) actions.push('jump');
    const t = f / FPS;
    const player = {
      x: 640 + Math.sin(t * 1.7) * 260,
      y: 520 + Math.cos(t * 2.3) * 90,
      focus: f % 47 < 20,
      alive: true,
      get hitPoint() { return { x: this.x, y: this.y + 16, r: 3 }; },
    };
    rec.frame(makeInput(() => actions), player, f % 900 === 0);
  }

  const t0 = performance.now();
  const record = rec.stop();
  const encMs = performance.now() - t0;
  const size = record.bytes.byteLength;

  const t1 = performance.now();
  const dec = decodeReplay(record.bytes);
  const decMs = performance.now() - t1;
  assert.equal(dec.ok, true);
  assert.equal(dec.frames, N);

  const perFrame = size / N;
  console.log(`\n  ── 5 分钟（${N} 帧 @60fps）实测 ──`);
  console.log(`     编码后体积    ${size} 字节 = ${(size / 1024).toFixed(1)} KB`);
  console.log(`     平均每帧      ${perFrame.toFixed(2)} 字节`);
  console.log(`     编码耗时      ${encMs.toFixed(1)} ms（一次性，放在关卡结算）`);
  console.log(`     解码耗时      ${decMs.toFixed(1)} ms`);
  console.log(`     localStorage 5MB 上限约可存 ${Math.floor((5 * 1024 * 1024) / size)} 个\n`);
  ok(`5 分钟录像 ${(size / 1024).toFixed(1)} KB（${perFrame.toFixed(2)} B/帧）`);
  assert.ok(size < 500 * 1024, '应远小于 500KB');
}

section('replay: 输入抖动对体积的影响（最坏情况）');
{
  // 每帧随机输入 = RLE 完全失效，这是体积上界
  const N = 18000;
  const rec = new Recorder();
  rec.start({ seed: 1 });
  let seed = 1;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let f = 0; f < N; f++) {
    const want = ['left', 'right', 'up', 'down', 'jump', 'shoot', 'slow', 'dash'].filter(() => rnd() < 0.5);
    rec.frame(makeInput(() => want), { x: (rnd() * 1280) | 0, y: (rnd() * 720) | 0, alive: true });
  }
  const size = rec.stop().bytes.byteLength;
  console.log(`     最坏情况（每帧随机输入/乱跳位置）${(size / 1024).toFixed(1)} KB`);
  ok(`最坏情况 ${(size / 1024).toFixed(1)} KB，仍可接受`);
}

section('replay: 空录制');
{
  const rec = new Recorder();
  rec.start({});
  assert.equal(rec.stop(), null);
  ok('零帧录制返回 null，不产生坏记录');
}

console.log(`\n全部通过：${pass} 项\n`);
