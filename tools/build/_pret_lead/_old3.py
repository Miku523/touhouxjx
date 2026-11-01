# -*- coding: utf-8 -*-
import io, json, re
blocks = json.load(io.open('tools/build/_pret_lead/_old_blocks.json', encoding='utf-8'))
out={}
for k,v in blocks.items():
    t = re.search(r"title: '([^']*)'", v).group(1)
    o = re.search(r"orig: '([^']*)'", v).group(1)
    n0 = v.index('note:')
    m = re.search(r"'([^']*)'", v[n0:])
    first = m.group(1) if m else ''
    out[k] = {'title': t, 'orig': o, 'first': first}
io.open('tools/build/_pret_lead/_old_keys.json','w',encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1))
io.open('tools/build/_pret_lead/_old_keys.txt','w',encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1))
print('ok')