# -*- coding: utf-8 -*-
"""tools/build/_kag_compose.py -- 第六面 Boss《竹取飛翔 ～ Lunatic Princess》（月之公主编）

素材 = ZUN 原曲 TH08 扒谱 MIDI「15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid」
  原曲 160.5 秒 / 154 BPM 主体 / F 小调 → 降 B 小调 → B 小调（+1 半音）→ 降 A 悬置尾奏。
本脚本把 tempo 抹平到恒定 154 BPM（t = tick * BEAT / 480），搬入原曲第 6-101 小节，
前后各加 4 小节新写的「月」引子与「夜明け前」尾声。段落按原曲实际密度变化切分：

  新小节      原曲块            内容
  1-4         ——               月 / 竹 / 永夜（新写：八音盒预告主旋律、钟摆、心跳）
  5-17        k5-17            钢琴十六分跑句（原曲 6-18）
  18-33       k18-33           小号主题（原曲 19-34，8+8 原样重复）
  34-35       k34-35           只有鼓的 break
  36-51       k36-51           钢琴固定音型（原曲 37-52）
  52          k52              一小节上行 riser
  53-59       k53-59           C1 主题陈述（鼓几乎全空）
  60-67       k60-67           C2 主题复述（鼓入）
  68-75       k68-75           C3 副歌高音区
  76-83       k76-83           D1 升半音（鼓抽空）
  84-91       k84-91           D2 升半音副歌（鼓入）
  92-100      k92-100          原曲尾奏
  101-104     ——               夜明け前（新写：八音盒收束、悬置到 Fm(add9)）

生成 src/engine/songs/kaguya_stage6.js（导出 KAGUYA_STAGE6.stage6）
与 tools/build/_kag_lead/{song.json,secs.json}
"""
import os, json, collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEAD = os.path.join(ROOT, 'tools', 'build', '_kag_lead')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'kaguya_stage6.js')
OUT_JSON = os.path.join(LEAD, 'song.json')
SEC_JSON = os.path.join(LEAD, 'secs.json')

BPM = 154.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
N_INTRO = 4
K0, K1 = 5, 100          # 原曲块 5..100（原曲小节 6-101）
N_ORIG = K1 - K0 + 1     # 96
N_CODA = 4
N_BARS = N_INTRO + N_ORIG + N_CODA
DUR = round(N_BARS * BAR, 3)

NOTES = json.load(open(os.path.join(LEAD, 'midi_flat.json'), encoding='utf-8'))['notes']
for n in NOTES:
    n['k'] = int(round(n['t'] / BEAT * 480)) // 1920

BY, TRACKS, DRUMS = {}, [], []

def add(name, t, m, d, v=100):
    if t < 0 or not (0 <= m <= 127) or t >= DUR - 0.02:
        return
    d = min(max(0.03, d), DUR - t - 0.005)
    if d <= 0.02:
        return
    if name == 'sub' and m < 28:
        m += 12
    BY.setdefault(name, []).append([round(t, 3), int(round(m)), round(d, 3), int(max(1, min(127, round(v))))])

def drum(t, kind, vel=100, span=None):
    if t < 0 or t >= DUR - 0.01:
        return
    DRUMS.append([round(t, 3), kind, int(max(1, min(127, round(vel))))] + ([round(span, 3)] if span else []))

def bt(bar, beat=0.0):
    return (bar - 1) * BAR + beat * BEAT

def nb(k):
    """原曲块号 -> 新小节号"""
    return k

SEC = [('intro', 1, 4), ('A1', 5, 17), ('B', 18, 33), ('break', 34, 35), ('C', 36, 51),
       ('riser', 52, 52), ('C1', 53, 59), ('C2', 60, 67), ('C3', 68, 75),
       ('D1', 76, 83), ('D2', 84, 91), ('outro', 92, 100), ('coda', 101, 104)]
