import { launch, sleep, installFrameProbe, readFrameProbe } from './_pt_core.mjs';

const out = [];
function log(...a) { console.log(...a); }

async function startStage(T, opts) {
  // title -> difficulty -> charselect -> dialogue -> stage (真实按键)
  await T.key('Enter', 90); await sleep(700);
  if (opts.diffKey) { await T.key(opts.diffKey, 80); await sleep(300); }
  await T.key('Enter', 90); await sleep(800);
  if (opts.char) { await T.key(opts.char, 80); await sleep(300); await T.key('Enter', 90); await sleep(800); }
  await T.eval('window.__startMark = performance.now()');
  let acted = 0;
  for (let i = 0; i < 90; i++) {
    const s = await T.eval(`(() => { const g = window.__game; return { st: g.state, dlg: !!g.dialogue?.active }; })()`);
    if (s.st === 'play') break;
    await T.key('Enter', 70); acted++;
    await sleep(110);
  }
  return acted;
}

async function metrics(T, label) {
  return await T.eval(`(() => {
    const c = document.querySelector('canvas');
    const ui = document.getElementById('ui');
    const ov = document.getElementById('overlay');
    const card = ov.querySelector('.panel, .card, .menu, .btn') || ov.firstElementChild;
    const r = card ? card.getBoundingClientRect() : null;
    return { label: ${JSON.stringify(label)}, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
      canvasAttr: c ? [c.width, c.height] : null, canvasCss: c ? [c.getBoundingClientRect().width, c.getBoundingClientRect().height] : null,
      ui: ui ? [Math.round(ui.getBoundingClientRect().width), Math.round(ui.getBoundingClientRect().height)] : null,
      overlayScroll: ov ? [ov.scrollWidth, ov.clientWidth, ov.scrollHeight, ov.clientHeight] : null,
      card: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
      startMs: window.__startMark ? Math.round(performance.now() - window.__startMark) : null,
      state: window.__game.state, fps: +((window.__game.loop?.fps)||0).toFixed(1) };
  })()`);
}

for (const cfg of [
  { name: '900', w: 900, h: 600, dpr: 1 },
  { name: '1600', w: 1600, h: 900, dpr: 1 },
  { name: 'dpr2', w: 1280, h: 720, dpr: 2 },
]) {
  const T = await launch({ port: 9618, headless: true, width: cfg.w, height: cfg.h, deviceScaleFactor: cfg.dpr });
  await T.boot();
  await T.shot(`_pt/human/rs_${cfg.name}_title.png`);
  out.push(await metrics(T, cfg.name + '_title'));
  await installFrameProbe(T);
  const acted = await startStage(T, { diffKey: 'KeyE' });
  await sleep(1200);
  await T.shot(`_pt/human/rs_${cfg.name}_stage.png`);
  await sleep(300);
  out.push({ ...(await metrics(T, cfg.name + '_stage')), acted });
  // 暂停菜单在该尺寸下的可读性
  await T.key('Escape', 90); await sleep(600);
  await T.shot(`_pt/human/rs_${cfg.name}_pause.png`);
  out.push(await metrics(T, cfg.name + '_pause'));
  const probe = await readFrameProbe(T);
  const rep = await T.report();
  out.push({ label: cfg.name + '_probe', frames: probe.frames, avg: probe.avg, p95: probe.p95, worst: probe.worst, longTotal: probe.longTotal, errors: rep.errors, warns: rep.warns, netFails: rep.netFails, httpBad: rep.httpBad });
  await T.close();
  log('done', cfg.name);
}
console.log(JSON.stringify(out, null, 1));
