# -*- coding: utf-8 -*-
"""第 6 批参考曲（竹取飛翔 5 首）：取歌名 + 下载 mp3 到临时目录"""
import json
import os
import sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'}


def raw(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()


def jload(b):
    for enc in ('utf-8', 'gbk', 'gb18030'):
        try:
            return json.loads(b.decode(enc))
        except Exception:
            pass
    return {}


META = r'C:\Users\GuSheng\Downloads\HKS\tools\build\_ref6_meta.json'
meta = json.load(open(META, encoding='utf-8'))
outdir = r'C:\Users\GuSheng\AppData\Local\Temp\kaguya_ref'
os.makedirs(outdir, exist_ok=True)
for chain, m in meta.items():
    tag = m['tag']
    h = m['hash']
    info = jload(raw('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h))
    title = info.get('songName') or info.get('songname')
    album = info.get('album_name') or info.get('albumName')
    print('===', tag, '|', title, '|', info.get('author_name') or m.get('author_name'), '|', album,
          '| 时长', info.get('timeLength') or m.get('timeLength'), '| err', info.get('error'))
    m['title'] = title
    m['album'] = album
    url = info.get('url')
    if not url:
        print('   无播放地址（可能需要付费/版权限制）')
        continue
    path = os.path.join(outdir, tag + '.mp3')
    open(path, 'wb').write(raw(url))
    print('   下载 ->', path, os.path.getsize(path), 'bytes')
json.dump(meta, open(META, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
