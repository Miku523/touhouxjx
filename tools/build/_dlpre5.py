# -*- coding: utf-8 -*-
import urllib.request, json, sys, os, io
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/612.1.15'}
meta = json.load(open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_pre5_meta.json', encoding='utf-8'))
outdir = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\pre5'
os.makedirs(outdir, exist_ok=True)
for chain, info in meta.items():
    h = info['hash']; tag = info['tag']
    api = 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h
    txt = urllib.request.urlopen(urllib.request.Request(api, headers=UA), timeout=90).read().decode('utf-8','replace')
    d = json.loads(txt)
    url = d.get('url')
    name = d.get('songName'); singer = d.get('singerName'); dur = d.get('timeLength')
    print(tag, '|', name, '|', singer, '|', dur, 's |', (url or '')[:60])
    info.update({'songName': name, 'singerName': singer, 'url': url})
    if not url: continue
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()
    p = os.path.join(outdir, tag + '.mp3')
    open(p, 'wb').write(data)
    print('   ->', p, len(data)//1024, 'KB')
json.dump(meta, open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_pre5_meta.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
