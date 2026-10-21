# -*- coding: utf-8 -*-
import urllib.request, json, re, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'}
def raw(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()
chains = ['1Y0UPdaG6V3','1Y1993eG6V3','1Y1bd18G6V3']
for c in chains:
    page = raw('https://m.kugou.com/share/song.html?chain=' + c)
    txt = page.decode('utf-8', 'replace')
    m = re.search(r'var\s+songData\s*=\s*(\{.*?\});', txt, re.S)
    print('===', c, 'page', len(page), 'bytes', 'songData' if m else 'no songData')
    if m:
        d = json.loads(m.group(1))
        print('   标题:', d.get('song_name'), '| 作者:', d.get('author_name'), '| 专辑:', d.get('album_name'), '| 时长:', d.get('timelength'), '| hash:', d.get('hash'))
        continue
    # 备用：直接抓 title / 关键词
    for pat in (r'<title>(.*?)</title>', r'"songname":"(.*?)"', r'hash=([0-9A-F]{32})'):
        mm = re.findall(pat, txt)
        print('   ', pat, '->', mm[:3])
