# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, json, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/612.1.15'}
def get(url):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode('utf-8','replace'))
for kw in ['ツェペシュの幼き末裔', 'Tepes', '幼き末裔']:
    q = urllib.parse.quote(kw)
    try:
        d = get('http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=%s&page=1&pagesize=10' % q)
    except Exception as e:
        print(kw, 'ERR', e); continue
    data = (d.get('data') or {}).get('info') or []
    print('==', kw, len(data))
    for it in data[:10]:
        print('  %-40s | %-24s | %ss | %s' % (it.get('songname'), it.get('singername'), it.get('duration'), it.get('hash')))
