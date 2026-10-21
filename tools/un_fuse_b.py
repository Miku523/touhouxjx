# -*- coding: utf-8 -*-
"""EX 曲融合稿 B：游戏内 EX 曲的旋律/副旋律/铺底三条轨逐音保留，
贝斯与鼓组按新编曲重写（四踩、十六分踩镲、段末滚奏、半音冲刺），
并叠回原曲那条被 8bit 版丢掉的十六分琶音（钟琴层），让它有「第一首」的跑动感。

用户 m01541：「和原游戏音乐对比融合」
做法沿用竹取 stage6 融合稿（用户已验证认可）：原曲旋律原封不动 × 伴奏重写。
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
OUT_JS = os.path.join(BASE, 'src', 'engine', 'songs', 'un_fuse_b.js')
OUT_JSON = os.path.join(BASE, 'tools', 'build', '_un_fuse_b.json')

BPM = 155.0
BAR = 240.0 / BPM
STEP = BAR / 16.0
BARS = 79
DUR = BARS * BAR
OFF = 2.323  # 游戏时间 = MIDI 时间 - 2.323s（实测对齐）

NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# ---------------------------------------------------------------- 逐小节取原曲和声
TR = OLD['tracks']
mel, harm, pad = TR[0], TR[4], TR[2]
bass_old = TR[1]
TPL = {'m': [0, 3, 7], '': [0, 4, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10],
       'maj7': [0, 4, 7, 11], 'dim': [0, 3, 6], 'sus4': [0, 5, 7]}
BAR_PC = {}
for b in range(BARS):
    t0, t1 = b * BAR, (b + 1) * BAR
    w = {}
    lows = []
    for (t, m, du, v) in bass_old['notes'] + pad['notes'] + harm['notes'] + mel['notes']:
        if t0 <= t < t1:
            w[m % 12] = w.get(m % 12, 0) + du
            lows.append((m, du))
    if not w:
        BAR_PC[b] = (2, False)
        continue
    tot = sum(w.values()) or 1
    basspc = min(lows, key=lambda x: x[0])[0] % 12 if lows else 2
    best = None
    for r in range(12):
        for qn, ivs in TPL.items():
            ins = sum(w.get((r + i) % 12, 0) for i in ivs) / tot
            cover = sum(w.get((r + i) % 12, 0) for i in ivs) / max(1e-9, tot)
            sc = cover - 0.5 * (1 - cover) + (0.12 if r == basspc else 0) + 0.01 * len(ivs)
            if best is None or sc > best[2]:
                best = (r, qn, sc, ins)
    BAR_PC[b] = (best[0], best[1])
print('逐小节和弦：' + ' '.join(NN[BAR_PC[b][0]] + BAR_PC[b][1] for b in range(0, 40)))
print('           ' + ' '.join(NN[BAR_PC[b][0]] + BAR_PC[b][1] for b in range(40, 79)))

tracks = [
    {'wave': 'square', 'gain': 0.15, 'notes': [list(n) for n in mel['notes']]},
    {'wave': 'sawtooth', 'gain': 0.06, 'notes': [list(n) for n in harm['notes']]},
    {'wave': 'square', 'gain': 0.05, 'notes': [list(n) for n in pad['notes']]},
]
bass = []
arp = []
drums = []


def add(t, m, du, v):
    if 0 <= t < DUR - 0.02 and 0.03 <= du <= 8 and 20 <= m <= 110:
        bass.append([round(t, 4), int(m), round(min(du, DUR - t - 0.01), 4), int(v)])


def add_arp(t, m, du, v):
    if 0 <= t < DUR - 0.02 and 0.03 <= du <= 8 and 20 <= m <= 110:
        arp.append([round(t, 4), int(m), round(min(du, DUR - t - 0.01), 4), int(v)])


def bt(b, s):
    return b * BAR + s * STEP


def bass_note(b, s, m, steps, v):
    add(bt(b, s), m, steps * STEP * 0.96, v)


def root_midi(b, low=36):
    pc = BAR_PC[b][0]
    m = low + ((pc - low) % 12)
    return m


def drum(b, s, kind, vel):
    t = bt(b, s)
    if 0 <= t < DUR:
        drums.append([round(t, 4), int(kind), int(max(1, min(127, vel)))])


def pattern(b, style):
    r = root_midi(b)
    if style == 'riff':
        for s in range(0, 16, 2):
            bass_note(b, s, r + (12 if s in (6, 14) else 0), 2, 116 if s % 4 == 0 else 92)
    elif style == 'drive':
        for s in range(16):
            bass_note(b, s, r + (12 if s % 4 == 3 else 0), 1, 114 if s % 4 == 0 else 90)
    elif style == 'half':
        bass_note(b, 0, r, 8, 104)
        bass_note(b, 8, r + 7, 8, 96)
    elif style == 'long':
        bass_note(b, 0, r - 12, 16, 92)
    elif style == 'eighth':
        for s in range(0, 16, 2):
            bass_note(b, s, r, 2, 108 if s % 4 == 0 else 88)


def groove(b, style, i=0):
    if style == 'main':
        drum(b, 0, 0, 120)
        drum(b, 8, 0, 112)
        drum(b, 4, 0, 104)
        drum(b, 12, 0, 104)
        for s in (4, 12):
            drum(b, s, 1, 106)
        for s in range(16):
            drum(b, s, 2, 78 if s % 4 == 0 else 54)
        for s in (2, 6, 10, 14):
            drum(b, s, 3, 58)
    elif style == 'drive':
        for s in range(0, 16, 2):
            drum(b, s, 0, 118)
        for s in (4, 12):
            drum(b, s, 1, 112)
        for s in range(16):
            drum(b, s, 2, 88 if s % 4 == 0 else 64)
        for s in (2, 6, 10, 14):
            drum(b, s, 3, 66)
    elif style == 'half':
        drum(b, 0, 0, 116)
        drum(b, 8, 0, 96)
        drum(b, 4, 1, 92)
        drum(b, 12, 1, 98)
        for s in range(0, 16, 2):
            drum(b, s, 2, 44)
    elif style == 'quiet':
        drum(b, 0, 0, 86)
        if i % 2:
            drum(b, 8, 1, 42)


def fill(b, base=62):
    for s in range(16):
        drum(b, s, 1, base + s * 3)
    drum(b, 0, 0, 116)
    drum(b, 8, 0, 108)


# ---- 段结构（按原曲自身密度）----
SECT = [(0, 10, 'drive', 'drive'), (10, 20, 'half', 'half'), (20, 34, 'drive', 'drive'),
        (34, 38, 'long', 'quiet'), (38, 46, 'eighth', 'main'), (46, 64, 'half', 'main'),
        (64, 77, 'drive', 'drive'), (77, 79, 'riff', 'main')]
for (b0, b1, bs, gs) in SECT:
    for i, b in enumerate(range(b0, b1)):
        pattern(b, bs if b0 != 46 else ('half' if i < 8 else 'eighth'))
        groove(b, gs, i)
for b, v in ((0, 114), (10, 100), (20, 112), (34, 86), (38, 100), (46, 100), (64, 116), (77, 104)):
    drum(b, 0, 4, v)
for b in (9, 19, 33, 45, 63, 76):
    fill(b, 58)

# ---- 叠回原曲钟琴琶音（被 8bit 版丢掉的十六分跑动）----
mid_arp = MID['channels']['5']['notes']
cnt = 0
for (t, m, du, v) in mid_arp:
    gt = t - OFF
    if -0.05 <= gt < DUR:
        add_arp(gt, m, du, 58)
        cnt += 1
print('钟琴琶音叠回 %d 音' % cnt)

# ---- 34-37 静默：低音长音 + 铺底 ----
for b in range(34, 38):
    r = root_midi(b, 36)
    add(bt(b, 0), r - 12, BAR * 0.98, 80)

tracks.append({'wave': 'triangle', 'gain': 0.185, 'notes': bass})
tracks.append({'wave': 'sawtooth', 'gain': 0.042, 'notes': arp})

# ---- 裁剪：同一时刻最多 5 个发声（保留高优先级）----
PRIO = [0, 3, 1, 4, 2]
events = []
for idx in PRIO:
    for n in tracks[idx]['notes']:
        events.append((n[0], PRIO.index(idx), idx, n))
events.sort(key=lambda e: (e[0], e[1]))
active = []
kept = {i: [] for i in range(len(tracks))}
maxp = 0
for (t0, pr, idx, n) in events:
    active = [a for a in active if a > t0 + 1e-6]
    if len(active) >= 5:
        continue
    kept[idx].append(n)
    active.append(t0 + n[2])
    maxp = max(maxp, len(active))
for i in range(len(tracks)):
    tracks[i]['notes'] = sorted(kept[i], key=lambda x: x[0])
drums.sort(key=lambda x: x[0])
print('轨：' + ' '.join('%s%.3f/%d' % (t['wave'][:3], t['gain'], len(t['notes'])) for t in tracks))
print('鼓 %d 击（原曲 %d）最大同时发声 %d' % (len(drums), len(OLD['drums']), maxp))


def fmt_notes(ns, per=8):
    out = []
    for i in range(0, len(ns), per):
        out.append('\t\t\t\t' + ','.join('[%s,%d,%s,%d]' % (('%.4f' % n[0]).rstrip('0').rstrip('.'),
                                                          int(n[1]), ('%.4f' % n[2]).rstrip('0').rstrip('.'), int(n[3]))
                                        for n in ns[i:i + per]) + ',')
    return out


txt = ['// EX Boss：U.N.オーエンは彼女なのか？ —— 融合稿 B（原曲旋律保留 × 伴奏重写）',
       '// 由 tools/un_fuse_b.py 生成，请勿手改。',
       '// 游戏内原曲的主奏（square）、副旋律（saw）、铺底（square）三条轨逐音保留；',
       '// 贝斯与鼓组按新编曲重写：四踩 + 十六分踩镲 + 段末滚奏，34-37 小节抽空只留心搏；',
       '// 并把原曲那条被 8bit 版丢掉的钟琴十六分琶音叠回来。',
       'export const UN_FUSE_B = {', '\textra: {',
       "\t\ttitle: 'U.N.オーエンは彼女なのか？（融合 B）',",
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
