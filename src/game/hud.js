/**
 * HUD：把游戏状态同步到 DOM。只在数值变化时写 DOM，避免每帧触发重排。
 */
import { POWER, powerLevel } from './power.js';

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
    this.elLives.innerHTML = '';
    this.elsLives = [];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'life';
      this.elLives.appendChild(d);
      this.elsLives.push(d);
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
      this._lives = stageState.lives;
      // 1UP 会让残机数超过初始格子数，补建图标再刷新显隐
      if (stageState.lives > this.elsLives.length) this._buildLives(stageState.lives);
      for (let i = 0; i < this.elsLives.length; i++) {
        this.elsLives[i].classList.toggle('off', i >= stageState.lives);
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

    // 符卡消耗刻度（6 / 16 ≈ 38%）+ 可施放时的发光提示
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

    // 1UP 累计条：每 99 点 POWER → 恢复 1 条残机，条满清零后重新累计
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
      if (this.elExtendNum) this.elExtendNum.textContent = `${Math.floor(ep)}/${en}`;
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
        this._pop(`火力 Lv.${lv} ↑`, 'up');
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
      if (b.name !== this._bossName) {
        this._bossName = b.name;
        if (this.elBossName) this.elBossName.textContent = b.name;
      }
      // 符卡名 + 序号（如「难题「燕的子安贝 -永命线-」 · 7/8」）
      const phaseLabel = b.spellCount > 1 ? `${b.phase} · ${b.spell}/${b.spellCount}` : b.phase;
      if (this.elBossPhase && this.elBossPhase.textContent !== phaseLabel) {
        this.elBossPhase.textContent = phaseLabel;
      }
      const r = Math.round(b.ratio * 100);
      if (r !== this._bossRatio) {
        this._bossRatio = r;
        if (this.elBossFill) this.elBossFill.style.width = r + '%';
      }
    } else if (this._bossVisible) {
      this._bossVisible = false;
      this.elBossBar?.classList.add('hidden');
      this._bossRatio = -1;
      this._bossName = '';
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
    this.elBossBar?.classList.add('hidden');
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
