import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
import midi2js as M
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
out = []
def dump(chans, key, ch, t0=0.0, t1=200.0, limit=400):
    ns = chans[ch]['notes']
    sel = [n for n in ns if t0 <= n['t'] < t1][:limit]
    out.append('-- %s ch%d n=%d sel=%d' % (key, ch, len(ns), len(sel)))
    out.append('   ' + ' '.join('%.2f:%d/%.2f' % (n['t'], n['m'], n['d']) for n in sel))
# tillwhen
midi = M.parse_midi(os.path.join(SRC,'11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'))
chans, segs, div = M.extract_channels(midi)
dump(chans,'tillwhen',0,0,32,220)
dump(chans,'tillwhen',3,0,90,220)
dump(chans,'tillwhen',5,0,33,140)
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'explore4_out.txt'),'w',encoding='utf-8').write('\n'.join(out))
print('ok')
