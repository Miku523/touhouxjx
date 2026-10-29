# -*- coding: utf-8 -*-
"""EX 面 BOSS《恶魔之妹》v3 —— 芙兰朵露·斯卡雷特 / 红月下被囚禁的 495 年。

200 BPM, D 小调, 4/4, 125 小节 = 150.0s 循环（1 小节 1.2s）：

  引子 I   1-8    八音盒摇篮曲 / 钟摆 / 心跳 / 红月
  引子 II  9-16   时钟琶音 + 钟琴把 U.N. 副歌哼一遍（引用）；13 起乐队走进来
  A1       17-24  主歌：只留 bass / 鼓 / 钢琴 / 人声（减编制）
  A2       25-32  同一主题加压：弦乐、合唱、后半句抬到 Eb
  B        33-40  癫狂：半音对句 + blast beat + 钟琴引用
  C1       41-56  副歌（新写 topline）两遍：第一遍克制，第二遍全编制
  Bridge   57-64  时停 / 495 年的空白；61-64 起浪
  B2       65-72  第二波癫狂（更硬）+ 尖叫句
  C2       73-80  副歌 hero（只一遍，排最满）
  D        81-88  坏掉的钟：羽管键琴 32 分半音暴走 + 钟琴把 U.N. 再砸一遍
  Solo     89-96  时钟琶音 + lead 十六分跑句
  Break    97-101 半速 build（5 小节，刀/钟/心跳）
  C3       102-109 全体升半音（红月到顶）
  Coda     110-117 崩塌：八音盒把副歌还成摇篮曲
  Outro    118-125 回环：引子的摇篮曲 + 心跳，接回循环点

作曲原则（v3）：
  * 副歌是**原创 topline**（D-F-G-F-E-G / A-F-D-D-Bb-D / ...），八小节、可哼、每句落和弦音；
    U.N. 副歌 hook 不再当主段，只作引子 II / D 段 / coda 的引用（bell），退居「记忆」；
  * 主歌减编制，副歌才全开；吉他只在 B/C/D 段出现，A 段没有十六分吉他墙；
  * 「疯」由 blast beat、32 分羽管键琴、半音下行、升半音副歌提供，而不是靠堆轨道。
tools/build/_fld_compose3.py 生成，勿手改。
"""
import os
import sys
import json

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import _fld_compose2 as c2

BPM = 200
BEAT = 60.0 / BPM            # 0.3 s
BAR = 4 * BEAT               # 1.2 s
DURATION = 150.0
BARS = 125

c2.BPM, c2.BEAT, c2.BAR, c2.DURATION, c2.BARS = BPM, BEAT, BAR, DURATION, BARS
c2.DRUM_SCALE = 0.74

PC, QUAL = c2.PC, c2.QUAL
midi, tones, norm, power, chord_voicing = c2.midi, c2.tones, c2.norm, c2.power, c2.chord_voicing
add, hit, hit_x = c2.add, c2.hit, c2.hit_x
fill_toms, fill_roll, crash, swish, ride_bar = c2.fill_toms, c2.fill_roll, c2.crash, c2.swish, c2.ride_bar
drums_four, drums_drive, drums_hard, drums_blast, drums_half = (c2.drums_four, c2.drums_drive,
    c2.drums_hard, c2.drums_blast, c2.drums_half)
pad_hold, power_sustain, choir_chord, brass_stabs = c2.pad_hold, c2.power_sustain, c2.choir_chord, c2.brass_stabs
bass_8ths, bass_drive, chug, arp_cycle = c2.bass_8ths, c2.bass_drive, c2.chug, c2.arp_cycle

FORM = [('intro1', 1, 8), ('intro2', 9, 16), ('A1', 17, 24), ('A2', 25, 32),
        ('B', 33, 40), ('C1', 41, 56), ('bridge', 57, 64), ('B2', 65, 72),
        ('C2', 73, 80), ('D', 81, 88), ('solo', 89, 96), ('break', 97, 101),
        ('C3', 102, 109), ('coda', 110, 117), ('outro', 118, 125)]

c2.CHORDS = {}
c2.HALF = {}


def sec(b0, seq):
    for i, (r, q) in enumerate(seq):
        c2.CHORDS[b0 + i] = (r, q)


def halves(b0, seq4):
    for i in range(8):
        c2.HALF[b0 + i] = seq4[i % 4]


