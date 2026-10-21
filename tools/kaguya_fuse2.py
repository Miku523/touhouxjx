# -*- coding: utf-8 -*-
"""竹取飛翔 融合稿 v3 —— 「原曲骨架原封不动，只加辉夜的外壳」。

前两版的教训：
  * 拍速按 128（游戏内声明值）铺层 → 全曲错位，用户听成「没踩到拍子上」；实测拍速 152-154 漂移。
  * 按贝斯推每小节和弦重铺和声层 → 与原曲旋律半音撞车 26%，滤完贝斯只剩 42%（骨架被掏空）。

v3 策略（最保守、也最贴用户「严格遵循原曲」）：
  1. 原曲三条轨逐音照搬：oldA（主奏）/ oldB（副旋律）/ oldBass（贝斯）。
  2. 落拍全部继承原曲事件时间，结构上不可能错位。
  3. 新增只两样：wind（月光琶音，音高取自该小节原曲旋律自己的音级集，天然不撞）+
     pad（该小节最重旋律音的长音铺底）。
  4. 鼓：原曲 1132 击全部保留，段首补吊镲、缺底鼓的小节强拍补底鼓。
  5. 声部上限 5，超了按 oldA > oldB > oldBass > wind > pad 裁。
"""
import json
import os
import sys

import numpy as np

_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isdir(os.path.join(_d, 'src')) and _d != os.path.dirname(_d):
    _d = os.path.dirname(_d)
BASE = _d
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
old = json.load(open(os.path.join(BASE, 'tools', 'build', '_old_stage6.json'), encoding='utf-8'))
OUT_JS = os.path.join(BASE, 'src', 'engine', 'songs', 'kaguya_stage6.js')
OUT_JSON = os.path.join(BASE, 'tools', 'build', '_kaguya_song.json')
DUR = float(old['duration'])

# ---------------- 拍子时钟（分段与补鼓用） ----------------
bass_src = np.array(sorted(t for (t, m, d, v) in old['tracks'][1]['notes']))
dd = np.diff(bass_src)
units = np.array([np.median(dd[max(0, i - 15):min(len(dd), i + 16)]) for i in range(len(dd))])
units = np.clip(units, 0.090, 0.106)
sid = [0.0]
for i, di in enumerate(dd):
    sid.append(sid[-1] + max(1, int(round(di / units[i]))))
sid = np.array(sid)


def T(step):
    return float(np.interp(step, sid, bass_src))


