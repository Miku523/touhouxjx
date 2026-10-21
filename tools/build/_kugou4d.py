# -*- coding: utf-8 -*-
import urllib.request, re, json, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'}
def raw(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()

def grab(txt, key):
    i = txt.find(key)
    if i < 0: return None
    j = txt.find('{', i)
    depth = 0
    for k in range(j, len(txt)):
        if txt[k] == '{': depth += 1
        elif txt[k] == '}':
            depth -= 1
            if depth == 0:
                blob = txt[j:k+1]
                try: return json.loads(blob)
                except Exception: return None
    return None

links = {'1Y0UPdaG6V3':'ref4a', '1Y1993eG6V3':'ref4b', '1Y1bd18G6V3':'ref4c'}
out = {}
for chain, tag in links.items():
    txt = raw('https://m.kugou.com/share/song.html?chain=' + chain).decode('utf-8','replace')
    d = grab(txt, '"song_info"')
    if not d: print('解析失败', chain); continue
    data = d.get('data', d)
    info = {k: data.get(k) for k in ('songname','song_name','author_name','hash','album_id','timeLength','audio_id')}
    print(tag, chain, json.dumps(info, ensure_ascii=False))
    out[chain] = info
json.dump(out, open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_ref4_meta.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
