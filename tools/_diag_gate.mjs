/**
 * 诊断启动幕门禁卡在哪一路（1.6.71 把默认口径改成 lite 后的排查工具）。
 *
 * 用法：node tools/_diag_gate.mjs [--url=http://127.0.0.1:8138/index.html] [--sec=40]
 * 每秒打印一次 _bootGate 各路状态，直到 _bootDone 或超时。
 */
import { launch, sleep } from './_pt_core.mjs';

const arg = (k, d) => {
  const m = process.argv.find((a) => a.startsWith('--' + k + '='));
  return m ? m.split('=')[1] : d;
};
const URL = arg('url', 'http://127.0.0.1:8138/index.html');
const SEC = Number(arg('sec', 40));

(async () => {
  const T = await launch({ port: 9600 + Math.floor(Math.random() * 60), headless: true });
  try {
    await T.send('Page.navigate', { url: URL });
    for (let i = 1; i <= SEC; i++) {
      await sleep(1000);
      const raw = await T.eval(`JSON.stringify({
        game: !!window.__game,
        bootDone: !!(window.__game && window.__game._bootDone),
        lite: window.__game ? window.__game._bootGateLite : null,
        off: window.__game ? window.__game._bootGateOff : null,
        gate: window.__game ? window.__game._bootGate : null,
        state: window.__game ? window.__game.state : null,
        boot: (typeof window.__hksBootState === 'function') ? window.__hksBootState() : null
      })`);
      const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const g = o.gate || {};
      console.log(
        `${String(i).padStart(2)}s game=${o.game} bootDone=${o.bootDone} lite=${o.lite} state=${o.state} ` +
        `art=${!!g.art} css=${!!g.css} kit=${!!g.kit} audio=${!!g.audio} music=${!!g.music} ` +
        `stageArt=${!!g.stageArt} failed=[${(g.failed || []).join(',')}] done=${!!g.done}`
      );
      if (o.bootDone) { console.log('揭幕完成'); break; }
    }
    const res = await T.eval(`JSON.stringify(
      performance.getEntriesByType('resource')
        .filter(e => /\\/src\\//.test(e.name))
        .map(e => ({ n: e.name.replace(location.origin + '/', ''), b: e.transferSize || 0 }))
        .sort((a,b) => b.b - a.b).slice(0, 12)
    )`);
    console.log('--- 已加载资源 top12 ---');
    const list = typeof res === 'string' ? JSON.parse(res) : res;
    for (const x of list) console.log(String(x.b).padStart(8), x.n);
  } finally {
    await T.close();
  }
})();
