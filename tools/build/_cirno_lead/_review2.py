import json
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
song = json.load(open(ROOT + '/tools/build/_cirno_lead/song.json', encoding='utf-8'))
if 'stage3' in song: song = song['stage3']
secs = json.load(open(ROOT + '/tools/build/_cirno_lead/secs.json', encoding='utf-8'))['secs']
names = [t['name'] for t in song['tracks']]
print('%-9s' % 'sec', ' '.join('%8s' % n for n in names))
for name, a, b in secs:
    row = []
    for t in song['tracks']:
        row.append(sum(1 for n in t['notes'] if a <= n[0] < b))
    print('%-9s' % name, ' '.join('%8d' % v for v in row))
print()
# D/E 段各轨音高中位数
for name, a, b in secs:
    if name not in ('B', 'B2', 'C', 'D', 'E', 'chorus1', 'chorus2'): continue
    parts = []
    for t in song['tracks']:
        ps = [n[1] for n in t['notes'] if a <= n[0] < b]
        if len(ps) >= 6:
            ps.sort(); parts.append('%s med%d n%d' % (t['name'], ps[len(ps)//2], len(ps)))
    print(name, ' | '.join(parts))