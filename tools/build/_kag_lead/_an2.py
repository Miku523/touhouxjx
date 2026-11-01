
import json, os, collections
L = r'C:\Users\GuSheng\Downloads\HKS\tools\build\_kag_lead'
D = json.load(open(os.path.join(L,'midi_flat.json'), encoding='utf-8'))
N = D['notes']; BEAT=D['beat']; BAR=D['bar']
bars = collections.defaultdict(lambda: collections.defaultdict(list))
for n in N: bars[n['bar']][n['ch']].append((round(n['beat'],3), n['m'], round(n['d'],2)))
def line(b, chs):
    s=[]
    for ch in chs:
        ns=sorted(bars[b].get(ch,[]))
        s.append('c%d:'%ch + (' '.join('%g:%d'%(t,m) for t,m,d in ns[:10]) if ns else '-'))
    return '  '.join(s)
for b in list(range(59,79))+list(range(79,102)):
    print('b%-3d %s' % (b, line(b,[0,3,8,11,5,6])))
