# -*- coding: utf-8 -*-
"""删掉 zh-hant 里两条已经无人引用的旧 EX 解说 key。"""
import io

NL = chr(10)
p = 'src/i18n/packs/zh-hant.js'
lines = io.open(p, encoding='utf-8').read().split(NL)
dead = ['EXTRA 中段。圆舞曲', 'EXTRA Boss 曲。芙兰朵露把音量开到最大']
out, n = [], 0
for ln in lines:
    if any(ln.startswith('  "' + d) for d in dead):
        n += 1
        continue
    out.append(ln)
io.open(p, 'w', encoding='utf-8', newline=NL).write(NL.join(out))
print('removed', n, 'dead key(s); lines now', len(out))
