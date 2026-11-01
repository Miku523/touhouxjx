# -*- coding: utf-8 -*-
"""tools/build/_pret1_compose.py —— 一面道中《ほおずきみたいに紅い魂》（夜樱小径编）

场景：博丽神社 · 夜樱小径——入夜的参道，樱瓣落在石灯笼上，远处有祭典的余光。
原曲：ZUN TH06「2. A Soul that is Red, like a Ground Cherry」145 BPM / 4-4 / G 小调 / 53 小节。
搬入：原曲 1-52 小节逐音搬入（-12 八度重复层一律去重），前加 2 小节「夜樱」引子、
      后加 2 小节回环尾声，共 56 小节 / 92.69s。
配器：主旋律三角波长笛 + 八音盒高八度；伴奏大键琴（筝感）与钢琴颗粒；弦乐与管风琴铺底；
      鼓组压成「夜间行路」的轻四拍（闭镲八分 + 军鼓 2/4 反拍 + 少量通鼓），
      只在 A/B/C 段头给吊镲。
"""
import os, sys, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _pret_lib import Song
from _pret_engine import Eng
from _pret_post import (copy_layer, copy_shift, sub_pedal, tick_accents,
                        crash_heads, add_ride, thin_crashes, thin_kind)

CFG = dict(
    name='pre1', title='ほおずきみたいに紅い魂（夜樱小径编）', export='HONOU_PRE1', keyname='pre1',
    bpm=145.0, src='pre1', nbars=56, drum_ch=-1,
    segs=[
        ('A0', 1, 12, 3),
        ('A', 13, 28, 15),
        ('B', 29, 36, 31),
        ('C', 37, 44, 39),
        ('bridge', 45, 48, 47),
        ('coda', 49, 52, 51),
    ],
    dyn={'A0': 0.92, 'A': 1.00, 'B': 0.97, 'C': 0.90, 'bridge': 0.88, 'coda': 1.00},
    voice={
        1:  [('bass', 0, 0.95, 1.0)],
        2:  [('strings', 0, 0.80, 1.0)],
        7:  [('strings', 0, 0.60, 1.0)],
        3:  [('lead', 0, 0.85, 1.0), ('brass', 0, 0.55, 1.0), ('bell', 12, 0.40, 0.8)],
        5:  [('lead', 0, 1.00, 1.0), ('strings', 0, 0.30, 1.0)],
        12: [('lead', 0, 0.90, 1.0), ('piano', 0, 0.60, 1.0)],
        4:  [('harpsi', 0, 0.62, 0.85), ('pad', 0, 0.22, 1.0)],
        6:  [('piano', 0, 0.60, 0.95), ('harpsi', 0, 0.28, 0.9)],
        8:  [('piano', 0, 0.62, 1.0)],
    },
)

TRACKS = [
    ('lead',    'triangle', 0.285),
    ('piano',   'triangle', 0.095),
    ('harpsi',  'square',   0.180),
    ('strings', 'sawtooth', 0.230),
    ('brass',   'square',   0.165),
    ('choir',   'sine',     0.070),
    ('bass',    'triangle', 0.250),
    ('sub',     'sine',     0.130),
    ('bell',    'sine',     0.135),
    ('pad',     'sine',     0.135),
    ('arp',     'sine',     0.110),
    ('tick',    'square',   0.090),
    ('tickhi',  'sine',     0.085),
    ('riser',   'sawtooth', 0.050),
    ('reverse', 'sawtooth', 0.045),
]


def bass_roots(eng, b0, b1):
    out = {}
    for k in range(b0, b1 + 1):
        ns = [n['m'] for n in eng.by_bar.get(k, ()) if n['ch'] == 1]
        out[k] = min(ns) if ns else 43
        while out[k] < 28:
            out[k] += 12
    return out


