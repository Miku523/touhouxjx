
import sys, os, collections
sys.path.insert(0, os.path.join(r'C:\Users\GuSheng\Downloads\HKS','tools'))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '7 - Perfect Cherry Blossom', '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid')
mid = M.parse_midi(MID)
chans, segs, div = M.extract_channels(mid)
print('bpm', M.bpm_of(segs), 'chans', len(chans))
dr = chans[9]['notes']
by = collections.defaultdict(list)
for n in dr:
    t = n['t'] if isinstance(n, dict) else n[0]
    m = n['m'] if isinstance(n, dict) else n[1]
    by[m].append(t)
for k in sorted(by):
    ts = sorted(by[k])
    print('drum', k, len(ts), 'first', [round(x,2) for x in ts[:6]])
# duplicates between 38 and 40
a = set(round(x,2) for x in by[38]); b = set(round(x,2) for x in by[40])
print('38&40 overlap', len(a&b), 'of', len(a), len(b))
a2 = set(round(x,2) for x in by[42]); b2 = set(round(x,2) for x in by[44])
print('42&44 overlap', len(a2&b2), 'of', len(a2), len(b2))
# 42 spacing sample
t42 = sorted(by[42])[:20]
print('42 first20', [round(x,3) for x in t42])
# last region 84-88 all drums
print('drums 84-88:', sorted((round((n['t'] if isinstance(n,dict) else n[0]),2), (n['m'] if isinstance(n,dict) else n[1])) for n in dr if 84 <= (n['t'] if isinstance(n,dict) else n[0]) < 88)[:40])
print('drums at end max t', max((n['t'] if isinstance(n,dict) else n[0]) for n in dr))
# ch0 first notes & last notes
c0 = chans[0]['notes']
def tup(n): return (round(n['t'],3), n['m'], round(n['d'],3), n['v'])
print('ch0 first14', [tup(n) for n in sorted(c0, key=lambda x:x['t'])[:14]])
print('ch0 last14', [tup(n) for n in sorted(c0, key=lambda x:x['t'])[-14:]])
print('ch1 sample', [tup(n) for n in sorted(chans[1]['notes'], key=lambda x:x['t'])[:10]])
print('ch2 first10', [tup(n) for n in sorted(chans[2]['notes'], key=lambda x:x['t'])[:10]])
print('ch3 first8', [tup(n) for n in sorted(chans[3]['notes'], key=lambda x:x['t'])[:8]])
print('ch5 first8', [tup(n) for n in sorted(chans[5]['notes'], key=lambda x:x['t'])[:8]])
