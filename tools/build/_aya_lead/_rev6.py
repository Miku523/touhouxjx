
import json, os
root = r"C:\Users\GuSheng\Downloads\HKS"
HERE = os.path.join(root,'tools/build/_aya_lead')
song = json.load(open(os.path.join(HERE,'song.json'), encoding='utf-8'))
secs = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
S = dict((n,(a,b)) for n,a,b in secs['secs'])
TR = {t['name']:t['notes'] for t in song['tracks']}
def notes(nm, name):
    a,b = S[nm]; return [(round(t-a,2), m) for t,m,d,v in TR[name] if a-1e-9 <= t < b-1e-9]
for x,y in [('a2','a2b'),('b','b2'),('c1','c1b'),('c2','c2b')]:
    nx, ny = notes(x,'lead'), notes(y,'lead')
    sety=set(ny); hit=sum(1 for e in nx if e in sety)
    print('%s -> %s : %d/%d (%.0f%%)  reprise extra notes %d' % (x,y,hit,len(nx),100*hit/max(1,len(nx)), len(ny)-hit))
tot = sum(S[k][1]-S[k][0] for k in ('a2b','b2','c1b','c2b'))
print('literal repeat seconds %.2f of %.2f = %.1f%%' % (tot, secs['_dur'], 100*tot/secs['_dur']))
# drum events identical in time+kind?
dr = song['drums']
def ds(nm):
    a,b=S[nm]; return [(round(e[0]-a,2), e[1]) for e in dr if a-1e-9 <= e[0] < b-1e-9]
for x,y in [('a2','a2b'),('b','b2'),('c1','c1b'),('c2','c2b')]:
    print('%s vs %s drums time+kind identical: %s (%d/%d)' % (x,y, ds(x)==ds(y), len(ds(x)), len(ds(y))))
