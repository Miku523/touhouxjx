# -*- coding: utf-8 -*-
import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
p = os.path.join(ROOT, 'src/engine/songs/index.js')
s = io.open(p, encoding='utf-8').read()
V = '1.6.69'
NEW = {
 'pre1': ("  // 1 面道中：ほおずきみたいに紅い魂 —— 原曲整块搬入 + 重配器（145 BPM / G 小调 / 56 小节，见 tools/build/_pret1_compose.py）\n"
          "  { id: 'honou_pre1', url: './pre1.js', keys: ['pre1'],\n"
          "    pick: (m) => ({ pre1: m.HONOU_PRE1?.pre1 ? { ...m.HONOU_PRE1.pre1, audio: 'src/assets/bgm/pre1.mp3?v=%s' } : undefined }) }," % V),
 'pre2': ("  // 2 面道中：幻視の夜 ～ Ghostly Eyes —— 原曲整块搬入 + 重配器（151 BPM / C# 小调 / 70 小节，见 tools/build/_pret2_compose.py）\n"
          "  { id: 'genshi_pre2', url: './pre2.js', keys: ['pre2'],\n"
          "    pick: (m) => ({ pre2: m.GENSHI_PRE2?.pre2 ? { ...m.GENSHI_PRE2.pre2, audio: 'src/assets/bgm/pre2.mp3?v=%s' } : undefined }) }," % V),
 'pre3': ("  // 3 面道中：ルーネイトエルフ —— 原曲整块搬入 + 重配器（143 BPM / E 大调 / 56 小节，见 tools/build/_pret3_compose.py）\n"
          "  { id: 'lunate_pre3', url: './pre3.js', keys: ['pre3'],\n"
          "    pick: (m) => ({ pre3: m.LUNATE_PRE3?.pre3 ? { ...m.LUNATE_PRE3.pre3, audio: 'src/assets/bgm/pre3.mp3?v=%s' } : undefined }) }," % V),
 'pre4': ("  // 4 面道中：フォールオブフォール ～ 秋めく滝 —— 原曲 84 小节搬入 + 重配器（163 BPM / B 小调，见 tools/build/_pret4_compose.py）\n"
          "  { id: 'fall_pre4', url: './pre4.js', keys: ['pre4'],\n"
          "    pick: (m) => ({ pre4: m.FALL_PRE4?.pre4 ? { ...m.FALL_PRE4.pre4, audio: 'src/assets/bgm/pre4.mp3?v=%s' } : undefined }) }," % V),
 'pre6': ("  // 6 面道中：ヴォヤージュ1970 —— 原曲 58 小节搬入（含 16 小节 3/4）+ 重配器（162 BPM / D 小调，见 tools/build/_pret6_compose.py）\n"
          "  { id: 'voyage_pre6', url: './pre6.js', keys: ['pre6'],\n"
          "    pick: (m) => ({ pre6: m.VOYAGE_PRE6?.pre6 ? { ...m.VOYAGE_PRE6.pre6, audio: 'src/assets/bgm/pre6.mp3?v=%s' } : undefined }) }," % V),
}
for k, new in NEW.items():
    i = s.index("{ id: ")
    # locate the DEFS block whose keys contains pre key
    start = s.index("keys: ['%s']" % k)
    a = s.rindex('  //', 0, s.rindex('{ id: ', 0, start))
    b = s.index('},', start) + 2
    seg = s[a:b]
    assert 'keys' in seg and k in seg, (k, seg[:80])
    s = s[:a] + new + s[b:]
    print('patched', k)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('OK')
