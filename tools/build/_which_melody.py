# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
import midi2js as M

ROOT = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil'
midi = M.parse_midi(ROOT + r'\5. Tomboyish Girl in Love (ZUN).mid')
chans, segs, div = M.extract_channels(midi)
print('MIDI 通道:')
for ch, info in sorted(chans.items()):
    ns = info['notes']
    if not ns: continue
    ps = [n['m'] for n in ns]
    print('  ch%-3d prog %-3s 音数 %-4d 音域 %d-%d (中位 %d)' % (ch, info.get('prog'), len(ns), min(ps), max(ps), sorted(ps)[len(ps)//2]))

def bigrams(ns):
    ns = sorted(ns, key=lambda n: n['t'])
    return set((a['m'] % 12, b['m'] % 12) for a, b in zip(ns, ns[1:]))

s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js', 'BOSS_SONGS', 'stage3')
def norm(n): return n if isinstance(n, dict) else dict(t=n[0], m=n[1], d=n[2], v=n[3])
gametracks = [bigrams([norm(n) for n in t['notes']]) for t in s['tracks']]
print('\n游戏内 stage3 各轨 vs MIDI 各通道（音级 bigram 重合率）:')
for ti, bn in enumerate(gametracks):
    row = []
    for ch, info in sorted(chans.items()):
        bm = bigrams(info['notes'])
        if not bm: continue
        inter = len(bn & bm); rate = inter / max(1, len(bm))
        row.append((round(rate, 2), ch))
    row.sort(reverse=True)
    print('  轨%d:' % ti, row[:4])