SEC_OF = {}
for name, a, b in SEC:
    for x in range(a, b + 1):
        SEC_OF[x] = name

# ---------------- 每小节低音 / 和弦音 ----------------
BARINFO = {}
for k in range(K0, K1 + 1):
    ns = [n for n in NOTES if n['k'] == k]
    bass = sorted([n for n in ns if n['ch'] == 1], key=lambda n: n['m'])
    BARINFO[k] = {'root': bass[0]['m'] if bass else 53,
                  'pcs': collections.Counter(n['m'] % 12 for n in ns if n['ch'] in (1, 4, 5, 6, 10, 11))}

# ---------------- 原曲逐音搬入 ----------------
DRUM_MAP = {36: 0, 35: 0, 38: 1, 39: 1, 40: 1, 37: 1, 42: 2, 44: 2, 46: 3, 49: 4,
            51: 7, 53: 7, 41: 5, 43: 5, 45: 5, 47: 5, 48: 6, 50: 6}

def voice(n):
    ch, k, m, d, v = n['ch'], n['k'], n['m'], n['d'], n['v']
    bar = nb(k)
    t = bt(bar, n['beat']) if n['k'] < 52 else n['t'] + (N_INTRO * BAR - K0 * BAR)
    # 块 52 之后（含 2/4 争议区）直接用绝对时间平移，避免小节错位
    t = n['t'] + (N_INTRO - K0) * BAR
    sec = SEC_OF.get(bar, '?')
    if ch == 0:                                    # 钢琴
        if k <= 52 or k >= 92:                     # 跑句 / 固定音型 / 尾奏：当主旋律
            add('lead', t, m, d, v * 0.95)
            add('piano', t, m, max(0.05, d * 0.96), v * 0.40)
            if d >= 0.3 and m + 12 <= 100 and bell_ok(0, k, t, m):
                add('bell', t, m + 12, min(0.9, d * 0.8), v * 0.20)
            elif v >= 100 and d >= 0.2:
                add('bell', t, m + 12 if m + 12 <= 100 else m, 0.4, v * 0.26)
        else:                                      # 副歌区：退成伴奏
            add('piano', t, m, max(0.05, d * 0.96), v * 0.62)
            if d >= 0.5:
                add('arp', t, m, max(0.05, d * 0.9), v * 0.30)
    elif ch == 3:
        add('arp', t, m, max(0.05, d * 0.92), v * 0.66)
        add('piano', t, m, max(0.05, d * 0.9), v * 0.28)
    elif ch == 4:
        if d >= 0.6:
            add('pad', t, m, d, v * 0.58)
        else:
            add('arp', t, m, max(0.05, d * 0.9), v * 0.34)
    elif ch == 5:
        add('harpsi', t, m, max(0.05, d * 0.94), v * (0.66 if k >= 53 else 0.80))
        if d >= 0.4:
            add('bell', t, m + 12 if m + 12 <= 100 else m, min(0.8, d * 0.8), v * 0.18)
    elif ch in (6, 7):
        add('strings', t, m, d, v * (0.95 if ch == 6 else 0.72))
        if ch == 6 and d >= 0.6:
            add('choir', t, m + 12 if m + 12 <= 96 else m, d, v * 0.34)
    elif ch == 8:                                  # SquareLead：全曲主旋律本体
        add('lead', t, m, d, v * 0.98)
        if m + 12 <= 100 and bell_ok(8, k, t, m):
            add('bell', t, m + 12, min(1.2, d * 0.95), v * 0.42)
        add('piano', t, m, max(0.05, d * 0.9), v * 0.30)
        if k >= 68:                                # C3/D1/D2：副歌高音区，加厚成全曲最亮
            add('strings', t, m + 12 if m + 12 <= 96 else m, d, v * 0.18)
            add('brass', t, m, d, v * 0.42)
            add('choir', t, m + 12 if m + 12 <= 96 else m, d, v * 0.30)
    elif ch == 10:
        add('brass', t, m, d, v * 0.92)
        if d >= 0.9:
            add('strings', t, m, d, v * 0.34)
    elif ch == 11:
        add('brass', t, m, d, v * 0.72)
        add('bell', t, m + 12 if m + 12 <= 100 else m, min(1.0, d * 0.9), v * 0.18)
    elif ch == 13:
        add('counter', t, m, max(0.05, d * 0.9), v * 0.85)
    elif ch == 1:
        # C1（53-61）的 Bb 持续低音本来最厚，压到 0.45；副歌区整体 0.86
        bv = 0.45 if 53 <= k <= 61 else (0.86 if k >= 62 else 0.95)
        add('bass', t, m, d, v * bv)
        add('sub', t, m - 12, d, v * 0.42 * (0.80 if k >= 53 else 1.0))
    elif ch == 9:
        kind = DRUM_MAP.get(m)
        if kind is not None:
            drum(t, kind, v * 0.92)

