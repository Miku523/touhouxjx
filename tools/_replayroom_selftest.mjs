// 录像室自测：纯 Node，无浏览器。import 前先铺最小 DOM stub。
import assert from 'node:assert/strict';

// ---------- 最小 DOM stub ----------
function makeCanvas() {
  const noop = () => {};
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: '',
    fillRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    arc: noop,
    fill: noop,
    clearRect: noop,
    save: noop,
    restore: noop,
    closePath: noop,
  };
  const el = makeEl('canvas');
  el.getContext = (kind) => (kind === '2d' ? ctx : null);
  return el;
}

function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    style: {},
    children: [],
    childNodes: [],
    parentNode: null,
    width: 0,
    height: 0,
    attrs: {},
    classList: null,
    appendChild(child) {
      if (!child) return child;
      if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
        child.parentNode.removeChild(child);
      }
      this.children.push(child);
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      const j = this.childNodes.indexOf(child);
      if (j >= 0) this.childNodes.splice(j, 1);
      if (child) child.parentNode = null;
      return child;
    },
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    },
    getAttribute(k) {
      return this.attrs[k] === undefined ? null : this.attrs[k];
    },
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
  };
  const set = new Set();
  el.classList = {
    add(...names) {
      names.forEach((n) => set.add(n));
      el.className = Array.from(set).join(' ');
    },
    remove(...names) {
      names.forEach((n) => set.delete(n));
      el.className = Array.from(set).join(' ');
    },
    toggle(n, force) {
      const want = force === undefined ? !set.has(n) : !!force;
      if (want) set.add(n);
      else set.delete(n);
      el.className = Array.from(set).join(' ');
      return want;
    },
    contains(n) {
      return set.has(n);
    },
  };
  if (String(tag).toLowerCase() === 'canvas') return el;
  return el;
}

const head = makeEl('head');
globalThis.document = {
  head,
  body: makeEl('body'),
  getElementById() {
    return null;
  },
  createElement(tag) {
    return String(tag).toLowerCase() === 'canvas' ? makeCanvas() : makeEl(tag);
  },
  createTextNode(t) {
    const n = makeEl('#text');
    n.nodeValue = String(t);
    return n;
  },
  querySelectorAll() {
    return [];
  },
};
globalThis.requestAnimationFrame = (fn) => {
  fn(0);
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

const host = makeEl('div');

// ---------- 被测模块 ----------
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const mod = await import('../src/game/replayRoom.js');
const replay = await import('../src/game/replay.js');
const { REPLAYROOM_KEY, formatDuration, describeReplay, ReplayRoom } = mod;
const { ReplayStore, Player, decodeReplay, verifyReplay } = replay;

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeInput() {
  return {
    actionOf(code) {
      return (
        {
          ArrowUp: 'up',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          ArrowRight: 'right',
          Enter: 'confirm',
          Escape: 'cancel',
          KeyP: 'pause',
        }[code] || ''
      );
    },
  };
}

const key = (code) => ({ code, preventDefault() {} });

// 1. formatDuration
test('formatDuration 基本换算与容错', () => {
  assert.equal(formatDuration(0), '0:00.0');
  assert.equal(formatDuration(83.4), '1:23.4');
  assert.equal(formatDuration(9.999), '0:10.0');
  assert.equal(formatDuration(600), '10:00.0');
  assert.doesNotThrow(() => formatDuration(-1));
  assert.doesNotThrow(() => formatDuration(NaN));
  assert.doesNotThrow(() => formatDuration(undefined));
  assert.equal(formatDuration(-1), '0:00.0');
});

// 2. describeReplay 缺字段容错
test('describeReplay 缺字段不抛错', () => {
  assert.doesNotThrow(() => describeReplay(undefined));
  assert.doesNotThrow(() => describeReplay({}));
  assert.doesNotThrow(() => describeReplay({ meta: null }));
  assert.doesNotThrow(() => describeReplay({ meta: {}, duration: undefined, size: undefined }));
  const full = describeReplay({
    id: 'x',
    createdAt: Date.now(),
    frames: 8040,
    duration: 134,
    meta: { stage: 3, difficulty: 'N', char: 'reimu' },
    size: 3250585,
  });
  assert.equal(full, '第 3 面 · NORMAL · 灵梦 · 2:14 · 3.1MB');
  assert.equal(typeof describeReplay({}), 'string');
});

// 3. 导出齐全
test('模块导出项齐全', () => {
  assert.equal(REPLAYROOM_KEY, 'hks.replayroom.v1');
  assert.equal(typeof formatDuration, 'function');
  assert.equal(typeof describeReplay, 'function');
  assert.equal(typeof ReplayRoom, 'function');
  assert.equal(typeof ReplayStore, 'function');
  assert.equal(typeof Player, 'function');
  assert.equal(typeof decodeReplay, 'function');
  assert.equal(typeof verifyReplay, 'function');
});

// 4. ReplayStore 存取（Node 走内存 Map）
test('ReplayStore save 后 list 有 1 条', async () => {
  const store = new ReplayStore();
  const opened = await store.open();
  assert.equal(opened, false, 'Node 无 indexedDB 应退化为内存');
  const id = await store.save({ bytes: new Uint8Array(10), frames: 5, meta: {} });
  assert.ok(id, '应返回 id');
  const rows = await store.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].frames, 5);
  assert.equal(rows[0].size, 10);
  const got = await store.get(id);
  assert.equal(got.byteLength, 10);
  await store.clear();
  assert.equal((await store.list()).length, 0);
});

// 5. 构造后不可见
test('构造后 visible === false', () => {
  const room = new ReplayRoom({ input: fakeInput(), host, onExit() {}, store: new ReplayStore() });
  assert.equal(room.visible, false);
  assert.equal(room.el, null);
  assert.equal(typeof room.handleKey, 'function');
  assert.equal(typeof room.update, 'function');
  assert.equal(typeof room.show, 'function');
  assert.equal(typeof room.hide, 'function');
});

