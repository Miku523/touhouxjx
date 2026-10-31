
import json, os
root = r"C:\Users\GuSheng\Downloads\HKS"
HERE = os.path.join(root,'tools/build/_aya_lead')
song = json.load(open(os.path.join(HERE,'song.json'), encoding='utf-8'))
secs = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
S = dict((n,(a,b)) for n,a,b in secs['secs'])
dr = song['drums']
def ds(nm):
    a,b=S[nm]; return [(round(e[0]-a,3), e[1], e[2]) for e in dr if a-1e-9 <= e[0] < b-1e-9]
x,y='a2','a2b'
dx,dy=ds(x),ds(y)
print(len(dx),len(dy))
print(dx[:6])
print(dy[:6])
print(dx[-3:])
print(dy[-3:])
diff=[(i,p,q) for i,(p,q) in enumerate(zip(dx,dy)) if p[0]!=q[0] or p[1]!=q[1]]
print('diffs', len(diff), diff[:5])
