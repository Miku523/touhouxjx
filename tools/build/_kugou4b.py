# -*- coding: utf-8 -*-
import urllib.request, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'}
req = urllib.request.Request('https://m.kugou.com/share/song.html?chain=1Y0UPdaG6V3', headers=UA)
txt = urllib.request.urlopen(req, timeout=60).read().decode('utf-8','replace')
for pat in (r'[0-9A-Fa-f]{32}', r'hash[\"\':= ]+([\w]+)', r'src\s*=\s*\"([^\"]+\.js[^\"]*)\"'):
    found = re.findall(pat, txt)
    print(pat, '->', found[:8])
i = txt.find('フォールオブフォール')
print('---- 片段 ----')
print(txt[max(0,i-600): i+400].replace('\n',' ')[:1200])
