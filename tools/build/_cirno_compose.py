# -*- coding: utf-8 -*-
"""tools/build/_cirno_compose.py -- 第三面 Boss《おてんば恋娘 / おてんば恋娘の冒険 / チルノのパーフェクトさんすう教室》琪露诺编（完美算术教室风格）

素材：
  girl      = TH06 5. Tomboyish Girl in Love (ZUN).mid       148 BPM / D 大调(A)->D 小调(B)->D 和声小调(C)
  adventure = TH09 7. Adventure of the Lovestruck Tomboy (ZUN).mid  155 BPM / 降 B 小调 -> +4 半音到 D 小调
速度统一 176 BPM（完美算术教室 175 的取整，且 88 小节 = 120.0s 整）
调统一 D 小调（A 段保留原曲 D 大调色彩）

结构（88 小节 = 120.0s）：
  引子 I  1-4   冰晶 / 数拍 / 心跳
  引子 II 5-8   四踩底鼓 + 恋娘 A 动机预告
  A       9-16  恋娘 A 段 D 大调 16 分琶音（原曲 4-11）
  A'      17-24 恋娘 A 段高八度（原曲 12-19）
  B       25-32 恋娘 B 段 D 小调旋律（原曲 21-28）
  B'      33-36 恋娘 B 段后半 + 推进（原曲 29-32）
  C       37-44 冒険 A riff（原曲 7-14，+4）
  D       45-52 冒険弦乐主旋律（原曲 25-32，+4）
  E       53-60 冒険副歌长音（原曲 40-47，+4）
  数拍子  61-64 1-2-3-4 / 9!
  教室副歌 65-72 原创 hook（同音反复 + 级进，落属音不解决）
  教室副歌 II 73-84 副歌再现 + 冒険 riff 对答 + 恋娘 C 段收束
  尾声    85-88 八音盒 + バカ + 回环

生成 src/engine/songs/cirno_stage3.js（导出 CIRNO_STAGE3.stage3）与 tools/build/_cirno_lead/song.json
"""
import sys, os, json, math

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

LEAD = os.path.join(ROOT, 'tools', 'build', '_cirno_lead')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'cirno_stage3.js')
OUT_JSON = os.path.join(LEAD, 'song.json')
SEC_JSON = os.path.join(LEAD, 'secs.json')

BPM = 176.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BARS = 88
DUR = BARS * BAR
TITLE = 'おてんば恋娘 / おてんば恋娘の冒険 / チルノのパーフェクトさんすう教室'
KEY = 'stage3'
EXPORT = 'CIRNO_STAGE3'

GIRL = json.load(open(os.path.join(LEAD, 'girl_flat.json'), encoding='utf-8'))['notes']
ADV = json.load(open(os.path.join(LEAD, 'adventure_flat.json'), encoding='utf-8'))['notes']

# ------------------------------------------------------------------ 输出容器
TRACKS = [
    ('lead', 'square', 0.300),
    ('counter', 'triangle', 0.190),   # 第二旋律 / 长音对答
    ('bell', 'sine', 0.142),          # 八音盒 / 切莱斯塔 / 冰晶
    ('harpsi', 'square', 0.125),      # 大键琴 / 风琴琶音
    ('arp', 'sine', 0.260),           # 芯片 16 分闪光
    ('piano', 'triangle', 0.098),
    ('strings', 'sawtooth', 0.126),
    ('brass', 'square', 0.115),
    ('choir', 'sine', 0.075),
    ('bass', 'triangle', 0.140),
    ('sub', 'sine', 0.075),
    ('pad', 'sine', 0.090),
    ('tick', 'square', 0.095),
    ('knife', 'square', 0.060),
    ('riser', 'sawtooth', 0.050),
    ('reverse', 'sawtooth', 0.045),
]
BY = {n: [] for n, _, _ in TRACKS}

def add(name, t, m, d, v=100):
    if t < 0 or t >= DUR - 0.02 or not (0 <= m <= 127):
        return
    if name == 'sub' and m < 28:
        m = 28
    d = min(d, DUR - t - 0.005)
    if d <= 0.02:
        return
    BY[name].append([round(max(0.0, t), 3), int(round(m)), round(max(0.03, d), 3),
                     int(max(1, min(127, v)))])

DRUMS = []
def drum(t, kind, vel=100, span=None):
    if t < 0:
        return
    ev = [round(max(0.0, t), 3), int(kind), int(max(1, min(127, vel)))]
    if span is not None:
        ev.append(round(span, 3))
    DRUMS.append(ev)

def bt(bar, beat=0.0):
    return (bar - 1) * BAR + beat * BEAT

# ------------------------------------------------------------------ 素材读取
def src_notes(song, s0, s1, chans):
    out = []
    for n in (GIRL if song == 'girl' else ADV):
        if s0 <= n['bar'] <= s1 and n['ch'] in chans:
            out.append(n)
    out.sort(key=lambda n: (n['bar'], n['beat'], n['m']))
    return out

def place_t(n, s0, d0):
    """原曲 (bar,beat) -> 目标秒（每原曲小节 = 目标一小节）"""
    return (d0 - 1) * BAR + (n['bar'] - s0) * BAR + n['beat'] * BEAT

def melody_top(notes):
    """同一时刻取最高音（把和弦/琶音压成单声部旋律）"""
    groups = {}
    for n in notes:
        key = (n['bar'], round(n['beat'], 4))
        if key not in groups or n['m'] > groups[key]['m']:
            groups[key] = n
    return [groups[k] for k in sorted(groups)]

# ------------------------------------------------------------------ 鼓组
def dr_kick(bar, beat, v=116):
    drum(bt(bar, beat), 0, v)

