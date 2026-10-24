import { launch, sleep } from './_pt_core.mjs';

const CFG = [
  { tag: 'zoom125_true', w: 1024, h: 576, d: 1.25 },
  { tag: 'zoom80_true', w: 1600, h: 900, d: 0.8 },
];
const OUT = [];
let port = 9632;
for (const c of CFG) {
  const T = await launch({ port: port++, headless: true, width: c.w, height: c.h, deviceScaleFactor: c.d });
  await T.boot(); await sleep(400);
  const m = () => T.eval(`(() => {
    const ov = document.getElementById('overlay'); const panel = ov.querySelector('.panel'); const bad = [];
    if (panel) { const r = panel.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1) bad.push('panel out');
      if (panel.scrollHeight > panel.clientHeight + 2) bad.push('panel scroll ' + panel.clientHeight + '/' + panel.scrollHeight); }
    for (const b of ov.querySelectorAll('.btn')) { if (!b.offsetParent) continue; const r = b.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1) bad.push('btn out ' + b.innerText.replace(/\\s+/g,' ').slice(0,12)); }
    const sb = document.getElementById('settingsBtn'); const sbr = sb && sb.getBoundingClientRect();
    return { st: window.__game.state, iw: innerWidth, ih: innerHeight, dpr: +devicePixelRatio.toFixed(3),
      canvas: (() => { const cv = document.querySelector('canvas'); return cv ? [cv.width, cv.height, Math.round(cv.getBoundingClientRect().width), Math.round(cv.getBoundingClientRect().height)] : null; })(),
      panel: panel ? { h: Math.round(panel.getBoundingClientRect().height), sh: panel.scrollHeight, ch: panel.clientHeight } : null,
      sb: sbr ? [Math.round(sbr.left), Math.round(sbr.top), Math.round(sbr.right), Math.round(sbr.bottom)] : null, bad };
  })()`);
  OUT.push({ cfg: c.tag, boot: await m() });
  await T.shot(`_pt/human2/56_title_${c.tag}.png`);
  await T.key('KeyS'); await sleep(600); OUT.push({ cfg: c.tag, settings: await m() }); await T.shot(`_pt/human2/57_settings_${c.tag}.png`);
  await T.key('Escape'); await sleep(350);
  await T.key('Slash'); await sleep(600); OUT.push({ cfg: c.tag, help: await m() }); await T.shot(`_pt/human2/58_help_${c.tag}.png`);
  await T.key('Escape'); await sleep(350);
  await T.key('Enter'); await sleep(600); OUT.push({ cfg: c.tag, diff: await m() }); await T.shot(`_pt/human2/59_diff_${c.tag}.png`);
  await T.key('Enter'); await sleep(600); OUT.push({ cfg: c.tag, char: await m() }); await T.shot(`_pt/human2/60_char_${c.tag}.png`);
  await T.key('Enter'); await sleep(800);
  for (let i = 0; i < 70; i++) {
    const on = await T.eval(`window.__game.dialogue && window.__game.dialogue.active`);
    if (!on) break;
    await T.key('Enter', 40); await sleep(180);
  }
  await sleep(400);
  await T.key('Escape'); await sleep(500); OUT.push({ cfg: c.tag, pause: await m() }); await T.shot(`_pt/human2/61_pause_${c.tag}.png`);
  const rep = await T.report(); OUT.push({ cfg: c.tag, errors: rep.errors.length, netFails: rep.netFails.length });
  await T.close();
}
console.log(JSON.stringify(OUT, null, 1));
