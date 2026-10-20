# -*- coding: utf-8 -*-
import urllib.request, json, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}
url = 'https://m.kugou.com/share/song.html?chain=1W1I5d3G6V3'
req = urllib.request.Request(url, headers=UA)
body = urllib.request.urlopen(req, timeout=40).read().decode('utf-8','replace')
print('body bytes', len(body))
for pat in (r'"hash"\s*:\s*"([0-9A-Fa-f]{32})"', r'hash=([0-9A-Fa-f]{32})', r'"album_id"\s*:\s*"?(\d+)'):
    m = re.findall(pat, body)
    print(pat, '->', m[:5])
m = re.search(r'<title>(.*?)</title>', body, re.S)
print('title:', m.group(1).strip() if m else '?')
