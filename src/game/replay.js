/**
 * 录像：录制 / 存储 / 回放。
 *
 * ── 为什么不是「真回放」 ────────────────────────────────────────────
 * 帧级复现需要确定性模拟，本作目前做不到，理由见 REPORT 三条：
 *   1) loop.js 逻辑步长是固定的 1/60（好），但 update() 拿到的 dt 会被
 *      main.js:3200 的时停 `_timeScale` 改写 → 同一个输入序列在不同时点，
 *      物理推进量不同。
 *   2) Math.random 遍布逻辑层（stage.js 16 处、enemies.js 7 处……），
 *      只有带 ?seed= 时才被 main.js:279 换成 mulberry32。不带 seed 的局
 *      录制后无从复现。
 *   3) camera.js:110 震屏用 performance.now() + Math.random()，属渲染层，
 *      不影响判定，但会让「同一录像同一帧」的画面不同。
 * 所以这里的回放走**退路 B：幽灵轨迹**——不重跑模拟，只按帧重画玩家当年的
 * 位置/低速/生死，并把当时有没有按射击标出来。这个一定对，
 * 而且对「我是在哪一帧、哪条缝里撞上的」复盘最有用（比录像更能看清轨迹形状）。
 *
 * 输入流仍然完整录下来（1 字节/帧 + RLE），所以将来若 Lead 愿意把
 * 「?seed= 锁定 + 步长固定 + 时停不写 dt」三件事接上，本模块的 Player.feed()
 * 可以直接当成「退路 A」的输入源，不用改格式。
 *
 * ── 体积 ───────────────────────────────────────────────────────────
 * 每帧 1 字节输入位掩码 + 1 字节状态位 + 幽灵轨迹 (dx,dy) 两个 zigzag varint。
 * 全部再过一遍 RLE（输入/状态几乎不变，压缩率极高）。5 分钟 = 18000 帧的
 * 实测字节数见 tools/_a11y_replay_selftest.mjs 输出（数量级 ~40 KB）。
 */

/** 格式版本。改字段就 +1；旧录像在 decode 时按版本拒绝，不会崩。 */
export const REPLAY_VERSION = 1;
const MAGIC = [0x48, 0x4b, 0x53, 0x52]; // 'HKSR'
const HEADER_MAX = 64 * 1024;

/** 输入位定义：顺序写死进格式里，别动（动就升版本） */
const BIT = {
  left: 1,
  right: 2,
  up: 4,
  down: 8,
  jump: 16,
  shoot: 32,
  slow: 64,
  dash: 128,
};
const BIT_NAMES = Object.keys(BIT);

/** 状态位（第二个 RLE 流） */
const SB = { focus: 1, alive: 2 };

/* ------------------------------------------------------------------ *
 * 基础编码件
 * ------------------------------------------------------------------ */

/** 无符号 LEB128。小整数 1 字节，体积几乎全压在这里。 */
function writeVarint(out, n) {
  n = n >>> 0;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
}

function readVarint(buf, p) {
  let n = 0;
  let shift = 0;
  for (;;) {
    if (p.i >= buf.length) throw new Error('varint 越界');
    const b = buf[p.i++];
    n |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return n >>> 0;
    shift += 7;
    if (shift > 35) throw new Error('varint 过长');
  }
}

/** 有符号 → 无符号（负数也变小数），delta 编码必须用 */
const zigzag = (n) => (n << 1) ^ (n >> 31);
const unzigzag = (n) => (n >>> 1) ^ -(n & 1);

/**
 * 字节流 RLE：写成 (值, 连续帧数) 对。
 * 输入位掩码一分钟才变十几次，这是体积能压到几十分之一的主因。
 */
function rleEncode(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; ) {
    const v = bytes[i];
    let n = 1;
    while (i + n < bytes.length && bytes[i + n] === v) n++;
    out.push(v);
    writeVarint(out, n);
    i += n;
  }
  return out;
}

