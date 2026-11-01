# -*- coding: utf-8 -*-
"""tools/build/_pret2_compose.py —— 二面道中《幻視の夜 ～ Ghostly Eyes》（萤火夜雾编）

场景：魔法森林 · 萤火夜雾——雾里只有萤火与振翅声，脚下没有路。
原曲：ZUN TH08「幻視の夜 ～ Ghostly Eyes」151 BPM / 4-4 / C# 小调 / 90 小节（本编 70 小节 / 111.26s）。
搬入：原曲 1-48 → 新 5-52（引子 + 主题 + 十六分虫群）、49-56 → 新 53-60（断句）、57-64 → 新 61-68（再现），
      前后各加新写引子/尾声。
配器：主旋律方形波（主题长音叠八音盒高八度）；十六分音群交给贝斯与 sub；
      双音「振翅」动机（原曲 ch0 的平行双音）交给钢琴点奏；弦乐与唱诗铺雾；鼓组照原曲 ch9 重配。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _pret_lib import Song
from _pret_engine import Eng
from _pret_post import (copy_layer, copy_shift, sub_pedal, tick_accents,
                        crash_heads, add_ride, thin_crashes, thin_kind)

CFG = dict(
    name='pre2', title='幻視の夜 ～ Ghostly Eyes（萤火夜雾编）', export='GENSHI_PRE2', keyname='pre2',
    bpm=151.0, src='pre2', nbars=70,
    segs=[
        ('A', 1, 48, 5),
        ('break', 49, 56, 53),
        ('C', 57, 64, 61),
    ],
    dyn={'A': 1.00, 'break': 0.86, 'C': 1.03},
    voice={
        3:  [('lead', 0, 1.00, 1.0), ('bell', 12, 0.10, 1.0)],
        13: [('strings', 0, 0.55, 1.0)],
        0:  [('harpsi', 0, 0.55, 2.0), ('piano', 0, 0.55, 2.0)],
        4:  [('bass', 0, 0.92, 1.0)],
        1:  [('bass', 0, 0.70, 1.0), ('pad', 0, 0.55, 1.0)],
        8:  [('bell', 0, 0.55, 1.0), ('piano', 0, 0.40, 1.0)],
        10: [('harpsi', 0, 0.42, 1.0)],
        11: [('choir', 0, 0.50, 1.0), ('strings', 0, 0.30, 1.0)],
        15: [],
    },
)

DRUM = {36: 0, 35: 0, 38: 1, 40: 1, 37: 1, 42: 2, 44: 2, 46: 3, 49: 4, 57: 4,
        41: 6, 48: 6, 50: 6, 43: 6, 45: 5, 47: 5, 51: 7, 53: 7}

TRACKS = [
    ('lead',    'square',   0.300),
    ('piano',   'triangle', 0.300),
    ('harpsi',  'square',   0.520),
    ('strings', 'sawtooth', 0.350),
    ('choir',   'sine',     0.165),
    ('bass',    'triangle', 0.135),
    ('sub',     'sine',     0.105),
    ('bell',    'sine',     0.125),
    ('pad',     'sine',     0.092),
    ('arp',     'sine',     0.120),
    ('tick',    'square',   0.090),
    ('riser',   'sawtooth', 0.050),
    ('reverse', 'sawtooth', 0.045),
]

CFG['drum_map'] = DRUM


def extra(eng):
    s = eng.song
    # 每小节根音（取原曲 ch1/ch4 的最低音）
    roots = {}
    for k, ns in eng.by_bar.items():
        lows = [n['m'] for n in ns if n['ch'] in (1, 4)]
        r = min(lows) if lows else 45
        while r < 28:
            r += 12
        roots[k] = r

    def src_root(sb):
        return roots.get(sb, 45)


    # ---- 雾的床：按原曲低音给每小节铺开放五度 + 八度 ----
    SECMAP = [(5, 52, 1), (53, 60, 49), (61, 68, 57)]
    for nb0, nb1, sb0 in SECMAP:
        for i, nb in enumerate(range(nb0, nb1 + 1)):
            sb = sb0 + i
            if sb in roots:
                r = roots[sb]
                while r < 33:
                    r += 12
                while r > 48:
                    r -= 12
                t0 = s.bt(nb)
                s.add('pad', t0, r, s.bar * 0.97, 40)
                s.add('pad', t0, r + 7, s.bar * 0.97, 36)
                s.add('pad', t0, r + 12, s.bar * 0.97, 34)
                s.add('choir', t0, r + 24, s.bar * 0.9, 22)

    # ---- 新引子 1-4：雾、萤火、振翅 ----
    s.section('intro', 1, 4)
    r0 = src_root(9) if 9 in roots else 45  # C#2
    pad_ch = [r0, r0 + 7, r0 + 12, r0 + 15]
    for b in (1, 2, 3, 4):
        t0 = s.bt(b)
        for i, m in enumerate(pad_ch):
            s.add('pad', t0, m, 4.0 * s.beat * 0.97, 44 - i * 4)
        s.add('sub', t0, r0 - 12, 4.0 * s.beat * 0.97, 62)
        s.add('bass', t0, r0, 4.0 * s.beat * 0.95, 70)
    s.add('choir', s.bt(1), r0 + 24, 8.0 * s.beat, 26)
    # 萤火：高音 32 分点（C# 小调五声：C# D# E G# A）
    fy = [85, 88, 90, 93, 88, 92, 95, 97]
    for i in range(32):
        b = 1 + i // 8
        t = s.bt(b) + (i % 8) * 0.125 * s.beat
        s.add('bell', t, fy[(i * 3) % 8], 0.11, 40 if i % 4 else 52)
    # 振翅动机（原曲 ch0 的平行双音）提前预告
    for i, (beat, m1, m2) in enumerate(((0.0, 61, 64), (1.0, 63, 66), (2.0, 61, 64), (3.0, 60, 63))):
        s.add('harpsi', s.bt(3, beat), m1, 0.3 * s.beat, 58)
        s.add('harpsi', s.bt(3, beat), m2, 0.3 * s.beat, 52)
    for i in range(16):
        s.add('tick', s.bt(1 + i // 8, (i % 8) * 0.5), 93, 0.06, 40 if i % 2 == 0 else 28)
    s.drum(s.bt(1), 0, 76)
    s.drum(s.bt(3), 0, 82)
    s.add('riser', s.bt(4, 2.0), 74, 2.0 * s.beat, 32)
    s.add('reverse', s.bt(4, 3.9), 74, 0.9, 32)
    s.drum(s.bt(4, 3.5), 4, 74)

    # ---- 主体开头的空拍（原曲 bar1-2 本身是休止）：雾不能空 ----
    fill_r = None
    for sb in range(9, 25):
        if sb in roots:
            fill_r = roots[sb]
            break
    if fill_r is None:
        fill_r = 45
    while fill_r < 33:
        fill_r += 12
    while fill_r > 45:
        fill_r -= 12
    for nb in (5, 6):
        t0 = s.bt(nb)
        for i, dm in enumerate((0, 7, 12, 15)):
            s.add('pad', t0, fill_r + dm, s.bar * 0.99, 92 - i * 6)
        s.add('sub', t0, fill_r - 12, s.bar * 0.99, 92)
        s.add('bass', t0, fill_r, s.bar * 0.95, 100)
        s.add('choir', t0, fill_r + 24, s.bar * 0.9, 48)
        s.drum(t0, 0, 98)
        s.drum(t0 + 2 * s.beat, 0, 82)
    for i in range(32):
        b = 5 + i // 16
        t = s.bt(b) + (i % 16) * 0.125 * s.beat
        s.add('bell', t, fy[(i * 3) % 8], 0.10, 46 if i % 2 else 66)
    s.add('riser', s.bt(6, 2.0), 74, 2.0 * s.beat, 38)

    # ---- 尾声 69-70：雾散、萤火仍在 ----
    s.section('tail', 69, 70)
    r1 = src_root(89) if 89 in roots else r0
    for i, m in enumerate((r1, r1 + 7, r1 + 12, r1 + 15)):
        s.add('pad', s.bt(69), m, 8.0 * s.beat * 0.98, 46 - i * 4)
    s.add('sub', s.bt(69), r1 - 12, 8.0 * s.beat * 0.98, 60)
    s.add('bass', s.bt(69), r1, 4.0 * s.beat, 72)
    s.add('choir', s.bt(69), r1 + 24, 8.0 * s.beat * 0.95, 28)
    for i in range(16):
        t = s.bt(69) + i * 0.5 * s.beat
        s.add('bell', t, fy[(i * 5) % 8], 0.2, 34)
    for i, (beat, m) in enumerate(((0.0, 73), (1.0, 76), (2.0, 78), (3.0, 73))):
        s.add('lead', s.bt(69, beat), m, 0.9 * s.beat, 62)
        s.add('bell', s.bt(69, beat), m + 12, 0.9 * s.beat, 46)
    s.drum(s.bt(69), 0, 78)
    s.drum(s.bt(70, 0), 0, 70)
    s.drum(s.bt(70), 4, 62)


CFG['extra'] = extra


def main():
    eng = Eng(CFG)
    eng.song.defs(TRACKS)
    eng.run()
    eng.doubles([('bell', 12, 0.40, 0.9, 100)], 5, 68)

    # ================= v1.6.70 全改 =================
    _s = eng.song
    # (1) 主语 hook 提前预演：A 段开头那句（bar 14-17）搬到 6.4s 与 12.0s
    copy_shift(_s, 'lead', 'bell', 14, 17, 6.4, shift=0, vmul=0.85, hi=100)
    copy_shift(_s, 'lead', 'lead', 14, 17, 6.4, shift=-12, vmul=0.50, hi=100)
    copy_shift(_s, 'lead', 'bell', 14, 16, 12.0, shift=0, vmul=0.70, hi=100)
    # (2) 低频踏板
    sub_pedal(_s, vel=64)
    # (4) 打击色彩：ride 铺开 + 段头吊镲
    add_ride(_s, 14, 52, beats=(0.0, 1.0, 2.0, 3.0), vel=44)
    add_ride(_s, 61, 68, beats=(0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5), vel=48)
    crash_heads(_s, [(5, 0), (53, 0), (61, 0), (69, 0)], vel=82)
    # (9) 点音铺开
    tick_accents(_s, [(5, 0), (53, 0), (61, 0), (69, 0)])
    eng.write()


if __name__ == '__main__':
    main()