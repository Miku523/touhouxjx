// 小窗口 / DPR 下的暂停菜单与画布尺寸检查（对应玩家报告 P2-1 / P2-2 / P2-6）。
import { launch, sleep } from './_pt_core.mjs';

async function runOne({ port, width, height, dpr, tag }) {
  const T = await launch({ port, headless: true, width, height, deviceScaleFactor: dpr });
  try {
    await T.boot({ query: '?v=rs' + tag + Date.now(), waitTitle: 15000 });
    await T.tap('Enter'); await sleep(350);
    await T.tap('KeyN'); await sleep(250);
    await T.tap('Digit1'); await sleep(350);
    for (let i = 0; i < 60; i++) {
      const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
      if (s.s === 'play' && !s.d) break;
      await T.tap('Enter'); await sleep(130);
    }
    await sleep(500);
    const play = await T.eval(`(() => {
      const cv = document.querySelector('canvas');
      const hud = document.querySelector('.hud, #hud');
      const fs = hud ? getComputedStyle(hud).fontSize : null;
      return {
        dpr: window.devicePixelRatio,
        canvas: cv ? { w: cv.width, h: cv.height, cssW: cv.clientWidth, cssH: cv.clientHeight,
          styleW: getComputedStyle(cv).width, styleH: getComputedStyle(cv).height } : null,
        hudFont: fs, innerW: innerWidth, innerH: innerHeight,
      };
    })()`);
    await T.tap('Escape'); await sleep(400);
    const pause = await T.eval(`(() => {
      const root = document.querySelector('.overlay.active, #overlay .panel, .menu-panel') || document.body;
      const labels = [...document.querySelectorAll('button,.k, .menu-item, .btn')].map(b => (b.textContent || '').trim()).filter(Boolean);
      const foot = [...document.querySelectorAll('.menu-foot, .overlay-foot, .hint, .foot')].map(b => (b.textContent || '').trim()).filter(Boolean);
      return { labels, foot, state: window.__game.state, scrollH: document.body.scrollHeight, innerH: innerHeight };
    })()`);
    await T.shot(`_pt/lead_rs/${tag}_pause.png`);
    return { play, pause };
  } finally { await T.close().catch(() => {}); }
}

const out = {};
out.normal = await runOne({ port: 9441, width: 1280, height: 720, dpr: 1, tag: 'normal' });
out.small = await runOne({ port: 9442, width: 900, height: 600, dpr: 1, tag: 'small' });
out.dpr2 = await runOne({ port: 9443, width: 1280, height: 720, dpr: 2, tag: 'dpr2' });
console.log(JSON.stringify(out, null, 1));