def extra(eng):
    s = eng.song
    R = bass_roots(eng, 1, 52)
    sec_of_new = {}
    for tag, sb0, sb1, nb0 in CFG['segs']:
        for i in range(sb1 - sb0 + 1):
            sec_of_new[nb0 + i] = tag

    def root(bar):
        return R.get(bar, 43)

    # ---------- 鼓组 ----------
    # A0（原曲 1-12）：夜间行路的轻四拍，闭镲十六分压低，军鼓只在 2/4 低力度
    for b in range(3, 15):
        kick = (0, 2) if b < 7 else (0, 2, 2.5)
        for k in kick:
            s.drum(s.bt(b, k), 0, 116 if k == 0 else 100)
        for k in (1, 3):
            s.drum(s.bt(b, k), 1, 74)
        for i in range(16):
            s.drum(s.bt(b, i * 0.25), 2, 96 if i % 4 else 116)
        s.drum(s.bt(b, 1.5), 3, 104)
        s.drum(s.bt(b, 3.5), 3, 108)
    s.drum(s.bt(9), 4, 84)
    s.drum(s.bt(13), 4, 80)
    # A（原曲 13-28）：主题进来，节奏抬起，ride 铺八分
    for b in range(15, 31):
        s.drum(s.bt(b, 0), 0, 120)
        s.drum(s.bt(b, 2), 0, 108)
        if b % 4 == 3:
            s.drum(s.bt(b, 3.5), 0, 92)
        s.drum(s.bt(b, 1), 1, 104)
        s.drum(s.bt(b, 3), 1, 120)
        for i in range(16):
            s.drum(s.bt(b, i * 0.25), 2, 104 if i % 4 else 120)
        s.drum(s.bt(b, 1.5), 3, 112)
        s.drum(s.bt(b, 3.5), 3, 116)
        for i in range(4):
            s.drum(s.bt(b, i), 7, 96)
        if b % 2 == 0:
            s.drum(s.bt(b, 2.5), 6, 74)
    for b in (15, 19, 23, 27):
        s.drum(s.bt(b), 4, 96)
    for b in (16, 24):
        s.drum(s.bt(b, 3.5), 5, 92)
        s.drum(s.bt(b, 3.75), 5, 98)
    # B（原曲 29-36）：圆号接主题，鼓加通鼓与反拍开镲
    for b in range(31, 39):
        s.drum(s.bt(b, 0), 0, 118)
        s.drum(s.bt(b, 2), 0, 106)
        s.drum(s.bt(b, 1), 1, 116)
        s.drum(s.bt(b, 3), 1, 122)
        for i in range(16):
            s.drum(s.bt(b, i * 0.25), 2, 46 if i % 4 else 62)
        s.drum(s.bt(b, 1.5), 3, 114)
        s.drum(s.bt(b, 3.5), 3, 118)
        for i in range(4):
            s.drum(s.bt(b, i), 7, 98)
        if b in (33, 37):
            s.drum(s.bt(b, 2.5), 6, 84)
            s.drum(s.bt(b, 2.75), 5, 90)
    s.drum(s.bt(31), 4, 90)
    s.drum(s.bt(35), 4, 86)
    # C（原曲 37-44）：钢琴接旋律，十六分闭镲提亮
    for b in range(39, 47):
        s.drum(s.bt(b, 0), 0, 120)
        s.drum(s.bt(b, 2), 0, 110)
        s.drum(s.bt(b, 3.5), 0, 96)
        s.drum(s.bt(b, 1), 1, 106)
        s.drum(s.bt(b, 3), 1, 112)
        for i in range(16):
            s.drum(s.bt(b, i * 0.25), 2, 104 if i % 4 else 122)
        s.drum(s.bt(b, 1.5), 3, 114)
        s.drum(s.bt(b, 3.5), 3, 120)
        for i in range(4):
            s.drum(s.bt(b, i), 7, 100)
        if b % 2 == 0:
            s.drum(s.bt(b, 1.25), 6, 70)
    s.drum(s.bt(39), 4, 98)
    s.drum(s.bt(43), 4, 94)
    s.drum(s.bt(46, 3), 5, 96)
    s.drum(s.bt(46, 3.25), 5, 102)
    s.drum(s.bt(46, 3.5), 6, 98)
    s.drum(s.bt(46, 3.75), 6, 92)
    # bridge（原曲 45-48）：鼓退成心跳 + ride
    for b in range(47, 51):
        s.drum(s.bt(b, 0), 0, 104)
        s.drum(s.bt(b, 2.5), 0, 84)
        for i in range(4):
            s.drum(s.bt(b, i), 7, 104)
        for i in range(8):
            s.drum(s.bt(b, i * 0.5), 2, 54)
    s.drum(s.bt(50, 3), 9, 62, 0.5)
    # coda（原曲 49-52）：全部回来
    for b in range(51, 55):
        s.drum(s.bt(b, 0), 0, 120)
        s.drum(s.bt(b, 2), 0, 112)
        s.drum(s.bt(b, 1), 1, 106)
        s.drum(s.bt(b, 3), 1, 112)
        for i in range(16):
            s.drum(s.bt(b, i * 0.25), 2, 48 if i % 4 else 64)
        s.drum(s.bt(b, 1.5), 3, 68)
        s.drum(s.bt(b, 3.5), 3, 72)
        for i in range(4):
            s.drum(s.bt(b, i), 7, 44)
    s.drum(s.bt(51), 4, 102)
    s.drum(s.bt(53), 4, 86)

    # C 段（新 39-46 / 原 37-44）：原曲此处小号只有两音，主奏实为 ch6 十六分琶音
    # → 复制成 lead（同度）+ 八音盒高八度，让 C 段重新有明确主旋律线
    for b in range(39, 47):
        src = b - 2
        for n in eng.by_bar.get(src, ()):
            if n['ch'] != 6:
                continue
            t = s.bt(b, n['beat'])
            s.add('lead', t, n['m'], n['d'], n['v'] * 0.34)
            if n['m'] + 12 <= 102:
                s.add('bell', t, n['m'] + 12, max(0.10, n['d'] * 0.9), n['v'] * 0.16)

    # 鼓组 ghost 层：给主段补密度与推进感（底鼓反拍 + 十六分 ghost 军鼓）
    for b in range(15, 55):
        s.drum(s.bt(b, 2.5), 0, 88)
        s.drum(s.bt(b, 3.5), 0, 84)
        for k in (1.75, 3.75):
            s.drum(s.bt(b, k), 1, 58)
        if b % 2 == 1:
            s.drum(s.bt(b, 3.25), 6, 74)

    # ---------- 引子（新 1-2）：夜樱 ----------
    # 管风琴 / 弦乐铺底 + 筝感分解 + 风铃 + 心跳
    g = 43  # G2
    for b in (1, 2):
        t0 = s.bt(b)
        for m, d, v in ((g, 4.0, 52), (g + 7, 4.0, 44), (g + 12, 4.0, 40),
                        (g + 15, 4.0, 34), (g + 19, 4.0, 30)):
            s.add('pad', t0, m, d * s.beat * 0.98, v)
        s.add('choir', t0, g + 24, 4.0 * s.beat * 0.95, 26)
        s.add('bass', t0, g, 4.0 * s.beat * 0.98, 76)
        s.add('sub', t0, g - 12, 4.0 * s.beat * 0.98, 62)
        s.drum(t0, 0, 88)
    # 筝感十六分分解（G 小调五声：G A# C D F）
    pat = [67, 70, 74, 70, 79, 74, 70, 67]
    for i in range(16):
        t = s.bt(1) + i * 0.25 * s.beat
        s.add('harpsi', t, pat[i % 8], 0.22 * s.beat, 52 if i % 4 else 66)
    pat2 = [74, 70, 67, 70, 75, 70, 67, 74]
    for i in range(16):
        t = s.bt(2) + i * 0.25 * s.beat
        s.add('harpsi', t, pat2[i % 8], 0.22 * s.beat, 48 if i % 4 else 62)
    # 风铃（八音盒）主旋律碎片：原曲 A 段头四音的上五度影射
    for i, (beat, m) in enumerate(((0.0, 86), (1.5, 82), (2.5, 79), (3.0, 74))):
        s.add('bell', s.bt(1, beat), m, 0.55 * s.beat, 74)
        s.add('bell', s.bt(2, beat), m + (0 if i % 2 == 0 else 12), 0.55 * s.beat, 62)
    # 心跳 + 钟摆 + 花瓣
    for i in range(8):
        s.add('tick', s.bt(1, i * 0.5), 93, 0.06, 42 if i % 2 == 0 else 30)
    s.add('riser', s.bt(2, 2.0), 74, 2.0 * s.beat, 34)
    s.add('reverse', s.bt(2, 3.9), 74, 0.9, 34)
    s.drum(s.bt(2, 3.5), 4, 66)

    # ---------- 尾声（新 55-56）：回环到引子和声 ----------
    t0 = s.bt(55)
    for m, d, v in ((g, 4.0, 58), (g + 7, 4.0, 48), (g + 12, 4.0, 44), (g + 15, 4.0, 36)):
        s.add('pad', t0, m, d * s.beat * 0.98, v)
    s.add('bass', t0, g, 4.0 * s.beat * 0.98, 80)
    s.add('sub', t0, g - 12, 4.0 * s.beat * 0.98, 64)
    s.add('choir', t0, g + 24, 4.0 * s.beat * 0.95, 28)
    for i, (beat, m) in enumerate(((0.0, 79), (0.5, 82), (1.0, 86), (2.0, 82), (3.0, 74))):
        s.add('bell', s.bt(55, beat), m, 0.7 * s.beat, 78)
    for i, (beat, m) in enumerate(((0.0, 74), (1.0, 70), (2.0, 67), (3.0, 74))):
        s.add('bell', s.bt(56, beat), m, 0.9 * s.beat, 66)
    for i in range(8):
        s.add('tick', s.bt(55, i * 0.5), 93, 0.06, 40 if i % 2 == 0 else 28)
    s.drum(s.bt(55, 0), 0, 92)
    s.drum(s.bt(55, 2), 0, 84)
    for i in range(4):
        s.drum(s.bt(55, i), 7, 42)
    s.drum(s.bt(56, 2), 0, 80)
    s.drum(s.bt(56, 3), 9, 46, 0.7)


CFG['extra'] = extra


def main():
    eng = Eng(CFG)
    eng.song.defs(TRACKS)
    eng.run()
    # 主旋律八音盒加倍（A/B/C 全段），高音区留白
    eng.doubles([('bell', 12, 0.32, 0.85, 100)], 15, 54)

    # ================= v1.6.70 全改 =================
    _s = eng.song
    # (6) A 段织体：弦乐同度齐奏 + 铜管和声
    copy_layer(_s, 'lead', 'strings', 15, 30, shift=0, vmul=0.55)
    copy_layer(_s, 'lead', 'brass', 15, 30, shift=0, vmul=0.42)
    # (1) C 段主奏（钢琴十六分）再叠八音盒高八度
    copy_layer(_s, 'lead', 'bell', 39, 46, shift=12, vmul=0.30, hi=100)
    # (2) 低频踏板
    sub_pedal(_s, vel=66)
    # (9) 点音铺开
    tick_accents(_s, [(3, 0), (15, 0), (31, 0), (39, 0), (47, 0), (51, 0), (55, 0)])
    crash_heads(_s, [(15, 0), (31, 0), (39, 0), (47, 0), (51, 0)], vel=84)
    song = eng.write()
    return song


if __name__ == '__main__':
    main()