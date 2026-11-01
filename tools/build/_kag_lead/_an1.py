
import json, os, collections
L = r'C:\Users\GuSheng\Downloads\HKS\tools\build\_kag_lead'
N = json.load(open(os.path.join(L,'midi_flat.json'), encoding='utf-8'))['notes']
bars = collections.defaultdict(lambda: collections.defaultdict(list))
for n in N:
    bars[n['bar']][n['ch']].append((round(n['beat'],3), n['m'], round(n['d'],2)))
# 逐小节：ch0 melody, chord pcs (all), counts
out=[]
for b in range(1,102):
    ch0 = sorted(bars[b].get(0,[]))
    if ch0:
        line = ' '.join('%g:%d/%g'%(t,m,d) for t,m,d in ch0[:14])
    else:
        line = '-'
    pcs = collections.Counter()
    for ch,ns in bars[b].items():
        for t,m,d in ns:
            pcs[m%12]+=1
    out.append('b%-3d n0=%-2d  %s' % (b, len(ch0), line))
print('\n'.join(out[:24]))
print('---- B 19-36 ----')
print('\n'.join(out[18:36]))
print('---- C 37-58 ----')
print('\n'.join(out[36:58]))
