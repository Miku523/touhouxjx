# -*- coding: utf-8 -*-
"""取第 5 批参考曲的歌名 + 下载 mp3 到临时目录"""
import urllib.request, json, sys, os

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


meta = json.load(open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_ref5_meta.json', encoding='utf-8'))
outdir = r'C:\Users\GuSheng\AppData\Local\Temp\aya_ref'
os.makedirs(outdir, exist_ok=True)
names = {'1Y5OX33G6V3': 'refA', '1Y5SbdfG6V3': 'refB', '1Y5V95aG6V3': 'refC',
         '1Y5XJfdG6V3': 'refD', '1Y60R90G6V3': 'refE', '1Y65J42G6V3': 'refF'}
for chain, tag in names.items():
    m = meta[chain]
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
        print('   无播放地址')
        continue
    data = raw(url)
    path = os.path.join(outdir, tag + '.mp3')
    open(path, 'wb').write(data)
    print('   下载 %d bytes -> %s' % (len(data), path))
json.dump(meta, open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_ref5_meta.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