sec(1,   [('D','m'),('D','m'),('Bb','maj'),('Bb','maj'),
          ('G','m'),('G','m'),('A','7'),('A','7')])
sec(9,   [('D','m'),('D','m'),('Bb','maj'),('Bb','maj'),
          ('G','m'),('G','m'),('A','7'),('A','7')])
sec(17,  [('D','m'),('C','maj'),('D','m'),('Bb','maj'),
          ('D','m'),('C','maj'),('E','dim'),('A','7')])
sec(25,  [('D','m'),('C','maj'),('D','m'),('Bb','maj'),
          ('Eb','maj'),('D','m'),('A','7'),('D','m')])
sec(33,  [('D','m'),('F','maj'),('E','maj'),('G','m'),
          ('E','maj'),('G','m'),('Eb','maj'),('A','7')])
CH = [(('Bb','maj'),('C','maj')), (('D','m'),('G','m')),
      (('Bb','maj'),('C','maj')), (('D','m'),('D','m'))]
halves(41, CH)
halves(49, CH)
sec(57,  [('D','m'),('Eb','maj'),('D','m'),('Eb','maj'),
          ('Bb','maj'),('A','7'),('D','m'),('A','7')])
sec(65,  [('D','m'),('F','maj'),('E','maj'),('G','m'),
          ('E','maj'),('G','m'),('Eb','maj'),('A','7')])
halves(73, CH)
sec(81,  [('Bb','maj'),('Bb','maj'),('A','7'),('A','7'),
          ('G','m'),('G','m'),('Eb','maj'),('A','7')])
sec(89,  [('D','m'),('C','maj'),('D','m'),('Bb','maj'),
          ('Eb','maj'),('D','m'),('A','7'),('D','m')])
sec(97,  [('Bb','maj'),('C','maj'),('D','m'),('D','m'),('A','7')])
halves(102, [(('B','maj'),('C#','maj')), (('Eb','m'),('Ab','m')),
             (('B','maj'),('C#','maj')), (('Eb','m'),('Eb','m'))])
sec(110, [('D','m'),('Bb','maj'),('G','m'),('A','7'),
          ('D','m'),('Bb','maj'),('D','m'),('D','m')])
sec(118, [('D','m'),('D','m'),('Bb','maj'),('Bb','maj'),
          ('G','m'),('G','m'),('A','7'),('A','7')])

c2.TRACK_DEFS = [
    ('guitar', 'sawtooth', 0.058),
    ('lead', 'sawtooth', 0.200),
    ('harpsi', 'square', 0.072),
    ('brass', 'square', 0.068),
    ('strings', 'sawtooth', 0.052),
    ('choir', 'sine', 0.055),
    ('bass', 'triangle', 0.120),
    ('piano', 'sine', 0.085),
    ('bell', 'sine', 0.115),
    ('tick', 'square', 0.048),
    ('pad', 'sine', 0.030),
    ('counter', 'triangle', 0.048),
    ('arp', 'sine', 0.078),
    ('knife', 'square', 0.058),
    ('riser', 'sawtooth', 0.050),
]
c2.TRACKS = {name: [] for name, _, _ in c2.TRACK_DEFS}
c2.DRUMS = []

INTRO1, CLOCK, INTRO2_LEAD = c2.INTRO1, c2.CLOCK, c2.INTRO2_LEAD
MEL_A1, MEL_A2 = c2.MEL_A1, c2.MEL_A2
MEL_B, MEL_B2 = c2.MEL_B, c2.MEL_B2
SOLO, BREAK_LEAD, CHIME, UN = c2.SOLO, c2.BREAK_LEAD, c2.CHIME, c2.HOOK

