# -*- coding: utf-8 -*-
"""EX 面 BOSS《恶魔之妹》—— 芙兰朵露·斯卡雷特 / 红月下的 495 年。

192 BPM, D 小调, 4/4, 120 小节 = 150.0s 循环（1 小节 1.25s）：
  引子 I 1-8      495 年的八音盒 / 钟摆 / 心跳（红月）
  引子 II 9-16    门开：羽管键琴的时钟琶音、低音走近、lead 第一次发问
  A1 17-24        恶魔之妹：可唱的 8 小节主题（被囚禁的日常，甜里带不安）
  A2 25-32        同一主题加压：合唱、双踩、后半句抬到 Eb
  B 33-40         癫狂：半音对句、blast beat、钟琴的鬼畜引用（FLD b7-10）
  C1 41-56        U.N. 副歌 hook 两次（第二次全编制）
  Bridge 57-64    时停 / 495 年的空白；61-64 起浪
  B2 65-72        第二波癫狂（更硬）+ 高音尖叫句
  C2 73-88        副歌两次（hero；后半吉他 16 分墙）
  Solo 89-96      羽管键琴时钟琶音 + lead 十六分跑句
  Break 97-104    半速 build（刀 / 钟 / 心跳），101-104 起浪
  C3 105-112      全体升半音（红月到顶）
  Coda 113-120    崩塌：八音盒把副歌还成摇篮曲，接回引子

音乐素材：
  * U.N. Owen 时钟琶音（F-D-A-E 型）作为引子 II / A 段 / solo 的 16 分动机；
  * U.N. 副歌 hook（原分析 b20-27）整体前移 0.25 拍落到正拍，本曲的 C 段；
  * B 段钟琴 16 分引用 FLD b7-10 的半音下行；
  * 半音摩擦（Dm 上的 Eb、A7 上的 C#）是「癫狂」的颜料，只放在弱拍/经过音。

编制：失真吉他 / lead / 羽管键琴 / 铜管 / 弦乐 / 合唱 / 贝斯 / 钢琴 / 八音盒 /
      钟摆 / 铺底 / 对位 / 琶音 / 刀 / riser；鼓 kind 0-9（5-6 通鼓 / 7 ride /
      8 反向吊镲 / 9 军滚），5-9 只在离线 WAV 渲染器发声，JS 合成回退会静默忽略。
tools/build/_fld_compose2.py 生成，勿手改。
"""
import os
import json

BPM = 192
BEAT = 60.0 / BPM          # 0.3125 s
BAR = 4 * BEAT             # 1.25 s
DURATION = 150.0
BARS = 120

