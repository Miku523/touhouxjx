# -*- coding: utf-8 -*-
"""EX 面 BOSS《恶魔之妹》v5 —— 红月下癫狂、被囚禁 495 年的芙兰朵露。

按试听反馈（m02229）重写：
  1) U.N. 主题必须一耳认出：第 1 小节八音盒就完整唱 hook（b20-27 的 8 小节），
     引子 II 乐队再唱一遍；此后 A1/A2/C1/C2/Solo/D/Coda 每一段都以 hook 为主旋律，
     一分钟内至少听到四遍完整主题。
  2) 少重复、少糊：伴奏不再整段 16 分同音墙（吉他改八分 riff 且有休止、鼓改八分踩镲、
     钢琴琶音每小节换型），主旋律只留一条 lead，钟琴只做极轻的八度高光，
     不再四五条轨同时砸同一个音。
  3) 更疯：B1/B2 用半音阶、32 分下行、三全音簇、同音颤音、blast beat；
     Bridge 不再是「孤独时停」，改成癫狂的 breakdown（颤音 + 钟表故障音 + 起浪），
     孤独感只留 coda 的最后两小节。
  4) 过渡不硬切：每个段界都有 riser / 反向吊镲 / 军鼓滚奏 / 低音持续音搭桥。

结构（200 BPM / D 小调 / 125 小节 = 150.0s）：
  引子 I 1-8  八音盒主题（hook + 第二句），钟摆、心跳、红月
  引子 II 9-16 乐队完整唱主题，时钟琶音当织体，鼓报到
  A1 17-24   主题 + 吉他 riff / 钢琴琶音
  A2 25-32   主题 + 三度和声 + 合唱，32 分半音下行收尾
  B1 33-40   癫狂：主题头嘶吼 + 半音跑 + 颤音 + blast，37-40 第二句
  C1 41-56   副歌：主题 + 第二句 + 高八度 + 和声 blast
  Bridge 57-62 癫狂 breakdown：blast/三全音 → 钟表故障 → 起浪
  B2 63-70   半音下行桥段当 riff，blast；69-70 主题头嘶吼
  C2 71-86   副歌两遍；79-86 整体升半音
  Solo 87-94 钢琴 32 分琶音 + lead 主题 + 半音跑
  Break 95-98 八音盒主题 + 起浪 build
  D 99-110   主题 over blast；105-110 32 分下行崩塌
  Coda 111-118 八音盒把主题还成摇篮曲（带故障音）
  Outro 119-125 钟摆回落，接回第 1 小节

素材：U.N. Owen 时钟琶音 b3-4、副歌 hook b20-27、半音桥段 b12-19。
tools/build/_fld_compose5.py 生成，勿手改。
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
    ('guitar', 'sawtooth', 0.052),
    ('lead', 'sawtooth', 0.250),
    ('harpsi', 'square', 0.052),
    ('brass', 'square', 0.070),
    ('strings', 'sawtooth', 0.058),
    ('choir', 'sine', 0.056),
    ('bass', 'triangle', 0.125),
    ('piano', 'sine', 0.075),
    ('bell', 'sine', 0.105),
    ('tick', 'square', 0.042),
    ('pad', 'sine', 0.026),
    ('counter', 'triangle', 0.045),
    ('arp', 'sine', 0.052),
    ('knife', 'square', 0.050),
    ('riser', 'sawtooth', 0.050),
]
L.TRACKS = {name: [] for name, _, _ in L.TRACK_DEFS}
L.DRUMS = []
L.DRUM_SCALE = 0.70

L.CHORDS.clear()
L.HALF.clear()

add = L.add
hit = L.hit
hit_x = L.hit_x
midi = L.midi
tones = L.tones
power = L.power
chord_voicing = L.chord_voicing
chord_at = L.chord_at
crash = L.crash
swish = L.swish
ride_bar = L.ride_bar
fill_toms = L.fill_toms
fill_roll = L.fill_roll

def fill_toms(bar, o0=2.0, step=0.25, v0=82, v1=114):
    pat = [6, 6, 5, 5, 6, 5, 5, 5]
    k = 0
    o = o0
    span = max(4.0 - o0, 1e-6)
    while o < 4.0 - 1e-9:
        hit_x(bar, o, pat[k % len(pat)], int((v0 + (v1 - v0) * (o - o0) / span) * 0.80))
        k += 1
        o += step

def fill_roll(bar, o0=2.0, span=2.0, vel=110):
    hit_x(bar, o0, 9, int(vel * 0.68), span * BEAT)
drums_half = L.drums_half
pad_hold = L.pad_hold
power_sustain = L.power_sustain
choir_chord = L.choir_chord
brass_stabs = L.brass_stabs
bass_8ths = L.bass_8ths
bass_drive = L.bass_drive

# ---------------- 和声 ----------------
def sec(b0, seq):
    for i, (r, q) in enumerate(seq):
        L.CHORDS[b0 + i] = (r, q)

CH = [(('Bb', 'maj'), ('C', 'maj')), (('D', 'm'), ('G', 'm')),
      (('Bb', 'maj'), ('C', 'maj')), (('D', 'm'), ('D', 'm'))]
CH_UP = [(('B', 'maj'), ('C#', 'maj')), (('Eb', 'm'), ('Ab', 'm')),
         (('B', 'maj'), ('C#', 'maj')), (('Eb', 'm'), ('Eb', 'm'))]

def chorus_chords(b0, n, up=False):
    src = CH_UP if up else CH
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
chorus_chords(63, 8)
chorus_chords(71, 8)
chorus_chords(79, 8, up=True)
chorus_chords(87, 8)
sec(95, [('Bb', 'maj'), ('C', 'maj'), ('D', 'm'), ('A', '7')])
chorus_chords(99, 8)
sec(107, [('D', 'm'), ('Eb', 'maj'), ('Bb', 'maj'), ('A', '7')])
sec(111, [('D', 'm'), ('Bb', 'maj'), ('G', 'm'), ('A', '7'),
          ('D', 'm'), ('Bb', 'maj'), ('D', 'm'), ('D', 'm')])
sec(119, [('D', 'm'), ('Bb', 'maj'), ('D', 'm'), ('A', '7'),
          ('D', 'm'), ('Bb', 'maj'), ('D', 'm')])

# ---------------- U.N. 素材 ----------------
# 副歌 hook（b20-23），整体前移 0.25 拍落到正拍，降八度：(bar_off, beat, midi, dur)
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
# 时钟琶音（b3-4，22 音）
CLOCK = [
    (0, 0.0, 77), (0, 0.25, 74), (0, 0.5, 69), (0, 0.75, 76), (0, 1.5, 76),
    (0, 2.0, 76), (0, 2.75, 77), (0, 3.0, 74), (0, 3.25, 69), (0, 3.5, 77), (0, 3.75, 74),
    (1, 0.0, 69), (1, 0.25, 77), (1, 0.5, 74), (1, 0.75, 69), (1, 1.0, 77),
    (1, 1.25, 74), (1, 1.5, 69), (1, 1.75, 79), (1, 2.5, 79), (1, 3.0, 79), (1, 3.75, 77),
]
# 半音桥段（b12-19，30 音）
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

# ---------------- 通用 ----------------
def play_theme(b0, name, vel=118, octv=0, shift=0, melody=THEME, end_bar=None, dscale=1.0):
    for bo, off, p, d in melody:
        bar = b0 + bo
        dd = d
        if end_bar is not None:
            remain = (end_bar - bar) * 4.0 - off
            dd = min(dd, remain)
        if dd <= 0.05:
            continue
        add(name, bar, off, p + octv + shift, dd * dscale, vel)

def arp_half(name, bar, half, r, q, octv, step, dur, vel, var):
    ts = tones(r, q, octv)
    a, b, c = ts[0], ts[1], ts[2]
    pats = [
        [a, c, b + 12, c, a + 12, c, b + 12, c],
        [a, b + 12, c, b + 12, a + 12, b + 12, c, b + 12],
        [a, c, a + 12, c, b + 12, c, a + 12, c],
        [b, c, a + 12, c, b + 12, c, a + 12, c],
    ]
    pat = pats[var % 4]
    n = int(round(2.0 / step))
    for k in range(n):
        add(name, bar, half + k * step, pat[k % len(pat)], dur, vel if k % 4 else vel + 4)

def arp_bar(name, bar, vel=64, var=0, step=0.25, dur=0.2, octv=4):
    for idx, half in enumerate((0.0, 2.0)):
        r, q = chord_at(bar, half)
        arp_half(name, bar, half, r, q, octv, step, dur, vel, var + idx)

def arp32(name, bar, vel=88, var=0):
    for idx, half in enumerate((0.0, 2.0)):
        r, q = chord_at(bar, half)
        arp_half(name, bar, half, r, q, 4, 0.125, 0.1, vel, var + idx * 3)

def riff(bar, vel=76, var=0, dense=False):
    """失真吉他：八分 riff，有休止，不再整段 16 分同音墙。"""
    for half in (0.0, 2.0):
        r, q = chord_at(bar, half)
        vo = chord_voicing(r, q, 2)
        if dense:
            hits = [(0.0, 0.14), (0.25, 0.1), (0.5, 0.14), (0.75, 0.1),
                    (1.0, 0.14), (1.25, 0.1), (1.5, 0.14), (1.75, 0.1)]
        else:
            hits = [(0.0, 0.34), (1.0, 0.16), (1.5, 0.34)] if var % 2 == 0 else [(0.5, 0.34), (1.0, 0.16), (1.75, 0.3)]
        for off, dur in hits:
            for p in vo:
                add('guitar', bar, half + off, p, dur, vel)

def bass_bar(bar, vel=100, drive=False, octv=2):
    for half in (0.0, 2.0):
        r, q = chord_at(bar, half)
        base = midi(r, octv)
        if drive:
            pat = [(0.0, 0, 0.34), (0.5, 7, 0.16), (1.0, 0, 0.34), (1.5, 12, 0.16)]
        else:
            pat = [(0.0, 0, 0.7), (1.0, 7, 0.3)]
        for off, iv, dur in pat:
            add('bass', bar, half + off, base + iv, dur, vel if off == 0.0 else vel - 8)

def dr_verse(bar, crash_at=None, snare=100):
    if crash_at is not None:
        crash(bar, crash_at, 88)
    for o in (0.0, 1.5, 2.5):
        hit(bar, o, 0, 112)
    hit(bar, 1.0, 1, snare)
    hit(bar, 3.0, 1, snare + 4)
    o = 0.0
    while o < 3.999:
        hit(bar, o, 2, 46 if abs(o - round(o)) < 1e-6 else 28)
        o += 0.5
    hit(bar, 2.5, 3, 48)

def dr_push(bar, crash_at=None):
    if crash_at is not None:
        crash(bar, crash_at, 94)
    for o in (0.0, 0.75, 1.5, 2.5, 3.0):
        hit(bar, o, 0, 112)
    hit(bar, 1.0, 1, 100)
    hit(bar, 3.0, 1, 104)
    o = 0.0
    while o < 3.999:
        hit(bar, o, 2, 44 if abs(o - round(o)) < 1e-6 else 26)
        o += 0.5
    hit(bar, 3.5, 3, 50)

def semitone_trill(name, bar, off, span, p, vel=92, rate=0.125):
    k = 0
    t = off
    while t < off + span - 1e-9:
        add(name, bar, t, p + (1 if k % 2 else 0), rate * 0.9, vel)
        t += rate
        k += 1

def chrom_run(name, bar, off, p0, n, step=0.125, dirn=-1, vel=100, dur=0.1):
    for k in range(n):
        add(name, bar, off + k * step, p0 + dirn * k, dur, vel if k % 4 else vel + 8)

def cluster_stab(bar, off, vel=96, dur=0.18, octv=3):
    r, q = chord_at(bar, off)
    vo = chord_voicing(r, q, octv)
    add('brass', bar, off, vo[0], dur, vel)
    add('brass', bar, off, vo[0] + 6, dur, vel - 6)
    add('brass', bar, off, vo[0] + 13, dur, vel - 12)
    add('strings', bar, off, vo[0] + 18, dur, vel - 20)

# ---------------- 段落 ----------------
def intro1():
    for b in range(1, 9):
        pad_hold(b, 4.0, 26, 2)
    play_theme(1, 'bell', 74)
    play_theme(5, 'bell', 70, melody=THEME2)
    for b in range(1, 9):
        for o in (0.0, 1.0, 2.0, 3.0):
            add('tick', b, o, 93, 0.09, 22)
        hit(b, 0.0, 0, 54)
        hit(b, 2.0, 0, 40)
    for b in range(5, 9):
        power_sustain('strings', b, 28, 2)
    add('riser', 8, 0.0, 60, 3.4, 40)
    swish(8, 3.5, 58)
    hit_x(8, 3.5, 9, 78, 0.5)


def intro2():
    play_theme(9, 'lead', 104)
    play_theme(13, 'lead', 106, melody=THEME2)
    play_theme(13, 'bell', 40, octv=12, melody=THEME2)
    for bo, off, p in CLOCK:
        add('piano', 9 + bo, off, p + 12, 0.22, 40)
    for b in range(9, 17):
        bass_bar(b, 92)
        power_sustain('strings', b, 40, 3)
        pad_hold(b, 4.0, 28, 2)
        riff(b, 58, var=b % 2)
    for b in range(9, 11):
        drums_half(b, crash_at=(0.0 if b == 9 else None), snare=82)
    for b in range(11, 17):
        dr_verse(b, crash_at=(0.0 if b == 11 else None))
    fill_toms(15, 2.0, 0.25, 80, 108)
    fill_roll(16, 2.0, 2.0, 108)
    swish(16, 3.5, 58)


def sec_a1():
    play_theme(17, 'lead', 108)
    play_theme(21, 'lead', 110, melody=THEME2)
    play_theme(21, 'bell', 34, octv=12, melody=THEME2)
    for b in range(17, 25):
        riff(b, 70, var=b % 3)
        bass_bar(b, 100, drive=True)
        power_sustain('strings', b, 48, 3)
        pad_hold(b, 4.0, 26, 2)
        arp_bar('piano', b, 66, var=b % 4)
        dr_push(b, crash_at=(0.0 if b == 17 else None))
    fill_toms(24, 2.0, 0.25, 82, 108)


def sec_a2():
    play_theme(25, 'lead', 112)
    play_theme(29, 'lead', 114, melody=THEME2)
    for b0, mel in ((25, THEME), (29, THEME2)):
        for bo, off, p, d in mel:
            add('lead', b0 + bo, off, third_above(p), d, 64)
    for b in range(25, 33):
        riff(b, 78, var=b % 3)
        bass_bar(b, 104, drive=True)
        power_sustain('strings', b, 54, 4)
        choir_chord(b, 44, 4)
        brass_stabs(b, (0.0, 2.5), 0.2, 80, 3)
        arp_bar('piano', b, 60, var=b % 4)
        dr_push(b, crash_at=(0.0 if b == 25 else None))
        ride_bar(b, 1.0, 24)
    fill_toms(31, 2.0, 0.25, 84, 110)
    fill_roll(32, 2.0, 2.0, 112)
    chrom_run('lead', 32, 2.0, 86, 8, 0.125, -1, 100, 0.1)
    swish(32, 3.5, 60)


def sec_b1():
    for b in range(33, 37):
        L.drums_blast(b, crash_at=(0.0 if b == 33 else None))
        power_sustain('strings', b, 58, 4)
        choir_chord(b, 46, 4)
        bass_bar(b, 106, drive=True)
        riff(b, 82, var=1, dense=(b % 2 == 0))
        cluster_stab(b, 0.0)
        cluster_stab(b, 2.0)
        semitone_trill('strings', b, 0.0, 1.0, 70, 72)
        semitone_trill('strings', b, 2.0, 1.0, 70, 72)
        ride_bar(b, 0.5, 28)
    for bo, off, p, d in THEME[:6]:
        add('lead', 33 + bo, off, p + 12, d * 0.5, 120)
    chrom_run('lead', 34, 0.0, 100, 16, 0.125, -1, 112, 0.1)
    chrom_run('lead', 35, 0.0, 96, 16, 0.125, -1, 112, 0.1)
    chrom_run('lead', 36, 0.0, 92, 16, 0.125, -1, 112, 0.1)
    for kb, kp in ((34, 99), (35, 101), (36, 103)):
        add('knife', kb, 1.5, kp, 0.12, 72)
        add('knife', kb, 3.5, kp + 2, 0.12, 76)
    play_theme(37, 'lead', 118, melody=THEME2, end_bar=41)
    play_theme(37, 'bell', 42, octv=12, melody=THEME2, end_bar=41)
    for b in range(37, 41):
        L.drums_blast(b, crash_at=(0.0 if b == 37 else None))
        bass_bar(b, 106, drive=True)
        riff(b, 84, var=1, dense=True)
        power_sustain('strings', b, 58, 4)
        choir_chord(b, 46, 4)
    fill_toms(40, 2.0, 0.25, 90, 114)
    fill_roll(40, 3.0, 1.0, 114)


def chorus_half(b0, melody, shift=0, hero=True, harmony=False, blast=False, octv=0):
    for i in range(4):
        b = b0 + i
        bass_bar(b, 106, drive=True)
        power_sustain('strings', b, 60, 4)
        choir_chord(b, 48, 4)
        brass_stabs(b, (0.0, 2.5), 0.2, 84, 3)
        riff(b, 78, var=i % 2)
        arp_bar('piano', b, 62, var=i % 4)
        if blast:
            L.drums_blast(b, crash_at=(0.0 if i == 0 else None))
        else:
            L.drums_drive(b, crash_at=(0.0 if i == 0 else None))
        ride_bar(b, 0.5, 30)
        for o in (1.5, 3.5):
            r, q = chord_at(b, o)
            add('arp', b, o, tones(r, q, 5)[0] + 12, 0.10, 30)
    play_theme(b0, 'lead', 124 if hero else 114, shift=shift, octv=octv, melody=melody, end_bar=b0 + 4)
    if hero:
        play_theme(b0, 'bell', 48, octv=12, shift=shift, melody=melody, end_bar=b0 + 4)
    if harmony:
        for bo, off, p, d in melody:
            add('lead', b0 + bo, off, third_above(p + 12) + shift, min(d, 1.0), 68)


def sec_c1():
    chorus_half(41, THEME)
    chorus_half(45, THEME2)
    chorus_half(49, THEME, octv=12)
    chorus_half(53, THEME2, harmony=True, blast=True)
    fill_toms(56, 2.0, 0.25, 86, 112)
    fill_roll(56, 3.0, 1.0, 112)
    swish(56, 3.5, 60)


def sec_bridge():
    for b in (57, 58):
        L.drums_blast(b, crash_at=(0.0 if b == 57 else None))
        power_sustain('strings', b, 52, 3)
        choir_chord(b, 40, 4)
        cluster_stab(b, 0.0, 100)
        cluster_stab(b, 2.0, 96)
        semitone_trill('lead', b, 0.0, 2.0, 79, 96)
        semitone_trill('lead', b, 2.0, 2.0, 77, 94)
        add('knife', b, 1.0, 96, 0.16, 78)
        bass_bar(b, 104, drive=True)
        riff(b, 90, var=1, dense=True)
    for b in (59, 60):
        pad_hold(b, 4.0, 32, 2)
        power_sustain('strings', b, 44, 3)
        add('bass', b, 0.0, 38, 3.8, 46)
        for o in (0.0, 1.0, 2.0, 3.0):
            hit(b, o, 0, 96)
            add('tick', b, o, 93, 0.09, 26)
        hit(b, 0.5, 1, 90)
        hit(b, 2.5, 1, 96)
        semitone_trill('bell', b, 0.0, 1.0, 86, 52, 0.0625)
        semitone_trill('bell', b, 2.0, 1.0, 84, 48, 0.0625)
        add('lead', b, 1.5, 79, 0.5, 100)
        add('lead', b, 3.0, 77, 0.5, 96)
        add('knife', b, 3.0, 90, 0.22, 66)
    for b in (61, 62):
        pad_hold(b, 4.0, 34, 2)
        power_sustain('strings', b, 52, 4)
        choir_chord(b, 42, 4)
        dr_verse(b, crash_at=(0.0 if b == 61 else None))
        bass_bar(b, 108, drive=True)
        riff(b, 84, var=1, dense=True)
        add('riser', b, 0.0, 60, 4.0, 52 if b == 62 else 42)
    chrom_run('lead', 61, 0.0, 69, 16, 0.125, -1, 104, 0.1)
    chrom_run('lead', 62, 0.0, 85, 8, 0.125, -1, 108, 0.1)
    fill_roll(62, 2.0, 2.0, 118)
    swish(62, 3.5, 64)
    crash(62, 0.0, 80)


def sec_b2():
    for b in range(63, 71):
        L.drums_blast(b, crash_at=(0.0 if b == 63 else None))
        r0 = chord_at(b, 0)[0]
        r1 = chord_at(b, 2.0)[0]
        for k, rr in enumerate((r0, r1, r0, r1)):
            add('bass', b, k * 1.0, midi(rr, 2), 0.9, 106)
        riff(b, 86, var=b % 2, dense=True)
        power_sustain('strings', b, 58, 4)
        choir_chord(b, 46, 4)
        brass_stabs(b, (0.0, 1.5, 2.5), 0.18, 88, 3)
    for bo, off, p, d in CHROM:
        if bo >= 6:
            continue
        add('lead', 63 + bo, off, p + 12, d, 118)
        add('bell', 63 + bo, off, p + 24, d, 40)
    for bo, off, p, d in THEME[:8]:
        add('lead', 69 + bo, off, p + 12, d, 120)
    fill_toms(70, 2.0, 0.25, 90, 116)
    fill_roll(70, 3.0, 1.0, 118)
    swish(70, 3.5, 64)


def sec_c2():
    chorus_half(71, THEME)
    chorus_half(75, THEME2)
    chorus_half(79, THEME, shift=1)
    chorus_half(83, THEME2, shift=1, harmony=True, blast=True)
    for b in range(79, 87):
        arp_bar('harpsi', b, 74, var=b % 4, octv=5)
    fill_toms(86, 2.0, 0.25, 90, 116)
    fill_roll(86, 3.0, 1.0, 118)


def sec_solo():
    for b in range(87, 95):
        arp32('piano', b, 92, var=b % 4)
        bass_bar(b, 106, drive=True)
        riff(b, 76, var=b % 2)
        power_sustain('strings', b, 56, 4)
        choir_chord(b, 40, 4)
        dr_push(b, crash_at=(0.0 if b == 87 else None))
        ride_bar(b, 0.5, 30)
    play_theme(87, 'lead', 118)
    play_theme(91, 'lead', 120, melody=THEME2)
    add('knife', 94, 3.5, 96, 0.16, 64)
    chrom_run('lead', 90, 2.0, 96, 8, 0.125, -1, 108, 0.1)
    chrom_run('lead', 94, 2.0, 91, 8, 0.125, -1, 110, 0.1)
    fill_toms(94, 2.0, 0.25, 86, 112)
    fill_roll(94, 3.0, 1.0, 114)


def sec_break():
    play_theme(95, 'bell', 58)
    for b in range(95, 99):
        pad_hold(b, 4.0, 30, 2)
        power_sustain('strings', b, 46, 3)
        choir_chord(b, 40, 4)
        dr_verse(b, crash_at=(0.0 if b == 95 else None))
        bass_bar(b, 96)
        riff(b, 64, var=b % 2)
        add('riser', b, 0.0, 55, 4.0, 40 + (b - 95) * 6)
    fill_roll(98, 0.0, 4.0, 120)
    crash(98, 3.0, 84)
    swish(98, 3.5, 66)


def sec_d():
    for b in range(99, 105):
        L.drums_blast(b, crash_at=(0.0 if b == 99 else None))
        riff(b, 94, var=1, dense=True)
        power_sustain('strings', b, 62, 4)
        choir_chord(b, 50, 4)
        brass_stabs(b, (0.0, 2.0), 0.24, 92, 3)
        add('knife', b, 1.5, 104, 0.12, 72)
        add('knife', b, 3.5, 101, 0.12, 72)
        bass_bar(b, 110, drive=True)
    play_theme(99, 'lead', 126)
    play_theme(99, 'guitar', 88, octv=-12)
    play_theme(103, 'lead', 126, melody=THEME2, end_bar=105)
    play_theme(103, 'guitar', 86, octv=-12, melody=THEME2, end_bar=105)
    for b in range(105, 111):
        L.drums_blast(b)
        riff(b, 88, var=1, dense=True)
        power_sustain('strings', b, 60, 4)
        top = 93 - (b - 105) * 2
        for k in range(32):
            add('piano', b, k * 0.125, top - k, 0.1, 84 if k % 4 == 0 else 64)
        for k in range(16):
            add('lead', b, k * 0.25, top - k * 2, 0.2, 102 if k % 4 == 0 else 82)
        add('bass', b, 0.0, midi(chord_at(b, 0)[0], 2), 3.6, 106)
    fill_toms(110, 2.0, 0.25, 92, 118)
    fill_roll(110, 3.0, 1.0, 120)


def sec_coda():
    play_theme(111, 'bell', 66)
    play_theme(115, 'bell', 62, melody=THEME2)
    for b in range(111, 119):
        pad_hold(b, 4.0, 24, 2)
        power_sustain('strings', b, 30, 2)
        add('bass', b, 0.0, 38, 3.6, 40)
        hit(b, 0.0, 0, 52)
        hit(b, 2.0, 0, 40)
        for o in (0.0, 1.0, 2.0, 3.0):
            add('tick', b, o, 93, 0.09, 22)
    semitone_trill('bell', 114, 2.0, 1.0, 88, 60, 0.0625)
    semitone_trill('bell', 118, 0.0, 1.5, 86, 58, 0.0625)
    chrom_run('bell', 118, 2.0, 84, 8, 0.0625, -1, 54, 0.06)


def sec_outro():
    for b in range(119, 126):
        pad_hold(b, 4.0, 22, 2)
        power_sustain('strings', b, 26, 2)
        add('bass', b, 0.0, 38, 3.6, 34)
        for o in (0.0, 1.0, 2.0, 3.0):
            add('tick', b, o, 93, 0.09, 20)
        hit(b, 0.0, 0, 46)
        hit(b, 2.0, 0, 36)
    tail = [(119, 0.0, 74), (119, 2.0, 70), (120, 0.0, 79), (120, 2.0, 74),
            (121, 0.0, 81), (121, 2.0, 77), (122, 0.0, 76), (122, 2.0, 73),
            (123, 0.0, 74), (123, 2.0, 69), (124, 0.0, 74), (124, 2.0, 70),
            (125, 0.0, 69)]
    for bar, off, p in tail:
        add('bell', bar, off, p, 1.2, 40)
    add('riser', 125, 0.0, 60, 2.5, 36)
    swish(125, 3.0, 48)


# ---------------- 输出 ----------------
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
    lines.append(' * EX 面 BOSS《恶魔之妹》v5 —— 红月下癫狂、被囚禁 495 年的芙兰朵露。')
    lines.append(' * 200 BPM, D 小调, 4/4, 125 小节 = 150.0s 循环：')
    lines.append(' *   引子 I 1-8（八音盒完整唱 U.N. 主题）→ 引子 II 9-16（乐队再唱一遍）')
    lines.append(' *   → A1 17-24 → A2 25-32（主题+和声）→ B1 33-40（癫狂段 + 第二句）')
    lines.append(' *   → C1 41-56（副歌 4 遍）→ Bridge 57-62（癫狂 breakdown）')
    lines.append(' *   → B2 63-70（半音下行 + 主题头）→ C2 71-86（副歌，79-86 升半音）')
    lines.append(' *   → Solo 87-94 → Break 95-98（八音盒主题 + 起浪）')
    lines.append(' *   → D 99-110（主题 over blast + 32 分崩塌）→ Coda 111-118 → Outro 119-125。')
    lines.append(' * 全曲以 U.N. Owen 的时钟琶音（b3-4）、副歌 hook（b20-27）、半音桥段')
    lines.append(' * （b12-19）为唯一素材；hook 在第 1 小节就出现，之后每段都会回来。')
    lines.append(' * tools/build/_fld_compose5.py 生成，勿手改。')
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
    json_path = os.path.join(HERE, '_fld_lead', 'song5.json')
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

