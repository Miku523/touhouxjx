
import re, os, json
root = r"C:\Users\GuSheng\Downloads\HKS"
for pk in ('en','ja','zh-hant'):
    p = os.path.join(root,'src/i18n/packs',pk+'.js')
    s = open(p, encoding='utf-8').read()
    keys = re.findall(r'^\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')\s*:', s, re.M)
    hit = [k for k in keys if '四面 Boss 曲' in k]
    print(pk, len(keys), 'stage4-note keys:', len(hit))
    for k in hit:
        print('   ', k[:90])
