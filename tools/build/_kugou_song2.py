# -*- coding: utf-8 -*-
import urllib.request, json
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}
def getj(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8','replace'))
H = '4A537AD76C9D46B2AA81914DA316C721'
info = getj('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + H)
for k in ('songName','singername','album_name','album_id','timeLength','url','fileName','extName'):
    print(k, ':', str(info.get(k))[:160])
alb = getj('http://mobilecdn.kugou.com/api/v3/album/info?albumid=717039')
d = alb.get('data') or {}
print('album:', d.get('albumname'), '| 发行:', d.get('publish_time'), '| 公司:', d.get('company'))
songs = getj('http://mobilecdn.kugou.com/api/v3/album/song?albumid=717039&page=1&pagesize=30&version=9108')
for s in (songs.get('data') or {}).get('info', [])[:20]:
    print('  track:', s.get('filename'), '|', s.get('duration'), 's')
