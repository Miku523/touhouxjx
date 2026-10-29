# -*- coding: utf-8 -*-
"""EX BOSS《恶魔之妹》v6 —— 按「最終鬼畜妹 / U.N. Owen」的 Eurobeat-chiptune 角度重编。
200 BPM / D 小调 / 125 小节 = 150.0s。与 v5 的金属墙彻底换掉织体：
四踩 + 反拍贝斯 + 十六分芯片琶音 + 方波主旋律，U.N. 副歌 hook 第 9 小节就直接唱。
生成 src/engine/songs/flandre_devil.js 与 tools/build/_fld_lead/song6.json。
"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _fld_compose2 as L

BPM = 200.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
DURATION = 150.0
BARS = 125
L.BPM = BPM; L.BEAT = BEAT; L.BAR = BAR; L.DURATION = DURATION; L.BARS = BARS

L.TRACK_DEFS = [
    ('lead', 'saw', 0.150),
    ('arp', 'sine', 0.112),
    ('brass', 'square', 0.098),
    ('strings', 'saw', 0.062),
    ('pad', 'sine', 0.028),
    ('choir', 'sine', 0.060),
    ('bass', 'triangle', 0.122),
    ('piano', 'sine', 0.078),
    ('bell', 'sine', 0.095),
    ('tick', 'square', 0.040),
    ('counter', 'triangle', 0.062),
    ('knife', 'square', 0.050),
    ('riser', 'saw', 0.048),
    ('reverse', 'saw', 0.040),
]
L.TRACKS = {name: [] for name, _, _ in L.TRACK_DEFS}
L.DRUMS = []
L.DRUM_SCALE = 0.72
L.CHORDS.clear(); L.HALF.clear()

# ---------------- 和声 ----------------
def sec(b0, seq):
    for i, (r, q) in enumerate(seq):
        L.CHORDS[b0 + i] = (r, q)

def halves(b0, seq4):
    for i in range(8):
        L.HALF[b0 + i] = seq4[i % 4]

sec(1,   [('D','m'),('D','m'),('Bb','maj'),('Bb','maj'),('G','m'),('A','7'),('D','m'),('A','7')])
sec(57,  [('D','m'),('D','m'),('Bb','maj'),('Bb','maj'),('G','m'),('A','7'),('D','m'),('D','m')])
sec(25,  [('D','m'),('Eb','maj'),('D','m'),('Eb','maj'),('Bb','maj'),('C','maj'),('A','7'),('A','7')] * 2)
sec(97,  [('D','m'),('Eb','maj'),('D','m'),('Eb','maj'),('Bb','maj'),('C','maj'),('A','7'),('A','7')] * 2)
sec(65,  [('D','m'),('C','maj'),('D','m'),('Bb','maj'),('Eb','maj'),('D','m'),('A','7'),('D','m')])
sec(113, [('D','m'),('Bb','maj'),('G','m'),('A','7'),('D','m'),('Bb','maj'),('D','m'),('C','maj')])
sec(121, [('D','m'),('Bb','maj'),('D','m'),('A','7'),('D','m')])

CH  = [(('Bb','maj'),('C','maj')), (('D','m'),('G','m')), (('Bb','maj'),('C','maj')), (('D','m'),('D','m'))]
CHU = [(('B','maj'),('C#','maj')), (('Eb','m'),('Ab','m')), (('B','maj'),('C#','maj')), (('Eb','m'),('Eb','m'))]
for b0 in (9, 17, 41, 49, 73, 77, 81, 105, 109):
    halves(b0, CH)
halves(89, CHU)

# ---------------- U.N. 素材（与 v5 同源，hook 已 -0.25 拍落正拍、-12 八度） ----------------
THEME = [
    (0, 0.0, 79, 0.25), (0, 1.0, 79, 0.25), (0, 1.5, 74, 0.5), (0, 2.5, 81, 0.5), (0, 3.5, 76, 0.5),
    (1, 0.5, 81, 0.5), (1, 1.5, 77, 0.5), (1, 2.5, 79, 0.5), (1, 3.0, 81, 0.5), (1, 3.5, 79, 0.5),
    (2, 0.5, 83, 0.5), (2, 1.5, 86, 0.5), (2, 2.0, 81, 0.5), (2, 2.5, 88, 0.5), (2, 3.0, 89, 0.5), (2, 3.5, 88, 0.5),
    (3, 0.0, 89, 0.25), (3, 0.25, 88, 0.25), (3, 0.5, 86, 0.5), (3, 1.0, 84, 0.25), (3, 1.5, 81, 0.5),
    (3, 2.0, 84, 0.5), (3, 2.5, 79, 0.5), (3, 3.0, 81, 0.5), (3, 3.5, 77, 2.0),
]
THEME2 = [
    (0, 1.5, 74, 0.5), (0, 2.5, 81, 0.5), (0, 3.5, 76, 0.5),
    (1, 0.5, 81, 0.5), (1, 1.5, 77, 0.5), (1, 2.5, 79, 0.5), (1, 3.0, 81, 0.5), (1, 3.5, 79, 0.5),
    (2, 0.5, 83, 0.5), (2, 1.5, 86, 0.5), (2, 2.0, 81, 0.5), (2, 2.5, 88, 0.5), (2, 3.0, 89, 0.25), (2, 3.5, 88, 0.5),
    (3, 0.0, 89, 0.25), (3, 0.25, 88, 0.25), (3, 0.5, 86, 0.5), (3, 1.0, 84, 0.25), (3, 1.5, 86, 4.0),
]
CLOCK = [
    (0, 0.0, 77), (0, 0.25, 74), (0, 0.5, 69), (0, 0.75, 76), (0, 1.5, 76),
    (0, 2.0, 76), (0, 2.75, 77), (0, 3.0, 74), (0, 3.25, 69), (0, 3.5, 77), (0, 3.75, 74),
    (1, 0.0, 69), (1, 0.25, 77), (1, 0.5, 74), (1, 0.75, 69), (1, 1.0, 77),
    (1, 1.25, 74), (1, 1.5, 69), (1, 1.75, 79), (1, 2.5, 79), (1, 3.0, 79), (1, 3.75, 77),
]
CHROM = [
    (0, 1.75, 69, 0.5), (0, 2.75, 65, 0.5), (0, 3.75, 68, 0.5),
    (1, 0.75, 64, 0.5), (1, 1.75, 71, 0.5), (1, 2.75, 68, 0.5), (1, 3.75, 67, 0.5),
    (2, 0.75, 70, 0.5), (2, 1.75, 69, 0.5), (2, 2.75, 65, 0.5), (2, 3.75, 68, 0.5),
    (3, 0.75, 64, 0.5), (3, 1.75, 71, 0.5), (3, 2.75, 68, 0.5), (3, 3.75, 67, 2.0),
]

# ---------------- 工具 ----------------
def hv(i, v):
    return max(1, min(127, int(v + ((i * 37) % 11) - 5)))

def play(b0, name, vel=118, octv=0, shift=0, melody=THEME, end_bar=None):
    for k, (bo, off, p, d) in enumerate(melody):
        bar = b0 + bo
        dd = d
        if end_bar is not None:
            dd = min(dd, (end_bar - bar) * 4.0 - off)
        if dd <= 0.05:
            continue
        L.add(name, bar, off, p + octv + shift, dd, hv(k, vel))

def play_third(b0, name, vel=56, shift=0, melody=THEME):
    for k, (bo, off, p, d) in enumerate(melody):
        q = p + (3 if (p % 12) in (2, 5, 7, 10, 0) else 4)
        L.add(name, b0 + bo, off, q + 12 + shift, d, hv(k, vel))

# ---------------- 鼓 ----------------
def dr_euro(bar, crash_at=None, snare=102, kick=118, hats16=True, open_hat=True):
    if crash_at is not None:
        L.hit(bar, crash_at, 4, 90)
    for b in (0.0, 1.0, 2.0, 3.0):
        L.hit(bar, b, 0, kick)
    L.hit(bar, 1.0, 1, snare); L.hit(bar, 3.0, 1, snare)
    o = 0.0
    step = 0.25 if hats16 else 0.5
    while o < 3.999:
        acc = 48 if abs(o - round(o)) < 1e-6 else 24
        L.hit(bar, o, 2, acc)
        o += step
    if open_hat:
        for o in (0.5, 1.5, 2.5, 3.5):
            L.hit(bar, o, 3, 50)

def dr_push(bar, crash_at=None):
    if crash_at is not None:
        L.hit(bar, crash_at, 4, 96)
    for b in (0.0, 1.0, 2.0, 3.0):
        L.hit(bar, b, 0, 120)
    L.hit(bar, 1.0, 1, 106); L.hit(bar, 3.0, 1, 106)
    for k in range(4):
        L.hit(bar, 3.5 + k * 0.125, 1, 66 + k * 10)
    o = 0.0
    while o < 3.999:
        L.hit(bar, o, 2, 40 if abs(o - round(o)) < 1e-6 else 26)
        o += 0.25
    for o in (0.5, 1.5, 2.5):
        L.hit(bar, o, 3, 54)

def dr_hero(bar, crash_at=None):
    if crash_at is not None:
        L.hit(bar, crash_at, 4, 100)
    for b in (0.0, 1.0, 2.0, 3.0):
        L.hit(bar, b, 0, 120)
    L.hit(bar, 2.75, 0, 88)
    L.hit(bar, 1.0, 1, 110); L.hit(bar, 3.0, 1, 110); L.hit(bar, 3.75, 1, 82)
    o = 0.0
    while o < 3.999:
        L.hit(bar, o, 2, 50 if abs(o - round(o)) < 1e-6 else 28)
        o += 0.25
    for o in (0.5, 1.5, 2.5, 3.5):
        L.hit(bar, o, 3, 56)
    L.ride_bar(bar, 0.5, 32)

def dr_half(bar, crash_at=None, snare=86):
    if crash_at is not None:
        L.hit(bar, crash_at, 4, 82)
    L.hit(bar, 0.0, 0, 106); L.hit(bar, 2.0, 0, 98); L.hit(bar, 2.0, 1, snare)
    o = 0.0
    while o < 3.999:
        L.hit(bar, o, 2, 22)
        o += 0.5

# ---------------- 低音 / 琶音 / 织体 ----------------
def bass_euro(bar, vel=106, octv=2):
    for off in (0.0, 1.0, 2.0, 3.0):
        r, q = L.chord_at(bar, off)
        p = L.midi(r, octv)
        L.add('bass', bar, off + 0.5, p, 0.26, vel)
    r, q = L.chord_at(bar, 2.0)
    L.add('bass', bar, 3.75, L.midi(r, octv) + 12, 0.2, vel - 10)

def bass_8(bar, vel=100, octv=2):
    for off in (0.0, 1.0, 2.0, 3.0):
        r, q = L.chord_at(bar, off)
        p = L.midi(r, octv)
        for k in range(2):
            L.add('bass', bar, off + k * 0.5, p if k == 0 else p, 0.42, vel if k == 0 else vel - 6)

def piano_bar(bar, vel=72, octv=3):
    for off in (0.0, 2.0):
        r, q = L.chord_at(bar, off)
        ts = L.tones(r, q, octv)
        for k in range(4):
            L.add('piano', bar, off + k * 0.5, ts[[0, 1, 2, 1][k]], 0.45, vel if k % 2 == 0 else vel - 8)

def arp16(bar, vel=68, octv=5, var=0):
    for half in (0.0, 2.0):
        r, q = L.chord_at(bar, half)
        ts = L.tones(r, q, octv)
        a, b, c = ts[0], ts[1], ts[2]
        pats = [
            [a, b, c, b, a + 12, c, b, c],
            [a, c, b, c, a + 12, c, b + 12, c],
            [a, b, c, a, b, c, a + 12, c],
            [b, c, a, c, b, c, a + 12, c],
        ]
        pat = pats[var % 4]
        for k in range(8):
            L.add('arp', bar, half + k * 0.25, pat[k], 0.12, vel if k % 4 == 0 else vel - 6)

def arp32(bar, vel=62, octv=5):
    for half in (0.0, 2.0):
        r, q = L.chord_at(bar, half)
        ts = L.tones(r, q, octv)
        a, b, c = ts[0], ts[1], ts[2]
        pat = [a, b, c, a + 12, b, c, a, b + 12, c, b, a, c, a + 12, b + 12, c, a]
        for k in range(16):
            L.add('arp', bar, half + k * 0.125, pat[k], 0.08, vel if k % 4 == 0 else vel - 8)

def strings_bar(bar, vel=52, octv=3):
    L.power_sustain('strings', bar, vel, octv)

def choir_bar(bar, vel=44, octv=4):
    L.choir_chord(bar, vel, octv)

def pad_bar(bar, vel=28):
    L.pad_hold(bar, 4.0, vel, 2)

def stab(bar, offs=(1.5, 3.5), vel=72, octv=4):
    L.brass_stabs(bar, offs, 0.14, vel, octv)

def piano_off(bar, vel=64, octv=4):
    for off in (0.5, 1.5, 2.5, 3.5):
        r, q = L.chord_at(bar, off)
        ts = L.tones(r, q, octv)
        for k in (0, 1, 2):
            L.add('piano', bar, off, ts[k], 0.3, vel if k == 0 else vel - 10)

def brass_bar(bar, vel=62, octv=4):
    for off in (0.0, 2.0):
        r, q = L.chord_at(bar, off)
        for p in L.chord_voicing(r, q, octv):
            L.add('brass', bar, off, p, 0.55, vel if off == 0.0 else vel - 8)

def bell_clock(bar, vel=42, octv=5):
    r, q = L.chord_at(bar, 0.0)
    ts = L.tones(r, q, octv)
    for k, off in enumerate((0.0, 0.5, 1.0, 2.0, 2.5, 3.0)):
        L.add('bell', bar, off, ts[[0, 1, 2, 1, 2, 0][k]] + 12, 0.2, vel if k % 2 == 0 else vel - 6)

def run16(bar, vel=104, octv=5, dirn=1):
    """D 小调十六分跑句（每小节 16 个音），用于 solo / D 段。"""
    sc = [2, 4, 5, 7, 9, 10, 11, 0]
    base = 74
    for k in range(16):
        idx = (k * 2 + (0 if dirn > 0 else 8)) % len(sc)
        p = base + sc[idx] + 12 * (1 if k >= 8 else 0) + 12 * (octv - 5)
        L.add('lead', bar, k * 0.25, p, 0.2, hv(k, vel))

# ---------------- 段落 ----------------
def hook8(b0, lead_v=120, oct_v=0, harm=False, bell_v=0, shift=0):
    play(b0, 'lead', lead_v, shift=shift)
    play(b0 + 4, 'lead', lead_v - 2, melody=THEME2, shift=shift)
    if oct_v:
        play(b0, 'lead', oct_v, octv=12, shift=shift)
        play(b0 + 4, 'lead', oct_v - 2, octv=12, melody=THEME2, shift=shift)
    if harm:
        play_third(b0, 'choir', 54, shift=shift)
        play_third(b0 + 4, 'choir', 52, shift=shift, melody=THEME2)
    if bell_v:
        play(b0, 'bell', bell_v, shift=shift)
        play(b0 + 4, 'bell', bell_v - 4, melody=THEME2, shift=shift)

def intro():
    # 1-4 八音盒时钟 + 低音雾
    for k, (bo, off, p) in enumerate(CLOCK):
        L.add('bell', 1 + bo, off, p + 12, 0.5, hv(k, 66))
    for bar in (1, 2, 3, 4):
        pad_bar(bar, 24)
        L.add('bass', bar, 0.0, L.midi('D', 2), 3.6, 54)
    for k in range(4):
        L.hit(5 + k // 2, 0.0 if k % 2 == 0 else 2.0, 0, 96)
    # 5-8 主题预告（八音盒唱 hook 的第一句）+ 渐入
    play(5, 'bell', 74, melody=THEME[:10])
    L.hit_x(8, 2.5, 8, 60, 1.5)
    for bar in (6, 7):
        L.add('tick', bar, 0.0, 96, 0.2, 40); L.add('tick', bar, 2.0, 96, 0.2, 36)
    bass_8(7, 80)
    L.add('riser', 8, 0.0, 50, 4.0, 62)
    L.fill_toms(8, 2.0, 0.25, 60, 96)

def sec_a1():
    for j in range(16):
        bar = 9 + j
        if j < 8:
            dr_euro(bar, crash_at=0.0 if j == 0 else None, hats16=False)
        else:
            dr_euro(bar, crash_at=0.0 if j == 8 else None)
        bass_euro(bar, 100 if j < 8 else 106)
        piano_bar(bar, 70 if j < 8 else 76)
        strings_bar(bar, 42 if j < 8 else 50)
        if j >= 4:
            arp16(bar, 60 if j < 8 else 68, 5, j % 4)
        if j >= 8:
            L.brass_stabs(bar, (3.5,), 0.14, 60, 4)
    hook8(9, 121, oct_v=0, bell_v=58)
    # 17-24：先唱回答句（THEME2）、再回主句并加高八度、合唱三度与钟摆点缀
    play(17, 'lead', 118, melody=THEME2)
    play(17, 'bell', 52, melody=THEME2)
    play(21, 'lead', 122)
    play(21, 'lead', 88, octv=12)
    play_third(17, 'choir', 50, melody=THEME2)
    play_third(21, 'choir', 54)
    for j in range(8):
        bell_clock(17 + j, 40 if j % 2 == 0 else 34)
    L.fill_toms(20, 3.0, 0.25, 64, 92)
    L.fill_roll(24, 3.0, 1.0, 100)
    L.add('knife', 24, 3.75, 96, 0.3, 78)

def sec_build():
    for j in range(16):
        bar = 25 + j
        if j < 8:
            dr_euro(bar, crash_at=0.0 if j == 0 else None)
        else:
            dr_push(bar, crash_at=0.0 if j == 8 else None)
        bass_euro(bar, 106) if j < 8 else bass_8(bar, 104)
        if j < 8:
            arp16(bar, 58 + j * 2, 5, j % 4)
        else:
            arp32(bar, 48 + (j - 8) * 2, 5)
        strings_bar(bar, 46 + min(j, 8) * 2)
        if j % 2 == 1:
            stab(bar, (1.5, 3.5), 66, 4)
        if j in (1, 5, 9, 13):
            L.fill_toms(bar, 3.0, 0.25, 66, 96)
    play(25, 'lead', 119, melody=CHROM)
    play(29, 'lead', 121, melody=CHROM)
    play(33, 'lead', 120, melody=CHROM, octv=12)
    play(33, 'lead', 107, melody=CHROM)
    play(37, 'lead', 124, melody=CHROM, octv=12)
    play(37, 'counter', 90, melody=CHROM)
    for bar in (27, 35):
        L.add('reverse', bar, 2.0, 60, 2.0, 70)
    L.add('riser', 32, 0.0, 50, 4.0, 66)
    L.fill_roll(32, 2.5, 1.5, 96)
    L.fill_toms(40, 2.0, 0.25, 66, 104)
    L.add('knife', 40, 3.75, 100, 0.3, 84)

def chorus8(b0, shift=0, hero=False):
    for j in range(8):
        bar = b0 + j
        if hero:
            dr_hero(bar, crash_at=0.0 if j == 0 else None)
        else:
            dr_euro(bar, crash_at=0.0 if j == 0 else None)
        bass_euro(bar, 110)
        strings_bar(bar, 56)
        choir_bar(bar, 44)
        pad_bar(bar, 30)
        if hero:
            arp32(bar, 56, 5)
        else:
            arp16(bar, 68, 5, j % 4)
        L.power_sustain('strings', bar, 40, 4)
        piano_off(bar, 72, 4)
        brass_bar(bar, 60, 4)
        stab(bar, (1.5, 3.5), 74, 4)
        if j % 2 == 1:
            L.fill_toms(bar, 3.5, 0.25, 60, 88)
    hook8(b0, 124, oct_v=92, harm=True, bell_v=62, shift=shift)
    L.add('knife', b0 + 7, 3.75, 96, 0.3, 80)

def sec_c1():
    chorus8(41)
    chorus8(49, hero=True)
    L.fill_toms(56, 2.0, 0.25, 70, 108)
    L.add('riser', 56, 2.0, 52, 2.0, 70)

def sec_bridge():
    for j in range(8):
        bar = 57 + j
        if j < 6:
            dr_half(bar, crash_at=0.0 if j == 0 else None)
        pad_bar(bar, 26)
    for k, (bo, off, p) in enumerate(CLOCK):
        L.add('bell', 57 + bo, off, p + 12, 0.6, hv(k, 70))
    play(59, 'bell', 76, melody=THEME[:8])
    play(61, 'piano', 66, melody=THEME[:10])
    L.add('bass', 57, 0.0, L.midi('D', 2), 3.6, 52)
    L.add('bass', 59, 0.0, L.midi('Bb', 2), 3.6, 52)
    L.add('bass', 61, 0.0, L.midi('G', 2), 3.6, 52)
    L.add('bass', 63, 0.0, L.midi('D', 2), 3.6, 56)
    L.add('tick', 61, 0.0, 96, 0.2, 44); L.add('tick', 61, 2.0, 96, 0.2, 38)
    L.add('riser', 63, 0.0, 50, 4.0, 64)
    L.fill_toms(64, 2.0, 0.25, 62, 100)
    L.hit_x(64, 3.0, 8, 62, 1.2)

def sec_solo():
    for j in range(8):
        bar = 65 + j
        dr_hero(bar, crash_at=0.0 if j == 0 else None)
        bass_8(bar, 104)
        strings_bar(bar, 50)
        arp32(bar, 58, 5)
        stab(bar, (3.5,), 64, 4)
        bell_clock(bar, 34)
    run16(65, 106, dirn=1); run16(66, 108, dirn=-1)
    run16(67, 110, dirn=1); run16(68, 110, dirn=-1)
    run16(69, 112, dirn=1); run16(70, 114, dirn=-1)
    run16(71, 116, dirn=1); run16(72, 116, dirn=-1)
    hook8(73, 122, oct_v=90, harm=True, bell_v=58)
    L.fill_toms(80, 2.0, 0.25, 72, 110)
    L.add('knife', 80, 3.5, 96, 0.3, 80)

def sec_c2():
    chorus8(81, hero=True)
    chorus8(89, hero=True, shift=1)
    L.fill_toms(96, 2.0, 0.25, 74, 112)
    L.add('riser', 96, 2.0, 54, 2.0, 74)

def sec_d():
    for j in range(8):
        bar = 97 + j
        dr_push(bar) if j % 2 == 0 else dr_hero(bar)
        bass_8(bar, 106)
        arp32(bar, 62, 5)
        strings_bar(bar, 54)
        piano_off(bar, 66, 4)
        stab(bar, (1.5, 3.5), 74, 4)
    for j in range(8):
        run16(97 + j, 112 + j, dirn=1 if j % 2 == 0 else -1)
    hook8(105, 124, oct_v=94, harm=True, bell_v=60)
    L.fill_toms(112, 2.0, 0.25, 76, 112)

def sec_coda():
    dr_half(113, crash_at=0.0); dr_half(114); dr_half(115)
    pad_bar(113, 26); pad_bar(114, 24)
    play(113, 'bell', 72, melody=THEME[:10])
    play(115, 'bell', 68, melody=THEME2[:6])
    for k, (bo, off, p) in enumerate(CLOCK):
        L.add('bell', 117 + bo, off, p + 12, 0.5, hv(k, 60))
    L.add('bass', 113, 0.0, L.midi('D', 2), 3.6, 48)
    L.add('bass', 115, 0.0, L.midi('Bb', 2), 3.6, 46)
    L.add('bass', 117, 0.0, L.midi('G', 2), 2.0, 44)
    L.add('bass', 119, 0.0, L.midi('D', 2), 3.6, 50)
    L.add('pad', 119, 0.0, L.midi('D', 2), 3.9, 30)
    L.add('pad', 119, 0.0, L.midi('A', 2), 3.9, 26)
    L.add('tick', 119, 0.0, 96, 0.2, 42)

def sec_outro():
    play(121, 'bell', 64, melody=THEME[:6])
    play(123, 'bell', 60, melody=THEME2[:4])
    for bar in (121, 122, 123, 124):
        L.add('bass', bar, 0.0, L.midi('D', 2), 3.6, 42)
        L.add('pad', bar, 0.0, L.midi('D', 2), 3.9, 22)
        L.add('tick', bar, 0.0, 96, 0.2, 34)
        L.add('tick', bar, 2.0, 96, 0.2, 30)
    L.add('bell', 125, 0.0, 74, 2.5, 56)

# ---------------- 写出 ----------------
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
    lines.append(' * EX 面 BOSS《恶魔之妹》v6 —— 红月下癫狂、被囚禁 495 年的芙兰朵露。')
    lines.append(' * 200 BPM, D 小调, 4/4, 125 小节 = 150.0s 循环，Eurobeat-chiptune 编制：')
    lines.append(' *   引子 1-8（八音盒时钟 + hook 预告）→ A1 9-24（hook 正面唱两遍）')
    lines.append(' *   → Build 25-40（U.N. 半音下行 + 上升）→ C1 41-56（副歌）')
    lines.append(' *   → Bridge 57-64（八音盒时停）→ Solo 65-80（三十二分琶音 + hook）')
    lines.append(' *   → C2 81-96（副歌，89-96 升半音）→ D 97-112（狂气跑句 + hook）')
    lines.append(' *   → Coda 113-120 → Outro 121-125。')
    lines.append(' * 四踩底鼓 + 反拍贝斯 + 十六分芯片琶音 + 方波主旋律；U.N. 的时钟琶音')
    lines.append(' * （b3-4）、副歌 hook（b20-27）、半音桥段（b12-19）仍是唯一素材。')
    lines.append(' * tools/build/_fld_compose6.py 生成，勿手改。')
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
    json_path = os.path.join(HERE, '_fld_lead', 'song6.json')
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    data = {'title': '恶魔之妹', 'duration': 150.0, 'bpm': 200,
            'tracks': tracks_json, 'drums': dr}
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print('wrote', out_js)
    print('wrote', json_path)
    print('notes:', sum(len(x['notes']) for x in tracks_json), 'drums:', len(dr))
    last = 0.0
    for name, _, _, ns in tracks_js:
        if ns:
            e = ns[-1][0] + ns[-1][2]
            last = max(last, e)
            print('  %-8s %4d notes  last=%.3f' % (name, len(ns), e))
    print('   last end %.3f' % last)

def main():
    intro(); sec_a1(); sec_build(); sec_c1(); sec_bridge()
    sec_solo(); sec_c2(); sec_d(); sec_coda(); sec_outro()
    write()

if __name__ == '__main__':
    main()
