import { launch, sleep } from './_pt_core.mjs';

const CFG = [
  { tag: '1280x720', w: 1280, h: 720, d: 1 },
  { tag: '900x600', w: 900, h: 600, d: 1 },
  { tag: '1600x900', w: 1600, h: 900, d: 1 },
  { tag: 'zoom125', w: 1280, h: 720, d: 1.25 },
  { tag: 'zoom80', w: 1280, h: 720, d: 0.8 },
];
const OUT = [];
let port = 9627;
for (const c of CFG) {
  const T = await launch({ port: port++, headless: true, width: c.w, height: c.h, deviceScaleFactor: c.d });
  await T.boot();
  await sleep(500);
  const m = () => T.eval(`(() => {
    const ov = document.getElementById('overlay');
    const panel = ov.querySelector('.panel');
    const bad = [];
    if (panel) {
      const r = panel.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1) bad.push('panel out ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
      if (panel.scrollHeight > panel.clientHeight + 2) bad.push('panel scroll ' + panel.clientHeight + '/' + panel.scrollHeight);
    }
    for (const b of ov.querySelectorAll('.btn')) {
      if (!b.offsetParent) continue;
      const r = b.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1) bad.push('btn out ' + b.innerText.replace(/\\s+/g,' ').slice(0,14) + ' ' + [r.left,r.top,r.right,r.bottom].map(Math.round));
    }
    return { st: window.__game.state, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
      canvas: (() => { const cv = document.querySelector('canvas'); return cv ? [cv.width, cv.height, Math.round(cv.getBoundingClientRect().width), Math.round(cv.getBoundingClientRect().height)] : null; })(),
      panel: panel ? { cls: panel.className, h: Math.round(panel.getBoundingClientRect().height), scrollH: panel.scrollHeight, clientH: panel.clientHeight } : null,
      bad };
  })()`);
  OUT.push({ cfg: c.tag, boot: await m() });
  await T.shot(`_pt/human2/50_title_${c.tag}.png`);
  await T.key('KeyS'); await sleep(650);
  OUT.push({ cfg: c.tag, settings: await m() });
  await T.shot(`_pt/human2/51_settings_${c.tag}.png`);
  await T.key('Escape'); await sleep(400);
  await T.key('Slash'); await sleep(650);
  OUT.push({ cfg: c.tag, help: await m() });
  await T.shot(`_pt/human2/52_help_${c.tag}.png`);
  await T.key('Escape'); await sleep(400);
  await T.key('Enter'); await sleep(650);
  OUT.push({ cfg: c.tag, difficulty: await m() });
  await T.shot(`_pt/human2/53_difficulty_${c.tag}.png`);
  await T.key('Enter'); await sleep(650);
  OUT.push({ cfg: c.tag, charselect: await m() });
  await T.shot(`_pt/human2/54_charselect_${c.tag}.png`);
  await T.key('Enter'); await sleep(800);
  for (let i = 0; i < 40; i++) {
    const on = await T.eval(`window.__game.dialogue && window.__game.dialogue.active`);
    if (!on) break;
    await T.key('Enter', 40); await sleep(200);
  }
  await sleep(400);
  await T.key('Escape'); await sleep(450);
  OUT.push({ cfg: c.tag, pause: await m() });
  await T.shot(`_pt/human2/55_pause_${c.tag}.png`);
  const rep = await T.report();
  OUT.push({ cfg: c.tag, errors: rep.errors.length, warns: rep.warns.length, netFails: rep.netFails.length, httpBad: rep.httpBad.length });
  await T.close();
}
console.log(JSON.stringify(OUT, null, 1));