# ---------------- 副歌 topline（原创，8 小节，200BPM） ----------------
# 和声 2 拍一换：Bb|C / Dm|Gm / Bb|C / Dm|Dm，四小节一循环
CH8 = {
    1: [(0.0, 74, 0.5), (0.5, 77, 0.5), (1.0, 79, 0.5), (1.5, 77, 0.5), (2.0, 76, 1.0), (3.0, 79, 1.0)],
    2: [(0.0, 81, 1.0), (1.0, 77, 0.5), (1.5, 74, 0.5), (2.0, 74, 0.5), (2.5, 70, 0.5), (3.0, 74, 1.0)],
    3: [(0.0, 77, 0.5), (0.5, 79, 0.5), (1.0, 74, 0.5), (1.5, 77, 0.5), (2.0, 79, 1.0), (3.0, 76, 1.0)],
    4: [(0.0, 74, 1.0), (1.0, 77, 1.0), (2.0, 81, 2.0)],
    5: [(0.0, 74, 0.5), (0.5, 77, 0.5), (1.0, 79, 0.5), (1.5, 77, 0.5), (2.0, 84, 1.0), (3.0, 79, 0.5), (3.5, 76, 0.5)],
    6: [(0.0, 81, 1.0), (1.0, 77, 0.5), (1.5, 74, 0.5), (2.0, 74, 1.0), (3.0, 70, 1.0)],
    7: [(0.0, 77, 0.5), (0.5, 79, 0.5), (1.0, 82, 1.0), (2.0, 79, 1.0), (3.0, 76, 1.0)],
    8: [(0.0, 81, 1.5), (1.5, 79, 0.5), (2.0, 77, 1.0), (3.0, 74, 1.0)],
}


def quote_un(bar, i, octv=0, vel=40, dur=0.5):
    """钟琴引用 U.N. 副歌 hook 的一小节。"""
    for off, p, d in UN[i]:
        add('bell', bar, off, p + 12 * octv, max(d, dur * 0.6), vel)


def sec_intro1():
    for bar in range(1, 9):
        pad_hold(bar, 4.0, 30)
        root, q = c2.CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.6, 42)
    for bar, notes in INTRO1.items():
        for off, p, d, v in notes:
            add('bell', bar, off, p, d, v)
    for bar in range(1, 9):
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 18 if abs(o - round(o)) < 1e-6 else 12)
            o += 0.5
    for bar in (1, 3, 5):
        hit(bar, 0.0, 0, 58)
        hit(bar, 0.5, 0, 38)
    for bar in (7, 8):
        hit(bar, 0.0, 0, 68)
        hit(bar, 0.5, 0, 44)
        hit(bar, 2.0, 0, 60)
    for bar, off in ((4, 3.25), (8, 3.0)):
        add('knife', bar, off, 96, 0.5, 50)
    swish(8, 2.0, 50)
    add('riser', 8, 2.5, 41, 1.4, 56)


def sec_intro2():
    """9-16：时钟琶音 + 钟琴把 U.N. 副歌哼一遍；13 起乐队进来。"""
    for bar in range(9, 17):
        pad_hold(bar, 4.0, 28)
    for bar in range(9, 13):
        arp_cycle('harpsi', bar, CLOCK, step=0.25, dur=0.16, vel=58)
        root, q = c2.CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.6, 54)
        quote_un(bar, bar - 9, octv=-1, vel=40, dur=0.5)
    for bar in range(13, 17):
        bass_8ths(bar, 92)
        power_sustain('strings', bar, 38)
        for off, p, d in INTRO2_LEAD[bar]:
            add('lead', bar, off, p, d, 102)
    for bar in range(9, 13):
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 16 if abs(o - round(o)) < 1e-6 else 10)
            o += 0.5
    for bar in (13, 14):
        hit(bar, 0.0, 0, 82)
        hit(bar, 2.0, 0, 74)
        hit(bar, 0.5, 2, 32)
        hit(bar, 1.5, 2, 26)
        hit(bar, 2.5, 2, 32)
        hit(bar, 3.5, 2, 26)
    for bar in (15, 16):
        drums_four(bar, crash_at=0.0 if bar == 15 else None, hats16=False, snare=90)
    fill_toms(16, 2.0, 0.25, 74, 106)
    fill_roll(16, 3.0, 1.0, 102)
    crash(17, 0.0, 94)


def sec_a1():
    """A1（17-24）：主歌，减编制——只留 lead / bass / 鼓 / 钢琴 / 轻钟摆。"""
    for bar in range(17, 25):
        for off, p, d in MEL_A1[bar]:
            add('lead', bar, off, p, d, 112)
            add('bell', bar, off, p + 12, d, 26)
        bass_8ths(bar, 96)
        for off in (0.0, 2.0):
            root, q = c2.chord_at(bar, off)
            for p in tones(root, q, 4):
                add('piano', bar, off, p, 1.8, 44)
        drums_four(bar, crash_at=0.0 if bar == 17 else (21 if bar == 21 else None),
                   hats16=False, snare=100)
    fill_toms(24, 2.0, 0.25, 76, 104)


