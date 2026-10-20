# -*- coding: utf-8 -*-
import os, sys, statistics
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT,'tools'))
import preview_song as PS
def objs(rows):
    return [r if isinstance(r, dict) else dict(t=r[0],m=r[1],d=r[2],v=r[3]) for r in rows]
for path, exp, key in (('phoenix_stage1.js','PHOENIX_A','stage1a'), ('eurobeat_stage2.js','EUROBEAT_SONGS','stage2')):
    s = PS.load_song(os.path.join(ROOT,'src','engine','songs',path), exp, key)
    lead = objs(s['tracks'][0]['notes']); bpm=s['bpm']; bar=4*60.0/bpm; beat=bar/4
    dev16=[]
    for n in lead:
        g = round(n['t']/(beat/4.0))*(beat/4.0)
        dev16.append(n['t']-g)
    dev16s=sorted(dev16)
    print('%s  bpm=%s  音符=%d  相对 16 分网格偏移: 中位 %+.4fs  平均绝对值 %.4fs  最大 %.4fs'
          % (key,bpm,len(lead),statistics.median(dev16), sum(abs(x) for x in dev16)/len(dev16), max(abs(x) for x in dev16)))
    # 每小节第一个音的相对时间
    nb=int(round(s['duration']/bar))
    firsts=[]
    for b in range(nb):
        ns=[n for n in lead if b*bar-1e-6 <= n['t'] < (b+1)*bar]
        if ns: firsts.append((b, round(min(x['t'] for x in ns)-b*bar,3)))
    print('  每小节首音相对小节头的偏移:', firsts[:20])
    # 长音（>=1 拍）位置
    longs=[(round(n['t'],2), round(n['d'],2), n['m']) for n in lead if n['d']>=beat*0.9]
    print('  长音（>=1拍）数量 %d，前 10:' % len(longs), longs[:10])