def dr_four(bar, v=112, snare=102, hat=44, openh=58, clap=0, ride=0, crash=0):
    for k in range(4):
        dr_kick(bar, k, v + (6 if k == 0 else 0))
    drum(bt(bar, 1), 1, snare)
    drum(bt(bar, 3), 1, snare)
    if clap:
        drum(bt(bar, 1), 5, clap)
        drum(bt(bar, 3), 5, clap)
    for i in range(8):
        drum(bt(bar, i * 0.5), 2, hat if i % 2 == 0 else int(hat * 0.72))
    for k in (0.5, 1.5, 2.5, 3.5):
        drum(bt(bar, k), 3, openh)
    if ride:
        for i in range(8):
            drum(bt(bar, i * 0.5), 7, ride if i % 2 == 0 else int(ride * 0.8))
    if crash:
        drum(bt(bar, 0), 4, crash)

def dr_fill(bar, beat=2.5, step=0.125, v0=70, v1=112, kind=1):
    n = int((4.0 - beat) / step)
    for i in range(n):
        drum(bt(bar, beat + i * step), kind, int(v0 + (v1 - v0) * i / max(1, n - 1)))

def dr_roll(bar, beat0, span, v0=44, v1=120):
    step = 0.25
    i = 0
    t = beat0
    while t < beat0 + span - 1e-6:
        drum(bt(bar, t), 6, int(v0 + (v1 - v0) * i / max(1, int(span / step) - 1)))
        t += step
        i += 1

def dr_toms(bar, beat=2.0, step=0.25, v0=84, v1=110):
    pat = [6, 6, 5, 5, 6, 5, 5, 5]
    i = 0
    t = beat
    while t < 4.0 - 1e-6:
        drum(bt(bar, t), pat[i % 8], int(v0 + (v1 - v0) * (i % 8) / 7.0))
        t += step
        i += 1

# ------------------------------------------------------------------ 常用写法
def bass_offbeat(bar, root, v=112, oct_shift=0):
    """反拍贝斯（完美教室招牌）：0.5/1.5/2.5/3.5 + 0/1/2/3 弱起"""
    for i in range(8):
        k = i * 0.5
        m = root + (12 if oct_shift else 0)
        add('bass', bt(bar, k), m, BEAT * 0.40, v if i % 2 else int(v * 0.82))
        add('sub', bt(bar, k), m - 12, BEAT * 0.40, int(v * 0.45))

def pad_chord(bar, notes, dur=4.0, v=40, name='pad'):
    for m in notes:
        add(name, bt(bar, 0), m, dur * BEAT * 0.98, v)

def stab(bar, beat, notes, v=96, dur=0.5):
    for m in notes:
        add('brass', bt(bar, beat), m, dur * BEAT, v)

def sparkle_run(bar, notes, step=0.25, v=40, dur_scale=1.0, name='arp'):
    for i, m in enumerate(notes):
        add(name, bt(bar, i * step), m, step * BEAT * dur_scale, v)

# ------------------------------------------------------------------ 引子 I（1-4）
def intro1():
    # 冰面 pad：D 大调 → Bm → A7
    pad_chord(1, [50, 57, 62, 66], 8.0, 38)
    pad_chord(3, [47, 54, 59, 62], 4.0, 34)
    pad_chord(4, [45, 52, 57, 61], 2.0, 30)   # A7
    for b in (1, 2):
        add('choir', bt(b, 0), 62, 2.0 * BEAT, 26)
    # 冰原风声（原来前 5 秒只有 pad 16 音，太空）
    add('reverse', bt(1, 0.0), 74, 1.4, 36)
    add('pad', bt(1, 0.0), 74, 2.6, 24)
    add('pad', bt(2, 0.0), 78, 2.0, 18)
    # 心跳（第一小节让过循环点，从第 2 拍进）
    for b in range(1, 5):
        dr_kick(b, 0.5 if b == 1 else 0.0, 52); dr_kick(b, 2.5, 38)
    # 钟摆
    for b in range(1, 5):
        for k in (0.5, 1.5, 2.5, 3.5) if b == 1 else (0.0, 1.0, 2.0, 3.0):
            add('tick', bt(b, k), 93, 0.10, 34)
    # 冰晶八音盒
    ice = [86, 90, 93, 98, 93, 90, 86, 90]
    for i, m in enumerate(ice):
        add('bell', bt(1, 0.5 + i * 0.5), m, 0.28, 30 + i)
    sparkle_run(4, [86, 90, 93, 98, 102], 0.125, 26, 0.9, 'arp')
    # 恋娘 A 动机提前到 1.5 秒（原来要等到 9.29s 才听到）
    for n in melody_top(src_notes('girl', 4, 5, {7})):
        t = bt(2, 0.5) + (n['bar'] - 4) * BAR + n['beat'] * BEAT
        add('bell', t, n['m'], min(0.34, n['db'] * BEAT), 92)
        if n['m'] + 12 <= 104:
            add('bell', t, n['m'] + 12, 0.18, 42)
    # 数拍 1-2-3-4（升调）
    for i, m in enumerate([74, 76, 78, 81]):
        add('bell', bt(3, i), m, 0.24, 58 + i * 6)
        add('tick', bt(3, i), m + 12, 0.10, 40)
    # バカ 挑拨动机
    add('knife', bt(4, 2.0), 84, 0.20, 52)
    add('knife', bt(4, 2.5), 82, 0.18, 46)
    dr_roll(4, 2.0, 2.0, 40, 112)
    add('riser', bt(4, 0.0), 62, 2.0, 44)
    add('reverse', bt(4, 3.0), 74, 0.8, 40)
    # 冲击
    drum(bt(4, 3.5), 4, 96)
    drum(bt(4, 3.5), 0, 112)
    for m in (50, 57, 62, 66):
        add('brass', bt(4, 3.5), m, 0.5 * BEAT, 88)


