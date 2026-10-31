# -*- coding: utf-8 -*-
import urllib.request, re, time
BASE = 'https://mikuascendlog.com/touhouxjx/'
def get(u):
    req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read(), dict(r.headers)
for attempt in range(6):
    st, body, hd = get(BASE + 'index.html')
    txt = body.decode('utf-8', 'replace')
    m = re.search(r'ver ([0-9.]+)', txt)
    print('index', st, m.group(1) if m else '?')
    if m and m.group(1) == '1.6.57':
        break
    time.sleep(20)
st, body, hd = get(BASE + 'sw.js')
print('sw', st, re.search(r"hks-v([0-9.]+)", body.decode('utf-8','replace')).group(0))
st, body, hd = get(BASE + 'src/engine/songs/index.js')
s = body.decode('utf-8','replace')
print('index.js', st, 'youma audio' , "youma_stage1.mp3?v=1.6.57" in s)
st, body, hd = get(BASE + 'src/assets/bgm/youma_stage1.mp3')
print('mp3', st, len(body), hd.get('Content-Type'))
st, body, hd = get(BASE + 'src/engine/songs/youma_stage1.js')
print('js', st, len(body), 'duration', re.search(r'duration: ([0-9.]+)', body.decode('utf-8','replace')).group(1))
