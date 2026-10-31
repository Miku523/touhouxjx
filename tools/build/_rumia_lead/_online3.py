import urllib.request
for u,label in [('https://mikuascendlog.com/touhouxjx/src/engine/songs/youma_stage1.js','online')]:
    req=urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
    b=urllib.request.urlopen(req, timeout=30).read()
    print(label, len(b))
    print(b[:400].decode('utf-8','replace'))
local=open('src/engine/songs/youma_stage1.js','rb').read()
print('local', len(local))
print(local[:400].decode('utf-8','replace'))
