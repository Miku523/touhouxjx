/** 标题页截图（固定流程：等揭幕 → 按键跳过开屏动画 → 等稳定 → 截全屏） */
import { launch, sleep } from './_pt_core.mjs';

const tag = process.env.TAG || 'shot';
const T = await launch({ port: 9562, width: 1280, height: 720 });
try {
  await T.nav('http://127.0.0.1:8138/index.html');
  await T.waitFor('!!window.__game', 40000);
  await T.waitFor('window.__game._bootDone === true', 25000);
  // 跳过开屏滑入动画：任意键都会落到结束姿态
  await T.key('ShiftLeft');
  await sleep(1600);
  await T.eval('window.__game._skipTitleIntro && window.__game._skipTitleIntro()');
  await sleep(1200);
  await T.shot(`_perf/title_${tag}.png`);
  console.log('已截图 _perf/title_' + tag + '.png');
  console.log('state:', await T.eval('window.__game.state + " bootDone=" + window.__game._bootDone'));
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
} finally {
  await T.close();
}
