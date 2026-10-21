#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/aya_stage4.py —— 4 面 Boss「風神少女」重编曲：射命丸文版

旋律全部取自原曲 MIDI（tools/build/_aya_score.json，量化到 16 分网格），
配器 / 律动 / 鼓组 / 曲式按「天狗记者 · 山风 · 号外」的气质重写：

  lead  square    主旋律（原曲主题，断奏；终段高八度）
  wind  sawtooth  16 分「风轮」琶音 / 转调段高八度尖啸 —— 风的质感
  bass  triangle  八分驱动的引擎式贝斯，根音 + 五度 + 八度跳
  pad   sine      长音铺底 / 前奏口哨风声

曲式（168 BPM，F 小调；D 段按原曲整段转 F# 小调再转回）：
  intro 8 + A1 16 + B 16 + C 16 + D 16 + E 16 + outro 8 = 96 小节 ≈ 137.1s

素材对应原曲 MIDI（★ 主旋律在 ch1，ch0 是后段的第二主题）：
  intro          : ch0 bar 1-4   （开场的快速琶音动机）
  A / E 段       : ch1 bar 13-20 + 21-27 （招牌主题 A + 应答 A'）
  B 段           : ch1 bar 29-43 （第二主题）
  C 段           : ch1 bar 52-67 （主题再现）
  D 段           : ch1 bar 84-99 （原曲转调段，F# 小调）

用法：
    python tools/aya_stage4.py            # 生成 src/engine/songs/aya_stage4.js
    python tools/aya_stage4.py --check    # 只自检不写文件
