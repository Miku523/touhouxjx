
import json,io
d=json.load(io.open('tools/build/_yuk_lead/stats4.json',encoding='utf-8'))
rows=d['rows']
cols=['lead','counter','brass','strings','harpsi','arp','bell','choir','pad','bass','sub','drums']
print('sec   '+' '.join('%7s'%c for c in cols))
for r in rows:
    print('%-6s'%r['sec']+' '.join('%7d'%r.get(c,0) for c in cols))
if 'gaps' in d: print('gaps', d['gaps'][:3])
