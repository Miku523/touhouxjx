import sys, json, os
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M
SRC = r'C:/Users/GuSheng/Downloads/HKS/tools/build/_midi/src'
out={}
for tag, fn in [('tillwhen','11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'),
                ('border','13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid'),
                ('border14','14. Border of Life (ZUN).mid')]:
    p=os.path.join(SRC,fn)
    midi=M.parse_midi(p)
    chans, segs, div = M.extract_channels(midi)
    dur = segs[-1][1] if segs else 0
    ch=[]
    for c, d in sorted(chans.items()):
        ns=d['notes']
        if not ns: continue
        pr = ','.join('%d:%d'%(k,v) for k,v in sorted(d.get('progs',{}).items()))
        ch.append({'ch':c,'n':len(ns),'t0':round(ns[0]['t'],2),'t1':round(max(x['t']+x['d'] for x in ns),2),
                   'm0':min(x['m'] for x in ns),'m1':max(x['m'] for x in ns),'prog':pr})
    out[tag]={'dur':round(dur,2),'nseg':len(segs),'div':div,
              'segs':[{'tick':s[0],'t':round(s[1],2),'bpm':round(60e6/s[2],2)} for s in segs],
              'chans':ch}
json.dump(out, open(r'C:/Users/GuSheng/Downloads/HKS/tools/build/_midi/_chan_summary.json','w'), ensure_ascii=False, indent=1)
print('ok')