"""

import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCORE = os.path.join(ROOT, 'tools', 'build', '_aya_score.json')
_SUF = '_v2' if os.environ.get('AYA_V', '1') == '2' else ('_fb' if os.environ.get('AYA_NOLIFT') else '')
if os.environ.get('AYA_FUSION'):
    _SUF += '_mix'
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'aya_stage4' + _SUF + '.js')

# D 段抬调量：default 3（F#m→Am）；AYA_NOLIFT=1 时不抬，和游戏内原曲同调
LIFT = 0 if os.environ.get('AYA_NOLIFT') else 3

V2 = os.environ.get('AYA_V', '1') == '2'   # V2：采纳 ref-analyst 的蓝图手法

BPM = 154.0   # 与原曲《風神少女》完全一致，音符时值不再被加速
BAR = 240.0 / BPM
STEP = BAR / 16.0
BARS = 100

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


# ★ 主旋律在 ch1（铜管层），不是 ch0。ch0 后半段才进第二主题，
#   之前误用 ch0 28-43，听起来「主旋律丢了」；ch1 13-27 才是 refA 一开口的招牌主题。
HEAD_A = phrase(1, 13, 21)     # 招牌主题 A（8 小节：F4 F4 G#4 C5 | F4 G#4 C5 A#4 G4 D#4 …）
HEAD_A2 = phrase(1, 21, 29)    # 应答 A'（8 小节，末小节接下一段引子）
THEME_B = phrase(1, 29, 37)    # 第二主题（8 小节）
THEME_B2 = phrase(1, 37, 45)   # 第二主题后半（8 小节，收到 F5 长音）
THEME_C = phrase(1, 52, 60)    # 主题再现（8 小节）
THEME_C2 = phrase(1, 60, 68)   # 应答再现（8 小节）
FS_THEME = phrase(1, 84, 100)  # 原曲转调段（F# 小调）
RIFF = phrase(0, 1, 5)         # 开场快速琶音动机（4 小节）
RIFF_B = phrase(6, 9, 13)      # 管风琴层的琶音（作风声叠奏）

# ---------------------------------------------------------------- 和声
CHORDS = {
    'Fm':   (5,  [0, 3, 7]),
    'Fm7':  (5,  [0, 3, 7, 10]),
    'Fm9':  (5,  [0, 3, 7, 10, 14]),
    'Bbm':  (10, [0, 3, 7]),
    'Bbm7': (10, [0, 3, 7, 10]),
    'Db':   (1,  [0, 4, 7]),
    'Dbmaj7': (1, [0, 4, 7, 11]),
    'Db7':  (1,  [0, 4, 7, 10]),
    'Eb':   (3,  [0, 4, 7]),
    'Eb7':  (3,  [0, 4, 7, 10]),
    'Ab':   (8,  [0, 4, 7]),
    'Abmaj7': (8, [0, 4, 7, 11]),
    'C7':   (0,  [0, 4, 7, 10]),
    'Cm7':  (0,  [0, 3, 7, 10]),
    'Gm7b5': (7, [0, 3, 6, 10]),
    'F#m':  (6,  [0, 3, 7]),
    'F#m7': (6,  [0, 3, 7, 10]),
    'D':    (2,  [0, 4, 7]),
    'Dmaj7': (2, [0, 4, 7, 11]),
    'C#m7': (1,  [0, 3, 7, 10]),
    'C#7':  (1,  [0, 4, 7, 10]),
    'E':    (4,  [0, 4, 7]),
    'Bm7':  (11, [0, 3, 7, 10]),
    'Am':   (9,  [0, 3, 7]),
    'Am7':  (9,  [0, 3, 7, 10]),
    'C':    (0,  [0, 4, 7]),
    'G':    (7,  [0, 4, 7]),
    'F':    (5,  [0, 4, 7]),
    'Bb':   (10, [0, 4, 7]),     # 原曲 bar39（A#M）
    'Edim': (4,  [0, 3, 6]),     # 原曲 bar27/40/67（E G A#）
    'Dm':   (2,  [0, 3, 7]),     # 原曲 bar15/19/55/59（D F A）
}

# ---- 原曲逐小节真实和声（由 ch11 和弦铺底按三和弦拟合）----
# A/E 段 = MIDI bar 13-28：Fm Eb Dm Dm | Fm Eb Dm Fm | Db Eb Fm Fm | Db Eb Edim Fm
PROG_A = ['Fm', 'Eb', 'Dm', 'Dm', 'Fm', 'Eb', 'Dm', 'Fm',
          'Db', 'Eb', 'Fm', 'Fm', 'Db', 'Eb', 'Edim', 'Fm']
# B 段 = bar 29-44：Db Eb Fm Fm | Db Eb Fm Db | Db Eb Bb Edim | Db Eb Fm Fm
PROG_B = ['Db', 'Eb', 'Fm', 'Fm', 'Db', 'Eb', 'Fm', 'Db',
          'Db', 'Eb', 'Bb', 'Edim', 'Db', 'Eb', 'Fm', 'Fm']
# C 段 = bar 52-67：Fm Fm Eb Dm | Dm Fm Eb Dm | Fm Db Eb Fm | Fm Db Eb Edim
PROG_C = ['Fm', 'Fm', 'Eb', 'Dm', 'Dm', 'Fm', 'Eb', 'Dm',
          'Fm', 'Db', 'Eb', 'Fm', 'Fm', 'Db', 'Eb', 'Edim']
# D 段 = bar 84-99（原曲转调段，F# 小调）：F#m7 D E F#m 循环
PROG_D = ['F#m7', 'D', 'E', 'F#m', 'F#m', 'D', 'E', 'F#m',
          'F#m', 'D', 'E', 'F#m', 'F#m7', 'D', 'E', 'F#m']
# D 段实际演奏用「上移大三度」版本（F#m7 D E F#m → Am7 F G Am），
# 这是原曲与四首参考共有的「副歌起飞」手法
PROG_DA = ['Am7', 'F', 'G', 'Am', 'Am', 'F', 'G', 'Am',
           'Am', 'F', 'G', 'Am', 'Am7', 'F', 'G', 'Am']

FM_PALETTE = ['Fm7', 'Fm', 'Bbm7', 'Bbm', 'Db', 'Dbmaj7', 'Eb', 'Eb7',
              'Ab', 'Abmaj7', 'C7', 'Cm7', 'Gm7b5']
FSM_PALETTE = ['F#m7', 'F#m', 'D', 'Dmaj7', 'C#m7', 'C#7', 'E', 'Bm7']

# refE/D/F 互证的 i–III–VII–VI 循环（每和弦 4 小节）
# ---- 原曲每小节的真实和声（取自 ch11 和弦铺底 + ch10 贝斯根音）----
def _bar_harmony(bar):
    """返回 (根音音级, 音程集合) ；ch11 有和弦就用它，否则退到 ch10 的音级。"""
    b11 = [m for bb, si, m, ls, v in CH.get(11, []) if bb == bar]
    b10 = [m for bb, si, m, ls, v in CH.get(10, []) if bb == bar]
    if b10:
        root = b10[0] % 12
    elif b11:
        root = b11[0] % 12
    else:
        return None
    pcs = b11 if b11 else b10
    ivs = sorted({(m - root) % 12 for m in pcs})
    if 0 not in ivs:
        ivs = [0] + ivs
    ivs = [0] + [i for i in ivs if i != 0][:3]
    return (root, ivs)


BAR_CH = {}
for _b in range(0, 240):
    _h = _bar_harmony(_b)
    if _h:
        BAR_CH[_b] = _h
        CHORDS['B%d' % _b] = _h


def _near(b):
    """离 b 最近的有和声的小节。"""
    for d in range(0, 12):
        for c in (b - d, b + d):
            if c in BAR_CH:
                return c
    return min(BAR_CH)


def ch(b0, n):
    """一小段小节的真实和弦名。"""
    return ['B%d' % _near(b0 + i) for i in range(n)]


LOOP_FM = ['Fm', 'Ab', 'Eb', 'Db'] * 4
LOOP_AM = ['Am', 'C', 'G', 'F'] * 4


def harmonize(notes, palette, nbars, seed='Fm7'):
    """每 2 小节按旋律音覆盖率挑和弦；同分保持上一个和弦，整体更平滑。"""
    out = []
    prev = seed
    for w in range(0, nbars, 2):
        seg = [m for (rb, si, m, ls) in notes if w <= rb < w + 2]
        if not seg:
            out.extend([prev, prev]); continue
        best, bs = prev, -1e9
        for c in palette:
            root, tpl = CHORDS[c]
            s = 0.0
            for m in seg:
                iv = (m - root) % 12
                if iv in tpl:
                    s += 1.0
                elif iv in [(t + 1) % 12 for t in tpl] or iv in [(t - 1) % 12 for t in tpl]:
                    s += 0.1
                else:
                    s -= 0.4
            s /= len(seg)
            if c == prev:
                s += 0.12
            if s > bs + 1e-9:
                best, bs = c, s
        out.extend([best, best])
        prev = best
    return out[:nbars]


# ---------------------------------------------------------------- 乐谱
class Score:
    def __init__(self):
        self.tracks = {
            'lead': {'wave': 'square', 'gain': 0.15, 'notes': []},
            'wind': {'wave': 'sawtooth', 'gain': 0.055, 'notes': []},
            'bass': {'wave': 'triangle', 'gain': 0.175, 'notes': []},
            'pad':  {'wave': 'sine', 'gain': 0.055, 'notes': []},
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
        """每轨强制单声部：同一时刻留最高音，后音提前截断前音。"""
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


# ---------------------------------------------------------------- 各声部写法
def mel(trk, seq, bar0, transpose=0, dur_scale=0.8, vel=118, accent=6, max_pitch=104):
    for (rb, si, m, ls) in seq:
        mm = m + transpose
        if mm > max_pitch:
            mm = m
        if mm + 12 <= max_pitch and transpose > 0 and m + transpose > max_pitch:
            mm = m + 12 if m + 12 <= max_pitch else m
        d = max(1, round(ls * dur_scale))
        v = vel + (accent if si % 4 == 0 else 0)
        S.add(trk, bar0 + rb, si, mm, d, v)


BASS_PATTERNS = {
    'drive': [(0, 0), (2, 0), (4, 7), (6, 0), (8, 0), (10, 0), (12, 12), (14, 7)],
    'roll':  [(0, 0), (3, 0), (6, 7), (8, 0), (11, 0), (14, 0)],
    'verse': [(0, 0), (4, 0), (6, 7), (8, 0), (12, 7), (14, 0)],
    'half':  [(0, 0), (8, 0), (12, 7)],
    'push':  [(i, [0, 0, 7, 0, 0, 0, 7, 12, 0, 0, 7, 0, 0, 12, 7, 0][i])
              for i in range(16)],
    'push8': [(0, 0), (2, 0), (4, 7), (6, 0), (8, 0), (10, 7), (12, 12), (14, 0), (15, 7)],
    'outro': [(0, 0), (8, 0)],
}


def bass(bar, chord, pattern='drive', vel=104, base=36):
    root = CHORDS[chord][0] + base
    for (si, iv) in BASS_PATTERNS[pattern]:
        S.add('bass', bar, si, root + iv, 2, vel)


def wind_arp(bar, chord, base=60, vel=60, sub=1, dur=1):
    """风轮：和弦音上下翻滚的琶音。sub=1 为 16 分，2 为 8 分。"""
    root, tpl = CHORDS[chord]
    scale = []
    for i in range(2):
        for t in tpl:
            v = base + root + 12 * i + t
            if v < base + root + 24:
                scale.append(v)
    if not scale:
        return
    seq = scale + scale[1:-1][::-1]
    for si in range(0, 16, sub):
        m = seq[(si // sub) % len(seq)]
        S.add('wind', bar, si, m, dur * sub, vel + (6 if si % 4 == 0 else 0))


def wind_stab(bar, chord, base=60, vel=58):
    root, tpl = CHORDS[chord]
    for si in (2, 6, 10, 14):
        S.add('wind', bar, si, base + root + tpl[(si // 4) % len(tpl)], 2, vel)


def wind_run(bar, chord, base=72, vel=64):
    """下行风嗓：一小节从高到低扫下来。"""
    root, tpl = CHORDS[chord]
    notes = [base + root + iv for iv in (19, 15, 12, 10, 7, 3, 0, -2)]
    for i, m in enumerate(notes):
        S.add('wind', bar, i * 2, m, 2, vel + i)


def pad_long(bar, chord, vel=44, bars=1, base=60):
    """长音铺底：根音 / 五度 / 八度轮换，必须落在和弦音上（base+root 为基准）。"""
    root, tpl = CHORDS[chord]
    fifth = root + (tpl[2] if len(tpl) > 2 else 7)
    m = [root, fifth, root + 12][bar % 3]
    S.add('pad', bar, 0, base + m, 16 * bars, vel)


# ---------------------------------------------------------------- 鼓组
def drums_intro(b0):
    for i in range(8):
        b = b0 + i
        if i < 2:
            S.drum(b, 0, 0, 112); S.drum(b, 8, 0, 94)
        elif i < 4:
            for s in (0, 4, 8, 12):
                S.drum(b, s, 0, 108)
        else:
            for s in (0, 4, 8, 12):
                S.drum(b, s, 0, 114)
            for s in (4, 12):
                S.drum(b, s, 1, 90)
        if i >= 3:
            for s in range(16):
                S.drum(b, s, 2, 32 + (6 if s % 4 == 0 else 0))
    S.drum(b0, 0, 4, 96)
    for b in (b0 + 6, b0 + 7):
        for s in range(16):
            S.drum(b, s, 1, 54 + s * 3)


def drums_full(b0, n, crash_every=8, build=False, hat16=True):
    for i in range(n):
        b = b0 + i
        for s in (0, 4, 8, 12):
            S.drum(b, s, 0, 118 if s % 8 == 0 else 108)
        for s in (4, 12):
            S.drum(b, s, 1, 96)
        for s in (range(16) if hat16 else range(0, 16, 2)):
            S.drum(b, s, 2, 30 if s % 2 else 38)
        S.drum(b, 6, 3, 38)
        S.drum(b, 14, 3, 44)
        if i % crash_every == 0:
            S.drum(b, 0, 4, 102)
        if build and i >= n - 4:
            for s in range(0, 16, 2):
                S.drum(b, s, 1, 68 + (i - (n - 4)) * 10)


def drums_half(b0, n):
    for i in range(n):
        b = b0 + i
        S.drum(b, 0, 0, 112)
        S.drum(b, 8, 0, 104)
        S.drum(b, 4, 1, 92)
        S.drum(b, 12, 1, 92)
        for s in range(0, 16, 2):
            S.drum(b, s, 2, 32)
        if i % 8 == 0:
            S.drum(b, 0, 4, 92)


def drums_drive(b0, n, hat16=True):
    """转调段：四踩 + 开镲。hat16=False 时踩镲走 8 分，避免后半段发赶。"""
    for i in range(n):
        b = b0 + i
        for s in (0, 4, 8, 12):
            S.drum(b, s, 0, 120 if s % 8 == 0 else 112)
        for s in (4, 12):
            S.drum(b, s, 1, 102)
        for s in (range(16) if hat16 else range(0, 16, 2)):
            S.drum(b, s, 2, 40 if s % 2 else 48)
        hat_steps = (3, 7, 11, 15) if V2 else (2, 6, 10, 14)
        for s in hat_steps:
            S.drum(b, s, 3, 46)
        if i % 8 == 0:
            S.drum(b, 0, 4, 106)


# ---------------------------------------------------------------- 段落
def section_intro(b0=0):
    """风声口哨 + 太鼓渐强，第 5 小节起跑琶音动机。"""
    for i, m in enumerate([77, 80, 82, 84]):
        S.add('pad', b0 + i * 2, 0, m, 32, 46)
    drums_intro(b0)
    for b in range(b0 + 4, b0 + 8):
        bass(b, 'Fm7', 'roll', vel=94)
        wind_arp(b, 'Fm7', base=60, vel=42 + (b - b0 - 4) * 5, sub=2)
    # 第 5-8 小节：风嗓预告主题动机（原曲开场琶音）
    for (rb, si, m, ls) in RIFF:
        if rb < 2:
            S.add('lead', b0 + 5 + rb, si, m, max(1, round(ls * 0.7)), 96)


def section_A(b0=8):
    """主题 A1 + A2，主旋律高八度。"""
    chords = PROG_A
    mel('lead', HEAD_A, b0, vel=118, dur_scale=0.94)
    mel('lead', HEAD_A2, b0 + 8, vel=120, dur_scale=0.94)
    for i, c in enumerate(chords):
        b = b0 + i
        bass(b, c, 'drive', vel=102)
        pad_long(b, c, bars=1)
        wind_arp(b, c, base=60, vel=54, sub=2)
    # 主题 A1 的风声叠奏（+12 的锯齿＝刮过屋顶的风）
    for (rb, si, m, ls) in HEAD_A:
        S.add('wind', b0 + rb, si, m + 12, max(1, round(ls * 0.5)), 48)
    drums_full(b0, 16, crash_every=8)
    # 第 16 小节过门：军鼓十六分渐强接 B 段
    for s in range(16):
        S.drum(b0 + 15, s, 1, 60 + s * 3)


def section_B(b0=24):
    """主题 B：半拍律动，留白多，风只在句尾出现。"""
    chords = PROG_B
    mel('lead', THEME_B, b0, vel=112, dur_scale=0.94)
    mel('lead', THEME_B2, b0 + 8, vel=114, dur_scale=0.94)
    # 第 16 小节：长音 F5 悬着，鼓铺满
    S.add('lead', b0 + 15, 0, 77, 16, 116)
    for i, c in enumerate(chords):
        b = b0 + i
        bass(b, c, 'verse', vel=96)
        pad_long(b, c, bars=1)
    for b in range(b0, b0 + 12):
        wind_stab(b, chords[b - b0], base=60, vel=50)
    wind_run(b0 + 14, chords[14], base=72, vel=58)
    wind_run(b0 + 15, chords[15], base=72, vel=62)
    drums_half(b0, 16)


def section_C(b0=40):
    """C：主题再现（A 的第二次陈述），全奏推进，末两小节风嗓下行接转调。"""
    prog = PROG_C
    mel('lead', THEME_C, b0, vel=118, dur_scale=1.0)
    mel('lead', THEME_C2, b0 + 8, vel=120, dur_scale=1.0)
    # 主题再现的高八度叠奏（风轮式尖啸，压低不抢）
    for (rb, si, m, ls) in THEME_C:
        mm = m + 12 if m + 12 <= 100 else m
        S.add('wind', b0 + rb, si, mm, max(1, round(ls * 0.5)), 46)
    for i, c in enumerate(prog):
        b = b0 + i
        bass(b, c, 'push8' if i >= 12 else 'drive', vel=105)
        pad_long(b, c, bars=1, base=60)
        if i < 12:
            wind_arp(b, c, base=60, vel=48, sub=2)
    for b in range(b0 + 12, b0 + 14):
        wind_arp(b, prog[b - b0], base=72, vel=46, sub=2)
    wind_run(b0 + 14, prog[14], base=76, vel=66)
    wind_run(b0 + 15, prog[15], base=79, vel=70)
    drums_full(b0, 16, crash_every=8, build=True, hat16=False)


def section_D(b0=56):
    """D：整段上移大三度（F#m 域 → Am 域），原曲和四首参考都在这里「起飞」；
    踩镲加密到 16 分、段末军鼓 16 分加花，节奏不再被旋律甩在后面。"""
    chords = PROG_DA if LIFT else PROG_D
    mel('lead', FS_THEME, b0, transpose=LIFT, vel=123, dur_scale=1.0, max_pitch=104)
    for i, c in enumerate(chords):
        b = b0 + i
        bass(b, c, 'push8', vel=112)
        pad_long(b, c, bars=1)
        if i < 12:
            wind_arp(b, c, base=60, vel=50, sub=2)
    # 风嗓：主题上移三度后再高八度
    for (rb, si, m, ls) in FS_THEME:
        mm = m + LIFT + 12 if m + LIFT + 12 <= 100 else m + LIFT
        S.add('wind', b0 + rb, si, mm, max(1, round(ls * 0.55)), 52)
    drums_drive(b0, 16, hat16=True)
    # 段末加花：16 分军鼓渐强，推回 F 小调的 E 段
    for s in range(16):
        S.drum(b0 + 15, s, 1, 58 + s * 3)


def section_E(b0=72):
    """E：回到 F 小调，主题最后一次全奏（高八度）。"""
    chords = PROG_A
    mel('lead', HEAD_A, b0, transpose=12, vel=121, dur_scale=1.0)
    mel('lead', HEAD_A2, b0 + 8, transpose=12, vel=122, dur_scale=1.0)
    for i, c in enumerate(chords):
        b = b0 + i
        bass(b, c, 'push8', vel=108)
        pad_long(b, c, bars=1)
        wind_arp(b, c, base=60, vel=56, sub=2)
    for (rb, si, m, ls) in HEAD_A:
        S.add('wind', b0 + rb, si, m + 12 if m + 12 <= 100 else m,
              max(1, round(ls * 0.45)), 50)
    drums_full(b0, 16, crash_every=8, hat16=False)


def section_outro(b0=88):
    """outro 12 小节：主题尾巴 → 下行终止 → 主音长音，最后一小节悬进循环。"""
    MEL = [
        (0, 0, 77, 8, 110), (0, 8, 79, 8, 104),      # 88  F5  G5
        (1, 0, 82, 6, 112), (1, 6, 79, 10, 106),     # 89  A#5 G5
        (2, 0, 77, 32, 110),                          # 90-91 F5 长音
        (4, 0, 84, 8, 112), (4, 8, 79, 8, 106),      # 92  C6  G5
        (5, 0, 77, 16, 110),                          # 93  F5
        (6, 0, 75, 8, 104), (6, 8, 72, 8, 100),      # 94  D#5 C5
        (7, 0, 70, 16, 102),                          # 95  A#4
        (8, 0, 67, 8, 98), (8, 8, 65, 8, 96),        # 96  G4  F4
        (9, 0, 65, 32, 100),                          # 97-98 F4 长音
        (11, 0, 65, 16, 96),                          # 99  F4 悬进 intro
    ]
    for (rb, si, m, st, v) in MEL:
        S.add('lead', b0 + rb, si, m, st, v)
    # 和声：Fm7 → Fm，长音一直铺到最后一小节
    PADS = [(0, 4, 'Fm7', 47), (4, 4, 'Fm', 46), (8, 4, 'Fm', 44)]
    for (r0, n, ch, vel) in PADS:
        for i in range(n):
            S.add('pad', b0 + r0 + i, 0, CHORDS[ch][0] + 60, 16, vel)
            S.add('pad', b0 + r0 + i, 0, CHORDS[ch][0] + 72, 16, vel - 6)
    for b in range(b0, b0 + 12):
        bass(b, 'Fm' if b >= b0 + 4 else 'Fm7', 'outro', vel=92)
    # 风：94 小节下行扫过，98-99 一记上扬的长音接回开头
    wind_run(b0 + 6, 'Fm7', base=79, vel=58)
    S.add('wind', b0 + 10, 0, 79, 16, 44)
    S.add('wind', b0 + 11, 0, 82, 16, 40)
    # 鼓：前半轻击，后四小节军鼓滚奏送进循环
    S.drum(b0, 0, 4, 92)
    for b in range(b0, b0 + 8):
        for s in (0, 8):
            S.drum(b, s, 0, 96 if s == 0 else 82)
        S.drum(b, 4, 1, 86)
        S.drum(b, 12, 1, 82)
        for s in range(0, 16, 2):
            S.drum(b, s, 2, 30)
    for b in (b0 + 8, b0 + 9):
        for s in range(16):
            S.drum(b, s, 1, 44 + s * 2)
    for s in range(16):
        S.drum(b0 + 10, s, 1, 42 + s * 1)
    S.drum(b0 + 10, 0, 4, 96)


def fill_lead_gaps(b0=6, b1=88):
    """把小节内旋律覆盖不足的地方用前一个音延住（尽量落在和弦音上），
    避免「段落末尾空一拍 / 句子断掉」的听感。"""
    L = S.tracks['lead']['notes']
    for bar in range(b0, b1):
        t0 = bar * BAR
        t1 = t0 + BAR
        cov = sum(max(0.0, min(t1, n[0] + n[2]) - max(t0, n[0])) for n in L
                  if n[0] < t1 and n[0] + n[2] > t0)
        if cov >= BAR * 0.75:
            continue
        prev = [n for n in L if n[0] < t0 - 1e-4]
        if not prev:
            continue
        p = max(prev, key=lambda n: n[0])
        if t0 - p[0] > 2 * BAR:
            continue
        # 若这个音离和弦音太远，挪到最近的音（优先根音/五度）
        ch = prog_at(bar)
        if ch:
            tones = [(CHORDS[ch][0] + i) % 12 for i in CHORDS[ch][1]]
            root = CHORDS[ch][0] % 12
            if p[1] % 12 not in tones:
                cand = sorted(range(48, 97), key=lambda m: abs(m - p[1]) + (0 if m % 12 == root else 1))
                p[1] = next(m for m in cand if m % 12 in tones)
        p[2] = max(p[2], round(t1 - p[0], 4))


def prog_at(bar):
    """小节 -> 和弦（与各段实际使用的进行一致）。"""
    if bar < 8 or bar >= 88:
        return 'Fm7'
    sec = (bar - 8) // 16
    idx = (bar - 8) % 16
    table = [PROG_A, PROG_B, PROG_C, PROG_D, PROG_A]
    return table[sec][idx] if 0 <= sec < len(table) else 'Fm7'


# ---------------------------------------------------------------- 组装
section_intro(0)
section_A(8)
section_B(24)
section_C(40)
section_D(56)
section_E(72)
section_outro(88)
fill_lead_gaps(6, 88)

# ---------------------------------------------------------------- 融合模式
# AYA_FUSION=1：用游戏内原曲（src/engine/songs/touhou.js BOSS_SONGS.stage4）
# 的副旋律层替代 sine 铺底。引擎上限 4 个旋律声部，所以是「换」不是「加」。
if os.environ.get('AYA_FUSION'):
    _old = json.load(open(os.path.join(ROOT, 'tools', 'build', '_old_stage4.json'), encoding='utf-8'))
    _src = _old['tracks'][2]          # 原曲第三条轨：square 0.05 的副旋律
    _notes = []
    for (_t, _m, _d, _v) in _src['notes']:
        if _t < S.duration - 1e-6:
            _notes.append([round(_t, 4), int(_m), round(min(_d, 2.0), 4), int(_v)])
    S.tracks['pad'] = {'wave': 'square', 'gain': 0.05, 'notes': _notes}
    print('融合模式：pad 换成原曲副旋律 %d 音' % len(_notes))

S.finish()


# ---------------------------------------------------------------- 自检
def check(verbose=True):
    ok = True
    dur = S.duration
    print('时长 %.3fs (%.2f 小节 @ %.1f BPM)' % (dur, BARS, BPM))
    total = 0
    for name, tr in S.tracks.items():
        ns = tr['notes']
        total += len(ns)
        bad = [n for n in ns if n[0] < 0 or n[0] >= dur or not (12 <= n[1] <= 120)
               or not (0 < n[2] <= 8) or not (0 < n[3] <= 127)]
        if bad:
            ok = False
            print('  ✗ %s 非法音符 %d 个，例如 %r' % (name, len(bad), bad[0]))
        overlap = 0
        for i in range(len(ns) - 1):
            if ns[i][0] + ns[i][2] > ns[i + 1][0] + 1e-6:
                overlap += 1
        if overlap:
            ok = False
            print('  ✗ %s 有 %d 处重叠' % (name, overlap))
        lo = min((n[1] for n in ns), default=0)
        hi = max((n[1] for n in ns), default=0)
        print('  %-5s %-9s gain=%.3f 音=%-5d 音域 %s-%s' % (
            name, tr['wave'], tr['gain'], len(ns), nm(lo), nm(hi)))
    evs = []
    for tr in S.tracks.values():
        for n in tr['notes']:
            evs.append((n[0], 1)); evs.append((round(n[0] + n[2], 4), -1))
    evs.sort()
    cur = mx = 0
    for _, dv in evs:
        cur += dv
        mx = max(mx, cur)
    print('  最大同时发声 %d（引擎上限 4）' % mx)
    if mx > 4:
        ok = False
    print('  鼓 %d 个，总音符 %d 个' % (len(S.drums), total))
    return ok


if __name__ == '__main__':
    okk = check()
    if '--check' in sys.argv:
        sys.exit(0 if okk else 1)

    def fmt(x):
        s = ('%.4f' % x).rstrip('0').rstrip('.')
        return s if s else '0'

    def cell(x):
        return fmt(x) if isinstance(x, float) else str(x)

    def notes_js(ns, per=8):
        rows = []
        for i in range(0, len(ns), per):
            rows.append('      ' + ','.join(
                '[' + ','.join(cell(x) for x in n) + ']' for n in ns[i:i + per]))
        return ',\n'.join(rows)

    lines = []
    lines.append('/**')
    lines.append(' * 四面 Boss《風神少女》—— 射命丸文版重编曲（168 BPM / F 小调 / 96 小节循环）。')
    lines.append(' *')
    lines.append(' * 生成器：tools/aya_stage4.py（旋律取自 tools/build/_aya_score.json 的原曲 MIDI）')
    lines.append(' *   lead  square   主旋律（主题 A/B/转调段，断奏）')
    lines.append(' *   wind  sawtooth 风轮琶音 / 主题高八度叠奏 / 下行风嗓')
    lines.append(' *   bass  triangle 8 分驱动贝斯')
    lines.append(' *   pad   sine     长音铺底 / 前奏口哨风声')
    lines.append(' *')
    lines.append(' * 曲式：intro 8 + A 16 + B 16 + C 16 + D 16(F#m) + E 16 + outro 8')
    lines.append(' */')
    lines.append('')
    lines.append('export const AYA_STAGE4 = {')
    lines.append('  stage4: {')
    lines.append("    title: '風神少女',")
    lines.append('    duration: %s,' % fmt(S.duration))
    lines.append('    bpm: %d,' % BPM)
    lines.append('    tracks: [')
    for name in ('lead', 'wind', 'bass', 'pad'):
        tr = S.tracks[name]
        ns = [[round(n[0], 4), n[1], round(n[2], 4), n[3]] for n in tr['notes']]
        lines.append('      { wave: %r, gain: %s, notes: [' % (tr['wave'], fmt(tr['gain'])))
        lines.append(notes_js(ns))
        lines.append('      ] },')
    lines.append('    ],')
    lines.append('    drums: [')
    ds = [[round(d[0], 4), d[1], d[2]] for d in S.drums]
    lines.append(notes_js(ds, per=10))
    lines.append('    ],')
    lines.append('  },')
    lines.append('};')
    open(OUT_JS, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('\n写入', OUT_JS)