def sec_a2():
    """A2（25-32）：加压——弦乐 / 合唱 / 半程吉他 / 羽管键琴 16 分。"""
    for bar in range(25, 33):
        for off, p, d in MEL_A2[bar]:
            add('lead', bar, off, p, d, 114)
        bass_8ths(bar, 100)
        power_sustain('strings', bar, 54)
        choir_chord(bar, 38)
        if bar >= 29:
            chug(bar, 72)
        root, q = c2.chord_at(bar, 0.0)
        arp_cycle('harpsi', bar, power(root, 4) + [midi(root, 5)], step=0.25, dur=0.14, vel=52)
        drums_four(bar, crash_at=0.0 if bar in (25, 29) else None, hats16=True, snare=104)
        for b in (0.5, 1.5, 2.5, 3.5):
            hit(bar, b, 0, 74)
    brass_stabs(31, (0.0, 2.0), 0.16, 80)
    fill_toms(32, 2.0, 0.25, 82, 108)
    fill_roll(32, 3.0, 1.0, 106)


def sec_b():
    """B（33-40）：癫狂。半音对句 + blast + 钟琴引用。"""
    for bar in range(33, 41):
        for off, p, d in MEL_B[bar]:
            add('lead', bar, off, p, d, 118)
            add('lead', bar, off, p + 12, d, 60)
        chug(bar, 84, dense=(bar >= 37))
        bass_8ths(bar, 104)
        power_sustain('strings', bar, 54)
        root, q = c2.chord_at(bar, 0.0)
        arp_cycle('harpsi', bar, power(root, 4) + [midi(root, 5)], step=0.25, dur=0.12, vel=58)
    for bar in range(33, 37):
        drums_four(bar, crash_at=0.0 if bar == 33 else None, hats16=True, snare=106)
        for b in (0.5, 1.5, 2.5, 3.5):
            hit(bar, b, 0, 80)
    for bar in range(37, 41):
        drums_blast(bar, crash_at=0.0 if bar == 37 else None)
    for bar in (33, 35, 37, 39):
        for k, p in enumerate(CHIME):
            add('bell', bar, 2.0 + k * 0.25, p, 0.16, 34)
    brass_stabs(39, (0.0, 1.5, 2.0, 3.0), 0.14, 86)
    fill_toms(40, 2.0, 0.25, 88, 112)
    fill_roll(40, 3.0, 1.0, 110)


def chorus(b0, shift=0, hero=False, extra=False):
    """副歌（8 小节）：CH8 topline；hero=全编制，extra=加 16 分吉他与玻璃琶音。"""
    for i in range(1, 9):
        bar = b0 + i - 1
        for off, p, d in CH8[i]:
            v = 124 if hero else 118
            add('lead', bar, off, p + shift, d, v)
            if hero:
                add('lead', bar, off, p + shift + 12, d, 52)
            add('bell', bar, off, p + shift + 12, d, 44 if hero else 38)
        chug(bar, 82 if hero else 76, dense=(hero and extra and i >= 5))
        bass_drive(bar, 108 if hero else 100)
        for off in (0.0, 2.0):
            root, q = c2.chord_at(bar, off)
            for p in power(root, 3):
                add('strings', bar, off, p, 1.9, 62 if hero else 54)
            if hero:
                for p in norm(tones(root, q, 4), 55, 74):
                    add('choir', bar, off, p, 1.9, 48)
            for p in tones(root, q, 2):
                add('pad', bar, off, p, 1.85, 30)
        if extra:
            root, q = c2.chord_at(bar, 0.0)
            arp_cycle('arp', bar, [midi(root, 5), midi(root, 5) + 7, midi(root, 6),
                                   midi(root, 5) + 7], step=0.25, dur=0.10, vel=34)
            arp_cycle('harpsi', bar, power(root, 4) + [midi(root, 5)], step=0.25, dur=0.12, vel=48)
        if hero:
            drums_drive(bar, crash_at=0.0 if i % 2 == 1 else None)
            ride_bar(bar, 0.5, 30)
            for off in (1.0, 3.0):
                root, q = c2.chord_at(bar, off)
                for p in power(root, 3):
                    add('brass', bar, off, p, 0.18, 66)
        else:
            drums_drive(bar, crash_at=0.0 if i % 2 == 1 else None)
            choir_chord(bar, 36)
            ride_bar(bar, 1.0, 26)
        if i == 1:
            swish(bar, 0.0, 56)
    fill_toms(b0 + 7, 2.0, 0.25, 92, 114)
    fill_roll(b0 + 7, 3.25, 0.75, 110)


