# -*- coding: utf-8 -*-
import urllib.request, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
rid='MUSIC_384966852'
u = 'http://antiserver.kuwo.cn/anti.s?type=convert_url&format=mp3&response=url&rid=%s' % rid
req = urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0','Referer':'http://www.kuwo.cn/'})
url = urllib.request.urlopen(req, timeout=20).read().decode('utf-8','replace').strip()
print('url:', url[:160])
if url.startswith('http'):
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=60).read()
    out = r'C:\Users\GuSheng\Downloads\HKS\tools\build\_ref_pre1.mp3'
    open(out,'wb').write(data)
    print('saved', len(data), 'bytes')
