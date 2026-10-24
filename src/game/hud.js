/**
 * HUD：把游戏状态同步到 DOM。只在数值变化时写 DOM，避免每帧触发重排。
 */
import { POWER, powerLevel } from './power.js';
import { tr } from '../i18n/index.js';

// 残机图标最多画 10 个，超出用「×N」计数：
// 1UP 没有硬上限，高擦弹/长局里残机可能涨到几十条，逐个画会撑爆 HUD 左栏、
// 把中间的 POWER 条和右侧关卡信息挤出屏幕（见 docs QA 截图 S6_clear.png）。
const LIFE_ICON_CAP = 10;

export class Hud {
  constructor() {
    this.elLives = document.getElementById('lives');
    this.elPowerFill = document.getElementById('powerFill');
    this.elPowerNum = document.getElementById('powerNum');
    this.elPowerMax = document.getElementById('powerMax');
    this.elPowerBar = document.querySelector('.pbar');
    this.elPowerLvNum = document.getElementById('powerLvNum');
    this.elPowerPips = document.getElementById('powerPips');
    this.elPowerCastMark = document.getElementById('powerCastMark');
    this.elPowerPop = document.getElementById('powerPop');
    this.elExtendBox = document.getElementById('extendBox');
    this.elExtendFill = document.getElementById('extendFill');
    this.elExtendNum = document.getElementById('extendNum');
    this.elStage = document.getElementById('stageName');
    this.elStageSub = document.getElementById('stageSub');
    this.elTimer = document.getElementById('timer');
    this.elBossBar = document.getElementById('bossBar');
    this.elBossName = document.getElementById('bossName');
    this.elBossPhase = document.getElementById('bossPhase');
    this.elBossFill = document.getElementById('bossFill');
    // 符卡计时/模式行（spec 3.5）：只有带 limit 的卡（stage1-6）才显示，EXTRA 保持原样
    this.elBossCardTimer = document.getElementById('bossCardTimer');
    this.elBossCardMode = document.getElementById('bossCardMode');
    this.elBossCardText = document.getElementById('bossCardText');
    this.elBanner = document.getElementById('banner');

    this._lives = -1;
    this._power = -1;
    this._powerRaw = -1;
    this._maxPower = -1;
    this._level = -1;
    this._castable = null;
    this._castPct = -1;
    this._extendPct = -1;
    this._extendPts = -1;
    this._extendNeed = -1;
    this._extendBumpT = 0;
    this._popT = 0;
    this._levelChanged = false;
    this._time = -1;
    this._bossRatio = -1;
    this._bossName = '';
    this._bossSurvive = false;
    this._bossTimerShown = false;
    this._bossTimerKey = '';
    this._bossTimerModeLabel = '';
    this._bossTimerPhase = '';
    this._bossTimerAcc = 0;
    this._bannerT = 0;
    this._bannerDur = 0;
    this._bossVisible = false;

    this._buildLives(4);
    this.setChar('reimu');
  }

  /** 残机图标随主角变化：灵梦 = 灵符，魔理沙 = 星星 */
  setChar(char) {
    this._char = char === 'marisa' ? 'marisa' : 'reimu';
    if (this.elLives) this.elLives.dataset.char = this._char;
  }

  _buildLives(n) {
    if (!this.elLives) return;
    const total = Math.max(1, Math.floor(n) || 0);
    const shown = Math.min(total, LIFE_ICON_CAP);
    this.elLives.innerHTML = '';
    this.elsLives = [];
    for (let i = 0; i < shown; i++) {
      const d = document.createElement('div');
      d.className = 'life';
      this.elLives.appendChild(d);
      this.elsLives.push(d);
    }
    // 超过图标上限时余下的残机折成计数，不让左栏无限变宽
    this.elLivesMore = null;
    if (total > LIFE_ICON_CAP) {
      const sp = document.createElement('span');
      sp.className = 'life-more';
      sp.textContent = '×' + total;
      sp.style.fontSize = 'calc(var(--s) * 11px)';
      sp.style.marginLeft = 'calc(var(--s) * 5px)';
      sp.style.letterSpacing = '.04em';
      sp.style.opacity = '.92';
      sp.style.whiteSpace = 'nowrap';
      this.elLives.appendChild(sp);
      this.elLivesMore = sp;
    }
  }

  setStageName(main, sub) {
    if (this.elStage) this.elStage.textContent = main;
    if (this.elStageSub) this.elStageSub.textContent = sub || '';
  }

