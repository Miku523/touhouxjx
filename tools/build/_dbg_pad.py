# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import yuuhei_pre3 as Y
print('harness ok')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\yuuhei_pre3.js', 'YUUHEI_PRE3', 'pre3')
print('轨数', len(s['tracks']), [t['wave'] for t in s['tracks']])
