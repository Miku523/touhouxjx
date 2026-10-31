# -*- coding: utf-8 -*-
import io, json, os
P = os.path.join(os.getcwd(), 'src', 'game', 'musicTracks.js')
s = io.open(P, encoding='utf-8').read()
i = s.index("key: 'ex_mid'")
st = s.rindex('  {\n', 0, i)
en = s.index('\n  },', i) + len('\n  },')
blk = s[st:en]
lines = blk.split('\n')
keep = []
for ln in lines:
    if ln.strip().startswith('time:') or ln.strip().startswith('note:'):
        break
    keep.append(ln)
# keep 末尾应是 glow 行，去掉尾随空行
while keep and keep[-1].strip() == '':
    keep.pop()
note = json.load(io.open('tools/build/_remi_lead/_note.json', encoding='utf-8'))
parts = note.split('\n')
new = keep + ['    time: 148.7,', '    note:']
for k, ln in enumerate(parts):
    tail = ' +' if k < len(parts) - 1 else ','
    new.append("      '" + ln.replace('\\', '\\\\').replace("'", "\\'") + "'" + tail)
new.append('  },')
out = s[:st] + '\n'.join(new) + s[en:]
io.open(P, 'w', encoding='utf-8', newline='').write(out)
print('lines', len(new))
