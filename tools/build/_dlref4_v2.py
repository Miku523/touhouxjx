# -*- coding: utf-8 -*-
import urllib.request, json, sys, os, urllib.parse
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
UA = {'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'}
def raw(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
def playinfo(h):
    b = raw('https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + h)
    for enc in ('utf-8','gbk','gb18030'):
        try: return json.loads(b.decode(enc))
        except Exception: pass
    return {}
def search(keyword):
    q = urllib.parse.quote(keyword)
    b = raw('https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=%s&page=1&pagesize=8&showtype=1' % q)
    try: return json.loads(b.decode('utf-8','replace'))
    except Exception: return {}
meta = json.load(open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_ref4_meta.json', encoding='utf-8'))
outdir = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site'
os.makedirs(outdir, exist_ok=True)
for chain, m in meta.items():
    h = m['hash']
    info = playinfo(h)
    url = info.get('url')
    print('===', chain, m['author_name'], '| 时长', m['timeLength'], '| playInfo', info.get('error') or 'ok')
    if not url:
        kw = 'フォールオブフォール' if '1Y0UP' in chain else ('ささぶね' if '1Y199' in chain else 'Bad Apple nomico')
        s = search(kw)
        cands = (s.get('data') or {}).get('info') or []
        print('   搜索候选:', [(c.get('songname'), c.get('singername'), c.get('hash'), c.get('duration')) for c in cands[:5]])
        continue
    data = raw(url)
    path = os.path.join(outdir, {'1Y0UPdaG6V3':'ref4a.mp3','1Y1993eG6V3':'ref4b.mp3','1Y1bd18G6V3':'ref4c.mp3'}[chain])
    open(path,'wb').write(data)
    print('   下载 %d bytes -> %s' % (len(data), path))
