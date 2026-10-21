# -*- coding: utf-8 -*-
# 6 面道中三首参考曲的频谱/节奏/调性体检
import sys, os, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ref5_lib as L
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6'
out = {}
for tag in ('refA', 'refB', 'refC'):
    p = os.path.join(BASE, tag + '.mp3')
    if not os.path.exists(p):
        print(tag, 'missing'); continue
    try:
        r = L.analyze(p)
        print('===', tag)
        print(json.dumps(r, ensure_ascii=False)[:1500])
        out[tag] = r
    except Exception as e:
        print(tag, 'ERR', type(e).__name__, e)
json.dump(out, open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_pre6_features.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
