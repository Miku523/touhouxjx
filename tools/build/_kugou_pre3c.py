# -*- coding: utf-8 -*-
import urllib.request, hashlib, json, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}
def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r: return r.read()
hashes = {'bp1':'568FA2B8166555C3E49C590E636C1B42','bp2':'EA45C1014FCCDA4095876E2630ADDA13','orig':'DDC6C2E826932107520F7704E74DB009'}
for tag,h in hashes.items():
    key = hashlib.md5((h + 'kgcloudv2').encode()).hexdigest()
    url = 'http://trackercdn.kugou.com/i/v2/?key=%s&hash=%s&br=hq&appid=1005&pid=2&cmd=25&behavior=play' % (key, h)
    try:
        d = json.loads(get(url).decode('gbk','replace'))
        print(tag, h[:8], '| status', d.get('status'), '| url', (d.get('url') or [''])[0][:100] if isinstance(d.get('url'), list) else str(d.get('url'))[:100], '| err', d.get('error'))
    except Exception as e:
        print(tag, 'fail', e)
# 搜索结果：确认专辑
q = '夜桜に君を隠して'
api = 'http://mobilecdn.kugou.com/api/v3/search/song?keyword=%s&page=1&pagesize=10&format=json' % urllib.parse.quote(q)
try:
    d = json.loads(get(api).decode('utf-8','replace'))
    for s in ((d.get('data') or {}).get('info') or []):
        print('搜索:', s.get('filename'), '|', s.get('duration'), 's | album_id', s.get('album_id'), '| hash', s.get('hash'))
except Exception as e:
    print('搜索失败', e)
