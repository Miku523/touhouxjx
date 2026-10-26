#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate src/engine/songs/sakuya_ex.js and tools/build/_exsr_lead/song.json.

《红月下追逐不止的女仆》 — EX 面道中 (十六夜咲夜 / 红月下的追逐)
160 BPM, G minor, 4/4, 80 bars = 120.0 s loop.

Reference material (tools/build/_exsr_ref/):
  月時計 ～ ルナ・ダイアル  144 BPM G#m -> G minor (-1)
  フラワリングナイト        153 BPM G minor (no transpose)
  ナイト・オブ・ナイツ      180 BPM Dm   -> G minor (+5)
"""
import json
import os

BPM = 160
BEAT = 60.0 / BPM          # 0.375 s
BAR = 4 * BEAT             # 1.5 s
DURATION = 120.0

PC = {'C': 0, 'C#': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6,
      'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
QUAL = {'m': [0, 3, 7], 'maj': [0, 4, 7], 'maj7': [0, 4, 7, 11],
        'm7': [0, 3, 7, 10], '7': [0, 4, 7, 10], 'm6': [0, 3, 7, 9],
        'sus4': [0, 5, 7], 'add9': [0, 4, 7, 14]}

# ---- 80-bar form ----------------------------------------------------
CHORDS = {
    # Intro I (1-4)  红月与钟摆
    1: ('G', 'm'), 2: ('Eb', 'maj7'), 3: ('C', 'm'), 4: ('D', '7'),
    # Intro II (5-8)  女仆长的呼吸
    5: ('G', 'm'), 6: ('Eb', 'maj'), 7: ('C', 'm'), 8: ('D', '7'),
    # A (9-16)  完美潇洒
    9: ('G', 'm'), 10: ('Eb', 'maj'), 11: ('C', 'm'), 12: ('D', '7'),
    13: ('G', 'm'), 14: ('Eb', 'maj'), 15: ('Ab', 'maj7'), 16: ('D', '7'),
    # A' (17-20)  提灯照过来
    17: ('G', 'm'), 18: ('C', 'm'), 19: ('Eb', 'maj'), 20: ('D', '7'),
    # B (21-28)  追逐
    21: ('G', 'm'), 22: ('C', 'm'), 23: ('Eb', 'maj'), 24: ('D', '7'),
    25: ('G', 'm'), 26: ('C', 'm'), 27: ('Eb', 'maj'), 28: ('D', '7'),
    # B' (29-32)  刀
    29: ('G', 'm'), 30: ('C', 'm'), 31: ('Eb', 'maj'), 32: ('D', '7'),
    # C1 (33-40)  红月下合唱 (Flowering Night chorus quotation)
    33: ('G', 'm'), 34: ('Eb', 'maj'), 35: ('G', 'm'), 36: ('D', '7'),
    37: ('G', 'm'), 38: ('Eb', 'maj'), 39: ('G', 'm'), 40: ('G', 'm'),
    # Bridge (41-44)  齿轮
    41: ('G', 'm'), 42: ('Eb', 'maj'), 43: ('C', 'm'), 44: ('D', '7'),
    # B2 (45-52)  追逐·升级
    45: ('G', 'm'), 46: ('C', 'm'), 47: ('Eb', 'maj'), 48: ('D', '7'),
    49: ('G', 'm'), 50: ('C', 'm'), 51: ('Eb', 'maj'), 52: ('D', '7'),
    # C2 (53-60)  红月下合唱·全编制
    53: ('G', 'm'), 54: ('Eb', 'maj'), 55: ('G', 'm'), 56: ('D', '7'),
    57: ('G', 'm'), 58: ('Eb', 'maj'), 59: ('G', 'm'), 60: ('G', 'm'),
    # D (61-64)  时停
    61: ('G', 'm'), 62: ('C', 'm7'), 63: ('Eb', 'maj7'), 64: ('D', '7'),
    # E (65-72)  红月再现
    65: ('G', 'm'), 66: ('Eb', 'maj'), 67: ('C', 'm'), 68: ('D', '7'),
    69: ('G', 'm'), 70: ('Eb', 'maj'), 71: ('C', 'm'), 72: ('D', '7'),
    # Coda (73-80)  钟摆
    73: ('G', 'm'), 74: ('Eb', 'maj'), 75: ('C', 'm'), 76: ('D', '7'),
    77: ('G', 'm'), 78: ('Eb', 'maj'), 79: ('C', 'm'), 80: ('G', 'm'),
}

TRACK_DEFS = [
    ('lead', 'sawtooth', 0.13),
    ('harpsi', 'square', 0.075),
    ('strings', 'sawtooth', 0.055),
    ('brass', 'square', 0.05),
    ('bass', 'triangle', 0.115),
    ('piano', 'sine', 0.075),
    ('bell', 'sine', 0.09),
    ('pad', 'sine', 0.035),
    ('counter', 'triangle', 0.055),
    ('knife', 'square', 0.075),
    ('tick', 'square', 0.055),
    ('choir', 'sine', 0.048),
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
    TRACKS[name].append([round(t, 4), int(pitch), round(d, 4), int(vel)])


def add_beat(name, beat, pitch, dur, vel=96):
    t = beat * BEAT
    if t >= DURATION - 1e-9:
        return
    d = min(dur * BEAT, DURATION - t)
    TRACKS[name].append([round(t, 4), int(pitch), round(d, 4), int(vel)])


def hit(bar, off, kind, vel=100):
    t = beat_of(bar, off) * BEAT
    if t < DURATION - 1e-9:
        DRUMS.append([round(t, 4), int(kind), int(vel)])


def roll(bar, o0, o1, step, v0, v1, kind=1):
    t = o0
    while t < o1 - 1e-9:
        v = v0 + (v1 - v0) * (t - o0) / (o1 - o0)
        hit(bar, t, kind, int(v))
        t += step


def midi(root, octv=4):
    return 12 * (octv + 1) + PC[root]


def tones(root, q, octv=4):
    return [midi(root, octv) + i for i in QUAL[q]]


def norm(ps, lo=55, hi=67):
    ps = list(ps)
    while ps[0] < lo:
        ps = [p + 12 for p in ps]
    while ps[0] > hi:
        ps = [p - 12 for p in ps]
    return ps


def strings_hold(bar, root, q, dur=4.0, vel=62, lo=55, hi=64):
    for p in norm(tones(root, q, 4), lo, hi):
        add('strings', bar, 0, p, dur, vel)


def power(root, octv=3):
    """root / fifth / octave only — used for the big chorus (no third to rub the melody)."""
    r = midi(root, octv)
    return [r, r + 7, r + 12]


def brass_stabs(bar, root, q, offs, dur=0.22, vel=78, octv=3):
    ps = power(root, octv)
    for off in offs:
        for p in ps:
            add('brass', bar, off, p, dur, vel)


def arp16(bar, root, q, octv=3, vel=64):
    ps = tones(root, q, octv)
    r, third, fifth = ps[0], ps[1], ps[2]
    seq = [r, fifth, r + 12, third + 12, fifth + 12, third + 12, r + 12, fifth]
    for i in range(16):
        add('harpsi', bar, i * 0.25, seq[i % 8], 0.17, vel)


def arp8(bar, root, q, octv=3, vel=62):
    ps = tones(root, q, octv)
    r, third, fifth = ps[0], ps[1], ps[2]
    seq = [r, fifth, r + 12, third + 12, fifth + 12, r + 12, third + 12, fifth]
    for i in range(8):
        add('harpsi', bar, i * 0.5, seq[i], 0.35, vel)


def grace_run(bar, off, p, n=3, vel=54):
    """32 分装饰音（巴洛克上/下辅助音），把句子收得漂亮一点。"""
    for i in range(n):
        add('harpsi', bar, off - (n - i) * 0.125, p - (n - i), 0.1, vel + i * 2)


def trill(bar, off, p, dur=0.5, vel=50):
    """羽管键琴颤音：主音与上方邻音交替。"""
    t = 0.0
    i = 0
    while t < dur - 1e-9:
        add('harpsi', bar, off + t, p if i % 2 == 0 else p + 1, 0.11, vel)
        t += 0.125
        i += 1


# ---- 扩展鼓（kind 5-9 只在 WAV 渲染器发声；JS 合成回退会静默忽略）----
def hit_x(bar, off, kind, vel=100, extra=None):
    t = beat_of(bar, off) * BEAT
    if t < DURATION - 1e-9:
        ev = [round(t, 4), int(kind), int(vel)]
        if extra is not None:
            ev.append(round(float(extra), 4))
        DRUMS.append(ev)


def fill_toms(bar, o0=2.0, step=0.25, v0=82, v1=114):
    """过门：高/低通鼓交错下坠，替掉没铺满的八分。"""
    pat = [6, 6, 5, 5, 6, 5, 5, 5]
    k = 0
    o = o0
    span = max(4.0 - o0, 1e-6)
    while o < 4.0 - 1e-9:
        hit_x(bar, o, pat[k % len(pat)], int(v0 + (v1 - v0) * (o - o0) / span))
        k += 1
        o += step


def fill_roll(bar, o0=3.0, span=1.5, vel=108):
    """军鼓滚奏（kind 9）：渲染器按 32 分渐强铺满 span 拍。"""
    hit_x(bar, o0, 9, vel, span * BEAT)


def ride_bar(bar, step=1.0, vel=46):
    o = 0.0
    while o < 4.0 - 1e-9:
        hit_x(bar, o, 7, vel)
        o += step


def swish(bar, off=0.0, vel=62):
    """反向吊镲：事件时间 = 骤停点，声音往前扫进下一段。"""
    hit_x(bar, off, 8, vel)


# ---- 「银匙」动机：附点三音上行 G–B♭–D（她把时间收进胸前的动作）----
def motif_spoon(bar, base=67, vel=70, tracks=('bell',)):
    seq = ((0.0, 0, 0.55), (0.75, 3, 0.55), (1.5, 7, 1.0))
    for name in tracks:
        for j, (off, iv, d) in enumerate(seq):
            add(name, bar, off, base + iv, d, max(28, vel - j * 4))


def drums_b2(bar, crash=False):
    """B2 后半：军鼓挪半拍 + 16 分双踩 + ride，听感明显区别于 B。"""
    if crash:
        hit(bar, 0, 4, 88)
    for o in (0, 1.5, 2, 3.5):
        hit(bar, o, 0, 114)
    for o in (1.25, 3.25):
        hit(bar, o, 1, 104)
    for i in range(16):
        hit(bar, i * 0.25, 2, 30 if i % 2 else 40)
    for k in range(16):
        hit(bar, k * 0.25, 0, 86 if k % 2 else 94)
    for k in range(8):
        hit_x(bar, k * 0.5, 7, 42)
    hit(bar, 3.5, 3, 58)


def bass_bar(bar, root, pattern, octv=2, vel=92):
    r = midi(root, octv)
    for off, iv, dur in pattern:
        add('bass', bar, off, r + iv, dur, vel)


A_PAT = [(0, 0, 0.45), (1.5, 7, 0.3), (2, 0, 0.45), (3, 7, 0.3)]
C_PAT = [(0, 0, 0.45), (1.0, 0, 0.3), (1.5, 7, 0.3), (2, 0, 0.45), (3, 7, 0.45)]
CHASE_PAT = [(i * 0.5, 12 if i % 2 else 0, 0.22) for i in range(8)]


def drums_a(bar, crash=False):
    if crash:
        hit(bar, 0, 4, 88)
    for o in (0, 2):
        hit(bar, o, 0, 112)
    for o in (1, 3):
        hit(bar, o, 1, 98)
    for i in range(8):
        hit(bar, i * 0.5, 2, 44)
    hit(bar, 3.5, 3, 52)


def drums_b(bar, crash=False, hard=False):
    if crash:
        hit(bar, 0, 4, 92)
    for o in (0, 1.5, 2, 3.5):
        hit(bar, o, 0, 112)
    for o in (1, 3):
        hit(bar, o, 1, 100)
    for i in range(16):
        hit(bar, i * 0.25, 2, 38 if i % 2 else 48)
    hit(bar, 3.5, 3, 60)
    if hard:
        hit(bar, 0.75, 0, 96)
        hit(bar, 2.75, 0, 100)
        hit(bar, 1.5, 1, 84)
        hit(bar, 2.5, 1, 88)


def drums_c(bar, crash=False, hard=False):
    if crash:
        hit(bar, 0, 4, 96)
    for o in (0, 1, 2, 3):
        hit(bar, o, 0, 112)
    for o in (1, 3):
        hit(bar, o, 1, 104)
    for i in range(16):
        hit(bar, i * 0.25, 2, 33 if i % 2 else 42)
    hit(bar, 3.5, 3, 56)
    if hard:
        for o in (0.5, 1.5, 2.5):
            hit(bar, o, 3, 48)
        hit(bar, 2.75, 0, 100)


def intro1():
    """bars 1-4: red moon, clock pendulum."""
    pads = [[55, 58, 62], [51, 55, 58, 63], [48, 51, 55, 60], [50, 54, 57, 62]]
    for i, ps in enumerate(pads, 1):
        for p in ps:
            add('pad', i, 0, p, 4, 52)
    for i, r in enumerate([43, 39, 36, 38], 1):
        add('bass', i, 0, r, 4, 64)
    for i, p in enumerate([79, 82, 84], 1):
        add('bell', i, 0, p, 2, 64)
    add('bell', 4, 0, 86, 1.5, 62)
    pianos = [[55, 62, 67, 70], [51, 58, 63, 67], [48, 55, 60, 63], [50, 57, 62, 66]]
    for i, ps in enumerate(pianos, 1):
        for j, p in enumerate(ps):
            add('piano', i, j, p, 0.85, 56)
    for k, off in enumerate((0, 1, 2, 3)):
        add('tick', 1, off, 91 if k % 2 == 0 else 86, 0.07, 40)
        add('tick', 2, off, 91 if k % 2 == 0 else 86, 0.07, 40)
    for k in range(8):
        add('tick', 3, k * 0.5, 91 if k % 2 == 0 else 86, 0.06, 42)
    for k in range(16):
        add('tick', 4, k * 0.25, 91 if k % 2 == 0 else 86, 0.05, 40 + int(30 * k / 15))
    luna = [87, 86, 85, 84, 83, 82, 81, 80, 79, 77, 72, 79, 77, 72, 75, 74, 68, 70, 72, 67]
    for i, p in enumerate(luna):
        add('harpsi', 4, i * 0.125, p, 0.16, 76)
    roll(4, 2.0, 4.0, 0.25, 46, 108)
    hit(4, 3.5, 0, 100)


def intro2():
    """bars 5-8: she breathes once before the chase."""
    pads = [[55, 58, 62], [51, 55, 58], [48, 51, 55], [50, 54, 57]]
    for i, ps in enumerate(pads, 5):
        for p in ps:
            add('pad', i, 0, p, 4, 50)
    for bar, r in ((5, 43), (6, 39), (7, 36), (8, 38)):
        add('bass', bar, 0, r, 4, 62)
    # piano quotes the A theme's head, softly
    quote = [(5, 0, 79, .5), (5, .5, 78, .5), (5, 1, 79, 1), (5, 2, 82, .5), (5, 2.5, 79, .5), (5, 3, 75, 1),
             (6, 0, 74, .5), (6, .5, 75, .5), (6, 1, 77, 1), (6, 2, 79, .5), (6, 2.5, 82, .5), (6, 3, 79, 1)]
    for bar, off, p, d in quote:
        add('piano', bar, off, p, d, 52)
    for bar, ps in ((7, [79, 82, 86]), (8, [77, 81, 84])):
        for p in ps:
            add('bell', bar, 0, p, 1.5, 58)
    # strings swell in
    strings_hold(7, 'C', 'm', 4, 50, 52, 60)
    for p in power('D', 3):
        add('strings', 8, 0, p, 2, 54)
    # harpsi rising 16ths into A
    scale = [62, 63, 65, 67, 69, 70, 72, 74, 75, 77, 79, 80, 82, 84, 86, 87]
    for i, p in enumerate(scale):
        add('harpsi', 8, i * 0.25, p, 0.2, 58 + i)
    for k in range(8):
        add('tick', 5, k * 0.5, 91 if k % 2 == 0 else 86, 0.06, 40)
    for k in range(8):
        add('tick', 6, k * 0.5, 91 if k % 2 == 0 else 86, 0.06, 40)
    for k in range(8):
        add('tick', 7, k * 0.5, 91 if k % 2 == 0 else 86, 0.06, 42)
    for k in range(16):
        add('tick', 8, k * 0.25, 91 if k % 2 == 0 else 86, 0.05, 44 + int(20 * k / 15))
    roll(8, 2.0, 4.0, 0.25, 52, 110)
    hit(8, 3.5, 0, 104)


# =====================================================================
# A bars 9-16 — 「完美潇洒的女仆长」
# =====================================================================
MEL_A = [
    (5, 0, 74, .5), (5, .5, 75, .5), (5, 1, 74, 1), (5, 2, 72, .5), (5, 2.5, 70, 1.5),
    (6, 0, 75, .5), (6, .5, 77, .5), (6, 1, 79, 1), (6, 2, 82, .5), (6, 2.5, 81, .5), (6, 3, 79, 1),
    (7, 0, 79, .5), (7, .5, 77, .5), (7, 1, 75, 1), (7, 2, 74, .5), (7, 2.5, 72, .5), (7, 3, 70, 1),
    (8, 0, 69, .5), (8, .5, 72, .5), (8, 1, 74, .5), (8, 1.5, 78, .5), (8, 2, 81, 1), (8, 3, 79, 1),
    (9, 0, 79, 1.5), (9, 1.5, 77, .5), (9, 2, 75, .5), (9, 2.5, 74, .5), (9, 3, 70, 1),
    (10, 0, 75, .5), (10, .5, 79, .5), (10, 1, 82, 1.5), (10, 2.5, 81, .5), (10, 3, 79, 1),
    (11, 0, 84, 1), (11, 1, 82, .5), (11, 1.5, 80, .5), (11, 2, 79, 1), (11, 3, 75, 1),
    (12, 0, 74, .5), (12, .5, 78, .5), (12, 1, 81, .5), (12, 1.5, 84, .5), (12, 2, 86, 1), (12, 3, 84, .5), (12, 3.5, 81, .5),
]

MEL_ATAIL = [
    (0, 0, 79, 1.0), (0, 1.0, 82, .5), (0, 1.5, 81, .5), (0, 2.0, 79, 1.0), (0, 3.0, 74, 1.0),
    (1, 0, 75, .5), (1, .5, 79, .5), (1, 1, 84, 1.0), (1, 2, 82, .5), (1, 2.5, 81, .5), (1, 3, 79, 1.0),
    (2, 0, 87, 1.0), (2, 1, 86, .5), (2, 1.5, 84, .5), (2, 2, 82, 1.0), (2, 3, 79, 1.0),
    (3, 0, 78, 1.0), (3, 1, 81, .5), (3, 1.5, 84, .5), (3, 2, 86, 1.0), (3, 3, 81, .5), (3, 3.5, 79, .5),
]


def mel_place(name, b0, seq, anchor=0, vel=100, octv=0):
    for bar, off, p, d in seq:
        add(name, b0 + (bar - anchor), off, p + octv, d, vel)


def sec_a(b0=9):
    mel_place('lead', b0, MEL_A, 5, 100)
    for i in range(8):
        bar = b0 + i
        root, q = CHORDS[bar]
        strings_hold(bar, root, q, 4, 62)
        arp16(bar, root, q, 3, 62)
        bass_bar(bar, root, A_PAT, 2, 92)
        drums_a(bar, crash=(i in (0, 4)))
        # 完美潇洒：银器擦亮的一闪——玻璃高音只在每小节头亮一下
        t5 = tones(root, q, 4)
        add('bell', bar, 0, t5[0] + 12, 1.2, 30)
        add('bell', bar, 0, t5[2] + 12, 1.2, 26)
        add('strings', bar, 0, t5[0] + 12, 4, 26)
    # 「银匙」动机第一次亮出来（G–B♭–D，附点三音上行）
    motif_spoon(b0 + 4, 79, 58, ('bell',))
    fill_toms(b0 + 7, 2.0, 0.25, 82, 112)
    # 装饰音：她从不赶拍，只把句子收得更好看
    for bar, off, p in ((b0 + 1, 1.0, 79), (b0 + 2, 1.0, 75), (b0 + 3, 2.0, 81),
                        (b0 + 5, 1.0, 82), (b0 + 6, 0.0, 84)):
        grace_run(bar, off, p, 3, vel=50)
    trill(b0 + 3, 3.0, 79, 0.5, 46)
    trill(b0 + 7, 3.0, 81, 0.5, 46)
    # 收句：一串下行钟琴，像提着裙摆行了个礼
    for i, p in enumerate([88, 86, 84, 82, 79, 77, 75, 74]):
        add('bell', b0 + 7, 2.0 + i * 0.25, p, 0.25, 32 + i)
    for bar in (b0 + 3, b0 + 7):
        for p in (78, 79):
            add('knife', bar, 3.5, p, 0.08, 84)
    roll(b0 + 7, 3.0, 4.0, 0.25, 70, 108)


def sec_atail(b0=17):
    """A' — 提灯照过来：她把走廊折成一节。」
    """
    mel_place('lead', b0, MEL_ATAIL, 0, 102)
    mel_place('counter', b0, MEL_ATAIL, 0, 62, -12)
    for i in range(4):
        bar = b0 + i
        root, q = CHORDS[bar]
        strings_hold(bar, root, q, 4, 64)
        arp8(bar, root, q, 3, 60)
        bass_bar(bar, root, A_PAT, 2, 94)
        drums_a(bar, crash=(i == 0))
    for p in (78, 79):
        add('knife', b0 + 3, 2.5, p, 0.08, 92)
    roll(b0 + 3, 3.0, 4.0, 0.125, 74, 110)
    fill_toms(b0 + 3, 2.0, 0.25, 84, 114)
    fill_roll(b0 + 3, 2.75, 1.25, 106)


# =====================================================================
# B bars 21-28 — 「追逐」
# =====================================================================
MEL_B = [
    (13, 0, 74, .5), (13, .5, 70, .25), (13, .75, 72, .25), (13, 1, 74, .5), (13, 1.5, 77, .25), (13, 1.75, 79, .25), (13, 2, 77, .5), (13, 2.5, 74, .5), (13, 3, 70, .5), (13, 3.5, 74, .5),
    (14, 0, 75, .5), (14, .5, 74, .25), (14, .75, 75, .25), (14, 1, 79, .5), (14, 1.5, 82, .5), (14, 2, 81, .25), (14, 2.25, 82, .25), (14, 2.5, 79, .5), (14, 3, 75, .5), (14, 3.5, 72, .5),
    (15, 0, 82, .5), (15, .5, 81, .25), (15, .75, 82, .25), (15, 1, 86, .5), (15, 1.5, 84, .5), (15, 2, 82, .5), (15, 2.5, 79, .5), (15, 3, 75, .5), (15, 3.5, 79, .5),
    (16, 0, 78, .5), (16, .5, 81, .5), (16, 1, 84, .5), (16, 1.5, 81, .5), (16, 2, 78, .25), (16, 2.25, 76, .25), (16, 2.5, 74, .5), (16, 3, 72, .5), (16, 3.5, 69, .5),
    (17, 0, 79, .5), (17, .5, 82, .5), (17, 1, 86, .5), (17, 1.5, 84, .25), (17, 1.75, 82, .25), (17, 2, 81, .5), (17, 2.5, 79, .5), (17, 3, 77, .5), (17, 3.5, 74, .5),
    (18, 0, 75, .5), (18, .5, 79, .5), (18, 1, 84, .5), (18, 1.5, 82, .5), (18, 2, 79, .25), (18, 2.25, 75, .25), (18, 2.5, 74, .5), (18, 3, 72, .5), (18, 3.5, 75, .5),
    (19, 0, 75, .5), (19, .5, 79, .5), (19, 1, 82, .5), (19, 1.5, 84, .5), (19, 2, 82, .5), (19, 2.5, 79, .5), (19, 3, 77, .5), (19, 3.5, 74, .5),
    (20, 0, 69, .5), (20, .5, 72, .5), (20, 1, 74, .5), (20, 1.5, 78, .5), (20, 2, 81, .5), (20, 2.5, 84, .5), (20, 3, 86, 1),
]

MEL_BTAG = [
    (0, 0, 79, .5), (0, .5, 81, .5), (0, 1, 82, .5), (0, 1.5, 81, .5), (0, 2, 79, .5), (0, 2.5, 74, .5), (0, 3, 79, 1.0),
    (1, 0, 75, .5), (1, .5, 79, .5), (1, 1, 84, 1.0), (1, 2, 81, .5), (1, 2.5, 79, .5), (1, 3, 75, 1.0),
    (2, 0, 79, .5), (2, .5, 82, .5), (2, 1, 87, 1.0), (2, 2, 86, .5), (2, 2.5, 84, .5), (2, 3, 82, 1.0),
    (3, 0, 86, 1.0), (3, 1, 84, .5), (3, 1.5, 81, .5), (3, 2, 78, 1.0), (3, 3, 74, 1.0),
]


def sec_b(b0=21, hard=False):
    mel_place('lead', b0, MEL_B, 13, 104)
    for i in range(8):
        bar = b0 + i
        root, q = CHORDS[bar]
        for p in norm(tones(root, q, 4), 58, 70):
            for off in (0.5, 1.5, 2.5, 3.5):
                add('strings', bar, off, p, 0.35, 70)
        brass_stabs(bar, root, q, (1.5, 3.5), 0.2, 78)
        arp8(bar, root, q, 4, 58)
        drums_b(bar, crash=(i in (0, 4)), hard=hard)
        # 更凶：双踩 16 分往里顶，脚底下拖一条低音弦
        for o in (3.25, 3.5, 3.75):
            hit(bar, o, 0, 100 if hard else 94)
        hit(bar, 0.25, 1, 64)
        hit(bar, 2.25, 1, 70)
        for k in range(8):
            add('strings', bar, k * 0.5, 43, 0.22, 44 if hard else 40)
        if i in (2, 6):
            brass_stabs(bar, root, q, (0.5, 2.5), 0.18, 72)
    # D pedal bass (Flowering Night "chase" ostinato)
    for i in range(8):
        bar = b0 + i
        for j, (off, iv, dur) in enumerate(CHASE_PAT):
            add('bass', bar, off, 38 + iv, dur, 98 if hard else 96)
    # 半音上行把她往下一段推
    for bar in (b0 + 3, b0 + 7):
        for k in range(4):
            add('bass', bar, 3.0 + k * 0.25, 38 + k, 0.2, 98)
    for bar in (b0 + 3, b0 + 7):
        for p in (78, 79):
            add('knife', bar, 3.5, p, 0.08, 86)
    roll(b0 + 7, 3.5, 4.0, 0.125, 80, 112)
    # 「银匙」低音回声：她踩着这把银匙追
    motif_spoon(b0, 55, 68, ('counter',))
    add('bass', b0, 0.0, 43, 0.22, 100)
    add('bass', b0, 0.75, 46, 0.22, 100)
    add('bass', b0, 1.5, 50, 0.4, 102)
    fill_toms(b0 + 7, 2.5, 0.25, 88, 116)
    swish(b0 + 8, 0.0, 62)


def sec_btag(b0=29):
    """B' — 飞刀。」
    """
    mel_place('lead', b0, MEL_BTAG, 0, 106)
    mel_place('counter', b0, MEL_BTAG, 0, 64, -12)
    for i in range(4):
        bar = b0 + i
        root, q = CHORDS[bar]
        for p in power(root, 3):
            add('strings', bar, 0, p, 4, 74)
        brass_stabs(bar, root, q, (0, 2), 0.25, 84)
        arp8(bar, root, q, 4, 62)
        drums_b(bar, crash=(i == 0), hard=True)
        for j, (off, iv, dur) in enumerate(CHASE_PAT):
            add('bass', bar, off, 38 + iv, dur, 98)
        # 更凶：底鼓三连推，镲片收在刀口上
        for o in (2.75, 3.0, 3.25, 3.5, 3.75):
            hit(bar, o, 0, 104)
        hit(bar, 3.75, 4, 86)
        for k in range(8):
            add('strings', bar, k * 0.5, 43, 0.22, 44)
    for k in range(4):
        for p in (78, 79):
            add('knife', b0 + 2, k * 0.25, p, 0.06, 78 + k * 4)
    # 十六分飞刀：整小节撒出去
    for k in range(16):
        add('knife', b0 + 3, k * 0.25, 81 if k % 2 == 0 else 78, 0.06, 74 + k)
    for p in (78, 79):
        add('knife', b0 + 3, 3.5, p, 0.08, 90)
    roll(b0 + 3, 2.0, 4.0, 0.125, 84, 116)
    fill_toms(b0 + 3, 2.25, 0.25, 90, 118)
    fill_roll(b0 + 3, 3.0, 1.0, 112)
    motif_spoon(b0, 55, 66, ('counter',))


# =====================================================================
# C bars 33-40 — 「红月下合唱」(Flowering Night chorus quotation)
# =====================================================================
FN_MOD = [
    (0.0, 74, .5), (0.5, 82, .5), (1.0, 81, .25), (1.25, 82, .25), (1.5, 81, .5),
    (2.0, 84, .5), (2.5, 82, .5), (3.0, 81, .25), (3.25, 82, .25), (3.5, 81, .25), (3.75, 77, .25),
    (4.0, 79, .5), (4.5, 86, .5), (5.0, 84, .25), (5.25, 86, .25), (5.5, 84, .25), (5.75, 86, .25),
    (6.0, 89, .5), (6.5, 86, .5), (7.0, 84, .5), (7.5, 86, .5),
]

FN_END = [
    (0.0, 74, .5), (0.5, 82, .5), (1.0, 81, .25), (1.25, 82, .25), (1.5, 81, .5),
    (2.0, 84, .5), (2.5, 82, .5), (3.0, 81, .25), (3.25, 82, .25), (3.5, 81, .25), (3.75, 77, .25),
    (4.0, 79, .5), (4.5, 86, .5), (5.0, 84, .25), (5.25, 86, .25), (5.5, 84, .25), (5.75, 86, .25),
    (6.0, 89, .5), (6.75, 86, .5), (6.88, 89, .25), (7.0, 91, 1.0),
]


def fn_module(base, fsharp=False, ending=False):
    out = []
    if ending:
        seq = FN_END
    else:
        seq = [(o, (90 if (fsharp and abs(o - 6.0) < 1e-6) else p), d) for o, p, d in FN_MOD]
    for o, p, d in seq:
        out.append((base + o, p, d))
    return out


def chorus(b0, hero=False, tag=False):
    """8-bar chorus. hero=True -> full band + choir doubling; tag=True -> closes on the tag."""
    base = beat_of(b0)
    swish(b0, 0.0, 56)
    if tag:
        modules = [fn_module(base, fsharp=True), fn_module(base + 8, ending=True)]
    else:
        modules = [fn_module(base), fn_module(base + 8, fsharp=True),
                   fn_module(base + 16), fn_module(base + 24, ending=True)]
    for mod in modules:
        for b, p, d in mod:
            add_beat('lead', b, p, d, 108 if hero else 106)
            add_beat('counter', b, p - 12, d, 66)
            if p + 12 <= 100:
                add_beat('bell', b, p + 12, d, 50 if hero else 46)
            if p + 12 <= 100:
                add_beat('lead', b, p + 12, d, 78 if hero else 66)
                add_beat('choir', b, p - 12, d, 58)
    for i in range(8):
        bar = b0 + i
        root, q = CHORDS[bar]
        for p in power(root, 3):
            add('strings', bar, 0, p, 4, 76 if hero else 72)
        # octave string layer: makes the chorus carry over the chase
        for p in power(root, 4):
            add('strings', bar, 0, p, 4, 64 if hero else 61)
        for p in power(root, 4):
            add('choir', bar, 0, p, 4, 54 if hero else 50)
        for p in power(root, 3):
            add('choir', bar, 0, p, 4, 46 if hero else 42)
        brass_stabs(bar, root, q, (0, 0.5, 2, 2.5) if hero else (0.5, 1.5, 2.5, 3.5),
                    0.3, 90 if hero else 86)
        # 铜管长音把副歌撑成一面墙（不抢旋律：只根/五/八度）
        for p in power(root, 3):
            add('brass', bar, 0, p, 4, 68 if hero else 64)
        for o in (0.5, 1.5, 2.5, 3.5):
            hit(bar, o, 3, 54 if hero else 50)
        # bell arpeggio shimmer on the hook
        ps = tones(root, q, 5)
        for j in range(8):
            add('bell', bar, j * 0.5, ps[j % 3], 0.3, 58 if hero else 52)
        bass_bar(bar, root, C_PAT, 2, 102 if hero else 100)
        drums_c(bar, crash=(i in (0, 4)), hard=hero)
        ride_bar(bar, 0.5 if hero else 1.0, 48 if hero else 42)
    hit(b0 + 7, 0, 4, 100)


# =====================================================================
# Bridge bars 41-44 — 「齿轮」
# =====================================================================
def bridge(b0=41):
    for i in range(4):
        bar = b0 + i
        root, q = CHORDS[bar]
        arp16(bar, root, q, 3, 66)
        for p in power(root, 3):
            add('strings', bar, 0, p, 4, 60)
        for p in power(root, 2):
            add('pad', bar, 0, p, 4, 34)
        bass_bar(bar, root, [(i2 * 0.5, 12 if i2 % 2 else 0, 0.24) for i2 in range(8)], 2, 90)
        # half-time drums: room for the clockwork
        hit(bar, 0, 0, 110)
        hit(bar, 2, 0, 108)
        hit(bar, 1, 1, 96)
        hit(bar, 3, 1, 98)
        for j in range(8):
            hit(bar, j * 0.5, 2, 40)
        for k in range(8):
            add('tick', bar, k * 0.5, 91 if k % 2 == 0 else 86, 0.06, 40)
    lead = [(0, 0, 79, 1.5), (0, 2, 82, 1.5), (0, 3.5, 84, .5),
            (1, 0, 87, 2), (1, 2, 84, 2),
            (2, 0, 82, 2), (2, 2, 79, 2),
            (3, 0, 84, 2), (3, 2, 81, 2)]
    for bar, off, p, d in lead:
        add('lead', b0 + bar, off, p, d, 86)
    for p in (78, 79):
        add('knife', b0 + 2, 3.5, p, 0.08, 88)
        add('knife', b0 + 3, 3.5, p, 0.08, 92)
    roll(b0 + 3, 2.0, 4.0, 0.25, 78, 114)


# =====================================================================
# B2 bars 45-52 — 「追逐·升级」(bVI pedal, knives)
# =====================================================================
def sec_b2(b0=45):
    mel_place('lead', b0, MEL_B, 13, 108)
    mel_place('counter', b0, MEL_B, 13, 68, -12)
    # last four bars: octave doubling lifts the chase into the chorus
    for bar, off, p, d in MEL_B:
        if 17 <= bar <= 20:
            add('lead', b0 + (bar - 13), off, p + 12, d, 90)
    for i in range(8):
        bar = b0 + i
        root, q = CHORDS[bar]
        for p in power(root, 3):
            add('strings', bar, 0, p, 4, 74)
        brass_stabs(bar, root, q, (0, 1.5, 2, 3.5), 0.22, 90)
        arp8(bar, root, q, 4, 64)
        if i >= 4:
            drums_b2(bar, crash=(i == 4))
            brass_stabs(bar, root, q, (0.5, 2.5), 0.18, 80)
        else:
            drums_b(bar, crash=(i == 0), hard=True)
        # 更凶：四踩推满，双踩补在反拍
        for o in (3.25, 3.5, 3.75):
            hit(bar, o, 0, 106)
        hit(bar, 2.25, 1, 76)
        for k in range(8):
            add('strings', bar, k * 0.5, 43, 0.22, 46)
    # Eb pedal, then D pedal for the turnaround bar
    for i in range(7):
        bar = b0 + i
        for j in range(8):
            add('bass', bar, j * 0.5, 39 + (7 if j % 2 else 0), 0.22, 98)
    for j in range(8):
        add('bass', b0 + 7, j * 0.5, 38 + (12 if j % 2 else 0), 0.22, 100)
    for k in range(8):
        p = 78 if k % 2 else 81
        add('knife', b0 + 4, k * 0.25, p, 0.07, 82 + k * 3)
    # 最后两小节：飞刀十六条，接合唱
    for k in range(16):
        add('knife', b0 + 6, k * 0.25, 81 if k % 2 == 0 else 78, 0.06, 84 + k)
    for k in range(16):
        add('knife', b0 + 7, k * 0.25, 84 if k % 2 == 0 else 81, 0.06, 90 + k)
    for bar in (b0 + 3, b0 + 7):
        for p in (78, 79):
            add('knife', bar, 3.5, p, 0.08, 90)
    roll(b0 + 7, 3.5, 4.0, 0.125, 84, 118)
    fill_toms(b0 + 7, 2.25, 0.25, 90, 118)
    fill_roll(b0 + 7, 3.25, 0.75, 112)
    motif_spoon(b0, 55, 66, ('counter',))
    swish(b0, 0.0, 60)
    fill_toms(b0 - 1, 2.5, 0.25, 86, 114)


# =====================================================================
# D bars 61-64 — 「时停」
# =====================================================================
def sec_d(b0=61):
    # bar 60 尾巴：吊镲一层层吸住时间
    for k in range(5):
        hit(b0 - 1, 2.0 + k * 0.4, 4, 40 + k * 6)
    # bar 61: time stopped — 银盘、玻璃与一颗停住的心（亮，且空）
    for p in (55, 58, 62):
        add('pad', b0, 0, p, 4, 36)
    for p in (79, 86):
        add('pad', b0, 0, p, 4, 24)
    add('bell', b0, 0, 91, 4.0, 88)
    for p, v in ((86, 82), (94, 76), (98, 70)):
        add('bell', b0, 0, p, 3.6, v)
    for p, v in ((79, 74), (86, 68), (91, 60)):
        add('piano', b0, 0, p, 3.4, v)
    add('strings', b0, 0, 79, 4, 28)
    add('strings', b0, 0, 86, 4, 24)
    seq = [79, 82, 86, 91, 94, 98, 94, 91, 86, 82, 79, 82, 86, 91, 94, 98]
    for i, p in enumerate(seq):
        add('bell', b0, i * 0.25, p, 0.22, 68 + (i % 4) * 6)
    for k in range(8):
        add('tick', b0, k * 0.5, 98 if k % 2 == 0 else 93, 0.08, 56)
    # 羽管键琴高音十六分：玻璃碎裂一样的亮（square 的泛音一直亮到 8k）
    for i, p in enumerate([79, 82, 86, 91, 94, 98, 100, 98, 94, 91, 86, 82, 86, 91, 94, 98]):
        add('harpsi', b0, i * 0.25, p, 0.2, 42 + (i % 4) * 6)
    # bar 62: music box wakes up
    for i, p in enumerate([60, 63, 67, 70, 72, 70, 67, 63]):
        add('piano', b0 + 1, i * 0.5, p, 0.4, 62)
    for off, p, d in [(0, 79, .5), (0.5, 78, .5), (1, 79, .5), (1.5, 75, .5), (2, 74, 1), (3, 72, 1)]:
        add('bell', b0 + 1, off, p, d, 74)
    for i, p in enumerate([91, 94, 98, 94, 91, 86, 91, 94]):
        add('bell', b0 + 1, i * 0.5, p, 0.3, 58)
    for p in (48, 51, 55, 58):
        add('pad', b0 + 1, 0, p, 4, 30)
    for k in range(8):
        add('tick', b0 + 1, k * 0.5, 98 if k % 2 == 0 else 93, 0.06, 52)
    # bar 63: clock winding down — 高音碎成玻璃
    for i, p in enumerate([63, 67, 70, 74, 70, 67, 63, 58]):
        add('piano', b0 + 2, i * 0.5, p, 0.4, 58)
    for i, p in enumerate([86, 85, 84, 83, 82, 81, 80, 79, 78, 77, 76, 75]):
        add('bell', b0 + 2, i * 0.25, p, 0.3, 78)
    for i, p in enumerate([100, 98, 96, 94, 91, 88, 86, 84]):
        add('harpsi', b0 + 2, i * 0.25, p, 0.2, 52 - i)
    for i in range(12):
        add('bell', b0 + 2, i * 0.25, 100 - i * 2, 0.18, 60 - i)
    for p in (51, 55, 58, 63):
        add('pad', b0 + 2, 0, p, 4, 30)
    # bar 64: time resumes — 光倒流回来
    for i in range(8):
        add('bass', b0 + 3, i * 0.5, 38 + (12 if i % 2 else 0), 0.22, 86)
    roll(b0 + 3, 0.0, 4.0, 0.25, 50, 116)
    hit(b0 + 3, 3.5, 0, 104)
    for i, p in enumerate([67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79]):
        add('harpsi', b0 + 3, i * 0.25, p, 0.22, 60 + int(28 * i / 12))
    for i, p in enumerate([79, 82, 86, 91, 94, 98, 100]):
        add('bell', b0 + 3, 1.0 + i * 0.25, p, 0.3, 54 + i * 5)
    for p in (50, 54, 57, 62):
        add('pad', b0 + 3, 0, p, 4, 44)


# =====================================================================
# E bars 65-72 — 「红月再现」
# =====================================================================
MEL_TAG = [
    (0, 0, 84, 1.0), (0, 1, 82, .5), (0, 1.5, 84, .5), (0, 2, 86, 1.0), (0, 3, 84, .5), (0, 3.5, 82, .5),
    (1, 0, 81, 1.0), (1, 1, 79, .5), (1, 1.5, 81, .5), (1, 2, 84, 1.0), (1, 3, 81, 1.0),
]


def sec_e(b0=65):
    # restate A theme head (bars 65-68 = MEL_A 5-8 shifted)
    for bar, off, p, d in MEL_A:
        if 5 <= bar <= 8:
            add('lead', b0 + (bar - 5), off, p, d, 104)
            add('counter', b0 + (bar - 5), off, p - 12, d, 64)
    # chorus tag (bars 69-72 = FN ending module + tag)
    for b, p, d in fn_module(beat_of(b0 + 4), ending=True):
        add_beat('lead', b, p, d, 108)
        add_beat('counter', b, p - 12, d, 66)
        add_beat('choir', b, p - 12, d, 56)
    for bar, off, p, d in MEL_TAG:
        add('lead', b0 + 6 + bar, off, p, d, 106)
    for i in range(8):
        bar = b0 + i
        root, q = CHORDS[bar]
        if i < 4:
            strings_hold(bar, root, q, 4, 64, 56, 66)
            arp16(bar, root, q, 3, 58)
            drums_c(bar, crash=(i == 0))
        else:
            for p in power(root, 3):
                add('strings', bar, 0, p, 4, 70)
            drums_c(bar, crash=(i == 4), hard=True)
        for p in power(root, 4):
            add('choir', bar, 0, p, 4, 46)
        bass_bar(bar, root, C_PAT, 2, 98)
        if i >= 4:
            brass_stabs(bar, root, q, (0, 2), 0.3, 88)
    brass_stabs(b0, 'G', 'm', (0,), 0.6, 84)
    roll(b0 + 7, 3.0, 4.0, 0.125, 90, 112)
    # 「银匙」在红月下最后一次合上
    motif_spoon(b0, 55, 64, ('counter',))
    motif_spoon(b0 + 4, 79, 50, ('bell',))
    fill_toms(b0 + 7, 2.5, 0.25, 88, 116)


# =====================================================================
# Coda bars 73-80 — 「钟摆」
# =====================================================================
def coda(b0=73):
    # 73-76: last chorus tag, full band
    for b, p, d in fn_module(beat_of(b0), fsharp=False):
        add_beat('lead', b, p, d, 108)
        add_beat('counter', b, p - 12, d, 66)
        add_beat('choir', b, p - 12, d, 58)
    for bar, off, p, d in MEL_TAG:
        add('lead', b0 + 2 + bar, off, p, d, 106)
    for i in range(4):
        bar = b0 + i
        root, q = CHORDS[bar]
        for p in power(root, 3):
            add('strings', bar, 0, p, 4, 72)
        for p in power(root, 4):
            add('choir', bar, 0, p, 4, 50)
        brass_stabs(bar, root, q, (0, 2), 0.32, 90)
        bass_bar(bar, root, C_PAT, 2, 98)
        drums_c(bar, crash=(i == 0), hard=True)
    roll(b0 + 3, 3.0, 4.0, 0.125, 92, 112)
    # 77-80: pendulum / the clock keeps ticking into the loop
    pianos = [[55, 62, 67, 70], [51, 58, 63, 67], [48, 55, 60, 63], [43, 55, 62, 67]]
    for i, ps in enumerate(pianos):
        for j, p in enumerate(ps):
            add('piano', b0 + 4 + i, j, p, 0.9, 54)
    for i, r in enumerate([43, 39, 36, 43]):
        add('bass', b0 + 4 + i, 0, r, 4, 62)
    for i, p in enumerate([79, 82, 84, 79]):
        add('bell', b0 + 4 + i, 0, p, 2.0, 62)
    add('bell', b0 + 7, 0, 91, 3.0, 64)
    for i in range(4):
        bar = b0 + 4 + i
        for k in range(8):
            add('tick', bar, k * 0.5, 91 if k % 2 == 0 else 86, 0.07, 44)
    for p in (55, 58, 62):
        add('strings', b0 + 7, 0, p, 4, 66)
    for p in power('G', 4):
        add('choir', b0 + 7, 0, p, 4, 48)
    for p in (55, 58, 62):
        add('pad', b0 + 7, 0, p, 4, 48)
    # 循环接缝：最后一拍闪回引子的三颗银铃，尾音正好咬住开头
    for j, p in enumerate([79, 82, 84]):
        add('bell', b0 + 7, 2.5 + j * 0.5, p, 1.2, 56 + j * 2)
    for off in (2.5, 3.0, 3.5):
        add('tick', b0 + 7, off, 91 if off != 3.0 else 86, 0.07, 44)
    for i in range(4):
        ride_bar(b0 + i, 0.5, 38)


def main():
    intro1()
    intro2()
    sec_a(9)
    sec_atail(17)
    sec_b(21)
    sec_btag(29)
    chorus(33)
    bridge(41)
    sec_b2(45)
    chorus(53, hero=True)
    sec_d(61)
    sec_e(65)
    coda(73)

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
    lines.append(' * EX 面道中《红月下追逐不止的女仆》—— 十六夜咲夜 / 红月下的追逐。')
    lines.append(' * 160 BPM, G 小调, 4/4, 80 小节 = 120.0s 循环；红月下的女仆长：')
    lines.append(' *   引子 8（钟摆/血月）→ A 12（完美潇洒）→ B 12（追逐）→ C 8（红月下合唱）')
    lines.append(' *   → 桥 4（齿轮）→ B2 8（追逐·升级）→ C2 8（合唱·全编制）→ D 4（时停）')
    lines.append(' *   → E 8（红月再现）→ 尾声 8（钟摆，接回引子）。')
    lines.append(' * 编制要点：银匙动机 G–B♭–D 贯穿 A/B/E；B 段之后军鼓挪半拍、16 分双踩推成 B2；')
    lines.append(' * 过门用通鼓/ride/军鼓滚奏/反向吊镲；副歌三声部合唱；尾拍闪回引子银铃闭合循环。')
    lines.append(' * 参考 月時計 ～ ルナ・ダイアル（-1 半音）/ フラワリングナイト（原位）/ ナイト・オブ・ナイツ（+5 半音）；')
    lines.append(' * C 段旋律 = フラワリングナイト D 段副歌原样 G 小调引用；Intro 末 = ルナ・ダイアル 32 分半音下行 G 小调版。')
    lines.append(' * tools/build/_exsr_compose.py 生成，勿手改。')
    lines.append(' */')
    lines.append('export const SAKUYA_EX = {')
    lines.append('  ex_pre: {')
    lines.append("    title: '红月下追逐不止的女仆',")
    lines.append('    duration: 120,')
    lines.append('    bpm: 160,')
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
    out_js = os.path.join(root, 'src', 'engine', 'songs', 'sakuya_ex.js')
    os.makedirs(os.path.dirname(out_js), exist_ok=True)
    with open(out_js, 'w', encoding='utf-8') as f:
        f.write(js)
    json_path = os.path.join(root, 'tools', 'build', '_exsr_lead', 'song.json')
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    data = {'title': '红月下追逐不止的女仆', 'duration': 120.0, 'bpm': 160,
            'tracks': tracks_json, 'drums': dr}
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print('wrote', out_js)
    print('wrote', json_path)
    print('notes:', sum(len(x['notes']) for x in tracks_json), 'drums:', len(dr))
    for name, _, _, ns in tracks_js:
        if ns:
            print('  %-8s %4d notes  last=%.3f' % (name, len(ns), ns[-1][0] + ns[-1][2]))


if __name__ == '__main__':
    main()
