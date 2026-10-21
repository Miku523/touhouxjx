# -*- coding: utf-8 -*-
"""竹取飛翔 融合稿：游戏内 8bit 原曲的两条旋律层「原封不动」，新编的贝斯 / 铺底 / 风轮 / 鼓组跟着它走。

用户要求（m01179）：节奏不行 → 遵循游戏内原曲节奏走并与其融合，严格遵循原曲。

做法：
  · BPM = 128、时长 151.207s 全部沿用游戏内 BOSS_SONGS.stage6，旋律层逐音照搬（节奏 = 玩家熟悉的那个）。
  · 和声不是猜的：逐小节统计游戏内三个声部每个音级占的时值，贝斯轨最长的音级 = 该小节根音，
    再用全声部音级匹配和弦表里「根音对得上、覆盖最高」的和弦。
  · 段落按游戏内原曲的疏密自动划分（见 SECTIONS），间奏真空段（40-45 / 60-65）新层全部让开。

输出 5 轨 + 鼓：
  oldA  square   原曲主奏（0.12）
  oldB  square   原曲副旋律（0.05）
  bass  triangle 按原曲和声写的八分驱动（0.16）
  pad   sine     根音 + 五度长音（0.045）
  wind  sawtooth 八分月光琶音（0.045）
"""
import json
import math
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SRC = os.path.join(BASE, 'tools', 'build', '_old_stage6.json')
OUT_JS = os.path.join(BASE, 'src', 'engine', 'songs', 'kaguya_stage6.js')
OUT_JSON = os.path.join(BASE, 'tools', 'build', '_kaguya_song.json')

BPM = 128.0
BAR = 240.0 / BPM
STEP = BAR / 16
old = json.load(open(SRC, encoding='utf-8'))
DURATION = old['duration']
BARS = int(math.ceil(DURATION / BAR)) + 1

CHORDS = {
    'Fm': (5, [0, 3, 7]), 'Fm7': (5, [0, 3, 7, 10]), 'Bbm': (10, [0, 3, 7]), 'Bbm7': (10, [0, 3, 7, 10]),
    'Db': (1, [0, 4, 7]), 'Dbmaj7': (1, [0, 4, 7, 10]), 'Dbm': (1, [0, 3, 7]),
    'Eb': (3, [0, 4, 7]), 'Eb7': (3, [0, 4, 7, 10]), 'Ab': (8, [0, 4, 7]),
    'C': (0, [0, 4, 7]), 'Cm': (0, [0, 3, 7]), 'C7': (0, [0, 4, 7, 10]),
    'Gm': (7, [0, 3, 7]), 'G': (7, [0, 4, 7]), 'F': (5, [0, 4, 7]), 'Bb': (10, [0, 4, 7]),
    'Bm': (11, [0, 3, 7]), 'Bm7': (11, [0, 3, 7, 10]), 'B': (11, [0, 4, 7]),
    'D': (2, [0, 4, 7]), 'Dm': (2, [0, 3, 7]), 'E': (4, [0, 4, 7]),
    'Am': (9, [0, 3, 7]), 'A': (9, [0, 4, 7]), 'Gb': (6, [0, 4, 7]), 'Gdim': (7, [0, 3, 6]),
    'Abm': (8, [0, 3, 7]), 'Bbm': (10, [0, 3, 7]), 'Cdim': (0, [0, 3, 6]), 'Edim': (4, [0, 3, 6]),
}


def bar_weights(n):
    t0, t1 = n * BAR, (n + 1) * BAR
    w = [0.0] * 12
    bw = [0.0] * 12
    for ti, tr in enumerate(old['tracks']):
        tgt = bw if ti == 1 else w
        for (t, m, d, v) in tr['notes']:
            ov = min(t + d, t1) - max(t, t0)
            if ov > 0:
                tgt[m % 12] += ov
    return w, bw


