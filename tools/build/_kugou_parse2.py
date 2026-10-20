# -*- coding: utf-8 -*-
import urllib.request, re, json, sys
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}
def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')
for chain in ('1VZkD69G6V3', '1VZmV04G6V3'):
    url = 'https://m.kugou.com/share/song.html?chain=' + chain
    html = get(url)
    print('=' * 20, chain, 'len', len(html))
    title = re.search(r'<title>(.*?)</title>', html, re.S)
    print('title:', title.group(1).strip() if title else None)
    for pat in (r'"hash"\s*:\s*"([0-9A-F]{32})"', r'hash=([0-9A-F]{32})', r'"album_id"\s*:\s*"?(\d+)', r'"songname"\s*:\s*"([^"]+)"', r'"singername"\s*:\s*"([^"]+)"', r'"album_name"\s*:\s*"([^"]+)"'):
        m = re.findall(pat, html)
        if m:
            print(pat, '->', m[:5])
    # og meta
    for og in re.findall(r'<meta[^>]+property="og:[^"]+"[^>]*>', html)[:6]:
        print('  ', og[:160])