  setMaxLives(n, char) {
    if (char) this.setChar(char);
    if (n !== this.elsLives.length) this._buildLives(n);
    for (const el of this.elsLives) el.classList.remove('off');
    this._lives = -1;
  }

  update(stageState, dt = 0) {
    if (!stageState) return;

    if (stageState.lives !== this._lives) {
      const total = Math.max(0, Math.floor(stageState.lives) || 0);
      this._lives = stageState.lives;
      // 1UP 会让残机数超过初始格子数，补建图标再刷新显隐；
      // 超过 LIFE_ICON_CAP 后改为只更新「×N」计数，避免几十个图标撑爆 HUD。
      if (total > LIFE_ICON_CAP) {
        if (!this.elLivesMore || this.elsLives.length !== LIFE_ICON_CAP) this._buildLives(total);
        else this.elLivesMore.textContent = '×' + total;
      } else if (total === 0) {
        // 从「×N」回到 0 命时保留整排暗图标，别缩成孤零零一个
        if (this.elLivesMore) this._buildLives(this.elsLives.length || 1);
      } else if (total > this.elsLives.length || this.elLivesMore) {
        this._buildLives(total);
      }
      for (let i = 0; i < this.elsLives.length; i++) {
        this.elsLives[i].classList.toggle('off', i >= total);
      }
    }

    if (stageState.maxPower !== this._maxPower) {
      this._maxPower = stageState.maxPower;
      if (this.elPowerMax) this.elPowerMax.textContent = String(stageState.maxPower);
    }

    const lv = stageState.fireLevel ?? powerLevel(stageState.power);

    // 火力等级：Lv.N 文本 + 四段菱形
    if (lv !== this._level) {
      const prevLv = this._level;
      this._level = lv;
      if (this.elPowerLvNum) this.elPowerLvNum.textContent = String(lv);
      if (this.elPowerPips) {
        const pips = this.elPowerPips.children;
        for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < lv);
      }
      this._levelChanged = this._levelChanged || (prevLv > 0 && prevLv !== lv);
    }

    // 符卡消耗刻度（48 / 128 ≈ 38%）+ 可施放时的发光提示
    const castCost = stageState.castCost ?? POWER.castCost;
    const costPct = Math.round((castCost / stageState.maxPower) * 100);
    if (costPct !== this._castPct) {
      this._castPct = costPct;
      if (this.elPowerCastMark) this.elPowerCastMark.style.left = costPct + '%';
    }
    const castable = stageState.power >= castCost;
    if (castable !== this._castable) {
      this._castable = castable;
      this.elPowerBar?.classList.toggle('castable', castable);
    }

    const rawPower = Math.round(stageState.power);
    const prevRaw = this._powerRaw;
    const powerPct = Math.round((stageState.power / stageState.maxPower) * 100);
    if (powerPct !== this._power) {
      this._power = powerPct;
      if (this.elPowerFill) this.elPowerFill.style.width = powerPct + '%';
      if (this.elPowerNum) this.elPowerNum.textContent = String(Math.floor(stageState.power));
      this.elPowerBar?.classList.toggle('full', stageState.power >= stageState.maxPower);
    }
    this._powerRaw = rawPower;

    // 1UP 累计条：每 99 点（拾取 POWER / 擦弹 / 符卡奖励）→ 恢复 1 条残机，条满清零后重新累计
    const ep = stageState.extendPts || 0;
    const en = stageState.extendNeed || POWER.extend || 99;
    const epct = Math.round((ep / en) * 1000) / 10;
    if (epct !== this._extendPct) {
      this._extendPct = epct;
      if (this.elExtendFill) this.elExtendFill.style.width = epct + '%';
    }
    if (en !== this._extendNeed || ep !== this._extendPts) {
      const prev = this._extendPts;
      this._extendNeed = en;
      this._extendPts = ep;
      if (this.elExtendNum) {
        // 擦弹以 0.02 推进：显示整数进度（0.24/99 看起来像 bug），
        // 条宽仍按 ep/en 百分比平滑增长，不会让玩家觉得没在动。
        const epText = String(Math.floor(ep));
        this.elExtendNum.textContent = `${epText}/${en}`;
      }
      // 计数回绕 = 刚刚拿到 1UP，闪一下提醒
      if (prev >= 0 && ep < prev) {
        this._extendBumpT = 1.1;
        this.elExtendBox?.classList.add('bump');
      }
    }
    if (this._extendBumpT > 0) {
      this._extendBumpT -= dt;
      if (this._extendBumpT <= 0) this.elExtendBox?.classList.remove('bump');
    }

