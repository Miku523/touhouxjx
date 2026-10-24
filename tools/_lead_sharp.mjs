// 画布清晰度：不同窗口尺寸 / devicePixelRatio 下的 backing 与 canvas 尺寸
import { launch, sleep } from './_pt_core.mjs';

const cases = [
  [1600, 900, 1],
  [1600, 900, 0.8],
  [1600, 900, 1.25],
  [900, 600, 1],
  [1280, 720, 1],
];
const out = [];
for (let i = 0; i < cases.length; i++) {
  const [w, h, dsf] = cases[i];
  const T = await launch({ port: 9498 + i, headless: true, width: w, height: h, deviceScaleFactor: dsf });
  try {
    await T.boot({ query: '?v=sharp' + Date.now(), waitTitle: 15000 });
    await T.tap('Enter'); await sleep(300);
    const r = await T.eval(`({
      dpr: window.devicePixelRatio,
      iw: window.innerWidth, ih: window.innerHeight,
      info: window.__rendererInfo,
      cv: (() => { const c = document.querySelector('canvas'); return [c.width, c.height, c.style.width, c.style.height]; })(),
      s: getComputedStyle(document.documentElement).getPropertyValue('--s').trim(),
    })`);
    out.push({ case: `${w}x${h}@${dsf}`, ...r });
  } finally { await T.close().catch(() => {}); }
}
console.log(JSON.stringify(out, null, 2));
