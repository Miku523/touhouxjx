/**
 * 用 headless Edge + CDP 在真实浏览器里验证 BGM MP3：字节数 / MIME / 解码时长 /
 * 采样数 / 循环接缝 / 与 WAV 的残差。配套页面 tools/verify_audio_mp3.html。
 *
 * 用法：先起服务 python tools/serve_nocache.py 8140（在仓库根目录），再
 *   node tools/verify_audio_mp3.mjs
 * 环境变量：PT_BASE（默认 http://127.0.0.1:8140）、CDP_PORT（默认 9552）
 */
import { launch, saveJson } from './_pt_core.mjs';
import { writeFileSync } from 'node:fs';

const BASE = process.env.PT_BASE || 'http://127.0.0.1:8140';
const PORT = Number(process.env.CDP_PORT || 9552);

const T = await launch({ port: PORT, url: BASE + '/tools/verify_audio_mp3.html' });
try {
  const ok = await T.waitFor('!!window.runVerify', 20000);
  if (!ok) throw new Error('验证页面没加载出来: ' + BASE);
  const rep = await T.eval('window.runVerify()', { awaitPromise: true });

  const checks = [];
  const chk = (ok, name, detail) => checks.push({ ok: !!ok, name, detail: detail === undefined ? '' : String(detail) });
  for (const t of rep.tracks) {
    const tag = t.name;
    chk(t.mp3.ct === 'audio/mpeg', tag + ' mp3 MIME', t.mp3.ct);
    chk(Math.abs(t.dur.native.diff) <= 0.02, tag + ' |dur(native) 差| <= 0.02s', t.dur.native.diff);
    chk(Math.abs(t.dur.game.diff) <= 0.02, tag + ' |dur(game 48k) 差| <= 0.02s', t.dur.game.diff);
    chk(t.len.native.diff === 0, tag + ' 采样数完全一致(native)', t.len.native.diff);
    chk(Math.abs(t.len.game.diff) <= 48, tag + ' 48k 采样数差 <= 48(=1ms)', t.len.game.diff);
    const sw = t.seam.native.wav, sm = t.seam.native.mp3;
    const ord = (a, b) => Math.max(a, b) / Math.max(1e-9, Math.min(a, b));
    chk(ord(sw.rmsFirst128, sm.rmsFirst128) < 2, tag + ' 首窗 RMS 同量级', sw.rmsFirst128 + ' / ' + sm.rmsFirst128);
    chk(ord(sw.rmsLast128, sm.rmsLast128) < 2, tag + ' 末窗 RMS 同量级', sw.rmsLast128 + ' / ' + sm.rmsLast128);
    chk(ord(sw.seamJump, sm.seamJump) < 2, tag + ' 接缝跳变(wav vs mp3) 同量级', sw.seamJump + ' / ' + sm.seamJump);
    // 无缝的真正判据：接缝处「末样本→首样本」的跳变不比正常相邻跳变大，说明没有咔哒
    chk(sm.seamJump <= sm.meanJump * 1.5, tag + ' 接缝跳变 <= 平均相邻跳变x1.5', sm.seamJump + ' / mean ' + sm.meanJump);
    chk(ord(sw.rmsAll, sm.rmsAll) < 1.1, tag + ' 整体 RMS 无异常增益差', sw.rmsAll + ' / ' + sm.rmsAll);
    // 真实播路径：AudioBufferSourceNode.loop 跨接缝离线渲染
    // 循环接缝（AudioBufferSourceNode.loop=true 真实渲染，边界前后 ±512 采样）
    const nw = t.loop.wav.near, nm = t.loop.mp3.near;
    chk(ord(nw.rms, nm.rms) < 2, tag + ' 循环边界附近 RMS 同量级', nw.rms + ' / ' + nm.rms);
    chk(ord(nw.edgeJump, nm.edgeJump) < 2, tag + ' 循环边界跳变同量级', nw.edgeJump + ' / ' + nm.edgeJump);
    // 注意：接缝跳变是「源素材」在循环点的固有跳变（WAV 同样存在），MP3 只要不比 WAV 更大即可
    chk(nm.edgeJump <= nw.edgeJump * 1.5, tag + ' 循环边界跳变不比 WAV 更大', nm.edgeJump + ' <= ' + (nw.edgeJump * 1.5).toFixed(6));
    chk(t.loop.snrVsWav >= 12, tag + ' 循环渲染 vs WAV 循环渲染 SNR >= 12dB', t.loop.snrVsWav);
    chk(t.alignNative.lag === 0 || Math.abs(t.alignNative.lag) <= 1, tag + ' 与 WAV 对齐 lag<=1', t.alignNative.lag);
    chk(t.alignNative.snrDb >= 12, tag + ' SNR >= 12dB（96k 级 MP3 预期 15~25）', t.alignNative.snrDb);
    console.log('[loop] ' + JSON.stringify({ tag, ...t.loop }));
  }
  chk(rep.tracks.every((t) => t.mp3.bytes < t.wav.bytes / 3), '每首体积都 < 原 WAV 的 1/3',
    rep.tracks.map((t) => (t.mp3.bytes / t.wav.bytes).toFixed(3)).join(', '));

  rep.checks = checks;
  rep.summary = { pass: checks.filter((c) => c.ok).length, fail: checks.filter((c) => !c.ok).length };
  saveJson('tools/_audio_mp3_verify.json', rep);
  writeFileSync('tools/_audio_mp3_verify.txt', checks.map((c) => (c.ok ? 'PASS  ' : 'FAIL  ') + c.name + (c.detail ? '  [' + c.detail + ']' : '')).join('\n') + '\n');
  console.log(checks.map((c) => (c.ok ? 'PASS  ' : 'FAIL  ') + c.name + (c.detail ? '  [' + c.detail + ']' : '')).join('\n'));
  console.log('\n' + rep.summary.pass + ' pass / ' + rep.summary.fail + ' fail');
} finally {
  await T.close();
}
