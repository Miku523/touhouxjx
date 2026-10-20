
import wave, numpy as np, json, subprocess, os
p='tools/build/pre1_preview.wav'
with wave.open(p,'rb') as w:
    n=w.getnframes(); sr=w.getframerate(); x=np.frombuffer(w.readframes(n),dtype='<i2').astype(np.float32)/32768.0
print('dur %.2fs sr %d peak %.3f rms %.4f' % (len(x)/sr, sr, np.max(np.abs(x)), np.sqrt(np.mean(x**2))))
sec=[float(np.sqrt(np.mean(x[i*sr:(i+1)*sr]**2))) for i in range(int(len(x)/sr))]
print('per-sec rms:', ' '.join('%.2f'%v for v in sec[:12]), '...')
print('min/max sec rms %.3f %.3f' % (min(sec), max(sec)))

# 载入曲子事件，检查循环接缝与小节对齐
expr=("import('file:///C:/Users/GuSheng/Downloads/HKS/src/engine/songs/preboss.js').then(m=>process.stdout.write(JSON.stringify(m.PREBOSS_SONGS.pre1)));")
out=subprocess.run(['node','--input-type=module','-e',expr],capture_output=True)
s=json.loads(out.stdout)
dur=s['duration']; bpm=s['bpm']; bar=4*60.0/bpm; beat=60.0/bpm
print('dur %.3f bpm %s bar %.4fs = %.3f bars' % (dur,bpm,bar,dur/bar))
kicks=[t for (t,k,v) in s['drums'] if k==0]
ph=np.array(kicks)%bar
h,edges=np.histogram(ph,bins=32,range=(0,bar))
print('kick phase hist:', ' '.join('%d'%v for v in h))
print('dominant phase %.3f s' % ((edges[h.argmax()]+edges[h.argmax()+1])/2))
# 接缝：尾部 60ms vs 头部 60ms 的能量与不连续
a=int((dur-0.06)*sr); b=int(dur*sr)
tail=x[a:b]; head=x[:int(0.06*sr)]
print('tail rms %.4f head rms %.4f jump %.4f' % (np.sqrt(np.mean(tail**2)), np.sqrt(np.mean(head**2)), abs(x[b-1]-x[int(dur*sr)])))
