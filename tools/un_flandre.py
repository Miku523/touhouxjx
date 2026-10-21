# -*- coding: utf-8 -*-
"""EX 曲：U.N.オーエンは彼女なのか？ —— 芙兰朵露·斯卡雷特重编曲（试听稿 v2）。

蓝本（用户 m01402 / m01481「调用一切工具，这个无限制」）：
  1. 第一首 = ZUN 原曲（本地 MIDI 逐音采样：ch6 高位琶音+和弦、ch2 低八度加倍、
     ch9 半音 16 分低音引擎、ch4 弦乐铺底、ch1 内声部）
  2. 游戏内 EX 曲同源素材（同一首 ZUN 曲的 8bit 版）
  3. 辅 = 最終鬼畜妹：四踩、16 分踩镲、八度加倍、半音乱流

人设三要素：疯狂（琶音机器 + 半音低音） / 力量（双层贝斯 + 四踩 + 军鼓滚） /
孤独（57-64 小节全曲抽空，只剩音乐盒与心跳）

输出 src/engine/songs/un_flandre.js（试听稿，不接 index.js）
"""
import json
import os
import sys

_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isdir(os.path.join(_d, 'src')) and _d != os.path.dirname(_d):
    _d = os.path.dirname(_d)
BASE = _d
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SRC = json.load(open(os.path.join(BASE, 'tools', 'build', '_un_orig.json'), encoding='utf-8'))
OUT_JS = os.path.join(BASE, 'src', 'engine', 'songs', 'un_flandre.js')
OUT_JSON = os.path.join(BASE, 'tools', 'build', '_un_flandre.json')

BPM = 172.0
BAR = 240.0 / BPM                 # 1.39535 s
BARS = 96
DUR = BARS * BAR
SRC_BPM = SRC['bpm']
SRC_BAR = 240.0 / SRC_BPM         # 1.5484 s
RATIO = BAR / SRC_BAR             # 0.9014（同一音符时值在 172 下的缩放）

segs = [(s, u) for (s, u) in SRC['tempo']]


def beat_of(t):
    b = 0.0
    for i, (s0, uspq) in enumerate(segs):
        s1 = segs[i + 1][0] if i + 1 < len(segs) else 1e18
        dt = min(t, s1) - s0
        if dt > 0:
            b += dt * 1e6 / uspq
    return b


