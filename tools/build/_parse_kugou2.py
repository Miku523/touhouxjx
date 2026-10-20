# -*- coding: utf-8 -*-
import urllib.request, json, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'}
def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()
page = get('https://m.kugou.com/share/song.html?chain=1VZQTfcG6V3')
for enc in ('utf-8','gbk','gb18030'):
    try:
        html = page.decode(enc); break
    except Exception: continue
print('页面长度', len(page))
# 提取 hash / 曲名 / 专辑
for pat in (r'data-hash="([0-9A-F]{32})"', r'"hash":"([0-9A-F]{32})"', r'hash=([0-9A-F]{32})'):
    m = re.findall(pat, html)
    if m: print('hash:', m[:3]); break
for pat in (r'<title>(.*?)</title>', r'"songname":"(.*?)"', r'"album_name":"(.*?)"'):
    m = re.findall(pat, html)
    if m: print('字段', pat[:20], m[:3])
i = html.find('shareData')
print(html[i:i+400] if i>0 else '无 shareData')
