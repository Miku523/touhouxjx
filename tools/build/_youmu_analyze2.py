import sys, json, os
sys.path.insert(0, os.path.abspath("tools"))
from midi2js import parse_midi, extract_channels
MID = "tools/build/_midi/src/11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid"
midi = parse_midi(MID); chans, segs, div = extract_channels(midi)
bpm = 60e6/segs[0][2]; bar = 60.0/bpm*4
maxT = max((n['t']+n['d'] for c in chans.values() for n in c['notes']), default=0)
nb = int(maxT//bar)+1
cnt = {}
for ci,c in chans.items():
    for n in c['notes']:
        b = int(n['t']//bar); cnt[(b,ci)] = cnt.get((b,ci),0)+1
lines=[]
for b in range(nb):
    row = {str(ci): cnt[(b,ci)] for ci in sorted(chans) if cnt.get((b,ci))}
    lines.append(f"bar{b+1:>3} t={b*bar:6.1f} " + " ".join(f"{k}:{v}" for k,v in row.items()))
hdr=[]
for ci,c in sorted(chans.items()):
    ns=c['notes']
    hdr.append(f"ch{ci}: n={len(ns)} t={min((n['t'] for n in ns),default=0):.1f}-{max((n['t'] for n in ns),default=0):.1f} m={min((n['m'] for n in ns),default=0)}-{max((n['m'] for n in ns),default=0)} v={sum(n['v'] for n in ns)/max(1,len(ns)):.0f} prog={dict(c['progs'])}")
open("tools/build/_youmu_kit/channels.txt","w").write("bpm=%.1f bar=%.4f maxT=%.2f nbars=%d\n"%(bpm,bar,maxT,nb)+"\n".join(hdr))
open("tools/build/_youmu_kit/density.txt","w").write("\n".join(lines))
print("ok")