PC = {'C': 0, 'C#': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6,
      'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
QUAL = {'m': [0, 3, 7], 'maj': [0, 4, 7], '7': [0, 4, 7, 10],
        'm7': [0, 3, 7, 10], 'dim': [0, 3, 6], 'sus4': [0, 5, 7]}

FORM = [('intro1', 1, 8), ('intro2', 9, 16), ('A1', 17, 24), ('A2', 25, 32),
        ('B', 33, 40), ('C1', 41, 56), ('bridge', 57, 64), ('B2', 65, 72),
        ('C2', 73, 88), ('solo', 89, 96), ('break', 97, 104), ('C3', 105, 112),
        ('coda', 113, 120)]

CHORDS = {}
def sec(b0, seq):
    for i, (r, q) in enumerate(seq):
        CHORDS[b0 + i] = (r, q)

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
sec(41,  [('Bb','maj'),('D','m'),('Bb','maj'),('D','m'),
          ('Bb','maj'),('D','m'),('Bb','maj'),('D','m')])
sec(49,  [('Bb','maj'),('D','m'),('Bb','maj'),('D','m'),
          ('Bb','maj'),('D','m'),('Bb','maj'),('D','m')])
sec(57,  [('D','m'),('Eb','maj'),('D','m'),('Eb','maj'),
          ('Bb','maj'),('A','7'),('D','m'),('A','7')])
sec(65,  [('D','m'),('F','maj'),('E','maj'),('G','m'),
          ('E','maj'),('G','m'),('Eb','maj'),('A','7')])
sec(73,  [('Bb','maj'),('D','m'),('Bb','maj'),('D','m'),
          ('Bb','maj'),('D','m'),('Bb','maj'),('D','m')])
sec(81,  [('Bb','maj'),('D','m'),('Bb','maj'),('D','m'),
          ('Bb','maj'),('D','m'),('Bb','maj'),('D','m')])
sec(89,  [('D','m'),('C','maj'),('D','m'),('Bb','maj'),
          ('Eb','maj'),('D','m'),('A','7'),('D','m')])
sec(97,  [('Bb','maj'),('C','maj'),('D','m'),('D','m'),
          ('Bb','maj'),('C','maj'),('A','7'),('A','7')])
sec(105, [('B','maj'),('Eb','m'),('B','maj'),('Eb','m'),
          ('B','maj'),('Eb','m'),('B','maj'),('Eb','m')])
sec(113, [('D','m'),('Bb','maj'),('G','m'),('A','7'),
          ('D','m'),('Bb','maj'),('D','m'),('D','m')])

HALF = {}
def halves(b0, seq4):
    for i in range(8):
        HALF[b0 + i] = seq4[i % 4]

# U.N. 副歌的和声是 2 拍一换：Bb|C / Dm|G / Bb|C / Dm
CH = [(('Bb','maj'),('C','maj')), (('D','m'),('G','m')),
      (('Bb','maj'),('C','maj')), (('D','m'),('D','m'))]
halves(41, CH)
halves(49, CH)
halves(73, CH)
halves(81, CH)
# C3：整体升半音（B|C# / Ebm|Abm / B|C# / Ebm）
halves(105, [(('B','maj'),('C#','maj')), (('Eb','m'),('Ab','m')),
             (('B','maj'),('C#','maj')), (('Eb','m'),('Eb','m'))])


def chord_at(bar, beat):
    h = HALF.get(bar)
    if h is None:
        return CHORDS[bar]
    return h[0] if beat < 1.999 else h[1]


TRACK_DEFS = [
    ('guitar', 'sawtooth', 0.058),
    ('lead', 'sawtooth', 0.205),
    ('harpsi', 'square', 0.058),
    ('brass', 'square', 0.072),
    ('strings', 'sawtooth', 0.062),
    ('choir', 'sine', 0.058),
    ('bass', 'triangle', 0.108),
    ('piano', 'sine', 0.070),
    ('bell', 'sine', 0.105),
    ('tick', 'square', 0.050),
    ('pad', 'sine', 0.032),
    ('counter', 'triangle', 0.050),
    ('arp', 'sine', 0.050),
    ('knife', 'square', 0.060),
    ('riser', 'sawtooth', 0.050),
]
TRACKS = {name: [] for name, _, _ in TRACK_DEFS}
DRUMS = []
DRUM_SCALE = 0.76


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
        DRUMS.append([round(t, 4), int(kind), int(round(vel * DRUM_SCALE))])


def hit_x(bar, off, kind, vel=100, extra=None):
    t = beat_of(bar, off) * BEAT
    if 0.0 <= t < DURATION - 1e-9:
        ev = [round(t, 4), int(kind), int(round(vel * DRUM_SCALE))]
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


def chord_voicing(root, q, octv=3):
    """减和弦用真实三和弦（root/b3/b5），不然五度音会和小三度撞成小二度。"""
    if q == 'dim':
        return tones(root, q, octv)
    return power(root, octv)


# ---------------- 鼓 ----------------
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


def ride_bar(bar, step=0.5, vel=40):
    o = 0.0
    while o < 4.0 - 1e-9:
        hit_x(bar, o, 7, vel)
        o += step


def drums_four(bar, crash_at=0.0, hats16=False, snare=104, kicks=120):
    """4 踩 + 2/4 军鼓 + 闭镲（默认 8 分，副歌可 16 分）。"""
    if crash_at is not None:
        hit(bar, crash_at, 4, 92)
    for b in (0.0, 1.0, 2.0, 3.0):
        hit(bar, b, 0, kicks)
    hit(bar, 1.0, 1, snare)
    hit(bar, 3.0, 1, snare)
    step = 0.25 if hats16 else 0.5
    o = 0.0
    while o < 4.0 - 1e-9:
        acc = 46 if abs(o - round(o)) < 1e-6 else 32
        hit(bar, o, 2, acc)
        o += step
    hit(bar, 2.5, 3, 56)


def drums_drive(bar, crash_at=None, roll=False):
    """副歌 hero：4 踩 + 8 分底鼓 + 16 分镲。"""
    if crash_at is not None:
        hit(bar, crash_at, 4, 96)
    for i in range(8):
        o = i * 0.5
        hit(bar, o, 0, 116 if i % 2 == 0 else 84)
    hit(bar, 1.0, 1, 110)
    hit(bar, 3.0, 1, 110)
    o = 0.0
    while o < 4.0 - 1e-9:
        hit(bar, o, 2, 48 if abs(o - round(o)) < 1e-6 else 30)
        o += 0.25
    for o in (0.5, 1.5, 2.5, 3.5):
        hit(bar, o, 3, 52)


def drums_hard(bar, crash_at=None):
    if crash_at is not None:
        hit(bar, crash_at, 4, 96)
    for i in range(8):
        o = i * 0.5
        hit(bar, o, 0, 112 if i % 2 == 0 else 80)
    hit(bar, 1.0, 1, 108)
    hit(bar, 3.0, 1, 108)
    for o in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5):
        hit(bar, o, 3, 54)


def drums_blast(bar, crash_at=None):
    if crash_at is not None:
        hit(bar, crash_at, 4, 100)
    for i in range(16):
        o = i * 0.25
        hit(bar, o, 0, 86 if i % 2 == 0 else 70)
        if i % 4 in (1, 3):
            hit(bar, o, 1, 92)
    for o in (0.0, 1.0, 2.0, 3.0):
        hit(bar, o, 3, 52)


def drums_half(bar, crash_at=None, snare=88):
    if crash_at is not None:
        hit(bar, crash_at, 4, 84)
    hit(bar, 0.0, 0, 104)
    hit(bar, 2.0, 0, 96)
    hit(bar, 2.0, 1, snare)
    o = 0.0
    while o < 4.0 - 1e-9:
        hit(bar, o, 2, 26)
        o += 0.5


# ---------------- 和声织体 ----------------
def pad_hold(bar, dur=4.0, vel=32, octv=2):
    for off in (0.0, 2.0):
        root, q = chord_at(bar, off)
        hd = min(1.95, dur - off) if dur > 2.0 else dur
        for p in tones(root, q, octv):
            add('pad', bar, off, p, hd, vel)


def power_sustain(name, bar, vel=56, octv=3):
    for off in (0.0, 2.0):
        root, q = chord_at(bar, off)
        for p in chord_voicing(root, q, octv):
            add(name, bar, off, p, 1.95, vel)


def choir_chord(bar, vel=44, octv=4):
    for off in (0.0, 2.0):
        root, q = chord_at(bar, off)
        for p in norm(tones(root, q, octv), 55, 74):
            add('choir', bar, off, p, 1.95, vel)


def brass_stabs(bar, offs, dur=0.18, vel=82, octv=3):
    for off in offs:
        root, q = chord_at(bar, off)
        for p in chord_voicing(root, q, octv):
            add('brass', bar, off, p, dur, vel)


def bass_8ths(bar, vel=98, octv=2):
    for off in (0.0, 2.0):
        root, q = chord_at(bar, off)
        r = midi(root, octv)
        for k in range(4):
            o = off + k * 0.5
            add('bass', bar, o, r if k % 2 == 0 else r + 12, 0.42,
                vel if k % 2 == 0 else vel - 8)


def bass_drive(bar, vel=104, octv=2):
    for off in (0.0, 2.0):
        root, q = chord_at(bar, off)
        r = midi(root, octv)
        for k in range(4):
            o = off + k * 0.5
            add('bass', bar, o, r if k % 2 == 0 else r + 12, 0.42,
                vel if k % 2 == 0 else vel - 4)


