# -*- coding: utf-8 -*-
"""EX 面 BOSS《恶魔之妹》v4 —— 红月下被囚禁 495 年的芙兰朵露（整套重写）。

200 BPM / D 小调 / 4/4 / 125 小节 = 150.0 秒一循环。
结构：
  引子 I 1-8      八音盒把 hook 拆成摇篮曲；钟摆、心跳、红月
  引子 II 9-16    U.N. 的时钟琶音上发条，低音走近，鼓报到
  A1 17-24        时钟 riff 当主奏，lead 长音对句
  A2 25-32        同一 riff 加压：lead 八度、双踩、铜管
  B1 33-40        hook 第一次现身（半编制）
  C1 41-56        副歌全开：hook 两遍 + 第二句 + 三度和声 + blast
  Bridge 57-62    时停：八音盒、钟摆、起浪
  B2 63-70        癫狂：半音阶下行的桥段当 riff，blast
  C2 71-86        副歌两遍；79-86 整体升半音
  Solo 87-94      钢琴 32 分时钟琶音 + lead 跑句
  Break 95-98     半速 build
  D 99-110        崩塌：hook 八度重击 + 半音下行 32 分 + 减和弦
  Coda 111-118    八音盒把 hook 还成摇篮曲
  Outro 119-125   钟摆回落，接回第 1 小节

素材：U.N. Owen 的时钟琶音（b3-4）、副歌 hook（b20-27）、半音桥段（b12-19）。
生成：tools/build/_fld_compose4.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _fld_compose2 as L

BPM = 200.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
DURATION = 150.0
BARS = 125

L.BPM = BPM
L.BEAT = BEAT
L.BAR = BAR
L.DURATION = DURATION
L.BARS = BARS

L.TRACK_DEFS = [
    ('guitar', 'sawtooth', 0.062),
    ('lead', 'sawtooth', 0.235),
    ('harpsi', 'square', 0.060),
    ('brass', 'square', 0.070),
    ('strings', 'sawtooth', 0.066),
    ('choir', 'sine', 0.062),
    ('bass', 'triangle', 0.128),
    ('piano', 'sine', 0.055),
    ('bell', 'sine', 0.110),
    ('tick', 'square', 0.046),
    ('pad', 'sine', 0.030),
    ('counter', 'triangle', 0.050),
    ('arp', 'sine', 0.056),
    ('knife', 'square', 0.058),
    ('riser', 'sawtooth', 0.050),
]
L.TRACKS = {name: [] for name, _, _ in L.TRACK_DEFS}
L.DRUMS = []
L.DRUM_SCALE = 0.72

L.CHORDS.clear()
L.HALF.clear()

add = L.add
hit = L.hit
hit_x = L.hit_x
midi = L.midi
tones = L.tones
power = L.power
chord_voicing = L.chord_voicing
norm = L.norm
chord_at = L.chord_at
crash = L.crash
swish = L.swish
ride_bar = L.ride_bar
fill_toms = L.fill_toms
fill_roll = L.fill_roll
drums_four = L.drums_four
drums_drive = L.drums_drive
drums_hard = L.drums_hard
drums_blast = L.drums_blast
drums_half = L.drums_half
pad_hold = L.pad_hold
power_sustain = L.power_sustain
choir_chord = L.choir_chord
brass_stabs = L.brass_stabs
bass_8ths = L.bass_8ths
bass_drive = L.bass_drive
chug = L.chug
arp_cycle = L.arp_cycle

# ---------------- 和声 ----------------
def sec(b0, seq):
    for i, (r, q) in enumerate(seq):
        L.CHORDS[b0 + i] = (r, q)

CH_H = [(('Bb', 'maj'), ('C', 'maj')), (('D', 'm'), ('G', 'm')),
        (('Bb', 'maj'), ('C', 'maj')), (('D', 'm'), ('D', 'm'))]
CH_H_UP = [(('B', 'maj'), ('C#', 'maj')), (('Eb', 'm'), ('Ab', 'm')),
           (('B', 'maj'), ('C#', 'maj')), (('Eb', 'm'), ('Eb', 'm'))]

def chorus_chords(b0, n, up=False):
    src = CH_H_UP if up else CH_H
    for i in range(n):
        (r1, q1), (r2, q2) = src[i % 4]
        L.CHORDS[b0 + i] = (r1, q1)
        L.HALF[b0 + i] = ((r1, q1), (r2, q2))

sec(1, [('D', 'm'), ('D', 'm'), ('Bb', 'maj'), ('Bb', 'maj'),
        ('G', 'm'), ('G', 'm'), ('A', '7'), ('A', '7')])
sec(9, [('D', 'm'), ('D', 'm'), ('Bb', 'maj'), ('Bb', 'maj'),
        ('G', 'm'), ('G', 'm'), ('A', '7'), ('A', '7')])
sec(17, [('D', 'm'), ('Bb', 'maj'), ('C', 'maj'), ('D', 'm'),
         ('Bb', 'maj'), ('C', 'maj'), ('D', 'm'), ('A', '7')])
sec(25, [('D', 'm'), ('Bb', 'maj'), ('C', 'maj'), ('D', 'm'),
         ('Bb', 'maj'), ('C', 'maj'), ('D', 'm'), ('A', '7')])
chorus_chords(33, 8)
chorus_chords(41, 16)
sec(57, [('D', 'm'), ('D', 'm'), ('Eb', 'maj'), ('Eb', 'maj'),
         ('Bb', 'maj'), ('A', '7')])
sec(63, [('D', 'm'), ('Eb', 'maj'), ('D', 'm'), ('Eb', 'maj'),
         ('Bb', 'maj'), ('A', '7'), ('D', 'm'), ('A', '7')])
chorus_chords(71, 8)
chorus_chords(79, 8, up=True)
chorus_chords(87, 8)
sec(95, [('Bb', 'maj'), ('C', 'maj'), ('D', 'm'), ('A', '7')])
sec(99, [('D', 'm'), ('Eb', 'maj'), ('D', 'm'), ('Eb', 'maj'),
         ('Bb', 'maj'), ('A', '7'), ('D', 'm'), ('A', '7'),
         ('D', 'm'), ('Eb', 'maj'), ('Bb', 'maj'), ('A', '7')])
sec(111, [('D', 'm'), ('Bb', 'maj'), ('G', 'm'), ('A', '7'),
          ('D', 'm'), ('Bb', 'maj'), ('D', 'm'), ('D', 'm')])
sec(119, [('D', 'm'), ('Bb', 'maj'), ('D', 'm'), ('A', '7'),
          ('D', 'm'), ('Bb', 'maj'), ('D', 'm')])

# ---------------- 素材 ----------------
# U.N. 副歌 hook（b20-23），整体前移 0.25 拍落到正拍，降八度写成 (bar_off, beat, midi, dur)
THEME = [
    (0, 0.0, 79, 0.25), (0, 1.0, 79, 0.25), (0, 1.5, 74, 0.5), (0, 2.5, 81, 0.5), (0, 3.5, 76, 0.5),
    (1, 0.5, 81, 0.5), (1, 1.5, 77, 0.5), (1, 2.5, 79, 0.5), (1, 3.0, 81, 0.5), (1, 3.5, 79, 0.5),
    (2, 0.5, 83, 0.5), (2, 1.5, 86, 0.5), (2, 2.0, 81, 0.5), (2, 2.5, 88, 0.5), (2, 3.0, 89, 0.5), (2, 3.5, 88, 0.5),
    (3, 0.0, 89, 0.25), (3, 0.25, 88, 0.25), (3, 0.5, 86, 0.5), (3, 1.0, 84, 0.25), (3, 1.5, 81, 0.5),
    (3, 2.0, 84, 0.5), (3, 2.5, 79, 0.5), (3, 3.0, 81, 0.5), (3, 3.5, 77, 2.0),
]
# 副歌第二句（b24-27）
THEME2 = [
    (0, 1.5, 74, 0.5), (0, 2.5, 81, 0.5), (0, 3.5, 76, 0.5),
    (1, 0.5, 81, 0.5), (1, 1.5, 77, 0.5), (1, 2.5, 79, 0.5), (1, 3.0, 81, 0.5), (1, 3.5, 79, 0.5),
    (2, 0.5, 83, 0.5), (2, 1.5, 86, 0.5), (2, 2.0, 81, 0.5), (2, 2.5, 88, 0.5), (2, 3.0, 89, 0.25), (2, 3.5, 88, 0.5),
    (3, 0.0, 89, 0.25), (3, 0.25, 88, 0.25), (3, 0.5, 86, 0.5), (3, 1.0, 84, 0.25), (3, 1.5, 86, 4.0),
]
# U.N. 时钟琶音（b3-4，22 音）
CLOCK = [
    (0, 0.0, 77), (0, 0.25, 74), (0, 0.5, 69), (0, 0.75, 76), (0, 1.5, 76),
    (0, 2.0, 76), (0, 2.75, 77), (0, 3.0, 74), (0, 3.25, 69), (0, 3.5, 77), (0, 3.75, 74),
    (1, 0.0, 69), (1, 0.25, 77), (1, 0.5, 74), (1, 0.75, 69), (1, 1.0, 77),
    (1, 1.25, 74), (1, 1.5, 69), (1, 1.75, 79), (1, 2.5, 79), (1, 3.0, 79), (1, 3.75, 77),
]
# U.N. 半音桥段（b12-19，30 音）
CHROM = [
    (0, 1.75, 69, 0.5), (0, 2.75, 65, 0.5), (0, 3.75, 68, 0.5),
    (1, 0.75, 64, 0.5), (1, 1.75, 71, 0.5), (1, 2.75, 68, 0.5), (1, 3.75, 67, 0.5),
    (2, 0.75, 70, 0.5), (2, 1.75, 69, 0.5), (2, 2.75, 65, 0.5), (2, 3.75, 68, 0.5),
    (3, 0.75, 64, 0.5), (3, 1.75, 71, 0.5), (3, 2.75, 68, 0.5), (3, 3.75, 67, 2.0),
]
CHROM = CHROM + [(bo + 4, off, p, d) for bo, off, p, d in CHROM[:15]]

D_SCALE = [2, 4, 5, 7, 9, 10, 11, 0, 1]

def scale_pcs():
    return set(D_SCALE)

def third_above(p):
    for d in (3, 4):
        q = p + d
        if q % 12 in scale_pcs():
            return q
    return p + 3

def play_theme(b0, name, vel=118, octv=0, shift=0, dscale=1.0, melody=THEME, end_bar=None):
    for bo, off, p, d in melody:
        bar = b0 + bo
        dd = d
        if end_bar is not None:
            remain = (end_bar - bar) * 4.0 - off
            dd = min(dd, remain)
        if dd <= 0.05:
            continue
        add(name, bar, off, p + octv + shift, dd * dscale, vel)

def play_clock(b0, name, vel=66, octv=0, dur=0.22):
    for bo, off, p in CLOCK:
        add(name, b0 + bo, off, p + octv, dur, vel)

def arp_bar(name, bar, octv=4, step=0.25, vel=68, dur=0.2, pat=(0, 7, 12, 7)):
    for off0 in (0.0, 2.0):
        r, q = chord_at(bar, off0)
        base = midi(r, octv)
        n = int(round(2.0 / step))
        for k in range(n):
            add(name, bar, off0 + k * step, base + pat[k % len(pat)], dur, vel)

def bass_chrom(bar, pcs, vel=100, octv=2):
    for k, r in enumerate(pcs):
        add('bass', bar, k * 0.5, midi(r, octv), 0.42, vel)

def dr_verse(bar, crash_at=None, dense=False):
    if crash_at is not None:
        crash(bar, crash_at, 92)
    for o in (0.0, 1.5, 2.5):
        hit(bar, o, 0, 112)
    hit(bar, 1.0, 1, 100)
    hit(bar, 3.0, 1, 104)
    step = 0.25 if dense else 0.5
    o = 0.0
    while o < 3.999:
        hit(bar, o, 2, 44 if abs(o - round(o)) < 1e-6 else 30)
        o += step
    hit(bar, 2.5, 3, 50)

def dr_push(bar, crash_at=None):
    if crash_at is not None:
        crash(bar, crash_at, 96)
    for o in (0.0, 1.0, 2.0, 3.0):
        hit(bar, o, 0, 112)
    for o in (0.75, 1.75, 2.75, 3.75):
        hit(bar, o, 0, 84)
    hit(bar, 1.0, 1, 102)
    hit(bar, 3.0, 1, 106)
    o = 0.0
    while o < 3.999:
        hit(bar, o, 2, 46 if abs(o - round(o)) < 1e-6 else 30)
        o += 0.25
    hit(bar, 3.5, 3, 52)

# ---------------- 段落 ----------------
def intro1():
    for b in range(1, 9):
        pad_hold(b, 4.0, 24, 2)
    mel = [
        (1, 0.0, 79, 1.0, 66), (1, 1.5, 74, 0.75, 58), (1, 2.5, 81, 1.25, 62),
        (2, 1.0, 79, 0.5, 56), (2, 1.5, 77, 0.5, 58), (2, 2.0, 74, 1.5, 54),
        (3, 0.0, 82, 0.75, 60), (3, 1.0, 86, 0.5, 54), (3, 2.0, 81, 1.5, 58),
        (4, 0.5, 88, 0.5, 52), (4, 1.0, 86, 0.5, 54), (4, 1.5, 82, 1.5, 56),
        (5, 0.0, 86, 1.0, 58), (5, 1.5, 81, 0.75, 52), (5, 2.5, 79, 1.25, 56),
        (6, 0.0, 77, 1.5, 54), (6, 1.5, 74, 0.5, 50), (6, 2.0, 70, 1.5, 52),
        (7, 0.0, 73, 1.0, 56), (7, 1.5, 76, 0.75, 50), (7, 2.5, 73, 1.25, 54),
        (8, 0.0, 69, 2.0, 50),
    ]
    for bar, off, p, d, v in mel:
        add('bell', bar, off, p, d, v)
    for b in range(1, 9):
        for o in (0.0, 1.0, 2.0, 3.0):
            add('tick', b, o, 93, 0.09, 26)
    for b in range(1, 9):
        hit(b, 0.0, 0, 58)
        hit(b, 2.0, 0, 48)
        hit(b, 2.25, 0, 34)
    add('riser', 8, 0.0, 60, 4.0, 38)
    swish(8, 3.5, 60)
    add('knife', 5, 3.5, 96, 0.2, 54)
    add('knife', 7, 1.0, 91, 0.2, 48)

def intro2():
    for b in range(9, 13):
        r, q = chord_at(b, 0)
        base = midi(r, 4)
        for k in range(8):
            add('piano', b, 2.0 + k * 0.25, base + [0, 7, 12, 7][k % 4], 0.22, 56)
    for b in range(13, 17):
        arp_bar('piano', b, 4, 0.25, 62, 0.22)
    for b in range(9, 17):
        power_sustain('strings', b, 44, 3)
        pad_hold(b, 4.0, 26, 2)
    for b in range(11, 17):
        bass_8ths(b, 84)
    for b in range(11, 13):
        drums_half(b, crash_at=(0.0 if b == 11 else None), snare=80)
    for b in range(13, 17):
        dr_verse(b, crash_at=(0.0 if b == 13 else None), dense=False)
    fill_toms(15, 2.0, 0.25, 76, 104)
    fill_roll(16, 2.0, 2.0, 106)
    swish(16, 3.5, 58)
    lead_calls = [
        (9, 0.0, 74, 1.5, 84), (9, 2.0, 77, 1.5, 78),
        (10, 0.0, 76, 1.5, 84), (10, 2.0, 74, 1.5, 78),
        (11, 0.0, 72, 1.5, 84), (11, 2.0, 77, 1.5, 78),
        (12, 0.0, 74, 2.5, 82),
        (13, 0.0, 79, 1.0, 92), (13, 2.0, 81, 1.0, 86),
        (14, 0.0, 82, 1.5, 94), (14, 2.0, 79, 1.5, 86),
        (15, 0.0, 77, 1.0, 92), (15, 2.0, 81, 1.5, 88),
        (16, 0.0, 81, 1.0, 96), (16, 1.0, 79, 1.0, 90),
    ]
    for bar, off, p, d, v in lead_calls:
        add('lead', bar, off, p, d, v)


def sec_a1():
    for b in range(17, 25):
        arp_bar('piano', b, 4, 0.25, 66, 0.22)
        bass_8ths(b, 96)
        chug(b, 58, False, 2)
        power_sustain('strings', b, 48, 3)
        pad_hold(b, 4.0, 26, 2)
        dr_verse(b, crash_at=(0.0 if b == 17 else None), dense=False)
    lead = [
        (17, 0.0, 74, 1.5, 104), (17, 2.0, 77, 1.5, 96),
        (18, 0.0, 70, 2.0, 102), (18, 2.5, 74, 1.0, 94),
        (19, 0.0, 76, 1.5, 104), (19, 2.0, 79, 1.5, 96),
        (20, 0.0, 74, 3.0, 100),
        (21, 0.0, 70, 1.5, 102), (21, 2.0, 74, 1.5, 94),
        (22, 0.0, 72, 1.5, 102), (22, 2.0, 76, 1.5, 94),
        (23, 0.0, 74, 1.5, 104), (23, 2.0, 77, 1.5, 96),
        (24, 0.0, 73, 3.0, 100),
    ]
    for bar, off, p, d, v in lead:
        add('lead', bar, off, p, d, v)
    fill_toms(24, 2.0, 0.25, 80, 108)
    add('knife', 20, 3.5, 98, 0.18, 50)

def sec_a2():
    for b in range(25, 33):
        arp_bar('piano', b, 3, 0.25, 62, 0.22)
        arp_bar('piano', b, 4, 0.25, 54, 0.2)
        bass_8ths(b, 104)
        chug(b, 76, True, 2)
        power_sustain('strings', b, 56, 4)
        choir_chord(b, 40, 4)
        brass_stabs(b, (0.0, 2.0), 0.22, 76, 3)
        dr_push(b, crash_at=(0.0 if b == 25 else None))
    lead = [
        (25, 0.0, 86, 1.0, 116), (25, 1.0, 89, 1.0, 108), (25, 2.0, 86, 1.0, 110), (25, 3.0, 84, 1.0, 104),
        (26, 0.0, 82, 2.0, 114), (26, 2.0, 86, 1.0, 108), (26, 3.0, 84, 1.0, 102),
        (27, 0.0, 88, 1.0, 116), (27, 1.0, 91, 1.0, 108), (27, 2.0, 88, 1.0, 110), (27, 3.0, 86, 1.0, 104),
        (28, 0.0, 86, 2.5, 112),
        (29, 0.0, 82, 1.0, 114), (29, 1.0, 86, 1.0, 106), (29, 2.0, 89, 1.0, 110), (29, 3.0, 88, 1.0, 104),
        (30, 0.0, 84, 1.0, 114), (30, 1.0, 88, 1.0, 106), (30, 2.0, 91, 1.0, 110), (30, 3.0, 88, 1.0, 104),
        (31, 0.0, 86, 1.0, 116), (31, 1.0, 89, 1.0, 108), (31, 2.0, 91, 1.0, 110), (31, 3.0, 89, 1.0, 104),
        (32, 0.0, 85, 2.5, 110),
    ]
    for bar, off, p, d, v in lead:
        add('lead', bar, off, p, d, v)
        add('counter', bar, off, p - 12, d, 46)
    fill_toms(31, 2.0, 0.25, 84, 110)
    fill_roll(32, 2.0, 2.0, 112)
    swish(32, 3.5, 60)

def chorus_block(b0, melody, hero=True, harmony=False, blast=False, n=4, shift=0):
    for i in range(n):
        b = b0 + i
        bass_drive(b, 106)
        power_sustain('strings', b, 60, 4)
        choir_chord(b, 46, 4)
        brass_stabs(b, (0.0, 2.5), 0.2, 82, 3)
        chug(b, 80, dense=True, octv=2)
        if blast:
            drums_blast(b, crash_at=(0.0 if i == 0 else None))
        else:
            drums_drive(b, crash_at=(0.0 if i == 0 else None))
        ride_bar(b, 0.5, 30)
    play_theme(b0, 'lead', 124 if hero else 112, shift=shift, melody=melody, end_bar=b0 + n)
    play_theme(b0, 'piano', 92, octv=12, shift=shift, melody=melody, end_bar=b0 + n)
    play_theme(b0, 'piano', 72, octv=0, shift=shift, melody=melody, end_bar=b0 + n)
    if hero:
        play_theme(b0, 'bell', 50, octv=12, shift=shift, melody=melody, end_bar=b0 + n)
    if harmony:
        for bo, off, p, d in melody:
            bar = b0 + bo
            remain = (b0 + n - bar) * 4.0 - off
            dd = min(d, remain)
            if dd <= 0.05:
                continue
            add('lead', bar, off, third_above(p + 12) + shift, dd, 72)

def sec_b1():
    for b in range(33, 41):
        bass_drive(b, 94)
        power_sustain('strings', b, 48, 3)
        pad_hold(b, 4.0, 28, 2)
        chug(b, 62, False, 2)
        drums_four(b, crash_at=(0.0 if b == 33 else None))
        ride_bar(b, 1.0, 26)
    play_theme(33, 'lead', 106)
    play_theme(33, 'piano', 84, octv=12)
    play_theme(37, 'lead', 108, melody=THEME2, end_bar=41)
    play_theme(37, 'piano', 86, octv=12, melody=THEME2, end_bar=41)
    fill_toms(40, 2.0, 0.25, 82, 108)
    fill_roll(40, 3.0, 1.0, 108)

def sec_c1():
    chorus_block(41, THEME, hero=True, harmony=False, blast=False, n=4)
    chorus_block(45, THEME, hero=True, harmony=False, blast=False, n=4)
    play_theme(45, 'lead', 56, octv=12)
    chorus_block(49, THEME2, hero=True, harmony=False, blast=False, n=4)
    chorus_block(53, THEME, hero=True, harmony=True, blast=True, n=4)
    for b in range(53, 57):
        add('piano', b, 0.0, midi(chord_at(b, 0)[0], 5) + 7, 0.4, 50)
    fill_toms(56, 2.0, 0.25, 86, 112)
    fill_roll(56, 3.0, 1.0, 112)

def sec_bridge():
    for b in (57, 58):
        pad_hold(b, 4.0, 30, 2)
        power_sustain('strings', b, 34, 3)
        for o in (0.0, 2.0):
            hit(b, o, 0, 52)
            hit(b, o + 0.25, 0, 30)
        for o in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5):
            add('tick', b, o, 93, 0.09, 24)
    mel = [(57, 0.0, 79, 1.0, 54), (57, 1.5, 74, 0.75, 48), (57, 2.5, 81, 1.0, 52),
           (58, 1.0, 77, 0.5, 46), (58, 1.5, 74, 1.5, 50)]
    for bar, off, p, d, v in mel:
        add('bell', bar, off, p, d, v)
    for b in (59, 60):
        pad_hold(b, 4.0, 28, 2)
        power_sustain('strings', b, 36, 3)
        for k in range(4):
            add('piano', b, 2.0 + k * 0.25, midi(chord_at(b, 0)[0], 5) + [0, 7, 12, 7][k % 4], 0.22, 46)
        for o in (0.0, 1.0, 2.0, 3.0):
            add('tick', b, o, 93, 0.09, 26)
        hit(b, 0.0, 0, 56)
        hit(b, 2.0, 0, 44)
    for b in (61, 62):
        pad_hold(b, 4.0, 34, 2)
        power_sustain('strings', b, 50, 3)
        choir_chord(b, 34, 4)
        add('riser', b, 0.0, 60, 4.0, 46 if b == 62 else 38)
        drums_half(b, crash_at=(0.0 if b == 61 else None), snare=84)
    fill_roll(62, 2.0, 2.0, 116)
    swish(62, 3.5, 62)
    crash(62, 0.0, 76)

def sec_b2():
    for b in range(63, 71):
        bass_chrom(b, [chord_at(b, 0)[0], chord_at(b, 0)[0], chord_at(b, 2.0)[0], chord_at(b, 0)[0]], 104)
        chug(b, 86, True, 2)
        power_sustain('strings', b, 58, 4)
        choir_chord(b, 44, 4)
        brass_stabs(b, (0.0, 1.5, 2.5), 0.18, 86, 3)
        drums_blast(b, crash_at=(0.0 if b == 63 else None))
    for bo, off, p, d in CHROM:
        add('lead', 63 + bo, off, p + 12, d, 118)
        add('lead', 63 + bo, off, p, d, 96)
    for b in (69, 70):
        for k in range(16):
            add('lead', b, k * 0.25, 89 - k, 0.2, 104)
        drums_blast(b)
    fill_toms(70, 2.0, 0.25, 90, 116)
    fill_roll(70, 3.0, 1.0, 118)
    swish(70, 3.5, 64)

def sec_c2():
    chorus_block(71, THEME, hero=True, harmony=False, blast=False, n=4)
    chorus_block(75, THEME2, hero=True, harmony=False, blast=False, n=4)
    chorus_block(79, THEME, hero=True, harmony=False, blast=False, n=4, shift=1)
    chorus_block(83, THEME2, hero=True, harmony=True, blast=True, n=4, shift=1)
    for b in range(79, 87):
        for k in range(4):
            add('harpsi', b, 2.0 + k * 0.25, midi(chord_at(b, 0)[0], 5) + [0, 7, 12, 7][k % 4] + 1, 0.2, 40)
    fill_toms(86, 2.0, 0.25, 90, 116)
    fill_roll(86, 3.0, 1.0, 118)

def sec_solo():
    for b in range(87, 95):
        arp_bar('piano', b, 4, 0.125, 72, 0.1)
        arp_bar('piano', b, 6, 0.125, 54, 0.1)
        bass_drive(b, 104)
        chug(b, 74, True, 2)
        power_sustain('strings', b, 56, 4)
        choir_chord(b, 42, 4)
        drums_drive(b, crash_at=(0.0 if b == 87 else None))
        ride_bar(b, 0.5, 32)
    run = []
    base = [84, 86, 88, 89, 91, 93, 94, 96]
    for i, b in enumerate(range(87, 95)):
        for k in range(8):
            p = base[(k + i) % 8] + (12 if k % 2 else 0)
            run.append((b, k * 0.5, p, 0.4, 108 if k % 2 == 0 else 96))
    for bar, off, p, d, v in run:
        add('lead', bar, off, p, d, v)
    for b in range(89, 95):
        add('lead', b, 3.0, 88, 0.5, 100)
    fill_toms(94, 2.0, 0.25, 86, 112)
    fill_roll(94, 3.0, 1.0, 114)

def sec_break():
    for b in range(95, 99):
        pad_hold(b, 4.0, 30, 2)
        power_sustain('strings', b, 46, 3)
        choir_chord(b, 38, 4)
        drums_half(b, crash_at=(0.0 if b == 95 else None), snare=86)
    for b in range(97, 99):
        add('riser', b, 0.0, 55, 4.0, 56)
    fill_roll(98, 0.0, 4.0, 120)
    for b in (95, 96, 97, 98):
        add('bell', b, 0.0, midi(chord_at(b, 0)[0], 5) + 12, 1.0, 42)
    add('lead', 97, 0.0, 79, 1.5, 96)
    add('lead', 98, 0.0, 81, 1.5, 100)

def sec_d():
    for b in range(99, 105):
        drums_blast(b, crash_at=(0.0 if b == 99 else None))
        chug(b, 92, True, 2)
        power_sustain('strings', b, 62, 4)
        choir_chord(b, 50, 4)
        brass_stabs(b, (0.0, 2.0), 0.24, 92, 3)
        r0 = midi(chord_at(b, 0)[0], 2)
        add('bass', b, 0.0, r0, 1.9, 108)
        add('bass', b, 2.0, r0 + 1, 1.9, 104)
    play_theme(99, 'lead', 126)
    play_theme(99, 'guitar', 92, octv=-12)
    play_theme(103, 'lead', 126, melody=THEME2, end_bar=105)
    for b in range(105, 111):
        drums_blast(b)
        chug(b, 88, True, 2)
        power_sustain('strings', b, 60, 4)
        top = 93 - (b - 105) * 2
        for k in range(32):
            add('piano', b, k * 0.125, top - k, 0.1, 84 if k % 4 == 0 else 68)
        for k in range(16):
            add('lead', b, k * 0.25, top - k * 2, 0.2, 100 if k % 4 == 0 else 84)
        add('bass', b, 0.0, midi(chord_at(b, 0)[0], 2), 3.6, 104)
    fill_toms(110, 2.0, 0.25, 92, 118)
    fill_roll(110, 3.0, 1.0, 120)

def sec_coda():
    mel = [
        (111, 0.0, 79, 1.5, 58), (111, 2.0, 74, 1.0, 52),
        (112, 0.0, 81, 1.0, 54), (112, 1.5, 77, 1.5, 50),
        (113, 0.0, 74, 1.0, 54), (113, 1.5, 70, 1.5, 48),
        (114, 0.0, 73, 2.0, 52),
    ]
    for bar, off, p, d, v in mel:
        add('bell', bar, off, p, d, v)
    for b in range(111, 119):
        pad_hold(b, 4.0, 24, 2)
    for b in range(111, 115):
        hit(b, 0.0, 0, 54)
        hit(b, 2.0, 0, 42)
        for o in (0.0, 1.0, 2.0, 3.0):
            add('tick', b, o, 93, 0.09, 22)
    for b in range(115, 119):
        add('bell', b, 0.0, midi(chord_at(b, 0)[0], 5) + 12, 1.2, 40)
        for o in (0.0, 2.0):
            hit(b, o, 0, 44)
    add('riser', 118, 0.0, 60, 4.0, 34)

def sec_outro():
    for b in range(119, 126):
        pad_hold(b, 4.0, 22, 2)
        for o in (0.0, 1.0, 2.0, 3.0):
            add('tick', b, o, 93, 0.09, 20)
        hit(b, 0.0, 0, 46)
        hit(b, 2.0, 0, 38)
    for bar, off, p in [(119, 0.0, 74), (119, 2.0, 70), (120, 0.0, 79), (120, 2.0, 74),
                        (121, 0.0, 81), (121, 2.0, 77), (122, 0.0, 76), (122, 2.0, 73),
                        (123, 0.0, 74), (123, 2.0, 69), (124, 0.0, 74), (124, 2.0, 70),
                        (125, 0.0, 69)]:
        add('bell', bar, off, p, 1.2, 40)
    add('riser', 125, 0.0, 60, 2.5, 36)
    swish(125, 3.0, 48)
    add('knife', 125, 1.0, 91, 0.2, 44)

def write():
    tracks_js = []
    tracks_json = []
    for name, wave, gain in L.TRACK_DEFS:
        ns = sorted(L.TRACKS[name], key=lambda x: (x[0], x[1]))
        tracks_js.append((name, wave, gain, ns))
        tracks_json.append({'name': name, 'wave': wave, 'gain': gain, 'notes': ns})
    dr = sorted(L.DRUMS, key=lambda x: (x[0], x[1]))

    def num(v):
        s = ('%.4f' % v).rstrip('0').rstrip('.')
        return s if s else '0'

    lines = []
    lines.append('/**')
    lines.append(' * EX 面 BOSS《恶魔之妹》v4 —— 红月下被囚禁 495 年的芙兰朵露。')
    lines.append(' * 200 BPM, D 小调, 4/4, 125 小节 = 150.0s 循环：')
    lines.append(' *   引子 I 8（八音盒/钟摆/心跳）→ 引子 II 8（时钟琶音上发条/鼓报到）')
    lines.append(' *   → A1 8 + A2 8（时钟 riff / 长音对句）→ B1 8（hook 半编制）')
    lines.append(' *   → C1 16（hook 全开/三度和声/blast）→ Bridge 6（时停）')
    lines.append(' *   → B2 8（半音桥段 riff/blast）→ C2 16（hook 两遍，79-86 升半音）')
    lines.append(' *   → Solo 8（钢琴 32 分）→ Break 4（半速 build）')
    lines.append(' *   → D 12（八度重击 + 半音下行 32 分）→ Coda 8 → Outro 7（接回引子）。')
    lines.append(' * 素材：U.N. Owen 时钟琶音 b3-4、副歌 hook b20-27、半音桥段 b12-19；')
    lines.append(' * 全曲围绕这三块写，不再另写原创副歌。编制：失真吉他/lead/羽管键琴/铜管/')
    lines.append(' * 弦乐/合唱/贝斯/钢琴/八音盒/钟摆/铺底/对位/琶音/刀/riser；鼓 kind 0-9')
    lines.append(' * （5-6 通鼓 / 7 ride / 8 反向吊镲 / 9 军滚，5-9 只在离线 WAV 渲染器发声）。')
    lines.append(' * tools/build/_fld_compose4.py 生成，勿手改。')
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

    root = os.path.dirname(os.path.dirname(HERE))
    out_js = os.path.join(root, 'src', 'engine', 'songs', 'flandre_devil.js')
    with open(out_js, 'w', encoding='utf-8') as f:
        f.write(js)
    json_path = os.path.join(HERE, '_fld_lead', 'song4.json')
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    data = {'title': '恶魔之妹', 'duration': 150.0, 'bpm': 200,
            'tracks': tracks_json, 'drums': dr}
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print('wrote', out_js)
    print('wrote', json_path)
    print('notes:', sum(len(x['notes']) for x in tracks_json), 'drums:', len(dr))
    for name, _, _, ns in tracks_js:
        if ns:
            print('  %-8s %4d notes  last=%.3f' % (name, len(ns), ns[-1][0] + ns[-1][2]))

def main():
    intro1()
    intro2()
    sec_a1()
    sec_a2()
    sec_b1()
    sec_c1()
    sec_bridge()
    sec_b2()
    sec_c2()
    sec_solo()
    sec_break()
    sec_d()
    sec_coda()
    sec_outro()
    write()

if __name__ == '__main__':
    main()
