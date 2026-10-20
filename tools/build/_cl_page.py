# -*- coding: utf-8 -*-
import urllib.request, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA={'User-Agent':'Mozilla/5.0'}
def get(u):
    try:
        req=urllib.request.Request(u, headers=UA)
        with urllib.request.urlopen(req, timeout=40) as r: return r.read().decode('utf-8','replace')
    except Exception as e:
        return 'ERR '+str(e)
for u in ('https://touhou.arrangement-chronicle.com/circle/ClearLeMel',
          'https://touhou.arrangement-chronicle.com/search?q=Fantasia+Nightbug'):
    h=get(u)
    print('==',u, len(h))
    txt=re.sub(r'<[^>]+>',' ',h); txt=re.sub(r'\s+',' ',txt)
    i=txt.find('Fantasia')
    print(txt[max(0,i-400):i+600] if i>0 else txt[:700])
