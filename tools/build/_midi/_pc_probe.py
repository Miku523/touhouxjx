
import sys, collections, json
sys.path.insert(0,'tools')
from midi2js import parse_midi, extract_channels
SRC='tools/build/_midi/src/'
files={'tillwhen':'11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid',
       'border':'13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid'}
PC=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
out={}
for k,f in files.items():
    midi=parse_midi(SRC+f)
    chans,segs,div=extract_channels(midi)
    info={'segcount':len(segs),'segs':[(round(s[1],3),round(60e6/s[2],2)) for s in segs],'ch':{}}
    for ch in sorted(chans):
        c=chans[ch]; ns=c['notes']
        if not ns: continue
        pc=collections.Counter(n['m']%12 for n in ns)
        t0=min(n['t'] for n in ns); t1=max(n['t']+n['d'] for n in ns)
        info['ch'][ch]={'n':len(ns),'t0':round(t0,2),'t1':round(t1,2),'mmin':min(n['m'] for n in ns),'mmax':max(n['m'] for n in ns),
          'pc':{PC[p]:round(v/len(ns)*100) for p,v in pc.most_common()}}
    out[k]=info
open('tools/build/_midi/_pc_summary.json','w',encoding='utf-8').write(json.dumps(out,ensure_ascii=False,indent=1))
print('done')
