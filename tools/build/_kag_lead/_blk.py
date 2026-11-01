import json, os, collections
L = r'C:\Users\GuSheng\Downloads\HKS\tools\build\_kag_lead'
D = json.load(open(os.path.join(L,'midi_flat.json'), encoding='utf-8'))
BEAT = D['beat']
N = D['notes']
blk = collections.defaultdict(lambda: collections.Counter())
for n in N:
    tick = round(n['t'] / BEAT * 480)
    k = tick // 1920
    blk[k]['all'] += 1
    blk[k]['ch%d' % n['ch']] += 1
    if n['ch'] == 9: blk[k]['drum'] += 1
print('k  tick   all  drum  ch0  ch8  ch10 ch11 ch5 ch1')
for k in range(0, 101):
    c = blk[k]
    print('%3d %6d %5d %5d %4d %4d %4d %4d %4d %4d' % (k, k*1920, c['all'], c['drum'], c['ch0'], c['ch8'], c['ch10'], c['ch11'], c['ch5'], c['ch1']))
