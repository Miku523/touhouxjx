# -*- coding: utf-8 -*-
"""解析第 6 批酷狗分享链（竹取飛翔重编参考曲，5 首）→ _ref6_meta.json"""
import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'}


def raw(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()


def grab(txt, key):
    i = txt.find(key)
    if i < 0:
        return None
    j = txt.find('{', i)
    depth = 0
    for k in range(j, len(txt)):
        if txt[k] == '{':
            depth += 1
        elif txt[k] == '}':
            depth -= 1
            if depth == 0:
                blob = txt[j:k + 1]
                try:
                    return json.loads(blob)
                except Exception:
                    return None
    return None


links = {
    '1YjhN18G6V3': 'ref1',
    '1Yjjx3bG6V3': 'ref2',
    '1Yjmte6G6V3': 'ref3',
    '1YjpbbeG6V3': 'ref4',
    '1Yjtb38G6V3': 'ref5',
}
out = {}
for chain, tag in links.items():
    try:
        txt = raw('https://m.kugou.com/share/song.html?chain=' + chain).decode('utf-8', 'replace')
    except Exception as e:
        print(tag, chain, '抓取失败', e)
        continue
    d = grab(txt, '"song_info"')
    if not d:
        print(tag, chain, 'song_info 解析失败 len=', len(txt))
        continue
    data = d.get('data', d)
    info = {k: data.get(k) for k in
            ('songname', 'song_name', 'author_name', 'hash', 'album_id', 'timeLength', 'audio_id', 'album_name')}
    print(tag, chain, json.dumps(info, ensure_ascii=False))
    out[chain] = {'tag': tag, **info}
json.dump(out, open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_ref6_meta.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('saved', len(out))
