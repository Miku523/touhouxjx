# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, json, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def get(url, headers=None, timeout=15):
    req = urllib.request.Request(url, headers=headers or {'User-Agent':'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=timeout).read()
q = 'ほおずきみたいに紅い魂'
url = 'http://search.kuwo.cn/r.s?client=kt&all=%s&ft=music&itemset=web_2013&client=kt&pn=0&rn=5&rformat=json&encoding=utf8' % urllib.parse.quote(q)
try:
    raw = get(url)
    txt = raw.decode('utf-8', 'replace')
    print(txt[:600])
except Exception as e:
    print('search failed', e)
