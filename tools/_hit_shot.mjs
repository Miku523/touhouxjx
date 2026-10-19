/**
 * 判定点实测截图：平台关 / 飞行关，按住 Shift 后裁出角色 + 判定点特写。
 * 用法: node tools/_hit_shot.mjs [prefix]
 */
import { launch } from './_pt_core.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const PREFIX = process.argv[2] || 'before';
const DIR = '_hit';
mkdirSync(DIR, { recursive: true });

const T = await launch({ port: 9413, width: 1280, height: 720, deviceScaleFactor: 1 });
try {
  await T.boot();
  const out = await T.eval(`(async () => {
    const g = window.__game;
    g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false;
    g.showTitle(); g.startGame();
    const step = (n = 1) => { for (let i = 0; i < n; i++) g.update(1 / 60); };
    // 游戏逻辑坐标是 1280x720，canvas backing store 会至少 1.5x 超采样，裁图时要换算
    const K = document.querySelector('canvas').width / 1280;
    const crop = (cxLog, cyLog, w, h, scale) => {
      const cv = document.querySelector('canvas');
      const cx = cxLog * K, cy = cyLog * K;
      const x = Math.max(0, Math.round(cx - w / 2));
      const y = Math.max(0, Math.round(cy - h / 2));
      const off = document.createElement('canvas');
      off.width = Math.round(w * scale); off.height = Math.round(h * scale);
      const c = off.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(cv, x, y, w, h, 0, 0, off.width, off.height);
      return { url: off.toDataURL('image/png'), sx: x, sy: y, w, h };
    };
    const res = { canvas: { w: document.querySelector('canvas').width, h: document.querySelector('canvas').height } };
    // 等 AI 立绘加载完，否则会画到 procedural fallback（锚点不同，量出来的位置是错的）
    const gen = await import('/src/art/genchars.js');
    let aiWait = 0;
    while (!gen.genCharReady('reimu') && aiWait < 8000) {
      await new Promise((r) => setTimeout(r, 100));
      aiWait += 100;
    }
    res.aiReady = gen.genCharReady('reimu');
    // 调试十字：青=判定圆心，绿=角色脚底锚点
    const cross = (lx, ly, color) => {
      const ctx = document.querySelector('canvas').getContext('2d');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 渲染器留下的 scale 变换要清掉，否则十字画到画布外
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo((lx - 10) * K, ly * K); ctx.lineTo((lx + 10) * K, ly * K);
      ctx.moveTo(lx * K, (ly - 10) * K); ctx.lineTo(lx * K, (ly + 10) * K);
      ctx.stroke();
      ctx.restore();
    };

    // ---------- 平台关 ----------
    g.showTitle();
    g.startStage(0, { skipIntro: true });
    const p = g.stage.player;
    p.invuln = 9;
    g.input._set('fast', true);
    g.input._set('right', false);
    step(24);
    g.render(1);
    const camX = g.stage.camera.x;
    const feet = p.y + p.h;
    const hp = g.stage.playerHitPoint;
    res.platform = {
      w: p.w, h: p.h, y: p.y, feet, hitY: hp.y, hitR: hp.r,
      screenX: p.x + p.w / 2 - camX, screenY: hp.y,
      offsetAboveFeet: +(feet - hp.y).toFixed(2),
      visualH: 104,
      visualCenterY: +(feet - 104 / 2).toFixed(2),
      hitVsCenter: +(hp.y - (feet - 104 / 2)).toFixed(2),
    };
    cross(res.platform.screenX, res.platform.hitY, '#00ffff');
    cross(res.platform.screenX, feet, '#66ff66');
    res.platform.crop = crop(res.platform.screenX, (res.platform.visualCenterY + feet) / 2, 200, 260, 3);

    // ---------- 飞行关 ----------
    g.input._set('fast', false);
    g.showTitle();
    g.startStage(3, { skipIntro: true });
    const s = g.stage;
    const sp = s.player;
    sp.invuln = 9;
    g.input._set('fast', true);
    step(24);
    g.render(1);
    const flyH = 104 * 0.86;
    const bob = Math.sin(sp.animTime * 2.6) * 2.5;
    const shp = s.playerHitPoint;
    res.stg = {
      mode: s.mode, sx: sp.sx, sy: sp.sy,
      hitY: shp.y, hitR: shp.r,
      anchorY: sp.sy + 38,
      visualH: +flyH.toFixed(2),
      visualCenterY: +(sp.sy + 38 - flyH / 2).toFixed(2),
      hitVsCenter: +(shp.y - (sp.sy + 38 - flyH / 2)).toFixed(2),
      bob,
    };
    cross(sp.sx, shp.y, '#00ffff');
    cross(sp.sx, sp.sy + 38, '#66ff66');
    cross(sp.sx, sp.sy, '#ff66ff');
    res.stg.crop = crop(sp.sx, sp.sy + 38 - flyH / 2 + bob, 200, 260, 3);
    return res;
  })()`);

  for (const mode of ['platform', 'stg']) {
    const c = out[mode].crop;
    writeFileSync(`${DIR}/${PREFIX}_${mode}.png`, Buffer.from(c.url.split(',')[1], 'base64'));
    delete out[mode].crop;
  }
  writeFileSync(`${DIR}/${PREFIX}_metrics.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log('errors:', T.errors, 'warns:', T.warns);
} finally {
  await T.close();
}
