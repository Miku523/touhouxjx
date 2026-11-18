# -*- coding: utf-8 -*-
import json, io
rows = json.load(io.open('tools/build/_loud2.txt', encoding='utf-8'))
cols = ['name','dur','rms','peak','crest','cen','sub','low','lmid','mid','himid','hi']
lines = [','.join(cols)]
for r in rows:
    lines.append(','.join(str(r.get(c,'')) for c in cols))
io.open('tools/build/_loud2.csv','w',encoding='utf-8').write('\n'.join(lines))
