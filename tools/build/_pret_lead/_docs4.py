# -*- coding: utf-8 -*-
import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BT = chr(96)
K = ('pre1', 'pre2', 'pre3', 'pre4', 'pre6')
rows = {
 'pre1': '| 02 | ~BT~pre1~BT~ | 像鬼灯一样鲜红的灵魂（夜樱小径编） | STAGE 1 · 道中 | 博丽神社 · 夜樱小径 | 原曲 / ZUN（逐音搬入重配器） | 92.7 | ~BT~:%d~BT~ |',
 'pre2': '| 04 | ~BT~pre2~BT~ | 幻视之夜 ～ Ghostly Eyes（萤火夜雾编） | STAGE 2 · 道中 | 魔法森林 · 萤火夜雾 | 原曲 / ZUN（逐音搬入重配器） | 111.3 | ~BT~:%d~BT~ |',
 'pre3': '| 06 | ~BT~pre3~BT~ | 月牙精灵（冰蓝晨曦编） | STAGE 3 · 道中 | 雾之湖 · 冰蓝晨曦 | 原曲 / ZUN（逐音搬入重配器） | 94.0 | ~BT~:%d~BT~ |',
 'pre4': '| 08 | ~BT~pre4~BT~ | 秋意渐浓之瀑（瀑布溪谷编） | STAGE 4 · 道中 | 妖怪之山 · 瀑布溪谷 | 原曲 / ZUN（逐音搬入重配器） | 123.7 | ~BT~:%d~BT~ |',
 'pre6': '| 12 | ~BT~pre6~BT~ | 旅人1970（月都航路编） | STAGE 6 · 道中 | 月都 · 永远亭 | 原曲 / ZUN（逐音搬入重配器） | 83.0 | ~BT~:%d~BT~ |',
}
mt = io.open(os.path.join(ROOT, 'src/game/musicTracks.js'), encoding='utf-8').read().split('\n')
ln = {k: [i + 1 for i, l in enumerate(mt) if l.strip() == "key: '~K~',".replace('~K~', k)][0] for k in K}
p = os.path.join(ROOT, 'docs/RE_STORY/AUDIT_CURRENT.md')
lines = io.open(p, encoding='utf-8').read().split('\n')
for k in K:
    idx = [i for i, l in enumerate(lines) if l.startswith('| ') and l.count('|') > 5 and (BT + k + BT) in l]
    assert len(idx) == 1, (k, idx[:3])
    lines[idx[0]] = rows[k] % ln[k]
io.open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines).replace('~BT~', BT))
print('AUDIT ok', ln)