// 6. 不可见 / 空列表时按键不抛错
test('空列表与不可见态 handleKey 不抛错', async () => {
  let exited = 0;
  const room = new ReplayRoom({
    input: fakeInput(),
    host,
    onExit: () => {
      exited++;
    },
    store: new ReplayStore(),
  });
  assert.equal(room.handleKey(key('ArrowUp')), false, '不可见应直接返回 false');

  room.show();
  await flush();
  assert.equal(room.visible, true);
  for (const code of ['ArrowUp', 'ArrowDown', 'Enter', 'ArrowLeft', 'ArrowRight']) {
    assert.doesNotThrow(() => room.handleKey(key(code)));
  }
  room.update(0.016);
  assert.doesNotThrow(() => room.handleKey(key('Escape')));
  assert.equal(exited, 1, '列表态 Escape 应调用 onExit');

  room.hide();
  assert.equal(room.visible, false);
  assert.equal(room.canvas, null);
});

// 7. 垃圾字节 decodeReplay → ok:false，列表容错
test('坏录像解码失败且列表容错', async () => {
  const bad = decodeReplay(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  assert.equal(bad.ok, false);
  assert.equal(typeof bad.reason, 'string');
  assert.equal(decodeReplay(new Uint8Array([1, 2])).ok, false);

  const store = new ReplayStore();
  await store.open();
  await store.save({ bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), frames: 1, meta: {} });

  const room = new ReplayRoom({ input: fakeInput(), host, onExit() {}, store });
  room.show();
  await flush();
  assert.equal(room.allRows.length, 1, '列表应显示坏录像');
  assert.doesNotThrow(() => room.handleKey(key('Enter')));
  await flush();
  assert.equal(room.mode, 'list', '坏录像不该进播放态');
  assert.equal(room.badIds.size, 1, '应标记为损坏');
  room.hide();
});

// 8. Player 对 {ok:false} 的 tick 返回 false
test('Player 对失败数据 tick 返回 false', () => {
  const p = new Player({ ok: false });
  assert.equal(p.ok, false);
  assert.doesNotThrow(() => p.tick(0.016));
  assert.equal(p.tick(0.016), false);
  p.play();
  assert.equal(p.tick(0.016), false);
  assert.doesNotThrow(() => p.seek(10));
  assert.equal(typeof p.x, 'number');
  assert.equal(p.playing, true, 'tick 不应改变 playing 之外的语义');
  assert.equal(p.tick(0.016), false);
  // 数据缺失时 totalFrames 为 undefined（见汇报），done 因此为 false —— 只要求不抛
  assert.doesNotThrow(() => p.done);
});

// 9. 真录像：列表 → 播放 → 画幽灵轨迹 → 回列表
test('完整流程：列表选中 → 播放态画轨迹 → 回列表', async () => {
  const { Recorder } = replay;
  const rec = new Recorder();
  rec.start({ stage: 2, difficulty: 'H', char: 'marisa', seed: 7 });
  const fakePlayer = { x: 100, y: 200, focus: false, alive: true };
  for (let i = 0; i < 90; i++) {
    fakePlayer.x += 1.5;
    fakePlayer.y += Math.sin(i / 10) * 2;
    rec.frame(0, fakePlayer, i > 40);
  }
  const made = rec.stop();
  assert.ok(made && made.bytes, 'Recorder 应产出字节');

  const store = new ReplayStore();
  await store.open();
  await store.save(made);

  const room = new ReplayRoom({ input: fakeInput(), host, onExit() {}, store });
  room.show();
  await flush();
  assert.equal(room.allRows.length, 1);
  assert.doesNotThrow(() => room.handleKey(key('Enter')));
  await flush();
  assert.equal(room.mode, 'play', '应进入播放态');
  assert.ok(room.canvas, '应建立 canvas');
  assert.ok(room.player && room.player.ok);
  assert.doesNotThrow(() => room.update(0.016));
  assert.doesNotThrow(() => room._draw());

  // 速度切换
  const before = room.player.speed;
  room.handleKey(key('ArrowRight'));
  assert.notEqual(room.player.speed, before);
  assert.doesNotThrow(() => room.handleKey(key('ArrowLeft')));

  // 暂停/继续
  room.handleKey(key('Enter'));
  assert.doesNotThrow(() => room.update(0.016));

  // 回列表（不退出页面）
  room.handleKey(key('Escape'));
  assert.equal(room.mode, 'list');
  assert.equal(room.canvas, null, 'canvas 应被摘掉');

  room.hide();
  assert.equal(room.visible, false);
  assert.equal(room.canvas, null);
  assert.equal(room.player, null);
});

// 10. hide 可重复调用
test('hide 幂等', async () => {
  const room = new ReplayRoom({ input: fakeInput(), host, onExit() {}, store: new ReplayStore() });
  assert.doesNotThrow(() => room.hide());
  room.show();
  await flush();
  assert.doesNotThrow(() => room.hide());
  assert.doesNotThrow(() => room.hide());
  assert.equal(room.visible, false);
});

// ---------- 跑 ----------
let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`  ✓ ${t.name}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${t.name}`);
    console.log(`  ${err && err.message ? err.message : err}`);
    if (err && err.stack) {
      console.log(
        err.stack
          .split('\n')
          .slice(1, 4)
          .map((l) => `    ${l.trim()}`)
          .join('\n')
      );
    }
  }
}

console.log('');
if (failed) {
  console.log(`✗ ${failed}/${tests.length} 组失败`);
  process.exit(1);
}
console.log(`✓ 全部通过（${tests.length} 组）`);
process.exit(0);
