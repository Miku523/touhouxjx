# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import yuuhei_pre3 as Y, preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\yuuhei_pre3.js', 'YUUHEI_PRE3', 'pre3')
harm = [n for n in s['tracks'][2]['notes']]
print('harm 类型', type(harm[0]), harm[0])
bar = 4*60/144; beat = 60/144
pad = Y.intro_pad(harm, 2, bar, beat)
print('pad 音符', len(pad))
