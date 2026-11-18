import sys, json, os
sys.path.insert(0, os.path.abspath("tools"))
from midi2js import parse_midi, extract_channels

MID = "tools/build/_midi/src/11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid"
midi = parse_midi(MID)
chans, segs, div = extract_channels(midi)
uspq = segs[0][2] if segs else 500000
bpm = 60e6/uspq
maxT = max((n['t']+n['d'] for c in chans.values() for n in c['notes']), default=0)
bar = 60.0/bpm*4
nb = int(maxT//bar)+1
bars = [[] for _ in range(nb)]
for ci,c in sorted(chans.items()):
    for n in c['notes']:
        b = int(n['t']//bar)
        if 0 <= b < nb:
            bars[b].append((ci, n['m'], n['v']))
out = {"bpm": round(bpm,3), "maxT": round(maxT,3), "bar": round(bar,4), "nbars": nb, "div": div,
       "segs": [list(s) for s in segs[:3]], "channels": {}}
for ci,c in sorted(chans.items()):
    ns = c['notes']
    out["channels"][str(ci)] = {"n": len(ns),
        "t0": round(min((n['t'] for n in ns), default=0),2),
        "t1": round(max((n['t'] for n in ns), default=0),2),
        "m0": min((n['m'] for n in ns), default=0), "m1": max((n['m'] for n in ns), default=0),
        "vavg": round(sum(n['v'] for n in ns)/max(1,len(ns)),1),
        "progs": dict(list(c['progs'].items())[:6])}
# density per bar per channel (2-bar buckets)
dens = []
for b0 in range(0, nb, 2):
    row = {}
    for ci in out["channels"]:
        cnt = sum(1 for b in range(b0, min(b0+2, nb)) for (c2,m,v) in bars[b] if c2 == int(ci))
        if cnt: row[ci] = cnt
    dens.append([b0+1, row])
out["density_2bar"] = dens
json.dump(out, open("tools/build/_youmu_kit/analysis.json","w"), ensure_ascii=False, indent=1)
print("wrote", nb)
