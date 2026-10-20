/**
 * 玩家模拟器（页面端）：接管 __game.input，用启发式 AI 真实按键并跑完整流程。
 *
 * 用法（tools/_sim_player.mjs 自动注入）：
 *   const bot = install({ god: true, maxRetries: 2 });
 *   bot.run(600);            // 推进 600 个逻辑帧（10 秒）
 *   bot.snapshot();          // 取当前遥测
 *
 * 设计要点：
 *  - 完全走真实输入路径：只改 down/pressed/released 三个查询函数，
 *    不碰 Player / Stage 内部，所以测的是玩家真正按键时的行为。
 *  - 平台关：一路向右 + 射击，探墙/探坑/探刺起跳，卡住就冲跳；
 *    Boss 出现后停在 Boss 左侧、按住 ↑ 斜上射击。
 *  - 弹幕关：对准 Boss 站位 + 局部闪避，符卡自动放。
 *  - 对话/结局/GameOver 自动按键推进（GameOver 有重试次数上限）。
 *  - 全程记录状态迁移、死亡、NaN、卡死、Boss 掉血停滞等异常。
 */
export function install(opts = {}) {
  const g = window.__game;
  if (!g) throw new Error('game not ready');
  if (g.input.__simBot) return g.input.__simBot;

  const B = {
    god: opts.god !== false,
    maxRetries: opts.maxRetries ?? 3,
    maxCast: opts.maxCast ?? 200,
    steps: 0,
    deaths: 0,
    gameovers: 0,
    retries: 0,
    casts: 0,
    shotsFired: 0,
    hitCount: 0,
    hitDmg: 0,
    dbg: [],
    jumps: 0,
    dashes: 0,
    stages: [],
    events: [],
    errors: [],
    maxBullets: 0,
    airSaves: 0,
    airPlan: null,
    deathSpots: [],
    pendingRescue: false,
    rescues: 0,
    stuckLogs: 0,
    bossStallLogs: 0,
    stageMaxX: 0,
    stop: false,
    held: new Set(),
    pressed: new Set(),
    released: new Set(),
    prevState: g.state,
    prevLevel: g.levelIndex,
    prevStage: null,
    prevStageState: null,
    trace: [],
    deathTrace: null,
    deathReason: null,
    hurtLog: [],
    lastX: 0,
    stuck: 0,
    bossHpMark: null,
    bossStallT: 0,
    stageStartStep: 0,
  };

  // 只替换查询函数，保留 Input 的其它能力
  g.input.down = (a) => B.held.has(a);
  g.input.pressed = (a) => B.pressed.has(a);
  g.input.released = (a) => B.released.has(a);
  g.input.__simBot = B;

  const hold = (a) => B.held.add(a);
  const tap = (a) => B.pressed.add(a);
  const sec = () => +(B.steps / 60).toFixed(1);

  /* 落点预测：按给定水平意向（-1 左 / 0 松手 / 1 右）逐帧模拟抛物线，
     返回落点 x 与是否踩到实地。参数取自 src/game/player.js 的 TUNE。
     注意：单向平台（PLATFORM，碎冰/浮台）不是实心，必须单独判定，否则
     机器人会把「水面上的碎冰」当成坑，横移修正时掉进水里。 */
  const PHYS = {
    accelAir: 1700, accelTurn: 2720, frictionAir: 450, maxRun: 380,
    gravityRise: 2200, gravityFall: 2900, apexSpeed: 90, apexMul: 0.6, maxFall: 900,
    jumpVel: 750,
  };

  /** 矩形内是否有「可站立」瓦片（实心或单向平台） */
  B.landable = (L, x, y, w, h = 8) => {
    if (L.rectHitsSolid(x, y, w, h)) return true;
    const cx0 = Math.floor(x / 32), cx1 = Math.floor((x + w - 1) / 32);
    const cy0 = Math.floor(y / 32), cy1 = Math.floor((y + h - 1) / 32);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) if (L.isPlatformTile(cx, cy)) return true;
    }
    return false;
  };

  /** 逐帧抛物线模拟；dirFn(i) 给出第 i 帧的水平意向 */
  B.simulate = (p, L, dirFn, vy0) => {
    const dt = 1 / 60;
    let x = p.x, y = p.y, vx = p.vx || 0, vy = vy0 !== undefined ? vy0 : p.vy;
    for (let i = 0; i < 220; i++) {
      const dir = dirFn(i);
      if (dir) {
        const target = dir * PHYS.maxRun;
        const a = vx * dir < 0 ? PHYS.accelTurn : PHYS.accelAir;
        vx = vx < target ? Math.min(vx + a * dt, target) : Math.max(vx - a * dt, target);
      } else {
        const d = PHYS.frictionAir * dt;
        vx = Math.abs(vx) <= d ? 0 : vx - Math.sign(vx) * d;
      }
      let g = vy < 0 ? PHYS.gravityRise : PHYS.gravityFall;
      if (Math.abs(vy) < PHYS.apexSpeed) g *= PHYS.apexMul;
      vy = Math.min(vy + g * dt, PHYS.maxFall);
      x += vx * dt;
      y += vy * dt;
      if (y > L.h + 60) return { x, ok: false };
      if (vy > 0 && B.landable(L, x + 2, y + p.h, p.w - 4, 8)) return { x, ok: true };
    }
    return { x, ok: false };
  };

  B.predict = (p, L, dir) => B.simulate(p, L, () => dir);
  /** 从地面起跳、按住右 holdFrames 帧后松手 */
  B.predictJump = (p, L, holdFrames) => B.simulate(p, L, (i) => (i < holdFrames ? 1 : 0), -PHYS.jumpVel);

  /** 前方坑的右沿之后最近的落脚区间 [start, end]；前方还有地就返回 null */
  B.findJumpSpan = (p, L) => {
    const feet = p.y + p.h;
    const cy0 = Math.floor((feet - 40) / 32), cy1 = Math.floor((feet + 10) / 32);
    const land = (x) => {
      const cx = Math.floor(x / 32);
      for (let cy = cy0; cy <= cy1; cy++) {
        if (L.isSolidTile(cx, cy) || L.isPlatformTile(cx, cy)) return true;
      }
      return false;
    };
    let x = p.x + p.w + 4;
    if (land(x)) return null;
    // 跳过坑
    while (x < L.w - 8 && !land(x)) x += 4;
    if (x >= L.w - 8) return null;
    const start = x;
    while (x < L.w && land(x)) x += 4;
    return [start, x];
  };

  /** 起跳规划：从当前位置起跳，找到能落到坑对岸的「按右键帧数」 */
  B.planJump = (p, L) => {
    const span = B.findJumpSpan(p, L);
    if (!span) return null;
    let best = null;
    for (let hold = 0; hold <= 44; hold += 2) {
      const r = B.predictJump(p, L, hold);
      if (!r.ok) continue;
      if (r.x + p.w * 0.5 < span[0] || r.x > span[1] - 4) continue;
      const mid = (span[0] + span[1]) / 2 - p.w * 0.5;
      const score = Math.abs(r.x - mid);
      if (!best || score < best.score) best = { hold, score, x: r.x };
    }
    return best;
  };

  /* ---------------- 平台关策略 ---------------- */
  B.plat = (stage, p) => {
    const L = stage.level;
    const boss = stage.boss;
    const bossAlive = boss && boss.state !== 'dead';
    let wantRight = true;
    B.dropping = false;
    B.branch = bossAlive ? 'boss' : 'run';
    if (bossAlive) {
      const gunY = p.y + p.h * 0.34;
      const hh = (boss.h || 0) * 0.78;
      // Boss 命中盒只覆盖 [y-hh, y]（上半身）。平射能命中的枪口高度带：
      const bandTop = boss.y - hh + 10;
      const bandBot = boss.y - 10;

      // 站桩地面区间：只在「脚下这块连续地面」内走位，避免 Boss 漂到坑上方时踩空
      if (p.onGround) {
        const footY = p.y + p.h + 3;
        const solidAt = (x) => L.rectHitsSolid(x - 2, footY, 4, 14);
        let l = p.x + p.w / 2, r = l;
        while (l > 20 && solidAt(l - 8)) l -= 8;
        while (r < L.w - 20 && solidAt(r + 8)) r += 8;
        B.groundSpan = [l + 22, r - 22];
      }

      // 水平跟位：所有高度带都先追到 Boss 偏左 150px（俯射/仰射同样需要接近）
      const span = B.groundSpan || [-1e9, 1e9];
      const target = Math.max(span[0], Math.min(span[1], boss.x - 150));
      if (p.x < target - 50) { hold('right'); wantRight = true; }
      else if (p.x > target + 100) { hold('left'); wantRight = false; }
      else wantRight = false;

      B.branch = 'band:' + Math.round(gunY) + '/' + Math.round(bandTop) + '/' + Math.round(bandBot);
      if (gunY < bandTop - 8) {
        // 枪口高于命中带：落差大就下到更低一层再平射（射程内、几乎必中）；
        // 落差小（<120px）直接 ↓ 俯射，小角度就能扫到 Boss 上半身。
        const gap = bandTop - gunY;
        const feetY = p.y + p.h;
        let lower = null;
        if (gap > 120) {
          for (let yy = feetY + 24; yy <= feetY + 320; yy += 8) {
            if (B.landable(L, p.x + 2, yy, p.w - 4, 8)) { lower = yy; break; }
          }
        }
        if (lower !== null && p.onGround) {
          const stand = (x) => B.landable(L, x, feetY + 3, 12, 14);
          let edgeDir = 0;
          for (let d = 16; d <= 400; d += 16) {
            const lOut = !stand(p.x - d), rOut = !stand(p.x + d);
            if (lOut && rOut) { edgeDir = p.x + p.w / 2 < boss.x ? 1 : -1; break; }
            if (rOut) { edgeDir = 1; break; }
            if (lOut) { edgeDir = -1; break; }
          }
          if (!edgeDir) edgeDir = p.x + p.w / 2 < boss.x ? 1 : -1;
          // 台沿外必须真的能落到更低处，否则会被「别退进悬崖」检查拦住而原地死锁
          const landBelow = (dx) => B.landable(L, p.x + p.w / 2 + dx * 40, p.y + p.h + 8, 24, 420);
          if (!landBelow(edgeDir)) {
            if (landBelow(-edgeDir)) edgeDir = -edgeDir;
            else edgeDir = 0;
          }
          B.held.delete('left'); B.held.delete('right');
          if (edgeDir > 0) { hold('right'); wantRight = true; B.dropping = true; B.groundSpan = null; }
          else if (edgeDir < 0) { hold('left'); wantRight = false; B.dropping = true; B.groundSpan = null; }
          else { hold('down'); }
        } else {
          hold('down');
        }
      } else if (gunY > bandBot + 8) {
        hold('up');
      }

      if (B.steps % 30 === 0 && B.dbg.length < 40) {
        B.dbg.push({ t: sec(), px: Math.round(p.x), py: Math.round(p.y), gun: Math.round(gunY),
          band: [Math.round(bandTop), Math.round(bandBot)], face: p.facing,
          up: B.held.has('up'), down: B.held.has('down'), by: Math.round(boss.y), hp: Math.round(boss.hp) });
      }
    } else if (!bossAlive) {
      hold('right');
    }

    // 往左退时别退进悬崖（主动下台的 dropping 阶段是例外：就是要离开台沿）
    if (B.held.has('left') && !B.dropping) {
      const behind = B.landable(L, p.x - 12, p.y + p.h + 2, 30, 10);
      if (!behind) B.held.delete('left');
    }

    const probeX = p.x + p.w + 3;
    const wall = L.rectHitsSolid(probeX, p.y + 6, 12, p.h - 12);
    const spike = L.rectHitsSpike(p.x + p.w + 4, p.y + 10, 44, p.h - 8, 4);
    // 单向平台（碎冰/浮台）也算地，否则会误判成坑
    const groundAhead = B.landable(L, p.x + p.w + 10, p.y + p.h + 2, 44, 10);
    const pit = !groundAhead;

    // 空中计划：起跳前算好的「按右键 x 帧后松手」，按计划执行
    if (B.airPlan) {
      if (p.onGround) B.airPlan = null;
      else {
        B.held.delete('left');
        if (B.airPlan.i < B.airPlan.hold) hold('right');
        else B.held.delete('right');
        B.airPlan.i++;
        if (B.airPlan.i > 90) B.airPlan = null;
      }
    }

    if (p.onGround) {
      if (B.dropping) {
        // 正在下台阶：不跳、不做起跳规划，直接走出台沿
      } else if (wall || spike) { tap('jump'); B.jumps++; }
      else if (pit && wantRight) {
        // 用落点预测挑选跳跃力度：坑后最近的落脚点可能是水面碎冰，满速跳会飞过头
        const plan = B.planJump(p, L);
        tap('jump'); B.jumps++;
        B.airPlan = { hold: plan ? plan.hold : 40, i: 0 };
      }
    } else if (!B.dropping && wall && p.vy > -160 && p.jumpsLeft > 0) {
      tap('jump'); B.jumps++;
    } else if (!B.dropping && !B.airPlan && p.vy > 40 && p.jumpsLeft > 0) {
      // 空中救场：脚下 220px 内没有落脚点 → 二段跳（坑边/蘑菇弹飞后常见）
      const below = B.landable(L, p.x + 4, p.y + p.h + 6, p.w - 8, 220);
      if (!below) { tap('jump'); B.jumps++; }
    }

    // 空中落点修正：蘑菇弹飞/起跳后，若预测落点是坑，就横向补救（必要时二段跳买时间）
    // 这是之前「stage 2 反复掉坑」的主因：蘑菇把玩家抛到坑正上方，横向速度仍朝前。
    if (!p.onGround && !B.airPlan && p.vy > -900) {
      const curDir = B.held.has('right') ? 1 : B.held.has('left') ? -1 : 0;
      const cur = B.predict(p, L, curDir);
      if (!cur.ok) {
        const cx = p.x + p.w / 2;
        let best = null;
        for (const d of [1, -1, 0]) {
          const r = B.predict(p, L, d);
          if (r.ok && (!best || Math.abs(r.x - cx) < Math.abs(best.x - cx))) best = { x: r.x, d };
        }
        B.held.delete('left');
        B.held.delete('right');
        if (best) {
          if (best.d > 0) hold('right');
          else if (best.d < 0) hold('left');
          B.airSaves++;
          // 落点太远（还没飞到）时用二段跳延长滞空，给横向修正留时间
          if (p.jumpsLeft > 0 && p.vy > 60) { tap('jump'); B.jumps++; }
        } else {
          // 左右都救不回来：朝地图中心漂，落地至少不是坑底
          hold(p.x < L.w / 2 ? 'left' : 'right');
        }
      }
    }

    // 被墙卡住：冲刺 + 跳（Dash 能撞碎部分障碍/上台阶）
    // 注意：Boss 战里站着不动瞄 Boss 是正常策略，不能算「卡住」，否则会误冲进坑
    if (bossAlive) {
      B.stuck = 0;
    } else if (Math.abs(p.x - B.lastX) < 0.4) B.stuck++;
    else B.stuck = 0;
    B.lastX = p.x;
    if (B.stuck > 45) {
      tap('dash'); B.dashes++;
      tap('jump'); B.jumps++;
      if (B.stuck % 45 === 0) B.stuckLogs++;
      B.stuck = 0;
    }
    B.stageMaxX = Math.max(B.stageMaxX, p.x);
  };

  /* ---------------- 弹幕关策略 ---------------- */
  B.stg = (stage, p) => {
    const b = stage.boss;
    const bossAlive = b && b.state !== 'dead';
    const scroll = stage.stg.scroll;

    // 站位：Boss 左侧偏下
    const bsx = bossAlive ? b.x - scroll - 150 : 640;
    const targetX = Math.max(180, Math.min(1000, bsx));
    if (targetX - p.sx > 16) hold('right');
    else if (targetX - p.sx < -16) hold('left');

    const targetY = bossAlive ? b.y + 40 : 420;
    if (targetY - p.sy > 14) hold('down');
    else if (targetY - p.sy < -14) hold('up');

    // 局部闪避：150px 内正在接近的弹幕 → 反向微移
    const hp = p.hitPoint;
    let dvx = 0, dvy = 0, near = 0;
    const pool = stage.bullets.pool;
    for (let i = 0; i < pool.length; i++) {
      const bl = pool[i];
      if (!bl.active) continue;
      const dx = bl.x - hp.x, dy = bl.y - hp.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 150 * 150) continue;
      const d = Math.sqrt(d2) || 1;
      const closing = -(bl.vx * dx + bl.vy * dy) / d;
      if (closing > 0) {
        const w = 1 - d / 150;
        dvx -= (dx / d) * w;
        dvy -= (dy / d) * w;
        near++;
      }
    }
    if (Math.abs(dvx) > 0.35) hold(dvx > 0 ? 'right' : 'left');
    if (Math.abs(dvy) > 0.35) hold(dvy > 0 ? 'down' : 'up');
    B.nearBullets = near;
  };

  /* ---------------- 每帧决策 ---------------- */
  B.decide = () => {
    B.pressed.clear();
    B.held.clear();
    const st = g.state;

    if (st === 'ending' || (g.dialogue && g.dialogue.active)) {
      B.pressed.add('confirm');
      return;
    }
    if (st === 'gameover') {
      if (B.retries < B.maxRetries) {
        B.retries++;
        B.gameovers++;
        g._retryStage();
      } else {
        B.stop = true;
      }
      return;
    }
    if (st !== 'play' || !g.stage) return;

    const stage = g.stage;
    const p = stage.player;
    if (!p || !p.alive) return;

    if (!p.__simWrapped) {
      p.__simWrapped = true;
      const od = p.die.bind(p);
      const oh = p.hurt.bind(p);
      const PX = (q) => (q.x !== undefined ? q.x : q.worldX);
      const PY = (q) => (q.y !== undefined ? q.y : q.worldY);
      p.die = () => {
        B.deathReason = {
          at: sec(), x: +PX(p).toFixed(1), y: +PY(p).toFixed(1), vy: +(p.vy || 0).toFixed(1),
          invuln: +(p.invuln || 0).toFixed(2), hearts: p.hearts, lives: p.lives,
          tiles: [-2, -1, 0, 1, 2].map((dc) => {
            const cx = Math.floor((PX(p) + (p.w || 0) / 2) / 32) + dc;
            const cy = Math.floor((PY(p) + (p.h || 0)) / 32);
            const t = stage.level.tileAt ? stage.level.tileAt(cx, cy) : -1;
            return `${cx}:${t}`;
          }),
        };
        od();
      };
      p.hurt = (d) => {
        if (B.hurtLog.length < 30) {
          B.hurtLog.push({ at: sec(), x: +PX(p).toFixed(1), y: +PY(p).toFixed(1), inv: +(p.invuln || 0).toFixed(2), hearts: p.hearts });
        }
        oh(d);
      };
    }

    if (B.god) p.invuln = Math.max(p.invuln || 0, 3);

    // 统计：实际打出的子弹数 / 真正命中 Boss 的次数
    if (stage.shots && !stage.shots.__simWrapped) {
      stage.shots.__simWrapped = true;
      const of = stage.shots.fire.bind(stage.shots);
      stage.shots.fire = (...a) => { B.shotsFired++; return of(...a); };
    }
    if (stage.boss && !stage.boss.__simWrapped) {
      stage.boss.__simWrapped = true;
      const od = stage.boss.damage.bind(stage.boss);
      stage.boss.damage = (d) => { B.hitCount++; B.hitDmg += d; return od(d); };
    }

    hold('shoot');
    try {
      if (stage.mode === 'stg') B.stg(stage, p);
      else B.plat(stage, p);
    } catch (e) { B.lastErr = String((e && e.stack) || e).slice(0, 400); }

    // 符卡：只当保命炸弹用（残血才放）。无脑放会把 POWER 烧到 Lv1，直接把 Boss 战 DPS 打没
    if (B.casts < B.maxCast && !B.god && p.hearts <= 1 && p.canCast && p.canCast() && B.steps % 30 === 0) {
      tap('cast');
      B.casts++;
    }
  };

  /* ---------------- 帧后检查 ---------------- */
  B.after = () => {
    const st = g.state;
    if (st !== B.prevState) {
      B.events.push({ at: sec(), kind: 'state', from: B.prevState, to: st, lv: g.levelIndex });
      B.prevState = st;
      if (st === 'menu' && B.steps > 200) B.stop = true;
      // 重试次数用尽还停在 gameover：直接收敛，别空转烧步数
      if (st === 'gameover' && B.retries >= B.maxRetries) B.stop = true;
    }

    const s = g.stage;
    if (s && s !== B.prevStage) {
      B.prevStage = s;
      B.stageMaxX = 0;
      B.stuck = 0;
      B.bossHpMark = null;
      B.bossStallT = 0;
      B.stageStartStep = B.steps;
      B.deathReason = null;
      B.hurtLog = [];
      B.deathTrace = null;
      B.stages.push({
        i: s.index, name: s.level.name, mode: s.mode,
        at: sec(), startedStep: B.steps,
      });
      B.events.push({ at: sec(), kind: 'stage-start', name: s.level.name, mode: s.mode });
    }

    if (s) {
      const tp = s.player;
      if (tp) {
        const tx = tp.x !== undefined ? tp.x : tp.worldX;
        const ty = tp.y !== undefined ? tp.y : tp.worldY;
        B.trace.push([
          +tx.toFixed(1), +ty.toFixed(1), +(tp.vy || 0).toFixed(1),
          tp.onGround ? 1 : 0, s.state,
          s.boss ? Math.round(s.boss.hp) : -1,
        ]);
        if (B.trace.length > 300) B.trace.shift();
      }
      if (B.prevStageState !== s.state) {
        B.prevStageState = s.state;
        if (s.state === 'dead' && !B.deathTrace) B.deathTrace = B.trace.slice();
        if (s.state === 'dead') {
          B.deaths++;
          // 死亡位点聚类：同一处连续死 3 次 → 认定为「机器人过不去的地形」，下次复活后跳过
          const spot = Math.round((s.player.x !== undefined ? s.player.x : s.player.worldX) / 80);
          B.deathSpots.push(spot);
          if (B.deathSpots.length > 6) B.deathSpots.shift();
          const tail = B.deathSpots.slice(-2);
          if (tail.length === 2 && tail[0] === tail[1]) B.pendingRescue = true;
        }
        B.events.push({ at: sec(), kind: 'stage-state', state: s.state });
      }

      // 救援：同一处连续死亡 3 次后，复活时向前传送到最近的落脚点（只用于保证测试覆盖）
      if (B.pendingRescue && s.state === 'play' && s.player && s.mode === 'platform') {
        const p2 = s.player;
        let done = false;
        for (let dx = 64; dx <= 640 && !done; dx += 16) {
          const x = (p2.x !== undefined ? p2.x : p2.worldX) + dx;
          for (let dy = -96; dy <= 96 && !done; dy += 32) {
            const y = (p2.y !== undefined ? p2.y : p2.worldY) + dy;
            if (y < 0 || y > s.level.h - 96) continue;
            // ① 身体盒不能与实心块重叠。旧版这里用 landable 反判（要求身体区「有实心」），
            //    会把玩家直接传送进实心块：py 恒定、vx=vy=0、四向被碰撞夹死（面5 col984 py=776 即此 bug）
            if (s.level.rectHitsSolid(x + 2, y, p2.w - 4, p2.h - 2)) continue;
            // ② 脚下 12px 内要有可站立面（实心或单向平台），否则传送后直接坠落
            if (!B.landable(s.level, x + 4, y + p2.h, p2.w - 8, 12)) continue;
            p2.x = x;
            p2.y = y;
            p2.vx = 0;
            p2.vy = 0;
            p2.invuln = Math.max(p2.invuln || 0, 1.5);
            done = true;
            B.rescues++;
            B.pendingRescue = false;
            B.deathSpots = [];
            B.events.push({ at: sec(), kind: 'rescue-skip', x: Math.round(x), y: Math.round(y) });
          }
        }
        if (!done && B.steps % 30 === 0) B.pendingRescue = false;
      }
      const bl = s.bullets;
      if (bl) {
        let n = 0;
        const pool = bl.pool;
        for (let i = 0; i < pool.length; i++) if (pool[i].active) n++;
        if (n > B.maxBullets) B.maxBullets = n;
      }

      // Boss 掉血停滞（卡住/无敌/相位卡死）
      if (s.boss && s.boss.state !== 'dead' && s.state === 'boss') {
        const hp = s.boss.hp;
        if (B.bossHpMark === null || hp < B.bossHpMark) {
          B.bossHpMark = hp;
          B.bossStallT = 0;
        } else {
          B.bossStallT++;
          if (B.bossStallT > 2400 && B.bossStallLogs < 6) {
            B.bossStallLogs++;
            B.events.push({ at: sec(), kind: 'boss-hp-stall', hp: Math.round(hp), phase: s.boss.spellIdx, bossState: s.boss.state });
            B.bossStallT = 0;
          }
        }
      }
    }

    // NaN / 非法坐标
    const p = s && s.player;
    if (p) {
      const x = p.x !== undefined ? p.x : p.sx;
      const y = p.y !== undefined ? p.y : p.sy;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(p.power)) {
        if (B.errors.length < 8) B.errors.push('NaN player at step ' + B.steps + ' x=' + x + ' y=' + y + ' power=' + p.power);
        B.stop = true;
      }
    }

    // 平台关卡死（活着但 x 长时间不动）
    if (s && s.mode === 'platform' && g.state === 'play' && p && p.alive) {
      if (B.steps - B.stageStartStep > 300 && Math.abs(p.x - (B.lastX || 0)) < 0.001 && B.stuckLogs < 6) {
        // 仅在真正无法前进时记录；跳跃抖动会重置 lastX
      }
    }
  };

  /* ---------------- 推进 ---------------- */
  B.run = (n) => {
    for (let i = 0; i < n && !B.stop; i++) {
      B.decide();
      try {
        g.update(1 / 60);
      } catch (e) {
        B.errors.push(String((e && e.stack) || e));
        B.stop = true;
        break;
      }
      B.after();
      B.steps++;
    }
    return B.snapshot();
  };

  B.snapshot = () => {
    const s = g.stage;
    let bullets = 0;
    if (s && s.bullets) {
      const pool = s.bullets.pool;
      for (let i = 0; i < pool.length; i++) if (pool[i].active) bullets++;
    }
    return {
      state: g.state,
      levelIndex: g.levelIndex,
      inExtra: !!g.inExtra,
      steps: B.steps,
      simSec: sec(),
      deaths: B.deaths,
      gameovers: B.gameovers,
      retries: B.retries,
      casts: B.casts,
      shotsFired: B.shotsFired,
      hitCount: B.hitCount,
      hitDmg: Math.round(B.hitDmg),
      jumps: B.jumps,
      dashes: B.dashes,
      airSaves: B.airSaves,
      rescues: B.rescues,
      maxBullets: B.maxBullets,
      stuckLogs: B.stuckLogs,
      errors: B.errors.slice(0, 8),
      deathTrace: B.deathTrace && B.deathTrace.slice(-60),
      deathReason: B.deathReason,
      hurtLog: B.hurtLog,
      stages: B.stages,
      dbg: B.dbg.slice(0, 40),
      events: B.events.slice(-60),
      stage: s ? {
        name: s.level.name,
        mode: s.mode,
        state: s.state,
        t: +s.t.toFixed(1),
        px: +((s.player.x !== undefined ? s.player.x : s.player.worldX) || 0).toFixed(1),
        py: +((s.player.y !== undefined ? s.player.y : s.player.worldY) || 0).toFixed(1),
        sx: s.player.sx !== undefined ? +s.player.sx.toFixed(1) : null,
        sy: s.player.sy !== undefined ? +s.player.sy.toFixed(1) : null,
        power: Math.round(s.player.power || 0),
        lives: s.player.lives,
        hearts: s.player.hearts,
        invuln: s.player.invuln !== undefined ? +s.player.invuln.toFixed(2) : null,
        stageMaxX: +B.stageMaxX.toFixed(1),
        goalX: s.goalX ? +s.goalX.toFixed(1) : 0,
        levelW: s.level.w,
        boss: s.boss ? {
          state: s.boss.state,
          hp: Math.round(s.boss.hp),
          maxHp: Math.round(s.boss.maxHp),
          spellIdx: s.boss.spellIdx,
          w: Math.round(s.boss.w),
          h: Math.round(s.boss.h),
          hw: Math.round(s.boss.w * 0.46),
          hh: Math.round(s.boss.h * 0.78),
          x: +s.boss.x.toFixed(1),
          y: +s.boss.y.toFixed(1),
        } : null,
        bullets,
      } : null,
    };
  };

  return B;
}
