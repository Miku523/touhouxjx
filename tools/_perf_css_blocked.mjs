/**
 * 验证「只有内联 critical CSS、主样式表完全不可用」时的标题页外观。
 *
 * 目的：1.6.49 把揭幕门从 style.css 改成内联 critical CSS 后，
 * 必须保证 style.css 还没到（甚至永远不到）时标题页依然排版正确 —— 否则就退回 1.6.41
 * 那次「紫屏 + 裸 DOM」的事故。
 *
 * 做法：CDP 直接 block 掉所有 *style.css* / mobile.css / platform.css 请求，
 * 走完整启动流程，等菜单状态，截图 + 报告 __hksBootState。
 *
 * 用法：node tools/_perf_css_blocked.mjs [--w=1280] [--h=720] [--tag=blocked]
 */
import fs from 'node:fs';
import { launch, sleep } from './_pt_core.mjs';

const arg = (k, d) => {
  const m = process.argv.find((a) => a.startsWith('--' + k + '='));
  return m ? m.split('=')[1] : d;
};
const W = Number(arg('w', 1280));
const H = Number(arg('h', 720));
const TAG = arg('tag', 'blocked');

(async () => {
  const T = await launch({ port: 9610 + Math.floor(Math.random() * 40), width: W, height: H, headless: true });
  try {
    await T.send('Network.enable');
    if (arg('block', 'yes') !== 'no') {
      await T.send('Network.setBlockedURLs', {
        urls: ['*style.css*', '*mobile.css*', '*platform.css*', '*title-intro.css*']
      });
    }
    await T.send('Page.navigate', { url: 'http://127.0.0.1:8138/index.html' });
    // 等启动幕揭幕（_bootDone）
    let ok = false;
    for (let i = 0; i < 120; i++) {
      const done = await T.eval('!!(window.__game && window.__game._bootDone)').catch(() => false);
      if (done) { ok = true; break; }
      await sleep(250);
    }
    await sleep(1200); // 等开屏滑入动画走完
    const st = await T.eval(`(() => {
      const b = window.__hksBootState ? window.__hksBootState() : null;
      const ov = document.getElementById('overlay');
      const panel = ov && ov.querySelector('.panel');
      const btn = document.querySelector('#buttons .btn');
      const rect = (el) => el ? ((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) : null;
      const cs = btn ? getComputedStyle(btn) : null;
      return {
        bootDone: !!(window.__game && window.__game._bootDone),
        state: window.__game && window.__game.state,
        boot: b,
        overlayRect: rect(ov),
        panelRect: rect(panel),
        btnRect: rect(btn),
        btnFont: cs ? cs.fontSize : null,
        btnBorder: cs ? cs.borderTopWidth : null,
        htmlClass: document.documentElement.className,
        docScrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth
      };
    })()`);
    fs.mkdirSync('_perf', { recursive: true });
    await T.shot(`_perf/title_${TAG}_${W}x${H}.png`);
    const rep = await T.report().catch(() => null);
    console.log(JSON.stringify({
      tag: TAG, viewport: `${W}x${H}`,
      bootDone: ok,
      cssReady: st?.boot?.cssReady,
      styleOk: st?.boot?.css?.styleOk,
      state: st?.state,
      htmlClass: st?.htmlClass,
      overflowX: st ? st.docScrollW > st.innerW : null,
      btnFont: st?.btnFont,
      btnBorder: st?.btnBorder,
      btnRect: st?.btnRect,
      panelRect: st?.panelRect,
      errors: rep ? rep.errors.length : null,
      httpBad: rep ? rep.httpBad.length : null
    }, null, 2));
  } finally {
    await T.close();
  }
})();
