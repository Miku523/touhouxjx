/**
 * 量测 EXTRA GameOver 按钮可用文案宽度（临时诊断脚本）
 * 目的：确认「从雷米莉亚战的检查点继续」在 1280x720 / 960x540 下是否与右侧 ENTER 键帽重叠，
 * 并给出候选短文案的实测宽度，供选择最终文案。
 */
import { launch, sleep, saveJson } from './_pt_core.mjs';
import { bootFresh, reloadWait, advanceToPlay, DIR } from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9411, width: 1280, height: 720 });

const measureExpr = `(() => {
  const btn = document.querySelectorAll('#buttons button')[0];
  const k = btn.querySelector('.k');
  const lbl = btn.querySelector('.label');
  const cs = getComputedStyle(btn);
  const r = btn.getBoundingClientRect();
  const kr = k ? k.getBoundingClientRect() : null;
  const lr = lbl ? lbl.getBoundingClientRect() : null;
  // 用 canvas 量文字宽度（font 与 letter-spacing 从按钮样式取）
  const c = document.createElement('canvas').getContext('2d');
  c.font = cs.font;
  const ls = parseFloat(cs.letterSpacing) || 0;
  const cands = [
    '从雷米莉亚战的检查点继续',
    '从雷米莉亚检查点继续',
    '从雷米莉亚战继续',
    '雷米莉亚检查点继续',
    '从芙兰战的检查点继续',
    '从芙兰检查点继续',
    '从芙兰战继续',
  ];
  const widths = {};
  for (const s of cands) widths[s] = +(c.measureText(s).width + ls * s.length).toFixed(1);
  return {
    vw: innerWidth, vh: innerHeight, btnW: +r.width.toFixed(1), btnLeft: +r.left.toFixed(1),
    labelW: lr ? +lr.width.toFixed(1) : null, labelText: lbl ? lbl.textContent : btn.textContent,
    labelRight: lr ? +lr.right.toFixed(1) : null,
    kLeft: kr ? +kr.left.toFixed(1) : null, kW: kr ? +kr.width.toFixed(1) : null,
    kRight: kr ? +kr.right.toFixed(1) : null,
    padding: [cs.paddingLeft, cs.paddingRight], fontSize: cs.fontSize, letterSpacing: cs.letterSpacing,
    widths,
  };
})()`;

async function measure(tag) {
  const m = await T.eval(measureExpr);
  console.log(`[measure] ${tag}`, JSON.stringify(m));
  return m;
}

try {
  await bootFresh(T);
  await T.eval("localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true, extraChar: 'reimu' }))");
  await reloadWait(T);
  await T.key('KeyE'); await sleep(600);
  await advanceToPlay(T, 140);
  await T.eval("window.__game.stage.beginBoss('remilia', { midboss: true })");
  await sleep(200);
  await T.eval(`(() => { const g=window.__game, p=g.stage.player; p.lives=1; p.invuln=0; p.die(); for(let i=0;i<500 && g.state==='play';i++) g.update(1/60); return g.state; })()`);
  await sleep(500);
  const a = await measure('1280-midboss');

  // 切到 960x540（renderer resize 会重排 UI）
  await T.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const b = await measure('960-midboss');

  saveJson(`${DIR}/measure-extra-labels.json`, { m1280: a, m960: b });
} finally {
  await T.close();
}
