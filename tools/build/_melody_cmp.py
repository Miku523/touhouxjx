# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS, midi2js as M
ROOT = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil'
midi = M.parse_midi(ROOT + r'\5. Tomboyish Girl in Love (ZUN).mid')
chans, segs, div = M.extract_channels(midi)
for ch in (2, 10, 3, 12, 7, 13):
    ns = sorted(chans[ch]['notes'], key=lambda n: n['t'])[:10]
    print('MIDI ch%-3d' % ch, [(round(n['t'],2), n['m']) for n in ns])
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js', 'BOSS_SONGS', 'stage3')
def norm(n): return n if isinstance(n, dict) else dict(t=n[0], m=n[1], d=n[2], v=n[3])
# 逐小节统计各轨音级分布，和 MIDI 主旋律（ch2）比对
bar = 4*60/s['bpm']
def pcs(ns, t0, t1):
    return [n['m'] % 12 for n in ns if t0 <= n['t'] < t1]
ch2 = sorted(chans[2]['notes'], key=lambda n: n['t'])
# 用相对音高（相邻音差）比对前 3 秒
def intervals(ns):
    return [b['m'] - a['m'] for a, b in zip(ns, ns[1:])]
print('MIDI ch2 前 12 音高差', intervals(ch2[:13]))
for i in range(4):
    ns = sorted([norm(n) for n in s['tracks'][i]['notes']], key=lambda n: n['t'])
    print('游戏轨%d 前 12 音高差' % i, intervals(ns[:13]))
