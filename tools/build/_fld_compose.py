#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate src/engine/songs/flandre_devil.js and tools/build/_fld_lead/song.json.

《恶魔之妹》 — EX 面 BOSS (芙兰朵露·斯卡雷特 / 红月下被囚禁了 495 年的癫狂)
200 BPM, D minor, 4/4, 100 bars = 120.0 s loop.

参考:
  U.N.オーエンは彼女なのか？  155 BPM D minor（主题 A 的 F5-D5-A4 16 分琶音 /
       Bars 16-23 的高音半音对句 / 20-23 的副歌和弦句）
  最終鬼畜妹フランドール・S   100 BPM 记谱 ×2 听感（4 踩 + 16 分琶音 + 爆发段）
"""
import json
import os

BPM = 200
BEAT = 60.0 / BPM          # 0.3 s
BAR = 4 * BEAT             # 1.2 s
DURATION = 120.0
BARS = 100

PC = {'C': 0, 'C#': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6,
      'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
QUAL = {'m': [0, 3, 7], 'maj': [0, 4, 7], '7': [0, 4, 7, 10],
        'm7': [0, 3, 7, 10], 'dim': [0, 3, 6], 'sus4': [0, 5, 7]}

FORM = [('intro1', 1, 8), ('intro2', 9, 16), ('A1', 17, 24), ('A2', 25, 32),
        ('B', 33, 40), ('C1', 41, 48), ('C2', 49, 56), ('bridge', 57, 64),
        ('D1', 65, 72), ('D2', 73, 80), ('D2b', 81, 88), ('coda', 89, 100)]

CHORDS = {}
def sec(b0, seq):
    for i, (r, q) in enumerate(seq):
        CHORDS[b0 + i] = (r, q)

sec(1,  [('D','m'),('D','m'),('Bb','maj'),('Bb','maj'),('G','m'),('Eb','maj'),('D','m'),('A','7')])
sec(9,  [('D','m'),('D','m'),('Bb','maj'),('Bb','maj'),('G','m'),('G','m'),('A','7'),('A','7')])
sec(17, [('D','m'),('C','maj'),('D','m'),('Bb','maj'),('D','m'),('C','maj'),('E','dim'),('A','7')])
sec(25, [('D','m'),('C','maj'),('D','m'),('Bb','maj'),('Eb','maj'),('D','m'),('A','7'),('D','m')])
sec(33, [('D','m'),('F','maj'),('E','maj'),('G','m'),('E','maj'),('G','m'),('Eb','maj'),('A','7')])
sec(41, [('Bb','maj'),('D','m'),('Bb','maj'),('D','m'),('Bb','maj'),('D','m'),('Bb','maj'),('D','m')])
sec(49, [('Bb','maj'),('D','m'),('Bb','maj'),('D','m'),('Bb','maj'),('D','m'),('Bb','maj'),('D','m')])
sec(57, [('D','m'),('Eb','maj'),('D','m'),('Eb','maj'),('Bb','maj'),('A','7'),('D','m'),('A','7')])
sec(65, [('D','m'),('C','maj'),('D','m'),('Bb','maj'),('Eb','maj'),('D','m'),('A','7'),('D','m')])
sec(73, [('Bb','maj'),('D','m'),('Bb','maj'),('D','m'),('Bb','maj'),('D','m'),('Bb','maj'),('D','m')])
sec(81, [('B','maj'),('Eb','m'),('B','maj'),('Eb','m'),('B','maj'),('Eb','m'),('B','maj'),('Eb','m')])
sec(89, [('D','m'),('Bb','maj'),('G','m'),('A','7'),('D','m'),('Bb','maj'),('G','m'),('A','7'),('D','m'),('Bb','maj'),('D','m'),('D','m')])

# U.N. 副歌的和声是「2 拍一换」：Bb | C / Dm | G / Bb | C / Dm —— 这里按半小节记录。
HALF = {}


def halves(b0, seq4):
    for i in range(8):
        HALF[b0 + i] = seq4[i % 4]


halves(41, [(('Bb', 'maj'), ('C', 'maj')), (('D', 'm'), ('G', 'm')),
            (('Bb', 'maj'), ('C', 'maj')), (('D', 'm'), ('D', 'm'))])
halves(49, [(('Bb', 'maj'), ('C', 'maj')), (('D', 'm'), ('G', 'm')),
            (('Bb', 'maj'), ('C', 'maj')), (('D', 'm'), ('D', 'm'))])
halves(73, [(('Bb', 'maj'), ('C', 'maj')), (('D', 'm'), ('G', 'm')),
            (('Bb', 'maj'), ('C', 'maj')), (('D', 'm'), ('D', 'm'))])
halves(81, [(('B', 'maj'), ('C#', 'maj')), (('Eb', 'm'), ('Ab', 'm')),
            (('B', 'maj'), ('C#', 'maj')), (('Eb', 'm'), ('Eb', 'm'))])


def chord_at(bar, beat):
    """取 bar 内 beat 时刻实际发声的和弦（半小节换和声）。"""
    h = HALF.get(bar)
    if h is None:
        return CHORDS[bar]
    return h[0] if beat < 1.999 else h[1]


TRACK_DEFS = [
    ('guitar', 'sawtooth', 0.105),
    ('lead', 'sawtooth', 0.095),
    ('harpsi', 'square', 0.065),
    ('brass', 'square', 0.05),
    ('strings', 'sawtooth', 0.05),
    ('choir', 'sine', 0.05),
    ('bass', 'triangle', 0.12),
    ('piano', 'sine', 0.07),
    ('bell', 'sine', 0.09),
    ('tick', 'square', 0.05),
    ('pad', 'sine', 0.04),
    ('counter', 'triangle', 0.05),
    ('arp', 'sine', 0.05),
    ('knife', 'square', 0.06),
    ('riser', 'sawtooth', 0.05),
]
TRACKS = {name: [] for name, _, _ in TRACK_DEFS}
DRUMS = []


def beat_of(bar, off=0.0):
    return 4.0 * (bar - 1) + off


def add(name, bar, off, pitch, dur, vel=96):
    t = beat_of(bar, off) * BEAT
    if t >= DURATION - 1e-9:
        return
    d = min(dur * BEAT, DURATION - t)
    if d <= 0.02:
        return
    TRACKS[name].append([round(t, 4), int(pitch), round(d, 4), int(vel)])


def hit(bar, off, kind, vel=100):
    t = beat_of(bar, off) * BEAT
    if 0.0 <= t < DURATION - 1e-9:
        DRUMS.append([round(t, 4), int(kind), int(vel)])


def hit_x(bar, off, kind, vel=100, extra=None):
    t = beat_of(bar, off) * BEAT
    if 0.0 <= t < DURATION - 1e-9:
        ev = [round(t, 4), int(kind), int(vel)]
        if extra is not None:
            ev.append(round(float(extra), 4))
        DRUMS.append(ev)


def midi(root, octv=4):
    return 12 * (octv + 1) + PC[root]


def tones(root, q, octv=4):
    return [midi(root, octv) + i for i in QUAL[q]]


def norm(ps, lo=50, hi=72):
    ps = sorted(ps)
    while ps[0] < lo:
        ps = [p + 12 for p in ps]
    while ps[-1] > hi:
        ps = [p - 12 for p in ps]
    return ps


def power(root, octv=3):
    r = midi(root, octv)
    return [r, r + 7, r + 12]


# ---------------- drum helpers ----------------
def fill_toms(bar, o0=2.0, step=0.25, v0=82, v1=114):
    pat = [6, 6, 5, 5, 6, 5, 5, 5]
    k = 0
    o = o0
    span = max(4.0 - o0, 1e-6)
    while o < 4.0 - 1e-9:
        hit_x(bar, o, pat[k % len(pat)], int(v0 + (v1 - v0) * (o - o0) / span))
        k += 1
        o += step


def fill_roll(bar, o0=2.0, span=2.0, vel=110):
    hit_x(bar, o0, 9, vel, span * BEAT)


def crash(bar, off=0.0, vel=92):
    hit(bar, off, 4, vel)


def swish(bar, off=0.0, vel=62):
    hit_x(bar, off, 8, vel)


def ride_bar(bar, step=0.5, vel=44):
    o = 0.0
    while o < 4.0 - 1e-9:
        hit_x(bar, o, 7, vel)
        o += step


def drums_four(bar, crash_at=0.0, hats16=True, snare=108):
    """4 踩 + 2/4 军鼓 + 16 分闭镲：最终鬼畜妹式的基本盘。"""
    if crash_at is not None:
        hit(bar, crash_at, 4, 92)
    for b in (0.0, 1.0, 2.0, 3.0):
        hit(bar, b, 0, 124)
    hit(bar, 1.0, 1, snare)
    hit(bar, 3.0, 1, snare)
    step = 0.25 if hats16 else 0.5
    o = 0.0
    while o < 4.0 - 1e-9:
        acc = 50 if abs(o - round(o)) < 1e-6 else 36
        hit(bar, o, 2, acc)
        o += step
    hit(bar, 2.5, 3, 62)


def drums_hard(bar, crash_at=0.0):
    """爆发段：16 分双踩 + 军鼓 2/4 + 开镲。"""
    if crash_at is not None:
        hit(bar, crash_at, 4, 96)
    for i in range(16):
        o = i * 0.25
        hit(bar, o, 0, 90 if i % 4 == 0 else 76)
    hit(bar, 1.0, 1, 112)
    hit(bar, 3.0, 1, 112)
    for o in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5):
        hit(bar, o, 3, 58)
    hit(bar, 3.5, 3, 64)


def drums_blast(bar, crash_at=0.0):
    """更疯：16 分 kick + 反拍军鼓（blast beat 感）。"""
    if crash_at is not None:
        hit(bar, crash_at, 4, 100)
    for i in range(16):
        o = i * 0.25
        hit(bar, o, 0, 90 if i % 2 == 0 else 74)
        if i % 4 in (1, 3):
            hit(bar, o, 1, 96)
    for o in (0.0, 1.0, 2.0, 3.0):
        hit(bar, o, 3, 56)


# ---------------- harmonic / texture helpers ----------------
def pad_hold(bar, dur=4.0, vel=38, octv=(2, 3)):
    root, q = CHORDS[bar]
    ps = tones(root, q, octv[0])
    ps = [p for p in ps if p <= 12 * (octv[1] + 1) + 11]
    for p in ps:
        add('pad', bar, 0.0, p, dur, vel)


def chord_voicing(root, q, octv=3):
    """power 和声；减和弦用真实三和弦（root/b3/b5），免得五度音撞车。"""
    if q == 'dim':
        return tones(root, q, octv)
    return power(root, octv)


def strings_power(bar, dur=3.9, vel=58, octv=3):
    root, q = CHORDS[bar]
    for p in chord_voicing(root, q, octv):
        add('strings', bar, 0.0, p, dur, vel)


def brass_stabs(bar, offs, dur=0.22, vel=80, octv=3):
    root, q = CHORDS[bar]
    for off in offs:
        for p in chord_voicing(root, q, octv):
            add('brass', bar, off, p, dur, vel)


def choir_chord(bar, dur=3.9, vel=44, octv=4):
    root, q = CHORDS[bar]
    ps = norm(tones(root, q, octv), 55, 72)
    for p in ps:
        add('choir', bar, 0.0, p, dur, vel)


def bass_8ths(bar, vel=98, oct_hi=True, octv=2):
    root, q = CHORDS[bar]
    r = midi(root, octv)
    hi = r + 12
    seq = [r, r, hi, r, r, hi, r, hi] if oct_hi else [r] * 8
    for i, p in enumerate(seq):
        add('bass', bar, i * 0.5, p, 0.42, vel if i % 2 == 0 else vel - 8)


def bass_drive(bar, vel=104, octv=2):
    root, q = CHORDS[bar]
    r = midi(root, octv)
    add('bass', bar, 0.0, r, 0.42, vel)
    for i in range(1, 8):
        add('bass', bar, i * 0.5, r if i % 2 == 0 else r + 12, 0.42, vel - (6 if i % 2 else 0))


def arp_cycle(name, bar, pitches, step=0.25, dur=0.2, vel=100, off0=0.0, beats=4.0):
    n = int(round(beats / step))
    for i in range(n):
        add(name, bar, off0 + i * step, pitches[i % len(pitches)], dur, vel)


def theme_a_bar(bar, vel=104, track='guitar', oct_shift=0, step=0.25, beats=4.0):
    """U.N. 主题 A：每小节一句三音 16 分琶音（F5-D5-A4 型）。"""
    root, q = CHORDS[bar]
    cells = {
        ('D', 'm'): [77, 74, 69],
        ('C', 'maj'): [76, 72, 67],
        ('Bb', 'maj'): [74, 70, 65],
        ('E', 'dim'): [76, 70, 67],
        ('A', '7'): [76, 73, 69],
        ('F', 'maj'): [77, 72, 69],
        ('G', 'm'): [74, 70, 67],
        ('Eb', 'maj'): [75, 70, 67],
        ('E', 'maj'): [76, 71, 68],
    }
    key = (root, q)
    cell = cells.get(key)
    if cell is None:
        cell = sorted(set(p + 12 * (3 if p < 60 else 0) for p in tones(root, q, 5)))
    cell = [p + oct_shift for p in cell]
    arp_cycle(track, bar, cell, step=step, dur=0.2, vel=vel, beats=beats)


def sec_intro1():
    """引子 I（1-8）：495 年，红月下一个人。八音盒 + 钟摆 + 心跳。"""
    for bar in range(1, 9):
        pad_hold(bar, 4.0, 34)
    mb = {
        1: [(0.0, 77, 1.2, 78), (1.5, 74, 0.55, 70), (2.25, 69, 1.4, 72)],
        2: [(0.5, 77, 0.9, 74), (1.5, 74, 0.5, 66), (2.0, 69, 1.9, 70)],
        3: [(0.0, 70, 1.5, 76), (1.75, 74, 0.6, 66), (2.5, 70, 1.3, 70)],
        4: [(0.75, 70, 1.0, 70), (2.0, 74, 0.8, 64), (3.0, 70, 0.9, 64)],
        5: [(0.0, 74, 1.4, 74), (1.75, 70, 0.7, 66), (2.5, 67, 1.3, 68)],
        6: [(0.5, 75, 0.9, 70), (1.75, 70, 0.6, 64), (2.5, 67, 1.5, 66)],
        7: [(0.0, 69, 1.1, 72), (1.25, 73, 0.6, 66), (2.0, 77, 1.6, 70)],
        8: [(0.5, 73, 0.7, 68), (1.5, 76, 0.9, 70), (2.75, 81, 1.2, 74)],
    }
    for bar, notes in mb.items():
        for off, p, d, v in notes:
            add('bell', bar, off, p, d, v)
    for bar in range(1, 9):
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 20 if o % 1.0 < 1e-6 else 16)
            o += 0.5
    for bar, off in ((4, 3.5), (8, 3.0)):
        add('knife', bar, off, 96, 0.5, 50)
    for bar in (7, 8):
        hit(bar, 0.0, 0, 72)
        hit(bar, 0.5, 0, 54)
    hit_x(8, 2.0, 8, 58)
    add('riser', 8, 2.0, 41, 2.0, 62)
    choir_chord(7, 3.9, 30)
    choir_chord(8, 3.9, 32)


def sec_intro2():
    """引子 II（9-16）：门开。低音持续音走进来，羽管键琴先报主题。"""
    for bar in range(9, 17):
        pad_hold(bar, 4.0, 36)
    for bar in range(9, 13):
        r = midi(CHORDS[bar][0], 2)
        add('bass', bar, 0.0, r, 1.9, 84)
        add('bass', bar, 2.0, r, 1.9, 80)
    for bar in range(13, 17):
        bass_8ths(bar, 92)
    heads = {9: (77, 74, 69), 10: (77, 74, 69), 11: (70, 74, 70), 12: (70, 74, 70),
             13: (74, 70, 67), 14: (74, 70, 67), 15: (69, 73, 76), 16: (69, 73, 76)}
    for bar, (a, b, c) in heads.items():
        add('harpsi', bar, 0.0, a, 0.45, 62)
        add('harpsi', bar, 0.5, b, 0.45, 58)
        add('harpsi', bar, 1.0, c, 0.45, 62)
        add('harpsi', bar, 2.0, a + 12, 0.45, 54)
        add('harpsi', bar, 2.5, b + 12, 0.45, 50)
        add('harpsi', bar, 3.0, c + 12, 0.45, 54)
    for bar in range(12, 17):
        ps = power(CHORDS[bar][0], 3)
        for i in range(8):
            for p in ps[:2]:
                add('guitar', bar, i * 0.5, p, 0.30, 66 if i % 2 == 0 else 60)
        strings_power(bar, 3.9, 46)
    for bar in (9, 10):
        hit(bar, 0.0, 0, 96)
        hit(bar, 2.0, 0, 92)
        hit(bar, 2.5, 1, 66)
    for bar in (11, 12):
        hit(bar, 0.0, 0, 100)
        hit(bar, 2.0, 0, 96)
        hit(bar, 1.0, 1, 78)
        hit(bar, 3.0, 1, 78)
        for i in range(8):
            hit(bar, i * 0.5, 2, 34)
    for bar in (13, 14):
        for b in (0, 1, 2, 3):
            hit(bar, b, 0, 106)
        hit(bar, 1.0, 1, 92)
        hit(bar, 3.0, 1, 92)
        for i in range(16):
            hit(bar, i * 0.25, 2, 40 if i % 2 == 0 else 26)
    for bar in (15, 16):
        for b in (0, 1, 2, 3):
            hit(bar, b, 0, 110)
        for i in range(16):
            hit(bar, i * 0.25, 2, 38 if i % 2 == 0 else 24)
    crash(15, 0.0, 86)
    crash(16, 0.0, 96)
    fill_roll(15, 2.0, 2.0, 106)
    fill_toms(16, 2.0, 0.25, 90, 116)
    swish(16, 0.0, 68)
    add('riser', 16, 0.0, 45, 4.0, 70)
    for bar in range(13, 17):
        choir_chord(bar, 3.9, 38)


def sec_a1():
    """A1（17-24）：恶魔之妹登场。U.N. 主题 A（F5-D5-A4）16 分琶音全编制。"""
    for bar in range(17, 25):
        theme_a_bar(bar, vel=106)
        root = CHORDS[bar][0]
        add('lead', bar, 0.0, midi(root, 5), 3.6, 88)
        bass_8ths(bar, 100)
        brass_stabs(bar, (0.0, 1.5, 2.5), 0.22, 76)
        strings_power(bar, 3.9, 54)
        drums_four(bar, crash_at=0.0 if bar in (17, 21) else None)
    fill_toms(24, 2.0, 0.25, 86, 116)
    fill_roll(24, 3.0, 1.0, 108)
    add('riser', 24, 3.0, 43, 1.0, 58)


def sec_a2():
    """A2（25-32）：同一主题加压，副歌前的最后一次追逐。"""
    for bar in range(25, 33):
        theme_a_bar(bar, vel=110)
        root = CHORDS[bar][0]
        if bar <= 28:
            add('lead', bar, 0.0, midi(root, 5), 3.6, 92)
        else:
            theme_a_bar(bar, vel=104, track='lead', oct_shift=12)
        bass_drive(bar, 104)
        brass_stabs(bar, (0.5, 2.5), 0.2, 84)
        strings_power(bar, 3.9, 58)
        choir_chord(bar, 3.9, 44)
        drums_four(bar, crash_at=0.0 if bar in (25, 27, 29, 31) else None)
    fill_toms(31, 2.0, 0.25, 88, 116)
    fill_roll(32, 2.0, 2.0, 112)
    swish(32, 0.0, 64)


B_PAIRS = {
    ('D', 'm'): (86, 81),
    ('F', 'maj'): (84, 81),
    ('E', 'maj'): (88, 80),
    ('G', 'm'): (91, 82),
    ('Eb', 'maj'): (87, 82),
    ('A', '7'): (88, 85),
}


def sec_b():
    """B（33-40）：癫狂。高音半音对句（U.N. 16-23 小节）+ blast beat + 三全音。"""
    for bar in range(33, 41):
        root, q = CHORDS[bar]
        pr = B_PAIRS.get((root, q), (midi(root, 6), midi(root, 6) - 5))
        for off in (0.0, 1.0, 2.0, 3.0):
            add('lead', bar, off, pr[0], 0.9, 114)
            add('lead', bar, off, pr[1], 0.9, 100)
            add('lead', bar, off + 0.5, pr[0] + 1, 0.16, 62)
        r = midi(root, 2)
        seq = [r, r, r + 6, r, r, r - 1, r, r]
        for i in range(16):
            add('guitar', bar, i * 0.25, seq[i % 8], 0.22, 92 if i % 2 == 0 else 78)
        for i in range(8):
            add('bass', bar, i * 0.5, r, 0.42, 102 if i % 2 == 0 else 90)
        add('bass', bar, 3.5, r + 6, 0.4, 96)
        strings_power(bar, 3.9, 50)
        brass_stabs(bar, (0.0, 2.0), 0.18, 88)
        choir_chord(bar, 3.9, 40)
        # FLD b7-10 用钟琴原样引用 U.N. 桥段（A5 F5 G#5 E5 / B5 G#5 G5 A#5），这里改成 16 分
        chime = [81, 77, 80, 76, 83, 80, 79, 82]
        for i in range(16):
            add('bell', bar, i * 0.25, chime[i % 8], 0.18, 34)
        drums_blast(bar, crash_at=0.0 if bar in (33, 37) else None)
    fill_toms(40, 2.0, 0.25, 90, 118)
    fill_roll(40, 3.0, 1.0, 116)
    for i in range(8):
        add('lead', 40, i * 0.25, 88 - i, 0.2, 96)


C_HOOK = [
    [(0.0, 81, 0.7), (0.75, 86, 0.25), (1.0, 84, 0.5), (1.5, 81, 0.5),
     (2.0, 77, 0.7), (2.75, 81, 0.25), (3.0, 86, 0.5), (3.5, 81, 0.5)],
    [(0.0, 82, 0.7), (0.75, 86, 0.25), (1.0, 89, 0.5), (1.5, 86, 0.5),
     (2.0, 82, 0.7), (2.75, 77, 0.25), (3.0, 82, 0.5), (3.5, 86, 0.5)],
    [(0.0, 84, 0.5), (0.5, 81, 0.5), (1.0, 77, 1.0), (2.0, 81, 0.5),
     (2.5, 84, 0.5), (3.0, 89, 0.5), (3.5, 84, 0.5)],
    [(0.0, 88, 0.5), (0.5, 84, 0.5), (1.0, 79, 1.0), (2.0, 84, 0.5),
     (2.5, 88, 0.5), (3.0, 91, 1.0)],
    [(0.0, 89, 0.5), (0.5, 88, 0.5), (1.0, 86, 1.0), (2.0, 81, 0.5),
     (2.5, 86, 0.5), (3.0, 89, 0.5), (3.5, 93, 0.5)],
    [(0.0, 86, 0.5), (0.5, 84, 0.5), (1.0, 82, 1.0), (2.0, 77, 0.5),
     (2.5, 82, 0.5), (3.0, 86, 0.5), (3.5, 89, 0.5)],
    [(0.0, 87, 0.5), (0.5, 86, 0.5), (1.0, 84, 0.5), (1.5, 82, 0.5),
     (2.0, 79, 1.0), (3.0, 82, 0.5), (3.5, 87, 0.5)],
    [(0.0, 85, 0.5), (0.5, 88, 0.5), (1.0, 81, 1.0), (2.0, 79, 0.5),
     (2.5, 76, 0.5), (3.0, 73, 0.5), (3.5, 69, 0.5)],
]


UN_HOOK = [
    # U.N. 副歌 b20-27 逐音搬入（降八度，midi 74-89），[小节内拍, midi, 时值(拍)]
    [(0.25, 79, 0.25), (1.25, 79, 0.25), (1.75, 74, 0.5), (2.75, 81, 0.5), (3.75, 76, 0.5)],
    [(0.75, 81, 0.5), (1.75, 77, 0.5), (2.75, 79, 0.5), (3.25, 81, 0.5), (3.75, 79, 0.5)],
    [(0.75, 83, 0.5), (1.75, 86, 0.5), (2.25, 81, 0.5), (2.75, 88, 0.5), (3.25, 89, 0.25), (3.75, 88, 0.5)],
    [(0.25, 89, 0.25), (0.5, 88, 0.25), (0.75, 86, 0.5), (1.25, 84, 0.25),
     (1.75, 81, 0.5), (2.25, 84, 0.5), (2.75, 79, 0.5), (3.25, 81, 0.5), (3.75, 77, 2.0)],
    [(1.75, 74, 0.5), (2.75, 81, 0.5), (3.75, 76, 0.5)],
    [(0.75, 81, 0.5), (1.75, 77, 0.5), (2.75, 79, 0.5), (3.25, 81, 0.5), (3.75, 79, 0.5)],
    [(0.75, 83, 0.5), (1.75, 86, 0.5), (2.25, 81, 0.5), (2.75, 88, 0.5), (3.25, 89, 0.25), (3.75, 88, 0.5)],
    [(0.25, 89, 0.25), (0.5, 88, 0.25), (0.75, 86, 0.5), (1.25, 84, 0.25), (1.75, 86, 2.2)],
]


def half_textures(bar, hoff, root, q, vel_mul=1.0, extra=False):
    """半边和声（2 拍）：吉他 16 分 + 贝斯 8 分 + 弦乐/合唱长音 + 铜管 stab。"""
    r = midi(root, 3)
    cell = [r, r + 7, r + 12, r + 7]
    for k in range(8):
        off = hoff + k * 0.25
        add('guitar', bar, off, cell[k % 4], 0.2, int((114 if k % 4 == 0 else 94) * vel_mul))
        add('guitar', bar, off, cell[k % 4] + 12, 0.18, int((78 if k % 4 == 0 else 58) * vel_mul))
    br = midi(root, 2)
    for k in range(4):
        add('bass', bar, hoff + k * 0.5, br + (12 if k == 2 else 0), 0.44,
            int((108 if k == 0 else 100) * vel_mul))
    for p in chord_voicing(root, q, 3):
        add('strings', bar, hoff, p, 1.9, int(74 * vel_mul))
        add('strings', bar, hoff, p + 12, 1.9, int(42 * vel_mul))
    ps = norm(tones(root, q, 4), 55, 72)
    for p in ps:
        add('choir', bar, hoff, p, 1.9, int(56 * vel_mul))
        add('choir', bar, hoff, p + 12, 1.9, int(36 * vel_mul))
        for p in chord_voicing(root, q, 2):
            add('pad', bar, hoff, p, 1.9, int(42 * vel_mul))
    for off in (0.5, 1.5):
        for p in chord_voicing(root, q, 3):
            add('brass', bar, hoff + off, p, 0.2, int(94 * vel_mul))
    if extra:
        base = tones(root, q, 4)
        for k in range(8):
            add('harpsi', bar, hoff + k * 0.25, base[k % len(base)] + 12, 0.15, int(58 * vel_mul))
        for k in range(4):
            add('arp', bar, hoff + k * 0.5, base[k % len(base)] + 24, 0.4, int(46 * vel_mul))


def chorus_section(b0, shift=0, hero=False, extra=False):
    """最终鬼畜妹式副歌：U.N. 副歌原旋律 + Bb-C/Dm-G 半小节和声 + 4 踩 + 16 分吉他。"""
    for i, notes in enumerate(UN_HOOK):
        bar = b0 + i
        for off, p, d in notes:
            add('lead', bar, off, p + shift, d, 125 if hero else 121)
            add('lead', bar, off, p + shift + 12, d, 58 if hero else 52)
            if shift:
                add('bell', bar, off, p + shift + 12, d * 0.8, 30)
        half_textures(bar, 0.0, *chord_at(bar, 0.0), vel_mul=1.0, extra=extra)
        half_textures(bar, 2.0, *chord_at(bar, 2.1), vel_mul=0.96, extra=extra)
        drums_four(bar, crash_at=0.0)
        for off in (0.5, 1.5, 2.5, 3.5):
            hit(bar, off, 0, 86)
        ride_bar(bar, 0.5, 36)
        hit(bar, 1.5, 3, 48)
        hit(bar, 3.5, 3, 54)
        add('bell', bar, 0.0, midi(chord_at(bar, 0.0)[0], 5) + 12, 0.5, 50)


def sec_bridge():
    """Bridge（57-64）：时停 / 495 年的空白。八音盒 + 合唱 + 半个心跳。"""
    for bar in range(57, 65):
        pad_hold(bar, 4.0, 42)
        strings_power(bar, 3.9, 38)
        r = midi(CHORDS[bar][0], 2)
        add('bass', bar, 0.0, r, 3.9, 72)
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 18 if o % 1.0 < 1e-6 else 14)
            o += 0.5
        root, q = CHORDS[bar]
        ps = norm(tones(root, q, 4), 55, 72)
        for j, p in enumerate(ps):
            add('piano', bar, 0.0, p, 1.6, 52)
            add('piano', bar, 2.5, p, 1.3, 46)
    bell = {
        57: [(0.0, 69, 1.4, 74), (1.5, 77, 1.0, 76), (2.5, 74, 1.4, 70)],
        58: [(0.0, 75, 1.2, 70), (1.5, 70, 1.0, 64), (2.5, 67, 1.3, 66)],
        59: [(0.5, 77, 0.8, 72), (1.5, 74, 0.7, 66), (2.5, 69, 1.5, 70)],
        60: [(0.0, 75, 1.2, 68), (1.5, 70, 1.0, 62)],
        61: [(0.0, 70, 1.4, 72), (1.5, 74, 1.0, 66), (2.75, 70, 1.0, 64)],
        62: [(0.0, 73, 1.2, 70), (1.5, 76, 1.0, 70), (2.5, 81, 1.5, 76)],
    }
    for bar, notes in bell.items():
        for off, p, d, v in notes:
            add('bell', bar, off, p, d, v)
    counter = [(57, 74), (58, 75), (59, 77), (60, 75), (61, 74), (62, 73)]
    for bar, p in counter:
        add('counter', bar, 0.0, p, 3.8, 54)
    for bar in range(57, 63):
        hit(bar, 0.0, 0, 86)
        hit(bar, 2.5, 0, 72)
        hit(bar, 2.0, 1, 76)
        hit(bar, 3.5, 3, 38)
        for i in range(8):
            hit(bar, i * 0.5, 2, 20)
    fill_roll(63, 1.0, 3.0, 110)
    for b in (0.0, 1.0, 2.0):
        hit(63, b, 0, 96)
    crash(64, 0.0, 92)
    fill_toms(64, 1.0, 0.25, 88, 116)
    swish(64, 0.0, 68)
    add('riser', 64, 0.0, 43, 4.0, 74)
    for bar in (63, 64):
        choir_chord(bar, 3.9, 46)


def sec_d1():
    """D1（65-72）：再来一次，更疯。主题 A 上 16 分双踩。"""
    for bar in range(65, 73):
        theme_a_bar(bar, vel=112)
        theme_a_bar(bar, vel=100, track='lead', oct_shift=12)
        bass_drive(bar, 108)
        brass_stabs(bar, (0.0, 1.5, 2.5, 3.5), 0.18, 88)
        strings_power(bar, 3.9, 62)
        choir_chord(bar, 3.9, 48)
        drums_hard(bar, crash_at=0.0 if bar in (65, 69) else None)
    fill_toms(72, 2.0, 0.25, 92, 118)
    fill_roll(72, 3.0, 1.0, 114)
    add('riser', 72, 3.0, 45, 1.0, 64)


def sec_coda():
    """Coda（89-100）：崩塌。八音盒回到 495 年前，最后接回引子。"""
    for bar in range(89, 101):
        pad_hold(bar, 4.0, 36)
        strings_power(bar, 3.9, 34)
        r = midi(CHORDS[bar][0], 2)
        add('bass', bar, 0.0, r, 3.8, 66)
    bells = {
        89: [(0.0, 77, 1.2, 72), (1.5, 74, 0.6, 64), (2.25, 69, 1.4, 68)],
        90: [(0.5, 70, 1.0, 66), (1.75, 74, 0.6, 60), (2.5, 70, 1.3, 62)],
        91: [(0.0, 74, 1.4, 68), (1.75, 70, 0.7, 60), (2.5, 67, 1.3, 62)],
        92: [(0.0, 69, 1.1, 66), (1.25, 73, 0.6, 60), (2.0, 76, 1.6, 64)],
        93: [(0.0, 74, 1.4, 62), (2.0, 69, 1.5, 58)],
        94: [(0.0, 70, 1.4, 60), (2.0, 74, 1.5, 56)],
        95: [(0.0, 67, 1.4, 58), (2.0, 70, 1.5, 54)],
        96: [(0.0, 69, 3.6, 56)],
    }
    for bar, notes in bells.items():
        for off, p, d, v in notes:
            add('bell', bar, off, p, d, v)
    for bar in range(89, 101):
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 16 if o % 1.0 < 1e-6 else 12)
            o += 0.5
    for bar, off, p, d, v in (
            (97, 0.0, 77, 1.0, 68), (97, 1.0, 74, 0.8, 60), (97, 1.8, 69, 1.2, 64),
            (98, 0.0, 70, 1.5, 62), (98, 1.5, 74, 1.0, 56),
            (99, 0.5, 67, 1.0, 58), (99, 1.5, 70, 0.8, 52), (99, 2.5, 74, 1.2, 56),
            (100, 0.0, 74, 1.5, 64), (100, 1.5, 69, 1.2, 58), (100, 2.7, 77, 1.0, 60)):
        add('bell', bar, off, p, d, v)
    add('knife', 100, 3.5, 96, 0.5, 44)
    for bar in (99, 100):
        choir_chord(bar, 3.9, 40)
    hit(100, 0.0, 0, 58)
    hit(100, 2.5, 5, 44)
    for bar in range(89, 101):
        root, q = CHORDS[bar]
        ps = norm(tones(root, q, 4), 55, 72)
        for j, p in enumerate(ps):
            add('piano', bar, 0.0, p, 2.2, 34)


def write():
    tracks_js = []
    tracks_json = []
    for name, wave, gain in TRACK_DEFS:
        ns = sorted(TRACKS[name], key=lambda x: (x[0], x[1]))
        tracks_js.append((name, wave, gain, ns))
        tracks_json.append({'name': name, 'wave': wave, 'gain': gain, 'notes': ns})
    dr = sorted(DRUMS, key=lambda x: (x[0], x[1]))

    def num(v):
        s = ('%.4f' % v).rstrip('0').rstrip('.')
        return s if s else '0'

    lines = []
    lines.append('/**')
    lines.append(' * EX 面 BOSS《恶魔之妹》—— 芙兰朵露·斯卡雷特 / 红月下被囚禁了 495 年。')
    lines.append(' * 200 BPM, D 小调, 4/4, 100 小节 = 120.0s 循环：')
    lines.append(' *   引子 I 8（495 年的八音盒）→ 引子 II 8（门开/低音走近）→ A 16（恶魔之妹，主题 A）')
    lines.append(' *   → B 8（癫狂·半音对句/blast）→ C1 8（最终鬼畜妹副歌）→ C2 8（副歌·全编制）')
    lines.append(' *   → Bridge 8（时停·495 的空白）→ D1 8（更疯）→ D2 8（终局副歌）')
    lines.append(' *   → D2b 8（升半音，红月到顶）→ Coda 12（崩塌/八音盒接回引子）。')
    lines.append(' * 主题引用：U.N.オーエンは彼女なのか？ 的主题 A（F5-D5-A4 型 16 分琶音）与')
    lines.append(' * 16-23 小节的高音半音对句；C 段为 200 BPM 的最终鬼畜妹式 4 踩 + 16 分琶音编配。')
    lines.append(' * 编制：失真吉他/lead/羽管键琴/铜管/弦乐/合唱/贝斯/钢琴/八音盒/钟摆/铺底/对位/')
    lines.append(' * 琶音/玻璃/riser；鼓 kind 0-9（5-6 通鼓 / 7 ride / 8 反向吊镲 / 9 军鼓滚奏只在')
    lines.append(' * 离线 WAV 渲染器发声，JS 合成回退会静默忽略）。')
    lines.append(' * tools/build/_fld_compose.py 生成，勿手改。')
    lines.append(' */')
    lines.append('export const FLANDRE_DEVIL = {')
    lines.append('  extra: {')
    lines.append("    title: '恶魔之妹',")
    lines.append('    duration: 120,')
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
    os.makedirs(os.path.dirname(out_js), exist_ok=True)
    with open(out_js, 'w', encoding='utf-8') as f:
        f.write(js)
    json_path = os.path.join(root, 'tools', 'build', '_fld_lead', 'song.json')
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    data = {'title': '恶魔之妹', 'duration': 120.0, 'bpm': 200,
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
    sec_intro1()
    sec_intro2()
    sec_a1()
    sec_a2()
    sec_b()
    chorus_section(41, 0, hero=False, extra=False)
    chorus_section(49, 0, hero=True, extra=True)
    sec_bridge()
    sec_d1()
    chorus_section(73, 0, hero=True, extra=True)
    chorus_section(81, 1, hero=True, extra=True)
    fill_toms(88, 2.0, 0.25, 90, 118)
    fill_roll(88, 3.0, 1.0, 114)
    swish(88, 0.0, 60)
    sec_coda()
    write()


if __name__ == '__main__':
    main()
