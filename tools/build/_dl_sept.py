# -*- coding: utf-8 -*-
import urllib.request, json, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/612.1.15'}
h = '3fd12027f4f831ba07f0e49ec63a2147'   # 上海アリス幻樂団 / 亡き王女の為のセプテット / 140s
api = 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h
d = json.loads(urllib.request.urlopen(urllib.request.Request(api, headers=UA), timeout=90).read().decode('utf-8','replace'))
url = d.get('url')
print('name', d.get('songName'), '| singer', d.get('singerName'), '| dur', d.get('timeLength'), 's')
outdir = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex'
os.makedirs(outdir, exist_ok=True)
if url:
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()
    p = os.path.join(outdir, 'septette_zun.mp3')
    open(p, 'wb').write(data)
    print('->', p, len(data)//1024, 'KB')
else:
    print('no url', d)
