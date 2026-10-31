# -*- coding: utf-8 -*-
import os
HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))), 'tools', 'verify_audio_mp3.html')
s = open(P, encoding='utf-8').read()
old = """  const get = async (name) => {
    const r = await fetch(BASE + name, { cache: 'no-store' });
    const ab = await r.arrayBuffer();
    return { status: r.status, ok: r.ok, ct: r.headers.get('content-type'), bytes: ab.byteLength, ab };
  };"""
new = """  // 有些曲子的母版 WAV 不入库（超 Cloudflare 单文件上限），直接从 tools/build 下的 kit 读
  const MASTER = {
    remilia_septette: '/tools/build/_remi_kit/remilia_septette_stereo.wav',
    youma_stage1: '/tools/build/_rumia_kit/youma_stage1_stereo.wav',
  };
  const getUrl = async (url) => {
    const r = await fetch(url, { cache: 'no-store' });
    const ab = await r.arrayBuffer();
    return { status: r.status, ok: r.ok, ct: r.headers.get('content-type'), bytes: ab.byteLength, ab, url };
  };
  const get = async (name) => getUrl(BASE + name);"""
assert s.count(old) == 1
s = s.replace(old, new)
old2 = "    const wav = await get(name + '.wav');"
new2 = "    const wav = await getUrl(MASTER[name] || (BASE + name + '.wav'));"
assert s.count(old2) == 1
s = s.replace(old2, new2)
open(P, 'w', encoding='utf-8', newline='').write(s)
print('patched verify page')
