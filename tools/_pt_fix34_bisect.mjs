/**
 * 首次打开「选择难度」页 ~130ms 长任务二分归因。
 * 每个变体都用全新浏览器进程（保证冷缓存/冷样式），注入覆盖 CSS 后真实按 Enter 打开难度页。
 *   node tools/_pt_fix34_bisect.mjs [--gpu 1]
 */
import { launchCfg, saveJson, sleep } from './_pt_perf_lib.mjs';

const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  if (eq > 0) { argv[a.slice(2, eq)] = a.slice(eq + 1); continue; }
  const key = a.slice(2);
  if (i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--')) argv[key] = process.argv[++i];
  else argv[key] = '1';
}
const gpu = argv.gpu !== '0' && argv.gpu !== 'false';
const outFile = argv.out || `_pt/fix34/bisect-${gpu ? 'gpu' : 'soft'}.json`;

const VARIANTS = {
  control: '',
  no_scene_filter: '.ov-bg-img{filter:none!important}',
  no_grain: '.ov-bg-grain{display:none!important}',
  no_motes: '.ov-bg-motes{display:none!important}',
  no_anim: '.ov-bg-img{animation:none!important}',
  no_img: '.ov-bg-img{background-image:none!important}',
  bare_bg: '.ov-bg-img,.ov-bg-grain,.ov-bg-motes,.ov-bg-vignette{display:none!important}',
  no_backdrop: '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
};

const rec = { generatedAt: new Date().toISOString(), gpu, variants: {} };
for (const [name, css] of Object.entries(VARIANTS)) {
  const T = await launchCfg({ gpu, width: 1280, height: 720, dsf: 1 });
  try {
    await T.boot();
    await sleep(250);
    if (css) {
      await T.eval(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return 1; })()`);
    }
    await T.eval(`(() => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {} return 1; })()`);
    await T.key('Enter');
    await sleep(1200);
    const r = await T.eval(`(() => ({ long: (window.__long || []).slice(), screen: !!document.querySelector('.overlay.screen-mode'), scene: document.querySelector('.overlay')?.getAttribute('data-scene') || null }))()`);
    r.errors = T.errors.slice(0, 3);
    rec.variants[name] = r;
    console.log(`[bisect] ${name}: long=${JSON.stringify(r.long)} scene=${r.scene} screen=${r.screen}`);
  } catch (e) {
    rec.variants[name] = { error: String((e && e.message) || e).slice(0, 300) };
    console.log(`[bisect] ${name}: ERROR ${rec.variants[name].error}`);
  } finally {
    await T.close().catch(() => {});
  }
}
saveJson(outFile, rec);
console.log('[bisect] wrote', outFile);