ALL_AT = [(n['t'], n['m']) for n in NOTES]


def pcd(a, b):
    d = abs(a % 12 - b % 12)
    return min(d, 12 - d)


def bell_ok(ch, k, t, m):
    """八音盒 +12 加倍等于同音级；若同时刻有半音邻音就跳过，避免小二度/小九度撞音"""
    for t2, m2 in ALL_AT:
        if abs(t2 - t) < 1.6 and pcd(m2, m) == 1 and not (m2 % 12 == m % 12):
            return False
    return True


for n in NOTES:
    if K0 <= n['k'] <= K1:
        voice(n)

# ---------------- 新写引子：月、竹、永夜 ----------------
# 主旋律（原曲 C1，ch8 bars 54-56）的动机，改用 F 小调同一串音高预告
THEME = [(0.0, 77), (1.0, 70), (2.0, 77), (3.0, 70),
         (4.0, 70), (4.5, 75), (5.0, 77), (5.5, 80), (6.0, 77), (6.5, 75), (7.0, 70)]

def sec_intro():
    for bar, chord, vel in ((1, (41, 48, 56), 46), (2, (41, 48, 56), 42),
                            (3, (39, 46, 53, 58), 46), (4, (39, 46, 53, 58), 42)):
        for m in chord:
            add('pad', bt(bar), m, BAR * 1.02, vel)
            add('choir', bt(bar), m + 12 if m + 12 <= 96 else m, BAR * 0.98, int(vel * 0.6))
    add('strings', bt(1), 41, BAR * 2, 52)
    add('strings', bt(3), 39, BAR * 2, 52)
    # 八音盒：主旋律动机，先高八度再原调
    for i, (beat, m) in enumerate(THEME):
        if beat < 4:
            add('bell', bt(1, beat), m + 12, 0.5, 96 - i * 2)
        else:
            add('bell', bt(2, beat - 4), m + 12, 0.5, 88 - (i - 4) * 3)
    for beat, m in THEME[:7]:
        add('bell', bt(3, beat), m, 0.5, 70)
    for beat, m in THEME[4:]:
        add('bell', bt(4, beat - 4), m, 0.5, 62)
    # 大键琴：竹取式的月华分解（Fm）
    for i in range(16):
        bar = 1 + i // 4
        beat = (i % 4) * 1.0
        m = (53, 60, 65, 68)[i % 4]
        add('harpsi', bt(bar, beat), m, 0.5, 44 if i % 2 == 0 else 34)
        add('harpsi', bt(bar, beat + 0.5), m + 7, 0.34, 28)
    for i in range(16):
        add('tick', bt(1, 0) + i * BEAT, 93, 0.09, 46 if i % 2 == 0 else 36)
    for bar in (1, 2, 3):
        drum(bt(bar, 0), 0, 50)
        drum(bt(bar, 2), 0, 32)
    for i in range(8):
        drum(bt(4, 2.0 + i * 0.25), 1, 40 + i * 4)
    drum(bt(4, 3.5), 4, 80)
    add('riser', bt(3, 2.0), 60, BAR * 0.9, 56)
    add('reverse', bt(4, 0.0), 60, 0.9, 64)

