# -*- coding: utf-8 -*-
import io, json, re
s = io.open('src/game/musicTracks.js', encoding='utf-8').read()
out = {}
for k in ('pre1','pre2','pre3','pre4','pre6'):
    i = s.index("key: '%s'" % k)
    j = s.index('\n  },', i)
    out[k] = s[i:j]
io.open('tools/build/_pret_lead/_old_blocks.json','w',encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1))
print('blocks', list(out))
for k,v in out.items():
    print('=====', k)
    print(v[:1400])