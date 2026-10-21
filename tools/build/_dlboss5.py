# -*- coding: utf-8 -*-
import urllib.request, json, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/612.1.15'}
DEST = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\boss5'
os.makedirs(DEST, exist_ok=True)
def raw(url, timeout=180):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
def song_info(chain):
    txt = raw('https://m.kugou.com/share/song.html?chain=' + chain).decode('utf-8','replace')
    i = txt.find('"song_info"'); j = txt.find('{', i); depth = 0
    for k in range(j, len(txt)):
        if txt[k] == '{': depth += 1
        elif txt[k] == '}':
            depth -= 1
            if depth == 0:
                return json.loads(txt[j:k+1])['data']
links = [('1YihN24G6V3','refA'), ('1Yizvf4G6V3','refB'), ('1Yio187G6V3','refC'), ('1Yit724G6V3','refD')]
meta = {}
for chain, tag in links:
    d = song_info(chain)
    url = d.get('url')
    size = d.get('fileSize')
    path = os.path.join(DEST, tag + '.mp3')
    if not (os.path.exists(path) and abs(os.path.getsize(path) - size) < 4096):
        blob = raw(url)
        open(path, 'wb').write(blob)
    meta[tag] = dict(chain=chain, name=d.get('songName'), artist=d.get('author_name'),
                     hash=d.get('hash'), secs=d.get('timeLength'), size=os.path.getsize(path),
                     path=path, album=d.get('albumid'))
    print(tag, d.get('songName'), '/', d.get('author_name'), '| %ss | %.1fMB' % (d.get('timeLength'), os.path.getsize(path)/1048576))
json.dump(meta, open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_boss5_meta.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('saved')
