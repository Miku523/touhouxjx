# -*- coding: utf-8 -*-
import urllib.request, re, json, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}
def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()
def j(url):
    b = get(url)
    for enc in ('utf-8','gbk','gb18030'):
        try: return json.loads(b.decode(enc))
        except Exception: pass
    return json.loads(b.decode('gb18030','replace'))
chains = ['1W1nNadG6V3', '1W1qLa7G6V3', '1W1trf0G6V3']
for chain in chains:
    raw = get('https://m.kugou.com/share/song.html?chain=' + chain)
    html = raw.decode('utf-8','replace')
    hashes = []
    for m in re.finditer(r'"hash"\s*:\s*"([0-9A-Fa-f]{32})"', html):
        if m.group(1).upper() not in hashes: hashes.append(m.group(1).upper())
    if not hashes:
        hashes = list(dict.fromkeys(re.findall(r'\b[0-9A-F]{32}\b', html)))
    title = re.search(r'<title>(.*?)</title>', html, re.S)
    print('='*24, chain, '| html', len(raw), '| title:', (title.group(1).strip() if title else '')[:80])
    for h in hashes[:3]:
        try:
            info = j('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h)
            print('  hash', h, '|', info.get('songName'), '|', info.get('singername'),
                  '| album_id', info.get('album_id'), '|', info.get('timeLength'), 's')
        except Exception as e:
            print('  hash', h, 'fail', e)
