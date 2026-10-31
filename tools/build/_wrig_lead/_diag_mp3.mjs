import { launch } from '../../_pt_core.mjs';
const BASE = process.env.PT_BASE || 'http://127.0.0.1:8217';
const T = await launch({ port: 9605, url: BASE + '/index.html' });
try {
  await T.waitFor('!!window.__game', 30000);
  const out = await T.eval(`(async () => {
    const names = ['sakuya_ex','flandre_devil','festival_box','remilia_septette','youma_stage1','wriggle_stage2'];
    const ctx = new AudioContext();
    const res = [];
    for (const n of names) {
      try {
        const r = await fetch('src/assets/bgm/' + n + '.mp3?diag=1');
        const ab = await r.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab.slice(0));
        res.push({ n, status: r.status, bytes: ab.byteLength, dur: +buf.duration.toFixed(3), sr: buf.sampleRate, ch: buf.numberOfChannels });
      } catch (e) { res.push({ n, err: String(e) }); }
    }
    return res;
  })()`);
  for (const r of out) console.log(JSON.stringify(r));
} finally { await T.close(); }