# ------------------------------------------------------------------ 引子 II（5-8）：恋娘 A 动机预告
def intro2():
    for b in range(5, 9):
        dr_four(b, 104, 96, 42, 54, clap=56)
    add('riser', bt(5, 0.0), 62, 2.0, 34)
    drum(bt(5, 0), 4, 92)
    for b in range(5, 9):
        for k in (0.0, 1.0, 2.0, 3.0):
            add('bass', bt(b, k), 38, BEAT * 0.5, 104)
    # 原曲 4-7 的 16 分琶音（预告）
    mel = melody_top(src_notes('girl', 4, 7, {7}))
    for n in mel:
        t = place_t(n, 4, 5)
        add('lead', t, n['m'], n['db'] * BEAT * 0.85, min(127, int(n['v'] * 1.10)))
        if n['m'] + 12 <= 104:
            add('bell', t, n['m'] + 12, 0.22, int(n['v'] * 0.32))
    # pad 与和弦
    for b in range(5, 9):
        pad_chord(b, [50, 57, 62, 66], 4.0, 26)
    # 8 小节尾：军鼓滚 + riser + 9!
    dr_roll(8, 2.0, 1.5, 54, 116)
    add('riser', bt(8, 0.0), 62, 4.0, 40)
    add('bell', bt(8, 3.5), 93, 0.5, 78)
    drum(bt(8, 3.5), 4, 104)

# ------------------------------------------------------------------ A 段（9-16）：原曲 4-11
def sec_a(b0, s0, big=False):
    mel = melody_top(src_notes('girl', s0, s0 + 7, {7}))
    chords = src_notes('girl', s0, s0 + 7, {2})
    bass = src_notes('girl', s0, s0 + 7, {1})
    for n in mel:
        t = place_t(n, s0, b0)
        add('lead', t, n['m'], n['db'] * BEAT * 0.90, min(127, int(n['v'] * (1.26 if big else 1.16))))
        if n['m'] + 12 <= 104:
            add('bell', t, n['m'] + 12, min(0.30, n['db'] * BEAT), int(n['v'] * (0.34 if big else 0.26)))
    for n in chords:
        t = place_t(n, s0, b0)
        add('harpsi', t, n['m'], n['db'] * BEAT * 0.8, int(n['v'] * 0.42))
        add('piano', t, n['m'], n['db'] * BEAT * 0.8, int(n['v'] * 0.30))
    for n in bass:
        t = place_t(n, s0, b0)
        add('bass', t, n['m'], n['db'] * BEAT * 0.85, min(127, int(n['v'] * 1.05)))
        add('sub', t, n['m'] - 12, n['db'] * BEAT * 0.85, int(n['v'] * 0.42))
    for b in range(b0, b0 + 8):
        dr_four(b, 112, 104, 44, 58, clap=58, crash=(84 if b == b0 else 0))
        pad_chord(b, [50, 57, 62, 66], 4.0, 24)
    if big:
        # 高八度层 + 弦乐 + 合唱
        for n in mel:
            t = place_t(n, s0, b0)
            if n['m'] + 12 <= 104:
                add('lead', t, n['m'] + 12, n['db'] * BEAT * 0.85, int(n['v'] * 0.55))
            add('strings', t, n['m'], n['db'] * BEAT * 0.95, int(n['v'] * 0.55))
        for b in range(b0, b0 + 8):
            add('choir', bt(b, 0), 62, 4.0 * BEAT * 0.95, 34)
            add('choir', bt(b, 0), 69, 4.0 * BEAT * 0.95, 28)

# ------------------------------------------------------------------ B 段（25-32 / 33-36）：原曲 21-28 / 29-32
def sec_b(b0, s0, nb, build=False):
    mel = src_notes('girl', s0, s0 + nb - 1, {3})
    arp = src_notes('girl', s0, s0 + nb - 1, {8})
    gtr = src_notes('girl', s0, s0 + nb - 1, {4})
    pad = src_notes('girl', s0, s0 + nb - 1, {6})
    low = src_notes('girl', s0, s0 + nb - 1, {5})
    bass = src_notes('girl', s0, s0 + nb - 1, {1})
    for n in mel:
        t = place_t(n, s0, b0)
        add('lead', t, n['m'], n['db'] * BEAT * 0.92, min(127, int(n['v'] * 1.12)))
        add('piano', t, n['m'], n['db'] * BEAT * 0.9, int(n['v'] * 0.5))
        if n['m'] + 12 <= 102:
            add('bell', t, n['m'] + 12, 0.22, int(n['v'] * 0.26))
    for n in arp:
        t = place_t(n, s0, b0)
        add('harpsi', t, n['m'], n['db'] * BEAT * 0.8, int(n['v'] * 0.40))
        add('arp', t, n['m'], n['db'] * BEAT * 0.6, int(n['v'] * 0.30))
    for n in gtr:
        t = place_t(n, s0, b0)
        add('strings', t, n['m'], n['db'] * BEAT * 0.8, int(n['v'] * 0.34))
    for n in pad:
        t = place_t(n, s0, b0)
        add('strings', t, n['m'], n['db'] * BEAT * 0.95, int(n['v'] * 0.38))
        add('choir', t, n['m'], n['db'] * BEAT * 0.95, int(n['v'] * 0.22))
    for n in low:
        t = place_t(n, s0, b0)
        # 对旋律抬八度 + 提力度（原来 med 50 被贝斯埋掉，实测 -29dB 听不见）
        mm = n['m'] + 12 if n['m'] + 12 <= 98 else n['m']
        add('counter', t, mm, n['db'] * BEAT * 0.9, int(n['v'] * 0.48))
    for n in bass:
        t = place_t(n, s0, b0)
        add('bass', t, n['m'], n['db'] * BEAT * 0.9, min(127, int(n['v'] * 1.05)))
        add('sub', t, n['m'] - 12, n['db'] * BEAT * 0.9, int(n['v'] * 0.42))
    # 原曲 B 段没有贝斯轨（实测 bass -66dB）：按每小节最低音补 8 分反拍贝斯 + sub
    for b in range(b0, b0 + nb):
        sb = s0 + (b - b0)
        pcs = [n['m'] for n in src_notes('girl', sb, sb, {1, 2, 3, 4, 5, 6, 7, 8})]
        root = (min(pcs) if pcs else 50) - 12
        if root < 28:
            root += 12
        for i in range(8):
            mm = root + (12 if i % 4 == 3 else 0)
            add('bass', bt(b, i * 0.5), mm, BEAT * 0.42, 104 if i % 2 == 0 else 88)
            add('sub', bt(b, i * 0.5), mm - 12, BEAT * 0.42, 46)
    for b in range(b0, b0 + nb):
        dr_four(b, 108, 100, 38, 52, clap=48)
        pad_chord(b, [50, 53, 57, 62], 4.0, 22)
    if build:
        for b in range(b0, b0 + nb):
            for k in (0.0, 1.0, 2.0, 3.0):
                add('brass', bt(b, k), 50, BEAT * 0.7, 62)
        dr_roll(b0 + nb - 1, 2.0, 2.0, 50, 120)
        add('riser', bt(b0 + nb - 1, 0.0), 62, 4.0, 46)


