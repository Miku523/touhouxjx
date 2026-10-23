# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, json, re, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def get(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=timeout).read()
q = 'ほおずきみたいに紅い魂'
url = 'http://search.kuwo.cn/r.s?client=kt&all=%s&ft=music&itemset=web_2013&pn=0&rn=10&rformat=json&encoding=utf8' % urllib.parse.quote(q)
txt = get(url).decode('utf-8','replace')
for m in re.finditer(r"'NAME':'([^']*)'", txt):
    pass
items = re.findall(r"\{[^{}]*'DC_TARGETID':'?(\d+)'?[^{}]*\}", txt)
# 简单拆：按 NAME 与 DC_TARGETID 配对
names = re.findall(r"'NAME':'([^']*)'", txt)
rids = re.findall(r"'DC_TARGETID':'?(\d+)'?", txt)
albs = re.findall(r"'ALBUM':'([^']*)'", txt)
arts = re.findall(r"'ARTIST':'([^']*)'", txt)
durs = re.findall(r"'DURATION':'?(\d+)'?", txt)
n = min(len(names), len(rids), len(durs))
for i in range(n):
    print(i, rids[i], durs[i]+'s', arts[i] if i < len(arts) else '?', '|', albs[i] if i < len(albs) else '?', '|', names[i])
