import json
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
song = json.load(open(ROOT + '/tools/build/_cirno_lead/song.json', encoding='utf-8'))
if 'stage3' in song: song = song['stage3']
secs = dict((n, (a, b)) for n, a, b in json.load(open(ROOT + '/tools/build/_cirno_lead/secs.json', encoding='utf-8'))['secs'])
tr = {t['name']: t['notes'] for t in song['tracks']}
def seq(name, sec, transpose=0, track='lead'):
    a, b = secs[sec]
    return [n[1] + transpose for n in sorted(tr[track], key=lambda x: x[0]) if a <= n[0] < b]
def sim(x, y):
    m = min(len(x), len(y))
    if m == 0: return 0.0
    return sum(1 for i in range(m) if x[i] == y[i]) / m
print('chorus1 vs chorus2 lead:', len(seq('chorus1','chorus1')), len(seq('chorus2','chorus2')), round(sim(seq('chorus1','chorus1'), seq('chorus2','chorus2')), 3))
print('chorus1 vs chorus2(+0 first 80):', round(sim(seq('chorus1','chorus1'), seq('chorus2','chorus2')[:80]), 3))
print('A vs A2 lead:', len(seq('A','A')), len(seq('A2','A2')), round(sim(seq('A','A'), seq('A2','A2')), 3))
print('A vs A2 (A2 +0):', [ (i, seq('A','A')[i], seq('A2','A2')[i]) for i in range(0, min(len(seq('A','A')), len(seq('A2','A2'))), 10)])
print('B vs B2 lead sim:', round(sim(seq('B','B'), seq('B2','B2')), 3), len(seq('B','B')), len(seq('B2','B2')))
print('C vs D lead:', round(sim(seq('C','C'), seq('D','D')), 3))
print('lead chorus1 first 20:', seq('chorus1','chorus1')[:20])
print('lead chorus2 first 20:', seq('chorus2','chorus2')[:20])
print('lead D first 20:', seq('D','D')[:20])
print('lead E first 20:', seq('E','E')[:20])
print('lead C first 20:', seq('C','C')[:20])