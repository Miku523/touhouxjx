import json
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
song = json.load(open(ROOT + '/tools/build/_cirno_lead/song.json', encoding='utf-8'))
if 'stage3' in song: song = song['stage3']
tr = {t['name']: t['notes'] for t in song['tracks']}
for nm in ('knife', 'tick', 'riser', 'reverse', 'brass'):
    ns = sorted(tr[nm], key=lambda n: n[0])
    print(nm, len(ns), [round(n[0],2) for n in ns][:24])
# 各段鼓 kind 分布
secs = json.load(open(ROOT + '/tools/build/_cirno_lead/secs.json', encoding='utf-8'))['secs']
KM = {0:'kick',1:'snare',2:'hat',3:'ohat',4:'crash',5:'tom',6:'roll',7:'ride'}
for name, a, b in secs:
    dd = [d for d in song['drums'] if a <= d[0] < b]
    c = {}
    for d in dd: c[d[1]] = c.get(d[1], 0) + 1
    print('%-9s %s' % (name, ' '.join('%s%d' % (KM.get(k, k), v) for k, v in sorted(c.items()))))