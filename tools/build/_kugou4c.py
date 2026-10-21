# -*- coding: utf-8 -*-
import urllib.request, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'}
for chain in ('1Y0UPdaG6V3','1Y1993eG6V3','1Y1bd18G6V3'):
    txt = urllib.request.urlopen(urllib.request.Request('https://m.kugou.com/share/song.html?chain='+chain, headers=UA), timeout=60).read().decode('utf-8','replace')
    print('===', chain, re.search(r'<title>(.*?)</title>', txt).group(1))
    for key in ('audio_id','album_id','songname','singername','author_name','song_name','"hash"','duration'):
        idxs = [m.start() for m in re.finditer(re.escape(key), txt)][:2]
        for i in idxs:
            seg = txt[i-80:i+160].replace('\n',' ')
            print('  [%s] %s' % (key, seg[:230]))
    print()