    // 浮字：吃 P 涨火力、放符卡烧火力
    if (prevRaw >= 0 && rawPower !== prevRaw) {
      const delta = rawPower - prevRaw;
      if (delta <= -5) {
        this._pop(`-${-delta}${this._levelChanged ? ` · Lv.${lv}` : ''}`, 'down');
      } else if (delta > 0 && this._levelChanged) {
        this._pop(tr('火力 Lv.{lv} ↑', { lv }), 'up');
      } else if (delta > 0) {
        this._pop(`+${delta}`, 'gain');
      }
    }
    this._levelChanged = false;
    if (this._popT > 0) {
      this._popT -= dt;
      if (this._popT <= 0) this.elPowerPop?.classList.remove('show');
    }

    const secs = Math.floor(stageState.time);
    if (secs !== this._time) {
      this._time = secs;
      if (this.elTimer) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        this.elTimer.textContent = `${m}:${String(s).padStart(2, '0')}`;
      }
    }

    // Boss 血条
    const b = stageState.boss;
    if (b) {
      if (!this._bossVisible) {
        this._bossVisible = true;
        this.elBossBar?.classList.remove('hidden');
      }
      if (b.name !== this._bossName || tr(b.name) !== this._bossNameText) {
        this._bossName = b.name;
        this._bossNameText = tr(b.name);
        if (this.elBossName) this.elBossName.textContent = this._bossNameText;
      }
      // 符卡名 + 序号（如「难题「燕的子安贝 -永命线-」 · 7/8」）
      // spell/spellCount 缺失时退回新字段 cardIndex(0 起)/cardTotal，避免老/新 stageState 混用时丢序号
      const spellNo = Number.isFinite(b.spell)
        ? b.spell
        : (Number.isFinite(b.cardIndex) ? b.cardIndex + 1 : 0);
      const spellTotal = Number.isFinite(b.spellCount)
        ? b.spellCount
        : (Number.isFinite(b.cardTotal) ? b.cardTotal : 0);
      const phaseName = tr(b.phase || '');
      const phaseLabel = spellTotal > 1
        ? `${phaseName}${phaseName ? ' · ' : ''}${spellNo}/${spellTotal}`
        : phaseName;
      if (this.elBossPhase && this.elBossPhase.textContent !== phaseLabel) {
        this.elBossPhase.textContent = phaseLabel;
      }
      // survival 卡 Boss 免疫伤害，血条填充改用 cardRatio（= 剩余时间比例），并给青蓝色 + SURVIVE 标记
      const survival = b.mode === 'survival';
      if (survival !== this._bossSurvive) {
        this._bossSurvive = survival;
        this.elBossBar?.classList.toggle('survive', survival);
      }
      const rawRatio = survival && Number.isFinite(b.cardRatio) ? b.cardRatio : b.ratio;
      const r = Math.round((Number.isFinite(rawRatio) ? rawRatio : 0) * 100);
      if (r !== this._bossRatio) {
        this._bossRatio = r;
        if (this.elBossFill) this.elBossFill.style.width = r + '%';
      }
      this._updateBossCardTimer(b, survival, dt);
    } else if (this._bossVisible) {
      this._bossVisible = false;
      this.elBossBar?.classList.add('hidden');
      this._bossRatio = -1;
      this._bossName = '';
      this._setBossTimerVisible(false);
      this._bossSurvive = false;
      this.elBossBar?.classList.remove('survive');
    }

    // banner 淡出
    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) {
        this.elBanner?.classList.add('hidden');
        this.elBanner?.classList.remove('show');
      }
    }
  }

  /**
   * 符卡计时行（spec 3.5）：
   * - damage 卡：「限时 剩余 12.4s」；超时后改成「超时 · 击破 +10 点」
   * - survival 卡：「坚持 12.4s」+ SURVIVE 标记（血条填充在主 update 里换成 cardRatio）
   * - limit 为空（EXTRA 等）：整行隐藏，保持原有 HUD 不变
   * 文本按 10Hz 节流（默认 60fps 下每 6 帧最多写一次），并缓存上一次文案避免无谓 DOM 写入。
   */
  _updateBossCardTimer(b, survival, dt) {
    if (!this.elBossCardTimer) return;
    const limit = Number.isFinite(b.cardLimit) && b.cardLimit > 0 ? b.cardLimit : null;
    if (!limit) {
      this._setBossTimerVisible(false);
      return;
    }
    this._setBossTimerVisible(true);
    const elapsed = Number.isFinite(b.cardElapsed) ? Math.max(0, b.cardElapsed) : 0;
    const remain = Number.isFinite(b.cardRemain)
      ? Math.max(0, b.cardRemain)
      : Math.max(0, limit - elapsed);
    const over = !survival && elapsed > limit;
    const phase = survival ? 'survival' : (over ? 'over' : 'damage');

    // 超过 100ms 才刷新数值（10Hz）；但「换卡 / 换模式 / 刚开卡」这类离散状态变化立即生效
    if (phase === this._bossTimerPhase) {
      this._bossTimerAcc += dt;
      if (this._bossTimerAcc < 0.1) return;
    }
    this._bossTimerAcc = 0;
    this._bossTimerPhase = phase;

    let key;
    let text;
    if (survival) {
      key = `s:${elapsed.toFixed(1)}`;
      text = tr('坚持 {t}s', { t: elapsed.toFixed(1) });
    } else if (over) {
      key = 'over';
      text = tr('超时 · 击破 +10 点');
    } else {
      key = `d:${remain.toFixed(1)}`;
      text = tr('限时 剩余 {t}s', { t: remain.toFixed(1) });
    }
    const modeLabel = survival ? 'SURVIVE' : '';
    if (key === this._bossTimerKey && modeLabel === this._bossTimerModeLabel) return;
    this._bossTimerKey = key;
    this._bossTimerModeLabel = modeLabel;
    if (this.elBossCardText) this.elBossCardText.textContent = text;
    if (this.elBossCardMode) {
      this.elBossCardMode.textContent = modeLabel;
      this.elBossCardMode.classList.toggle('hidden', !modeLabel);
    }
    this.elBossCardTimer.classList.toggle('overtime', over);
    this.elBossCardTimer.classList.toggle('survive', survival);
  }

  _setBossTimerVisible(show) {
    if (show === this._bossTimerShown) return;
    this._bossTimerShown = show;
    this.elBossCardTimer?.classList.toggle('hidden', !show);
    if (!show) {
      // 归零缓存：下次开卡（或下一场 Boss 战）第一帧就能立刻写上正确文案
      this._bossTimerKey = '';
      this._bossTimerModeLabel = '';
      this._bossTimerPhase = '';
      this._bossTimerAcc = 0;
      this.elBossCardTimer?.classList.remove('overtime', 'survive');
      if (this.elBossCardMode) this.elBossCardMode.classList.add('hidden');
    }
  }

  banner(text, sub = '', dur = 2.2) {
    if (!this.elBanner) return;
    this.elBanner.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
    this.elBanner.classList.remove('hidden');
    // 触发重新动画
    this.elBanner.classList.remove('show');
    void this.elBanner.offsetWidth;
    this.elBanner.classList.add('show');
    this._bannerT = dur;
    this._bannerDur = dur;
  }

  clearBanner() {
    this._bannerT = 0;
    this.elBanner?.classList.add('hidden');
    this.elBanner?.classList.remove('show');
  }

  hideBossBar() {
    this._bossVisible = false;
    this._bossRatio = -1;
    this._bossName = '';
    this._bossSurvive = false;
    this._setBossTimerVisible(false);
    this.elBossBar?.classList.add('hidden');
    this.elBossBar?.classList.remove('survive');
  }

  /** POWER 浮字：短促提示涨/降与火力等级变化 */
  _pop(text, kind) {
    const el = this.elPowerPop;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('show', 'up', 'down', 'gain');
    void el.offsetWidth; // 强制重排以重播动画
    el.classList.add('show', kind);
    this._popT = 0.9;
  }

  reset() {
    this._lives = -1;
    this._power = -1;
    this._powerRaw = -1;
    this._maxPower = -1;
    this._level = -1;
    this._levelChanged = false;
    this._castable = null;
    this._castPct = -1;
    this._extendPct = -1;
    this._extendPts = -1;
    this._extendNeed = -1;
    this._extendBumpT = 0;
    this._popT = 0;
    this.elExtendBox?.classList.remove('bump');
    if (this.elExtendFill) this.elExtendFill.style.width = '0%';
    if (this.elExtendNum) this.elExtendNum.textContent = '0/99';
    this._time = -1;
    this.elPowerBar?.classList.remove('full', 'castable');
    if (this.elPowerLvNum) this.elPowerLvNum.textContent = '1';
    if (this.elPowerPips) {
      for (const pip of this.elPowerPips.children) pip.classList.remove('on');
    }
    this.elPowerPop?.classList.remove('show', 'up', 'down', 'gain');
    this.hideBossBar();
    this.clearBanner();
  }
}
