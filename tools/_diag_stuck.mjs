/**
 * 复现「进第一关卡住」：进关后每 500ms 采样一次状态，6 秒后截图。
 * 用法：node tools/_diag_stuck.mjs [--url=http://127.0.0.1:8138/index.html] [--tag=local]
 */
import { launch, sleep } from './_pt_core.mjs';

const arg = (k, d) => {
  const m = process.argv.find((a) => a.startsWith('--' + k + '='));
  return m ? m.split('=')[1] : d;
};
const URL = arg('url', 'http://127.0.0.1:8138/index.html');
const TAG = arg('tag', 'local');

const SNAP = `JSON.stringify((() => {
  const g = window.__game;
  if (!g) return { game: false };
  const st = g.stage;
  const bi = st && st.bg && st.bg.img;
  return {
    state: g.state,
    hasStage: !!st,
    stageCtor: st && st.constructor && st.constructor.name,
    paused: g.paused,
    bootDone: g._bootDone,
    kitLoadEl: !!document.getElementById('kitLoad'),
    kitLoadDisplay: (() => { const e = document.getElementById('kitLoad'); return e ? getComputedStyle(e).display : null; })(),
    hudVisible: g.hudEl ? getComputedStyle(g.hudEl).display !== 'none' && getComputedStyle(g.hudEl).visibility !== 'hidden' : null,
    player: st && st.player ? { x: Math.round(st.player.x), y: Math.round(st.player.y), hp: st.player.hp, iframes: st.player.iframes } : null,
    bullets: st && st.bullets && st.bullets.list ? st.bullets.list.length : null,
    enemies: st && st.enemies && st.enemies.list ? st.enemies.list.length : null,
    bg: bi ? { w: bi.naturalWidth, h: bi.naturalHeight, complete: bi.complete } : null,
    lq: (() => { try { return g.stage?._bgEntry ? null : null; } catch (e) { return 'err'; } })(),
    loopRunning: typeof g._loop !== "undefined" ? !!g._loop : null,
    stageStarted: st ? !!st._started : null,
    bgTier: st && st.bg ? st.bg.tier : null,
    powerStr: g.hud ? (g.hud._powerText || null) : null,
    audioCtx: g.audio ? g.audio.ctxState || (g.audio.ctx && g.audio.ctx.state) : null,
    currentSong: g.audio ? g.audio.currentSong : null,
    hb: window.__hb, hbAgo: window.__hbAt ? (Date.now() - window.__hbAt) : null,
    errors: (window.__hksErrors || []).slice(-3)
  };
})())`;

(async () => {
  const T = await launch({ port: 9700 + Math.floor(Math.random() * 60), headless: true, width: 1280, height: 720 });
  try {
    if (arg('throttle', 'no') !== 'no') {
      await T.send('Network.enable');
      await T.send('Network.emulateNetworkConditions', {
        offline: false, latency: 400, downloadThroughput: 15360, uploadThroughput: 15360,
        connectionType: 'cellular3g'
      });
      console.log('已开启弱网限速 15KB/s + RTT400ms');
    }
    const blocks = (arg('block', '') || '').split(',').filter(Boolean);
    if (blocks.length) {
      await T.send('Network.enable');
      await T.send('Network.setBlockedURLs', { urls: blocks.map((b) => '*' + b + '*') });
      console.log('已阻断:', blocks.join(', '));
    }
    await T.send('Page.navigate', { url: URL });
    // 心跳：主线程活着就会每 100ms 自增。卡死时能从最后一次心跳时间看出冻结点
    for (let i = 0; i < 30; i++) {
      const ok = await T.eval('document.readyState').catch(() => null);
      if (ok) break;
      await sleep(300);
    }
    await T.eval('window.__hb=0;window.__hbAt=0;setInterval(function(){window.__hb++;window.__hbAt=Date.now();},100);1').catch(() => {});
    // 等揭幕
    for (let i = 0; i < 240; i++) {
      await sleep(1000);
      const ok = await T.eval('!!(window.__game && window.__game._bootDone)').catch(() => false);
      if (ok) { console.log('揭幕完成 @' + i + 's'); break; }
    }
    await sleep(1200);
    // 进关：直接调 startStage(0)
    let r = null;
    try {
      r = await T.eval('window.__game.startStage(0).then(() => "ok").catch(e => "err:" + e.message)');
    } catch (e) {
      console.log('startStage 求值超时（主线程可能卡死）:', e.message);
      r = 'timeout';
    }
    console.log('startStage ->', r, 'hb=', await T.eval('window.__hb').catch(() => 'N/A'));
    // 推开场对白：Enter 连按到 state 变 play（最多 60 次）
    for (let i = 0; i < 60; i++) {
      const st = await T.eval('window.__game.state').catch(() => '?');
      if (st === 'play') { console.log('已进入 play @' + i); break; }
      await T.key('Enter');
      await sleep(220);
    }
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      const raw = await T.eval(SNAP).catch(() => null);
      const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      console.log(`+${(i + 1) * 0.5}s`, JSON.stringify(o));
    }
    await T.shot(`_perf/stuck_${TAG}.png`);
    const rep = await T.report();
    console.log('errors:', JSON.stringify(rep.errors.slice(0, 5)));
    console.log('netFails:', JSON.stringify((rep.netFails || []).slice(0, 5)));
    console.log('httpBad:', JSON.stringify((rep.httpBad || []).slice(0, 5)));
  } finally {
    await T.close();
  }
})();