def chug(bar, vel=76, dense=False, octv=2):
    """失真吉他的 8 分闷音（dense=16 分，只给 hero/收尾）。"""
    for off in (0.0, 2.0):
        root, q = chord_at(bar, off)
        base = midi(root, octv)
        voicing = chord_voicing(root, q, octv)
        if dense:
            pat = [0, 0, 7, 0, 0, 7, 0, 0]
            step = 0.25
        else:
            pat = [0, 7, 0, 0, 0, 7, 0, 0]
            step = 0.5
        for k, p in enumerate(pat):
            o = off + k * step
            if o >= 3.999:
                break
            v = vel if k % 2 == 0 else vel - 10
            for vp in voicing[:2]:
                add('guitar', bar, o, vp + p, step * 0.9, v)
            if dense:
                add('guitar', bar, o, base + p + 12, step * 0.9, v - 16)


def arp_cycle(name, bar, pitches, step=0.25, dur=0.2, vel=100, beats=4.0):
    n = int(round(beats / step))
    for i in range(n):
        add(name, bar, i * step, pitches[i % len(pitches)], dur, vel)


# ---------------- 素材：八音盒 / 时钟 / 主题 / hook ----------------
# 引子 I 的八音盒（D 小调摇篮曲，弱起、留白）
INTRO1 = {
    1: [(0.0, 86, 1.0, 72), (1.5, 81, 0.5, 64), (2.5, 89, 1.25, 68)],
    2: [(1.0, 84, 0.5, 60), (1.5, 81, 0.5, 62), (2.0, 86, 1.5, 66)],
    3: [(0.0, 82, 0.75, 68), (1.0, 86, 0.5, 62), (2.0, 89, 1.5, 66)],
    4: [(0.5, 88, 0.5, 60), (1.0, 86, 0.5, 62), (1.5, 82, 1.5, 64), (3.0, 77, 0.75, 58)],
    5: [(0.0, 79, 1.0, 66), (1.5, 82, 0.5, 60), (2.0, 86, 1.5, 64)],
    6: [(0.5, 84, 0.5, 60), (1.5, 79, 0.5, 58), (2.5, 74, 1.5, 62)],
    7: [(0.0, 85, 0.75, 66), (1.0, 81, 0.5, 60), (1.5, 76, 0.5, 58), (2.0, 73, 1.5, 62)],
    8: [(0.5, 76, 0.5, 58), (1.0, 79, 0.5, 60), (1.5, 81, 0.5, 62), (2.0, 85, 2.0, 64)],
}
# U.N. 时钟琶音（F5 D5 A4 E5 ...）—— 引子 II 的羽管键琴
CLOCK = [77, 74, 69, 76, 76, 76, 77, 74, 69, 77, 74, 69, 77, 74, 69,
         77, 74, 69, 79, 79, 79, 77]

# 引子 II：lead 第一次发问（13-16）
INTRO2_LEAD = {
    13: [(0.0, 74, 0.5), (0.5, 76, 0.5), (1.0, 77, 0.5), (1.5, 81, 1.0),
         (2.5, 79, 0.5), (3.0, 77, 0.5), (3.5, 76, 0.5)],
    14: [(0.0, 74, 1.0), (1.0, 69, 0.5), (1.5, 72, 0.5), (2.0, 74, 1.5), (3.5, 77, 0.5)],
    15: [(0.0, 79, 0.5), (0.5, 82, 0.5), (1.0, 86, 1.0), (2.0, 84, 0.5),
         (2.5, 82, 0.5), (3.0, 79, 0.5), (3.5, 77, 0.5)],
    16: [(0.0, 76, 0.5), (0.5, 79, 0.5), (1.0, 81, 1.0), (2.0, 85, 1.5), (3.5, 88, 0.5)],
}

# A 主题（17-24）：8 小节、可唱；弱起 + 每句落在和弦音上
MEL_A1 = {
    17: [(0.0, 81, 0.75), (0.75, 84, 0.25), (1.0, 81, 0.5), (1.5, 79, 0.5),
         (2.0, 77, 1.0), (3.0, 76, 0.5), (3.5, 74, 0.5)],
    18: [(0.0, 76, 0.75), (0.75, 79, 0.25), (1.0, 81, 0.5), (1.5, 84, 0.5),
         (2.0, 82, 1.0), (3.0, 81, 0.5), (3.5, 79, 0.5)],
    19: [(0.0, 77, 0.75), (0.75, 81, 0.25), (1.0, 84, 0.5), (1.5, 81, 0.5),
         (2.0, 77, 1.0), (3.0, 76, 0.5), (3.5, 74, 0.5)],
    20: [(0.0, 79, 0.75), (0.75, 82, 0.25), (1.0, 86, 0.5), (1.5, 82, 0.5),
         (2.0, 79, 1.0), (3.0, 77, 0.5), (3.5, 76, 0.5)],
    21: [(0.0, 81, 0.75), (0.75, 84, 0.25), (1.0, 88, 0.5), (1.5, 84, 0.5),
         (2.0, 81, 1.0), (3.0, 79, 0.5), (3.5, 77, 0.5)],
    22: [(0.0, 76, 0.75), (0.75, 79, 0.25), (1.0, 84, 0.5), (1.5, 79, 0.5),
         (2.0, 76, 1.0), (3.0, 74, 0.5), (3.5, 72, 0.5)],
    23: [(0.0, 70, 0.75), (0.75, 73, 0.25), (1.0, 76, 0.5), (1.5, 73, 0.5),
         (2.0, 70, 1.0), (3.0, 76, 0.5), (3.5, 79, 0.5)],
    24: [(0.0, 81, 0.75), (0.75, 85, 0.25), (1.0, 84, 0.5), (1.5, 81, 0.5),
         (2.0, 76, 1.0), (3.0, 73, 1.0)],
}
# A2（25-32）：前 4 小节重复，后 4 小节把句子抬到 Eb 再收
MEL_A2 = dict(MEL_A1)
MEL_A2.update({
    25: [(0.0, 81, 0.75), (0.75, 84, 0.25), (1.0, 81, 0.5), (1.5, 79, 0.5),
         (2.0, 77, 1.0), (3.0, 76, 0.5), (3.5, 74, 0.5)],
    26: [(0.0, 76, 0.75), (0.75, 79, 0.25), (1.0, 81, 0.5), (1.5, 84, 0.5),
         (2.0, 82, 1.0), (3.0, 81, 0.5), (3.5, 79, 0.5)],
    27: [(0.0, 77, 0.75), (0.75, 81, 0.25), (1.0, 84, 0.5), (1.5, 81, 0.5),
         (2.0, 77, 1.0), (3.0, 76, 0.5), (3.5, 74, 0.5)],
    28: [(0.0, 79, 0.75), (0.75, 82, 0.25), (1.0, 86, 0.5), (1.5, 82, 0.5),
         (2.0, 79, 1.0), (3.0, 77, 0.5), (3.5, 76, 0.5)],
    29: [(0.0, 82, 0.75), (0.75, 87, 0.25), (1.0, 87, 0.5), (1.5, 84, 0.5),
         (2.0, 82, 1.0), (3.0, 79, 0.5), (3.5, 77, 0.5)],
    30: [(0.0, 81, 0.75), (0.75, 84, 0.25), (1.0, 86, 0.5), (1.5, 84, 0.5),
         (2.0, 81, 1.0), (3.0, 79, 0.5), (3.5, 77, 0.5)],
    31: [(0.0, 76, 0.75), (0.75, 79, 0.25), (1.0, 85, 0.5), (1.5, 79, 0.5),
         (2.0, 76, 1.0), (3.0, 73, 0.5), (3.5, 76, 0.5)],
    32: [(0.0, 74, 2.0), (2.0, 76, 0.5), (2.5, 77, 0.5), (3.0, 81, 1.0)],
})

