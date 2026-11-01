import json, collections, os
L = r'C:\Users\GuSheng\Downloads\HKS\tools\build\_kag_lead'
S = json.load(open(os.path.join(L,'song.json'), encoding='utf-8'))
BAR = 60/154*4
dr = S['drums']
per = collections.defaultdict(collections.Counter)
for t,k,v in [(e[0],e[1],e[2]) for e in dr]:
    b = int(t/BAR)+1
    per[b][k]+=1
tot = {b:sum(c.values()) for b,c in per.items()}
def show(b0,b1,tag):
    vals=[tot.get(b,0) for b in range(b0,b1+1)]
    print(tag, 'bars %d-%d'%(b0,b1), 'min %d max %d avg %.1f'%(min(vals),max(vals),sum(vals)/len(vals)))
    print('   kinds', {k:sum(per[b][k] for b in range(b0,b1+1)) for k in range(8)})
show(1,4,'intro'); show(5,17,'A1'); show(18,33,'B'); show(36,49,'C'); show(50,57,'C2'); show(58,91,'D'); show(92,100,'outro'); show(101,104,'coda')
print('total drums', len(dr))
