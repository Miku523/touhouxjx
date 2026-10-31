
import json, io, sys
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
D = json.load(open(ROOT + '/tools/build/_cirno_lead/_note_v7.json', encoding='utf-8'))
zh, en, ja, readme = D['zh'], D['en'], D['ja'], D['readme']

def rd(p):
    return open(p, encoding='utf-8').read()
def wr(p, s):
    open(p, 'w', encoding='utf-8', newline='\n').write(s)

def jsq(s):
    # single-quoted JS literal
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') + "'"

# 1) musicTracks note
p = ROOT + '/src/game/musicTracks.js'
s = rd(p)
old_start = s.index("    note:\n      '三面 Boss 曲（2:00 · 第六版）")
old_end = s.index("厉害吧？」',", old_start) + len("厉害吧？」',")
new = "    note:\n      " + jsq(zh) + ","
assert s[old_start:old_end].count('琪露诺') == 1
s = s[:old_start] + new + s[old_end:]
wr(p, s)
print('musicTracks ok')

# 2) i18n packs: replace old v6 note entry line with v7 entry
vals = {'en': en, 'ja': ja, 'zh-hant': None}
for lang, val in vals.items():
    p = ROOT + '/src/i18n/packs/' + lang + '.js'
    lines = rd(p).split('\n')
    hits = [i for i, l in enumerate(lines) if l.startswith('"三面 Boss 曲（2:00 · 第六版）')]
    assert len(hits) == 1, (lang, hits)
    i = hits[0]
    if val is None:
        # zh-hant: opencc s2twp
        from opencc import OpenCC
        cc = OpenCC('s2twp')
        val = cc.convert(zh)
    line = '  ' + json.dumps(zh, ensure_ascii=False) + ': ' + json.dumps(val, ensure_ascii=False) + ','
    lines[i] = line
    wr(p, '\n'.join(lines))
    print('i18n', lang, 'ok', len(val))

# 3) README bullet
p = ROOT + '/README.md'
lines = rd(p).split('\n')
hits = [i for i, l in enumerate(lines) if l.startswith('  - 三面 Boss《活泼的恋之少女（冰上算术编）》')]
assert len(hits) == 1, hits
lines[hits[0]] = readme
wr(p, '\n'.join(lines))
print('README ok')

# 4) version bump
for rel, n_exp in (('index.html', 14), ('src/ui/platform.js', 2), ('sw.js', 2), ('src/engine/songs/index.js', 4)):
    p = ROOT + '/' + rel
    s = rd(p)
    c = s.count('1.6.61')
    assert c == n_exp, (rel, c)
    wr(p, s.replace('1.6.61', '1.6.62'))
    print('version', rel, c)
