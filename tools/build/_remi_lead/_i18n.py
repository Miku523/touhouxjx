# -*- coding: utf-8 -*-
import io, os, json, re
ZH = json.load(io.open('tools/build/_remi_lead/_note.json', encoding='utf-8'))
EN = json.load(io.open('tools/build/_remi_lead/_note_en.json', encoding='utf-8'))
JA = json.load(io.open('tools/build/_remi_lead/_note_ja.json', encoding='utf-8'))
try:
    import opencc
    ZH_T = opencc.OpenCC('s2twp').convert(ZH)
except Exception as e:
    raise SystemExit('opencc fail %s' % e)

def esc(s):
    return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

OUT = {'zh-hant': ZH_T, 'en': EN, 'ja': JA}
for name, val in OUT.items():
    p = 'src/i18n/packs/%s.js' % name
    s = io.open(p, encoding='utf-8').read()
    before = s.count('\n  "')
    if ('"' + esc(ZH[:20])) in s:
        print('  already', name); continue
    idx = s.rindex('};')
    entry = '  "%s": "%s",\n' % (esc(ZH), esc(val))
    s = s[:idx] + entry + s[idx:]
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('  %s keys %d -> %d' % (name, before, s.count('\n  "')))
