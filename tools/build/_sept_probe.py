# -*- coding: utf-8 -*-
"""探查 TH06 13 面《亡き王女の為のセプテット》候选 MIDI 的 BPM / 调性 / 通道角色。"""
import os, sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil'
FILES = ['13. Septette for a Dead Princess (ZUN).mid',
         '13. Septette for a Dead Princess (yoimutu).mid',
         '13. Septette for a Dead Princess (sweetmusic).mid']

NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

def key_of(notes):
    hist = collections.Counter()
    for n in notes:
        hist[n['m'] % 12] += n['d']
    tot = sum(hist.values()) or 1
    major = [0,2,4,5,7,9,11]
    minor = [0,2,3,5,7,8,10]
    best = None
    for root in range(12):
        ms = sum(hist[(root+i) % 12] for i in major) / tot
        mn = sum(hist[(root+i) % 12] for i in minor) / tot
        for label, val in (('maj', ms), ('min', mn)):
            if best is None or val > best[2]:
                best = (NAMES[root], label, val)
    return best, hist, tot

for f in FILES:
    p = os.path.join(BASE, f)
    if not os.path.exists(p):
        print('缺少', f); continue
    midi = M.parse_midi(p)
    chans, segs, div = M.extract_channels(midi)
    bpm = M.bpm_of(segs)
    notes_by = {ch: c['notes'] for ch, c in chans.items()}
    alln = [n for ns in notes_by.values() for n in ns]
    t0 = min(n['t'] for n in alln); t1 = max(n['t'] + n['d'] for n in alln)
    print('=' * 70)
    print(f, '| BPM %.2f' % bpm, '| tempo 段数', len(segs), '| %.2fs – %.2fs (%.2fs)' % (t0, t1, t1 - t0))
    for ch in sorted(notes_by):
        ns = notes_by[ch]
        ms = [n['m'] for n in ns]
        ds = [n['d'] for n in ns]
        times = collections.Counter(round(n['t'], 2) for n in ns)
        poly = len(ns) / max(1, len(times))
        print('   ch%-2d 音数%4d 音域%3d–%-3d 起%6.2fs 止%6.2fs 均时值%.2f 同时音%.2f' % (
            ch, len(ns), min(ms), max(ms), min(n['t'] for n in ns), max(n['t'] for n in ns), sum(ds) / len(ds), poly))
    (root, mode, score), hist, tot = key_of(alln)
    print('  全曲调性 %s %s 置信 %.2f' % (root, mode, score))
    print('  音级分布', ', '.join('%s %.2f' % (NAMES[i], c / tot) for i, c in hist.most_common(5)))
