# -*- coding: utf-8 -*-
import os, sys
p = os.path.join(os.environ['TEMP'], 'ghostly_eyes_ref.mp3')
data = open(p,'rb').read(200000)
print('size', os.path.getsize(p))
print('head', data[:10])
def syncsafe(b): return (b[0]<<21)|(b[1]<<14)|(b[2]<<7)|b[3]
if data[:3] == b'ID3':
    ver = data[3:5]; flags = data[5]; size = syncsafe(data[6:10])
    print('ID3v2.%d.%d flags=%d size=%d' % (ver[0], ver[1], flags, size))
    body = data[10:10+size]
    pos = 0
    while pos + 10 <= len(body):
        fid = body[pos:pos+4]
        if not fid.strip(): break
        raw = body[pos+4:pos+8]
        sz = syncsafe(raw)
        if sz <= 0 or pos+10+sz > len(body): break
        content = body[pos+10:pos+10+sz]
        try:
            txt = content.replace(b'\x00',b'').decode('utf-8', 'replace')
        except Exception:
            txt = repr(content[:80])
        if fid.startswith(b'T') or fid in (b'COMM', b'TXXX', b'WXXX', b'PRIV', b'APIC'):
            print(fid.decode('latin1'), sz, txt[:200])
        pos += 10 + sz
else:
    print('no ID3v2', data[:64])