# ---------------- 新写尾声：夜明け前 ----------------
def sec_coda():
    b0 = N_INTRO + N_ORIG + 1
    for i, (beat, m) in enumerate(THEME):
        if i < 8:
            add('bell', bt(b0, beat), m, 0.6, 104 - i * 3)
            add('harpsi', bt(b0, beat), m + 12, 0.24, 38)
        else:
            add('bell', bt(b0 + 1, beat - 8), m, 0.6, 88)
    for i in range(8):
        add('arp', bt(b0 + 2, i * 0.5), (65, 68, 72, 75)[i % 4], 0.22, 36 - i)
    add('strings', bt(b0 + 2), 53, BAR, 46)
    add('choir', bt(b0 + 2), 65, BAR, 36)
    for m, v in ((41, 46), (48, 40), (55, 34), (67, 26)):
        add('pad', bt(b0 + 3), m, BAR * 0.98, v)
    add('bell', bt(b0 + 3), 77, BAR * 0.96, 72)
    add('bell', bt(b0 + 3, 2.0), 84, 0.8, 52)
    add('bass', bt(b0 + 3), 29, BAR * 0.98, 62)
    add('tick', bt(b0 + 3, 3.0), 93, 0.09, 32)
    drum(bt(b0 + 2, 2.5), 5, 46)
    drum(bt(b0 + 3), 4, 60)

# ---------------- 织体：永夜的铺底 / 月光 / 鼓 ----------------
STR_AT = {}
for _n in NOTES:
    if _n['ch'] in (6, 7):
        STR_AT.setdefault(_n['k'], []).append(_n['m'])


def pad_layer():
    for k in range(K0, K1 + 1):
        bar = nb(k)
        root = BARINFO[k]['root']
        while root >= 52:
            root -= 12
        if any(pcd(m2, root) == 1 for m2 in STR_AT.get(k, [])):
            continue      # 与弦乐长音成半音就别铺这根踏板音，宁缺毋滥
        add('pad', bt(bar), root, BAR * 0.98, 32)
        add('pad', bt(bar), root + 12 if root + 12 <= 60 else root, BAR * 0.98, 24)

MOON = [(89, 84, 91, 86), (84, 91, 86, 93), (86, 89, 84, 91), (91, 86, 93, 89)]

def moonlight():
    # 每个段落交界一记玻璃月华；副歌区再补高音闪片
    for bar in (5, 18, 36, 53, 60, 68, 76, 84, 92):
        add('bell', bt(bar, 3.0), 89, 0.5, 44)
        add('bell', bt(bar, 3.5), 77, 0.4, 30)
    for bar in range(53, 92):
        pat = MOON[bar % 4]
        if SEC_OF.get(bar) in ('C1', 'C2', 'C3', 'D1', 'D2'):
            add('bell', bt(bar, 3.75), pat[0], 0.3, 26)
    # C1 / D1：鼓抽空的段落，用钟摆维持脉搏
    for sec in ('C1', 'D1'):
        for bar in range(1, N_BARS + 1):
            if SEC_OF.get(bar) == sec:
                for i in range(8):
                    add('tick', bt(bar, i * 0.5), 93, 0.10, 120 if i % 2 == 0 else 104)
                    add('wood', bt(bar, i * 0.5), 86, 0.09, 78 if i % 2 == 0 else 64)

