#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/kaguya_stage6.py —— 6 面 Boss「竹取飛翔 ～ Lunatic Princess」重编曲：蓬莱山辉夜版

旋律（lead）严格取自原曲 MIDI（ZUN / Imperishable Night 版，量化到 16 分网格），
配器 / 律动 / 鼓组 / 曲式按「月之公主 · 不死 · 月都」的气质重写：

  lead  square    主旋律（原曲 trumpet 主题 + ch8 副旋律，连奏）
  wind  sawtooth  月光的琶音 / 十六分闪光 —— 竹取翁的竹林与月面
  bass  triangle  推进的八分贝斯，根音 + 五度 + 八度跳
  pad   sine      长音铺底，月光下的空房间

曲式（150 BPM，F 小调；D 段按原曲整段转 B 小调）：
  intro 8 + A 14 + B 14 + C 20 + D 14 + E 14 + outro 8 = 92 小节 ≈ 147.2s

素材对应原曲 MIDI（★ 主旋律在 ch10 trumpet，第二主题在 ch8 square lead）：
  A 段 : ch10 bar 17-30（招牌主题，F 小调：Bb-C-Db-Eb 循环）
  B 段 : ch0  bar 31-44（八分下行连接句）
  C 段 : ch8  bar 46-65（第二主题，高贵舒展）
  D 段 : ch8  bar 66-79（原曲转 B 小调的飞升段）
  E 段 : ch10 bar 17-30 +12（主题高八度总再现）

用法：
    python tools/kaguya_stage6.py            # 生成 src/engine/songs/kaguya_stage6.js
    python tools/kaguya_stage6.py --check    # 只自检不写文件
