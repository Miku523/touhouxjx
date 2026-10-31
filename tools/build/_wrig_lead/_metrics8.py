# -*- coding: utf-8 -*-
import os, json, hashlib, numpy as np, soundfile as sf
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
HERE = os.path.join(ROOT, 'tools', 'build', '_wrig_lead')
SRC = os.path.join(ROOT, 'src', 'engine', 'songs', 'wriggle_stage2.js')
WAV = os.path.join(ROOT, 'tools', 'build', '_wrig_kit', 'wriggle_stage2_stereo.wav')
MP3 = os.path.join(ROOT, 'src', 'assets', 'bgm', 'wriggle_stage2.mp3')
MONO = os.path.join(ROOT, 'tools', 'build', '_wrig_kit', 'wriggle_v8_mono.wav')
def sha(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''): h.update(b)
    return h.hexdigest()
x, sr = sf.read(WAV, dtype='float64')
print('channels', x.shape, 'sr', sr)
y = x.mean(axis=1)
rms = np.sqrt(np.mean(x*x))
print('total rms dB', round(20*np.log10(rms),3), 'per ch', round(20*np.log10(np.sqrt(np.mean(y*y))),3))
print('peak', round(float(np.abs(x).max()),5))
corr = np.corrcoef(x[:,0], x[:,1])[0,1]
print('corr', round(float(corr),4), 'width side/mid', round(float(np.sqrt(np.mean((x[:,0]-x[:,1])**2)/2)/np.sqrt(np.mean(y*y))),4))
secs = json.load(open(os.path.join(HERE,'secs.json'), encoding='utf-8'))
out={}
for nm,a,b in secs['secs']:
    s,e=int(a*sr),min(int(b*sr),len(x))
    seg=x[s:e]; v=np.sqrt(np.mean(seg*seg))
    out[nm]=round(20*np.log10(v),2)
print('sec rms total', out)
print('sec single-ch', {k: round(v-3.01,2) for k,v in out.items()})
print('sizes wav', os.path.getsize(WAV), 'mp3', os.path.getsize(MP3))
print('sha wav', sha(WAV), 'sha mp3', sha(MP3))
import re
js = open(SRC, encoding='utf-8').read()
m = re.search(r'"duration":([0-9.]+)', js)
print('js duration', m.group(1), 'bytes', os.path.getsize(SRC))
d = json.load(open(os.path.join(HERE,'song.json'), encoding='utf-8'))
print('notes', sum(len(t['notes']) for t in d['tracks']), 'drums', len(d['drums']), 'tracks', len(d['tracks']))
json.dump({'secs':out,'wav_size':os.path.getsize(WAV),'mp3_size':os.path.getsize(MP3),'sha_wav':sha(WAV),'sha_mp3':sha(MP3)}, open(os.path.join(HERE,'v8_metrics.json'),'w',encoding='utf-8'), ensure_ascii=False)