def shape_drums():
    # 段头吊镲
    for bar, vel in ((5, 86), (18, 82), (36, 92), (52, 74), (53, 70), (60, 96), (68, 92),
                     (76, 72), (84, 100), (92, 78)):
        drum(bt(bar), 4, vel)
    # C2 / C3 / D2：原曲鼓已密，只补四踩底鼓的弱拍
    for sec, vel in (('C2', 74), ('C3', 78), ('D2', 82)):
        for bar in range(1, N_BARS + 1):
            if SEC_OF.get(bar) == sec:
                drum(bt(bar, 1.5), 0, vel)
                drum(bt(bar, 3.5), 0, vel - 6)
    # C1 / D1：鼓抽空，只留极轻的底鼓
    for sec in ('C1', 'D1'):
        for bar in range(1, N_BARS + 1):
            if SEC_OF.get(bar) == sec:
                drum(bt(bar), 0, 58)
    # 句尾通鼓
    for bar in (17, 33, 51, 59, 67, 75, 83, 91, 100):
        for i in range(4):
            drum(bt(bar, 3.0 + i * 0.25), 5 if i < 2 else 6, 54 + i * 5)
    # 尾声前滚奏
    for i in range(8):
        drum(bt(100, 3.0 + i * 0.125), 1, 44 + i * 4)

# ================= 第二版：八条改进 =================
STR_LONG = {}
for _n in NOTES:
    if _n['ch'] in (6, 7) and _n['d'] >= 0.75:
        STR_LONG.setdefault(_n['k'], set()).add(_n['m'])


def _in_band_root(k):
    return _fit_band(BARINFO[k]['root'])


def _fit_band(m):
    """把音高挪进 MIDI 36-47（65-123 Hz），给 63-125Hz 当地基"""
    while m < 36:
        m += 12
    while m > 47:
        m -= 12
    return m


def _pedal_pitch(bar, r):
    """根音优先，撞半音就换五度；都撞就给 None"""
    for pc in (r, r + 7):
        cand = _fit_band(pc)
        if not any(pcd(m2, cand) == 1 for m2 in STR_LONG.get(bar, ())):
            return cand
    return None


def postprocess():
    tA, tB, tM = bt(18), bt(34), bt(26)
    # (1) B 段：鼓让 1.9dB，小号旋律全段加弦乐齐奏（只加倍完整落在 B 里的音）
    mel = [n for n in BY.get('brass', []) if tA <= n[0] < tB]
    for t, m, d, v in mel:
        if t + d <= tB - 0.06:
            add('strings', t, m, d, v * 0.22)
    for bar in range(18, 34):
        for e in DRUMS:
            if bt(bar) <= e[0] < bt(bar) + BAR:
                e[2] = int(round(e[2] * 0.80))
    # (2) B 段后半：换织体——旋律 +12 走 counter 声部、ride 加满、段头吊镲
    for t, m, d, v in mel:
        if t >= tM and m + 12 <= 100:
            add('counter', t, m + 12, d, v * 0.55)
    for bar in range(26, 34):
        for i in range(8):
            drum(bt(bar, i * 0.5), 7, 30 if i % 2 == 0 else 24)
    drum(tM, 4, 80)
    # (3) C3（68-75）鼓收 2.4dB，主旋律靠 lead 增益 +0.4dB 站住
    t3a, t3b = bt(68), bt(76)
    for e in DRUMS:
        if t3a <= e[0] < t3b:
            e[2] = int(round(e[2] * (0.55 if e[1] in (2, 3) else (0.85 if e[1] == 0 else 0.78))))
    for t, m, d, v in BY.get('lead', []):
        if t3a <= t < t3b:
            add('counter', t, m, d, v * 0.85)
    # (4) C1 / D1 两次鼓抽空：留带 body 的底鼓 + 63-125Hz 低音踏板
    for bar in list(range(53, 60)) + list(range(76, 84)):
        drum(bt(bar), 0, 86)
        drum(bt(bar, 2.5), 0, 56)
        r = _pedal_pitch(bar, _in_band_root(bar))
        if r is None:
            continue
        add('bass', bt(bar), r, BAR * 0.92, 84)
        add('sub', bt(bar), r - 12, BAR * 0.90, 40)
    # (6) 引子补地基；尾声 103 小节全奏长音 + 吊镲，104 才交给八音盒
    add('bass', bt(1), 41, BAR * 1.96, 58)
    add('bass', bt(3), 39, BAR * 1.96, 54)
    add('sub', bt(1), 29, BAR * 1.90, 46)
    add('sub', bt(3), 27, BAR * 1.90, 44)
    for bar in (2, 4):
        drum(bt(bar, 2.5), 0, 40)
    for bar, r in ((101, 41), (102, 41), (103, 46), (104, 39)):
        add('bass', bt(bar), r, BAR * 0.90, 58)
        add('sub', bt(bar), r - 12, BAR * 0.88, 36)
    for m in (51, 55, 58, 63):
        add('strings', bt(103), m, BAR * 0.95, 58)
    for m in (51, 58, 63):
        add('brass', bt(103), m, BAR * 0.95, 52)
    add('choir', bt(103), 58, BAR * 0.92, 40)
    drum(bt(103), 4, 84)
    drum(bt(103), 0, 64)
    # (8) 全曲 63-125Hz 地基：每小节一根 band 内的低音踏板
    for bar in range(5, 101):
        r = _pedal_pitch(bar, _in_band_root(bar))
        if r is None:
            continue
        add('bass', bt(bar), r, BAR * 0.95, 64)
        add('sub', bt(bar), r, BAR * 0.97, 90)


