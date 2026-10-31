import sys, os, json, importlib
HERE = os.path.join(os.getcwd(), 'tools', 'build')
sys.path.insert(0, HERE)
import _remi_compose as C
SEC = [('intro',1,4),('intro2',5,12),('A',13,20),('vamp',21,28),('A2',29,36),('A3',37,44),
       ('B',45,52),('C',53,60),('C2',61,68),('Final',69,76),('Final2',77,85),('outro',86,89)]
out = {n: [round(C.NB0[a],3), round(C.NB0[b+1],3)] for n,a,b in SEC}
out['_dur'] = C.DUR
open('tools/build/_remi_lead/secs.json','w',encoding='utf-8').write(json.dumps(out,ensure_ascii=False,indent=1))
print(json.dumps(out,ensure_ascii=False,indent=1))