# B（33-40）：癫狂的半音对句
MEL_B = {
    33: [(0.0, 81, 0.5), (0.5, 82, 0.5), (1.0, 84, 0.5), (1.5, 86, 0.5),
         (2.0, 88, 0.5), (2.5, 87, 0.5), (3.0, 86, 1.0)],
    34: [(0.0, 84, 0.5), (0.5, 86, 0.5), (1.0, 88, 0.5), (1.5, 86, 0.5),
         (2.0, 84, 1.0), (3.0, 81, 0.5), (3.5, 84, 0.5)],
    35: [(0.0, 80, 0.5), (0.5, 81, 0.5), (1.0, 82, 0.5), (1.5, 80, 0.5),
         (2.0, 76, 1.0), (3.0, 73, 0.5), (3.5, 76, 0.5)],
    36: [(0.0, 79, 0.5), (0.5, 82, 0.5), (1.0, 86, 0.5), (1.5, 82, 0.5),
         (2.0, 79, 1.0), (3.0, 78, 0.5), (3.5, 79, 0.5)],
    37: [(0.0, 80, 0.5), (0.5, 81, 0.5), (1.0, 82, 0.5), (1.5, 80, 0.5),
         (2.0, 76, 1.0), (3.0, 73, 0.5), (3.5, 76, 0.5)],
    38: [(0.0, 79, 0.5), (0.5, 82, 0.5), (1.0, 86, 0.5), (1.5, 82, 0.5),
         (2.0, 79, 1.0), (3.0, 78, 0.5), (3.5, 79, 0.5)],
    39: [(0.0, 75, 0.5), (0.5, 79, 0.5), (1.0, 82, 0.5), (1.5, 87, 0.5),
         (2.0, 82, 1.0), (3.0, 79, 0.5), (3.5, 75, 0.5)],
    40: [(0.0, 73, 0.5), (0.5, 76, 0.5), (1.0, 79, 0.5), (1.5, 81, 0.5),
         (2.0, 85, 1.0), (3.0, 88, 0.5), (3.5, 85, 0.5)],
}
# B2（65-72）：前 4 小节同 B，后 4 小节尖叫句
MEL_B2 = {k + 32: v for k, v in MEL_B.items()}
MEL_B2.update({
    69: [(0.0, 88, 0.5), (0.5, 89, 0.5), (1.0, 91, 0.5), (1.5, 92, 0.5),
         (2.0, 88, 1.0), (3.0, 85, 0.5), (3.5, 88, 0.5)],
    70: [(0.0, 91, 0.5), (0.5, 89, 0.5), (1.0, 88, 0.5), (1.5, 86, 0.5),
         (2.0, 82, 1.0), (3.0, 79, 0.5), (3.5, 82, 0.5)],
    71: [(0.0, 87, 0.5), (0.5, 88, 0.5), (1.0, 91, 0.5), (1.5, 87, 0.5),
         (2.0, 84, 1.0), (3.0, 82, 0.5), (3.5, 79, 0.5)],
    72: [(0.0, 85, 1.0), (1.0, 88, 0.5), (1.5, 85, 0.5), (2.0, 81, 1.0), (3.0, 76, 1.0)],
})

# U.N. 副歌 hook：原分析 b20-27，整体 -0.25 拍落到正拍
HOOK = [
    [(0.00, 79, 0.25), (1.00, 79, 0.25), (1.50, 74, 0.50), (2.50, 81, 0.50), (3.50, 76, 0.50)],
    [(0.50, 81, 0.50), (1.50, 77, 0.50), (2.50, 79, 0.50), (3.00, 81, 0.50), (3.50, 79, 0.50)],
    [(0.50, 83, 0.50), (1.50, 86, 0.50), (2.00, 81, 0.50), (2.50, 88, 0.50),
     (3.00, 89, 0.25), (3.50, 88, 0.50)],
    [(0.00, 89, 0.25), (0.25, 88, 0.25), (0.50, 86, 0.50), (1.00, 84, 0.25),
     (1.50, 81, 0.50), (2.00, 84, 0.50), (2.50, 79, 0.50), (3.00, 81, 0.50),
     (3.50, 77, 2.00)],
    [(1.50, 74, 0.50), (2.50, 81, 0.50), (3.50, 76, 0.50)],
    [(0.50, 81, 0.50), (1.50, 77, 0.50), (2.50, 79, 0.50), (3.00, 81, 0.50), (3.50, 79, 0.50)],
    [(0.50, 83, 0.50), (1.50, 86, 0.50), (2.00, 81, 0.50), (2.50, 88, 0.50),
     (3.00, 89, 0.25), (3.50, 88, 0.50)],
    [(0.00, 89, 0.25), (0.25, 88, 0.25), (0.50, 86, 0.50), (1.00, 84, 0.25),
     (1.50, 86, 2.20)],
]
# B 段钟琴：FLD b7-10 的半音下行引用
CHIME = [81, 77, 80, 76, 83, 80, 79, 82]

