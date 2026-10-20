# -*- coding: utf-8 -*-
import urllib.request, json, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'}
def raw(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()
b = raw('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=4A537AD76C9D46B2AA81914DA316C721')
for enc in ('utf-8','gbk','gb18030'):
    try:
        info = json.loads(b.decode(enc)); break
    except Exception: continue
url = info['url']
out = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref3.mp3'
os.makedirs(os.path.dirname(out), exist_ok=True)
data = raw(url)
open(out,'wb').write(data)
print('下载', len(data), 'bytes ->', out)
print('时长标称', info.get('timeLength'), 's')