sec_intro()
pad_layer()
moonlight()
sec_coda()
shape_drums()
postprocess()

# ---------------- 输出 ----------------
TRACK_DEFS = [
    ('lead',    'sawtooth', 0.325),
    ('piano',   'triangle', 0.075),
    ('harpsi',  'square',   0.165),
    ('arp',     'sine',     0.120),
    ('strings', 'sawtooth', 0.125),
    ('choir',   'sine',     0.078),
    ('brass',   'square',   0.166),
    ('bass',    'triangle', 0.152),
    ('sub',     'sine',     0.086),
    ('bell',    'sine',     0.120),
    ('pad',     'sine',     0.075),
    ('counter', 'sawtooth', 0.175),
    ('tick',    'square',   0.170),
    ('wood',    'sine',     0.085),
    ('riser',   'sawtooth', 0.050),
    ('reverse', 'sawtooth', 0.045),
]
out_tracks = []
for name, wave, gain in TRACK_DEFS:
    ns = sorted(BY.get(name, []))
    if ns:
        out_tracks.append({'name': name, 'wave': wave, 'gain': gain, 'notes': ns})
srt = sorted(DRUMS)
song = {'title': '竹取飛翔 ～ Lunatic Princess（月之公主编）', 'duration': DUR, 'bpm': BPM,
        'tracks': out_tracks, 'drums': srt}
js = '// 由 tools/build/_kag_compose.py 生成，勿手改。\n'
js += 'export const KAGUYA_STAGE6 = {\n  stage6: ' + json.dumps(song, ensure_ascii=False, separators=(',', ':')) + ',\n};\n'
open(OUT_JS, 'w', encoding='utf-8').write(js)
json.dump(song, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False)

secjson = [[name, round(bt(a), 3), round(bt(b) + BAR, 3)] for name, a, b in SEC]
json.dump({'secs': secjson, '_dur': DUR}, open(SEC_JSON, 'w', encoding='utf-8'), ensure_ascii=False)

print('notes', sum(len(t['notes']) for t in out_tracks), 'drums', len(srt), 'tracks', len(out_tracks), 'dur', DUR)
print('secs', secjson)
for t in out_tracks:
    ns = t['notes']
    print('%-8s %-9s %.3f n=%-5d %d-%d' % (t['name'], t['wave'], t['gain'], len(ns),
          min(x[1] for x in ns), max(x[1] for x in ns)))