def pick_chord(n):
    w, bw = bar_weights(n)
    if sum(bw) <= 0:
        bw = w
    if sum(w) <= 0:
        return None
    root = max(range(12), key=lambda i: bw[i])
    tot = sum(w)
    best, bs = None, -9
    for name, (r, tpl) in CHORDS.items():
        if r != root:
            continue
        pcs = {(r + iv) % 12 for iv in tpl}
        inside = sum(w[p] for p in pcs) / tot
        outside = sum(w[p] for p in range(12) if p not in pcs) / tot
        s = inside - 0.6 * outside + 0.03 * len(pcs)
        if s > bs:
            best, bs = name, s
    if best is None:
        third, major = w[(root + 3) % 12], w[(root + 4) % 12]
        best = [k for k, v in CHORDS.items() if v[0] == root][0]
        if third < major:
            best = [k for k, v in CHORDS.items() if v[0] == root and 3 in v[1]][0]
    return best


NAME_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
QUAL = {'': [(4, 7)], 'm': [(3, 7)], 'dim': [(3, 6)]}
_CH = {}


def win_weights(b0, b1):
    lo, hi = b0 * BAR, b1 * BAR
    w = [0.0] * 12
    bw = [0.0] * 12
    for ti, tr in enumerate(old['tracks']):
        tgt = bw if ti == 1 else w
        for (t, m, d, v) in tr['notes']:
            ov = min(t + d, hi) - max(t, lo)
            if ov > 0:
                tgt[m % 12] += ov
    return w, bw


def chord_window(b):
    """两小节窗口定一个和弦：贝斯踏板优先，品质看旋律音级。"""
    key = b // 2
    if key in _CH:
        return _CH[key]
    w, bw = win_weights(key * 2, key * 2 + 2)
    if sum(w) <= 0:
        c = _CH.get(key - 1, 'Fm')
        _CH[key] = c
        return c
    root_w = max(range(12), key=lambda i: bw[i]) if sum(bw) > 0 else max(range(12), key=lambda i: w[i])
    ped = bw[root_w] / (sum(bw) or 1)
    root = root_w if ped > 0.5 else max(range(12), key=lambda i: w[i])
    third = w[(root + 3) % 12]
    major = w[(root + 4) % 12]
    fifth = w[(root + 7) % 12]
    dim = w[(root + 6) % 12] > fifth * 0.9 and w[(root + 6) % 12] > 0
    if dim and third >= major:
        iv = [(3, 6)]
    elif third > major:
        iv = [(3, 7)]
    else:
        iv = [(4, 7)] if major > 0 else [(3, 7)]
    want = iv[0]
    name = None
    for n, (r, tpl) in CHORDS.items():
        if r == root and tuple(tpl[:2]) == want:
            name = n
            break
    if name is None:
        NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
        name = NAMES[root] + ('m' if want == (3, 7) else '')
    _CH[key] = name
    return name


PROG = [(chord_window(b), chord_window(b)) for b in range(BARS)]

# ---------------------------------------------------------------- 段落（按原曲疏密划分）
SECTIONS = [
    ('intro', 0, 4, 'none'),
    ('A', 4, 11, 'full'),
    ('B', 11, 26, 'half'),
    ('C', 26, 38, 'full'),
    ('br1', 38, 40, 'build'),
    ('break1', 40, 46, 'none'),
    ('D', 46, 60, 'full'),
    ('break2', 60, 66, 'none'),
    ('F', 66, 80, 'drive'),
    ('tail', 80, BARS, 'none'),
]


def sect_of(bar):
    for name, b0, b1, kind in SECTIONS:
        if b0 <= bar < b1:
            return name, kind
    return 'tail', 'none'


# ---------------------------------------------------------------- 收集
tracks = {'oldA': [], 'oldB': [], 'bass': [], 'pad': [], 'wind': []}
drums = []


def add(trk, bar, step, midi, steps, vel):
    t = bar * BAR + step * STEP
    if t >= DURATION:
        return
    tracks[trk].append([t, midi, steps * STEP, vel])


def drum(bar, step, kind, vel):
    t = bar * BAR + step * STEP
    if t < DURATION:
        drums.append([t, kind, vel])


for tr in old['tracks'][:1]:
    for (t, m, d, v) in tr['notes']:
        tracks['oldA'].append([t, m, d, min(127, int(v * 1.0))])
for tr in old['tracks'][2:3]:
    for (t, m, d, v) in tr['notes']:
        tracks['oldB'].append([t, m, d, min(127, int(v))])