def sec_bridge():
    """Bridge（57-64）：时停。"""
    for bar in range(57, 65):
        pad_hold(bar, 4.0, 32)
        root, q = c2.CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.6, 56)
        power_sustain('strings', bar, 40)
        for off in (0.0, 2.0):
            for p in norm(tones(root, q, 4), 55, 74):
                add('piano', bar, off, p, 1.8, 42)
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 11 if abs(o - round(o)) < 1e-6 else 7)
            o += 0.5
    frag = [(57, 0.0, 86, 0.75, 54), (57, 1.5, 81, 0.5, 46),
            (58, 2.0, 89, 0.75, 48), (59, 0.5, 84, 0.5, 44),
            (60, 0.0, 82, 0.75, 46), (60, 2.5, 77, 0.75, 42)]
    for bar, off, p, d, v in frag:
        add('bell', bar, off, p, d, v)
    for bar, off, p, d in [(61, 0.0, 74, 0.75), (61, 0.75, 75, 0.75), (61, 1.5, 76, 0.75),
                           (61, 2.25, 75, 0.75), (61, 3.0, 74, 0.5), (61, 3.5, 73, 0.5),
                           (62, 0.0, 73, 1.5), (62, 2.0, 76, 0.75), (62, 2.75, 77, 1.0)]:
        add('counter', bar, off, p, d, 44)
    for bar, off in ((59, 1.5), (64, 0.0)):
        add('knife', bar, off, 96, 0.5, 40)
    for bar in (61, 62):
        drums_half(bar, crash_at=None, snare=68)
    fill_toms(63, 0.0, 0.25, 68, 98)
    fill_roll(63, 3.0, 1.0, 98)
    fill_toms(64, 0.0, 0.25, 78, 106)
    fill_roll(64, 2.0, 1.5, 110)
    add('riser', 63, 2.0, 41, 1.8, 58)
    add('riser', 64, 1.0, 45, 2.8, 66)
    crash(65, 0.0, 102)


def sec_b2():
    """B2（65-72）：第二波癫狂，更硬。"""
    for bar in range(65, 73):
        for off, p, d in MEL_B2[bar]:
            add('lead', bar, off, p, d, 120)
            add('lead', bar, off, p + 12, d, 64)
        chug(bar, 88, dense=True)
        bass_drive(bar, 106)
        power_sustain('strings', bar, 56)
        choir_chord(bar, 40)
        root, q = c2.chord_at(bar, 0.0)
        arp_cycle('harpsi', bar, power(root, 4) + [midi(root, 5)], step=0.25, dur=0.12, vel=60)
    for bar in range(65, 69):
        drums_blast(bar, crash_at=0.0 if bar == 65 else None)
    for bar in range(69, 73):
        drums_hard(bar, crash_at=0.0 if bar == 69 else None)
        for b in (0.5, 1.5, 2.5, 3.5):
            hit(bar, b, 0, 82)
    for bar in (65, 67, 69, 71):
        for k, p in enumerate(CHIME):
            add('bell', bar, 2.0 + k * 0.25, p, 0.16, 32)
    brass_stabs(71, (0.0, 1.5, 2.0, 3.0), 0.14, 88)
    fill_toms(72, 2.0, 0.25, 90, 114)
    fill_roll(72, 3.0, 1.0, 112)


def drums_hard_q(bar, scale=0.70, crash_at=None):
    if crash_at is not None:
        hit(bar, crash_at, 4, 96)
    for i in range(8):
        o = i * 0.5
        hit(bar, o, 0, int((112 if i % 2 == 0 else 80) * scale))
    hit(bar, 1.0, 1, int(108 * scale))
    hit(bar, 3.0, 1, int(108 * scale))
    for o in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5):
        hit(bar, o, 3, int(54 * scale))


