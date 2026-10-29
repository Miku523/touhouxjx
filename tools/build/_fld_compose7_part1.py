# -*- coding: utf-8 -*-
"""EX BOSS《恶魔之妹》v7 —— U.N. Owen Was Her? 的忠实改编（不混入最終鬼畜妹元素）。
160 BPM / D 小调 / 4/4 / 100 小节 = 150.0s：
  引子 I 1-6（八音盒时钟 + 心跳）→ 引子 II 7-10（钢琴弱起 + 乐队进）
  → A 11-21（原曲 b1-11 时钟琶音主题）→ B 22-29（原曲 b12-19 C# 踏板半音下行）
  → C1 30-45（原曲 b20-35 副歌）→ D 46-57（原曲 b36-47 钢琴分解间奏）
  → E 58-73（原曲 b48-63 展开）→ C2 74-89（原曲 b64-79 副歌再现）
  → 尾句 90（原曲 b80 皮卡迪三度）→ Outro 91-100（崩回八音盒，接回引子）。
旋律全部来自原 MIDI（tools/build/_fld_lead/un_mel.json），和声照原曲段落。
生成 src/engine/songs/flandre_devil.js 与 tools/build/_fld_lead/song7.json。
"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _fld_compose2 as L

BPM = 160.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
DURATION = 150.0
BARS = 100
L.BPM = BPM; L.BEAT = BEAT; L.BAR = BAR; L.DURATION = DURATION; L.BARS = BARS

L.TRACK_DEFS = [
    ('lead', 'saw', 0.155),
    ('piano', 'sine', 0.090),
    ('harpsi', 'square', 0.048),
    ('strings', 'saw', 0.060),
    ('choir', 'sine', 0.050),
    ('brass', 'square', 0.058),
    ('bass', 'triangle', 0.130),
    ('bell', 'sine', 0.085),
    ('pad', 'sine', 0.030),
    ('counter', 'triangle', 0.046),
    ('tick', 'square', 0.038),
    ('riser', 'saw', 0.045),
]
L.TRACKS = {name: [] for name, _, _ in L.TRACK_DEFS}
L.DRUMS = []
L.DRUM_SCALE = 0.80
L.CHORDS.clear(); L.HALF.clear()

MEL = json.load(open(os.path.join(HERE, '_fld_lead', 'un_mel.json'), encoding='utf-8'))

def sec(b0, seq):
    for i, (r, q) in enumerate(seq):
        L.CHORDS[b0 + i] = (r, q)

def halves(b0, seq4):
    for i in range(8):
        L.HALF[b0 + i] = seq4[i % 4]

CH = [(('Bb','maj'),('C','maj')), (('D','m'),('G','m')),
      (('Bb','maj'),('C','maj')), (('D','m'),('D','m'))]

# ---------------- 和声（照原曲段落） ----------------
sec(1,  [('D','m'),('D','m'),('Bb','maj'),('Bb','maj'),('G','m'),('A','7')])
sec(7,  [('D','m'),('Bb','maj'),('C','maj'),('A','7')])
sec(11, [('D','m'),('D','m'),('D','m'),('Bb','maj'),('D','m'),('Bb','maj'),
         ('D','m'),('Bb','maj'),('D','m'),('Bb','maj'),('D','m')])
for b in range(22, 30):
    L.CHORDS[b] = ('D','m')
    L.HALF[b] = [(('D','m'),('C#','m'))] * 2
sec(30, [('Bb','maj'),('C','maj'),('D','m'),('G','m')] * 4)
for b in range(30, 46):
    L.HALF[b] = [CH[b % 4]]
sec(74, [('Eb','maj')] + [('Bb','maj'),('C','maj'),('D','m'),('G','m')] * 3 + [('Bb','maj'),('C','maj'),('D','m'),('D','m')])
for b0 in (75, 79, 83):
    for i in range(4):
        L.HALF[b0 + i] = [CH[i]]
L.HALF[87] = [CH[0]]; L.HALF[88] = [CH[1]]
sec(90, [('D','maj')])
sec(91, [('D','m'),('D','m'),('Bb','maj'),('Bb','maj'),('G','m'),('A','7'),('D','m'),('D','m'),('Bb','maj'),('D','m')])
sec(46, [('D','m'),('D','m'),('F#','m'),('F#','m'),('D','m'),('E','m'),
         ('D','m'),('F','maj'),('D','m'),('E','m'),('D','m'),('F','maj')])
for b in range(58, 74):
    L.CHORDS[b] = ('D','m')
    L.HALF[b] = [(('D','m'),('C#','m'))] * 2

# ---------------- 旋律搬运 ----------------
def mel_range(b0, ob0, ob1, name, octv=0, vel=104, shift=0.0, lo=0, hi=127, dmin=0.22, dmax=6.0):
    for ob in range(ob0, ob1 + 1):
        for beat, p, d in MEL[str(ob)]:
            if p < lo or p > hi:
                continue
            b = beat + shift
            if b < -1e-9 or b >= 3.999:
                continue
            L.add(name, b0 + (ob - ob0), b, p + octv, min(dmax, max(dmin, d)), vel)

def bell_clock(bar, vel=52, step=0.5, octv=0):
    pat = [77, 74, 69, 74, 77, 81]
    n = int(4 / step)
    for i in range(n):
        L.add('bell', bar, i * step, pat[i % len(pat)] + octv, 0.18, vel + (4 if i % 2 == 0 else 0))

def piano_comp(bar, half, vel=64, octv=4):
    if not half:
        half = [L.CHORDS.get(bar, ('D','m'))]
    for i, (r, q) in enumerate(half):
        ps = L.chord_voicing(r, q, octv)
        for off in (0.0, 1.0, 2.0, 3.0):
            for p in ps:
                L.add('piano', bar, i * 2.0 + off, p, 0.75, vel + (6 if off == 0 else 0))

def strings_bar(bar, vel=56, octv=3):
    half = L.HALF.get(bar)
    if half:
        for i in range(len(half)):
            r, q = half[i]
            for p in L.power(r, octv):
                L.add('strings', bar, i * 2.0, p, 1.95, vel)
    else:
        r, q = L.CHORDS.get(bar, ('D','m'))
        for p in L.power(r, octv):
            L.add('strings', bar, 0.0, p, 3.9, vel)

def choir_bar(bar, vel=44, octv=4):
    r, q = L.CHORDS.get(bar, ('D','m'))
    for p in L.chord_voicing(r, q, octv):
        L.add('choir', bar, 0.0, p, 3.85, vel)

def bass_bar(bar, vel=100, octv=2, drive=False):
    half = L.HALF.get(bar)
    roots = []
    if half:
        for i in range(len(half)):
            roots.append((i * 2.0, L.midi(half[i][0], octv)))
    else:
        roots.append((0.0, L.midi(L.CHORDS.get(bar, ('D','m'))[0], octv)))
    for off, r in roots:
        steps = [0.5, 1.0, 1.5] if drive else [1.0, 1.5]
        L.add('bass', bar, off, r, 0.42 if drive else 0.9, vel)
        for s in steps:
            L.add('bass', bar, off + s, r, 0.42 if drive else 0.9, vel - 8)
        L.add('bass', bar, off + 2.0, r + 12, 0.42, vel - 4)
        L.add('bass', bar, off + 2.5, r + 7, 0.42, vel - 12)
        L.add('bass', bar, off + 3.0, r + 12, 0.42, vel - 6)

def harp_arp(bar, vel=52, octv=4, pat=(0, 1, 2, 1)):
    half = L.HALF.get(bar)
    if half:
        r, q = half[0]
    else:
        r, q = L.CHORDS.get(bar, ('D','m'))
    ps = L.chord_voicing(r, q, octv)
    for i in range(4):
        for j, k in enumerate(pat):
            L.add('harpsi', bar, i + j * 0.25, ps[k % len(ps)], 0.2, vel - j * 3)

def tick_bar(bar, step=0.5, vel=44):
    n = int(4 / step)
    for i in range(n):
        L.add('tick', bar, i * step, 93 if i % 2 == 0 else 90, 0.05, vel + (4 if i % 2 == 0 else 0))

def pads(bar, vel=28):
    r, q = L.CHORDS.get(bar, ('D','m'))
    L.add('pad', bar, 0.0, L.midi(r, 2), 3.9, vel)

# ---------------- 鼓 ----------------
def dr_light(bar, crash_at=None):
    if crash_at is not None: L.crash(bar, crash_at, 84)
    for off in (0.0, 2.0): L.hit(bar, off, 0, 104)
    for off in (1.0, 3.0): L.hit(bar, off, 1, 92)
    for i in range(8): L.hit(bar, i * 0.5, 2, 58 if i % 2 else 64)

def dr_half(bar, crash_at=None):
    if crash_at is not None: L.crash(bar, crash_at, 80)
    for i in range(4): L.hit(bar, i, 2, 62)
    L.hit(bar, 1.0, 1, 70); L.hit(bar, 3.0, 1, 78)

def dr_four(bar, crash_at=None, hats16=False, roll=False):
    if crash_at is not None: L.crash(bar, crash_at, 88)
    for off in (0.0, 1.0, 2.0, 3.0): L.hit(bar, off, 0, 116)
    L.hit(bar, 1.0, 1, 104); L.hit(bar, 3.0, 1, 108)
    if hats16:
        for i in range(16): L.hit(bar, i * 0.25, 2, 56 if i % 2 else 64)
    else:
        for i in range(8): L.hit(bar, i * 0.5, 2, 56 if i % 2 else 66)
    if roll: L.fill_roll(bar, 2.5, 1.25, 96)

def dr_big(bar, crash_at=None, roll=False):
    if crash_at is not None: L.crash(bar, crash_at, 96)
    for off in (0.0, 1.0, 2.0, 3.0): L.hit(bar, off, 0, 120)
    L.hit(bar, 1.0, 1, 112); L.hit(bar, 3.0, 1, 116)
    L.hit(bar, 2.5, 1, 92)
    for i in range(8): L.hit(bar, i * 0.5, 2, 60 if i % 2 else 70)
    if roll: L.fill_roll(bar, 2.5, 1.25, 108)

def dr_build(bar, level):
    L.hit(bar, 0.0, 0, 112); L.hit(bar, 2.0, 0, 112)
    if level >= 2: L.hit(bar, 1.0, 0, 100); L.hit(bar, 3.0, 0, 100)
    if level >= 3:
        for i in range(8): L.hit(bar, i * 0.5, 1, 84 + i * 3)
    else:
        L.hit(bar, 1.0, 1, 96); L.hit(bar, 3.0, 1, 100)
    for i in range(8): L.hit(bar, i * 0.5, 2, 56 + level * 3)

# ---------------- 段落 ----------------
def intro():
    for bar in range(1, 7):
        pads(bar, 24)
    for bar in (1, 2):
        tick_bar(bar, 0.5, 34)
        for i, p in enumerate((74, 81, 77)):
            L.add('bell', bar, 1.0 + i * 1.0, p, 0.9, 50)
    for bar in range(3, 7):
        bell_clock(bar, 50 + (bar - 3) * 4, 0.5)
        tick_bar(bar, 0.5, 36 + (bar - 3) * 3)
    for bar in (3, 4):
        L.hit(bar, 0.0, 0, 64); L.hit(bar, 2.0, 0, 56)
    mel_range(7, 2, 2, 'piano', 0, 62, 0.0, dmin=0.2)
    mel_range(7, 2, 2, 'lead', -12, 84, 0.0, dmin=0.2)
    for bar in (7, 8):
        pads(bar, 30); bass_bar(bar, 76, 2, False); strings_bar(bar, 34)
    for bar in (9, 10):
        mel_range(bar, 2, 2, 'piano', 0, 66, 0.0, dmin=0.2)
        mel_range(bar, 2, 2, 'lead', -12, 92, 0.0, dmin=0.2)
        pads(bar, 30); bass_bar(bar, 92, 2, False); strings_bar(bar, 40)
        harp_arp(bar, 40, 4)
        dr_light(bar, 0.0 if bar == 9 else None)
    L.fill_toms(10, 2.0, 0.25, 78, 104)
    L.hit(10, 3.5, 4, 74)

def sec_a():
    for bar in (11, 12):
        pads(bar, 26); tick_bar(bar, 1.0, 34)
        if bar == 12:
            mel_range(12, 2, 2, 'lead', -12, 96, 0.0, dmin=0.2)
            mel_range(12, 2, 2, 'piano', 0, 74, 0.0, dmin=0.2)
            L.add('bell', 12, 1.75, 86, 1.2, 58)
    for bar in range(13, 22):
        ob = bar - 10
        mel_range(bar, ob, ob, 'lead', -12, 104, 0.0, dmin=0.2)
        mel_range(bar, ob, ob, 'piano', 0, 84, 0.0, dmin=0.2)
        L.add('bell', bar, 0.0, L.midi(L.CHORDS[bar][0], 5) + 12, 0.5, 44)
        bass_bar(bar, 96, 2, True)
        strings_bar(bar, 40)
        dr_light(bar, 0.0 if bar in (13, 17) else None)
        if bar in (14, 19):
            L.hit(bar, 2.0, 1, 98); L.hit(bar, 3.5, 1, 104)
        L.hit(bar, 3.5, 2, 66)
    L.fill_toms(21, 2.5, 0.25, 82, 108)
    L.hit(21, 3.75, 4, 78)

def sec_b():
    for bar in range(22, 30):
        ob = bar - 10
        mel_range(bar, ob, ob, 'lead', 0, 98, 0.0, lo=0, hi=84, dmin=0.3)
        mel_range(bar, ob, ob, 'counter', -12, 58, 0.0, lo=0, hi=84, dmin=0.3)
        strings_bar(bar, 44)
        pads(bar, 30)
        tick_bar(bar, 1.0, 30)
        dr_half(bar, 0.0 if bar == 22 else None)
        if bar >= 28:
            L.hit(bar, 2.0, 0, 88); L.hit(bar, 3.5, 1, 96)
    L.fill_roll(29, 2.0, 2.0, 96)
    L.hit(29, 3.0, 4, 72)

def sec_c1():
    for bar in range(30, 46):
        ob = bar - 10
        mel_range(bar, ob, ob, 'lead', -12, 116, -0.25, dmin=0.22)
        mel_range(bar, ob, ob, 'bell', 0, 50, -0.25, lo=86, dmin=0.22)
        piano_comp(bar, L.HALF.get(bar), 66)
        strings_bar(bar, 52)
        choir_bar(bar, 42)
        bass_bar(bar, 104, 2, True)
        dr_four(bar, 0.0 if (bar - 30) % 8 == 0 else None, hats16=False)
        if (bar - 30) % 8 == 6: L.hit(bar, 3.5, 1, 112)
    L.brass_stabs(30, [0.0], 0.3, 88, 3)
    for bar in (34, 38, 42):
        L.brass_stabs(bar, [0.0, 2.0], 0.22, 74, 3)
    L.fill_toms(44, 2.5, 0.25, 86, 112)
    L.fill_roll(45, 2.0, 2.0, 108)

def sec_d():
    for bar in range(46, 58):
        ob = bar - 10
        mel_range(bar, ob, ob, 'piano', -12, 74, 0.0, dmin=0.2)
        mel_range(bar, ob, ob, 'harpsi', 0, 46, 0.0, dmin=0.2, lo=0, hi=95)
        strings_bar(bar, 40)
        pads(bar, 26)
        bass_bar(bar, 96, 2, False)
        dr_four(bar, 0.0 if bar in (46, 50, 54) else None)
        L.add('bell', bar, 0.0, L.midi(L.CHORDS[bar][0], 5) + 12, 0.5, 40)
    L.fill_toms(57, 2.0, 0.25, 82, 110)

def sec_e():
    for bar in range(58, 74):
        ob = bar - 10
        mel_range(bar, ob, ob, 'lead', 0, 100 + (bar - 58), 0.0, lo=0, hi=84, dmin=0.3)
        mel_range(bar, ob, ob, 'counter', -12, 62, 0.0, lo=0, hi=84, dmin=0.3)
        strings_bar(bar, 54 if bar < 66 else 62)
        choir_bar(bar, 38 if bar < 66 else 46)
        bass_bar(bar, 100, 2, True)
        pads(bar, 26)
        dr_build(bar, 1 + (bar - 58) // 4)
        if bar in (58, 62, 66, 70): L.brass_stabs(bar, [0.0], 0.25, 86, 3)
    L.fill_toms(72, 2.0, 0.25, 88, 112)
    L.fill_roll(73, 2.0, 2.0, 112)
    L.hit(73, 3.5, 4, 96)

def sec_c2():
    L.brass_stabs(74, [0.0, 1.0, 2.0], 0.3, 94, 3)
    for bar in range(74, 90):
        if bar == 74:
            piano_comp(bar, None, 70); strings_bar(bar, 56); choir_bar(bar, 44)
            bass_bar(bar, 104, 2, True); dr_big(bar, 0.0)
            continue
        ob = bar - 10
        mel_range(bar, ob, ob, 'lead', -12, 122, -0.25, dmin=0.22)
        mel_range(bar, ob, ob, 'bell', 0, 54, -0.25, lo=86, dmin=0.22)
        piano_comp(bar, L.HALF.get(bar), 72)
        strings_bar(bar, 60)
        choir_bar(bar, 50)
        bass_bar(bar, 108, 2, True)
        harp_arp(bar, 40, 5)
        dr_big(bar, 0.0 if (bar - 74) % 4 == 0 else None, roll=((bar - 74) % 8 == 7))
        if (bar - 74) % 8 == 6: L.hit(bar, 3.5, 1, 118)
    L.fill_toms(88, 2.5, 0.25, 92, 116)
    L.fill_roll(89, 2.0, 2.0, 116)

def sec_tail_outro():
    for p in (50, 54, 57, 62):
        L.add('strings', 90, 0.0, p, 3.9, 66)
        L.add('choir', 90, 0.0, p, 3.9, 56)
    L.add('piano', 90, 0.0, 50, 3.8, 80); L.add('piano', 90, 0.0, 57, 3.8, 74)
    L.add('bell', 90, 0.0, 86, 3.0, 62)
    L.crash(90, 0.0, 100); L.hit(90, 0.0, 0, 118)
    L.fill_roll(90, 0.5, 3.0, 96)
    for bar in range(91, 101):
        pads(bar, 26)
        strings_bar(bar, 30)
        if bar <= 94:
            for i, p in enumerate((74, 81, 77, 74)):
                L.add('bell', bar, i * 1.0, p, 0.9, 46)
            tick_bar(bar, 1.0, 30)
        elif bar <= 97:
            bell_clock(bar, 40, 1.0)
            tick_bar(bar, 1.0, 26)
        else:
            tick_bar(bar, 1.0, 22)
            L.add('bell', bar, 0.0, 74, 1.4, 40)
        if bar <= 93:
            L.hit(bar, 0.0, 0, 60); L.hit(bar, 2.0, 0, 50)
    L.add('piano', 99, 0.0, 50, 1.4, 56); L.add('piano', 99, 0.0, 57, 1.4, 50)
    L.add('bell', 100, 0.0, 74, 1.2, 44)
