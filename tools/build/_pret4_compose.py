# -*- coding: utf-8 -*-
"""tools/build/_pret4_compose.py —— 四面道中《フォールオブフォール ～ 秋めく滝》（瀑布溪谷编）

场景：妖怪之山 · 瀑布溪谷——千丈白瀑砸进深潭，水雾里天狗的影子一闪而过。
原曲：ZUN（Hisaraito 编曲版）「Fall of Fall ~ Autumnal Waterfall」163 BPM / 4-4 / B 小调 / 152 小节。
搬入：原曲 5-18 / 21-36 / 37-44 / 45-58 / 61-76 / 101-112 六段逐音搬入，前加 2 小节水声引子、后加 2 小节收束。
配器：主题三层同音 riff（CalliopeLead / EP2 / Harpsichord）拆给长笛+铜管 / 钢琴 / 大键琴；
      十六分琶音（ch8/ch10）当「瀑布」跑动；ch0/ch7 pad 铺水雾；bass + sub 走十六分水压。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _pret_lib import Song
from _pret_engine import Eng
from _pret_post import (copy_layer, copy_shift, sub_pedal, tick_accents,
                        crash_heads, add_ride, thin_crashes, thin_kind)

CFG = dict(
    name='pre4', title='フォールオブフォール ～ 秋めく滝（瀑布溪谷编）', export='FALL_PRE4', keyname='pre4',
    bpm=163.0, src='pre4', nbars=84,
    segs=[
        ('A1', 5, 18, 3),
        ('A2', 21, 36, 17),
        ('B', 37, 44, 33),
        ('C1', 45, 58, 41),
        ('C2', 61, 76, 55),
        ('D', 101, 112, 71),
    ],
    dyn={'A1': 0.94, 'A2': 0.96, 'B': 0.96, 'C1': 1.00, 'C2': 1.00, 'D': 1.03},
    voice={
        3:  [('lead', 0, 0.34, 1.0), ('bell', 12, 0.16, 0.9)],
        12: [('lead', 0, 0.28, 1.0)],
        4:  [('lead', 0, 0.34, 1.0), ('brass', 0, 0.44, 1.0)],
        5:  [('piano', 0, 0.55, 1.0)],
        6:  [('harpsi', 0, 0.60, 1.0)],
        11: [('strings', 0, 0.35, 1.0)],
        0:  [('pad', 0, 0.72, 1.0), ('strings', 0, 0.30, 1.0)],
        7:  [('choir', 0, 0.45, 1.0), ('strings', 0, 0.25, 1.0)],
        1:  [('bass', 0, 0.82, 1.0)],
        2:  [('bass', 0, 0.85, 1.0), ('sub', 0, 0.45, 1.0)],
        8:  [('arp', 0, 0.75, 1.0), ('piano', 0, 0.28, 1.0)],
        10: [('arp', 0, 0.45, 1.0), ('piano', 0, 0.35, 1.0)],
    },
    drum_ch=9,
    drum_map={35: 0, 36: 0, 38: 1, 40: 1, 37: 1, 39: 1, 42: 2, 44: 2, 46: 3,
              45: 5, 47: 5, 41: 6, 43: 6, 48: 6, 50: 6, 49: 4, 57: 4, 52: 4,
              51: 7, 53: 7, 55: 4},
)

TRACKS = [
    ('lead',    'triangle', 0.270),
    ('piano',   'triangle', 0.115),
    ('harpsi',  'square',   0.145),
    ('strings', 'sawtooth', 0.150),
    ('choir',   'sine',     0.110),
    ('bass',    'triangle', 0.180),
    ('sub',     'sine',     0.100),
    ('bell',    'sine',     0.125),
    ('pad',     'sine',     0.110),
    ('arp',     'sine',     0.140),
    ('brass',   'square',   0.150),
    ('tick',    'square',   0.090),
    ('riser',   'sawtooth', 0.050),
    ('reverse', 'sawtooth', 0.045),
]


def extra(eng):
    s = eng.song
    roots = {}
    for k, ns in eng.by_bar.items():
        lows = [n['m'] for n in ns if n['ch'] in (1, 2)]
        r = min(lows) if lows else 47
        while r < 28:
            r += 12
        while r > 47:
            r -= 12
        roots[k] = r

    s.section('intro', 1, 2)
    s.section('tail', 83, 84)

    # ---- 引子 1-2：水声 ----
    r0 = roots.get(5, 35)
    for i, m in enumerate((r0 + 12, r0 + 19, r0 + 24, r0 + 26, r0 + 31)):
        s.add('pad', s.bt(1), m, 8.0 * s.beat * 0.97, 50 - i * 3)
    s.add('sub', s.bt(1), r0, 8.0 * s.beat * 0.95, 66)
    s.add('choir', s.bt(1), r0 + 36, 8.0 * s.beat * 0.9, 28)
    # 瀑布：十六分下行琶音（B 小调：B D F# A）
    water = [86, 81, 78, 74, 71, 74, 78, 81, 83, 78, 74, 71, 66, 71, 74, 78]
    for i in range(32):
        b = 1 + i // 16
        t = s.bt(b) + (i % 16) * 0.25 * s.beat
        s.add('arp', t, water[i % 16], 0.22 * s.beat, 46 if i % 4 else 62)
    # 主题 riff 预告（原曲 5 小节头八音）
    pre = [n for n in eng.by_bar.get(5, ()) if n['ch'] == 4][:8]
    for i, n in enumerate(pre):
        t = s.bt(2) + i * 0.5 * s.beat
        s.add('lead', t, n['m'], 0.40 * s.beat, 68)
        s.add('brass', t, n['m'], 0.40 * s.beat, 50)
    for i in range(8):
        s.add('tick', s.bt(1 + i // 4, (i % 4) * 0.5), 93, 0.06, 40 if i % 2 == 0 else 26)
    s.drum(s.bt(1), 0, 78)
    s.drum(s.bt(2), 0, 86)
    s.drum(s.bt(2, 2), 1, 60)
    s.add('riser', s.bt(2, 2), 74, 2.0 * s.beat, 32)
    s.drum(s.bt(2, 3.5), 4, 78)

    # ---- 尾声 83-84：水潭回声 ----
    r1 = roots.get(112, r0)
    for i, m in enumerate((r1 + 12, r1 + 19, r1 + 24, r1 + 26)):
        s.add('pad', s.bt(83), m, 8.0 * s.beat * 0.98, 52 - i * 3)
    s.add('sub', s.bt(83), r1, 8.0 * s.beat * 0.96, 66)
    s.add('choir', s.bt(83), r1 + 36, 8.0 * s.beat * 0.9, 30)
    for i, (beat, m) in enumerate(((0.0, 74), (0.5, 78), (1.0, 83), (2.0, 78), (3.0, 71))):
        s.add('lead', s.bt(83, beat), m, 0.55 * s.beat, 62)
        s.add('bell', s.bt(83, beat), m + 12, 0.7 * s.beat, 58)
    for i, (beat, m) in enumerate(((0.0, 71), (1.0, 74), (2.0, 66), (3.0, 71))):
        s.add('bell', s.bt(84, beat), m, 0.9 * s.beat, 52)
    for i in range(8):
        s.add('tick', s.bt(84, i * 0.5), 93, 0.06, 34 if i % 2 == 0 else 24)
    s.drum(s.bt(83), 0, 88)
    s.drum(s.bt(84), 0, 72)
    s.drum(s.bt(84), 4, 66)


CFG['extra'] = extra


def main():
    eng = Eng(CFG)
    eng.song.defs(TRACKS)
    eng.run()
    eng.doubles([('strings', 0, 0.26, 1.0, 100)], 3, 82)
    eng.doubles([('bell', 12, 0.22, 0.9, 100)], 55, 82)

    # ================= v1.6.70 全改 =================
    _s = eng.song
    # (3) 镲片稀疏化：656 击 -> 约 1/3
    thin_crashes(_s, keep_mod=3)
    add_ride(_s, 3, 82, beats=(0.0, 1.0, 2.0, 3.0), vel=46)
    # (3) C1 闭镲稀疏 1/4，与 C2 密度靠拢
    thin_kind(_s, 2, 41, 54, mod=4)
    # (3) C1 补铜管和声（与 C2 一致）
    copy_layer(_s, 'lead', 'brass', 41, 54, shift=0, vmul=0.45, hi=100)
    # (8) C2 变化：旋律八度加层
    copy_layer(_s, 'lead', 'lead', 55, 70, shift=12, vmul=0.32, hi=100)
    # (2) 低频踏板
    sub_pedal(_s, vel=66)
    # (9) 点音铺开
    tick_accents(_s, [(3, 0), (17, 0), (33, 0), (41, 0), (55, 0), (71, 0), (83, 0)])
    crash_heads(_s, [(3, 0), (17, 0), (33, 0), (41, 0), (55, 0), (71, 0)], vel=88)
    eng.write()


if __name__ == '__main__':
    main()
