# -*- coding: utf-8 -*-
import urllib.request, json, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}
def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r: return r.read()
def j(url):
    b = get(url)
    for enc in ('utf-8','gbk','gb18030'):
        try: return json.loads(b.decode(enc))
        except Exception: pass
    return json.loads(b.decode('gb18030','replace'))
outdir = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site'
os.makedirs(outdir, exist_ok=True)
want = {'ref5_full': 'dcd5cb6958c3f0a86d5c575ed457e211', 'ref5_inst': 'a7d0160005fa4046a34b7936b143f745',
        'ref5_marcia': '60d022cf7c96f76cbfd00f8d70de4fa0'}
for tag,h in want.items():
    d = j('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h)
    u = d.get('url')
    if not u: print(tag, '无 url'); continue
    blob = get(u)
    p = os.path.join(outdir, tag + '.mp3'); open(p,'wb').write(blob)
    print(tag, len(blob), 'bytes ->', p)
# 搜原曲可播放版本
q = 'ルーネイトエルフ 上海アリス幻樂団'
api = 'http://mobilecdn.kugou.com/api/v3/search/song?keyword=%s&page=1&pagesize=15&format=json' % urllib.parse.quote(q)
d = j(api)
for s in ((d.get('data') or {}).get('info') or []):
    h = s.get('hash')
    info = j('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h)
    print('原曲候选:', s.get('filename'), '|', s.get('duration'), 's | url', '有' if info.get('url') else '无')
