# -*- coding: utf-8 -*-
import urllib.request, re
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}
def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    return raw
for chain in ('1VZkD69G6V3', '1VZmV04G6V3'):
    raw = get('https://m.kugou.com/share/song.html?chain=' + chain)
    print('='*20, chain, len(raw))
    for enc in ('utf-8','gbk'):
        try:
            html = raw.decode(enc)
            t = re.search(r'<title>(.*?)</title>', html, re.S)
            print(enc, 'title:', t.group(1).strip() if t else None)
        except Exception as e:
            print(enc, 'fail', e)
    html = raw.decode('utf-8','replace')
    i = html.find('4A537AD76C9D46B2AA81914DA316C721')
    print('...context:', re.sub(r'\s+',' ', html[max(0,i-600):i+300])[:900])
