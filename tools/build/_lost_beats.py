# -*- coding: utf-8 -*-
import os, sys, statistics
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT,'tools'))
import preview_song as PS
def objs(rows):
    return [r if isinstance(r, dict) else dict(t=r[0],m=r[1],d=r[2],v=r[3]) for r in rows]
src = PS.load_song(os.path.join(ROOT,'src','engine','songs','touhou.js'), 'BOSS_SONGS', 'stage1')
gen = PS.load_song(os.path.join(ROOT,'src','engine','songs','phoenix_stage1.js'), 'PHOENIX_A', 'stage1a')
for tag, s in (('原始 stage1', src), ('生成 stage1a', gen)):
    lead = objs(s['tracks'][0]['notes']); bar=4*60.0/s['bpm']
    ds=[n['d'] for n in lead]
    print('%s: 音符 %d  d 中位 %.3f 最短 %.3f 最长 %.3f' % (tag, len(lead), statistics.median(ds), min(ds), max(ds)))
    # 静默间隙
    ons=sorted(n['t'] for n in lead)
    gaps=[(round(ons[i],2), round(ons[i+1]-ons[i],2)) for i in range(len(ons)-1) if ons[i+1]-ons[i] > bar*0.9]
    print('   超过 0.9 小节无新音：%d 处，前 8:' % len(gaps), gaps[:8])
# 音符丢失检查：源音高序列 vs 生成
sl = objs(src['tracks'][0]['notes']); gl = objs(gen['tracks'][0]['notes'])
print('源 %d / 生成 %d  ; 音高集合差: %s' % (len(sl), len(gl), sorted(set(round(x['t'],2) for x in sl) - set(round(x['t']*1.0,2) for x in gl))[:10]))
