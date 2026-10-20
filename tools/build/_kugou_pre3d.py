# -*- coding: utf-8 -*-
import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}
def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r: return r.read()
def j(url):
    b = get(url)
    for enc in ('utf-8','gbk','gb18030'):
        try: return json.loads(b.decode(enc))
        except Exception: pass
    return json.loads(b.decode('gb18030','replace'))
cands = {
 'unofficial_254': 'a3abe13edc5e9138caebcc24d1be356f',
 'marcia_254': '60d022cf7c96f76cbfd00f8d70de4fa0',
 'mayumi_254': 'dcd5cb6958c3f0a86d5c575ed457e211',
 'instrumental_254': 'a7d0160005fa4046a34b7936b143f745',
 'senya_ed3_254': '4fd5c30cde45245ee1a963ce2f8b34d2',
 'edver_97': '3d12ab65c375454c2d4446aa5c3f9e60',
}
for tag,h in cands.items():
    try:
        d = j('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h)
        u = d.get('url') or ''
        print(tag, '| err:', d.get('error'), '| len', d.get('timeLength'), '| url', u[:90])
    except Exception as e:
        print(tag, 'fail', e)
