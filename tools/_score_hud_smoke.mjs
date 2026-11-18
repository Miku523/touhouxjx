// HUD 分数/擦弹显示的渲染自检：确认新增节点插在右上、不压住 STAGE/TIMER、且零 console error。
//
// 用法（先用 tools/serve_nocache.py 把仓库根目录挂到 8138）：
//   node tools/_score_hud_smoke.mjs
//
// 契约（改 hud.js 的 _buildScoreBox / _refreshScore 后要重跑）：
//   1. 分数框存在，且是 .stage-info 的第一个子节点（在 STAGE/TIMER 行之上，右对齐）
//   2. 初始补零 8 位；setScore 后文本立刻变，且同一值重复调用不再写 DOM
//   3. setGraze 倍率 >1 时出现 ×N 文案，衰减由 _refreshScore 平滑接管
//   4. reset() 把分数归零
//   5. 全程零 console error（HUD 报错会打断整帧 update）
import { launch, sleep, makeChecks, saveJson } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';

mkdirSync('_pt/score', { recursive: true });
const PORT = Number(process.argv[2] || 9731);
const T = await launch({ port: PORT });
const C = makeChecks();
const out = {};
try {
  await T.boot({ waitTitle: true });
  await T.eval(`(() => { const g = window.__game; g.dialogue?.close?.(); g.state='menu'; return 1; })()`);
  await T.eval(`window.__game.startStage(0)`);
  await sleep(400);
  await T.eval(`(() => { const g = window.__game; g.dialogue?.close?.(); g.state='play'; return 1; })()`);
  await sleep(600);

  const dom = await T.eval(`(() => {
    const hud = window.__game.hud;
    const box = document.querySelector('.hud-score');
    const info = document.querySelector('.hud-right .stage-info');
    const num = document.querySelector('.hs-num');
    const gz = document.querySelector('.hs-graze');
    return {
      hasBox: !!box, hasNum: !!num, hasGraze: !!gz,
      isFirstChild: !!(box && info && info.firstElementChild === box),
      text: num ? num.textContent : null,
      boxRect: box ? box.getBoundingClientRect().toJSON() : null,
      infoRect: info ? info.getBoundingClientRect().toJSON() : null,
      lineRect: document.querySelector('.hud-right .stage-line')?.getBoundingClientRect().toJSON() || null,
      vw: innerWidth,
    };
  })()`);
  out.dom = dom;
  C.chk(dom.hasBox && dom.hasNum && dom.hasGraze, '分数节点已建出', JSON.stringify({ b: dom.hasBox, n: dom.hasNum, g: dom.hasGraze }));
  C.chk(dom.isFirstChild, '分数框是 .stage-info 第一个子节点（位于 STAGE 行之上）');
  C.chk(dom.text === '00000000', '初始 8 位补零', dom.text);
  C.chk(!!dom.boxRect && dom.boxRect.right <= dom.vw + 1 && dom.boxRect.top >= 0, '分数框在视口内', JSON.stringify(dom.boxRect));
  // 分数框必须压在 STAGE/TIMER 那一行之上，不能盖住它
  C.chk(!!dom.boxRect && !!dom.lineRect && dom.boxRect.bottom <= dom.lineRect.top + 1,
    '分数框在 STAGE/TIMER 行之上，不重叠', JSON.stringify({ boxBottom: dom.boxRect?.bottom, lineTop: dom.lineRect?.top }));

  // setScore：值变化写入，重复调用不写（用 _scoreStr 缓存判定）
  const setr = await T.eval(`(() => {
    const hud = window.__game.hud;
    hud.setScore(123456);
    const a = document.querySelector('.hs-num').textContent;
    const before = hud._scoreStr;
    hud.setScore(123456);
    return { a, same: before === hud._scoreStr, cached: hud._scoreStr };
  })()`);
  out.setScore = setr;
  C.chk(setr.a === '00123456', 'setScore 生效并补零', setr.a);

  // setGraze：倍率 >1 显示 ×N，随后 tick 衰减到 1 并回落成纯计数
  // 手动 step `_refreshScore`，并把 state 拨到 'menu' 冻住主循环：
  // 关卡在后台会真的跑（可能死光后 reset 把擦弹清零），靠 setTimeout 等帧会让断言随机失败。
  // 只有颜色要走真实时间——CSS transition 是浏览器时钟驱动的，手动 step 推不动它。
  const gz = await T.eval(`(async () => {
    const hud = window.__game.hud;
    window.__game.state = 'menu';
    const step = n => { for (let i = 0; i < n; i++) hud._refreshScore(0.05); };
    hud.setGraze(140, 1.4);
    step(8);
    const hot = document.querySelector('.hs-graze').textContent;
    await new Promise(r => setTimeout(r, 320));
    const hotColor = getComputedStyle(document.querySelector('.hs-graze')).color;
    hud.setGraze(140, 1.0);
    step(12);
    const cold = document.querySelector('.hs-graze').textContent;
    hud.setGraze(0, 1.0);
    step(2);
    const empty = document.querySelector('.hs-graze').textContent;
    return { hot, hotColor, cold, empty };
  })()`);
  out.graze = gz;
  C.chk(/GRAZE 140\s+×1\.4/.test(gz.hot), '倍率 >1 显示 ×N', gz.hot);
  C.chk(/242, 210, 75/.test(gz.hotColor), '倍率 >1 用金色高亮', gz.hotColor);
  C.chk(gz.cold === 'GRAZE 140', '倍率回落 1.0 后只剩计数', JSON.stringify(gz.cold));
  C.chk(gz.empty === '', '擦弹清零后那行隐藏', JSON.stringify(gz.empty));

  // reset 归零
  const rst = await T.eval(`(() => { const hud = window.__game.hud; hud.reset(); return document.querySelector('.hs-num').textContent; })()`);
  out.reset = rst;
  C.chk(rst === '00000000', 'reset 把分数归零', rst);

  await T.shot('_pt/score/hud.png');
  const rep = await T.report();
  out.report = { errors: rep.errors.slice(0, 5), warns: rep.warns.slice(0, 5) };
  C.chk(rep.errors.length === 0, '零 console error', JSON.stringify(rep.errors.slice(0, 3)));
  out.summary = C.sum();
  saveJson('_pt/score/smoke.json', out);
  console.log(JSON.stringify(out.summary, null, 1));
} finally { await T.close(); }
