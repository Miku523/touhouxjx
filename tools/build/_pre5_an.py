# -*- coding: utf-8 -*-
import sys, os, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
BUILD = r'C:\Users\GuSheng\Downloads\HKS\tools\build'
sys.path.insert(0, BUILD)
import numpy as np
import _ref5_lib as L

d = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre5'
tags = {'refA': 'ZUN 原曲', 'refB': '来夢緑', 'refC': 'TAMUSIC'}
res = {}
for tag in ('refA', 'refB', 'refC'):
    p = os.path.join(d, tag + '.mp3')
    if not os.path.exists(p):
        print('缺文件', p); continue
    print('\n########', tag, tags[tag])
    o = L.analyze(p, verbose=True)
    res[tag] = o
json.dump(res, open(os.path.join(BUILD, '_pre5_features.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('\nsaved', list(res))
