import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9637, headless: true });
await T.boot();
await T.key('KeyM'); await sleep(800);
const st = () => T.eval(`(() => { const mr = window.__game.musicRoom; const a = window.__game.audio; const r = mr && mr._preview ? Math.round(mr._preview.left * 10) / 10 : null; return { state: window.__game.state, preview: r, done: !!(mr && mr._previewDone), on: a && a.musicOn, song: a && a.currentSong }; })()`);
const L = {};
// 选中第 2 首（锁定）→ Enter 弹确认 → Enter 播放
await T.key('ArrowDown'); await sleep(200); await T.key('Enter'); await sleep(400); await T.key('Enter'); await sleep(500);
await T.key('KeyT'); await sleep(1500); L.previewStart = await st();
await T.key('KeyT'); await sleep(400); L.previewToggle = await st();
await T.key('KeyT'); await sleep(1200); L.previewRestart = await st();
await sleep(9000); L.at12s = await st();
await sleep(19000); L.at31s = await st();
await sleep(400);
await T.key('KeyT'); await sleep(800); L.replayAfterEnd = await st();
await T.shot('_pt/human2/82_preview_replay.png');
await T.key('Escape'); await sleep(500); L.afterEsc = await st();
console.log(JSON.stringify(L, null, 1));
await T.close();
