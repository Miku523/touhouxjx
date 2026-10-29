# -*- coding: utf-8 -*-
import io, json
D = json.load(open('tools/build/_fld_lead/v6_notes.json', encoding='utf-8'))
P = json.load(open('tools/build/_fld_lead/v6_para.json', encoding='utf-8'))
ZH, EN, JA = D['zh'], D['en'], D['ja']
para = P['para'].replace('~B~', chr(96))
from opencc import OpenCC
HANT = OpenCC('s2twp').convert(ZH)

p = 'src/game/musicTracks.js'
s = io.open(p, encoding='utf-8').read()
i = s.index("    key: 'extra',")
j = s.index('  },\n', i)
blk = s[i:j]
assert '第五版' in blk
k = blk.index('    note:')
new = blk[:k] + '    note:\n      ' + json.dumps(ZH, ensure_ascii=False)
s = s[:i] + new + s[j:]
io.open(p, 'w', encoding='utf-8').write(s)
print('musicTracks ok')

for path, val in (('src/i18n/packs/en.js', EN), ('src/i18n/packs/ja.js', JA), ('src/i18n/packs/zh-hant.js', HANT)):
    lines = io.open(path, encoding='utf-8').read().split('\n')
    hit = [n for n, ln in enumerate(lines) if '第五版' in ln]
    assert len(hit) == 1, (path, len(hit))
    lines[hit[0]] = '  ' + json.dumps(ZH, ensure_ascii=False) + ': ' + json.dumps(val, ensure_ascii=False) + ','
    io.open(path, 'w', encoding='utf-8').write('\n'.join(lines))
    print('pack ok', path)

p = 'README.md'
s = io.open(p, encoding='utf-8').read()
i = s.index('  - EXTRA 终盘《恶魔之妹》第五次重做（v5）')
j = s.index('\n', i)
s = s[:i] + para + s[j:]
io.open(p, 'w', encoding='utf-8').write(s)
print('README ok')

p = 'docs/NETWORK_CN.md'
s = io.open(p, encoding='utf-8').read()
old = '| ~B~flandre_devil~B~ | EXTRA 终盘（恶魔之妹） | 6,615,044 B | **1,703,438 B** |'.replace('~B~', chr(96))
new = old.replace('1,703,438 B', '1,718,362 B')
assert s.count(old) == 1
io.open(p, 'w', encoding='utf-8').write(s.replace(old, new))
print('NETWORK ok')

for p in ('index.html', 'src/ui/platform.js', 'sw.js', 'src/engine/songs/index.js'):
    s = io.open(p, encoding='utf-8').read()
    n = s.count('1.6.38')
    io.open(p, 'w', encoding='utf-8').write(s.replace('1.6.38', '1.6.39'))
    print('bump', p, n)
