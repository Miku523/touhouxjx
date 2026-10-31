# -*- coding: utf-8 -*-
"""tools/build/_wrig_compose.py -- 第二面 Boss《蠢蠢秋月 ～ Mooned Insect》（萤火夜雾编）v8

素材 = ZUN 原曲 TH08 扒谱 MIDI（3. Wriggling Autumn Moon ~ Mooned Insect (ZUN).mid）：
155 BPM / 51 小节 / 79.1s / 单 type0 轨。
v8 结构（全改清单 1/2/3/4/5/6/7/8）：引子 6 小节 -> 原曲 bar10-42 -> 呼吸 4 -> 再现 I（旋律上八度）
-> 再现 II（四度叠置和声 + 末 4 小节升半音）-> 原曲尾奏 bar43-50 -> 尾声 8。
共 75 小节 = 116.129s。

生成 src/engine/songs/wriggle_stage2.js（导出 WRIGGLE_STAGE2.stage2）与 tools/build/_wrig_lead/song.json
"""
import sys, os, json

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

MIDI_FLAT = os.path.join(ROOT, 'tools', 'build', '_wrig_lead', 'midi_flat.json')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'wriggle_stage2.js')
LEAD_DIR = os.path.join(ROOT, 'tools', 'build', '_wrig_lead')
OUT_JSON = os.path.join(LEAD_DIR, 'song.json')
SEC_JSON = os.path.join(LEAD_DIR, 'secs.json')

BPM = 155.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
TITLE = '蠢蠢秋月 ～ Mooned Insect'
KEY = 'stage2'
EXPORT = 'WRIGGLE_STAGE2'

# ---- 版图（小节） ----
N_INTRO = 6
MAIN_A = (10, 42)      # 原曲 pickup + A + A' + B + B'（尾奏挪到最后）
REP1 = (19, 26)        # A' 主题 -> 第一再现（旋律上八度）
REP2 = (35, 42)        # B' 主题 -> 第二再现（四度叠置 + 末 4 小节升半音）
OUTRO = (43, 50)       # 原曲尾奏 riff -> 放在再现之后
N_BREAK = 4
N_REP = 8
N_OUTRO = 8
N_CODA = 8

T_INTRO = 0.0
T_MAIN = N_INTRO * BAR
T_BREAK = T_MAIN + (MAIN_A[1] - MAIN_A[0] + 1) * BAR
T_REP1 = T_BREAK + N_BREAK * BAR
T_REP2 = T_REP1 + N_REP * BAR
T_OUTRO = T_REP2 + N_REP * BAR
T_CODA = T_OUTRO + N_OUTRO * BAR
DUR = (N_INTRO + (MAIN_A[1] - MAIN_A[0] + 1) + N_BREAK + 2 * N_REP + N_OUTRO + N_CODA) * BAR

TRACKS = []
BY = {}
def add(name, t, m, d, v=100):
    if t < 0 or not (0 <= m <= 127):
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

# ---- 读取平滑化 MIDI ----
_FLAT = json.load(open(MIDI_FLAT, encoding='utf-8'))
NOTES = _FLAT['notes']
_CH = {}
for _n in NOTES:
    _CH.setdefault(_n['ch'], []).append(_n)

def ch_notes(*chs):
    out = []
    for c in chs:
        out.extend(_CH.get(c, []))
    return sorted(out, key=lambda n: (n['t'], n['m']))

def bar_t(bar, beat=0.0):
    """flat 时间轴上 bar/beat 的秒"""
    return (bar - 1) * BAR + beat * BEAT

def pick(chs, b0, b1, bf=0.0, bt=99.0):
    out = []
    for n in ch_notes(*chs):
        if b0 <= n['bar'] <= b1 and bf - 1e-6 <= n['beat'] < bt:
            out.append(n)
    return out

# ---- 配器映射（faithful） ----
DRUM_MAP = {36: 0, 35: 0, 38: 1, 40: 1, 37: 1, 42: 2, 62: 2, 63: 2, 44: 2,
            46: 3, 49: 4, 57: 4, 51: 7, 53: 7, 45: 5, 47: 5, 48: 6, 41: 6}

