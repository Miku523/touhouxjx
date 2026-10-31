import { launch } from '../../_pt_core.mjs';
const BASE = 'http://127.0.0.1:8203';
const T = await launch({ port: 9596, url: BASE + '/tools/verify_audio_mp3.html' });
try {
  await T.waitFor('!!window.runVerify', 20000);
  const js = `(async () => {
    const names = ['sakuya_ex','remilia_septette','youma_stage1'];
    const out = [];
    const ctx = new AudioContext();
    for (const n of names) {
      for (const ext of ['.wav','.mp3']) {
        const url = '/src/assets/bgm/' + n + ext;
        let st = 0, bytes = 0;
        try {
          const res = await fetch(url);
          st = res.status;
          const ab = await res.arrayBuffer();
          bytes = ab.byteLength;
          const d = await ctx.decodeAudioData(ab.slice(0));
          out.push([n+ext, st, bytes, d.numberOfChannels, +d.duration.toFixed(6), d.length]);
        } catch (e) { out.push([n+ext, st, bytes, 'ERR', String(e)]); }
      }
    }
    return out;
  })()`;
  console.log(JSON.stringify(await T.eval(js, { awaitPromise: true }), null, 1));
} finally { await T.close(); }