def drums_blast_q(bar, scale=0.68, crash_at=None):
    if crash_at is not None:
        hit(bar, crash_at, 4, 100)
    for i in range(16):
        o = i * 0.25
        hit(bar, o, 0, int((86 if i % 2 == 0 else 70) * scale))
        if i % 4 in (1, 3):
            hit(bar, o, 1, int(92 * scale))
    for o in (0.0, 1.0, 2.0, 3.0):
        hit(bar, o, 3, int(52 * scale))


def sec_d():
    """D（81-88）：坏掉的钟——32 分羽管键琴半音暴走 + 钟琴把 U.N. 再砸一遍。"""
    lead_d = {
        81: [(0.0, 86, 1.5), (1.5, 89, 0.5), (2.0, 84, 1.0), (3.0, 86, 1.0)],
        82: [(0.0, 86, 0.5), (0.5, 84, 0.5), (1.0, 82, 1.0), (2.0, 81, 1.0), (3.0, 84, 1.0)],
        83: [(0.0, 81, 0.5), (0.5, 82, 0.5), (1.0, 81, 0.5), (1.5, 79, 0.5), (2.0, 81, 1.0), (3.0, 76, 1.0)],
        84: [(0.0, 82, 0.5), (0.5, 84, 0.5), (1.0, 85, 0.5), (1.5, 84, 0.5), (2.0, 82, 1.0), (3.0, 81, 1.0)],
        85: [(0.0, 82, 1.0), (1.0, 79, 1.0), (2.0, 77, 1.0), (3.0, 74, 1.0)],
        86: [(0.0, 74, 1.0), (1.0, 77, 0.5), (1.5, 79, 0.5), (2.0, 82, 2.0)],
        87: [(0.0, 82, 1.0), (1.0, 79, 1.0), (2.0, 77, 0.5), (2.5, 75, 0.5), (3.0, 74, 1.0)],
        88: [(0.0, 86, 1.0), (1.0, 84, 0.5), (1.5, 82, 0.5), (2.0, 81, 2.0)],
    }
    tops = [91, 89, 88, 86, 86, 84, 82, 81]
    for idx, bar in enumerate(range(81, 89)):
        # 32 分半音下行（两拍）
        top = tops[idx]
        for j in range(16):
            add('harpsi', bar, j * 0.125, top - j, 0.085, 56)
        # 后两拍：和弦音 16 分（钟表回摆）
        root, q = c2.chord_at(bar, 2.0)
        tones4 = power(root, 4) + [midi(root, 5)]
        for k in range(8):
            add('harpsi', bar, 2.0 + k * 0.25, tones4[k % len(tones4)], 0.10, 46)
        for off, p, d in lead_d[bar]:
            add('lead', bar, off, p, d, 124)
            add('lead', bar, off, p + 12, d, 60)
        chug(bar, 80, dense=True)
        bass_drive(bar, 98)
        power_sustain('strings', bar, 56)
        if bar >= 85:
            choir_chord(bar, 40)
        if idx < 4:
            for k, p in enumerate(UN[idx]):
                add('bell', bar, off if False else 0.0, 0, 0) if False else None
        if idx < 4:
            for off, p, d in UN[idx]:
                add('bell', bar, off, p, max(d, 0.4), 40)
        if bar in (81, 82, 85, 86):
            drums_four(bar, crash_at=0.0, hats16=True, snare=94, kicks=96)
        else:
            drums_blast_q(bar, crash_at=0.0)
        fill_toms(bar, 3.0, 0.25, 84, 108)
    crash(89, 0.0, 104)


def sec_solo():
    """Solo（89-96）：时钟琶音 + lead 十六分跑句。"""
    for bar in range(89, 97):
        for off, p, d in SOLO[bar]:
            add('lead', bar, off, p, d, 116)
        chug(bar, 80)
        bass_8ths(bar, 102)
        power_sustain('strings', bar, 52)
        choir_chord(bar, 36)
        root, q = c2.chord_at(bar, 0.0)
        arp_cycle('harpsi', bar, power(root, 4) + [midi(root, 5)], step=0.25, dur=0.11, vel=74)
        arp_cycle('arp', bar, [midi(root, 5), midi(root, 5) + 7, midi(root, 6),
                               midi(root, 5) + 7], step=0.25, dur=0.10, vel=52)
        drums_hard(bar, crash_at=0.0 if bar % 2 == 1 else None)
    fill_toms(96, 2.0, 0.25, 90, 114)
    fill_roll(96, 3.0, 1.0, 110)


