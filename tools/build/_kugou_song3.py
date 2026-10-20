# -*- coding: utf-8 -*-
import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'}
def raw(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()
def j(url):
    b = raw(url)
    for enc in ('utf-8','gbk','gb18030'):
        try:
            return json.loads(b.decode(enc))
        except Exception:
            continue
    return json.loads(b.decode('gb18030','replace'))
H='4A537AD76C9D46B2AA81914DA316C721'
info=j('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash='+H)
print('song:', info.get('songName'), '| singer:', info.get('singername'), '| len:', info.get('timeLength'), '| url:', (info.get('url') or '')[:120])
alb=j('http://mobilecdn.kugou.com/api/v3/album/info?albumid=717039').get('data') or {}
print('album:', alb.get('albumname'), '| 发行:', alb.get('publish_time'), '| 公司:', alb.get('company'))
songs=j('http://mobilecdn.kugou.com/api/v3/album/song?albumid=717039&page=1&pagesize=30&version=9108')
for s in ((songs.get('data') or {}).get('info') or []):
    print('  track:', s.get('filename'), '|', s.get('duration'), 's |', s.get('hash'))
