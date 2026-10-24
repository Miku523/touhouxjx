# -*- coding: utf-8 -*-
"""把 musicTracks.js 里 extra 解说重新拼成带 \\n 的多行字符串字面量。"""
import io

BS = chr(92)
NL = chr(10)
p = 'src/game/musicTracks.js'
s = io.open(p, encoding='utf-8').read()
head = "      'EXTRA Boss 曲。前半场几乎空着"
i = s.index(head)
tail_mark = '——芙兰朵露：「有人吗？」' + "',"
j = s.index(tail_mark, i) + len(tail_mark)
old = s[i:j]
# 把现有的两个字面量合并成规范文本
body = old.replace("      '", '').replace("' +", '').replace("',", '')
parts = [x.strip() for x in body.split(NL) if x.strip()]
text = ''.join(parts)
if NL not in text:
    text = text.replace('忍不住了。', '忍不住了。' + NL, 1)

seg = text.split(NL)
out = []
for k, x in enumerate(seg):
    if k < len(seg) - 1:
        out.append("      '%s'" % (x + BS + 'n') + ' +')
    else:
        out.append("      '%s'," % x)
s = s[:i] + NL.join(out) + s[j:]
io.open(p, 'w', encoding='utf-8', newline=NL).write(s)
print('rewrote extra note with', len(seg), 'literal line(s)')
