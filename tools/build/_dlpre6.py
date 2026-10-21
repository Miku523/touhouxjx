# -*- coding: utf-8 -*-
# 下载 6 面道中三首参考曲到 Temp/ghostly_ref_site/pre6
import urllib.request, json, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/612.1.15'}
meta = json.load(open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_pre6_meta.json', encoding='utf-8'))
outdir = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre6'
os.makedirs(outdir, exist_ok=True)
for chain, info in meta.items():
    tag = info['tag']; h = info['hash']
    api = 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h
    try:
        d = json.loads(urllib.request.urlopen(urllib.request.Request(api, headers=UA), timeout=90).read().decode('utf-8', 'replace'))
    except Exception as e:
        print(tag, 'api fail', e); continue
    url = d.get('url') or ''
    if not url:
        print(tag, 'no url', json.dumps({k: d.get(k) for k in ('error','status','failProcess')}, ensure_ascii=False)); continue
    ext = os.path.splitext(url.split('?')[0])[1] or '.mp3'
    path = os.path.join(outdir, tag + ext)
    urllib.request.urlretrieve(url, path)
    print(tag, info['author_name'], os.path.getsize(path) // 1024, 'KB ->', path)
