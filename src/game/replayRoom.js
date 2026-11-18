// 录像室：列表 + 幽灵轨迹回放
// 不重放游戏逻辑（dt 被符卡减速改写、逻辑层遍布 Math.random），只把记录的 x/y 轨迹画出来。
import { tr, localizeDom } from '../i18n/index.js';
import { ReplayStore, Player, decodeReplay } from './replay.js';

export const REPLAYROOM_KEY = 'hks.replayroom.v1';

/** 速度档位（左/右键切换，直接写 player.speed） */
const SPEEDS = [0.5, 1, 2];
const MAX_ROWS = 12;

const DIFF_LABEL = { E: 'EASY', N: 'NORMAL', H: 'HARD', L: 'LUNATIC', EX: 'EXTRA' };
const CHAR_LABEL = { reimu: '灵梦', marisa: '魔理沙' };

/** 秒 → "1:23.4"；负数/非数字一律按 0 处理 */
export function formatDuration(sec) {
  let s = Number(sec);
  if (!Number.isFinite(s) || s < 0) s = 0;
  const tenths = Math.round(s * 10);
  const m = Math.floor(tenths / 600);
  const r = tenths % 600;
  const ss = Math.floor(r / 10);
  const t = r % 10;
  return `${m}:${ss < 10 ? '0' : ''}${ss}.${t}`;
}

/** 列表用的紧凑时长：m:ss */
function compactDuration(sec) {
  let s = Number(sec);
  if (!Number.isFinite(s) || s < 0) s = 0;
  const total = Math.floor(s);
  const m = Math.floor(total / 60);
  const ss = total % 60;
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
}

