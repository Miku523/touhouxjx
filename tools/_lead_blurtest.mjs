import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9436, headless: true });
await T.boot({ query: '?v=blurtest' + Date.now(), waitTitle: 15000 });
const r = await T.eval(`(async () => {
  const mk = (useFilter, useShadow, shapes) => {
    const cv = document.createElement('canvas'); cv.width = 1440; cv.height = 720;
    const c = cv.getContext('2d');
    if (useFilter) c.filter = 'blur(4px)';
    if (useShadow) { c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 12; }
    c.strokeStyle = '#2b3a2b'; c.lineWidth = 6;
    for (let i = 0; i < shapes; i++) {
      c.beginPath();
      c.moveTo((i * 37) % 1440, 720);
      c.bezierCurveTo((i * 91) % 1440, 400, (i * 53) % 1440, 200, (i * 71) % 1440, 0);
      c.stroke();
    }
    return cv;
  };
  const time = async (cv) => { const t0 = performance.now(); const bmp = await createImageBitmap(cv); const ms = performance.now() - t0; return { ms: Math.round(ms), w: bmp.width }; };
  const out = {};
  out.plain20 = await time(mk(false, false, 20));
  out.blur20 = await time(mk(true, false, 20));
  out.blurShadow20 = await time(mk(true, true, 20));
  out.blankBlur = await time(mk(true, false, 0));
  return out;
})()`);
console.log(JSON.stringify(r, null, 2));
await T.close();
