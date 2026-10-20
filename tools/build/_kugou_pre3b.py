# -*- coding: utf-8 -*-
import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'}
def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r: return r.read()
def j(url):
    b = get(url)
    for enc in ('utf-8','gbk','gb18030'):
        try: return json.loads(b.decode(enc))
        except Exception: pass
    return json.loads(b.decode('gb18030','replace'))
for h in ['568FA2B8166555C3E49C590E636C1B42','EA45C1014FCCDA4095876E2630ADDA13','DDC6C2E826932107520F7704E74DB009']:
    d = j('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h)
    keep = {k: d.get(k) for k in ('songName','singername','album_id','albumname','timeLength','duration','url','hash','fileName','extName','err','error','status')}
    print(json.dumps(keep, ensure_ascii=False)[:600])
