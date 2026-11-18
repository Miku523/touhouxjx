
import numpy as np, soundfile as sf, json
def analyze(path,name):
    x,sr=sf.read(path, frames=-1, always_2d=True)
    x=np.asarray(x,dtype=float); n=len(x); xm=x.mean(axis=1)
    hop=2048; N=4096; w=np.hanning(N)
    starts=np.arange(0,n-N,hop)
    bands=[(20,63),(63,125),(125,250),(250,500),(500,1000),(1000,2000),(2000,4000),(4000,8000),(8000,16000)]
    bE=np.zeros((len(starts),len(bands))); rms=np.zeros(len(starts))
    for i,s in enumerate(starts):
        seg=xm[s:s+N]; S=np.abs(np.fft.rfft(seg*w))**2
        f=np.fft.rfftfreq(N,1/sr); tot=S.sum()+1e-20
        for j,(lo,hi) in enumerate(bands):
            bE[i,j]=S[(f>=lo)&(f<hi)].sum()/tot
        rms[i]=np.sqrt((seg**2).mean()+1e-20)
    rdb=10*np.log10(rms**2); r=rdb-rdb.mean()
    med=np.median(bE,axis=0)
    blk=int(10*sr); prof=[]
    for s in range(0,n,blk):
        seg=x[s:s+blk]; prof.append(round(10*np.log10((seg**2).mean()+1e-20),1))
    L=x[:,0]; R=x[:,1]; corr=float(np.corrcoef(L,R)[0,1])
    side=L-R; mid=(L+R)/2
    width=10*np.log10((side**2).sum()/((mid**2).sum()/2+1e-20)+1e-20)
    # 高频存在感: 2k-16k 总占比(相对全频)
    hi=float(bE[:,5:].sum(axis=1).mean()); loE=float(bE[:,:2].sum(axis=1).mean())
    out={"name":name,"dur":round(n/sr,3),"rms_db":round(float(10*np.log10((x**2).mean())),2),
         "peak":round(float(np.max(np.abs(x))),4),
         "dyn_range_db":round(float(rdb.max()-rdb.min()),2),"stdev_db":round(float(rdb.std()),2),
         "bands_db":[round(float(10*np.log10(v+1e-20)),2) for v in med],
         "hi_2k_16k_pct":round(hi*100,2),"lo_20_125_pct":round(loE*100,2),
         "blocks":prof,"corr":round(corr,3),"width_db":round(width,2)}
    return out
res=[analyze('src/assets/bgm/youmu_pre5.mp3','youmu_pre5'),
     analyze('src/assets/bgm/yuyuko_stage5.mp3','yuyuko_stage5')]
open('tools/build/_critique.json','w',encoding='utf-8').write(json.dumps(res,ensure_ascii=False,indent=1))
print('ok')
