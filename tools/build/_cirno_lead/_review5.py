import json
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
song = json.load(open(ROOT + '/tools/build/_cirno_lead/song.json', encoding='utf-8'))
if 'stage3' in song: song = song['stage3']
secs = [[n,a,b] for n,a,b in json.load(open(ROOT + '/tools/build/_cirno_lead/secs.json', encoding='utf-8'))['secs']]
tr = {t['name']: t['notes'] for t in song['tracks']}
def seq(sec, track='lead'):
    a,b = [(x[1],x[2]) for x in secs if x[0]==sec][0]
    return [n[1] for n in sorted(tr[track], key=lambda x:x[0]) if a <= n[0] < b]
x, y = seq('chorus1'), seq('chorus2')
m = min(len(x), len(y))
print('chorus lead sim', len(x), len(y), round(sum(1 for i in range(m) if x[i]==y[i])/m, 3))
for nm in ('knife','tick'):
    ns = sorted(tr[nm], key=lambda n:n[0]); print(nm, len(ns), [round(n[0],1) for n in ns][:20])
KM={0:'kick',1:'snare',2:'hat',3:'ohat',4:'crash',5:'tom',6:'roll',7:'ride'}
for name,a,b in secs:
    dd=[d for d in song['drums'] if a<=d[0]<b]; c={}
    for d in dd: c[d[1]]=c.get(d[1],0)+1
    if name.startswith('chorus'): print(name, len(dd), round(len(dd)/(b-a),1), 'hits/s', c)
print('totals', sum(len(v) for v in tr.values()), len(song['drums']))