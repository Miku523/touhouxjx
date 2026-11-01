# -*- coding: utf-8 -*-
import io, json, re
blocks = json.load(io.open('tools/build/_pret_lead/_old_blocks.json', encoding='utf-8'))
out=[]
for k,v in blocks.items():
    t = re.search(r"title: '([^']*)'", v).group(1)
    o = re.search(r"orig: '([^']*)'", v).group(1)
    tm = re.search(r'time: ([0-9.]+)', v).group(1)
    n0 = v.index('note:')
    pieces = re.findall(r"'((?:[^'\\\\]|\\\\.)*)'", v[n0:])
    note = ''.join(p.replace(chr(92)+'n', chr(10)).replace(chr(92)+chr(39), chr(39)) for p in pieces)
    out.append('%s | title=%s | orig=%s | time=%s | note_len=%d' % (k, t, o, tm, len(note)))
    out.append('   NOTE: ' + note.replace(chr(10), ' <NL> '))
io.open('tools/build/_pret_lead/_old_info.txt','w',encoding='utf-8').write(chr(10).join(out))
print('ok')