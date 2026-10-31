import { launch } from '../../../tools/_pt_core.mjs';
const T = await launch({ port: 9585, url: 'http://127.0.0.1:8207/index.html' });
await new Promise(r => setTimeout(r, 1500));
for (const u of ['src/assets/bgm/youma_stage1.mp3', 'src/assets/bgm/remilia_septette.mp3']) {
  const page = "(async () => { const b = await (await fetch('" + u + "')).arrayBuffer(); try { const c = new OfflineAudioContext(2, 1024, 44100); const d = await c.decodeAudioData(b.slice(0)); return ['ok', b.byteLength, d.duration, d.numberOfChannels]; } catch (e) { return ['FAIL', b.byteLength, String(e)]; } })()";
  const out = await T.eval(page, { awaitPromise: true });
  console.log(u, JSON.stringify(out));
}
await T.close();