function rleDecode(buf, p, frameCount) {
  const out = new Uint8Array(frameCount);
  let i = 0;
  while (i < frameCount) {
    if (p.i >= buf.length) throw new Error('RLE 越界');
    const v = buf[p.i++];
    const n = readVarint(buf, p);
    if (n === 0) throw new Error('RLE 零长');
    const end = Math.min(frameCount, i + n);
    out.fill(v, i, end);
    i = end;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Recorder：按逻辑帧喂一帧，内部攒成位流
 * ------------------------------------------------------------------ */

export class Recorder {
  constructor() {
    this.active = false;
    this.meta = null;
    this.inBytes = [];
    this.stBytes = [];
    this.casts = []; // 符卡按下帧（稀疏，走 header 里的稀疏表更省）
    this.gx = [];
    this.gy = [];
    this._px = 0;
    this._py = 0;
    this.frames = 0;
  }

  /**
   * 开始录制。meta 里放能重现「这是哪一局」的信息：
   * { seed, stage, difficulty, char, lives, engine? }
   * seed 是 `?seed=` 的值（没带就 0），有它才有将来做真回放的可能。
   */
  start(meta = {}) {
    if (this.active) this.stop();
    this.meta = {
      seed: Number(meta.seed) >>> 0,
      stage: meta.stage | 0,
      difficulty: String(meta.difficulty || ''),
      char: String(meta.char || ''),
      lives: meta.lives | 0,
      // 引擎版本：本仓库没有全局 VERSION，先用格式版本兜底；
      // Lead 若加了版本常量，在这里填真值即可让旧录像提示更准确。
      engine: String(meta.engine || `v${REPLAY_VERSION}`),
      castFrames: [],
    };
    this.active = true;
    this.inBytes.length = 0;
    this.stBytes.length = 0;
    this.casts.length = 0;
    this.gx.length = 0;
    this.gy.length = 0;
    this._px = 0;
    this._py = 0;
    this.frames = 0;
    return this;
  }

  /**
   * 记录一个逻辑帧。必须在 `input.endFrame()` **之前**调用
   * （main.js:3276 之后、3278 之前），否则边沿已被清掉。
   *
   * @param {object} input  Input 实例（只读 down()）
   * @param {object} player 玩家（读 hitPoint / focus / alive）
   * @param {boolean} [cast] 本帧是否按了符卡（稀疏事件，单独存）
   */
  frame(input, player, cast = false) {
    if (!this.active) return;
    let bits = 0;
    for (const k of BIT_NAMES) if (input && input.down(k)) bits |= BIT[k];

    let st = 0;
    if (player && player.focus) st |= SB.focus;
    if (!player || player.alive !== false) st |= SB.alive;

    this.inBytes.push(bits);
    this.stBytes.push(st);

    // 幽灵轨迹：量化到 0.5px 再做差分。0.5px 在 1280×720 上肉眼看不出，
    // 但能把 dx 稳定压在 1 字节 varint 里。
    const hp = player && typeof player.hitPoint === 'object' ? player.hitPoint : null;
    const x = Math.round((hp ? hp.x : (player?.x || 0)) * 2);
    const y = Math.round((hp ? hp.y : (player?.y || 0)) * 2);
    this.gx.push(x - this._px);
    this.gy.push(y - this._py);
    this._px = x;
    this._py = y;

    if (cast) this.meta.castFrames.push(this.frames);
    this.frames++;
  }

  /** 收尾：编码成可存的记录对象。返回 null 表示没录到东西。 */
  stop() {
    this.active = false;
    if (!this.frames) return null;
    const meta = { ...this.meta, castFrames: this.meta.castFrames.slice() };
    const record = {
      v: REPLAY_VERSION,
      createdAt: Date.now(),
      frames: this.frames,
      meta,
      bytes: encodePayload(meta, this.frames, this.inBytes, this.stBytes, this.gx, this.gy),
      duration: this.frames / 60,
    };
    return record;
  }

  /** 立刻拿到当前已录内容（不中断录制），用于「存到一半崩了」的兜底。 */
  snapshot() {
    const wasActive = this.active;
    this.active = true;
    const meta = { ...this.meta, castFrames: this.meta.castFrames.slice() };
    const rec = {
      v: REPLAY_VERSION,
      createdAt: Date.now(),
      frames: this.frames,
      meta,
      bytes: encodePayload(meta, this.frames, this.inBytes, this.stBytes, this.gx, this.gy),
      duration: this.frames / 60,
    };
    this.active = wasActive;
    return rec;
  }
}

/* ------------------------------------------------------------------ *
 * 编码 / 解码
 * ------------------------------------------------------------------ */

/**
 * 布局：[magic 4][ver 1][hdrLen u32][header JSON utf8][input RLE][state RLE][ghost varints]
 * header 用 JSON 而不是二进制：它只有百来字节，换来的是「加字段不会破坏旧录像」。
 */
function encodePayload(meta, frames, inBytes, stBytes, gx, gy) {
  const header = { ...meta, v: REPLAY_VERSION, frames };
  const hdr = new TextEncoder().encode(JSON.stringify(header));
  if (hdr.length > HEADER_MAX) throw new Error('replay header 过大');

  const inRle = rleEncode(inBytes);
  const stRle = rleEncode(stBytes);
  const ghost = [];
  for (let i = 0; i < frames; i++) {
    writeVarint(ghost, zigzag(gx[i] | 0));
    writeVarint(ghost, zigzag(gy[i] | 0));
  }

  const out = new Uint8Array(4 + 1 + 4 + hdr.length + 4 + inRle.length + stRle.length + ghost.length);
  let p = 0;
  out.set(MAGIC, p); p += 4;
  out[p++] = REPLAY_VERSION;
  // header 长度写 4 字节小端（手写，避免 DataView 依赖大端小端翻车）
  out[p++] = hdr.length & 0xff;
  out[p++] = (hdr.length >> 8) & 0xff;
  out[p++] = (hdr.length >> 16) & 0xff;
  out[p++] = (hdr.length >> 24) & 0xff;
  out.set(hdr, p); p += hdr.length;
  // input 流长度也要记，否则解码时要靠试探
  const inLen = inRle.length;
  out[p++] = inLen & 0xff;
  out[p++] = (inLen >> 8) & 0xff;
  out[p++] = (inLen >> 16) & 0xff;
  out[p++] = (inLen >> 24) & 0xff;
  out.set(inRle, p); p += inLen;
  out.set(stRle, p); p += stRle.length;
  out.set(ghost, p);
  return out;
}

/**
 * 解码。任何不认识的东西都返回 `{ ok:false, reason }` 而不是抛异常——
 * 旧录像、被别人改过的文件、截断的文件，都不能让游戏崩。
 */
export function decodeReplay(bytes) {
  try {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (buf.length < 9) return { ok: false, reason: 'too-short' };
    for (let i = 0; i < 4; i++) if (buf[i] !== MAGIC[i]) return { ok: false, reason: 'not-replay' };
    const ver = buf[4];
    if (ver !== REPLAY_VERSION) return { ok: false, reason: 'version', version: ver };

    const hdrLen = buf[5] | (buf[6] << 8) | (buf[7] << 16) | (buf[8] << 24);
    if (!hdrLen || hdrLen > HEADER_MAX || 9 + hdrLen > buf.length) {
      return { ok: false, reason: 'bad-header' };
    }
    const meta = JSON.parse(new TextDecoder().decode(buf.subarray(9, 9 + hdrLen)));
    const frames = meta.frames | 0;
    if (!(frames > 0)) return { ok: false, reason: 'empty' };

    let p = 9 + hdrLen;
    if (p + 4 > buf.length) return { ok: false, reason: 'truncated' };
    const inLen = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24);
    p += 4;
    if (inLen < 0 || p + inLen > buf.length) return { ok: false, reason: 'truncated' };

    const inRle = buf.subarray(p, p + inLen);
    const rest = buf.subarray(p + inLen);
    const ip = { i: 0 };
    const sp = { i: 0 };
    const inputs = rleDecode(inRle, ip, frames);
    const states = rleDecode(rest, sp, frames);

    const gp = { i: sp.i };
    const xs = new Float32Array(frames);
    const ys = new Float32Array(frames);
    let x = 0;
    let y = 0;
    for (let i = 0; i < frames; i++) {
      x += unzigzag(readVarint(rest, gp));
      y += unzigzag(readVarint(rest, gp));
      xs[i] = x / 2;
      ys[i] = y / 2;
    }

    return {
      ok: true,
      v: ver,
      meta,
      frames,
      duration: frames / 60,
      inputs,
      states,
      xs,
      ys,
    };
  } catch (e) {
    return { ok: false, reason: 'corrupt', error: String(e && e.message || e) };
  }
}

/** 位掩码 → 动作名数组（调试/UI 用） */
export function bitsToActions(bits) {
  const out = [];
  for (const k of BIT_NAMES) if (bits & BIT[k]) out.push(k);
  return out;
}

/* ------------------------------------------------------------------ *
 * ReplayStore：IndexedDB 主存，无 IDB 时退化为内存
 * ------------------------------------------------------------------ */

/**
 * 为什么用 IndexedDB 而不是 localStorage：
 *  5 分钟录像实测 ~40 KB（见自测），localStorage 5 MB 其实塞得下一百多个，
 *  但 localStorage 是**同步**的：每次 `getItem` 都会序列化整块数据、卡主线程，
 *  在弹幕游戏里等于随机掉帧；而且它按字符串存，二进制得再 base64 膨胀 33%。
 *  IndexedDB 存 ArrayBuffer 原生、异步、配额按磁盘（通常数百 MB）。
 *  ponytail: 没做索引和分页上限，够用到「塞几百个录像」；真要列几百个再上 cursor 分页。
 */
const DB_NAME = 'hks.replay';
const DB_STORE = 'records';
const DB_VER = 1;

export class ReplayStore {
  constructor() {
    this.db = null;
    this._mem = new Map(); // 无 IndexedDB 时的退化存储（Node 自测、隐私模式）
    this.ready = null;
  }

  open() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(false);
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            db.createObjectStore(DB_STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => {
          this.db = req.result;
          resolve(true);
        };
        // 打不开（隐私模式 / 配额满 / 被禁）就退化，不能让存档链把游戏拖死
        req.onerror = () => resolve(false);
        req.onblocked = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
    return this.ready;
  }

  _tx(mode = 'readonly') {
    return this.db.transaction(DB_STORE, mode).objectStore(DB_STORE);
  }

  static makeId(rec) {
    const stamp = new Date(rec.createdAt || Date.now()).toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const tag = (rec.meta && (rec.meta.seed ? `s${rec.meta.seed}` : 's0')) || 's0';
    return `${stamp}-${tag}-${Math.random().toString(36).slice(2, 6)}`;
  }

  /** 存一条。rec 是 Recorder.stop() 的产物。返回 id。 */
  async save(rec) {
    if (!rec || !rec.bytes) return null;
    await this.open();
    const id = rec.id || ReplayStore.makeId(rec);
    const row = {
      id,
      v: rec.v || REPLAY_VERSION,
      createdAt: rec.createdAt || Date.now(),
      frames: rec.frames | 0,
      duration: rec.duration || (rec.frames | 0) / 60,
      meta: rec.meta || {},
      size: rec.bytes.byteLength,
      bytes: rec.bytes,
    };
    if (!this.db) {
      this._mem.set(id, row);
      return id;
    }
    await new Promise((resolve, reject) => {
      const req = this._tx('readwrite').put(row);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }).catch(() => {
      // 写失败（配额满）也别抛给调用方，改存内存，本次会话内还能看
      this._mem.set(id, row);
    });
    return id;
  }

  /** 列表：只返回元信息（不含 bytes），按时间倒序。 */
  async list() {
    await this.open();
    const rows = [];
    if (this.db) {
      await new Promise((resolve) => {
        const req = this._tx().getAll();
        req.onsuccess = () => {
          for (const r of req.result || []) {
            rows.push({ id: r.id, v: r.v, createdAt: r.createdAt, frames: r.frames, duration: r.duration, meta: r.meta, size: r.size });
          }
          resolve();
        };
        req.onerror = () => resolve();
      });
    }
    for (const r of this._mem.values()) {
      if (!rows.some((x) => x.id === r.id)) {
        rows.push({ id: r.id, v: r.v, createdAt: r.createdAt, frames: r.frames, duration: r.duration, meta: r.meta, size: r.size });
      }
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  }

  /** 读原始字节（交给 decodeReplay）。找不到返回 null。 */
  async get(id) {
    await this.open();
    if (this.db) {
      const row = await new Promise((resolve) => {
        const req = this._tx().get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (row) return row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
    }
    const mem = this._mem.get(id);
    return mem ? mem.bytes : null;
  }

  /** 读并解码，一步到位。旧版本录像返回 { ok:false, reason:'version' }。 */
  async load(id) {
    const bytes = await this.get(id);
    if (!bytes) return { ok: false, reason: 'not-found' };
    return decodeReplay(bytes);
  }

  async remove(id) {
    await this.open();
    this._mem.delete(id);
    if (!this.db) return true;
    return new Promise((resolve) => {
      const req = this._tx('readwrite').delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }

  async clear() {
    await this.open();
    this._mem.clear();
    if (!this.db) return true;
    return new Promise((resolve) => {
      const req = this._tx('readwrite').clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }

  /** 总占用（字节）。设置页显示「录像占用 1.2 MB」用。 */
  async usage() {
    const rows = await this.list();
    return rows.reduce((s, r) => s + (r.size || 0), 0);
  }
}

/* ------------------------------------------------------------------ *
 * Player：按帧喂回
 * ------------------------------------------------------------------ */

/**
 * 幽灵轨迹回放器。用法：
 *   const p = new Player(decoded);
 *   while (p.step()) { draw(p.x, p.y, p.isFocus, p.isAlive); }
 * 也可以 seek() 到任意帧做「跳到死亡前 2 秒」这类复盘。
 */
export class Player {
  constructor(decoded) {
    this.data = decoded || null;
    this.frame = 0;
    this.playing = false;
    this.speed = 1;      // 1 = 原速，0.5 = 慢放
    this._acc = 0;       // 秒累加器，尊重 speed 而不是数帧
    this.loop = false;
  }

  get ok() {
    return !!(this.data && this.data.ok);
  }

  get totalFrames() {
    return this.data ? this.data.frames : 0;
  }

  get duration() {
    return this.totalFrames / 60;
  }

  get done() {
    return this.frame >= this.totalFrames;
  }

  get x() {
    return this.data && this.data.xs ? this.data.xs[Math.min(this.frame, this.totalFrames - 1)] : 0;
  }

  get y() {
    return this.data && this.data.ys ? this.data.ys[Math.min(this.frame, this.totalFrames - 1)] : 0;
  }

  get isFocus() {
    const s = this.data?.states?.[Math.min(this.frame, this.totalFrames - 1)] || 0;
    return !!(s & SB.focus);
  }

  get isAlive() {
    const s = this.data?.states?.[Math.min(this.frame, this.totalFrames - 1)] || 0;
    return !!(s & SB.alive);
  }

  /** 当前位置输入位（退路 A 的输入源；退路 B 里只用来画「当时按了什么」） */
  get inputBits() {
    return this.data?.inputs?.[Math.min(this.frame, this.totalFrames - 1)] || 0;
  }

  get actions() {
    return bitsToActions(this.inputBits);
  }

  seek(frame) {
    this.frame = Math.max(0, Math.min(this.totalFrames, frame | 0));
    return this.frame;
  }

  play() { this.playing = true; this._acc = 0; return this; }
  pause() { this.playing = false; return this; }

  /** 按真实时间推进（秒）。返回是否还在播。 */
  tick(dt) {
    if (!this.playing || !this.ok) return false;
    this._acc += dt * this.speed;
    const step = 1 / 60;
    while (this._acc >= step && !this.done) {
      this._acc -= step;
      this.frame++;
    }
    if (this.done) {
      this.playing = false;
      if (this.loop) this.frame = 0;
    }
    return this.playing;
  }

  /** 手动推进一帧（逐帧调试）。返回帧号。 */
  step() {
    if (this.done) return this.frame;
    this.frame++;
    return this.frame;
  }
}

/**
 * 一致性自检：录制的帧数与各流长度是否自洽。
 * 自测脚本和「导入别人的录像」都用它兜底。
 */
export function verifyReplay(decoded) {
  if (!decoded || !decoded.ok) return { ok: false, reason: decoded?.reason || 'invalid' };
  const n = decoded.frames;
  if (decoded.inputs.length !== n) return { ok: false, reason: 'input-length' };
  if (decoded.states.length !== n) return { ok: false, reason: 'state-length' };
  if (decoded.xs.length !== n || decoded.ys.length !== n) return { ok: false, reason: 'ghost-length' };
  for (let i = 0; i < n; i++) if (!Number.isFinite(decoded.xs[i]) || !Number.isFinite(decoded.ys[i])) {
    return { ok: false, reason: 'ghost-nan' };
  }
  return { ok: true };
}
