import { launch } from '../../_pt_core.mjs';
const BASE = 'http://127.0.0.1:8203';
const T = await launch({ port: 9592, url: BASE + '/tools/verify_audio_mp3.html' });
try {
  await T.waitFor('!!window.runVerify', 20000);
  const js = `(async () => {
    const names = ['sakuya_ex','flandre_devil','festival_box','remilia_septette','youma_stage1'];
    const out = [];
    for (const n of names) {
      for (const ext of ['.wav','.mp3']) {
        const url = 'src/assets/bgm/' + n + ext;
        try {
          const r = await fetch(url, { cache: 'no-store' });
          const ab = await r.arrayBuffer();
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const buf = await ctx.decodeAudioData(ab.slice(0));
          out.push([n+ext, r.status, ab.byteLength, 'ok', buf.duration, ctx.sampleRate]);
          ctx.close();
        } catch (e) {
          out.push([n+ext, 'ERR', String(e && e.message || e)]);
        }
      }
    }
    return out;
  })()`;
  const rep = await T.eval(js, { awaitPromise: true });
  console.log(JSON.stringify(rep, null, 1));
} finally { await T.close(); }