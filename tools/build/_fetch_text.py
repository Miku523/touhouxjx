# -*- coding: utf-8 -*-
import re, sys, urllib.request, gzip

def get(u):
    req = urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
        if r.headers.get('Content-Encoding') == 'gzip':
            data = gzip.decompress(data)
    for enc in ('euc-jp', 'cp932', 'utf-8'):
        try:
            return data.decode(enc)
        except Exception:
            continue
    return data.decode('utf-8', 'replace')

def strip(html):
    html = re.sub(r'<script.*?</script>', ' ', html, flags=re.S|re.I)
    html = re.sub(r'<style.*?</style>', ' ', html, flags=re.S|re.I)
    txt = re.sub(r'<[^>]+>', '\n', html)
    txt = txt.replace('&nbsp;', ' ')
    lines = [l.strip() for l in txt.split('\n')]
    return ' / '.join([l for l in lines if l])

for u in sys.argv[1:]:
    print('====', u)
    try:
        print(strip(get(u))[:5000])
    except Exception as e:
        print('ERR', e)
