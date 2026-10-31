import json
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
song = json.load(open(ROOT + '/tools/build/_cirno_lead/song.json', encoding='utf-8'))
if 'stage3' in song: song = song['stage3']
secs = [[n,a,b] for n,a,b in json.load(open(ROOT + '/tools/build/_cirno_lead/secs.json', encoding='utf-8'))['secs']]
tr = {t['name']: t['notes'] for t in song['tracks']}
def events(sec, track='lead'):
    a,b = [(x[1],x[2]) for x in secs if x[0]==sec][0]
    d = {}
    for n in tr[track]:
        if a <= n[0] < b:
            d.setdefault(round(n[0] - a, 3), set()).add(n[1])
    return d
e1, e2 = events('chorus1'), events('chorus2')
keys = sorted(set(e1) & set(e2))
same = sum(1 for k in keys if e1[k] == e2[k])
print('共同时刻', len(keys), '音高集合完全相同', same, '比率', round(same/len(keys), 3))
# 只在 chorus2 出现的装饰音
extra = sorted(set(e2) - set(e1))[:12]
print('chorus2 独有时刻', len(set(e2)-set(e1)), extra)
print('chorus2 lead 总音数', sum(len(v) for v in e2.values()), 'chorus1', sum(len(v) for v in e1.values()))