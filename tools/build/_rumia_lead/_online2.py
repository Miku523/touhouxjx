import urllib.request, re
u='https://mikuascendlog.com/touhouxjx/src/engine/songs/youma_stage1.js'
req=urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
b=urllib.request.urlopen(req, timeout=30).read().decode('utf-8','replace')
print(len(b), 'YOUMA_STAGE1' in b, re.findall(r'duration: [0-9.]+', b)[:2], re.findall(r'title: [^,]+', b)[:1])