def sec_break():
    """Break（97-101）：5 小节半速 build。"""
    for bar in range(97, 102):
        pad_hold(bar, 4.0, 34)
        root, q = c2.CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.6, 60)
        power_sustain('strings', bar, 38)
        for off in (0.0, 2.0):
            for p in norm(tones(root, q, 4), 55, 74):
                add('piano', bar, off, p, 1.8, 38)
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 10 if abs(o - round(o)) < 1e-6 else 6)
            o += 0.5
        for off, p, d in BREAK_LEAD[bar]:
            add('lead', bar, off, p, d, 108)
            add('lead', bar, off, p + 12, d, 44)
    for bar in (97, 98):
        drums_half(bar, crash_at=0.0 if bar == 97 else None, snare=82)
    for bar in (99, 100, 101):
        hit(bar, 0.0, 0, 100)
        hit(bar, 2.0, 0, 92)
        hit(bar, 2.0, 1, 86)
        for b in (0.5, 1.0, 1.5, 2.5, 3.0, 3.5):
            hit(bar, b, 2, 28)
    fill_toms(100, 2.0, 0.25, 80, 106)
    fill_roll(100, 3.0, 1.0, 102)
    fill_toms(101, 0.0, 0.25, 84, 112)
    fill_roll(101, 2.0, 2.0, 114)
    add('riser', 100, 2.0, 41, 1.6, 60)
    add('riser', 101, 1.0, 45, 2.4, 66)
    for bar, off in ((99, 3.0), (101, 3.5)):
        add('knife', bar, off, 96, 0.5, 44)


def sec_coda():
    """Coda（110-117）：崩塌——八音盒把副歌还成摇篮曲。"""
    for bar in range(110, 118):
        pad_hold(bar, 4.0, 30)
        root, q = c2.CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.6, 54)
        power_sustain('strings', bar, 30)
        for off in (0.0, 2.0):
            for p in norm(tones(root, q, 4), 55, 74):
                add('piano', bar, off, p, 1.8, 32)
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 9 if abs(o - round(o)) < 1e-6 else 5)
            o += 0.5
    # 副歌 topline 的前四小节，慢成八音盒
    for i in (1, 2, 3, 4):
        bar = 110 + i - 1
        for off, p, d in CH8[i]:
            add('bell', bar, off, p, d, 58)
    for i in (5, 6):
        bar = 114 + i - 5
        for off, p, d in CH8[i]:
            add('bell', bar, off, p, min(d, 0.5), 40)
    for bar in (110, 112, 114, 116):
        hit(bar, 0.0, 0, 56)
        hit(bar, 0.5, 0, 36)
    add('knife', 117, 2.0, 96, 0.5, 40)
    for p in [50, 57, 62, 65]:
        add('choir', 117, 0.0, p, 3.6, 28)


def sec_outro():
    """Outro（118-125）：回环——引子的摇篮曲 + 心跳，接回第 1 小节。"""
    for bar in range(118, 126):
        pad_hold(bar, 4.0, 28)
        root, q = c2.CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.6, 40)
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 14 if abs(o - round(o)) < 1e-6 else 9)
            o += 0.5
    for bar in range(118, 126):
        for off, p, d, v in INTRO1[bar - 117]:
            add('bell', bar, off, p, d, v - 4)
    for bar in (118, 120, 122):
        hit(bar, 0.0, 0, 46)
        hit(bar, 0.5, 0, 30)
    hit(124, 0.0, 0, 56)
    hit(124, 0.5, 0, 38)
    hit(125, 0.0, 0, 62)
    hit(125, 2.0, 0, 52)
    add('riser', 125, 1.0, 43, 2.6, 52)
    add('knife', 125, 3.0, 96, 0.5, 40)
    swish(125, 3.5, 40)