kicks = np.array(sorted(t for (t, k, v) in old['drums'] if k == 0))
kid = np.interp(kicks, bass_src, sid)
B0 = max(range(16), key=lambda b0: sum(1 for r in np.round(kid) % 16 if (int(r) - b0) % 16 in (0, 4, 8, 12)))
NBARS = int((sid[-1] - B0) // 16) + 1
STEP = (bass_src[-1] - bass_src[0]) / sid[-1]
print('拍子时钟：步长 %.4fs（16 分，≈%.1f BPM）；原点 %d；%d 小节' % (STEP, 60 / (STEP * 4), B0, NBARS))


def t_of(b, s):
    return T(B0 + b * 16 + s)


SEC = [('A', 0, 8), ('B', 9, 24), ('C', 25, 40), ('Brk1', 41, 49), ('D', 50, 66),
       ('Brk2', 67, 73), ('E', 74, 82), ('Outro', 83, NBARS - 1)]


def sec_of(b):
    for nm, a, z in SEC:
        if a <= b <= z:
            return nm
    return 'E'


tr = {'oldA': [], 'oldB': [], 'oldBass': [], 'wind': [], 'pad': []}


def add(name, t, m, d, v):
    if 0 <= t < DUR and 0.02 <= d <= 8 and 12 <= m <= 120:
        tr[name].append([round(t, 4), int(m), round(min(d, DUR - t - 0.01), 4), int(max(1, min(127, v)))])


for (t, m, d, v) in old['tracks'][0]['notes']:
    add('oldA', t, m, d, v)
for (t, m, d, v) in old['tracks'][2]['notes']:
    add('oldB', t, m, d, v)
for (t, m, d, v) in old['tracks'][1]['notes']:
    add('oldBass', t, m, d, v)

# ---------------- 逐小节「原曲旋律自己的音级集」 ----------------
NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
bars = []
for b in range(NBARS):
    t0, t1 = t_of(b, 0), T(B0 + (b + 1) * 16)
    mel = [(t, m, dv) for tri in (0, 2) for (t, m, dv, v) in old['tracks'][tri]['notes'] if t0 <= t < t1]
    w = {}
    for (t, m, dv) in mel:
        w[m % 12] = w.get(m % 12, 0) + dv
    tot = sum(w.values()) or 1.0
    ranked = sorted(w, key=lambda p: -w[p])
    bars.append((b, t0, t1, ranked, {p: w[p] / tot for p in w}))

print('逐小节旋律音级集（前 20 小节）：')
for (b, t0, t1, ranked, rel) in bars[:20]:
    print('  b%-2d %6.2fs  %s' % (b + 1, t0, ' '.join('%s%.2f' % (NN[p], rel[p]) for p in ranked[:4])))

# ---------------- 月光琶音 / 铺底 ----------------
for (b, t0, t1, ranked, rel) in bars:
    if not ranked:
        continue
    nm = sec_of(b)
    tones = []
    for p in ranked[:3]:
        cand = [84 + ((p - 84) % 12) - 12 * k for k in (0, 1, 2)]
        m = min(cand, key=lambda x: abs(x - 84))
        while m < 72:
            m += 12
        while m > 100:
            m -= 12
        tones.append(m)
    if nm in ('B', 'C', 'Brk1', 'Brk2', 'E', 'Outro'):
        vv = 60 if nm in ('Brk1', 'Brk2') else 68
        for k, s in enumerate(range(0, 16, 2)):
            add('wind', t_of(b, s), tones[k % len(tones)],
                (t_of(b, s + 2) - t_of(b, s)) * 0.6, vv + (5 if s % 4 == 0 else 0))
    if nm in ('Brk1', 'Brk2', 'D', 'E', 'Outro'):
        p = ranked[0]
        cand = [36 + ((p - 36) % 12) - 12 * k for k in (0, 1, 2)]
        pm = min(cand, key=lambda x: abs(x - 41))
        add('pad', t_of(b, 0), pm, (t1 - t0) * 0.96, 56)

# ---------------- 鼓 ----------------
drums = [[round(t, 4), int(k), int(max(1, min(127, v)))] for (t, k, v) in old['drums'] if 0 <= t < DUR]
for (nm, a, z) in SEC:
    drums.append([round(t_of(a, 0), 4), 4, 100])
    if a + 8 <= z:
        drums.append([round(t_of(a + 8, 0), 4), 4, 90])
for b in range(NBARS):
    if sec_of(b) in ('Brk1', 'Brk2'):
        continue
    tn = t_of(b, 0)
    if not any(abs(t - tn) < 0.03 for (t, k, v) in drums if k == 0):
        drums.append([round(tn, 4), 0, 116])

# ---------------- 声部裁剪（上限 5） ----------------
PRIO = ['oldA', 'oldB', 'oldBass', 'wind', 'pad']
allnotes = []
for name in PRIO:
    tr[name].sort(key=lambda x: x[0])
    for n in tr[name]:
        allnotes.append((name, n[0], n[0] + n[2], n))
allnotes.sort(key=lambda x: (x[1], PRIO.index(x[0])))
kept = {k: [] for k in PRIO}
active = []
maxpoly = 0
for (name, t0, t1, n) in allnotes:
    active = [e for e in active if e > t0 + 1e-6]
    if len(active) >= 5:
        continue
    kept[name].append(n)
    active.append(t1)
    maxpoly = max(maxpoly, len(active))
for k in PRIO:
    tr[k] = kept[k]
print('\n声部：' + ' '.join('%s %d' % (k, len(v)) for k, v in tr.items()) + ' / 最大同时 %d / 鼓 %d' % (maxpoly, len(drums)))

WAVES = {'oldA': ('square', 0.12), 'oldB': ('square', 0.05), 'oldBass': ('triangle', 0.18),
         'wind': ('sawtooth', 0.042), 'pad': ('sine', 0.05)}


def fmt(tracks):
    out = []
    for name in PRIO:
        if not tracks[name]:
            continue
        w, g = WAVES[name]
        out.append("\t\t\t{ wave: '%s', gain: %s, notes: [" % (w, g))
        notes = tracks[name]
        for i in range(0, len(notes), 8):
            out.append('\t\t\t\t' + ','.join('[%s,%d,%s,%d]' % (('%.4f' % n[0]).rstrip('0').rstrip('.'), n[1], ('%.4f' % n[2]).rstrip('0').rstrip('.'), n[3]) for n in notes[i:i + 8]) + ',')
        out.append('\t\t\t] },')
    return out


drums.sort(key=lambda x: x[0])
txt = ['// 6 面 Boss：竹取飛翔 ～ Lunatic Princess —— 蓬莱山辉夜重编曲（融合稿 v3）',
       '// 由 tools/kaguya_fuse2.py 生成，请勿手改。',
       '// 原曲三条轨（主奏 / 副旋律 / 贝斯）逐音原样保留，落拍全部继承原曲事件时间；',
       '// 新增 wind＝月光琶音（音高取该小节原曲旋律自己的音级集）/ pad＝长音铺底；鼓保留原曲 + 强拍补底鼓。',
       'export const KAGUYA_STAGE6 = {', '\tstage6: {',
       "\t\ttitle: '竹取飛翔 ～ Lunatic Princess',",
       '\t\tduration: %s,' % ('%.3f' % DUR).rstrip('0').rstrip('.'),
       '\t\tbpm: %d,' % round(60 / (STEP * 4)),
       '\t\ttracks: [']
txt += fmt(tr)
txt += ['\t\t],', '\t\tdrums: [']
for i in range(0, len(drums), 10):
    txt.append('\t\t\t' + ','.join('[%s,%d,%d]' % (('%.4f' % d[0]).rstrip('0').rstrip('.'), d[1], d[2]) for d in drums[i:i + 10]) + ',')
txt += ['\t\t],', '\t},', '};']
open(OUT_JS, 'w', encoding='utf-8', newline='\n').write('\n'.join(txt) + '\n')
json.dump({'duration': DUR, 'bpm': 60 / (STEP * 4),
           'tracks': [{'wave': WAVES[k][0], 'gain': WAVES[k][1], 'notes': tr[k]} for k in PRIO],
           'drums': drums}, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
print('写入 %s（%.1f KB）' % (OUT_JS, os.path.getsize(OUT_JS) / 1024))
