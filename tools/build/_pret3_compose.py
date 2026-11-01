# -*- coding: utf-8 -*-
"""tools/build/_pret3_compose.py —— 三面道中《ルーネイトエルフ》（冰蓝晨曦编）

场景：雾之湖 · 冰蓝晨曦——湖面结着薄冰，晨光把雾照成淡蓝色，远处有冰晶落下的声音。
原曲：ZUN TH06「4. Lunate Elf」143 BPM / 4-4 / E 小调 / 52 小节（本编 56 小节 / 94.0s）。
搬入：原曲 1-52 逐音搬入 → 新 3-54，前后各加 2 小节新写引子/尾声。
配器：长笛主旋律换成方形波 + 弦乐齐奏；钢琴块冰晶化（三角波 + 大键琴硬度点）；
      十六分贝斯 riff 交给贝斯与 sub；长音交给管风琴/弦乐；鼓照原曲 ch9 重配（62/63 归到 ride）。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _pret_lib import Song
from _pret_engine import Eng
from _pret_post import (copy_layer, copy_shift, sub_pedal, tick_accents,
                        crash_heads, add_ride, thin_crashes, thin_kind)

CFG = dict(
    name='pre3', title='ルーネイトエルフ（冰蓝晨曦编）', export='LUNATE_PRE3', keyname='pre3',
    bpm=143.0, src='pre3', nbars=56,
    segs=[('BODY', 1, 52, 3)],
    dyn={'BODY': 1.00},
    voice={
        2:  [('lead', 0, 1.00, 1.0)],
        3:  [('piano', 0, 0.62, 1.0), ('harpsi', 0, 0.38, 1.0)],
        1:  [('bass', 0, 0.92, 1.0)],
        6:  [('pad', 0, 0.70, 1.0), ('strings', 0, 0.32, 1.0)],
        4:  [('strings', 0, 0.52, 1.0)],
        5:  [('choir', 0, 0.46, 1.0)],
    },
    drum_ch=9,
    drum_map={36: 0, 35: 0, 38: 1, 40: 1, 37: 1, 42: 2, 44: 2, 46: 3, 49: 4, 57: 4,
              62: 7, 63: 7, 41: 6, 43: 6, 45: 5, 47: 5, 48: 6, 50: 6, 51: 7, 53: 7},
)

TRACKS = [
    ('lead',    'square',   0.245),
    ('piano',   'triangle', 0.170),
    ('harpsi',  'square',   0.320),
    ('strings', 'sawtooth', 0.245),
    ('choir',   'sine',     0.135),
    ('bass',    'triangle', 0.195),
    ('sub',     'sine',     0.105),
    ('bell',    'sine',     0.150),
    ('pad',     'sine',     0.105),
    ('arp',     'sine',     0.120),
    ('tick',    'square',   0.090),
    ('riser',   'sawtooth', 0.050),
    ('reverse', 'sawtooth', 0.045),
]


def extra(eng):
    s = eng.song
    roots = {}
    for k, ns in eng.by_bar.items():
        lows = [n['m'] for n in ns if n['ch'] in (1, 6)]
        r = min(lows) if lows else 40
        while r < 28:
            r += 12
        roots[k] = r

    for tag, b0, b1 in (('A1', 3, 10), ('A2', 11, 18), ('B1', 19, 34), ('B2', 35, 38), ('C', 39, 50), ('coda', 51, 54)):
        s.section(tag, b0, b1)

    # ---- 新引子 1-2：冰面反光 ----
    s.section('intro', 1, 2)
    r0 = roots.get(5, 40)
    while r0 < 33:
        r0 += 12
    for i, m in enumerate((r0, r0 + 7, r0 + 12, r0 + 15)):
        s.add('pad', s.bt(1), m, 8.0 * s.beat * 0.97, 46 - i * 4)
    s.add('sub', s.bt(1), r0 - 12, 8.0 * s.beat * 0.95, 58)
    s.add('choir', s.bt(1), r0 + 24, 8.0 * s.beat * 0.9, 26)
    # 冰晶：高音五声 32 分 + 回声
    ice = [99, 96, 92, 88, 91, 95, 96, 92]
    for i in range(24):
        b = 1 + i // 12
        t = s.bt(b) + (i % 12) * 0.125 * s.beat
        s.add('bell', t, ice[(i * 3) % 8], 0.13, 44 if i % 3 else 58)
    # 长笛动机预告（原曲 ch2 第 9 小节的四个音）
    preview = [78, 81, 83, 78, 76, 79, 71, 76]
    for i, m in enumerate(preview):
        t = s.bt(2) + i * 0.5 * s.beat
        s.add('lead', t, m, 0.42 * s.beat, 66)
    for i in range(8):
        s.add('tick', s.bt(1 + i // 4, (i % 4) * 0.5), 93, 0.06, 44 if i % 2 == 0 else 30)
    s.drum(s.bt(1), 0, 72)
    s.drum(s.bt(2), 0, 80)
    s.add('riser', s.bt(2, 1.5), 74, 2.5 * s.beat, 32)
    s.drum(s.bt(2, 3.5), 4, 72)

    # ---- 主体开头的空拍（原曲 bar1-2 本身是休止）：冰面留白 ----
    for nb in (3, 4):
        t0 = s.bt(nb)
        for i, dm in enumerate((0, 7, 12, 15)):
            s.add('pad', t0, r0 + dm, s.bar * 0.99, 94 - i * 6)
        s.add('sub', t0, r0 - 12, s.bar * 0.99, 90)
        s.add('bass', t0, r0, s.bar * 0.95, 98)
        s.add('choir', t0, r0 + 24, s.bar * 0.9, 50)
        s.drum(t0, 0, 96)
        s.drum(t0 + 2 * s.beat, 0, 80)
    for i in range(32):
        b = 3 + i // 16
        t = s.bt(b) + (i % 16) * 0.125 * s.beat
        s.add('bell', t, ice[(i * 3) % 8], 0.10, 44 if i % 2 else 64)
    for i in range(8):
        s.add('tick', s.bt(3 + i // 4, (i % 4) * 0.5), 93, 0.06, 52 if i % 2 == 0 else 36)
    s.add('riser', s.bt(4, 2.0), 74, 2.0 * s.beat, 38)

    # ---- 尾声 55-56：雾散 ----
    s.section('tail', 55, 56)
    r1 = roots.get(49, r0)
    while r1 < 33:
        r1 += 12
    for i, m in enumerate((r1, r1 + 7, r1 + 12, r1 + 15)):
        s.add('pad', s.bt(55), m, 6.4 * s.beat, 48 - i * 4)
    s.add('sub', s.bt(55), r1 - 12, 6.4 * s.beat, 58)
    s.add('choir', s.bt(55), r1 + 24, 6.0 * s.beat, 28)
    for i, (beat, m) in enumerate(((0.0, 88), (0.5, 91), (1.0, 96), (2.0, 91), (3.0, 83))):
        s.add('bell', s.bt(55, beat), m, 0.7 * s.beat, 70)
    for i, (beat, m) in enumerate(((0.0, 76), (1.5, 79), (2.5, 83), (3.5, 76))):
        s.add('lead', s.bt(56, beat), m, 0.6 * s.beat, 58)
        s.add('bell', s.bt(56, beat), m + 12, 0.6 * s.beat, 44)
    s.drum(s.bt(55), 0, 78)
    s.drum(s.bt(56, 0), 0, 70)
    s.drum(s.bt(56), 4, 64)


CFG['extra'] = extra


def main():
    eng = Eng(CFG)
    eng.song.defs(TRACKS)
    eng.run()
    # 主旋律弦乐齐奏（再现段更厚）：3-54 全曲轻度加倍，后半（30-54）再叠八音盒
    eng.doubles([('strings', 0, 0.34, 1.0, 100)], 3, 54)
    eng.doubles([('bell', 12, 0.34, 0.9, 100), ('choir', 0, 0.20, 1.0, 84)], 34, 54)

    # ================= v1.6.70 全改 =================
    _s = eng.song
    # (5) B1 段补合唱层
    copy_layer(_s, 'strings', 'choir', 19, 34, shift=0, vmul=0.55)
    # (1) C 段八音盒点音补厚
    copy_layer(_s, 'lead', 'bell', 39, 50, shift=12, vmul=0.32, hi=100)
    # (2) 低频踏板
    sub_pedal(_s, vel=64)
    # (9) 点音铺开
    tick_accents(_s, [(3, 0), (11, 0), (19, 0), (35, 0), (39, 0), (51, 0), (55, 0)])
    crash_heads(_s, [(3, 0), (19, 0), (39, 0), (51, 0)], vel=80)
    eng.write()


if __name__ == '__main__':
    main()