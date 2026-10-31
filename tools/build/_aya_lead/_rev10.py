
import json, os
root = r"C:\Users\GuSheng\Downloads\HKS"
HERE = os.path.join(root,'tools/build/_aya_lead')
song = json.load(open(os.path.join(HERE,'song.json'), encoding='utf-8'))
secs = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
S = dict((n,(a,b)) for n,a,b in secs['secs'])
TR = {t['name']:t['notes'] for t in song['tracks']}
# 1) c2b 末四小节是否整体 +1
a,b = S['c2b']; t0 = a + 4*1.558442
bass = [n for n in TR['bass'] if t0-1e-6 <= n[0] < b]
lead = [n for n in TR['lead'] if t0-1e-6 <= n[0] < b]
print('c2b last4 bass pcs', sorted(set(n[1]%12 for n in bass)))
print('c2b last4 lead sample', [(round(n[0]-a,1), n[1]) for n in lead[:8]])
# 2) 再现段鼓差异
dr = song['drums']
def kindset(nm):
    a,b = S[nm]; return [(round(e[0]-a,2), e[1]) for e in dr if a-1e-9 <= e[0] < b-1e-9]
for x,y in [('a2','a2b'),('b','b2'),('c1','c1b'),('c2','c2b')]:
    kx, ky = kindset(x), kindset(y)
    print('%s %d drums | %s %d drums  same-set=%s' % (x,len(kx),y,len(ky), kx==ky))
# 3) 断电段
a,b = S['e_break']
cnt = {name: sum(1 for n in lst if a-1e-6<=n[0]<b) for name,lst in TR.items()}
print('e_break notes', sum(cnt.values()), {k:v for k,v in cnt.items() if v})
