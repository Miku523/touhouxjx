# -*- coding: utf-8 -*-
"""融合稿 B：原曲两条旋律层「原封不动」，新编曲的贝斯/铺底/风轮改成跟着原曲和声走。

用户选 B（m00869）：原曲旋律保留，新编的伴奏让步。

和声来源不是猜的：直接逐小节统计游戏内原曲（_old_stage4.json）三个声部里
每个音级占的总时值 —— 贝斯轨（triangle）里时值最长的音级 = 该小节根音，
再用全声部音级去匹配 CHORDS 表里「根音对得上、覆盖率最高」的和弦。

输出 6 轨：
  oldA  square    原曲主奏（原样，0.12）
  oldB  square    原曲副旋律（原样，0.05）
  bass  triangle  按原曲和声写的八分驱动（0.16）
  pad   sine      根音+五度长音（0.04）
  wind  sawtooth  八分风轮琶音（0.045）
  drums           沿用 v10 的鼓组（转调段四踩 + 16 分踩镲）
"""
import json
import os

BASE = r'C:\Users\GuSheng\Downloads\HKS'
BAR = 240.0 / 154
STEP = BAR / 16
BARS = 100

old = json.load(open(os.path.join(BASE, 'tools', 'build', '_old_stage4.json'), encoding='utf-8'))
new = json.load(open(os.path.join(BASE, 'tools', 'build', '_aya_fb.json'), encoding='utf-8'))

