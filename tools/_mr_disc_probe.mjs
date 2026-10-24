import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9625, headless: true });
try {
  await T.boot();
  const keys = await T.eval(`window.__game.musicRoom.tracks.map(t => t.key)`);
  await T.eval(`localStorage.setItem('hks.music.v1', ${JSON.stringify(JSON.stringify({ heard: keys }))}); window.__p = 1;`);
  await T.reload();
  await T.waitFor('typeof window.__p === "undefined" && !!window.__game', 20000);
  await T.waitFor('window.__game.state === "menu"', 12000);
  await sleep(500);
  await T.key('KeyM');
  await sleep(800);
  for (let i = 0; i < 10; i++) { await T.key('ArrowDown', 25); await sleep(80); }
  await sleep(400);
  const r = await T.eval(`(() => {
    const q = s => document.querySelector(s);
    const rect = el => { const b = el.getBoundingClientRect(); const c = getComputedStyle(el);
      return { x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1),
        sw: el.scrollWidth, sh: el.scrollHeight, font: c.fontSize, lh: c.lineHeight, ls: c.letterSpacing, s: c.getPropertyValue('--s'),
        pos: c.position, left: c.left, right: c.right, ta: c.textAlign, disp: c.display, clamp: c.webkitLineClamp, ws: c.whiteSpace }; };
    const lab = q('.mr-disc-label'), nm = q('.mr-disc-name');
    return { disc: rect(q('.mr-disc')), label: rect(lab), name: rect(nm), txt: nm.textContent,
      parent: nm.parentElement.className, html: lab.outerHTML.slice(0, 400) };
  })()`);
  console.log(JSON.stringify(r, null, 1));
  await T.shot('_pt/mr_i18n/_disc11.png');
} finally { await T.close(); }
