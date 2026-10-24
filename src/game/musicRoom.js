/**
 * 音乐回忆室（Music Room）
 *
 * 东方风格的试听室：左边是唱片目录（未在旅途中遭遇的曲子显示成「？？？」），
 * 右边是唱片与解说，底下是播放进度。整屏 DOM 叠在 canvas 之上，
 * 背景（拱窗 / 月光 / 唱片架 / 留声机 / 落樱）由 2D canvas 一次性画好。
 *
 * 与游戏的约定：
 *  - 曲目数据只来自 musicTracks.js（key 必须能在 SONGS 里找到）；
 *  - 播放全部交给 AudioEngine.playMusic / setMusic，不自己造音频；
 *  - 是否「听过」由宿主（main.js）通过 isHeard / markHeard 提供，
 *    未知曲目在播放前会弹一次确认框，确认后才揭晓曲名并记入回忆；
 *  - 键盘事件由宿主的 window keydown 转发给 handleKey()，返回 true 表示已消费。
 */

import { MUSIC_TRACKS } from './musicTracks.js';
import { SONGS } from '../engine/songs/index.js';

const EQ_BARS = 18;
const PREVIEW_SEC = 30;   // 试听模式：到点自动抬针

/** 秒 → m:ss（负数 / 非数字一律按 0 处理） */
function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class MusicRoom {
  /**
   * @param {object} opt
   * @param {import('../engine/audio.js').AudioEngine} opt.audio
   * @param {import('../engine/input.js').Input} opt.input
   * @param {HTMLElement} opt.host            DOM 宿主（#ui）
   * @param {(key: string) => boolean} opt.isHeard
   * @param {(key: string) => void} opt.markHeard
   * @param {() => void} opt.onExit           返回标题
   * @param {() => void} opt.onMute           切换全局静音
   */
  constructor({ audio, input, host, isHeard, markHeard, onExit, onMute }) {
    this.audio = audio;
    this.input = input;
    this.host = host;
    this.isHeard = isHeard || (() => true);
    this.markHeard = markHeard || (() => {});
    this.onExit = onExit || (() => {});
    this.onMute = onMute || (() => {});

    // 曲长 / BPM 以曲库里真实的数据为准，避免两处手写数值漂移
    this.tracks = MUSIC_TRACKS.map((tr) => ({
      ...tr,
      bpm: SONGS[tr.key]?.bpm || null,
    }));
    this.index = 0;
    this.visible = false;

    this.el = null;
    this.d = null;
    this.rows = [];
    this._warn = null;     // { index, sel, preview }：未知曲目的播放确认
    this._preview = null;  // { key, left }：30 秒试听倒计时
    this._previewDone = false;
    this._acc = 0;
    this._hideTimer = 0;
  }

  /* ============================================================
     显隐
     ============================================================ */

  show() {
    this._build();
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = 0;
    }
    this.visible = true;
    this._warn = null;
    this._hideWarn();
    // 如果有曲子正在播，光标停在它上面；否则保留上次的选择
    const cur = this.audio.currentSong;
    const hit = this.tracks.findIndex((t) => t.key === cur);
    if (hit >= 0) this.index = hit;

    this.el.classList.remove('hidden');
    this._paint();
    this._paintList();
    this._reveal();
    // 下一帧再加 is-in，让 CSS 的淡入真的发生
    requestAnimationFrame(() => {
      if (this.visible) this.el.classList.add('is-in');
    });
  }

  hide() {
    if (!this.el || !this.visible) return;
    this.visible = false;
    this._preview = null;
    this._previewDone = false;
    if (this.d?.cut) this.d.cut.classList.add('hidden');
    this.el.classList.remove('is-in');
    this._hideWarn();
    this._hideTimer = window.setTimeout(() => {
      this._hideTimer = 0;
      if (!this.visible) this.el.classList.add('hidden');
    }, 220);
  }

  /* ============================================================
     键盘
     ============================================================ */

  /** @returns {boolean} true = 这个按键已经被音乐室消费 */
  handleKey(e) {
    if (!this.visible || !this.el) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    // 未知曲目确认框优先吃掉所有按键
    if (this._warn) {
      if (e.repeat) return true;
      const a = this.input.actionOf(e.code);
      if (a === 'left' || a === 'right') {
        e.preventDefault();
        this._warn.sel = this._warn.sel ? 0 : 1;
        this._paintWarn();
        return true;
      }
      if (a === 'confirm' || a === 'jump') {
        e.preventDefault();
        const idx = this._warn.index;
        const play = this._warn.sel === 0;
        const preview = !!this._warn.preview;
        this._closeWarn();
        if (play) {
          if (preview) this._startPreview(this.tracks[idx]);
          else this._play(this.tracks[idx]);
        }
        return true;
      }
      if (a === 'pause') {
        e.preventDefault();
        this._closeWarn();
        return true;
      }
      // 弹窗期间吞掉其它键，避免动作漏到标题菜单
      return true;
    }

    const action = this.input.actionOf(e.code);

    if (action === 'up' || action === 'down') {
      e.preventDefault();
      this._move(action === 'up' ? -1 : 1);
      return true;
    }
    if (action === 'left' || action === 'right') {
      e.preventDefault();
      this._move(action === 'left' ? -1 : 1);
      return true;
    }
    if (action === 'confirm' || action === 'jump') {
      e.preventDefault();
      this._requestPlay(this.index);
      return true;
    }
    if (action === 'pause') {
      e.preventDefault();
      this._exit();
      return true;
    }
    if (action === 'mute') {
      e.preventDefault();
      this.onMute();
      this._syncStatus();
      return true;
    }
    if (e.code === 'KeyT') {
      e.preventDefault();
      this._previewPlay();
      return true;
    }
    // 房间是独立页面：没定义过的键也吞掉，否则 S/Q 之类的标题快捷键会在背后生效
    return true;
  }

  /* ============================================================
     播放
     ============================================================ */

  _isPlaying(key) {
    return !!this.audio.musicOn && this.audio.currentSong === key;
  }

  _requestPlay(i) {
    const tr = this.tracks[i];
    if (!tr) return;
    // 鼠标点选时先把光标移过去，右侧唱片与列表高亮和弹窗里的曲目保持一致
    if (i !== this.index) {
      this.index = i;
      this._paint();
      this._paintList();
      this._reveal();
    }
    if (!this.isHeard(tr.key)) {
      this._openWarn(i);
      return;
    }
    this._play(tr);
  }

  /** 已经开始播（未知曲目在确认后才会走到这里） */
  _play(tr) {
    this._preview = null;
    this._previewDone = false;
    if (this.d?.cut) this.d.cut.classList.add('hidden');
    // 从确认弹窗切进来的曲目可能不是当前选中行：详情面板必须跟着真正播放的那首。
    const at = this.tracks.indexOf(tr);
    if (at >= 0) this.index = at;
    const same = this.audio.currentSong === tr.key;
    if (same && this.audio.musicOn) {
      // 再按一次 = 停：留声机抬针
      this.audio.setMusic(false);
      this.audio.play?.('menu');
    } else {
      this.audio.play?.('select');
      this.audio.playMusic(tr.key);
      this.audio.setMusic(true);
    }
    this.markHeard(tr.key);
    this._paint();
    this._paintList();
    this._syncStatus();
  }

  /** T：30 秒试听；已经在试听同一首时则收针 */
  _previewPlay() {
    const tr = this.tracks[this.index];
    if (!tr) return;
    if (this._preview && this._preview.key === tr.key) {
      this.audio.setMusic(false);
      this._preview = null;
      this._previewDone = false;
      if (this.d.cut) this.d.cut.classList.add('hidden');
      this.audio.play?.('menu');
      this._syncStatus();
      return;
    }
    if (!this.isHeard(tr.key)) {
      this._openWarn(this.index, true);
      return;
    }
    this._startPreview(tr);
  }

  _startPreview(tr) {
    // 试听同样要保证「选中行 = 正在响的那首」（确认弹窗里的「试听 30 秒」也走这里）。
    const at = this.tracks.indexOf(tr);
    if (at >= 0) this.index = at;
    this.audio.play?.('select');
    this.audio.playMusic(tr.key);
    this.audio.setMusic(true);
    this.markHeard(tr.key);
    this._preview = { key: tr.key, left: PREVIEW_SEC };
    this._previewDone = false;
    this._paint();
    this._paintList();
    // 进度条上标出「30 秒试听」到哪儿结束
    if (this.d.cut && tr.time) {
      this.d.cut.style.left = `${Math.min(100, (PREVIEW_SEC / tr.time) * 100).toFixed(1)}%`;
      this.d.cut.classList.remove('hidden');
    }
    this._syncStatus();
  }

  _exit() {
    this.audio.play?.('menu');
    this.hide();
    this.onExit();
  }

  /* ============================================================
     选择 / 未知曲目确认
     ============================================================ */

  _move(dir) {
    const n = this.tracks.length;
    const next = ((this.index + dir) % n + n) % n;
    if (next === this.index) return;
    this.index = next;
    this.audio.play?.('select');
    this._paint();
    this._paintList();
    this._reveal();
  }

  _openWarn(i, preview = false) {
    this._warn = { index: i, sel: 0, preview };
    this.d.warn.classList.remove('hidden');
    this._paintWarn();
    this.audio.play?.('menu');
  }

  _closeWarn() {
    this._warn = null;
    this._hideWarn();
    // 弹窗一关，鼠标底下那行会立刻收到 pointerenter：确认「播放」时手指还停在
    // 按钮原来的位置（正好压在列表某一行上），光标的选中就会被抢走，详情面板
    // 变成另一首歌。关窗后短暂冻结悬停选中，等这一次点击彻底收尾。
    this._hoverLock = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 320;
  }

  _hideWarn() {
    if (this.d?.warn) this.d.warn.classList.add('hidden');
  }

  _paintWarn() {
    if (!this._warn || !this.d) return;
    const tr = this.tracks[this._warn.index];
    this.d.warnText.textContent =
      `第 ${tr.no} 号唱片被一层薄雾罩着。提前播放会揭晓曲名、人物与解说——` +
      '要现在听吗？';
    this.d.warnPlay.textContent = this._warn.preview ? '试听 30 秒' : '播放';
    this.d.warnPlay.classList.toggle('sel', this._warn.sel === 0);
    this.d.warnCancel.classList.toggle('sel', this._warn.sel === 1);
  }

  /* ============================================================
     主循环（宿主每帧调用）
     ============================================================ */

  update(dt) {
    if (!this.visible) return;
    this._acc += dt;
    if (this._acc < 0.08) return;
    const step = this._acc;
    this._acc = 0;

    // 30 秒试听到点自动收针
    if (this._preview) {
      if (this.audio.currentSong !== this._preview.key || !this.audio.musicOn) {
        this._preview = null;
      } else {
        this._preview.left -= step;
        if (this._preview.left <= 0) {
          this._preview = null;
          this._previewDone = true;
          this.audio.setMusic(false);
          if (this.d.cut) this.d.cut.classList.add('hidden');
        }
      }
    }

    const tr = this.tracks[this.index];
    const playingKey = this.audio.currentSong;
    const playingHere = this._isPlaying(tr.key);
    const p = this.audio.musicProgress;

    if (this.el) this.el.classList.toggle('is-playing', !!p);

    if (playingHere && p) {
      const pct = Math.min(100, (p.elapsed / p.duration) * 100);
      this.d.barFill.style.width = `${pct.toFixed(2)}%`;
      this.d.elapsed.textContent = fmtTime(p.elapsed);
      this.d.loop.textContent = p.loop > 0 ? `LOOP ×${p.loop + 1}` : '';
    } else {
      this.d.barFill.style.width = '0%';
      this.d.elapsed.textContent = '0:00';
      // 光标停在别的曲子上时，提示真正在响的是哪一首
      const other = this.tracks.find((t) => t.key === playingKey);
      this.d.loop.textContent =
        p && other && other.key !== tr.key ? `♪ ${other.title}` : '';
    }
    this._syncStatus();
    this._syncRowPlaying();
  }

  _syncStatus() {
    if (!this.d) return;
    const on = !!this.audio.musicOn;
    const playing = this.tracks.find((t) => t.key === this.audio.currentSong);
    this.d.state.textContent = this._preview
      ? '试听中'
      : this._previewDone && !on
        ? '试听结束'
        : on
          ? (playing ? '再生中' : '待机')
          : '停止中';
    if (this.d.previewTag) {
      this.d.previewTag.classList.toggle('hidden', !this._preview);
      if (this._preview) {
        this.d.previewTag.textContent = `${Math.max(0, Math.ceil(this._preview.left))}s`;
      }
    }
    this.d.vol.textContent = this.audio.muted
      ? '静音'
      : `音量 ${Math.round(this.audio.musicVolume * 100)}%`;
  }

  _syncRowPlaying() {
    const key = this.audio.currentSong;
    const on = !!this.audio.musicOn;
    this.rows.forEach((row, i) => {
      row.el.classList.toggle('is-playing', on && this.tracks[i].key === key);
    });
  }

  /* ============================================================
     绘制文字 / 列表
     ============================================================ */

  _paint() {
    if (!this.d) return;
    const tr = this.tracks[this.index];
    const known = this.isHeard(tr.key);
    const d = this.d;

    d.cat.textContent = known ? tr.cat : 'UNKNOWN';
    d.title.textContent = known ? tr.title : '？？？？？？';
    d.title.classList.toggle('is-locked', !known);
    d.subname.textContent = known ? tr.sub : '未遭遇';
    d.place.textContent = known ? tr.place : '？？？';
    d.orig.textContent = known ? tr.orig : '锁在旧留声机里，尚未刻下纹路。';
    d.note.textContent = known
      ? tr.note
      : '这段旋律还没有在旅途中出现。等你在某个关卡里真正听见它，这张唱片才会被点亮——' +
        '当然，也可以现在就让留声机替你提前揭开。';
    d.dur.textContent = known ? fmtTime(tr.time) : '--:--';
    d.discNo.textContent = known ? `No.${tr.no}` : 'No.??';
    d.discName.textContent = known ? tr.title : '？？？';
    d.disc.style.setProperty('--dtone', tr.tone);
    d.disc.style.setProperty('--dglow', tr.glow);
    d.bpm.textContent = known && tr.bpm ? String(Math.round(tr.bpm)) : '—';
    d.len.textContent = known ? fmtTime(tr.time) : '--:--';
    d.code.textContent = known
      ? `No.${tr.no} / ${String(this.tracks.length).padStart(2, '0')}`
      : `No.?? / ${String(this.tracks.length).padStart(2, '0')}`;

    d.barFill.style.width = '0%';
    d.elapsed.textContent = '0:00';
    d.loop.textContent = '';
    if (d.cut) d.cut.classList.add('hidden');
    this._syncStatus();
  }

  _paintList() {
    let heard = 0;
    this.rows.forEach((row, i) => {
      const tr = this.tracks[i];
      const known = this.isHeard(tr.key);
      if (known) heard++;
      row.el.classList.toggle('is-sel', i === this.index);
      row.el.classList.toggle('is-locked', !known);
      row.el.classList.toggle('is-playing', this._isPlaying(tr.key));
      row.title.textContent = known ? tr.title : '？？？？';
      row.time.textContent = known ? fmtTime(tr.time) : '--:--';
    });
    this.d.count.textContent = String(heard);
    this.d.countAll.textContent = String(this.tracks.length);
  }

  _reveal() {
    const row = this.rows[this.index];
    if (row) row.el.scrollIntoView({ block: 'nearest' });
  }

  /* ============================================================
     构建 DOM
     ============================================================ */

  _build() {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = 'musicRoom';
    el.className = 'mr hidden';
    el.innerHTML =
      '<canvas class="mr-bg" width="1280" height="720" aria-hidden="true"></canvas>' +
      '<div class="mr-veil" aria-hidden="true"></div>' +
      '<div class="mr-frame">' +
        '<header class="mr-head">' +
          '<div class="mr-head-main">' +
            '<p class="mr-kicker">MUSIC ROOM · 音楽室</p>' +
            '<h1 class="mr-heading">音乐回忆室</h1>' +
            '<p class="mr-head-sub">旅途中听过的旋律，都会在留声机上留下一圈纹路。</p>' +
          '</div>' +
          '<div class="mr-count">' +
            '<b class="mr-count-num">0</b>' +
            '<span class="mr-count-sep">/</span>' +
            '<span class="mr-count-all">19</span>' +
            '<span class="mr-count-label">曲已回想</span>' +
          '</div>' +
        '</header>' +
        '<div class="mr-body">' +
          '<section class="mr-list-wrap">' +
            '<div class="mr-list-head"><span>NO.</span><span>曲目</span><span>时长</span></div>' +
            '<ol class="mr-list"></ol>' +
          '</section>' +
          '<article class="mr-detail">' +
            '<div class="mr-disc">' +
              '<div class="mr-grooves"></div>' +
              '<div class="mr-disc-label">' +
                '<span class="mr-disc-no">No.??</span>' +
                '<span class="mr-disc-name">？？？</span>' +
              '</div>' +
              '<i class="mr-disc-hole"></i>' +
              '<div class="mr-sheen"></div>' +
            '</div>' +
            '<div class="mr-detail-body">' +
              '<p class="mr-cat">UNKNOWN</p>' +
              '<h2 class="mr-title">？？？？？？</h2>' +
              '<p class="mr-tags"><span class="mr-subname"></span><span class="mr-place"></span></p>' +
              '<p class="mr-orig"></p>' +
              '<div class="mr-progress">' +
                '<div class="mr-bar"><i class="mr-bar-fill"></i>' +
                  '<i class="mr-cut hidden" title="30 秒试听在这里收针"></i></div>' +
                '<div class="mr-times">' +
                  '<span class="mr-elapsed">0:00</span>' +
                  '<span class="mr-loop"></span>' +
                  '<span class="mr-dur">--:--</span>' +
                '</div>' +
              '</div>' +
              '<div class="mr-eq" aria-hidden="true"></div>' +
              '<p class="mr-note"></p>' +
              '<div class="mr-stats">' +
                '<div class="mr-stat"><span class="mr-stat-k">BPM</span>' +
                  '<span class="mr-stat-v mr-bpm">—</span></div>' +
                '<div class="mr-stat"><span class="mr-stat-k">时长</span>' +
                  '<span class="mr-stat-v mr-len">--:--</span></div>' +
                '<div class="mr-stat"><span class="mr-stat-k">唱片</span>' +
                  '<span class="mr-stat-v mr-code">No.?? / 19</span></div>' +
              '</div>' +
            '</div>' +
          '</article>' +
        '</div>' +
        '<footer class="mr-foot">' +
          '<div class="mr-keys">' +
            '<span><b>↑ ↓</b>选曲</span>' +
            '<span><b>← →</b>换曲</span>' +
            '<span><b>ENTER</b>播放 / 停止</span>' +
            '<span><b>M</b>静音</span>' +
            '<button class="mr-preview-btn" type="button"><b>T</b>试听 30 秒</button>' +
            '<button class="mr-back" type="button"><b>ESC</b>返回标题</button>' +
          '</div>' +
          '<div class="mr-status"><i class="mr-led"></i>' +
            '<span class="mr-state">停止中</span>' +
            '<span class="mr-preview-tag hidden"></span>' +
            '<span class="mr-vol"></span>' +
          '</div>' +
        '</footer>' +
      '</div>' +
      '<div class="mr-warn hidden" role="dialog" aria-modal="true">' +
        '<div class="mr-warn-box">' +
          '<p class="mr-warn-kicker">UNKNOWN MELODY</p>' +
          '<h3 class="mr-warn-title">这段旋律还没有在旅途中出现。</h3>' +
          '<p class="mr-warn-text"></p>' +
          '<div class="mr-warn-actions">' +
            '<button class="mr-warn-btn" data-act="play" type="button">播放</button>' +
            '<button class="mr-warn-btn" data-act="cancel" type="button">取消</button>' +
          '</div>' +
          '<p class="mr-warn-hint">← → 选择　ENTER 确认　ESC 取消</p>' +
        '</div>' +
      '</div>';

    this.host.appendChild(el);
    this.el = el;

    const $ = (sel) => el.querySelector(sel);
    this.d = {
      bg: $('.mr-bg'),
      list: $('.mr-list'),
      count: $('.mr-count-num'),
      countAll: $('.mr-count-all'),
      disc: $('.mr-disc'),
      discNo: $('.mr-disc-no'),
      discName: $('.mr-disc-name'),
      cat: $('.mr-cat'),
      title: $('.mr-title'),
      subname: $('.mr-subname'),
      place: $('.mr-place'),
      orig: $('.mr-orig'),
      barFill: $('.mr-bar-fill'),
      elapsed: $('.mr-elapsed'),
      loop: $('.mr-loop'),
      dur: $('.mr-dur'),
      eq: $('.mr-eq'),
      note: $('.mr-note'),
      bpm: $('.mr-bpm'),
      len: $('.mr-len'),
      code: $('.mr-code'),
      state: $('.mr-state'),
      vol: $('.mr-vol'),
      warn: $('.mr-warn'),
      warnText: $('.mr-warn-text'),
      warnPlay: $('[data-act="play"]'),
      warnCancel: $('[data-act="cancel"]'),
      back: $('.mr-back'),
      previewBtn: $('.mr-preview-btn'),
      previewTag: $('.mr-preview-tag'),
      cut: $('.mr-cut'),
    };

    // 曲目行（点击 = 选中并播放，未遭遇的先弹确认；悬停只移动光标）
    this.rows = this.tracks.map((tr, i) => {
      const li = document.createElement('li');
      li.className = 'mr-row';
      li.innerHTML =
        `<span class="mr-no">${tr.no}</span>` +
        '<span class="mr-row-main">' +
          '<span class="mr-row-title"></span>' +
        '</span>' +
        '<span class="mr-row-time"></span>';
      const refs = {
        el: li,
        title: li.querySelector('.mr-row-title'),
        time: li.querySelector('.mr-row-time'),
        no: li.querySelector('.mr-no'),
      };
      refs.no.textContent = tr.no;
      li.addEventListener('pointerenter', () => {
        if (!this.visible || this._warn) return;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now < (this._hoverLock || 0)) return; // 刚关掉确认弹窗，别抢走这次点击的选中
        if (this.index !== i) {
          this.index = i;
          this._paint();
          this._paintList();
        }
      });
      li.addEventListener('click', () => {
        if (!this.visible) return;
        // index 交给 _requestPlay 一起处理：它需要知道「光标是否换了一行」才会重绘本页
        this._requestPlay(i);
      });
      this.d.list.appendChild(li);
      return refs;
    });

    // 均衡器：高度与延迟各自不同，跳起来才像在响
    for (let i = 0; i < EQ_BARS; i++) {
      const b = document.createElement('i');
      b.style.setProperty('--i', String(i));
      b.style.setProperty('--h', (0.22 + getEqHeight(i)).toFixed(3));
      this.d.eq.appendChild(b);
    }

    this.d.warnPlay.addEventListener('click', () => {
      if (!this._warn) return;
      const idx = this._warn.index;
      const preview = !!this._warn.preview;
      const tr = this.tracks[idx];
      this._closeWarn();
      if (!tr) return;
      // 直接播放，不再走 _requestPlay：后者对未听曲目会重新弹框，鼠标点「播放」会死循环
      if (preview) this._startPreview(tr);
      else this._play(tr);
    });
    this.d.warnCancel.addEventListener('click', () => {
      this.audio.play?.('menu');
      this._closeWarn();
    });
    // 触屏 / 鼠标也能退出（没有 ESC 键的设备）
    this.d.back.addEventListener('click', () => this._exit());
    this.d.previewBtn.addEventListener('click', () => {
      if (this.visible) this._previewPlay();
    });

    this._drawBackdrop();
  }

  /* ============================================================
     背景：拱窗 / 月光 / 唱片架 / 留声机 / 落樱
     ============================================================ */

  _drawBackdrop() {
    const cv = this.d.bg;
    const c = cv.getContext('2d');
    if (!c) return;
    const W = cv.width;
    const H = cv.height;

    c.clearRect(0, 0, W, H);

    /* 墙面：暗紫木色，上方偏暖 */
    const wall = c.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#171021');
    wall.addColorStop(0.52, '#120b1a');
    wall.addColorStop(1, '#07040c');
    c.fillStyle = wall;
    c.fillRect(0, 0, W, H);

    /* 左上暖光：烛台与留声机的余温 */
    const warm = c.createRadialGradient(360, 250, 30, 360, 250, 620);
    warm.addColorStop(0, 'rgba(255, 152, 96, .18)');
    warm.addColorStop(0.42, 'rgba(176, 74, 58, .08)');
    warm.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = warm;
    c.fillRect(0, 0, W, H);

    /* 墙板竖缝 */
    c.save();
    c.strokeStyle = 'rgba(255, 214, 170, .045)';
    c.lineWidth = 1;
    for (let x = 64; x < W; x += 104) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 486);
      c.stroke();
    }
    c.restore();

    /* 拱窗 + 月亮 */
    this._drawWindow(c, 760, 40, 420, 430);

    /* 窗光斜落到地板上 */
    c.save();
    const shaft = c.createLinearGradient(880, 60, 620, 660);
    shaft.addColorStop(0, 'rgba(148, 182, 255, .10)');
    shaft.addColorStop(0.55, 'rgba(148, 182, 255, .045)');
    shaft.addColorStop(1, 'rgba(148, 182, 255, 0)');
    c.fillStyle = shaft;
    c.beginPath();
    c.moveTo(772, 62);
    c.lineTo(1176, 62);
    c.lineTo(1010, 620);
    c.lineTo(470, 620);
    c.closePath();
    c.fill();
    c.restore();

    /* 地板 */
    const floor = c.createLinearGradient(0, 486, 0, H);
    floor.addColorStop(0, '#1a1120');
    floor.addColorStop(0.35, '#120c17');
    floor.addColorStop(1, '#08050d');
    c.fillStyle = floor;
    c.fillRect(0, 486, W, H - 486);
    c.save();
    c.strokeStyle = 'rgba(255, 210, 160, .05)';
    for (let i = 0; i < 9; i++) {
      const y = 486 + Math.pow(i / 8, 1.7) * 234;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    c.strokeStyle = 'rgba(255, 210, 160, .035)';
    for (let x = -600; x < W + 600; x += 150) {
      c.beginPath();
      c.moveTo(x, H);
      c.lineTo(x + 260, 486);
      c.stroke();
    }
    c.restore();

    /* 左侧唱片架 */
    this._drawShelf(c, 22, 226, 250, 250);

    /* 左下角：桌面与茶杯 / 烛台剪影 */
    this._drawTable(c, 0, 560, 440, 160);

    /* 落樱（画在背景上，透明度很低，作为房间的空气） */
    this._drawPetals(c, W, H);

    /* 四角压暗 */
    const vig = c.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 780);
    vig.addColorStop(0, 'rgba(4, 2, 8, 0)');
    vig.addColorStop(1, 'rgba(4, 2, 8, .55)');
    c.fillStyle = vig;
    c.fillRect(0, 0, W, H);
  }

  _drawWindow(c, x, y, w, h) {
    c.save();
    // 窗外夜空（先裁成拱形）
    c.beginPath();
    c.moveTo(x, y + h);
    c.lineTo(x, y + 150);
    c.quadraticCurveTo(x, y, x + w / 2, y);
    c.quadraticCurveTo(x + w, y, x + w, y + 150);
    c.lineTo(x + w, y + h);
    c.closePath();
    c.save();
    c.clip();

    const night = c.createLinearGradient(0, y, 0, y + h);
    night.addColorStop(0, '#101f3e');
    night.addColorStop(0.55, '#0c1730');
    night.addColorStop(1, '#060a16');
    c.fillStyle = night;
    c.fillRect(x, y, w, h);

    // 星
    const rnd = (() => {
      let a = 0x2f6f3d1b;
      return () => {
        a = (Math.imul(a ^ (a >>> 15), 0x85ebca6b) + 0x165667b1) | 0;
        return ((a >>> 8) & 0xffffff) / 0x1000000;
      };
    })();
    for (let i = 0; i < 46; i++) {
      const sx = x + rnd() * w;
      const sy = y + rnd() * (h * 0.72);
      const r = 0.5 + rnd() * 1.3;
      c.fillStyle = `rgba(226, 236, 255, ${(0.12 + rnd() * 0.5).toFixed(3)})`;
      c.beginPath();
      c.arc(sx, sy, r, 0, Math.PI * 2);
      c.fill();
    }

    // 月
    const mx = x + w * 0.64;
    const my = y + 132;
    const mr = 54;
    const halo = c.createRadialGradient(mx, my, mr * 0.35, mx, my, mr * 3.6);
    halo.addColorStop(0, 'rgba(255, 245, 214, .55)');
    halo.addColorStop(0.36, 'rgba(255, 232, 186, .17)');
    halo.addColorStop(1, 'rgba(255, 232, 186, 0)');
    c.fillStyle = halo;
    c.beginPath();
    c.arc(mx, my, mr * 3.6, 0, Math.PI * 2);
    c.fill();
    const moon = c.createRadialGradient(mx - mr * 0.34, my - mr * 0.42, mr * 0.12, mx, my, mr);
    moon.addColorStop(0, '#fffdf4');
    moon.addColorStop(0.66, '#ffedc2');
    moon.addColorStop(1, '#efd193');
    c.fillStyle = moon;
    c.beginPath();
    c.arc(mx, my, mr, 0, Math.PI * 2);
    c.fill();

    // 云带
    c.fillStyle = 'rgba(22, 34, 66, .66)';
    for (const [cx, cy, rx, ry] of [
      [x + 150, y + 250, 150, 26],
      [x + 300, y + 286, 190, 22],
      [x + 90, y + 330, 170, 20],
    ]) {
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      c.fill();
    }

    // 樱枝剪影（从窗右上角伸进来）
    c.strokeStyle = 'rgba(10, 7, 12, .9)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x + w + 10, y + 60);
    c.bezierCurveTo(x + w - 90, y + 110, x + w - 120, y + 190, x + w - 190, y + 240);
    c.stroke();
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x + w - 88, y + 148);
    c.bezierCurveTo(x + w - 140, y + 130, x + w - 176, y + 96, x + w - 214, y + 78);
    c.stroke();
    c.restore();

    // 窗棂（压在夜空上，所以裁剪已经结束）
    c.strokeStyle = 'rgba(16, 10, 12, .92)';
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(x + w / 2, y + 26);
    c.lineTo(x + w / 2, y + h);
    c.stroke();
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(x, y + h * 0.52);
    c.lineTo(x + w, y + h * 0.52);
    c.stroke();
    // 拱顶辐条
    c.lineWidth = 5;
    for (const a of [-0.55, 0, 0.55]) {
      c.beginPath();
      c.moveTo(x + w / 2, y + 60);
      c.lineTo(x + w / 2 + Math.sin(a) * w * 0.42, y + 60 - Math.cos(a) * 130);
      c.stroke();
    }

    // 石框 + 窗台
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(38, 27, 38, .95)';
    c.beginPath();
    c.moveTo(x, y + h);
    c.lineTo(x, y + 150);
    c.quadraticCurveTo(x, y, x + w / 2, y);
    c.quadraticCurveTo(x + w, y, x + w, y + 150);
    c.lineTo(x + w, y + h);
    c.stroke();
    c.fillStyle = 'rgba(46, 32, 44, .95)';
    c.fillRect(x - 16, y + h - 4, w + 32, 16);
    c.restore();
  }

  _drawShelf(c, x, y, w, h) {
    c.save();
    // 木架
    c.fillStyle = 'rgba(26, 15, 22, .92)';
    c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(255, 205, 150, .10)';
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const rows = 4;
    const shelfH = h / rows;
    for (let r = 0; r < rows; r++) {
      const sy = y + r * shelfH;
      // 上层压板
      c.fillStyle = 'rgba(58, 38, 44, .9)';
      c.fillRect(x + 6, sy + shelfH - 10, w - 12, 5);
      // 唱片侧脊
      let sx = x + 12;
      let seed = r * 37 + 11;
      const rnd = () => {
        seed = (Math.imul(seed ^ (seed >>> 13), 0x5bd1e995) + 0x9e3779b9) | 0;
        return ((seed >>> 9) & 0x3ff) / 0x400;
      };
      while (sx < x + w - 16) {
        const bw = 5 + rnd() * 7;
        const bh = shelfH - 26 - rnd() * 18;
        const tone = 30 + Math.floor(rnd() * 40);
        c.fillStyle = `rgba(${tone + 48}, ${tone + 14}, ${tone + 26}, .85)`;
        c.fillRect(sx, sy + shelfH - 15 - bh, bw, bh);
        c.fillStyle = 'rgba(255, 220, 170, .22)';
        c.fillRect(sx + bw - 1.5, sy + shelfH - 15 - bh, 1.5, bh);
        sx += bw + 2 + rnd() * 3;
      }
    }
    // 架子顶上的小盆栽剪影
    c.fillStyle = 'rgba(18, 24, 20, .95)';
    c.beginPath();
    c.ellipse(x + w - 46, y - 12, 26, 15, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  _drawTable(c, x, y, w, h) {
    c.save();
    // 桌面
    const top = c.createLinearGradient(0, y, 0, y + 26);
    top.addColorStop(0, 'rgba(58, 38, 40, .95)');
    top.addColorStop(1, 'rgba(24, 14, 18, .95)');
    c.fillStyle = top;
    c.beginPath();
    c.moveTo(x + 18, y + 6);
    c.lineTo(x + w, y + 6);
    c.lineTo(x + w - 34, y + 30);
    c.lineTo(x, y + 30);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255, 206, 150, .06)';
    c.fillRect(x + 18, y + 6, w - 18, 2);

    // 桌上：一叠唱片
    for (let i = 0; i < 3; i++) {
      c.fillStyle = i % 2 ? 'rgba(26, 18, 26, .95)' : 'rgba(40, 28, 34, .95)';
      c.beginPath();
      c.ellipse(x + 112, y - 2 - i * 7, 56, 13, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(255, 214, 160, .12)';
      c.stroke();
    }

    // 烛台
    c.strokeStyle = 'rgba(64, 50, 34, .95)';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(x + 268, y + 4);
    c.lineTo(x + 268, y - 44);
    c.stroke();
    c.fillStyle = 'rgba(255, 236, 190, .92)';
    c.beginPath();
    c.ellipse(x + 268, y - 50, 4, 8, 0, 0, Math.PI * 2);
    c.fill();
    const glow = c.createRadialGradient(x + 268, y - 50, 2, x + 268, y - 50, 90);
    glow.addColorStop(0, 'rgba(255, 214, 150, .35)');
    glow.addColorStop(1, 'rgba(255, 214, 150, 0)');
    c.fillStyle = glow;
    c.beginPath();
    c.arc(x + 268, y - 50, 90, 0, Math.PI * 2);
    c.fill();

    // 留声机喇叭（右下角的大剪影，只露出上半）
    c.restore();
    c.save();
    c.translate(1206, 590);
    c.rotate(-0.16);
    c.fillStyle = 'rgba(30, 20, 26, .96)';
    c.beginPath();
    c.moveTo(-8, 0);
    c.bezierCurveTo(-14, -70, 44, -118, 120, -124);
    c.bezierCurveTo(70, -70, 40, -20, 26, 10);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255, 208, 150, .13)';
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = 'rgba(42, 30, 30, .95)';
    c.beginPath();
    c.ellipse(44, -104, 44, 34, -0.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  _drawPetals(c, W, H) {
    c.save();
    let seed = 0x51f3a7;
    const rnd = () => {
      seed = (Math.imul(seed ^ (seed >>> 15), 0x85ebca6b) + 0x165667b1) | 0;
      return ((seed >>> 8) & 0xffffff) / 0x1000000;
    };
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W;
      const y = 60 + rnd() * (H - 100);
      const r = 2 + rnd() * 3.4;
      c.save();
      c.translate(x, y);
      c.rotate(rnd() * Math.PI * 2);
      c.fillStyle = `rgba(255, 168, 196, ${(0.05 + rnd() * 0.12).toFixed(3)})`;
      c.beginPath();
      c.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.restore();
  }
}

/** 均衡器柱高：用确定性公式，避免每次打开房间都变样 */
function getEqHeight(i) {
  const a = Math.sin(i * 1.7) * 0.5 + 0.5;
  const b = Math.sin(i * 0.53 + 1.2) * 0.5 + 0.5;
  return 0.75 * (0.45 * a + 0.55 * b);
}
