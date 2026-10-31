import { launch } from '../../_pt_core.mjs';
const BASE = 'http://127.0.0.1:8203';
const T = await launch({ port: 9594, url: BASE + '/tools/verify_audio_mp3.html' });
try {
  await T.waitFor('!!window.runVerify', 20000);
  const js = `(async () => {
    const out = {};
    out.ctxs = [];
    try {
      const a = new AudioContext();
      out.ctxs.push(['AudioContext', a.sampleRate, a.state]);
    } catch (e) { out.ctxs.push(['AudioContext ERR', String(e)]); }
    // 1) 用 OfflineAudioContext 生成的 0.05s 正弦编码成 WAV 再解
    const sr = 44100, n = 2205;
    const buf = new ArrayBuffer(44 + n * 2);
    const dv = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVEfmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.round(Math.sin(i / 10) * 8000), true);
    const ctx = new AudioContext();
    try { const d = await ctx.decodeAudioData(buf.slice(0)); out.tiny = [d.duration, d.numberOfChannels, d.sampleRate]; }
    catch (e) { out.tiny = ['ERR', String(e)]; }
    // 2) fetch sakuya mp3 看字节/ct
    const r = await fetch('src/assets/bgm/sakuya_ex.mp3');
    const ab = await r.arrayBuffer();
    out.sakuya = [r.status, r.headers.get('content-type'), ab.byteLength];
    try { const d = await ctx.decodeAudioData(ab.slice(0)); out.sakuyaDec = [d.duration, d.numberOfChannels]; }
    catch (e) { out.sakuyaDec = ['ERR', String(e)]; }
    return out;
  })()`;
  const rep = await T.eval(js, { awaitPromise: true });
  console.log(JSON.stringify(rep, null, 1));
} finally { await T.close(); }