def voice(ch, t, m, d, v, mode="faithful"):
    if ch == 0 or ch == 7:                       # 主旋律（ch7 是 ch0 重复，只留一份）
        if ch == 7:
            return
        if mode == "big":
            add('lead', t, m, d * 0.94, min(127, int(v * 1.30)))
            if m + 12 <= 100:
                add('bell', t, m + 12, min(d, 0.55), int(v * 0.24))
        elif mode == "huge":
            add('lead', t, m, d * 0.94, min(127, int(v * 1.40)))
            if m + 12 <= 100:
                add('bell', t, m + 12, min(d, 0.60), int(v * 0.26))
        else:
            add('lead', t, m, d * 0.95, min(127, int(v * 1.22)))
        if d >= 0.10:
            add('piano', t, m, d * 0.72, int(v * 0.30))
        if m + 12 <= 100:                        # 萤火点音：长音更亮，短音做微光
            if d >= 0.35:
                add('bell', t, m + 12, 0.36, int(v * 0.55))
            elif d >= 0.12:
                add('bell', t, m + 12, 0.26, int(v * 0.34))
    elif ch == 10:                                # 旋律 -12
        add('piano', t, m, d * 0.85, int(v * (0.46 if mode == 'faithful' else 0.56)))
    elif ch == 11:                                # 和声层（低三度）
        add('harpsi', t, m, d * 0.85, int(v * (0.50 if mode == 'faithful' else 0.62)))
    elif ch == 3:                                 # 琶音
        add('arp', t, m, d * 0.85, int(v * 0.58))
        add('harpsi', t, m, d * 0.8, int(v * 0.30))
    elif ch == 2:                                 # 低音
        add('bass', t, m, d * 0.88, min(127, int(v * 1.05)))
        add('sub', t, m, d * 0.88, int(v * 0.52))
    elif ch == 4:                                 # ch2 +12
        add('guitar', t, m, d * 0.8, int(v * 0.65))
    elif ch == 5:                                 # 对旋律 / 跑句
        add('counter', t, m, d * 0.9, int(v * (0.55 if mode == 'faithful' else 0.72)))
    elif ch == 6:                                 # 小号齐奏
        add('brass', t, m, d * 0.85, min(127, int(v * 1.02)))
    elif ch == 7:                                 # 小号高声部
        add('brass', t, m, d * 0.85, min(127, int(v * 0.92)))
        if m + 12 <= 100:
            add('bell', t, m + 12, min(d, 0.4), int(v * 0.24))
    elif ch == 8:
        add('strings', t, m, min(d, 3.0), int(v * 0.9))
    elif ch == 14:
        add('strings', t, m, min(d, 3.0), int(v * 0.75))
        add('choir', t, m, min(d, 2.6), int(v * 0.42))
    elif ch == 9:
        k = DRUM_MAP.get(m)
        if k is not None:
            drum(t, k, v)

def faithful(b0, b1, t0):
    """把原曲 bar b0..b1 整块搬到 t0"""
    shift = t0 - bar_t(b0, 0)
    for c in (0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14):
        for n in pick([c], b0, b1):
            voice(c, n['t'] + shift, n['m'], n['d'], n['v'])
    return shift

def block(chs, b0, b1, t0, mode="faithful", vel=1.0, transpose=0):
    shift = t0 - bar_t(b0, 0)
    for c in chs:
        for n in pick([c], b0, b1):
            voice(c, n['t'] + shift, n['m'] + transpose, n['d'], min(127, int(n['v'] * vel)), mode=mode)

# ---- 新写段落 ----

def hook_cells():
    """从原曲 ch0 的 bar10-14 抽出主题头（用于引子/尾声八音盒）"""
    out = []
    for n in pick([0], 10, 14):
        out.append((n['t'] - bar_t(10, 0), n['m'] - 12, n['d'], n['v']))
    return out

HOOK = hook_cells()

def sparkle(b0, b1, pattern, t0, vel=28):
    """萤火微光：高音区 16 分琶音"""
    shift = t0 - bar_t(b0, 0)
    for bar in range(b0, b1 + 1):
        for i in range(16):
            tt = bar_t(bar, 0) + i * BEAT / 4 + shift
            m = pattern[i % len(pattern)]
            add("arp", tt, m, 0.085, vel + (i % 4) * 2)

def shape_rep_drums(t0, t1):
    """再现段鼓组：撤 ride，闭镲 16 分降到 8 分、整体收 28%，留空隙"""
    out = []
    for ev in sorted(DRUMS, key=lambda x: x[0]):
        t = ev[0]
        if t0 - 1e-6 <= t < t1:
            k = ev[1]
            if k == 7:
                continue
            if k == 2:
                idx = int(round((t - t0) / (BEAT / 4)))
                if idx % 2:
                    continue
                ev = [ev[0], ev[1], int(ev[2] * 0.72)] + ev[3:]
            elif k == 3:
                ev = [ev[0], ev[1], int(ev[2] * 0.85)] + ev[3:]
        out.append(ev)
    DRUMS[:] = out

