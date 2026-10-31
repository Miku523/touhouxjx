# -*- coding: utf-8 -*-
import re, json, os
p = 'src/engine/songs/septette_ex.js'
src = open(p, encoding='utf-8').read()
print('bytes', len(src))
head = src[:600]
print('HEAD>>>')
print(head)
print('<<<')
# count tracks by 'wave:' occurrences and notes arrays
print('wave count', src.count("wave:"))
print('notes count', src.count('notes: ['))
print('drums', 'drums' in src)
# find duration/bpm literals
for k in ['duration','bpm','title']:
    m = re.findall(k + r"\s*:\s*([^,\n]+)", src)
    print(k, m[:5])
