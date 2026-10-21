# -*- coding: utf-8 -*-
import urllib.request, json, sys, os, re
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/612.1.15'}
def raw(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
txt = raw('https://m.kugou.com/share/song.html?chain=1YihN24G6V3').decode('utf-8','replace')
i = txt.find('"song_info"')
j = txt.find('{', i)
depth = 0
for k in range(j, len(txt)):
    if txt[k] == '{': depth += 1
    elif txt[k] == '}':
        depth -= 1
        if depth == 0:
            blob = txt[j:k+1]; break
d = json.loads(blob)
print(json.dumps(d, ensure_ascii=False)[:2500])