CHORDS = {
    'Fm': (5, [0, 3, 7]), 'Fm7': (5, [0, 3, 7, 10]), 'Bbm': (10, [0, 3, 7]), 'Bbm7': (10, [0, 3, 7, 10]),
    'Db': (1, [0, 4, 7]), 'Dbmaj7': (1, [0, 4, 7, 11]), 'Eb': (3, [0, 4, 7]), 'Eb7': (3, [0, 4, 7, 10]),
    'Ab': (8, [0, 4, 7]), 'C': (0, [0, 4, 7]), 'Cm': (0, [0, 3, 7]), 'C7': (0, [0, 4, 7, 10]),
    'Gm': (7, [0, 3, 7]), 'G': (7, [0, 4, 7]), 'F': (5, [0, 4, 7]), 'Bb': (10, [0, 4, 7]),
    'F#m': (6, [0, 3, 7]), 'F#m7': (6, [0, 3, 7, 10]), 'D': (2, [0, 4, 7]), 'Dm': (2, [0, 3, 7]),
    'E': (4, [0, 4, 7]), 'Am': (9, [0, 3, 7]), 'Am7': (9, [0, 3, 7, 10]), 'Edim': (4, [0, 3, 6]),
    'Bm': (11, [0, 3, 7]), 'C#m': (1, [0, 3, 7]), 'A': (9, [0, 4, 7]),
}
PIANO = {'maj': [0, 4, 7], 'min': [0, 3, 7], 'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10]}


def bar_weights(n):
    t0, t1 = n * BAR, (n + 1) * BAR
    w = [0.0] * 12
    bw = [0.0] * 12
    for ti, tr in enumerate(old['tracks']):
        tgt = bw if ti == 1 else w
        for (t, m, d, v) in tr['notes']:
            s, e = t, t + d
            ov = min(e, t1) - max(s, t0)
            if ov > 0:
                tgt[m % 12] += ov
    return w, bw


def pick_chord(n):
    w, bw = bar_weights(n)
    if sum(bw) <= 0:
        bw = w
    root = max(range(12), key=lambda i: bw[i])
    tot = sum(w) or 1.0
    best, bs = None, -9
    for name, (r, tpl) in CHORDS.items():
        if r != root:
            continue
        pcs = {(r + iv) % 12 for iv in tpl}
        inside = sum(w[p] for p in pcs) / tot
        outside = sum(w[p] for p in range(12) if p not in pcs) / tot
        s = inside - 0.6 * outside + 0.05 * len(pcs)
        if s > bs:
            best, bs = name, s
    if best is None:
        third = w[(root + 3) % 12]
        major = w[(root + 4) % 12]
        best = ('%s' % root) + ('' if third >= major else '')  # 兜底
        best = [k for k, v in CHORDS.items() if v[0] == root][0]
    return best


prog = [pick_chord(n) for n in range(BARS)]
print('逐小节原曲和声：', ' '.join(prog[:16]))
from collections import Counter
print('top:', Counter(prog).most_common(8))


def nm_ok(m):
    return 12 <= m <= 120


tracks = {'oldA': [], 'oldB': [], 'bass': [], 'pad': [], 'wind': []}
for (t, m, d, v) in old['tracks'][0]['notes']:
    if t < BARS * BAR - 1e-6:
        tracks['oldA'].append([round(t, 4), int(m), round(min(d, 2.0), 4), int(v)])
for (t, m, d, v) in old['tracks'][2]['notes']:
    if t < BARS * BAR - 1e-6:
        tracks['oldB'].append([round(t, 4), int(m), round(min(d, 2.0), 4), int(v)])

for n in range(BARS):
    name = prog[n]
    root, tpl = CHORDS[name]
    third = tpl[1] if len(tpl) > 1 else 3
    fifth = 7
    lo = root + 12 * 3          # 大体 36-47
    while lo < 36:
        lo += 12
    while lo > 47:
        lo -= 12
    # 贝斯：八分驱动 root root 5th root oct root 5th 3rd
    patt = [0, 0, 7, 0, 12, 0, 7, third]
    for k, iv in enumerate(patt):
        m = lo + iv
        if nm_ok(m):
            tracks['bass'].append([round(n * BAR + k * 2 * STEP, 4), m, round(2 * STEP * 0.95, 4), 100 if k % 4 == 0 else 88])
    # pad：根音 + 五度，铺满一小节
    for iv in (0, fifth):
        m = 60 + root + iv
        while m > 72:
            m -= 12
        if nm_ok(m):
            tracks['pad'].append([round(n * BAR, 4), m, round(BAR * 0.96, 4), 62])
    # 风轮：八分琶音 根-三-五-八
    if n >= 4 and n < 96:
        seq = [0, third, fifth, 12, fifth, third, 0, 12]
        for k, iv in enumerate(seq):
            m = 72 + root + iv
            if nm_ok(m):
                tracks['wind'].append([round(n * BAR + k * 2 * STEP, 4), m, round(2 * STEP * 0.8, 4), 52 + (6 if k % 4 == 0 else 0)])

# --- 与旋律层（原曲两轨）撞半音的伴奏音直接让路，保证「不冲突」 ---
_mel = tracks['oldA'] + tracks['oldB']


def _semi_with_mel(m, t, d):
    for (t1, m1, d1, _v) in _mel:
        if min(t + d, t1 + d1) - max(t, t1) <= 0:
            continue
        if (m - m1) % 12 in (1, 11):
            return True
    return False


for _k in ('bass', 'pad', 'wind'):
    _before = len(tracks[_k])
    tracks[_k] = [x for x in tracks[_k] if not _semi_with_mel(x[1], x[0], x[2])]
    print('%s 让路删 %d / %d' % (_k, _before - len(tracks[_k]), _before))

waves = [('oldA', 'square', 0.145), ('oldB', 'square', 0.05), ('bass', 'triangle', 0.185),
         ('pad', 'sine', 0.045), ('wind', 'sawtooth', 0.05)]
out_tracks = []
for key, wv, g in waves:
    ns = sorted(tracks[key], key=lambda x: (x[0], -x[1]))
    fixed = []
    for x in ns:
        if fixed and abs(x[0] - fixed[-1][0]) < 1e-6:
            if x[1] > fixed[-1][1]:
                fixed[-1] = x
            continue
        if fixed and fixed[-1][0] + fixed[-1][2] > x[0]:
            fixed[-1][2] = round(max((x[0] - fixed[-1][0]) * 0.97, 0.03), 4)
        fixed.append(x)
    out_tracks.append({'wave': wv, 'gain': g, 'notes': fixed})
    print('%-5s %-9s %.3f  %d 音  音域 %d-%d' % (key, wv, g, len(fixed),
                                                 min(n[1] for n in fixed), max(n[1] for n in fixed)))

song = {'title': '風神少女', 'duration': round(BARS * BAR, 4), 'bpm': 154,
        'tracks': out_tracks, 'drums': new['drums']}
OUT = os.path.join(BASE, 'src', 'engine', 'songs', 'aya_stage4_b.js')
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('export const AYA_STAGE4 = '
            + json.dumps({'stage4': song}, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('写入', OUT, '鼓', len(song['drums']))
