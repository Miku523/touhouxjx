# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\yuuhei_pre3.js', 'YUUHEI_PRE3', 'pre3')
def t_of(n): return n['t'] if isinstance(n,dict) else n[0]
def v_of(n): return n['v'] if isinstance(n,dict) else n[3]
for a in range(0,5):
    print('%.0f-%.0fs 音数 %d' % (a,a+1,len([n for n in s['tracks'][0]['notes'] if a<=t_of(n)<a+1])),
          end=' ')
    print('贝斯', len([n for n in s['tracks'][1]['notes'] if a<=t_of(n)<a+1]), '鼓', len([d for d in s['drums'] if a<=d[0]<a+1]))
print('最早 5 个音 t=', sorted(t_of(n) for n in s['tracks'][0]['notes'])[:5])
