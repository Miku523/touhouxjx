# -*- coding: utf-8 -*-
import urllib.request, zipfile, io, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
url = 'https://codeload.github.com/AyHa1810/touhou-midi-collection/zip/refs/heads/main'
req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=300) as r:
    blob = r.read()
print('zip', len(blob))
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi'
os.makedirs(base, exist_ok=True)
z = zipfile.ZipFile(io.BytesIO(blob))
z.extractall(base)
print('解压完成 ->', base)
root = os.path.join(base, 'touhou-midi-collection-main', '1 - Shooter Games')
print('作品目录:', sorted(os.listdir(root))[:25])
eosd = [d for d in os.listdir(root) if 'Scarlet Devil' in d][0]
files = sorted(os.listdir(os.path.join(root, eosd)))
print('TH06 曲目:')
for f in files:
    print('   ', f)
