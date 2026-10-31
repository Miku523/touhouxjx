
import json, os, re
root = r"C:\Users\GuSheng\Downloads\HKS"
HERE = os.path.join(root,'tools/build/_aya_lead')
note = json.load(open(os.path.join(HERE,'_note_v3.json'), encoding='utf-8'))
old = open(os.path.join(HERE,'_old_note.txt'), encoding='utf-8').read()
# 1) musicTracks
p = os.path.join(root,'src/game/musicTracks.js')
s = open(p, encoding='utf-8').read()
oldlit = json.dumps(old, ensure_ascii=False)
newlit = json.dumps(note['zh'], ensure_ascii=False)
assert s.count('note: ' + oldlit) == 1, s.count('note: ' + oldlit)
s = s.replace('note: ' + oldlit, 'note: ' + newlit)
open(p, 'w', encoding='utf-8').write(s)
print('musicTracks ok', len(note['zh']))
# 2) i18n
try:
    from opencc import OpenCC
    tw = OpenCC('s2twp')
    zhh = tw.convert(note['zh'])
except Exception as e:
    print('opencc fail', e); zhh = note['zh']
vals = {'en': note['en'], 'ja': note['ja'], 'zh-hant': zhh}
for pk, val in vals.items():
    p = os.path.join(root,'src/i18n/packs',pk+'.js')
    s = open(p, encoding='utf-8').read()
    if oldlit in s:
        # 找到 "old": "translation", 整条替换
        pat = re.compile(re.escape(oldlit) + r'\s*:\s*"(?:[^"\\]|\\.)*"')
        ms = list(pat.finditer(s))
        assert len(ms) == 1, (pk, len(ms))
        s = s[:ms[0].start()] + json.dumps(note['zh'], ensure_ascii=False) + ': ' + json.dumps(val, ensure_ascii=False) + s[ms[0].end():]
        open(p, 'w', encoding='utf-8').write(s)
        print(pk, 'replaced')
    else:
        idx = s.rfind('\n};')
        assert idx > 0
        s = s[:idx] + '\n  ' + json.dumps(note['zh'], ensure_ascii=False) + ': ' + json.dumps(val, ensure_ascii=False) + ',' + s[idx:]
        open(p, 'w', encoding='utf-8').write(s)
        print(pk, 'appended')
# 3) README bullet tail
p = os.path.join(root,'README.md')
s = open(p, encoding='utf-8').read()
i0 = s.index('四面 Boss《风神少女（天狗疾风编）》')
i1 = s.index('16 轨 / 7864 音 / 2308 鼓', i0)
i2 = s.index('\n', i1)
tail = json.load(open(os.path.join(HERE,'_readme_tail_v3.json'), encoding='utf-8'))['tail']
s = s[:i1] + tail + s[i2:]
open(p, 'w', encoding='utf-8').write(s)
print('readme ok')
# 4) version
for rel in ('index.html','src/ui/platform.js','sw.js','src/engine/songs/index.js'):
    p = os.path.join(root, rel)
    s = open(p, encoding='utf-8').read()
    n = s.count('1.6.63')
    s = s.replace('1.6.63','1.6.64')
    open(p,'w',encoding='utf-8').write(s)
    print(rel, 'bumped', n)