# Solo（89-96）：lead 8 分跑句
SOLO = {
    89: [(0.0, 86, 0.5), (0.5, 84, 0.5), (1.0, 81, 0.5), (1.5, 77, 0.5),
         (2.0, 74, 0.5), (2.5, 77, 0.5), (3.0, 81, 0.5), (3.5, 86, 0.5)],
    90: [(0.0, 84, 0.5), (0.5, 81, 0.5), (1.0, 79, 0.5), (1.5, 76, 0.5),
         (2.0, 72, 0.5), (2.5, 76, 0.5), (3.0, 79, 0.5), (3.5, 84, 0.5)],
    91: [(0.0, 86, 0.5), (0.5, 88, 0.5), (1.0, 89, 0.5), (1.5, 88, 0.5),
         (2.0, 86, 0.5), (2.5, 84, 0.5), (3.0, 81, 0.5), (3.5, 77, 0.5)],
    92: [(0.0, 82, 0.5), (0.5, 84, 0.5), (1.0, 86, 0.5), (1.5, 89, 0.5),
         (2.0, 86, 0.5), (2.5, 84, 0.5), (3.0, 82, 0.5), (3.5, 79, 0.5)],
    93: [(0.0, 87, 0.5), (0.5, 86, 0.5), (1.0, 84, 0.5), (1.5, 82, 0.5),
         (2.0, 79, 0.5), (2.5, 82, 0.5), (3.0, 84, 0.5), (3.5, 87, 0.5)],
    94: [(0.0, 86, 0.5), (0.5, 84, 0.5), (1.0, 81, 0.5), (1.5, 77, 0.5),
         (2.0, 74, 0.5), (2.5, 77, 0.5), (3.0, 81, 0.5), (3.5, 84, 0.5)],
    95: [(0.0, 85, 0.5), (0.5, 84, 0.5), (1.0, 81, 0.5), (1.5, 79, 0.5),
         (2.0, 76, 0.5), (2.5, 79, 0.5), (3.0, 81, 0.5), (3.5, 85, 0.5)],
    96: [(0.0, 86, 2.0), (2.0, 84, 0.5), (2.5, 81, 0.5), (3.0, 77, 1.0)],
}
# Break（97-104）：半速、只剩钟/刀/心跳
BREAK_LEAD = {
    97: [(0.0, 74, 1.0), (1.5, 77, 0.5), (2.0, 82, 1.0)],
    98: [(0.0, 76, 1.0), (1.5, 79, 0.5), (2.0, 84, 1.0)],
    99: [(0.0, 74, 1.0), (1.5, 81, 0.5), (2.0, 86, 1.0)],
    100: [(0.0, 81, 2.0), (2.0, 86, 1.0), (3.0, 88, 1.0)],
    101: [(0.0, 82, 0.5), (0.5, 84, 0.5), (1.0, 86, 0.5), (1.5, 84, 0.5), (2.0, 82, 1.0)],
    102: [(0.0, 84, 0.5), (0.5, 86, 0.5), (1.0, 88, 0.5), (1.5, 86, 0.5), (2.0, 84, 1.0)],
    103: [(0.0, 85, 0.5), (0.5, 84, 0.5), (1.0, 81, 0.5), (1.5, 79, 0.5), (2.0, 76, 1.0)],
    104: [(0.0, 76, 1.0), (1.0, 79, 0.5), (1.5, 81, 0.5), (2.0, 85, 2.0)],
}
# Coda（113-120）：八音盒把副歌还成摇篮曲
CODA_BELL = {
    113: [(0.0, 79, 0.75, 70), (1.0, 79, 0.5, 62), (1.5, 74, 0.75, 64),
          (2.5, 81, 0.75, 66), (3.5, 76, 0.75, 62)],
    114: [(0.5, 81, 0.75, 64), (1.5, 77, 0.5, 60), (2.5, 79, 0.5, 62),
          (3.0, 81, 0.5, 60), (3.5, 79, 1.0, 60)],
    115: [(0.5, 83, 0.5, 60), (1.5, 86, 0.5, 62), (2.5, 88, 0.5, 60), (3.0, 89, 0.5, 58)],
    116: [(0.0, 89, 0.5, 60), (0.5, 86, 0.5, 58), (1.0, 84, 0.5, 60),
          (1.5, 81, 0.75, 64), (2.5, 84, 0.5, 58), (3.0, 81, 0.5, 60)],
    117: [(1.5, 74, 0.75, 62), (2.5, 81, 0.5, 60), (3.5, 76, 0.75, 58)],
    118: [(0.5, 81, 0.5, 60), (1.5, 77, 0.5, 58), (2.5, 79, 1.0, 60)],
    119: [(0.5, 83, 0.5, 58), (1.5, 86, 0.5, 60), (2.5, 81, 1.0, 62)],
    120: [(0.0, 74, 1.5, 64), (1.5, 77, 1.0, 58), (2.5, 81, 1.0, 60), (3.5, 74, 1.0, 56)],
}


