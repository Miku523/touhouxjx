# -*- coding: utf-8 -*-
import urllib.request, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'}
url = 'https://sharefs.kugou.com/202610210128/82b08a3980bab7c52d935e3e3098d5e5/v3/a50c350ae9f46fb6641b88399e003bda/yp/full/ap1000_us0_pi409_s196568475.mp3'
blob = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
p = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref6_ateam.mp3'
open(p,'wb').write(blob)
print('下载', len(blob), '->', p)