# ------------------------------------------------------------------ C 段（37-44）：冒険 A riff 原曲 7-14（+4）
def sec_c(b0, s0, nb=8, hero=False):
    riff = src_notes('adventure', s0, s0 + nb - 1, {7})
    organ = src_notes('adventure', s0, s0 + nb - 1, {2})
    strings = src_notes('adventure', s0, s0 + nb - 1, {4})
    bass = src_notes('adventure', s0, s0 + nb - 1, {5})
    for n in riff:
        t = place_t(n, s0, b0)
        m = n['m'] + 4
        add('lead', t, m, n['db'] * BEAT * 0.92, min(127, int(n['v'] * (1.16 if hero else 1.08))))
        if m + 12 <= 104:
            add('bell', t, m + 12, min(0.28, n['db'] * BEAT), int(n['v'] * 0.28))
            add('lead', t, m + 12, n['db'] * BEAT * 0.85, int(n['v'] * 0.30))
    for n in organ:
        t = place_t(n, s0, b0)
        add('harpsi', t, n['m'] + 4, n['db'] * BEAT * 0.8, int(n['v'] * 0.40))
        add('arp', t, n['m'] + 4, n['db'] * BEAT * 0.6, int(n['v'] * 0.26))
    for n in strings:
        t = place_t(n, s0, b0)
        add('strings', t, n['m'] + 4, n['db'] * BEAT * 0.95, int(n['v'] * 0.42))
        add('choir', t, n['m'] + 4, n['db'] * BEAT * 0.95, int(n['v'] * 0.24))
    for n in bass:
        t = place_t(n, s0, b0)
        # C 段 bass 原来是全曲最响的低音（-20.4，比主旋律还高）：收 1.5~2dB
        add('bass', t, n['m'] + 4, n['db'] * BEAT * 0.9, min(127, int(n['v'] * 0.84)))
        add('sub', t, n['m'] - 8, n['db'] * BEAT * 0.9, int(n['v'] * 0.32))
    for b in range(b0, b0 + nb):
        dr_four(b, 112, 104, 44, 58, clap=58, ride=(30 if hero else 0))
        pad_chord(b, [50, 53, 57, 62] if b % 2 else [50, 53, 58, 62], 4.0, 24)
        # 原曲此段没有 ch2 织体：补 16 分电流琶音 + 冰晶点缀，让 C 段不再只是「低频轰」
        for i in range(16):
            mm = [50, 53, 57][i % 3] + (12 if (i // 3) % 2 else 0) + 12
            add('arp', bt(b, i * 0.25), mm, 0.10, 36 if i % 4 == 0 else 26)
        add('bell', bt(b, 3.5), 93, 0.20, 34)
    drum(bt(b0, 0), 4, 96)


# ------------------------------------------------------------------ D 段（45-52）：冒険弦乐主旋律 原曲 25-32（+4）
def sec_d(b0, s0=25, nb=8):
    # 旋律：弦乐三轨里取每拍最高音，单声部化
    mel = melody_top(src_notes('adventure', s0, s0 + nb - 1, {4, 10, 11}))
    strings = src_notes('adventure', s0, s0 + nb - 1, {4, 10, 11})
    bass = src_notes('adventure', s0, s0 + nb - 1, {5})
    organ = src_notes('adventure', s0, s0 + nb - 1, {2})
    for n in mel:
        t = place_t(n, s0, b0)
        m = n['m'] + 4
        add('lead', t, m, n['db'] * BEAT * 0.92, min(127, int(n['v'] * 1.10)))
        add('brass', t, m, n['db'] * BEAT * 0.85, int(n['v'] * 0.55))
        if m + 12 <= 104:
            add('bell', t, m + 12, min(0.26, n['db'] * BEAT), int(n['v'] * 0.24))
    for n in strings:
        t = place_t(n, s0, b0)
        add('strings', t, n['m'] + 4, n['db'] * BEAT * 0.95, int(n['v'] * 0.34))
    for n in organ:
        t = place_t(n, s0, b0)
        add('harpsi', t, n['m'] + 4, n['db'] * BEAT * 0.75, int(n['v'] * 0.30))
    for n in bass:
        t = place_t(n, s0, b0)
        add('bass', t, n['m'] + 4, n['db'] * BEAT * 0.9, min(127, int(n['v'] * 1.02)))
        add('sub', t, n['m'] - 8, n['db'] * BEAT * 0.9, int(n['v'] * 0.40))
    for b in range(b0, b0 + nb):
        dr_four(b, 110, 102, 42, 56, clap=56, ride=28)
        pad_chord(b, [50, 53, 57, 62], 4.0, 26)
        add('choir', bt(b, 0), 62, 4.0 * BEAT * 0.95, 30)
        # 风琴 16 分分解（原曲 B 段本无，这里补厚度）
        root = 50 if b % 4 < 2 else 53
        pat = [root, root + 7, root + 12, root + 15, root + 12, root + 7, root + 12, root + 19]
        for i in range(16):
            add('harpsi', bt(b, i * 0.25), pat[i % 8] + (12 if i % 8 >= 4 else 0), 0.10, 34 if i % 4 else 44)
    drum(bt(b0, 0), 4, 98)

# ------------------------------------------------------------------ E 段（53-60）：冒険副歌 原曲 40-47（+4）
def sec_e(b0, s0=40, nb=8):
    mel = melody_top(src_notes('adventure', s0, s0 + nb - 1, {0, 3}))
    flute = src_notes('adventure', s0, s0 + nb - 1, {3})
    strings = src_notes('adventure', s0, s0 + nb - 1, {10, 11})
    organ = src_notes('adventure', s0, s0 + nb - 1, {2})
    bass = src_notes('adventure', s0, s0 + nb - 1, {5})
    for n in mel:
        t = place_t(n, s0, b0)
        m = n['m'] + 4
        add('lead', t, m, n['db'] * BEAT * 0.95, min(127, int(n['v'] * 1.18)))
        add('bell', t, m + 12 if m + 12 <= 104 else m, min(0.5, n['db'] * BEAT), int(n['v'] * 0.34))
        add('strings', t, m, n['db'] * BEAT * 0.95, int(n['v'] * 0.50))
        if m + 12 <= 104:
            add('lead', t, m + 12, n['db'] * BEAT * 0.9, int(n['v'] * 0.36))
        add('piano', t, m - 12 if m - 12 >= 33 else m, n['db'] * BEAT * 0.95, int(n['v'] * 0.46))
    for n in strings:
        t = place_t(n, s0, b0)
        add('strings', t, n['m'] + 4, n['db'] * BEAT * 0.95, int(n['v'] * 0.36))
        add('choir', t, n['m'] + 4, n['db'] * BEAT * 0.95, int(n['v'] * 0.28))
    for n in organ:
        t = place_t(n, s0, b0)
        add('harpsi', t, n['m'] + 4, n['db'] * BEAT * 0.75, int(n['v'] * 0.32))
    for n in bass:
        t = place_t(n, s0, b0)
        add('bass', t, n['m'] + 4, n['db'] * BEAT * 0.92, min(127, int(n['v'] * 1.04)))
        add('sub', t, n['m'] - 8, n['db'] * BEAT * 0.92, int(n['v'] * 0.42))
    for b in range(b0, b0 + nb):
        dr_four(b, 114, 106, 44, 60, clap=60, ride=30, crash=(92 if b == b0 else 0))
        pad_chord(b, [50, 53, 57, 62], 4.0, 28)
        for i in range(16):
            mm = [50, 53, 57][i % 3] + (12 if (i // 3) % 2 else 0) + 12
            add('arp', bt(b, i * 0.25), mm, 0.10, 40 if i % 4 == 0 else 30)
        for off in (0.0, 2.5):
            add('brass', bt(b, off), 50 + 12, 0.45, 74)
    drum(bt(b0 + 4, 0), 4, 84)

# ------------------------------------------------------------------ 数拍子（61-64）
def sec_break(b0=61):
    # A 踏板 + 心拍
    for b in range(b0, b0 + 4):
        add('bass', bt(b, 0), 45, 4.0 * BEAT * 0.95, 92)
        add('sub', bt(b, 0), 33, 4.0 * BEAT * 0.95, 44)
        pad_chord(b, [45, 50, 52, 57], 4.0, 26)
        add('tick', bt(b, 0), 93, 0.1, 38)
        add('tick', bt(b, 2), 93, 0.1, 30)
    # 1-2-3-4 / 5-6-7-8 / 9!
    counts = [(74, 74, 74, 74), (76, 76, 76, 78), (81, 81, 81, 86)]
    for bi, group in enumerate(counts):
        bar = b0 + bi
        for i, m in enumerate(group):
            add('bell', bt(bar, i), m, 0.22, 92 + i * 4)
            if bi < 2:
                dr_kick(bar, i, 96)
    # 恐怖跳拍：bar63 后半留白 + バカ
    add('knife', bt(b0 + 2, 2.0), 86, 0.16, 74)
    add('knife', bt(b0 + 2, 2.25), 84, 0.16, 68)
    add('brass', bt(b0 + 2, 2.0), 46, 0.4 * BEAT, 70)
    # 倒数 + 9!
    dr_roll(b0 + 3, 0.0, 2.0, 40, 120)
    add('riser', bt(b0 + 3, 0.0), 62, 4.0, 50)
    add('bell', bt(b0 + 3, 2.5), 93, 0.4, 100)
    add('bell', bt(b0 + 3, 3.0), 98, 0.5, 108)
    drum(bt(b0 + 3, 3.0), 4, 100)
    for i in range(4):
        drum(bt(b0 + 3, 3.0 + i * 0.125), 6, 70 + i * 12)

# ------------------------------------------------------------------ 教室副歌（65-72 / 73-80）
CH_HOOK = [
    # (bar, beat, midi, durBeats, vel)   D 小调，同音反复 + 级进，落属音
    (0, 0.0, 74, 0.5, 112), (0, 0.5, 74, 0.5, 108), (0, 1.0, 69, 0.5, 100),
    (0, 1.5, 74, 0.5, 106), (0, 2.0, 77, 0.5, 110), (0, 2.5, 76, 0.5, 104),
    (0, 3.0, 74, 0.5, 108), (0, 3.5, 74, 0.5, 100),
    (1, 0.0, 74, 0.5, 112), (1, 0.5, 74, 0.5, 108), (1, 1.0, 69, 0.5, 100),
    (1, 1.5, 72, 0.5, 104), (1, 2.0, 74, 0.5, 108), (1, 2.5, 77, 0.5, 112),
    (1, 3.0, 79, 0.5, 116), (1, 3.5, 77, 0.5, 108),
    (2, 0.0, 76, 0.5, 112), (2, 0.5, 74, 0.5, 106), (2, 1.0, 72, 0.5, 102),
    (2, 1.5, 74, 0.5, 108), (2, 2.0, 77, 0.5, 112), (2, 2.5, 76, 0.5, 104),
    (2, 3.0, 74, 0.5, 108), (2, 3.5, 72, 0.5, 100),
    (3, 0.0, 69, 1.5, 104), (3, 1.5, 74, 0.5, 108), (3, 2.0, 76, 0.5, 106),
    (3, 2.5, 77, 0.5, 110), (3, 3.0, 76, 0.5, 104), (3, 3.5, 74, 0.5, 100),
    (4, 0.0, 74, 0.5, 112), (4, 0.5, 74, 0.5, 108), (4, 1.0, 69, 0.5, 100),
    (4, 1.5, 74, 0.5, 106), (4, 2.0, 79, 0.5, 114), (4, 2.5, 77, 0.5, 108),
    (4, 3.0, 76, 0.5, 110), (4, 3.5, 74, 0.5, 104),
    (5, 0.0, 77, 1.0, 114), (5, 1.0, 76, 0.5, 106), (5, 1.5, 74, 0.5, 102),
    (5, 2.0, 72, 0.5, 104), (5, 2.5, 74, 0.5, 108), (5, 3.0, 76, 0.5, 110),
    (5, 3.5, 77, 0.5, 112),
    (6, 0.0, 79, 0.5, 118), (6, 0.5, 77, 0.5, 110), (6, 1.0, 76, 0.5, 106),
    (6, 1.5, 74, 0.5, 102), (6, 2.0, 72, 0.5, 100), (6, 2.5, 74, 0.5, 104),
    (6, 3.0, 76, 0.5, 108), (6, 3.5, 79, 0.5, 114),
    (7, 0.0, 81, 1.0, 120), (7, 1.0, 79, 0.5, 112), (7, 1.5, 77, 0.5, 108),
    (7, 2.0, 76, 0.5, 106), (7, 2.5, 74, 0.5, 104), (7, 3.0, 72, 0.5, 100),
    (7, 3.5, 69, 0.5, 104),
]

CH_HARM = [  # 每小节和弦（D 小调）
    [50, 53, 57], [50, 53, 57], [46, 50, 53], [48, 52, 55],
    [50, 53, 57], [50, 53, 57], [43, 46, 50], [45, 49, 52],
]

def chorus(b0, hero=False, counter_riff=False):
    # 主旋律：第二遍做改编（前半加四度叠置与铜管呼应，后半整体升八度）
    for (bar, beat, m, db, v) in CH_HOOK:
        t = bt(b0 + bar, beat)
        up = 12 if (hero and bar >= 4) else 0
        mm = m + up
        add('lead', t, mm, db * BEAT * 0.95, min(127, int(v * (1.08 if hero else 0.98))))
        if mm + 12 <= 104:
            add('bell', t, mm + 12, min(0.3, db * BEAT), int(v * (0.44 if hero else 0.30)))
        if hero:
            if bar < 4:
                if m + 5 <= 100:
                    add('brass', t, m + 5, db * BEAT * 0.9, int(v * 0.40))
                add('lead', t, m + 12 if m + 12 <= 104 else m, db * BEAT * 0.9, int(v * 0.38))
            else:
                add('lead', t, m, db * BEAT * 0.92, int(v * 0.54))
                add('strings', t, mm, db * BEAT * 0.9, int(v * 0.42))
                add('piano', t, mm + 12 if mm + 12 <= 104 else mm, db * BEAT * 0.9, int(v * 0.34))
                # 16 分邻音装饰：第二遍副歌后半不是「同一句加厚」，而是真的换了写法
                nb = mm - 2 if (mm - 2) % 12 in (2, 4, 5, 7, 9, 10, 0, 1) else mm + 2
                if 60 <= nb <= 104:
                    add('lead', t + BEAT * 0.25, nb, BEAT * 0.16, int(v * 0.46))
        else:
            add('lead', t, m + 12 if m + 12 <= 104 else m, db * BEAT * 0.88, int(v * 0.26))
        add('piano', t, m - 12 if m - 12 >= 33 else m, db * BEAT * 0.95, int(v * 0.44))
    # 和弦 + 反拍贝斯 + 鼓
    for i in range(8):
        bar = b0 + i
        ch = CH_HARM[i]
        for m in ch:
            add('piano', bt(bar, 0), m, 3.6 * BEAT, 52)
            add('strings', bt(bar, 0), m + 12, 3.6 * BEAT, 34)
        add('choir', bt(bar, 0), ch[0] + 12, 4.0 * BEAT * 0.95, 34)
        bass_offbeat(bar, ch[0] - 12, 116 if hero else 108)
        # 完美教室式十六分电流琶音
        for k in range(16):
            mm = ch[k % 3] + 12 + (12 if (k // 3) % 2 else 0)
            add('arp', bt(bar, k * 0.25), mm, 0.10, 40 if k % 4 == 0 else 30)
        if not hero:
            for off in (0.0, 2.5):
                add('brass', bt(bar, off), ch[0] + 12, 0.45, 78)
            add('choir', bt(bar, 2.0), ch[1] + 12, 2.0 * BEAT, 32)
        elif i < 4:
            # 铜管回声：回答主旋律
            add('brass', bt(bar, 3.5), ch[0] + 12, 0.30, 66)
        # 两遍副歌鼓组统一（原来 C1 没有 ride，15.4 击/s 对 21.5 击/s）
        dr_four(bar, 114 if hero else 112, 106, 48 if hero else 46, 60,
                clap=(64 if hero else 58), ride=(34 if hero else 30),
                crash=(96 if i in (0, 4) else 0))
        if hero and i >= 6:
            for k in range(16):
                drum(bt(bar, k * 0.25), 2, 30 if k % 4 else 38)
            for k in (1.5, 3.5):
                drum(bt(bar, k), 0, 104)
        # 数拍喊话：每两小节一记上行四音
        if i % 2 == 0:
            for k, mm2 in enumerate([74, 77, 81, 86]):
                add('bell', bt(bar, k * 0.5), mm2, 0.18, 74)
    if hero:
        # 末两小节半音下行过门（原来两遍副歌逐音相同，结尾要做点「鬼畜」文章）
        chrom = [80, 79, 78, 77, 76, 75, 75, 74]
        for i, m in enumerate(chrom):
            t = bt(b0 + 6, 2.0 + i * 0.25)
            add('strings', t, m, 0.10, 46)
            add('counter', t, m - 12, 0.10, 40)
        for i, m in enumerate([74, 75, 76, 77, 78, 79]):
            add('brass', bt(b0 + 7, 2.5 + i * 0.25), m, 0.10, 54)
    # 段尾推进
    dr_roll(b0 + 7, 2.5, 1.5, 50, 120)
    add('riser', bt(b0 + 7, 0.0), 62, 4.0, 44)
    # 冒険 riff 对答（第二遍副歌）
    if counter_riff:
        riff = src_notes('adventure', 7, 10, {7})
        for n in riff:
            t = place_t(n, 7, b0 + 4)
            mm = n['m'] + 16 if n['m'] + 16 <= 98 else n['m'] + 4
            add('counter', t, mm, n['db'] * BEAT * 0.9, int(n['v'] * 0.80))
        # 高八度闪烁
        for i in range(4):
            sparkle_run(b0 + 4 + i, [86, 89, 93, 98], 0.25, 30, 0.8, 'arp')


# ------------------------------------------------------------------ 收束（81-84）：恋娘 C 段（原曲 37-40）
def sec_final(b0=81):
    mel = src_notes('girl', 37, 40, {7})
    for n in mel:
        t = place_t(n, 37, b0)
        add('lead', t, n['m'], n['db'] * BEAT * 0.95, min(127, int(n['v'] * 1.16)))
        if n['m'] + 12 <= 104:
            add('bell', t, n['m'] + 12, min(0.3, n['db'] * BEAT), int(n['v'] * 0.32))
        add('strings', t, n['m'], n['db'] * BEAT * 0.95, int(n['v'] * 0.48))
    # 和弦与鼓
    prog = [[45, 49, 52], [50, 53, 57], [45, 49, 52], [50, 53, 57]]
    for i in range(4):
        bar = b0 + i
        ch = prog[i]
        for m in ch:
            add('piano', bt(bar, 0), m, 3.6 * BEAT, 56)
            add('strings', bt(bar, 0), m + 12, 3.6 * BEAT, 36)
        add('choir', bt(bar, 0), ch[0] + 12, 4.0 * BEAT * 0.95, 36)
        bass_offbeat(bar, ch[0] - 12, 112)
        dr_four(bar, 112, 104, 46, 60, clap=60, ride=30, crash=(96 if i == 0 else 0))
    # 副歌 hook 残片
    for (bar, beat, m, db, v) in CH_HOOK[:8]:
        add('counter', bt(b0 + bar, beat), m, db * BEAT * 0.85, int(v * 0.45))
    dr_roll(b0 + 3, 2.5, 1.5, 56, 122)

# ------------------------------------------------------------------ 尾声（85-88）
def coda(b0=85):
    # 85：全奏 D 大调（Picardy）
    drum(bt(b0, 0), 4, 104); dr_kick(b0, 0, 118)
    for m in (50, 57, 62, 66, 74):
        add('brass', bt(b0, 0), m, 1.2 * BEAT, 100)
        add('strings', bt(b0, 0), m, 2.0 * BEAT, 62)
    add('choir', bt(b0, 0), 62, 2.0 * BEAT, 40)
    # 八音盒：恋娘 A 动机（D 大调）
    motif = [(74, 0.0), (78, 0.5), (86, 1.0), (83, 1.5), (78, 2.0), (86, 2.5), (90, 3.0), (86, 3.5)]
    for (m, k) in motif:
        add('bell', bt(b0 + 1, k), m, 0.3, 84)
    sparkle_run(b0 + 1, [74, 78, 81, 86, 90], 0.25, 34, 0.8, 'arp')
    # バカ
    add('knife', bt(b0 + 2, 2.0), 86, 0.18, 84)
    add('knife', bt(b0 + 2, 2.25), 84, 0.16, 76)
    add('brass', bt(b0 + 2, 2.0), 50, 0.35 * BEAT, 74)
    # 数 1-2-3
    for i, m in enumerate([74, 76, 78]):
        add('bell', bt(b0 + 2, 3.0 + i * 0.25), m, 0.15, 70)
    # 最后一击：全奏长音 + 吊镲（原来尾声只剩 bell 14 音，-23.6dB 明显掉气）
    drum(bt(b0 + 2, 0), 4, 92)
    for m in (50, 57, 62, 66):
        add('brass', bt(b0 + 2, 0), m, 2.6 * BEAT, 80)
        add('strings', bt(b0 + 2, 0), m + 12 if m + 12 <= 96 else m, 3.4 * BEAT, 52)
    add('choir', bt(b0 + 2, 0), 62, 3.4 * BEAT, 40)
    add('bass', bt(b0 + 2, 0), 38, 3.6 * BEAT, 96)
    add('sub', bt(b0 + 2, 0), 26, 3.6 * BEAT, 46)
    for b in (b0 + 2, b0 + 3):
        dr_four(b, 102, 96, 34, 48, clap=44)
    for m in (50, 57, 62, 66):
        add('strings', bt(b0 + 2, 0), m, 4.0 * BEAT * 0.95, 44)
    add('choir', bt(b0 + 2, 0), 62, 4.0 * BEAT * 0.95, 30)
    for k in range(16):
        add('arp', bt(b0 + 2, k * 0.25), [50, 57, 62, 66][k % 4] + 24, 0.10, 26)
    for m in (50, 57, 62, 66):
        add('piano', bt(b0 + 2, 2.0), m, 1.6 * BEAT, 70)
    # 最后一小节：冰面余响（只有 pad 与三颗八音盒，保证循环点干净）
    add('bass', bt(b0 + 3, 0.0), 38, 0.9, 72)
    add('pad', bt(b0 + 3, 0.0), 50, 0.7, 26)
    add('bell', bt(b0 + 3, 0.5), 86, 0.30, 58)
    add('bell', bt(b0 + 3, 1.5), 93, 0.30, 52)
    add('bell', bt(b0 + 3, 2.5), 98, 0.40, 46)


# ------------------------------------------------------------------ 冰晶点缀（贯穿全曲）
def ice_accent():
    """段落交界铺冰晶/刀声 + B–E 段的钟摆（原来只有引子与数拍段有）"""
    glass = [
        (16, 3.0, 86, 46), (16, 3.5, 93, 42),
        (24, 3.0, 88, 46), (24, 3.5, 95, 42),
        (32, 3.0, 84, 44), (32, 3.5, 91, 40),
        (36, 3.0, 86, 46), (36, 3.5, 93, 42),
        (44, 3.0, 86, 44), (44, 3.5, 93, 40),
        (52, 3.0, 88, 46), (52, 3.5, 95, 42),
        (60, 3.0, 86, 48), (60, 3.5, 93, 44),
        (72, 3.0, 88, 46), (72, 3.5, 95, 42),
        (80, 3.0, 86, 48), (80, 3.5, 93, 44),
    ]
    for bar, beat, m, v in glass:
        add('bell', bt(bar, beat), m, 0.26, v)
    for bar in (16, 32, 44, 60, 80):
        add('knife', bt(bar, 3.75), 88, 0.14, 62)
        add('knife', bt(bar, 3.875), 86, 0.12, 56)
    for bar in list(range(25, 33)) + list(range(37, 45)) + list(range(45, 53)) + list(range(53, 61)):
        add('tick', bt(bar, 1.75), 93, 0.09, 40)
        add('tick', bt(bar, 3.75), 93, 0.09, 34)


# ------------------------------------------------------------------ 主流程
def main():
    intro1()
    intro2()
    sec_a(9, 4, big=False)
    sec_a(17, 12, big=True)
    sec_b(25, 21, 8, build=False)
    sec_b(33, 29, 4, build=True)
    sec_c(37, 7, 8, hero=False)
    sec_d(45, 25, 8)
    sec_e(53, 40, 8)
    sec_break(61)
    chorus(65, hero=False, counter_riff=False)
    chorus(73, hero=True, counter_riff=True)
    sec_final(81)
    coda(85)
    ice_accent()

    for name, _, _ in TRACKS:
        BY[name].sort(key=lambda e: (e[0], e[1]))
    DRUMS.sort(key=lambda e: (e[0], e[1]))
    tracks = [dict(name=n, wave=w, gain=g, notes=BY[n]) for n, w, g in TRACKS]
    song = dict(title=TITLE, duration=round(DUR, 3), bpm=BPM, tracks=tracks, drums=DRUMS)
    js = 'export const %s = { %s: %s };' % (EXPORT, KEY, json.dumps(song, ensure_ascii=False, separators=(',', ':')))
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write(js + '\n')
    json.dump(song, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
    secs = [['intro1', 1, 4], ['intro2', 5, 8], ['A', 9, 16], ['A2', 17, 24],
            ['B', 25, 32], ['B2', 33, 36], ['C', 37, 44], ['D', 45, 52],
            ['E', 53, 60], ['break', 61, 64], ['chorus1', 65, 72],
            ['chorus2', 73, 84], ['coda', 85, 88]]
    json.dump({'secs': [[n, round((a - 1) * BAR, 3), round(b * BAR, 3)] for n, a, b in secs],
               'dur': round(DUR, 3), 'bar': round(BAR, 6)}, open(SEC_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
    tot = sum(len(t['notes']) for t in tracks)
    print('wrote', OUT_JS, os.path.getsize(OUT_JS), 'bytes;', len(tracks), 'tracks', tot, 'notes', len(DRUMS), 'drums')
    print('dur', round(DUR, 3), 'bars', BARS)
    for t in tracks:
        ns = t['notes']
        if ns:
            print('  %-8s %5d  range %3d-%3d  end %.3f' % (t['name'], len(ns), min(n[1] for n in ns), max(n[1] for n in ns), max(n[0] + n[2] for n in ns)))

if __name__ == '__main__':
    main()