# ---------------- 段落 ----------------
def sec_intro1():
    """引子 I（1-8）：八音盒 / 钟摆 / 心跳 / 低音的血月。"""
    for bar in range(1, 9):
        pad_hold(bar, 4.0, 30)
        root, q = CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.7, 44)
        add('strings', bar, 0.0, midi(root, 3), 3.7, 30)
    for bar, notes in INTRO1.items():
        for off, p, d, v in notes:
            add('bell', bar, off, p, d, v)
    for bar in range(1, 9):
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 20 if abs(o - round(o)) < 1e-6 else 14)
            o += 0.5
    for bar in (1, 3, 5):
        hit(bar, 0.0, 0, 62)
        hit(bar, 0.5, 0, 42)
    for bar in (7, 8):
        hit(bar, 0.0, 0, 70)
        hit(bar, 0.5, 0, 48)
        hit(bar, 2.0, 0, 64)
    for bar, off in ((4, 3.25), (8, 3.0)):
        add('knife', bar, off, 96, 0.5, 54)
    swish(8, 2.0, 54)
    add('riser', 8, 2.5, 41, 1.4, 58)


def sec_intro2():
    """引子 II（9-16）：时钟琶音、低音走近、lead 发问、鼓渐入。"""
    for bar in range(9, 17):
        pad_hold(bar, 4.0, 30)
    for bar in range(9, 13):
        arp_cycle('harpsi', bar, CLOCK, step=0.25, dur=0.18, vel=64)
        root, q = CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.7, 58)
        add('strings', bar, 0.0, midi(root, 3), 3.7, 34)
    # 13 起鼓和贝斯进来
    for bar in range(13, 17):
        bass_8ths(bar, 94)
        chug(bar, 68)
        power_sustain('strings', bar, 40)
    for bar in range(9, 17):
        add('bell', bar, 0.0, 86 if bar % 2 else 81, 0.5, 40)
    for bar in range(9, 13):
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 18 if abs(o - round(o)) < 1e-6 else 12)
            o += 0.5
    for bar in range(13, 17):
        for off, p, d in INTRO2_LEAD[bar]:
            add('lead', bar, off, p, d, 104)
    for bar in range(13, 15):
        hit(bar, 0.0, 0, 84)
        hit(bar, 2.0, 0, 76)
        hit(bar, 0.5, 2, 34)
        hit(bar, 1.5, 2, 28)
        hit(bar, 2.5, 2, 34)
        hit(bar, 3.5, 2, 28)
    for bar in (15, 16):
        drums_four(bar, crash_at=15 if bar == 15 else None, hats16=False, snare=92)
    fill_toms(16, 2.0, 0.25, 76, 108)
    fill_roll(16, 3.0, 1.0, 104)
    crash(17, 0.0, 96)


def sec_a1():
    """A1（17-24）：恶魔之妹的主题。羽管键琴 16 分 + 4 踩。"""
    for bar in range(17, 25):
        for off, p, d in MEL_A1[bar]:
            add('lead', bar, off, p, d, 110)
        chug(bar, 74)
        bass_8ths(bar, 98)
        power_sustain('strings', bar, 52)
        pad_hold(bar, 4.0, 30)
        root, q = chord_at(bar, 0.0)
        arp = power(root, 4) + [midi(root, 5)]
        arp_cycle('harpsi', bar, arp, step=0.25, dur=0.16, vel=52)
    for bar in range(17, 25):
        drums_four(bar, crash_at=17 if bar == 17 else (21 if bar == 21 else None),
                   hats16=False, snare=102)
    brass_stabs(20, (0.0, 2.0), 0.16, 72)
    brass_stabs(24, (0.0, 2.0), 0.16, 76)
    fill_toms(24, 2.0, 0.25, 78, 106)


def sec_a2():
    """A2（25-32）：同一主题加压；后半句抬到 Eb。"""
    for bar in range(25, 33):
        for off, p, d in MEL_A2[bar]:
            add('lead', bar, off, p, d, 112)
        chug(bar, 78, dense=(bar >= 31))
        bass_8ths(bar, 100)
        power_sustain('strings', bar, 56)
        choir_chord(bar, 40)
        pad_hold(bar, 4.0, 30)
        root, q = chord_at(bar, 0.0)
        arp_cycle('harpsi', bar, power(root, 4) + [midi(root, 5)], step=0.25, dur=0.16, vel=58)
    for bar in range(25, 33):
        drums_four(bar, crash_at=25 if bar == 25 else (29 if bar == 29 else None),
                   hats16=True, snare=104)
        for b in (0.5, 1.5, 2.5, 3.5):
            hit(bar, b, 0, 78)
    brass_stabs(31, (0.0, 2.0), 0.16, 84)
    fill_toms(32, 2.0, 0.25, 84, 110)
    fill_roll(32, 3.0, 1.0, 108)


def sec_b():
    """B（33-40）：癫狂。半音对句 + blast + 钟琴引用。"""
    for bar in range(33, 41):
        for off, p, d in MEL_B[bar]:
            add('lead', bar, off, p, d, 118)
            add('lead', bar, off, p + 12, d, 64)
        chug(bar, 86, dense=(bar >= 37))
        bass_8ths(bar, 104)
        pad_hold(bar, 4.0, 30)
        power_sustain('strings', bar, 56)
        root, q = chord_at(bar, 0.0)
        arp_cycle('harpsi', bar, power(root, 4) + [midi(root, 5)], step=0.25, dur=0.14, vel=60)
    for bar in range(33, 37):
        drums_four(bar, crash_at=33 if bar == 33 else None, hats16=True, snare=106)
        for b in (0.5, 1.5, 2.5, 3.5):
            hit(bar, b, 0, 84)
    for bar in range(37, 41):
        drums_blast(bar, crash_at=37 if bar == 37 else None)
    # 钟琴引用（FLD b7-10 的半音下行），16 分
    for bar in (33, 35, 37, 39):
        for k, p in enumerate(CHIME):
            add('bell', bar, 2.0 + k * 0.25, p, 0.18, 36)
    brass_stabs(39, (0.0, 1.5, 2.0, 3.0), 0.14, 88)
    fill_toms(40, 2.0, 0.25, 90, 114)
    fill_roll(40, 3.0, 1.0, 112)


