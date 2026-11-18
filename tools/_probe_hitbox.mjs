/**
 * 判定环（hitbox aura）视觉探针：开局进 play、focus 住，抓玩家周围一小块像素，
 * 检查环上确实有高亮像素（而不是只有背景）。
 * 用法：PT_BASE=http://127.0.0.1:8731 node tools/_probe_hitbox.mjs
 */
import { launch, sleep } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/hitbox';
mkdirSync(OUT, { recursive: true });

const out = [];
const ok = (name, pass, info) => {
  out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + JSON.stringify(info) : ''}`);
};

const T = await launch({ port: 9415 });

try {
  await T.boot();
  const booted = await (async () => {
    for (let i = 0; i < 80; i++) {
      if (await T.eval('!!window.__game?._bootDone')) return true;
      await sleep(200);
    }
    return false;
  })();
  ok('启动幕揭幕完成（_bootDone）', booted);

  // 隐藏启动幕（它会盖在画布上）
  await T.eval(`(() => {
    const b = document.getElementById('boot');
    if (b) { b.style.opacity = '0'; b.classList.add('done', 'hidden'); }
    return true;
  })()`);

  const st = await T.eval(`(async () => {
    const g = window.__game;
    g._skipTitleIntro?.();
    await g.startStage(0, { skipIntro: true });
    // 按住 slow（Shift）= focus，判定点才可见
    for (let i = 0; i < 40; i++) {
      if (g.state === 'play' && g.stage?.player) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    g.input.keys?.add?.('ShiftLeft');
    g.stage.player.focus = true;
    return {
      state: g.state,
      hp: g.stage?.playerHitPoint ? { x: g.stage.playerHitPoint.x, y: g.stage.playerHitPoint.y, r: g.stage.playerHitPoint.r } : null,
      a11yHitbox: (await import('/src/game/a11y.js')).getHitboxColor(),
      a11yContrast: (await import('/src/game/a11y.js')).getA11y().contrast,
    };
  })()`);
  ok('进入 play 且有判定点', st.state === 'play' && !!st.hp, { state: st.state, hp: st.hp });
  await sleep(500);

  // 抓画布整帧 → 截玩家周围 120×120，统计「比背景亮很多」的像素
  // 注意：canvas 的 backing store 不一定是 1280×720（可能是 960×540），判定点是逻辑坐标，须按比例换算
  const shot = await T.eval(`(() => {
    const g = window.__game;
    const c = g.renderer?.canvas || document.getElementById('game');
    const hp = g.stage?.playerHitPoint;
    if (!c || !hp) return { err: 'no canvas/hp' };
    const ctx = c.getContext('2d');
    const kx = c.width / 1280, ky = c.height / 720;
    const px = hp.x * kx, py = hp.y * ky, pr = hp.r * kx;
    const S = 120;
    const sx = Math.max(0, Math.round(px - S / 2));
    const sy = Math.max(0, Math.round(py - S / 2));
    const img = ctx.getImageData(sx, sy, S, S);
    const d = img.data;
    const cx = Math.round(px) - sx;
    const cy = Math.round(py) - sy;
    let bright = 0, ringHit = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        if (lum > 170) bright++;
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lum > 120 && Math.abs(dist - pr * 2.1) < 2.5) ringHit++;
      }
    }
    return { sx, sy, cx, cy, r: hp.r, pr: +pr.toFixed(2), kx, bright, ringHit, w: c.width, h: c.height, png: c.toDataURL('image/png'), tight: (() => {
      // 紧裁 64×64 ×8：必须在同一次采样里做，分两次 eval 中间 focus 会复位、环就没了
      const S2 = 64, Z = 8;
      const o = document.createElement('canvas');
      o.width = S2 * Z; o.height = S2 * Z;
      const oc = o.getContext('2d');
      oc.imageSmoothingEnabled = false;
      oc.drawImage(c, Math.max(0, Math.round(px - S2 / 2)), Math.max(0, Math.round(py - S2 / 2)), S2, S2, 0, 0, S2 * Z, S2 * Z);
      return o.toDataURL('image/png');
    })() };
  })()`);

  if (shot.err) ok('抓到画布数据', false, shot);
  else {
    ok('抓到画布数据', true, { w: shot.w, h: shot.h, r: shot.r });
    ok('判定点周围有高亮像素（环可见）', shot.bright > 8 && shot.ringHit > 3, {
      bright: shot.bright,
      ringHit: shot.ringHit,
      ringR: +(shot.r * 2.1).toFixed(1),
    });
    if (shot.png) {
      writeFileSync(`${OUT}/aura-default.png`, Buffer.from(shot.png.split(',')[1], 'base64'));
      const crop = await T.eval(`(() => {
        const g = window.__game;
        const c = g.renderer?.canvas || document.getElementById('game');
        const hp = g.stage?.playerHitPoint;
        const S = 160;
        const kx = c.width / 1280, ky = c.height / 720;
        const sx = Math.max(0, Math.round(hp.x * kx - S / 2));
        const sy = Math.max(0, Math.round(hp.y * ky - S / 2));
        const o = document.createElement('canvas');
        o.width = S * 3; o.height = S * 3;
        const oc = o.getContext('2d');
        oc.imageSmoothingEnabled = false;
        oc.drawImage(c, sx, sy, S, S, 0, 0, S * 3, S * 3);
        return o.toDataURL('image/png');
      })()`);
      if (crop) writeFileSync(`${OUT}/aura-zoom.png`, Buffer.from(crop.split(',')[1], 'base64'));
      if (shot.tight) writeFileSync(`${OUT}/aura-tight.png`, Buffer.from(shot.tight.split(',')[1], 'base64'));
    }
  }

  // 高对比模式：环应该变白
  const contrast = await T.eval(`(async () => {
    const a = await import('/src/game/a11y.js');
    a.setA11y({ contrast: true });
    await new Promise((r) => setTimeout(r, 300));
    const g = window.__game;
    const hp = g.stage?.playerHitPoint;
    return { color: a.getHitboxColor(), contrast: a.getA11y().contrast, hp: !!hp };
  })()`);
  ok('高对比模式下环色变白', contrast.contrast === true && contrast.color === '#ffffff', contrast);

  const rep = await T.report();
  ok('无 console error', rep.errors.length === 0, rep.errors.slice(0, 4));
  ok('无 4xx/5xx', rep.httpBad.filter((u) => !/favicon/.test(u)).length === 0, rep.httpBad.slice(0, 4));
} catch (e) {
  out.push('FAIL  探针异常  — ' + (e && e.message ? e.message.slice(0, 300) : String(e)));
} finally {
  console.log(out.join('\n'));
  console.log(
    `\n共 ${out.length} 项：PASS ${out.filter((l) => l.startsWith('PASS')).length} / FAIL ${out.filter((l) => l.startsWith('FAIL')).length}`
  );
  await T.close();
}
