
import urllib.request, zipfile, io, os, sys, time
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
DEST = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi'
os.makedirs(DEST, exist_ok=True)
url = 'https://github.com/AyHa1810/touhou-midi-collection/archive/refs/heads/main.zip'
t=time.time()
req = urllib.request.Request(url, headers={'User-Agent':'probe'})
data = urllib.request.urlopen(req, timeout=180).read()
print('downloaded bytes', len(data), 'in', round(time.time()-t,1), 's')
z = zipfile.ZipFile(io.BytesIO(data))
names = z.namelist()
print('entries', len(names))
print('sample roots:', sorted({n.split('/')[0] for n in names})[:5])
z.extractall(DEST)
print('extracted to', DEST)
