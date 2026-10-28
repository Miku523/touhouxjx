// 首绘兜底的独立目视验收：把真实 index.html 里的 4 个样式表 <link> 和 css-ready 脚本剥掉，
// 只剩内联兜底 → 截图。等价于「样式表还在路上」的那几百毫秒。
import { launch, sleep, BASE } from './_pt_core.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const OUT = '_pt/ab';
mkdirSync(OUT, { recursive: true });

// 从真实 index.html 派生（不手抄，保证测的就是线上的那段）
let html = readFileSync('index.html', 'utf8');
html = html.replace(/\s*<link rel="stylesheet"[^>]*>/g, '');
html = html.replace(/<script>\s*\(function \(\) \{\s*var pending = 4;[\s\S]*?<\/script>/, '<script>/* 兜底测试：不挂 css-ready */</script>');
writeFileSync(OUT + '/fallback_harness.html', html, 'utf8');
console.log('harness bytes', html.length, 'css links left', (html.match(/rel="stylesheet"/g) || []).length);

const T = await launch({ port: 9436, width: 1280, height: 720 });
await T.nav(BASE + '/_pt/ab/fallback_harness.html?nosw=1');
await sleep(600);
await T.shot(`${OUT}/fallback_1280.png`);
const desk = JSON.parse(await T.eval(`(() => {
  const g = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };
  return JSON.stringify({
    cssReady: document.documentElement.classList.contains('css-ready'),
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    boot: g('#boot'), logo: g('#boot .boot-logo'), meter: g('#boot .boot-meter'), fill: g('#boot .bm-fill'),
    logoFont: getComputedStyle(document.querySelector('#boot .boot-logo')).fontSize,
    overlay: getComputedStyle(document.getElementById('overlay')).display,
    hiddenCount: [...document.querySelectorAll('#ui > *')].filter((e) => e.id !== 'boot' && getComputedStyle(e).display !== 'none').length,
  });
})()`));
console.log('DESKTOP:', JSON.stringify(desk));

// 手机竖屏形态
await T.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await T.nav(BASE + '/_pt/ab/fallback_harness.html?nosw=1');
await sleep(500);
await T.shot(`${OUT}/fallback_390x844.png`);
const mob = JSON.parse(await T.eval(`(() => {
  const g = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  return JSON.stringify({ boot: g('#boot'), logo: g('#boot .boot-logo'), meter: g('#boot .boot-meter'),
    logoFont: getComputedStyle(document.querySelector('#boot .boot-logo')).fontSize,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 });
})()`));
console.log('MOBILE:', JSON.stringify(mob));
writeFileSync(`${OUT}/fallback_harness.json`, JSON.stringify({ desk, mob }, null, 1));
await T.close();
