# -*- coding: utf-8 -*-
"""解析第 7 批酷狗分享链（U.N.オーエン EX 曲重编参考，6 首）→ _ref7_meta.json，并下载可得的 mp3。"""
import json
import os
import sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_ref7')
os.makedirs(OUT, exist_ok=True)


def raw(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()


def grab(txt, key):
    i = txt.find(key)
    if i < 0:
        return None
    j = txt.find('{', i)
    depth = 0
    for k in range(j, len(txt)):
        if txt[k] == '{':
            depth += 1
        elif txt[k] == '}':
            depth -= 1
            if depth == 0:
                blob = txt[j:k + 1]
                try:
                    return json.loads(blob)
                except Exception:
                    return None
    return None


links = {
    '1Yr4FfbG6V3': 'ref1',
    '1Yrc549G6V3': 'ref2',
    '1YrKj67G6V3': 'ref3',
    '1YroN35G6V3': 'ref4',
    '1Yrvz8dG6V3': 'ref5',
    '1YryPceG6V3': 'ref6',
}
meta = {}
for chain, tag in links.items():
    url = 'https://m.kugou.com/share/song.html?chain=%s' % chain
    try:
        html = raw(url).decode('utf-8', 'replace')
    except Exception as e:
        print(tag, 'page fail', e)
        continue
    info = grab(html, '"song_info"') or {}
    if isinstance(info.get('data'), dict):
        info = info['data']
    elif isinstance(info.get('song_info'), dict):
        info = info['song_info'].get('data', info)
    name = info.get('songName') or info.get('songname') or ''
    au = info.get('authors') or []
    author = (au[0].get('author_name') or au[0].get('singerName') or '') if au else (info.get('authorName') or info.get('singername') or '')
    h = info.get('hash') or ''
    title = html.split('<title>')[-1].split('</title>')[0] if '<title>' in html else ''
    print('%s %s - %s  hash=%s' % (tag, author, name, h[:12]))
    rec = {'tag': tag, 'chain': chain, 'song': name, 'author': author, 'hash': h, 'title': title}
    if h:
        try:
            api = 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=%s' % h
            j = json.loads(raw(api).decode('utf-8', 'replace'))
            rec['songName'] = j.get('songName')
            rec['timeLength'] = j.get('timeLength')
            rec['url'] = j.get('url', '')
            rec['error'] = j.get('error', '')
            if rec['url']:
                fn = os.path.join(OUT, '%s.mp3' % tag)
                data = raw(rec['url'])
                open(fn, 'wb').write(data)
                rec['file'] = fn
                rec['bytes'] = len(data)
                print('     下载 %s  %.1f MB  %s  %ss' % (os.path.basename(fn), len(data) / 1e6, rec['songName'], rec.get('timeLength')))
            else:
                print('     无播放地址：', rec.get('error'))
        except Exception as e:
            print('     api fail', e)
    meta[tag] = rec
json.dump(meta, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '_ref7_meta.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('写入 _ref7_meta.json')
