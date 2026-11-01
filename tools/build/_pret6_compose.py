# -*- coding: utf-8 -*-
"""tools/build/_pret6_compose.py —— 六面道中《ヴォヤージュ1970》（月都航路编）

场景：月都 · 静海航路——没有空气的银色海面，飞船掠过环形山的影子。
原曲：ZUN TH08「Voyage 1970」162 BPM / D 小调 / 58 小节（bars 27-42 为 3/4 圆舞段）。
搬入：原曲 3-58 逐音搬入 → 新 3-58（拍号按原谱逐小节铺，3/4 段保留），前加 2 小节「起飞」引子、后加 2 小节收。
配器：左手十六分 toccata（ch0）交钢琴 + 大键琴颗粒；上方主奏 ch3 交方波旋律（超 100 的音降八度）；
      弦乐 pad（ch6/ch7）铺真空感长音；ch15 失真吉他低音交 bass/sub。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _pret_lib import Song
from _pret_engine import Eng
from _pret_post import (copy_layer, copy_shift, sub_pedal, tick_accents,
                        crash_heads, add_ride, thin_crashes, thin_kind)

CFG = dict(
    name='pre6', title='ヴォヤージュ1970（月都航路编）', export='VOYAGE_PRE6', keyname='pre6',
    bpm=162.0, src='pre6', nbars=60,
    segs=[('BODY', 3, 58, 3)],
    dyn={'BODY': 1.00},
    voice={
        0:  [('piano', 0, 0.88, 1.0), ('harpsi', 0, 0.26, 1.0)],
        3:  [('lead', 0, 0.95, 1.0)],
        6:  [('pad', 0, 0.70, 1.0), ('strings', 0, 0.30, 1.0)],
        7:  [('strings', 0, 0.55, 1.0)],
        15: [('bass', 0, 0.60, 1.0), ('sub', 0, 0.40, 1.0)],
    },
    drum_ch=9,
    drum_map={35: 0, 36: 0, 38: 1, 40: 1, 37: 1, 39: 1, 42: 2, 44: 2, 46: 3,
              45: 5, 47: 5, 41: 6, 43: 6, 48: 6, 50: 6, 49: 4, 57: 4, 52: 4,
              51: 7, 53: 7},
)

TRACKS = [
    ('lead',    'square',   0.350),
    ('piano',   'triangle', 0.070),
    ('harpsi',  'square',   0.170),
    ('strings', 'sawtooth', 0.150),
    ('choir',   'sine',     0.100),
    ('bass',    'triangle', 0.160),
    ('sub',     'sine',     0.090),
    ('bell',    'sine',     0.145),
    ('pad',     'sine',     0.105),
    ('arp',     'sine',     0.120),
    ('tick',    'square',   0.090),
    ('brass',   'square',   0.150),
    ('riser',   'sawtooth', 0.050),
    ('reverse', 'sawtooth', 0.045),
]


def extra(eng):
    s = eng.song
    roots = {}
    for k, ns in eng.by_bar.items():
        lows = [n['m'] for n in ns if n['ch'] in (0, 6, 7)]
        r = min(lows) if lows else 38
        while r < 28:
            r += 12
        while r > 45:
            r -= 12
        roots[k] = r

    s.section('intro', 1, 2)
    s.section('tail', 59, 60)

    # ---- 低音：原曲只有 ch15（43-57）才给低音，其余段落靠 ch0 左手最低音补 pedal ----
    for nb, sb in ((b, b) for b in range(3, 59)):
        ns = [n['m'] for n in eng.by_bar.get(sb, ()) if n['ch'] == 0]
        if not ns:
            continue
        r = min(ns)
        while r > 45:
            r -= 12
        while r < 28:
            r += 12
        bl = s.meters[nb - 1]
        for i in range(bl):
            t = s.bt(nb, i)
            s.add('bass', t, r, 0.9 * s.beat, 84 if i == 0 else 70)
        s.add('sub', s.bt(nb), r - 12, bl * s.beat * 0.95, 56)

    # ---- 引子 1-2：起飞（toccata 预告 + 真空长音） ----
    r0 = roots.get(11, 38)
    for i, m in enumerate((r0 + 12, r0 + 19, r0 + 24, r0 + 26)):
        s.add('pad', s.bt(1), m, 8.0 * s.beat * 0.97, 48 - i * 3)
    s.add('sub', s.bt(1), r0, 8.0 * s.beat * 0.95, 62)
    s.add('choir', s.bt(1), r0 + 36, 8.0 * s.beat * 0.9, 26)
    tocc = [n for n in eng.by_bar.get(11, ()) if n['ch'] == 0][:16]
    for i, n in enumerate(tocc):
        t = s.bt(1) + i * 0.25 * s.beat
        s.add('piano', t, n['m'], 0.20 * s.beat, 58 if i % 4 else 74)
    mel = [n for n in eng.by_bar.get(11, ()) if n['ch'] == 3][:4]
    for i, n in enumerate(mel):
        t = s.bt(2) + i * 0.75 * s.beat
        s.add('lead', t, min(100, n['m']), 0.7 * s.beat, 72)
        s.add('bell', t, min(104, n['m'] + 12), 0.7 * s.beat, 50)
    for i in range(8):
        s.add('tick', s.bt(1 + i // 4, (i % 4) * 0.5), 93, 0.06, 40 if i % 2 == 0 else 26)
    s.drum(s.bt(1), 0, 76)
    s.drum(s.bt(2), 0, 84)
    s.add('riser', s.bt(2, 2), 74, 2.0 * s.beat, 32)
    s.drum(s.bt(2, 3.5), 4, 80)

    # ---- 尾声 59-60：降落（B 大调收） ----
    for i, m in enumerate((47, 54, 59, 63)):
        s.add('pad', s.bt(59), m, 8.0 * s.beat * 0.98, 50 - i * 3)
    s.add('sub', s.bt(59), 35, 8.0 * s.beat * 0.96, 64)
    s.add('choir', s.bt(59), 71, 8.0 * s.beat * 0.9, 30)
    for i, (beat, m) in enumerate(((0.0, 71), (0.5, 75), (1.0, 78), (2.0, 75), (3.0, 59))):
        s.add('lead', s.bt(59, beat), m, 0.55 * s.beat, 64)
        s.add('bell', s.bt(59, beat), m + 12, 0.7 * s.beat, 54)
    for i, (beat, m) in enumerate(((0.0, 59), (1.0, 63), (2.0, 51), (3.0, 59))):
        s.add('bell', s.bt(60, beat), m, 0.9 * s.beat, 50)
    for i in range(8):
        s.add('tick', s.bt(60, i * 0.5), 93, 0.06, 34 if i % 2 == 0 else 24)
    s.drum(s.bt(59), 0, 86)
    s.drum(s.bt(60), 0, 70)
    s.drum(s.bt(60), 4, 64)


CFG['extra'] = extra


def main():
    eng = Eng(CFG)
    eng.song.defs(TRACKS)
    eng.run()
    # ch3 最高到 D#8(MIDI 123)：超过 100 的音全部降八度，保证听着不刺
    for n in eng.song.BY.get('lead', []):
        while n[1] > 100:
            n[1] -= 12
    eng.doubles([('bell', 12, 0.20, 0.9, 100)], 3, 58)
    eng.doubles([('strings', 0, 0.24, 1.0, 100)], 3, 58)

    # ================= v1.6.70 全改 =================
    _s = eng.song
    # (7) 3/4 段打点 + 转 B 大调段的铜管和声
    add_ride(_s, 27, 42, beats=(0.0, 1.0, 2.0), vel=44)
    copy_layer(_s, 'lead', 'brass', 43, 58, shift=0, vmul=0.45, hi=93)
    crash_heads(_s, [(27, 0), (43, 0), (51, 0), (59, 0)], vel=84)
    # (2) 低频踏板
    sub_pedal(_s, vel=66)
    # (9) 点音铺开
    tick_accents(_s, [(3, 0), (27, 0), (43, 0), (59, 0)])
    eng.write()


if __name__ == '__main__':
    main()