def sec_intro():
    # 1) 夜雾 drone（E 大三和弦 -> 高 G# 色）
    for t0, dur, chord, gv in ((0.0, 3 * BAR, [40, 47, 56, 64], 44),
                               (3 * BAR, 3 * BAR, [40, 47, 59, 64], 40)):
        for i, m in enumerate(chord):
            add('pad', t0, m, dur, gv - i * 3)
    add('choir', 0.3, 56, 4.4, 34)
    add('choir', 0.3, 64, 4.4, 26)
    for m in (47, 56, 64):
        add('strings', 0.0, m, 4.0, 34)
    # 2) 八音盒把主题头哼一遍（前 2.6 秒）
    for off, m, d, v in HOOK:
        if off < 2.6:
            add('bell', 0.12 + off, m, d * 1.15, 122 if off < 1.6 else 108)
    # 3) 萤火 16 分（2 小节）
    pat = [64, 71, 76, 71, 64, 71, 78, 76]
    for i in range(16 * 2):
        tt = bar_t(3, 0) + i * BEAT / 4
        m = pat[i % 8] + (12 if (i // 16) % 2 else 0)
        add('arp', tt, m, 0.09, 30 + (i % 4) * 4 + (i // 16) * 4)
    # 4) 心跳 + 钟摆
    for k in (0.0, 2.4, 4.8):
        drum(k, 0, 62)
        drum(k + 0.75, 0, 42)
    for i in range(6):
        add('tick', 0.9 + i * 0.775, 92, 0.08, 44 if i % 2 else 56)
    # 5) bar4-5：原曲引子 riff（85%），bar5 起铜管长音铺底
    block([2, 4, 5, 9], 4, 5, bar_t(4, 0), vel=0.85)
    for m in (76, 79, 83):
        add('bell', bar_t(5, 0), m, 0.4, 56)
    add('brass', bar_t(5, 0), 64, 1.35 * BAR, 58)
    add('brass', bar_t(5, 0), 71, 1.35 * BAR, 52)
    # 6) 过门
    for i in range(8):
        drum(bar_t(5, 2) + i * BEAT * 0.5, 1, 32 + i * 9)
    for i in range(4):
        drum(bar_t(6, 0) + i * BEAT * 0.25, 1, 96 + i * 2)
    add('riser', bar_t(5, 2), 39, 2.4, 96)
    add('reverse', bar_t(6, 2), 82, 1.2, 72)
    drum(bar_t(6, 3.5), 4, 92)

def sec_break():
    b = T_BREAK
    for i, m in enumerate([40, 47, 56, 59]):
        add('pad', b, m, 4.2 * BAR, 48 - i * 3)
    add('choir', b + 0.6, 56, 3.6, 30)
    frag = [(0.6, 76, 0.7), (1.5, 79, 0.6), (2.4, 83, 0.8), (3.6, 79, 0.6), (4.5, 76, 0.9)]
    for off, m, d in frag:
        add('bell', b + off, m, d, 96)
    # 主题头碎片（B5-A5-B5-E5）：别让耳朵断了线
    for off, m, d in ((1.2, 83, 0.55), (1.9, 81, 0.5), (2.6, 83, 0.6), (3.3, 76, 0.75)):
        add('bell', b + off, m, d, 104)
        add('piano', b + off, m - 12, d, 56)
    # 萤火 tremolo
    for i in range(32):
        tt = b + bar_t(2, 0) - bar_t(1, 0) + i * BEAT / 4
        add('arp', tt, 76 if i % 2 else 79, 0.08, 26 + (i % 4) * 3)
    for i in range(4):
        drum(b + i * BAR, 0, 58)
        drum(b + i * BAR + 0.95, 0, 40)
    add('riser', b + 2.6 * BAR, 51, 2.2, 104)
    add('reverse', b + 3.3 * BAR, 82, 1.2, 84)
    drum(b + 3.55 * BAR, 4, 88)
    for i in range(8):
        drum(b + 3.3 * BAR + i * BEAT * 0.5, 1, 36 + i * 10)

def sec_rep1():
    """再现 I：A' 主题旋律整体上八度 + 句尾 16 分琶音装饰；伴奏照旧但撤 ride"""
    b = T_REP1
    block([2, 3, 4, 5, 6, 7, 8, 9, 11, 14], 19, 26, b, mode="big", vel=1.0)
    for n in pick([0], 19, 26):
        t = n['t'] - bar_t(19, 0) + b
        m, d, v = n['m'], n['d'], n['v']
        add('lead', t, m + 12, d * 0.95, min(127, int(v * 1.30)))
        add('piano', t, m + 12, d * 0.7, int(v * 0.26))
        if m + 24 <= 100:
            add('bell', t, m + 24, min(d, 0.5), int(v * 0.20))
        add('strings', t, m + 12, min(d, 1.4), 44)
    # 句尾琶音装饰：第 22、26 小节末尾（E 小调三和弦上行）
    for bar in (22, 26):
        t0 = b + (bar - 19) * BAR + 3.5 * BEAT
        for i, m in enumerate((76, 79, 83, 88)):
            add('lead', t0 + i * BEAT / 4, m + 12, 0.09, 96 + i * 6)
            add('bell', t0 + i * BEAT / 4, m + 12, 0.14, 52)
    # ch11 和声进铜管（低力度）
    for n in pick([11], 19, 26):
        t = n['t'] - bar_t(19, 0) + b
        add('brass', t, n['m'], min(n['d'], 0.8), 54)
    drum(b, 4, 82)

def sec_rep2():
    """再现 II：四度叠置和声 + 弦乐/合唱八度；末 4 小节整体升半音"""
    b = T_REP2
    block([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14], 35, 38, b, mode="huge", vel=1.0)
    block([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14], 39, 42, b + 4 * BAR, mode="huge", vel=1.0, transpose=1)
    for n in pick([0], 35, 42):
        t = n['t'] - bar_t(35, 0) + b
        tr = 1 if n['bar'] >= 39 else 0
        m, d, v = n['m'] + tr, n['d'], n['v']
        add('lead', t, m, d * 0.95, min(127, int(v * 1.42)))
        add('brass', t, m + 5, min(d, 1.0), int(v * 0.40))      # 四度叠置
        add('strings', t, m + 12, min(d, 1.5), int(v * 0.34))
        if m + 12 <= 100:
            add('bell', t, m + 12, min(d, 0.5), int(v * 0.20))
    # ch11 和声 -> 铜管 + 合唱
    for n in pick([11], 35, 42):
        t = n['t'] - bar_t(35, 0) + b
        tr = 1 if n['bar'] >= 39 else 0
        add('brass', t, n['m'] + tr, min(n['d'], 0.9), 60)
        add('choir', t, n['m'] + tr + 12, min(n['d'], 1.2), 38)
    drum(b, 4, 92)

def sec_outro():
    """原曲尾奏 riff（bar43-50）放到再现之后：先响完主题，再让尾奏收束"""
    b = T_OUTRO
    block([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14], OUTRO[0], OUTRO[1], b, mode="big", vel=1.0)
    # 主题头碎片，接进尾声八音盒
    for i, (off, m) in enumerate(((4.2, 83), (4.65, 81), (5.1, 83), (5.55, 76))):
        add('bell', b + off, m, 0.5, 92 + i * 4)
    drum(b, 4, 90)
    drum(b + 7 * BAR, 4, 84)

def sec_coda():
    b = T_CODA
    for off, m, d, v in HOOK:
        add('bell', b + 0.1 + off, m, d * 1.1, 124 if off < 2.2 else 110)
    tail = [(5.0, 76, 0.6), (5.5, 79, 0.55), (6.0, 83, 0.8), (6.8, 88, 1.2)]
    for off, m, d in tail:
        add('bell', b + off, m, d, 100)
    for i, m in enumerate([40, 47, 52, 56]):
        add('pad', b, m, 5.6, 42 - i * 3)
    add('choir', b + 0.4, 56, 4.6, 30)
    for m in (52, 56, 59):
        add('strings', b, m, 5.6, 34)
    # 悬置收束：A -> G -> B（原曲手法），B 上做全奏长音 + 吊镲
    tA = b + 4 * BAR
    for i, m in enumerate([45, 52, 57, 61]):
        add('strings', tA, m, 0.9 * BAR, 44 - i * 2)
        add('pad', tA, m, 0.9 * BAR, 38 - i * 2)
    tG = tA + 1.0 * BAR
    for i, m in enumerate([43, 50, 55, 59]):
        add('strings', tG, m, 0.9 * BAR, 42 - i * 2)
        add('pad', tG, m, 0.9 * BAR, 36 - i * 2)
    tB = tG + 1.0 * BAR
    hold = DUR - tB - 0.08
    for i, m in enumerate([59, 63, 66, 71]):
        add('strings', tB, m, hold, 52 - i * 2)
        add('pad', tB, m, hold, 44 - i * 2)
        add('choir', tB, m, hold * 0.96, 40 - i * 2)
        add('brass', tB, m, hold, 40 - i * 3)
    add('bass', tB, 47, hold, 82)
    add('bass', tB, 35, hold, 64)
    add('piano', tB, 71, hold, 52)
    add('piano', tB, 59, hold, 44)
    add('bell', tB, 71, hold, 112)
    add('bell', tB, 83, hold, 96)
    add('bell', tB, 59, hold * 0.8, 84)
    # 末 2 小节：吊镲 + 低频落地 + 八音盒末音延到最后一拍
    drum(tB, 4, 96)
    drum(tB, 0, 92)
    drum(b + 7 * BAR, 4, 88)
    drum(b + 7 * BAR, 0, 80)
    add('bell', b + 7 * BAR, 83, DUR - (b + 7 * BAR) - 0.05, 100)
    for i in range(3):
        drum(b + 0.2 + i * 2.5, 0, 52)
        drum(b + 0.95 + i * 2.5, 0, 36)
    for i in range(4):
        add('tick', b + 1.2 + i * 1.55, 92, 0.08, 32)

# ---- 输出 ----
def secs():
    m = T_MAIN
    def at(bar):
        return T_MAIN + (bar - MAIN_A[0]) * BAR
    return [
        ('intro', T_INTRO, T_MAIN),
        ('A', at(10), at(19)),
        ('A2', at(19), at(27)),
        ('B', at(27), at(35)),
        ('B2', at(35), at(43)),
        ('break', T_BREAK, T_REP1),
        ('rep1', T_REP1, T_REP2),
        ('rep2', T_REP2, T_OUTRO),
        ('outro', T_OUTRO, T_CODA),
        ('coda', T_CODA, DUR),
    ]

def main():
    TRACKS.extend([
        ('lead', 'square', 0.300), ('piano', 'triangle', 0.080),
        ('harpsi', 'square', 0.135), ('arp', 'sine', 0.160),
        ('strings', 'sawtooth', 0.100), ('choir', 'sine', 0.075),
        ('bass', 'triangle', 0.146), ('sub', 'sine', 0.082),
        ('bell', 'sine', 0.135), ('pad', 'sine', 0.090),
        ('counter', 'triangle', 0.115), ('guitar', 'sawtooth', 0.095),
        ('brass', 'square', 0.172), ('tick', 'square', 0.085),
        ('riser', 'sawtooth', 0.050), ('reverse', 'sawtooth', 0.045),
    ])
    for n, w, g in TRACKS:
        BY[n] = []
    sec_intro()
    faithful(MAIN_A[0], MAIN_A[1], T_MAIN)
    sparkle(19, 26, [88, 83, 91, 88, 93, 88, 91, 83], T_MAIN, 44)
    sparkle(35, 42, [85, 80, 88, 85, 90, 85, 88, 80], T_MAIN, 44)
    sec_break()
    sec_rep1()
    sec_rep2()
    sec_outro()
    sec_coda()
    shape_rep_drums(T_REP1, T_REP2)
    js_tracks = []
    for n in [t[0] for t in TRACKS]:
        notes = sorted(BY[n], key=lambda x: x[0])
        if notes:
            wave, gain = [(w, g) for nm, w, g in TRACKS if nm == n][0]
            js_tracks.append({'name': n, 'wave': wave, 'gain': gain, 'notes': notes})
    drums = sorted(DRUMS, key=lambda x: x[0])
    last = 0.0
    for tr in js_tracks:
        for nt in tr["notes"]:
            last = max(last, nt[0] + nt[2])
    payload = {'title': TITLE, 'duration': round(DUR, 3), 'bpm': BPM,
               'tracks': js_tracks, 'drums': drums}
    js = []
    js.append('// 生成物：tools/build/_wrig_compose.py（勿手改）')
    js.append('// 素材：ZUN「蠢蠢秋月 ～ Mooned Insect」TH08 扒谱 MIDI，原曲 bar10-42 + 尾奏 43-50 逐音搬入')
    js.append('export const WRIGGLE_STAGE2 = {')
    js.append('  stage2: ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ',')
    js.append('};')
    open(OUT_JS, 'w', encoding='utf-8').write('\n'.join(js) + '\n')
    json.dump(payload, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
    sec_list = [[n, round(a, 3), round(b, 3)] for n, a, b in secs()]
    json.dump({'_dur': round(DUR, 3), 'bpm': BPM, 'bar': round(BAR, 6),
               'secs': sec_list}, open(SEC_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
    print('wrote', OUT_JS, 'dur', round(DUR, 3), 'notes', sum(len(t['notes']) for t in js_tracks),
          'drums', len(drums), 'tracks', len(js_tracks), 'last', round(last, 3))

if __name__ == '__main__':
    main()