def write():
    tracks_js, tracks_json = [], []
    for name, wave, gain in c2.TRACK_DEFS:
        ns = sorted(c2.TRACKS[name], key=lambda x: (x[0], x[1]))
        tracks_js.append((name, wave, gain, ns))
        tracks_json.append({'name': name, 'wave': wave, 'gain': gain, 'notes': ns})
    dr = sorted(c2.DRUMS, key=lambda x: (x[0], x[1]))

    def num(v):
        s = ('%.4f' % v).rstrip('0').rstrip('.')
        return s if s else '0'

    lines = []
    lines.append('/**')
    lines.append(' * EX 面 BOSS《恶魔之妹》—— 芙兰朵露·斯卡雷特 / 红月下被囚禁的 495 年。')
    lines.append(' * 200 BPM, D 小调, 4/4, 125 小节 = 150.0s 循环：')
    lines.append(' *   引子 I 8（八音盒/钟摆/心跳）→ 引子 II 8（时钟琶音 + 钟琴引用 U.N. 副歌）')
    lines.append(' *   → A1 8（主歌·减编制）+ A2 8（加压）→ B 8（癫狂·半音对句/blast）')
    lines.append(' *   → C1 16（副歌新 topline 两遍）→ Bridge 8（时停）→ B2 8（更硬）')
    lines.append(' *   → C2 8（副歌 hero）→ D 8（32 分羽管键琴暴走 + U.N. 引用）→ Solo 8')
    lines.append(' *   → Break 5（半速 build）→ C3 8（升半音）→ Coda 8（崩塌）→ Outro 8（回环）。')
    lines.append(' * 副歌是原创 topline（八小节、可哼）；U.N. 副歌 hook 只作引子 II / D 段 / coda 的钟琴引用。')
    lines.append(' * 编制：失真吉他/lead/羽管键琴/铜管/弦乐/合唱/贝斯/钢琴/八音盒/钟摆/铺底/对位/琶音/刀/')
    lines.append(' * riser；鼓 kind 0-9（5-6 通鼓 / 7 ride / 8 反向吊镲 / 9 军鼓滚奏，5-9 只在离线 WAV')
    lines.append(' * 渲染器发声，JS 合成回退会静默忽略）。tools/build/_fld_compose3.py 生成，勿手改。')
    lines.append(' */')
    lines.append('export const FLANDRE_DEVIL = {')
    lines.append('  extra: {')
    lines.append("    title: '恶魔之妹',")
    lines.append('    duration: 150,')
    lines.append('    bpm: 200,')
    lines.append('    tracks: [')
    for name, wave, gain, ns in tracks_js:
        chunk = '[' + ','.join('[%s,%d,%s,%d]' % (num(t), p, num(d), v) for t, p, d, v in ns) + ']'
        lines.append("      { name: '%s', wave: '%s', gain: %s, notes: %s }," % (name, wave, gain, chunk))
    lines.append('    ],')

    def dj(ev):
        extra = ',' + num(ev[3]) if len(ev) > 3 else ''
        return '[%s,%d,%d%s]' % (num(ev[0]), int(ev[1]), int(ev[2]), extra)

    lines.append('    drums: [' + ','.join(dj(ev) for ev in dr) + '],')
    lines.append('  },')
    lines.append('};')
    js = '\n'.join(lines) + '\n'

    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out_js = os.path.join(root, 'src', 'engine', 'songs', 'flandre_devil.js')
    with open(out_js, 'w', encoding='utf-8') as f:
        f.write(js)
    json_path = os.path.join(root, 'tools', 'build', '_fld_lead', 'song3.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({'title': '恶魔之妹', 'duration': 150.0, 'bpm': 200,
                   'tracks': tracks_json, 'drums': dr}, f, ensure_ascii=False)
    print('wrote', out_js)
    print('notes:', sum(len(x['notes']) for x in tracks_json), 'drums:', len(dr))
    for name, _, _, ns in tracks_js:
        if ns:
            print('  %-8s %4d notes  last=%.3f' % (name, len(ns), ns[-1][0] + ns[-1][2]))
    last = 0.0
    for x in tracks_json:
        for t, p, d, v in x['notes']:
            last = max(last, t + d)
    print('lastEnd', round(last, 4))


def main():
    sec_intro1()
    sec_intro2()
    sec_a1()
    sec_a2()
    sec_b()
    chorus(41, 0, hero=False, extra=True)
    chorus(49, 0, hero=True, extra=True)
    sec_bridge()
    sec_b2()
    chorus(73, 0, hero=True, extra=True)
    sec_d()
    sec_solo()
    sec_break()
    chorus(102, 1, hero=True, extra=True)
    sec_coda()
    sec_outro()
    write()


if __name__ == '__main__':
    main()
