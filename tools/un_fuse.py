# -*- coding: utf-8 -*-
"""EX 曲融合稿：游戏内《U.N.オーエンは彼女なのか？》五条轨全部原样保留，
只把那套 8bit 鼓换成新鼓组（四踩 / 十六分踩镲 / 段末军鼓滚），
并在中段单独抽出来的四小节里加一层长音铺底，让 495 年的静默落下来。

用户 m01541：「和原游戏音乐对比融合，wav不行吗」
→ 原曲一个音都不动，只做「加力量」的融合；同时渲染 WAV 供对比。
"""
import json
import os
import sys

_d = os.path.dirname(os.path.abspath(__file__))
while not os.path.isdir(os.path.join(_d, 'src')) and _d != os.path.dirname(_d):
    _d = os.path.dirname(_d)
BASE = _d
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

OLD = json.load(open(os.path.join(BASE, 'tools', 'build', '_old_extra.json'), encoding='utf-8'))
MID = json.load(open(os.path.join(BASE, 'tools', 'build', '_un_orig.json'), encoding='utf-8'))
OUT_JS = os.path.join(BASE, 'src', 'engine', 'songs', 'un_fuse.js')
OUT_JSON = os.path.join(BASE, 'tools', 'build', '_un_fuse.json')

BPM = 155.0
BAR = 240.0 / BPM
STEP = BAR / 16.0
BARS = 79
DUR = BARS * BAR

tracks = []
for t in OLD['tracks']:
    tracks.append({'wave': t['wave'], 'gain': t['gain'], 'notes': [list(n) for n in t['notes']]})

# 低音再垫一层八度下方（三角波），把 8bit 的 saw 托厚
low = []
for (t, m, du, v) in OLD['tracks'][3]['notes']:
    if m - 12 >= 22:
        low.append([t, m - 12, du, 90])
tracks.append({'wave': 'triangle', 'gain': 0.07, 'notes': low})

# 把原曲那条被 8bit 版丢掉的钟琴十六分琶音叠回来（MIDI ch5，实测游戏时间 = 源时间 - 2.323s）
arp = []
for (t, m, du, v) in MID['channels']['5']['notes']:
    gt = t - 2.323
    if 0 <= gt < DUR - 0.02:
        arp.append([round(gt, 4), int(m), round(max(0.05, du), 4), 58])
tracks.append({'wave': 'sawtooth', 'gain': 0.042, 'notes': arp})

drums = []


def drum(bar, step, kind, vel):
    t = bar * BAR + step * STEP
    if 0 <= t < DUR:
        drums.append([round(t, 4), int(kind), int(max(1, min(127, vel)))])


def kick(bar, steps, vel=118):
    for s in steps:
        drum(bar, s, 0, vel)


def snare(bar, steps, vel=104):
    for s in steps:
        drum(bar, s, 1, vel)


def hats(bar, sixt=True, vel=58, acc=80):
    rng = range(16) if sixt else range(0, 16, 2)
    for s in rng:
        drum(bar, s, 2, acc if s % 4 == 0 else vel)


def ohat(bar, vel=62):
    for s in (2, 6, 10, 14):
        drum(bar, s, 3, vel)


def groove(b0, n, style='main'):
    for i in range(n):
        b = b0 + i
        if style == 'main':
            kick(b, (0, 8), 120)
            kick(b, (4, 12), 104)
            snare(b, (4, 12), 106)
            hats(b, True, 54, 78)
            ohat(b, 58)
        elif style == 'drive':
            kick(b, tuple(range(0, 16, 2)), 118)
            snare(b, (4, 12), 110)
            hats(b, True, 66, 88)
            ohat(b, 66)
        elif style == 'half':
            kick(b, (0,), 116)
            kick(b, (8,), 100)
            snare(b, (4,), 92)
            snare(b, (12,), 96)
            hats(b, False, 42, 54)
        elif style == 'quiet':
            kick(b, (0,), 88)
            if i % 2:
                snare(b, (8,), 46)


def fill(b0, n=1, base=64):
    for i in range(n):
        b = b0 + i
        for s in range(16):
            drum(b, s, 1, base + s * 3 + i * 8)
        kick(b, (0, 8), 116)


def crash(bar, vel=104):
    drum(bar, 0, 4, vel)