def load_layer(ch):
    """→ [(bar, beat(0-4 浮点), midi, 时值拍, vel)]"""
    out = []
    for (t, m, du, v) in SRC['channels'][ch]['notes']:
        b0 = beat_of(t)
        bar = int(b0 // 4)
        bt = b0 - bar * 4
        nb = beat_of(t + du) - b0
        out.append([bar, round(bt, 4), m, max(0.02, nb), v])
    out.sort(key=lambda x: (x[0], x[1], -x[2]))
    return out


L = {ch: load_layer(ch) for ch in ('6', '2', '9', '4', '1', '3', '5', '8')}
print('源层：' + ' '.join('ch%s=%d' % (k, len(v)) for k, v in L.items()))


def ln(notes, b0, b1):
    return [n for n in notes if b0 <= n[0] < b1]


# ---------------------------------------------------------------- 编曲器
trk = {'lead': [], 'harm': [], 'bass': [], 'pad': []}


def add(name, t, m, d, v):
    if 0 <= t < DUR - 0.02 and 0.03 <= d <= 8.0 and 24 <= m <= 108:
        trk[name].append([round(t, 4), int(m), round(min(d, 8.0), 4), int(max(1, min(127, v)))])


def place(name, notes, src_b0, tgt_b0, transpose=0, vel=112, dur_scale=0.92, max_pitch=999):
    """把源层 src_b0 起的一组小节搬到目标小节。"""
    ns = sorted(notes, key=lambda n: (n[0], n[1]))
    for i, (bar, bt, m, beats, v) in enumerate(ns):
        t = (tgt_b0 + bar - src_b0) * BAR + bt * BAR / 4.0
        d = beats * BAR / 4.0 * dur_scale
        # 同层相邻音不叠：截断到下一个同层起音前
        for (bar2, bt2, m2, b2, v2) in ns[i + 1:i + 3]:
            if bar2 == bar and bt2 > bt:
                d = min(d, (bt2 - bt) * BAR / 4.0 * dur_scale)
                break
        if m + transpose <= max_pitch:
            add(name, t, m + transpose, max(d, 0.03), int(min(127, v * vel / 112.0)))


def split_top(notes, b0, b1):
    """按同一起音点分组：最高音 → lead，其余 → harm。"""
    groups = {}
    for n in ln(notes, b0, b1):
        groups.setdefault((n[0], n[1]), []).append(n)
    top, rest = [], []
    for k in sorted(groups):
        g = sorted(groups[k], key=lambda n: -n[2])
        top.append(g[0])
        rest.extend(g[1:])
    return top, rest


def bell(name, bar, bt, m, beats, v):
    add(name, bar * BAR + bt * BAR / 4.0, m, max(0.03, beats * BAR / 4.0), v)


# ---------------------------------------------------------------- 鼓
drums = []


def drum(bar, step, kind, vel):
    t = bar * BAR + step * BAR / 16.0
    if 0 <= t < DUR:
        drums.append([round(t, 4), int(kind), int(max(1, min(127, vel)))])


def crash(bar, vel=104):
    drum(bar, 0, 4, vel)


def groove(b0, n, style='main'):
    for i in range(n):
        b = b0 + i
        if style == 'main':
            for s, v in ((0, 122), (6, 94), (8, 112), (12, 102), (14, 90)):
                drum(b, s, 0, v)
            for s in (4, 12):
                drum(b, s, 1, 106)
            for s in range(16):
                drum(b, s, 2, 82 if s % 4 == 0 else 56)
            for s in (2, 6, 10, 14):
                drum(b, s, 3, 62)
        elif style == 'drive':
            for s in range(0, 16, 2):
                drum(b, s, 0, 118 if s % 4 == 0 else 100)
            for s in (4, 12):
                drum(b, s, 1, 112)
            for s in range(16):
                drum(b, s, 2, 88 if s % 4 == 0 else 64)
            for s in (2, 6, 10, 14):
                drum(b, s, 3, 68)
        elif style == 'final':
            for s in range(16):
                drum(b, s, 0, 120 if s % 4 == 0 else 104)
            for s in (4, 12):
                drum(b, s, 1, 116)
            for s in range(16):
                drum(b, s, 2, 92 if s % 4 == 0 else 70)
            for s in (2, 6, 10, 14):
                drum(b, s, 3, 74)
        elif style == 'half':
            drum(b, 0, 0, 112)
            drum(b, 10, 0, 92)
            drum(b, 4, 1, 94)
            drum(b, 12, 1, 98)
            for s in range(0, 16, 2):
                drum(b, s, 2, 40)
        elif style == 'quiet':
            drum(b, 0, 0, 78)
            if i % 2 == 1:
                drum(b, 8, 0, 62)
                drum(b, 12, 1, 44)


def fill(b0, n=2, base=52, k=4):
    for i in range(n):
        for s in range(16):
            drum(b0 + i, s, 1, base + s * k + i * 10)


# ================================================================ 段落
# 源曲素材块（ZUN MIDI 1-based 小节号）：
#   M  主旋律 = ch5 钟琴 bar12-19 + ch6 方波 bar16-20（八度成对的招牌旋律）
#   M2 主旋律再现 = ch6 bar56-64
#   R  riff 琶音 = ch6 bar2-11
#   U  狂奔 = ch6 bar21-34 ; U2 后段狂奔 = ch6 bar65-76
# 结构：0-7 序 | 8-16 A 主旋律 | 17-25 A2 主旋律加倍 | 26-35 B riff 疯狂
#       36-49 C 狂奔 | 50-53 D 力量桥 | 54-62 E 孤独 | 63-71 F 主旋律全奏
#       72-83 G 后段狂奔 | 84-95 T 凋零


def merge(*layers):
    d = {}
    for lyr in layers:
        for (bar, bt, m, beats, v) in lyr:
            d[(bar, round(bt, 3), m)] = [bar, bt, m, beats, v]
    return [d[k] for k in sorted(d)]


MEL = merge(ln(L['5'], 12, 20), ln(L['6'], 16, 21))     # 9 小节
MEL2 = ln(L['6'], 56, 65)                                # 9 小节
RIFF = ln(L['6'], 2, 12)                                 # 10 小节
RUN = ln(L['6'], 21, 35)                                 # 14 小节
RUN2 = ln(L['6'], 65, 77)                                # 12 小节
ACC = ln(L['2'], 12, 21)                                 # 主旋律段的琶音伴奏
ACC2 = ln(L['2'], 56, 65)

TH_TOP, TH_REST = split_top(MEL, 12, 21)
RH_TOP, RH_REST = split_top(RIFF, 2, 12)
RU_TOP, RU_REST = split_top(RUN, 21, 35)
M2_TOP, M2_REST = split_top(MEL2, 56, 65)
R2_TOP, R2_REST = split_top(RUN2, 65, 77)

# --- 序 0-7：主旋律的音乐盒版（sine），弦乐垫底，心跳逼近
place('pad', TH_TOP, 12, 0, transpose=12, vel=64, dur_scale=1.0, max_pitch=104)
place('pad', ln(L['4'], 12, 20), 12, 0, vel=50, dur_scale=1.0)
for b in range(2, 8):
    drum(b, 0, 0, 56 + (b - 2) * 7)
for b in range(5, 8):
    for s in range(16):
        drum(b, s, 1, 36 + (b - 5) * 20 + s)
    add('bass', b * BAR, 38 + (b - 5) * 2, BAR * 0.9, 86)
crash(8, 96)

# --- A 8-16：主旋律第一次全奏（钟琴线 + 琶音伴奏 + 半音低音）
place('lead', TH_TOP, 12, 8, vel=112)
place('harm', TH_REST, 12, 8, vel=84)
place('harm', ACC, 12, 8, vel=72, max_pitch=88)
place('bass', ln(L['9'], 12, 21), 12, 8, vel=112)
place('pad', ln(L['4'], 12, 21), 12, 8, vel=58, dur_scale=1.0)
for i in range(9):
    groove(8 + i, 1, 'main')
fill(16, 1)
crash(8, 110)

# --- A2 17-25：主旋律八度加倍 + 半音乱流，驱动鼓
place('lead', TH_TOP, 12, 17, vel=116)
place('harm', TH_REST, 12, 17, vel=92)
place('harm', ACC, 12, 17, vel=78, max_pitch=88)
place('harm', TH_TOP, 12, 17, transpose=12, vel=68, max_pitch=104)
place('bass', ln(L['9'], 12, 21), 12, 17, vel=116)
place('pad', ln(L['4'], 12, 21), 12, 17, vel=54, dur_scale=1.0)
for i in range(9):
    groove(17 + i, 1, 'drive')
for i, b in enumerate(range(22, 26)):
    for s in range(16):
        add('harm', b * BAR + s * BAR / 16, (94 - i * 3 - s) % 13 + 72, BAR / 16 * 0.5, 76)
fill(24, 1)
crash(17, 114)

# --- B 26-35：riff 琶音炸弹（原曲前奏的疯狂 ri​ff），driving
place('lead', RH_TOP, 2, 26, vel=120)
place('harm', RH_REST, 2, 26, vel=104)
place('bass', ln(L['9'], 2, 12), 2, 26, vel=118)
place('pad', ln(L['4'], 2, 12), 2, 26, vel=54, dur_scale=1.0)
for i in range(10):
    groove(26 + i, 1, 'drive')
fill(34, 2)
crash(26, 116)

# --- C 36-49：狂奔（原曲 bar21-34）
place('lead', RU_TOP, 21, 36, vel=122)
place('harm', RU_REST, 21, 36, vel=104)
place('bass', ln(L['9'], 21, 35), 21, 36, vel=118)
place('pad', ln(L['4'], 21, 35), 21, 36, vel=48, dur_scale=1.0)
for i in range(14):
    groove(36 + i, 1, 'drive')
crash(36, 116)
for i, b in enumerate(range(44, 50)):
    for s in range(16):
        add('harm', b * BAR + s * BAR / 16, (98 - i * 2 - s) % 13 + 72, BAR / 16 * 0.5, 84)

# --- D 50-53：力量桥，半音下行 + 双脚鼓
for i, b in enumerate(range(50, 54)):
    m = 50 - i * 2
    for s in range(16):
        add('bass', b * BAR + s * BAR / 16, m - (s % 4), BAR / 16 * 0.8, 116)
    for s in range(16):
        drum(b, s, 0, 118 if s % 2 == 0 else 96)
    for s in (4, 12):
        drum(b, s, 1, 112)
    for s in range(16):
        drum(b, s, 2, 76)
fill(52, 2, 80, 3)
crash(50, 112)

# --- E 54-62：囚禁 495 年。主旋律只剩音乐盒 + 心跳 + 低音弦
place('pad', M2_TOP, 56, 54, transpose=12, vel=70, dur_scale=1.0, max_pitch=104)
place('pad', ln(L['4'], 56, 65), 56, 54, vel=46, dur_scale=1.0)
for b in range(54, 61):
    add('bass', b * BAR, 38, BAR * 0.95, 54)
for i in range(8):
    groove(54 + i, 1, 'quiet')
for b in range(61, 63):
    for s in range(16):
        drum(b, s, 1, 34 + (s + (b - 61) * 16) * 4)
    drum(b, 0, 0, 88)
crash(54, 62)

# --- F 63-71：主旋律再现，全曲最饱满（上下八度夹击 + 琶音伴奏）
place('lead', M2_TOP, 56, 63, vel=124)
place('harm', M2_REST, 56, 63, vel=104)
place('harm', ACC2, 56, 63, vel=80, max_pitch=88)
place('harm', M2_TOP, 56, 63, transpose=12, vel=72, max_pitch=104)
place('bass', ln(L['9'], 56, 65), 56, 63, vel=120)
place('pad', ln(L['4'], 56, 65), 56, 63, vel=56, dur_scale=1.0)
for i in range(9):
    groove(63 + i, 1, 'final' if i >= 5 else 'drive')
fill(70, 1, 84, 3)
crash(63, 120)

# --- G 72-83：后段狂奔（原曲 bar65-76，全曲最烈）
place('lead', R2_TOP, 65, 72, vel=124)
place('harm', R2_REST, 65, 72, vel=104)
place('harm', ln(L['2'], 65, 77), 65, 72, transpose=12, vel=72, max_pitch=104)
place('bass', ln(L['9'], 65, 77), 65, 72, vel=120)
place('pad', ln(L['4'], 65, 77), 65, 72, vel=48, dur_scale=1.0)
for i in range(12):
    groove(72 + i, 1, 'final')
for i, b in enumerate(range(78, 84)):
    for s in range(16):
        add('harm', b * BAR + s * BAR / 16, (100 - i * 3 - s) % 13 + 72, BAR / 16 * 0.5, 86)
crash(72, 120)

# --- T 84-95：凋零，主旋律尾巴散成音乐盒
place('pad', [(b, bt, m, be, v) for (b, bt, m, be, v) in M2_TOP if b < 60], 56, 84, transpose=12, vel=60, dur_scale=1.0, max_pitch=104)
place('pad', ln(L['4'], 56, 58), 56, 87, vel=42, dur_scale=1.0)
for b in range(84, 88):
    for s in range(16):
        drum(b, s, 1, 96 - (b - 84) * 22 + s)
    drum(b, 0, 0, 98)
crash(84, 88)

# ---------------------------------------------------------------- 复音裁剪 + 排序
PRIO = ['lead', 'bass', 'harm', 'pad']
for k in PRIO:
    trk[k].sort(key=lambda x: x[0])

events = []
for name in PRIO:
    for n in trk[name]:
        events.append((round(n[0], 4), PRIO.index(name), n[0] + n[2], n))
events.sort()
active = []
kept = {k: [] for k in PRIO}
dropped = 0
for (t0, pi, t1, n) in events:
    active = [a for a in active if a[0] > t0 + 1e-6]
    if any(abs(a[1] - n[1]) < 0.5 for a in active):
        dropped += 1
        continue
    if len(active) >= 6:
        dropped += 1
        continue
    kept[PRIO[pi]].append(n)
    active.append((t1, n[1]))
for k in PRIO:
    trk[k] = kept[k]
drums = [d for d in drums if 0 <= d[0] < DUR]
drums.sort(key=lambda x: x[0])
print('声部：' + ' '.join('%s %d' % (k, len(v)) for k, v in trk.items()) + ' / 鼓 %d / 丢弃 %d' % (len(drums), dropped))

WAVES = {'lead': ('square', 0.142), 'harm': ('square', 0.068), 'bass': ('triangle', 0.205),
         'pad': ('sine', 0.07)}


def n2s(x):
    return ('%.4f' % x).rstrip('0').rstrip('.')


def fmt():
    out = []
    for name in PRIO:
        if not trk[name]:
            continue
        w, g = WAVES[name]
        out.append("\t\t\t{ wave: '%s', gain: %s, notes: [" % (w, g))
        ns = trk[name]
        for i in range(0, len(ns), 8):
            out.append('\t\t\t\t' + ','.join('[%s,%d,%s,%d]' % (n2s(n[0]), n[1], n2s(n[2]), n[3])
                                             for n in ns[i:i + 8]) + ',')
        out.append('\t\t\t] },')
    return out


txt = ['// EX Boss：U.N.オーエンは彼女なのか？ —— 芙兰朵露·斯卡雷特重编曲（试听稿）',
       '// 由 tools/un_flandre.py 生成，请勿手改。',
       '// 主蓝本：ZUN 原曲（高位琶音 ch6 / 低八度 ch2 / 半音 16 分低音 ch9 / 弦乐 ch4 逐音采样）+ 游戏内 EX 曲同源素材；',
       '// 辅蓝本：最終鬼畜妹式四踩、16 分踩镲、八度加倍、半音下行乱流。',
       '// 人设：8-29 疯狂 riff／30-38 抒情／39-56 狂奔与力量桥／57-64 囚禁 495 年（抽空只剩音乐盒与心跳）／65-86 终局爆发／87-95 凋零。',
       'export const UN_FLANDRE = {', '\textra: {',
       "\t\ttitle: 'U.N.オーエンは彼女なのか？',",
       '\t\tduration: %s,' % n2s(DUR),
       '\t\tbpm: %d,' % int(BPM),
       '\t\ttracks: [']
txt += fmt()
txt += ['\t\t],', '\t\tdrums: [']
for i in range(0, len(drums), 10):
    txt.append('\t\t\t' + ','.join('[%s,%d,%d]' % (n2s(d[0]), d[1], d[2]) for d in drums[i:i + 10]) + ',')
txt += ['\t\t],', '\t},', '};']
open(OUT_JS, 'w', encoding='utf-8', newline='\n').write('\n'.join(txt) + '\n')
json.dump({'duration': DUR, 'bpm': BPM,
           'tracks': [{'wave': WAVES[k][0], 'gain': WAVES[k][1], 'notes': trk[k]} for k in PRIO],
           'drums': drums},
          open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
print('写入 %s（%.1f KB）' % (OUT_JS, os.path.getsize(OUT_JS) / 1024))