def chorus_section(b0, shift, hero, extra):
    """C 段：U.N. 副歌 hook；hero 时全编制。"""
    for i in range(8):
        bar = b0 + i
        for off, p, d in HOOK[i]:
            v = 122 if hero else 116
            add('lead', bar, off, p + shift, d, v)
            add('bell', bar, off, p + shift + 12, d, 48 if hero else 44)
            if hero:
                add('lead', bar, off, p + shift + 12, d, 58)
        # 吉他 / 贝斯
        chug(bar, 84 if hero else 78, dense=(hero and extra))
        bass_drive(bar, 104 if hero else 98)
        # 弦乐 / 合唱 / 铺底（按半小节）
        for off in (0.0, 2.0):
            root, q = chord_at(bar, off)
            for p in power(root, 3):
                add('strings', bar, off, p, 1.95, 60 if hero else 56)
            for p in norm(tones(root, q, 4), 55, 74):
                add('choir', bar, off, p, 1.95, 46 if hero else 42)
            for p in tones(root, q, 2):
                add('pad', bar, off, p, 1.95, 32)
        if hero:
            for off in (0.5, 1.5, 2.5, 3.5):
                root, q = chord_at(bar, off)
                for p in power(root, 3):
                    add('brass', bar, off, p, 0.2, 74)
        if extra:
            root, q = chord_at(bar, 0.0)
            arp_cycle('harpsi', bar, power(root, 4) + [midi(root, 5)], step=0.25, dur=0.12, vel=54)
            arp_cycle('arp', bar, [midi(root, 5), midi(root, 5) + 7, midi(root, 6),
                                   midi(root, 5) + 7], step=0.25, dur=0.10, vel=34)
        # 鼓
        if hero:
            drums_drive(bar, crash_at=bar if i % 2 == 0 else None)
        else:
            drums_four(bar, crash_at=bar if i % 2 == 0 else None, hats16=True, snare=106)
        if hero:
            ride_bar(bar, 0.5, 34)
        if i == 0:
            swish(bar, 0.0, 60)
    # 收尾 fill
    fill_toms(b0 + 7, 2.0, 0.25, 92, 116)
    fill_roll(b0 + 7, 3.25, 0.75, 112)


def sec_bridge():
    """Bridge（57-64）：时停 / 495 年的空白。"""
    for bar in range(57, 65):
        pad_hold(bar, 4.0, 34)
        root, q = CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.7, 58)
        power_sustain('strings', bar, 42)
        for off in (0.0, 2.0):
            for p in norm(tones(root, q, 4), 55, 74):
                add('piano', bar, off, p, 1.9, 44)
    for bar in range(57, 65):
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 12 if abs(o - round(o)) < 1e-6 else 8)
            o += 0.5
    # 八音盒碎片（引子 I 的动机）
    frag = [(57, 0.0, 86, 0.75, 58), (57, 1.5, 81, 0.5, 50),
            (58, 2.0, 89, 0.75, 52), (59, 0.5, 84, 0.5, 48),
            (60, 0.0, 82, 0.75, 50), (60, 2.5, 77, 0.75, 46),
            (61, 0.0, 79, 0.75, 52), (61, 2.0, 74, 1.0, 48),
            (62, 0.5, 77, 0.5, 44), (62, 2.0, 81, 0.75, 46)]
    for bar, off, p, d, v in frag:
        add('bell', bar, off, p, d, v)
    # 对位：半音爬行
    for bar, off, p, d in [(61, 0.0, 74, 0.75), (61, 0.75, 75, 0.75), (61, 1.5, 76, 0.75),
                           (61, 2.25, 75, 0.75), (61, 3.0, 74, 0.5), (61, 3.5, 73, 0.5),
                           (62, 0.0, 73, 1.5), (62, 2.0, 76, 0.75), (62, 2.75, 77, 1.0)]:
        add('counter', bar, off, p, d, 48)
    for bar, off in ((59, 1.5), (63, 0.0), (64, 0.0)):
        add('knife', bar, off, 96, 0.5, 44)
    # 61-64 起浪
    for bar in (61, 62):
        drums_half(bar, crash_at=None, snare=70)
    fill_toms(63, 0.0, 0.25, 70, 100)
    fill_roll(63, 3.0, 1.0, 100)
    fill_toms(64, 0.0, 0.25, 80, 108)
    fill_roll(64, 2.0, 1.5, 112)
    add('riser', 63, 2.0, 41, 1.8, 60)
    add('riser', 64, 1.0, 45, 2.8, 66)
    crash(65, 0.0, 104)


def sec_b2():
    """B2（65-72）：第二波癫狂，更硬。"""
    for bar in range(65, 73):
        for off, p, d in MEL_B2[bar]:
            add('lead', bar, off, p, d, 120)
            add('lead', bar, off, p + 12, d, 66)
        chug(bar, 90, dense=True)
        bass_drive(bar, 106)
        pad_hold(bar, 4.0, 30)
        power_sustain('strings', bar, 58)
        choir_chord(bar, 42)
        root, q = chord_at(bar, 0.0)
        arp_cycle('harpsi', bar, power(root, 4) + [midi(root, 5)], step=0.25, dur=0.14, vel=62)
    for bar in range(65, 69):
        drums_blast(bar, crash_at=65 if bar == 65 else None)
    for bar in range(69, 73):
        drums_hard(bar, crash_at=69 if bar == 69 else None)
        for b in (0.5, 1.5, 2.5, 3.5):
            hit(bar, b, 0, 86)
    for bar in (65, 67, 69, 71):
        for k, p in enumerate(CHIME):
            add('bell', bar, 2.0 + k * 0.25, p, 0.18, 34)
    brass_stabs(71, (0.0, 1.5, 2.0, 3.0), 0.14, 90)
    fill_toms(72, 2.0, 0.25, 92, 116)
    fill_roll(72, 3.0, 1.0, 114)


