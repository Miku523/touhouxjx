
import json, subprocess, numpy as np
expr=("import('file:///C:/Users/GuSheng/Downloads/HKS/src/engine/songs/preboss.js').then(m=>process.stdout.write(JSON.stringify(m.PREBOSS_SONGS.pre1)));")
out=subprocess.run(['node','--input-type=module','-e',expr],capture_output=True)
s=json.loads(out.stdout)
bpm=s['bpm']; beat=60.0/bpm; bar=4*beat
bass=[t for tr in s['tracks'] if tr['wave']=='triangle' for (t,m,d,v) in tr['notes']]
kick=[t for (t,k,v) in s['drums'] if k==0]
def frac(x,p): return (x/p)%1.0
def score(ts, phi, p=beat, w=0.06):
    f=np.array([frac(t-phi,p) for t in ts]); return float(np.exp(-(np.minimum(f,1-f)/w)**2).sum())
best=max(((score(kick+bass,phi),phi) for phi in np.arange(0,beat,0.002)))
print('beat phase phi=%.3f score=%.1f' % (best[1],best[0]))
phi=best[1]
for k in range(4):
    t0=(phi+k*beat)%bar
    print('  downbeat cand %.3f modbar  score %.1f' % (t0, score(bass,t0,bar,0.12)))
print('bass onsets:', ' '.join('%.2f'%t for t in bass[:14]))
print('kick onsets:', ' '.join('%.2f'%t for t in kick[:14]))
print('track waves/gains:', [(tr['wave'],tr['gain'],len(tr['notes'])) for tr in s['tracks']])