# ---- 鼓组（按原曲密度切段）----
groove(0, 10, 'drive')
groove(10, 10, 'main')
groove(20, 14, 'drive')
# 34-37：原曲自己抽空的四小节 —— 心跳
for b in range(34, 38):
    groove(b, 1, 'quiet')
# 38-45 重建
groove(38, 8, 'main')
groove(46, 18, 'main')
groove(64, 14, 'drive')
for b in (77, 78):
    groove(b, 1, 'main')

for b in (0, 10, 20, 34, 38, 46, 64, 77):
    crash(b, 112 if b in (0, 20, 64) else 100)
for b, n in ((9, 1), (19, 1), (33, 1), (45, 1), (63, 1), (76, 1)):
    fill(b, n, 62)

# ---- 中段静默：加一层长音铺底（只用该小节原曲和声音级）----
pads = []
for b in range(34, 38):
    t0, t1 = b * BAR, (b + 1) * BAR
    pcs = {}
    for t in OLD['tracks']:
        for (tt, m, du, v) in t['notes']:
            if t0 - 1e-6 <= tt < t1:
                pcs[m % 12] = pcs.get(m % 12, 0) + du
    if not pcs:
        continue
    root = max(pcs.items(), key=lambda kv: kv[1])[0]
    m = 36 + ((root - 36) % 12)
    while m < 40:
        m += 12
    pads.append([round(t0 - 0.05, 4), m, round(BAR + 0.1, 3), 50])
    pads.append([round(t0 - 0.05, 4), m + 7, round(BAR + 0.1, 3), 44])
if pads:
    tracks.append({'wave': 'sine', 'gain': 0.05, 'notes': pads})

drums.sort(key=lambda x: x[0])

print('轨：' + ' '.join('%s%.3f/%d' % (t['wave'][:3], t['gain'], len(t['notes'])) for t in tracks))
print('鼓 %d 击（原曲 %d）' % (len(drums), len(OLD['drums'])))


def fmt_notes(ns, per=8):
    out = []
    for i in range(0, len(ns), per):
        out.append('\t\t\t\t' + ','.join('[%s,%d,%s,%d]' % (('%.4f' % n[0]).rstrip('0').rstrip('.'),
                                                          int(n[1]), ('%.4f' % n[2]).rstrip('0').rstrip('.'), int(n[3]))
                                        for n in ns[i:i + per]) + ',')
    return out


txt = ['// EX Boss：U.N.オーエンは彼女なのか？ —— 与游戏内 EX 曲的融合稿',
       '// 由 tools/un_fuse.py 生成，请勿手改。',
       '// 原曲五条轨一个音都没动（原旋律、原琶音、原铺底、原贝斯全部逐音保留），',
       '// 只把 8bit 鼓组换成四踩 + 十六分踩镲 + 段末滚奏的新鼓，',
       '// 34-37 小节（原曲自己抽空的地方）铺一层长音，让 495 年的静默落下来。',
       'export const UN_FUSE = {', '\textra: {',
       "\t\ttitle: 'U.N.オーエンは彼女なのか？（融合稿）',",
       '\t\tduration: %s,' % ('%.4f' % DUR).rstrip('0').rstrip('.'),
       '\t\tbpm: %d,' % int(BPM),
       '\t\ttracks: [']
for t in tracks:
    txt.append("\t\t\t{ wave: '%s', gain: %s, notes: [" % (t['wave'], t['gain']))
    txt += fmt_notes(t['notes'])
    txt.append('\t\t\t] },')
txt.append('\t\t],')
txt.append('\t\tdrums: [')
for i in range(0, len(drums), 10):
    txt.append('\t\t\t' + ','.join('[%s,%d,%d]' % (('%.4f' % d[0]).rstrip('0').rstrip('.'), d[1], d[2]) for d in drums[i:i + 10]) + ',')
txt += ['\t\t],', '\t},', '};']
open(OUT_JS, 'w', encoding='utf-8', newline='\n').write('\n'.join(txt) + '\n')
json.dump({'duration': DUR, 'bpm': BPM, 'tracks': tracks, 'drums': drums},
          open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
print('写入 %s（%.1f KB）' % (OUT_JS, os.path.getsize(OUT_JS) / 1024))
