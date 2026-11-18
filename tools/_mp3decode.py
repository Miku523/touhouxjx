# -*- coding: utf-8 -*-
import json, io
import soundfile as sf, numpy as np
out={}
p='src/assets/bgm/yukari_ph.mp3'
try:
    info=sf.info(p)
    out['info']={'sr':info.samplerate,'ch':info.channels,'frames':info.frames,'dur':round(info.frames/info.samplerate,3),'fmt':info.format,'sub':info.subtype}
    d,sr=sf.read(p, dtype='float32')
    out['decoded']={'dur':round(len(d)/sr,3),'peak':round(float(np.abs(d).max()),4),'rms_db':round(float(20*np.log10(np.sqrt((np.mean(d**2))+1e-12))),2),'first100_abs_mean':round(float(np.abs(d[:100]).mean()),5)}
    # gap scan: any 0.5s window with rms < -60 dB
    win=sr//2; bad=[]
    for i in range(0,len(d)-win,win):
        r=np.sqrt(np.mean(d[i:i+win]**2))
        if r<1e-3: bad.append(int(i/sr))
    out['silentHalves']=bad[:20]; out['silentHalfCount']=len(bad)
except Exception as e:
    out['err']=repr(e)
io.open('tools/build/_yuk_kit/_mp3decode.json','w',encoding='utf-8').write(json.dumps(out,indent=1))