BASS_PAT = {
    'drive': [(0, 0), (2, 0), (4, 7), (6, 0), (8, 0), (10, 0), (12, 12), (14, 7)],
    'push8': [(0, 0), (2, 0), (4, 7), (6, 0), (8, 0), (10, 7), (12, 12), (14, 0)],
    'half': [(0, 0), (8, 0), (12, 7)],
    'taiko': [(0, 0), (8, 0)],
}

for b in range(BARS):
    name, kind = sect_of(b)
    if kind == 'none':
        continue
    c1, c2 = PROG[b]
    pat = 'drive' if kind in ('full', 'drive', 'build') else ('push8' if kind == 'half' else 'taiko')
    for si, cc in ((i, c1) if i < 8 else (i, c2) for i in range(16)):
        pass
    for (si, iv) in BASS_PAT[pat]:
        cc = c1 if si < 8 else c2
        root = CHORDS[cc][0]
        add('bass', b, si, 36 + root + iv, 2, 108 if kind in ('full', 'drive') else 96)
    # 铺底：两拍一换，根 / 五度轮换
    for half, cc in ((0, c1), (1, c2)):
        root, tpl = CHORDS[cc]
        fifth = tpl[2] if len(tpl) > 2 else 7
        m = [root, root + fifth, root + 12][(b * 2 + half) % 3]
        add('pad', b, half * 8, 60 + m, 8, 46 if kind in ('full', 'drive') else 40)
    # 风轮：只在 full / drive 段出现，八分音符
    if kind in ('full', 'drive'):
        for half, cc in ((0, c1), (1, c2)):
            root, tpl = CHORDS[cc]
            scale = []
            for oct_ in range(2):
                for t in tpl:
                    v = 60 + root + 12 * oct_ + t
                    if v < 60 + root + 26:
                        scale.append(v)
            seq = scale + scale[1:-1][::-1]
            for si in range(half * 8, half * 8 + 8, 2):
                add('wind', b, si, seq[(si // 2) % len(seq)], 2, 50 + (6 if si % 4 == 0 else 0))

# ---------------------------------------------------------------- 鼓组
for name, b0, b1, kind in SECTIONS:
    for b in range(b0, min(b1, BARS)):
        if kind == 'none':
            if b == b0:
                drum(b, 0, 0, 100)
            continue
        if kind == 'build':
            for s in range(16):
                drum(b, s, 1, 50 + s * 4)
            continue
        if kind == 'taiko':
            drum(b, 0, 0, 112)
            drum(b, 8, 0, 96)
            if b % 2 == 0:
                drum(b, 4, 4, 82)
            continue
        if kind == 'half':
            drum(b, 0, 0, 108)
            drum(b, 8, 0, 98)
            drum(b, 4, 1, 86)
            drum(b, 12, 1, 90)
            for s in range(0, 16, 2):
                drum(b, s, 2, 28)
            continue
        # full / drive
        for s in (0, 4, 8, 12):
            drum(b, s, 0, 118 if s % 8 == 0 else 106)
        for s in (4, 12):
            drum(b, s, 1, 96 if kind == 'full' else 104)
        hats = range(16) if kind == 'drive' else range(0, 16, 2)
        for s in hats:
            drum(b, s, 2, 30 if s % 2 else 38)
        drum(b, 14, 3, 44)
        if (b - b0) % 4 == 0:
            drum(b, 0, 4, 100)

# ---------------------------------------------------------------- 整理与自检
for k in tracks:
    tracks[k].sort()
    if k in ('oldA', 'oldB'):
        continue  # 原曲旋律层逐音照搬，绝不去重
    # 同轨去重（同刻只留最高音）
    out, seen = [], {}
    for t, m, d, v in tracks[k]:
        key = round(t, 4)
        if key in seen:
            if m > out[seen[key]][1]:
                out[seen[key]] = [t, m, d, v]
            continue
        seen[key] = len(out)
        out.append([t, m, d, v])
    tracks[k] = [n for n in out if n[0] < DURATION]
drums.sort()

GAIN = {'oldA': 0.12, 'oldB': 0.05, 'bass': 0.16, 'pad': 0.045, 'wind': 0.045}
WAVE = {'oldA': 'square', 'oldB': 'square', 'bass': 'triangle', 'pad': 'sine', 'wind': 'sawtooth'}
ORDER = ['oldA', 'oldB', 'bass', 'pad', 'wind']

song = {
    'title': '竹取飛翔 ～ Lunatic Princess',
    'duration': round(DURATION, 4),
    'bpm': BPM,
    'tracks': [{'wave': WAVE[k], 'gain': GAIN[k], 'notes': tracks[k]} for k in ORDER],
    'drums': drums,
}


def fmt(x):
    s = ('%.4f' % x).rstrip('0').rstrip('.')
    return s if s else '0'


def write_js(path, song):
    L = []
    L.append('// 6 面 Boss：竹取飛翔 ～ Lunatic Princess —— 蓬莱山辉夜重编曲（融合稿）')
    L.append('// 由 tools/kaguya_fuse.py 生成，请勿手改；旋律层逐音沿用游戏内原曲（ZUN）')
    L.append('// oldA/oldB=原曲两条旋律原封不动 / bass=按原曲和声的八分驱动 / pad=长音铺底 / wind=月光琶音')
    L.append('export const KAGUYA_STAGE6 = {')
    L.append('\tstage6: {')
    L.append("\t\ttitle: '%s'," % song['title'])
    L.append('\t\tduration: %s,' % fmt(song['duration']))
    L.append('\t\tbpm: %s,' % fmt(song['bpm']))
    L.append('\t\ttracks: [')
    for tr in song['tracks']:
        L.append("\t\t\t{ wave: '%s', gain: %s, notes: [" % (tr['wave'], fmt(tr['gain'])))
        row = []
        for (t, m, d, v) in tr['notes']:
            row.append('[%s,%d,%s,%d]' % (fmt(t), m, fmt(d), v))
            if len(row) == 6:
                L.append('\t\t\t\t' + ','.join(row) + ',')
                row = []
        if row:
            L.append('\t\t\t\t' + ','.join(row) + ',')
        L.append('\t\t\t] },')
    L.append('\t\t],')
    L.append('\t\tdrums: [')
    row = []
    for (t, k, v) in song['drums']:
        row.append('[%s,%d,%d]' % (fmt(t), k, v))
        if len(row) == 8:
            L.append('\t\t\t' + ','.join(row) + ',')
            row = []
    if row:
        L.append('\t\t\t' + ','.join(row) + ',')
    L.append('\t\t],')
    L.append('\t},')
    L.append('};')
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(L) + '\n')


# 自检
errs = []
for k in ORDER:
    for i, (t, m, d, v) in enumerate(tracks[k]):
        if not (0 <= t < DURATION):
            errs.append('%s #%d 时间越界 %.3f' % (k, i, t))
        if not (12 <= m <= 120):
            errs.append('%s #%d 音高越界 %d' % (k, i, m))
        if not (0 < d <= 8):
            errs.append('%s #%d 时值越界 %.3f' % (k, i, d))
        if not (1 <= v <= 127):
            errs.append('%s #%d 力度越界 %d' % (k, i, v))
for i, (t, k, v) in enumerate(drums):
    if not (0 <= t < DURATION) or k not in (0, 1, 2, 3, 4):
        errs.append('鼓 #%d 非法 %s' % (i, (t, k, v)))

if __name__ == '__main__':
    print('duration %.3fs  bpm %.0f  bars %d' % (DURATION, BPM, BARS))
    for k in ORDER:
        ns = tracks[k]
        if not ns:
            continue
        ps = [n[1] for n in ns]
        print('  %-5s %-9s gain %.3f  %4d 音  音域 %s-%s'
              % (k, WAVE[k], GAIN[k], len(ns), 'C#?' , '%s' % max(ps)))
    print('  鼓 %d 击' % len(drums))
    print('  错误 %d' % len(errs))
    for e in errs[:10]:
        print('   ', e)
    print('  前 24 小节和声：', ' '.join('%s/%s' % p for p in PROG[:24]))
    write_js(OUT_JS, song)
    json.dump(song, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
    print('写出', OUT_JS)
