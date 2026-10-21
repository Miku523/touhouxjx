# -*- coding: utf-8 -*-
"""解析 5 面道中《広有射怪鳥事》参考链（1Ycvv8cG6V3 / 1YcDV0dG6V3 / 1YcQ9b1G6V3）→ _pre5_meta.json"""
import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/612.1.15'}
def raw(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
def grab(txt, key):
    i = txt.find(key)
    if i < 0: return None
    j = txt.find('{', i); depth = 0
    for k in range(j, len(txt)):
        if txt[k] == '{': depth += 1
        elif txt[k] == '}':
            depth -= 1
            if depth == 0:
                try: return json.loads(txt[j:k+1])
                except Exception: return None
    return None
links = [('1Ycvv8cG6V3','refA'), ('1YcDV0dG6V3','refB'), ('1YcQ9b1G6V3','refC')]
out = {}
for chain, tag in links:
    try:
        txt = raw('https://m.kugou.com/share/song.html?chain=' + chain).decode('utf-8','replace')
    except Exception as e:
        print(tag, chain, '抓取失败', e); continue
    d = grab(txt, '"song_info"')
    if not d:
        print(tag, chain, '解析失败 len=', len(txt)); continue
    data = d.get('data', d) or {}
    info = {k: data.get(k) for k in ('songname','song_name','author_name','hash','album_id','timeLength','audio_id','album_name')}
    info['tag'] = tag; info['chain'] = chain
    print(tag, chain, json.dumps(info, ensure_ascii=False))
    out[chain] = info
json.dump(out, open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_pre5_meta.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('saved', len(out))
