
import json, os, numpy as np
root = r"C:\Users\GuSheng\Downloads\HKS"
HERE = os.path.join(root,'tools/build/_aya_lead')
song = json.load(open(os.path.join(HERE,'song.json'), encoding='utf-8'))
secs = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
S = dict((n,(a,b)) for n,a,b in secs['secs'])
dr = song['drums']
def slice_(nm):
    a,b = S[nm]
    return [(round(e[0]-a,4), e[1], e[2], (e[3] if len(e)>3 else None)) for e in dr if a-1e-9 <= e[0] < b-1e-9]
for x,y in [('a2','a2b'),('b','b2'),('c1','c1b'),('c2','c2b')]:
    dx, dy = slice_(x), slice_(y)
    same = (dx == dy)
    print('%s vs %s drums %d/%d identical=%s' % (x,y,len(dx),len(dy),same))
    if not same:
        # find first difference
        for i,(p,q) in enumerate(zip(dx,dy)):
            if p!=q:
                print('  first diff at', i, p, q); break
print()
# lead note identity (time+pitch) between repeats, ignoring extra octave layers
TR = {t['name']:t['notes'] for t in song['tracks']}
def notes_since(nm, name):
    a,b = S[nm]
    return [(round(t-a,4), m) for t,m,d,v in TR[name] if a-1e-9 <= t < b-1e-9]
for x,y in [('a2','a2b'),('b','b2'),('c1','c1b'),('c2','c2b')]:
    nx, ny = notes_since(x,'lead'), notes_since(y,'lead')
    sety = set(ny)
    hit = sum(1 for e in nx if e in sety)
    print('%s vs %s lead: %d of %d first-pass notes exist verbatim in reprise (%.0f%%)' % (x,y,hit,len(nx),100*hit/max(1,len(nx))))
