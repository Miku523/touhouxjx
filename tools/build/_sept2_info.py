# -*- coding: utf-8 -*-
import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/612.1.15'}
for tag, h in [('mel','3FD12027F4F831BA07F0E49EC63A2147'), ('bp','AE331B3C2745912949F6D6EBE5C22AED')]:
    url = 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h
    try:
        d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode('utf-8','replace'))
    except Exception as e:
        print(tag, 'fail', e); continue
    keys = ('songName','songname','fileName','author_name','album_name','timeLength','url','extName')
    print(tag, {k: d.get(k) for k in keys if k in d})
    print('  url_len', len(d.get('url') or ''))
