import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
import midi2js as M
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
out=[]
def load(fn):
    midi = M.parse_midi(os.path.join(SRC, fn))
    return M.extract_channels(midi)
def topvoice(chans, ch, t0=0, t1=200, limit=400):
    ns=[n for n in chans[ch]['notes'] if t0<=n['t']<t1]
    ons=collections.defaultdict(list)
    for n in ns: ons[round(n['t'],3)].append(n)
    seq=[]
    for t in sorted(ons):
        g=ons[t]; mx=max(x['m'] for x in g)
        top=[x for x in g if x['m']==mx][0]
        seq.append('%d' % mx)
    return ns, seq
# border13
chans,segs,div = load('13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid')
for ch in (0,10,3,1):
    ns,seq = topvoice(chans,ch,0,40)
    out.append('border13 ch%d TOPVOICE 0-40s (n=%d):' % (ch,len(ns)))
    out.append('  '+' '.join(seq))
ns=chans[10]['notes'][:40]
out.append('border13 ch10 raw: '+' '.join('%.2f:%d/%.2f'%(n['t'],n['m'],n['d']) for n in ns))
# border14
chans,segs,div = load('14. Border of Life (ZUN).mid')
for ch in (0,1,7,3):
    ns,seq = topvoice(chans,ch,0,40)
    out.append('border14 ch%d TOPVOICE 0-40s (n=%d):' % (ch,len(ns)))
    out.append('  '+' '.join(seq))
ns=chans[1]['notes'][:30]
out.append('border14 ch1 raw: '+' '.join('%.2f:%d/%.2f'%(n['t'],n['m'],n['d']) for n in ns))
ns=chans[7]['notes'][:30]
out.append('border14 ch7 raw: '+' '.join('%.2f:%d/%.2f'%(n['t'],n['m'],n['d']) for n in ns))
# tillwhen ch0 in 32-56 and ch6
chans,segs,div = load('11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid')
for ch in (0,6,8):
    ns,seq = topvoice(chans,ch,32,56)
    out.append('tillwhen ch%d TOPVOICE 32-56s (n=%d):' % (ch,len(ns)))
    out.append('  '+' '.join(seq))
ns=[n for n in chans[0]['notes'] if 32<=n['t']<45][:60]
out.append('tillwhen ch0 raw 32-45: '+' '.join('%.2f:%d/%.2f'%(n['t'],n['m'],n['d']) for n in ns))
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'explore7_out.txt'),'w',encoding='utf-8').write('\n'.join(out))
print('ok')
