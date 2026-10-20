# -*- coding: utf-8 -*-
import urllib.request, json, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'}
HASH = '18A7B518251FAF944B58A8CC3D4B405D'
def raw(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()
def jsonish(b):
    for enc in ('utf-8','gbk','gb18030'):
        try: return json.loads(b.decode(enc))
        except Exception: continue
    raise SystemExit('解析失败')
info = jsonish(raw('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + HASH))
print('曲名:', info.get('songName'))
print('歌手:', info.get('singerName') or info.get('author_name'))
print('专辑:', info.get('album_name'), '| album_id', info.get('album_id'))
print('时长:', info.get('timeLength'), 's')
print('url:', info.get('url','')[:120])
out = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ref4.mp3'
data = raw(info['url'])
open(out,'wb').write(data)
print('下载', len(data), 'bytes ->', out)