"""

import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCORE = os.path.join(ROOT, 'tools', 'build', '_kaguya_score.json')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'kaguya_stage6.js')

BPM = 144.0
BAR = 240.0 / BPM
STEP = BAR / 16.0
BARS = 92

# ---------------------------------------------------------------- 素材
D = json.load(open(SCORE, encoding='utf-8'))
CH = {int(k): v for k, v in D['ch'].items()}

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def nm(m):
    return '%s%d' % (NAMES[m % 12], m // 12 - 1)


def phrase(ch, b0, b1):
    """取 [b0,b1) 的旋律；同一步取最高音（拆掉原 MIDI 的八度/和弦叠层）。"""
    out = {}
    for b, si, m, ls, v in CH.get(ch, []):
        if b0 <= b < b1:
            key = (b - b0, si)
            cur = out.get(key)
            if cur is None or m > cur[2]:
                out[key] = (b - b0, si, m, ls)
    return sorted(out.values(), key=lambda x: (x[0], x[1]))


# ★ 主旋律 = ch10（trumpet），第二主题 = ch8（square lead）
THEME_A = phrase(10, 16, 30)     # 招牌主题（14 小节，F 小调）
BRIDGE = phrase(0, 30, 44)       # 八分下行连接句（14 小节）
THEME_B = phrase(8, 45, 65)      # 第二主题（20 小节）
THEME_D = phrase(8, 65, 79)      # B 小调飞升段（14 小节）
INTRO_RUN = phrase(0, 5, 13)     # 开场十六分琶音跑动（8 小节）
OUTRO_TAIL = phrase(10, 26, 30)  # 主题尾巴（4 小节）

# ---------------------------------------------------------------- 和声
# 和弦名 -> (根音音级, 音程集合)
CHORDS = {
    'Fm': (5, [0, 3, 7]), 'Fm7': (5, [0, 3, 7, 10]), 'Fm9': (5, [0, 3, 7, 10, 14]),
    'Bbm': (10, [0, 3, 7]), 'Bbm7': (10, [0, 3, 7, 10]),
    'Db': (1, [0, 4, 7]), 'Dbmaj7': (1, [0, 4, 7, 11]),
    'Eb': (3, [0, 4, 7]), 'Eb7': (3, [0, 4, 7, 10]),
    'Ab': (8, [0, 4, 7]), 'Abmaj7': (8, [0, 4, 7, 11]),
    'Cm': (0, [0, 3, 7]), 'Cm7': (0, [0, 3, 7, 10]), 'C7': (0, [0, 4, 7, 10]),
    'Gm7': (7, [0, 3, 7, 10]), 'Edim': (4, [0, 3, 6]),
    'Bm': (11, [0, 3, 7]), 'Bm7': (11, [0, 3, 7, 10]),
    'Em': (4, [0, 3, 7]), 'Em7': (4, [0, 3, 7, 10]),
    'D': (2, [0, 4, 7]), 'Dmaj7': (2, [0, 4, 7, 11]),
    'A': (9, [0, 4, 7]), 'A7': (9, [0, 4, 7, 10]),
    'G': (7, [0, 4, 7]), 'F': (5, [0, 4, 7]),
    'Dbm': (1, [0, 3, 7]), 'Gb': (6, [0, 4, 7]), 'Gbm': (6, [0, 3, 7]),
    'B': (11, [0, 4, 7]), 'Dm': (2, [0, 3, 7]), 'Gm': (7, [0, 3, 7]),
    'Ab': (8, [0, 4, 7]), 'Ebm': (3, [0, 3, 7]),
}

# ---- 原曲逐半小节真实和声（tools/build/_kaguya_harm2.py 从琶音层 ch5/ch12 提取）----
HARM = json.load(open(os.path.join(ROOT, 'tools', 'build', '_kaguya_harm2.json'), encoding='utf-8'))


def prog_for(src_b0, n, default_loop):
    """取 n 小节的和声，返回 [(前半小节和弦, 后半小节和弦), …]。

    src_b0 是「原曲小节号」，琶音层缺席的小节用段落默认进行补。"""
    out = []
    for i in range(n):
        b = src_b0 + i
        d = default_loop[i % len(default_loop)]
        a = HARM.get('%d-0' % b) or d
        c = HARM.get('%d-1' % b) or d
        if a not in CHORDS:
            a = d
        if c not in CHORDS:
            c = d
        out.append((a, c))
    return out


# 段落默认进行（琶音层没写和弦的地方用）
LOOP_FM = ['Db', 'Eb', 'Cm', 'Bbm']       # A/E 段：F 小调的 VI-VII-v-iv
LOOP_BR = ['Fm', 'Eb', 'Db', 'C7']        # B 连接段：i-VII-VI-V
LOOP_BBM = ['Bbm', 'Eb', 'Ab', 'Db']      # C 段：降 B 小调
LOOP_BM = ['Bm', 'Em', 'D', 'A']          # D 段：B 小调

PROG_A = prog_for(16, 14, LOOP_FM)
PROG_B = prog_for(30, 14, LOOP_BR)
PROG_C = prog_for(45, 20, LOOP_BBM)
PROG_D = prog_for(65, 14, LOOP_BM)
PROG_E = PROG_A


# ---------------------------------------------------------------- 乐谱
class Score:
    def __init__(self):
        self.tracks = {
            'lead': {'wave': 'square', 'gain': 0.15, 'notes': []},
            'wind': {'wave': 'sawtooth', 'gain': 0.058, 'notes': []},
            'bass': {'wave': 'triangle', 'gain': 0.17, 'notes': []},
            'pad':  {'wave': 'sine', 'gain': 0.052, 'notes': []},
        }
        self.drums = []
        self.duration = round(BARS * BAR, 4)

    def add(self, trk, bar, step, midi, steps, vel):
        t = bar * BAR + step * STEP
        if t >= self.duration - 1e-6 or not (12 <= midi <= 120):
            return
        d = min(steps * STEP, self.duration - t)
        vel = max(1, min(127, int(vel)))
        self.tracks[trk]['notes'].append([round(t, 4), int(midi), round(d, 4), vel])

    def drum(self, bar, step, kind, vel):
        t = bar * BAR + step * STEP
        if t < self.duration - 1e-6:
            self.drums.append([round(t, 4), kind, int(vel)])

    def finish(self):
        for tr in self.tracks.values():
            ns = sorted(tr['notes'], key=lambda n: (n[0], -n[1]))
            out = []
            for n in ns:
                if out and abs(n[0] - out[-1][0]) < 1e-6:
                    if n[1] > out[-1][1]:
                        out[-1] = n
                    continue
                if out:
                    gap = n[0] - out[-1][0]
                    if out[-1][2] > gap - 0.01:
                        out[-1][2] = round(max(gap * 0.97, 0.03), 4)
                out.append(n)
            tr['notes'] = out
        self.drums.sort(key=lambda d: d[0])


S = Score()


# ---------------------------------------------------------------- 声部写法
def mel(trk, seq, bar0, transpose=0, dur_scale=0.95, vel=118, accent=5, max_pitch=105):
    for (rb, si, m, ls) in seq:
        mm = m + transpose
        if mm > max_pitch:
            mm = m if m <= max_pitch else max_pitch
        d = max(1, round(ls * dur_scale))
        v = vel + (accent if si % 4 == 0 else 0)
        S.add(trk, bar0 + rb, si, mm, d, v)


BASS_PATTERNS = {
    'drive': [(0, 0), (2, 0), (4, 7), (6, 0), (8, 0), (10, 0), (12, 12), (14, 7)],
    'push8': [(0, 0), (2, 0), (4, 7), (6, 0), (8, 0), (10, 7), (12, 12), (14, 0), (15, 7)],
    'half':  [(0, 0), (8, 0), (12, 7)],
    'roll':  [(0, 0), (3, 0), (6, 7), (8, 0), (11, 0), (14, 0)],
    'outro': [(0, 0), (8, 0)],
}


def bass(bar, chord, pattern='drive', vel=104, base=36, step0=0, step1=16):
    root = CHORDS[chord][0] + base
    for (si, iv) in BASS_PATTERNS[pattern]:
        if step0 <= si < step1:
            S.add('bass', bar, si, root + iv, 2, vel)


def wind_arp(bar, chord, base=60, vel=56, sub=2, dur=None, step0=0, step1=16):
    """月光的琶音：和弦音上下翻滚。sub=2 为八分，1 为十六分。"""
    root, tpl = CHORDS[chord]
    scale = []
    for i in range(2):
        for t in tpl:
            v = base + root + 12 * i + t
            if v < base + root + 26:
                scale.append(v)
    if not scale:
        return
    seq = scale + scale[1:-1][::-1]
    _d = dur if dur else sub
    for si in range(step0, step1, sub):
        m = seq[(si // sub) % len(seq)]
        S.add('wind', bar, si, m, _d, vel + (7 if si % 4 == 0 else 0))


def wind_stab(bar, chord, base=60, vel=56, steps=(2, 6, 10, 14)):
    root, tpl = CHORDS[chord]
    for si in steps:
        S.add('wind', bar, si, base + root + tpl[(si // 4) % len(tpl)], 2, vel)


def wind_run(bar, chord, base=72, vel=62):
    root, tpl = CHORDS[chord]
    notes = [base + root + iv for iv in (19, 15, 12, 10, 7, 3, 0, -2)]
    for i, m in enumerate(notes):
        S.add('wind', bar, i * 2, m, 2, vel + i)


def pad_half(bar, chord, step0=0, steps=8, vel=44, base=60):
    """半小节长音铺底：只铺根音 / 五度 / 八度，避免与旋律撞半音。"""
    root, tpl = CHORDS[chord]
    fifth = root + (tpl[2] if len(tpl) > 2 else 7)
    m = [root, fifth, root + 12][step0 % 3]
    S.add('pad', bar, step0, base + m, steps, vel)


def pad_long(bar, chord, vel=46, base=60):
    pad_half(bar, chord, 0, 16, vel, base)


def harm_bar(b, pair, pat='drive', bvel=104, pvel=44, arp=False, arpvel=54,
             arpbase=60, arpsub=2, arp_until=16):
    """一小节两拍一换和声：贝斯 / 铺底 / 风轮都各弹前半个小节和后半个小节。"""
    c1, c2 = pair
    bass(b, c1, pat, bvel, step0=0, step1=8)
    bass(b, c2, pat, bvel, step0=8, step1=16)
    pad_half(b, c1, 0, 8, pvel)
    pad_half(b, c2, 8, 8, pvel)
    if arp:
        wind_arp(b, c1, base=arpbase, vel=arpvel, sub=arpsub, step0=0, step1=min(8, arp_until))
        if arp_until > 8:
            wind_arp(b, c2, base=arpbase, vel=arpvel, sub=arpsub, step0=8, step1=arp_until)


# ---------------------------------------------------------------- 鼓组
def drums_intro(b0, n=8):
    for i in range(n):
        b = b0 + i
        if i < 2:
            S.drum(b, 0, 0, 108)
            S.drum(b, 8, 0, 92)
        else:
            for s in (0, 4, 8, 12):
                S.drum(b, s, 0, 114 if s % 8 == 0 else 106)
            for s in (4, 12):
                S.drum(b, s, 1, 88)
            for s in range(0, 16, 2):
                S.drum(b, s, 2, 30 + (6 if s % 4 == 0 else 0))
        if i >= n - 2:
            for s in range(0, 16, 2):
                S.drum(b, s, 1, 60 + s * 3)
    S.drum(b0, 0, 4, 92)


def drums_full(b0, n, crash_every=4, hat16=False, build=False, snare_vel=100):
    for i in range(n):
        b = b0 + i
        for s in (0, 4, 8, 12):
            S.drum(b, s, 0, 120 if s % 8 == 0 else 110)
        for s in (4, 12):
            S.drum(b, s, 1, snare_vel)
        for s in (range(16) if hat16 else range(0, 16, 2)):
            S.drum(b, s, 2, 30 if s % 2 else 38)
        S.drum(b, 14, 3, 44)
        if i % crash_every == 0:
            S.drum(b, 0, 4, 104)
        if build and i >= n - 2:
            for s in range(16):
                S.drum(b, s, 1, 54 + s * 3)


def drums_half(b0, n, crash_every=4):
    for i in range(n):
        b = b0 + i
        S.drum(b, 0, 0, 112)
        S.drum(b, 8, 0, 104)
        S.drum(b, 4, 1, 88)
        S.drum(b, 12, 1, 92)
        for s in range(0, 16, 2):
            S.drum(b, s, 2, 30)
        S.drum(b, 14, 3, 40)
        if i % crash_every == 0:
            S.drum(b, 0, 4, 96)


def drums_drive(b0, n, hat16=True, crash_every=4):
    """飞升段：四踩 + 十六分踩镲 + 开镲在反拍。"""
    for i in range(n):
        b = b0 + i
        for s in (0, 4, 8, 12):
            S.drum(b, s, 0, 122 if s % 8 == 0 else 114)
        for s in (4, 12):
            S.drum(b, s, 1, 104)
        for s in (range(16) if hat16 else range(0, 16, 2)):
            S.drum(b, s, 2, 40 if s % 2 else 48)
        for s in (3, 7, 11, 15):
            S.drum(b, s, 3, 46)
        if i % crash_every == 0:
            S.drum(b, 0, 4, 108)


def drums_outro(b0, n=8):
    for i in range(n):
        b = b0 + i
        if i < 6:
            S.drum(b, 0, 0, 104 - i * 6)
            if i < 4:
                S.drum(b, 8, 0, 88 - i * 6)
        if i >= 6:
            for s in range(0, 16, 2):
                S.drum(b, s, 1, 46 + (i - 6) * 6 + s)
    S.drum(b0, 0, 4, 92)


# ---------------------------------------------------------------- 段落
def section_intro(b0=0):
    """月光：十六分琶音跑动 + 太鼓渐强，第 5 小节起贝斯与铺底进入。"""
    for i, m in enumerate([77, 80, 79, 84]):
        S.add('pad', b0 + i * 2, 0, m, 32, 44)
    drums_intro(b0, 8)
    # 原曲开场跑动用锯齿高音复现（风铃 / 月光碎片）
    for (rb, si, m, ls) in INTRO_RUN:
        if rb < 8:
            S.add('wind', b0 + rb, si, m + 12, max(1, ls), 52 if si % 4 else 62)
    for b in range(b0 + 4, b0 + 8):
        bass(b, 'Fm7', 'roll', vel=92)
        pad_long(b, 'Fm7', vel=42)


def section_A(b0=8):
    """招牌主题 A：F 小调 Bb-C-Db-Eb 循环，主旋律原音区连奏。"""
    mel('lead', THEME_A, b0, vel=118, dur_scale=0.96)
    for i, pair in enumerate(PROG_A):
        harm_bar(b0 + i, pair, 'drive', bvel=104, pvel=46, arp=True, arpvel=54, arpbase=60)
    # 主题的月光叠奏（+12，压在下面不抢）
    for (rb, si, m, ls) in THEME_A:
        if rb < 6:
            S.add('wind', b0 + rb, si, m + 12, max(1, round(ls * 0.5)), 46)
    drums_full(b0, 14, crash_every=4)
    for s in range(16):
        S.drum(b0 + 13, s, 1, 58 + s * 3)


def section_B(b0=22):
    """连接段：半拍律动，留白多，八分下行句。"""
    mel('lead', BRIDGE, b0, vel=112, dur_scale=0.95)
    for i, pair in enumerate(PROG_B):
        harm_bar(b0 + i, pair, 'half' if i % 4 < 2 else 'drive', bvel=98, pvel=44)
    for b in range(b0, b0 + 12):
        c1, c2 = PROG_B[b - b0]
        wind_stab(b, c1, base=60, vel=48, steps=(2, 6))
        wind_stab(b, c2, base=60, vel=48, steps=(10, 14))
    wind_run(b0 + 12, PROG_B[12][0], base=72, vel=56)
    wind_run(b0 + 13, PROG_B[13][0], base=72, vel=60)
    drums_half(b0, 14)
    for s in range(16):
        S.drum(b0 + 13, s, 1, 56 + s * 3)


def section_C(b0=36):
    """第二主题：高贵舒展，全奏推进。"""
    mel('lead', THEME_B, b0, vel=116, dur_scale=0.98)
    for i, pair in enumerate(PROG_C):
        harm_bar(b0 + i, pair, 'push8', bvel=106, pvel=48, arp=True, arpvel=50,
                 arpbase=60, arpsub=2 if i % 4 < 2 else 4)
    # 高八度叠奏：只在第 4 小节起出现，像月面反光
    for (rb, si, m, ls) in THEME_B:
        if rb >= 8 and rb < 16:
            mm = m + 12 if m + 12 <= 104 else m
            S.add('wind', b0 + rb, si, mm, max(1, round(ls * 0.5)), 44)
    drums_full(b0, 20, crash_every=4, hat16=True)
    for s in range(16):
        S.drum(b0 + 19, s, 1, 58 + s * 3)


def section_D(b0=56):
    """飞升段：原曲转 B 小调，全部抬起来（低音抽空 + 高频加重）。"""
    mel('lead', THEME_D, b0, vel=122, dur_scale=0.98)
    for i, pair in enumerate(PROG_D):
        harm_bar(b0 + i, pair, 'drive', bvel=110, pvel=50, arp=True, arpvel=58, arpbase=64)
    for (rb, si, m, ls) in THEME_D:
        if si % 4 == 0:
            S.add('wind', b0 + rb, si, m + 12 if m + 12 <= 104 else m, 2, 46)
    drums_drive(b0, 12, hat16=True, crash_every=4)
    # 最后两小节：鼓抽掉，军鼓滚奏接终段
    for s in range(16):
        S.drum(b0 + 12, s, 1, 60 + s * 3)
        S.drum(b0 + 13, s, 1, 68 + s * 3)


def section_E(b0=70):
    """终段：主题高八度总再现，全曲最高点。"""
    mel('lead', THEME_A, b0, transpose=12, vel=124, dur_scale=0.98, max_pitch=105)
    for i, pair in enumerate(PROG_E):
        harm_bar(b0 + i, pair, 'push8', bvel=112, pvel=52, arp=True, arpvel=54, arpbase=60)
    for (rb, si, m, ls) in THEME_A:
        mm = m + 12 if m + 12 <= 104 else m
        S.add('wind', b0 + rb, si, mm, max(1, round(ls * 0.5)), 48)
    drums_drive(b0, 14, hat16=True, crash_every=4)


def section_outro(b0=84):
    """尾奏：主题尾巴 + 月光散开。"""
    mel('lead', OUTRO_TAIL, b0, vel=104, dur_scale=1.0)
    for i, m in enumerate([77, 72, 65, 60]):
        S.add('pad', b0 + i * 2, 0, m, 32, 42)
    for b in range(b0, b0 + 6):
        bass(b, 'Fm7', 'outro', vel=88)
    drums_outro(b0, 8)
    for b in range(b0 + 2, b0 + 8):
        wind_arp(b, 'Fm7', base=60, vel=34, sub=4)


# ---------------------------------------------------------------- 自检
def check(verbose=True):
    errors = []
    tmax = S.duration + 1e-6
    for key, tr in S.tracks.items():
        ns = tr['notes']
        if not ns:
            errors.append('%s 无音符' % key)
            continue
        prev = -1
        for (t, m, d, v) in ns:
            if t < -1e-9 or t >= tmax:
                errors.append('%s 时间越界 %.3f' % (key, t))
            if not (12 <= m <= 120):
                errors.append('%s midi 越界 %d' % (key, m))
            if not (0 < d <= 8):
                errors.append('%s 时值越界 %.3f' % (key, d))
            if not (1 <= v <= 127):
                errors.append('%s 力度越界 %d' % (key, v))
            if t < prev - 1e-6:
                errors.append('%s 未排序 %.3f < %.3f' % (key, t, prev))
            prev = t
    for (t, k, v) in S.drums:
        if not (0 <= k <= 4):
            errors.append('鼓 kind 越界 %d' % k)
        if t >= tmax:
            errors.append('鼓时间越界 %.3f' % t)
    # 同刻复音数
    events = []
    for tr in S.tracks.values():
        for (t, m, d, v) in tr['notes']:
            events.append((t, 1))
            events.append((round(t + d, 4), -1))
    events.sort()
    cur = mx = 0
    for _, dd in events:
        cur += dd
        mx = max(mx, cur)
    if mx > 4:
        errors.append('最大同时发声 %d > 4' % mx)

    if verbose:
        print('duration %.2fs  bpm %.1f  bars %d' % (S.duration, BPM, BARS))
        for key, tr in S.tracks.items():
            ns = tr['notes']
            ms = [n[1] for n in ns]
            print('  %-5s %-9s gain %.3f  %4d 音  音域 %s-%s  最大复音 %d'
                  % (key, tr['wave'], tr['gain'], len(ns), nm(min(ms)), nm(max(ms)), mx))
        print('  鼓 %d 击' % len(S.drums))
        print('  错误 %d' % len(errors))
        for e in errors[:10]:
            print('   !', e)
    return errors


# ---------------------------------------------------------------- 输出
def fmt(x):
    s = ('%.4f' % x).rstrip('0').rstrip('.')
    return s if s else '0'


def write_js(path):
    L = []
    L.append('// 6 面 Boss：竹取飛翔 ～ Lunatic Princess —— 蓬莱山辉夜重编曲')
    L.append('// 由 tools/kaguya_stage6.py 生成，请勿手改；旋律取自原曲 MIDI（ZUN）')
    L.append('// lead=square 主旋律 / wind=sawtooth 月光琶音 / bass=triangle / pad=sine 铺底')
    L.append('export const KAGUYA_STAGE6 = {')
    L.append('  stage6: {')
    L.append("    title: '竹取飛翔 ～ Lunatic Princess',")
    L.append('    duration: %s,' % fmt(S.duration))
    L.append('    bpm: %d,' % int(round(BPM)))
    L.append('    tracks: [')
    for key in ('lead', 'wind', 'bass', 'pad'):
        tr = S.tracks[key]
        L.append("      { wave: '%s', gain: %s, notes: [" % (tr['wave'], fmt(tr['gain'])))
        ns = tr['notes']
        for i in range(0, len(ns), 4):
            chunk = ns[i:i + 4]
            L.append('        ' + ', '.join('[%s,%d,%s,%d]' % (fmt(t), m, fmt(d), v)
                                            for (t, m, d, v) in chunk) + ',')
        L.append('      ] },')
    L.append('    ],')
    L.append('    drums: [')
    for i in range(0, len(S.drums), 6):
        chunk = S.drums[i:i + 6]
        L.append('      ' + ', '.join('[%s,%d,%d]' % (fmt(t), k, v) for (t, k, v) in chunk) + ',')
    L.append('    ],')
    L.append('  },')
    L.append('};')
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(L) + '\n')


section_intro(0)
section_A(8)
section_B(22)
section_C(36)
section_D(56)
section_E(70)
section_outro(84)

S.finish()
errs = check(verbose=True)

# 导出 JSON 供分析脚本（tools/build/_kaguya_check.py）读取
json.dump({'duration': S.duration, 'bpm': BPM, 'tracks': S.tracks, 'drums': S.drums},
          open(os.path.join(ROOT, 'tools', 'build', '_kaguya_song.json'), 'w', encoding='utf-8'),
          ensure_ascii=False)

if '--check' not in sys.argv:
    write_js(OUT_JS)
    print('写出', OUT_JS)
if errs:
    sys.exit(1)
