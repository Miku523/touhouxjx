import { launch, sleep } from './_pt_core.mjs';
const out = [];
for (const cfg of [{ n: '900', w: 900, h: 600, d: 1 }, { n: '1600', w: 1600, h: 900, d: 1 }]) {
  const T = await launch({ port: 9619, headless: true, width: cfg.w, height: cfg.h, deviceScaleFactor: cfg.d });
  await T.boot();
  await sleep(600);
  out.push(await T.eval(`(() => { const c = document.querySelector('canvas'); const ov = document.getElementById('overlay');
    return { n: ${JSON.stringify(cfg.n)}, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
      canvasAttr: [c.width, c.height], canvasCss: [c.getBoundingClientRect().width, c.getBoundingClientRect().height],
      overlayScroll: [ov.scrollWidth, ov.clientWidth, ov.scrollHeight, ov.clientHeight],
      uiCss: (() => { const u = document.getElementById('ui'); const r = u.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
      titleFont: getComputedStyle(document.querySelector('.logo, .title, h1') || document.body).fontSize };
  })()`));
  const rep = await T.report();
  out.push({ n: cfg.n, errors: rep.errors, warns: rep.warns });
  await T.close();
}
console.log(JSON.stringify(out, null, 1));
