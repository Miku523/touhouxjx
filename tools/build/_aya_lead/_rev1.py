
import json, os, math
root = r"C:\Users\GuSheng\Downloads\HKS"
song = json.load(open(os.path.join(root,'tools/build/_aya_lead/song.json'), encoding='utf-8'))
secs = json.load(open(os.path.join(root,'tools/build/_aya_lead/secs.json'), encoding='utf-8'))
S = secs['secs']
tracks = song['tracks']
def sec_of(t):
    for n,a,b in S:
        if a-1e-9 <= t < b-1e-9: return n
    return S[-1][0]
names = [tr['name'] for tr in tracks]
print("TRACKS", len(tracks), "notes", sum(len(tr['notes']) for tr in tracks), "drums", len(song['drums']))
# per section per track counts
tab = {n:{} for n,_,_ in S}
for tr in tracks:
    for t,m,d,v in tr['notes']:
        tab[sec_of(t)][tr['name']] = tab[sec_of(t)].get(tr['name'],0)+1
hdr = "sec".ljust(8) + "".join(x[:7].ljust(8) for x in names)
print(hdr)
for n,a,b in S:
    print(n.ljust(8) + "".join(str(tab[n].get(x,0)).ljust(8) for x in names))
# lead gaps
lead = sorted(tr['notes'] for tr in tracks if tr['name']=='lead')[0]
lead.sort()
gaps=[]
for i in range(1,len(lead)):
    prev_end = lead[i-1][0]+lead[i-1][2]
    if lead[i][0]-prev_end > 1.2: gaps.append((round(prev_end,2), round(lead[i][0],2), round(lead[i][0]-prev_end,2)))
print("LEADGAPS", gaps)
print("lead range", min(n[1] for n in lead), max(n[1] for n in lead), "count", len(lead))
# drum density per section
dr = song['drums']
dsec = {n:[] for n,_,_ in S}
for e in dr:
    dsec[sec_of(e[0])].append(e)
for n,a,b in S:
    d = dsec[n]
    kinds = {}
    for e in d: kinds[e[1]] = kinds.get(e[1],0)+1
    print("DRUM", n.ljust(8), "n=", len(d), "perSec=", round(len(d)/(b-a),2), kinds)
