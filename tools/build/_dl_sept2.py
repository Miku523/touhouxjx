# -*- coding: utf-8 -*-
import urllib.request, json, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/612.1.15'}
DEST = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\ex'
os.makedirs(DEST, exist_ok=True)
tasks = [('mel','3FD12027F4F831BA07F0E49EC63A2147','sept_mel.mp3'), ('bp','AE331B3C2745912949F6D6EBE5C22AED','sept_bp.mp3')]
for tag, h, name in tasks:
    p = os.path.join(DEST, name)
    if os.path.exists(p) and os.path.getsize(p) > 500000:
        print(tag, 'exists', os.path.getsize(p)); continue
    d = json.loads(urllib.request.urlopen(urllib.request.Request('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h, headers=UA), timeout=60).read().decode('utf-8','replace'))
    u = d.get('url')
    if not u:
        print(tag, 'no url'); continue
    data = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=180).read()
    open(p, 'wb').write(data)
    print(tag, name, len(data))