def sec_solo():
    """Solo（89-96）：羽管键琴时钟琶音 + lead 跑句。"""
    for bar in range(89, 97):
        for off, p, d in SOLO[bar]:
            add('lead', bar, off, p, d, 114)
        chug(bar, 84)
        bass_8ths(bar, 102)
        power_sustain('strings', bar, 54)
        pad_hold(bar, 4.0, 30)
        choir_chord(bar, 38)
        root, q = chord_at(bar, 0.0)
        arp_cycle('harpsi', bar, power(root, 4) + [midi(root, 5)], step=0.25, dur=0.12, vel=64)
        arp_cycle('arp', bar, [midi(root, 5), midi(root, 5) + 7, midi(root, 6),
                               midi(root, 5) + 7], step=0.25, dur=0.10, vel=38)
        drums_hard(bar, crash_at=bar if bar % 2 == 1 else None)
    fill_toms(96, 2.0, 0.25, 92, 116)
    fill_roll(96, 3.0, 1.0, 112)


def sec_break():
    """Break（97-104）：半速 build。"""
    for bar in range(97, 105):
        pad_hold(bar, 4.0, 36)
        root, q = CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.7, 62)
        power_sustain('strings', bar, 40)
        for off in (0.0, 2.0):
            for p in norm(tones(root, q, 4), 55, 74):
                add('piano', bar, off, p, 1.9, 40)
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 12 if abs(o - round(o)) < 1e-6 else 8)
            o += 0.5
        for off, p, d in BREAK_LEAD[bar]:
            add('lead', bar, off, p, d, 110)
            add('lead', bar, off, p + 12, d, 46)
    for bar in (97, 98, 99, 100):
        drums_half(bar, crash_at=97 if bar == 97 else None, snare=84)
    for bar in (101, 102, 103, 104):
        hit(bar, 0.0, 0, 100)
        hit(bar, 2.0, 0, 92)
        hit(bar, 2.0, 1, 88)
        for b in (0.5, 1.0, 1.5, 2.5, 3.0, 3.5):
            hit(bar, b, 2, 30)
    fill_toms(103, 2.0, 0.25, 80, 108)
    fill_roll(103, 3.0, 1.0, 104)
    fill_toms(104, 0.0, 0.25, 84, 112)
    fill_roll(104, 2.0, 2.0, 116)
    add('riser', 103, 2.0, 41, 1.8, 62)
    add('riser', 104, 1.0, 45, 3.0, 68)
    for bar, off, p, d, v in [(100, 3.0, 96, 0.5, 44), (104, 3.5, 98, 0.5, 46)]:
        add('knife', bar, off, p, d, v)


def sec_coda():
    """Coda（113-120）：崩塌，接回引子。"""
    for bar in range(113, 121):
        pad_hold(bar, 4.0, 32)
        root, q = CHORDS[bar]
        add('bass', bar, 0.0, midi(root, 1), 3.7, 56)
        power_sustain('strings', bar, 32)
        for off in (0.0, 2.0):
            for p in norm(tones(root, q, 4), 55, 74):
                add('piano', bar, off, p, 1.9, 34)
        o = 0.0
        while o < 3.99:
            add('tick', bar, o, 96, 0.09, 10 if abs(o - round(o)) < 1e-6 else 6)
            o += 0.5
    for bar, notes in CODA_BELL.items():
        for off, p, d, v in notes:
            add('bell', bar, off, p, d, v)
    for bar in (113, 115, 117, 119):
        hit(bar, 0.0, 0, 60)
        hit(bar, 0.5, 0, 40)
    add('knife', 120, 2.0, 96, 0.5, 42)
    # 最后一小节：Dm 收束，长音留到循环
    for p in [50, 57, 62, 65]:
        add('choir', 120, 0.0, p, 3.9, 30)


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
    lines.append(' * EX 面 BOSS《恶魔之妹》—— 芙兰朵露·斯卡雷特 / 红月下被囚禁的 495 年。')
    lines.append(' * 192 BPM, D 小调, 4/4, 120 小节 = 150.0s 循环：')
    lines.append(' *   引子 I 8（八音盒/钟摆/心跳）→ 引子 II 8（时钟琶音/门开/lead 发问）')
    lines.append(' *   → A1 8 + A2 8（恶魔之妹主题）→ B 8（癫狂·半音对句/blast）')
    lines.append(' *   → C1 16（U.N. 副歌 hook）→ Bridge 8（时停·495 年的空白）')
    lines.append(' *   → B2 8（更硬）→ C2 16（副歌·hero/吉他 16 分墙）→ Solo 8（时钟琶音）')
    lines.append(' *   → Break 8（半速 build）→ C3 8（升半音·红月到顶）→ Coda 8（崩塌接回引子）。')
    lines.append(' * 主题引用：U.N. 时钟琶音（F5-D5-A4 型）与副歌 b20-27 的 hook（整体前移 0.25 拍');
    lines.append(' * 落到正拍）；B 段钟琴 16 分引用「最终鬼畜妹」b7-10 的半音下行；半音摩擦（Dm 上的')
    lines.append(' * Eb、A7 上的 C#）只放在弱拍/经过音。编制：失真吉他/lead/羽管键琴/铜管/弦乐/合唱/');
    lines.append(' * 贝斯/钢琴/八音盒/钟摆/铺底/对位/琶音/刀/riser；鼓 kind 0-9（5-6 通鼓 / 7 ride /');
    lines.append(' * 8 反向吊镲 / 9 军鼓滚奏，5-9 只在离线 WAV 渲染器发声，JS 合成回退会静默忽略）。')
    lines.append(' * tools/build/_fld_compose2.py 生成，勿手改。')
    lines.append(' */')
    lines.append('export const FLANDRE_DEVIL = {')
    lines.append('  extra: {')
    lines.append("    title: '恶魔之妹',")
    lines.append('    duration: 150,')
    lines.append('    bpm: 192,')
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
    data = {'title': '恶魔之妹', 'duration': 150.0, 'bpm': 192,
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
    sec_b2()
    chorus_section(73, 0, hero=True, extra=True)
    chorus_section(81, 0, hero=True, extra=True)
    sec_solo()
    sec_break()
    chorus_section(105, 1, hero=True, extra=True)
    sec_coda()
    write()


if __name__ == '__main__':
    main()