function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function createdLabel(ts) {
  const d = new Date(Number(ts) || 0);
  if (!Number.isFinite(d.getTime())) return '';
  const p = (v) => (v < 10 ? '0' + v : String(v));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 一行中文摘要，如 "第 3 面 · NORMAL · 灵梦 · 2:14 · 3.1MB"
 * 字段缺失时逐段省略，绝不抛错。
 */
export function describeReplay(row) {
  if (!row || typeof row !== 'object') return tr('未知录像');
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const parts = [];
  const stage = Number(meta.stage);
  if (Number.isFinite(stage) && stage > 0) parts.push(`第 ${stage} 面`);
  const diff = DIFF_LABEL[meta.difficulty] || (typeof meta.difficulty === 'string' ? meta.difficulty : '');
  if (diff) parts.push(diff);
  const who = CHAR_LABEL[meta.char] || (typeof meta.char === 'string' ? meta.char : '');
  if (who) parts.push(who);
  if (row.duration != null) parts.push(compactDuration(row.duration));
  else if (row.frames != null) parts.push(compactDuration(Number(row.frames) / 60));
  if (row.size != null) parts.push(formatSize(row.size));
  return parts.length ? parts.join(' · ') : tr('录像');
}

const CSS = `
.rr{position:absolute;inset:0;z-index:30;pointer-events:auto;display:flex;align-items:center;justify-content:center;
  font-family:var(--font-ui,system-ui,sans-serif);color:#e7e3d8;opacity:0;transition:opacity .22s ease;
  background:radial-gradient(circle at 50% 40%, rgba(30,26,44,.72), rgba(4,5,9,.92))}
.rr.is-in{opacity:1}
.rr.hidden{display:none}
.rr-frame{display:flex;flex-direction:column;gap:calc(12px * var(--s,1));
  width:min(1120px,94vw);height:min(660px,90vh);padding:calc(20px * var(--s,1));
  background:rgba(10,11,18,.92);border:1px solid rgba(200,190,170,.16);border-radius:calc(10px * var(--s,1));
  box-shadow:0 24px 60px rgba(0,0,0,.55)}
.rr-head{display:flex;align-items:baseline;justify-content:space-between;gap:calc(12px * var(--s,1))}
.rr-title{font-size:calc(20px * var(--s,1));letter-spacing:.12em;color:#f1ece0}
.rr-hint{font-size:calc(12px * var(--s,1));color:rgba(200,190,170,.55)}
.rr-body{flex:1;display:flex;gap:calc(14px * var(--s,1));min-height:0}
.rr-list{width:calc(360px * var(--s,1));display:flex;flex-direction:column;gap:calc(6px * var(--s,1));overflow:hidden}
.rr-row{padding:calc(8px * var(--s,1)) calc(10px * var(--s,1));border-radius:calc(6px * var(--s,1));
  font-size:calc(13px * var(--s,1));line-height:1.45;color:rgba(226,220,206,.78);
  background:rgba(255,255,255,.03);border:1px solid transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rr-row.on{background:rgba(140,170,230,.14);border-color:rgba(160,190,240,.5);color:#f4efe4}
.rr-row.bad{color:rgba(240,150,150,.8)}
.rr-row.hidden{display:none}
.rr-sub{display:block;font-size:calc(11px * var(--s,1));color:rgba(190,182,168,.5);margin-top:calc(2px * var(--s,1))}
.rr-empty.hidden{display:none}
.rr-empty{font-size:calc(13px * var(--s,1));color:rgba(200,190,170,.6);padding:calc(18px * var(--s,1)) 0}
.rr-stage{flex:1;min-width:0;display:none;flex-direction:column;gap:calc(8px * var(--s,1));min-height:0}
.rr.is-play .rr-stage{display:flex}
.rr.is-play .rr-list{width:calc(300px * var(--s,1));opacity:.55}
.rr-canvas{flex:1;min-height:0;width:100%;border-radius:calc(6px * var(--s,1));
  background:#06070c;border:1px solid rgba(200,190,170,.12);display:block}
.rr-info{font-size:calc(12px * var(--s,1));color:rgba(210,202,188,.72);letter-spacing:.04em}
`;

function injectCss() {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById('hks-replayroom-css')) return;
  const st = document.createElement('style');
  st.id = 'hks-replayroom-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

function ce(tag) {
  return document.createElement(tag);
}

export class ReplayRoom {
  constructor({ input, host, onExit, store } = {}) {
    this.input = input || null;
    this.host = host || null;
    this.onExit = typeof onExit === 'function' ? onExit : () => {};
    this.store = store || new ReplayStore();

    this.visible = false;
    this.el = null;
    this.mode = 'list'; // 'list' | 'play'
    this.rows = [];
    this.sel = 0;
    this.text = ''; // 原样文本存一份，供本地化后重填
    this.player = null;
    this.canvas = null;
    this.ctx = null;
    this.curId = '';
    this.speedIdx = 1;
    this.badIds = new Set();
    this._hideTimer = 0;
    this._loadToken = 0;
  }

  get visibleNow() {
    return this.visible;
  }

  show() {
    injectCss();
    this._build();
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = 0;
    }
    this.visible = true;
    this.mode = 'list';
    if (this.el) {
      this.el.classList.remove('hidden');
      this.el.classList.remove('is-play');
    }
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') raf(() => this.el && this.el.classList.add('is-in'));
    else if (this.el) this.el.classList.add('is-in');
    this._loadList();
  }

  hide() {
    this.visible = false;
    this._closePlayer();
    if (this.el) {
      this.el.classList.remove('is-in');
      const el = this.el;
      this._hideTimer = setTimeout(() => el.classList.add('hidden'), 220);
      if (this._hideTimer && typeof this._hideTimer.unref === 'function') this._hideTimer.unref();
    }
  }

  handleKey(e) {
    if (!this.visible) return false;
    const code = e && e.code;
    const a = this.input?.actionOf?.(code) || '';
    const esc = code === 'Escape';
    const stop = () => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
    };

    if (this.mode === 'play') {
      if (a === 'pause' || a === 'cancel' || esc) {
        stop();
        this._toList();
        return true;
      }
      if (a === 'confirm') {
        stop();
        if (this.player) {
          if (this.player.playing) this.player.pause();
          else {
            if (this.player.done) this.player.seek(0);
            this.player.play();
          }
          this._syncInfo();
        }
        return true;
      }
      if (a === 'left' || a === 'right') {
        stop();
        this._cycleSpeed(a === 'left' ? -1 : 1);
        return true;
      }
      return true;
    }

    // 列表态
    if (a === 'pause' || a === 'cancel' || esc) {
      stop();
      this.onExit();
      return true;
    }
    if (a === 'up') {
      stop();
      this._move(-1);
      return true;
    }
    if (a === 'down') {
      stop();
      this._move(1);
      return true;
    }
    if (a === 'confirm') {
      stop();
      this._openAt(this.sel);
      return true;
    }
    return true;
  }

  update(dt) {
    if (!this.visible || this.mode !== 'play' || !this.player) return;
    this.player.tick(dt);
    this._draw();
    this._syncInfo();
  }

  // ---- 列表 ----

  _build() {
    if (this.el) return;
    const el = ce('div');
    el.className = 'rr hidden';

    const frame = ce('div');
    frame.className = 'rr-frame';

    const head = ce('div');
    head.className = 'rr-head';
    const title = ce('div');
    title.className = 'rr-title';
    title.textContent = tr('录像室');
    const hint = ce('div');
    hint.className = 'rr-hint';
    hint.textContent = tr('↑↓ 选择 · 回车播放 · Esc 返回');
    head.appendChild(title);
    head.appendChild(hint);

    const body = ce('div');
    body.className = 'rr-body';

    const list = ce('div');
    list.className = 'rr-list';
    this.listEl = list;

    this.emptyEl = ce('div');
    this.emptyEl.className = 'rr-empty';
    this.emptyEl.textContent = tr('还没有录像。打完一局就会记下来。');

    const stage = ce('div');
    stage.className = 'rr-stage';
    this.stageEl = stage;

    this.infoEl = ce('div');
    this.infoEl.className = 'rr-info';

    for (let i = 0; i < MAX_ROWS; i++) {
      const row = ce('div');
      row.className = 'rr-row hidden';
      const main = ce('span');
      const sub = ce('span');
      sub.className = 'rr-sub';
      row.appendChild(main);
      row.appendChild(sub);
      row.__main = main;
      row.__sub = sub;
      list.appendChild(row);
      this.rows.push(row);
    }
    list.appendChild(this.emptyEl);

    body.appendChild(list);
    body.appendChild(stage);
    frame.appendChild(head);
    frame.appendChild(body);
    el.appendChild(frame);

    if (this.host && typeof this.host.appendChild === 'function') this.host.appendChild(el);
    this.el = el;
    this._applyLang();
  }

  _applyLang() {
    if (this.el && typeof localizeDom === 'function') {
      try {
        localizeDom(this.el);
      } catch {
        /* 本地化失败不影响页面 */
      }
    }
  }

  async _loadList() {
    const token = ++this._loadToken;
    let rows = [];
    try {
      await this.store.open?.();
      rows = (await this.store.list()) || [];
    } catch {
      rows = [];
    }
    if (token !== this._loadToken) return;
    this.allRows = rows.slice(0, MAX_ROWS);
    this.sel = this.allRows.length ? Math.min(this.sel, this.allRows.length - 1) : 0;
    this._renderList();
  }

  _renderList() {
    const rows = this.allRows || [];
    const showEmpty = rows.length === 0;
    if (this.emptyEl) this.emptyEl.classList.toggle('hidden', !showEmpty);
    this.rows.forEach((row, i) => {
      const data = rows[i];
      if (!data) {
        row.classList.add('hidden');
        return;
      }
      row.classList.remove('hidden');
      row.classList.toggle('on', i === this.sel);
      row.classList.toggle('bad', this.badIds.has(data.id));
      const bad = this.badIds.has(data.id);
      row.__main.textContent = bad ? tr('录像已损坏') : describeReplay(data);
      row.__sub.textContent = createdLabel(data.createdAt);
    });
  }

  _move(delta) {
    const n = (this.allRows || []).length;
    if (!n) return;
    this.sel = (this.sel + delta + n) % n;
    this._renderList();
  }

  _openAt(index) {
    const row = (this.allRows || [])[index];
    if (row) this._open(row);
  }

  async _open(row) {
    this._closePlayer();
    let decoded;
    try {
      decoded = await this.store.load(row.id);
    } catch {
      decoded = { ok: false, reason: 'error' };
    }
    if (!this.visible) return;
    if (!decoded || !decoded.ok) {
      this.badIds.add(row.id);
      this._renderList();
      return;
    }
    const player = new Player(decoded);
    if (!player.ok) {
      this.badIds.add(row.id);
      this._renderList();
      return;
    }
    this.player = player;
    this.curId = row.id;
    this.speedIdx = 1;
    player.speed = SPEEDS[this.speedIdx];
    this.mode = 'play';
    if (this.el) this.el.classList.add('is-play');
    this._mountCanvas();
    player.play();
    this._draw();
    this._syncInfo();
  }

  _mountCanvas() {
    const stage = this.stageEl;
    if (!stage) return;
    if (this.canvas) return;
    const cv = ce('canvas');
    cv.className = 'rr-canvas';
    const w = 900;
    const h = 560;
    this._w = w;
    this._h = h;
    cv.width = w;
    cv.height = h;
    let ctx = null;
    try {
      ctx = cv.getContext && cv.getContext('2d');
    } catch {
      ctx = null;
    }
    this.canvas = cv;
    this.ctx = ctx;
    stage.appendChild(cv);
    if (this.infoEl && typeof stage.appendChild === 'function') stage.appendChild(this.infoEl);
  }

  _closePlayer() {
    if (this.player) {
      this.player.pause();
      this.player = null;
    }
    if (this.canvas) {
      if (this.canvas.parentNode && typeof this.canvas.parentNode.removeChild === 'function') {
        this.canvas.parentNode.removeChild(this.canvas);
      }
      this.canvas = null;
      this.ctx = null;
    }
    if (this.infoEl && this.infoEl.parentNode && typeof this.infoEl.parentNode.removeChild === 'function') {
      this.infoEl.parentNode.removeChild(this.infoEl);
    }
  }

  _toList() {
    this._closePlayer();
    this.mode = 'list';
    this.curId = '';
    if (this.el) this.el.classList.remove('is-play');
    this._renderList();
  }

  _cycleSpeed(dir) {
    if (!this.player) return;
    this.speedIdx = (this.speedIdx + (dir < 0 ? -1 : 1) + SPEEDS.length) % SPEEDS.length;
    this.player.speed = SPEEDS[this.speedIdx];
    this._syncInfo();
  }

  _syncInfo() {
    if (!this.infoEl) return;
    const p = this.player;
    if (!p) {
      this.infoEl.textContent = '';
      return;
    }
    const total = p.totalFrames || 0;
    const cur = Math.min((p.frame | 0) + 1, total);
    const bits = [
      tr('第 {n} / {t} 帧', { n: cur, t: total }),
      formatDuration(p.frame / 60),
      `${p.speed}x`,
      p.playing ? tr('播放中') : tr('已暂停'),
    ];
    if (p.isFocus) bits.push(tr('符卡中'));
    this.infoEl.textContent = bits.join('  ·  ');
  }

  // ---- 画幽灵轨迹 ----

  _draw() {
    const ctx = this.ctx;
    const p = this.player;
    const W = this._w || 900;
    const H = this._h || 560;
    if (!ctx) return;
    ctx.fillStyle = '#06070c';
    ctx.fillRect(0, 0, W, H);
    const d = p && p.data;
    if (!d || !d.xs || !d.ys) return;
    const n = Math.min(d.frames | 0, d.xs.length, d.ys.length);
    if (!n) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = d.xs[i];
      const y = d.ys[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
    if (maxX - minX < 1) maxX = minX + 1;
    if (maxY - minY < 1) maxY = minY + 1;

    const pad = 24;
    const sx = (W - pad * 2) / (maxX - minX);
    const sy = (H - pad * 2) / (maxY - minY);
    const s = Math.min(sx, sy);
    const ox = pad + ((W - pad * 2) - (maxX - minX) * s) / 2;
    const oy = pad + ((H - pad * 2) - (maxY - minY) * s) / 2;
    const px = (x) => ox + (x - minX) * s;
    const py = (y) => oy + (y - minY) * s;

    const cur = Math.max(0, Math.min(p.frame | 0, n - 1));
    ctx.beginPath();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(200,190,170,.5)';
    ctx.lineJoin = 'round';
    for (let i = 0; i <= cur; i++) {
      const x = d.xs[i];
      const y = d.ys[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (i === 0) ctx.moveTo(px(x), py(y));
      else ctx.lineTo(px(x), py(y));
    }
    ctx.stroke();

    const hx = px(d.xs[cur]);
    const hy = py(d.ys[cur]);
    ctx.beginPath();
    ctx.arc(hx, hy, p.isFocus ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = p.isFocus ? '#ffd66e' : '#eaf0ff';
    ctx.fill();
  }
}
