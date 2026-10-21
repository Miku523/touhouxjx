# -*- coding: utf-8 -*-
import sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom\11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
bar = 4*60.0/155.0
print('bar %.4f' % bar)
h = collections.Counter()
for n in chans[9]['notes']: h[n['m']] += 1
print('ch9 鼓音高分布:', sorted(h.items()))
print()
print('ch2 32.5-36:', [(round(n['t'],2), n['m'], round(n['d'],2)) for n in sorted(chans[2]['notes'], key=lambda n:n['t']) if 32.5<=n['t']<36][:16])
print('ch8 32.5-40:', [(round(n['t'],2), n['m'], round(n['d'],2)) for n in sorted(chans[8]['notes'], key=lambda n:n['t']) if 32.5<=n['t']<40][:14])
print()
N=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def chord(t, w=1.2):
    c = collections.Counter()
    for ch in (1,2,3,8):
        for n in chans[ch]['notes']:
            if t <= n['t'] < t+w: c[n['m']%12] += n['d']
    return [N[p] for p,_ in c.most_common(4)]
def melody(t, w=1.2):
    d = {}
    for n in chans[0]['notes']:
        if t <= n['t'] < t+w:
            d[round(n['t'],2)] = max(d.get(round(n['t'],2), 0), n['m'])
    return [(k, v) for k, v in sorted(d.items())]
print('候选循环落点（80-95s 逐小节）：')
for k in range(50, 61):
    t = 1.55 + (k)*bar - bar   # 粗略：小节号
    print('  bar %2d t=%6.2f  %s   %s' % (k, t, chord(t), melody(t)))
