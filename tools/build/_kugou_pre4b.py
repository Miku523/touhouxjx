# -*- coding: utf-8 -*-
import urllib.request, json, sys, urllib.parse
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
def j(url):
    b = get(url)
    for enc in ('utf-8','gbk','gb18030'):
        try: return json.loads(b.decode(enc))
        except Exception: pass
    return json.loads(b.decode('gb18030','replace'))
h = 'A50C350AE9F46FB6641B88399E003BDA'
d = j('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h)
print(json.dumps({k: d.get(k) for k in ('songName','fileName','timeLength','url','error','album_id','singername')}, ensure_ascii=False)[:800])
# 搜索同名曲目看有没有免费投稿
api = 'http://mobilecdn.kugou.com/api/v3/search/song?keyword=%s&page=1&pagesize=20&format=json' % urllib.parse.quote('おてんば恋娘')
dd = j(api)
for s in ((dd.get('data') or {}).get('info') or [])[:20]:
    print('搜索:', s.get('filename'), '|', s.get('duration'), 's | hash', s.get('hash'), '| album', s.get('album_id'))
