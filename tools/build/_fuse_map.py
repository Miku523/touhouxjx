# -*- coding: utf-8 -*-
import json,sys
import numpy as np
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
old=json.load(open('tools/build/_old_extra.json',encoding='utf-8'))
mid=json.load(open('tools/build/_un_orig.json',encoding='utf-8'))
BAR=60.0/155*4; STEP=BAR/16
OFF=2.323   # game_t = midi_t - OFF
N=79
print('每小节：游戏trk0旋律音数 / 鼓数 / 各轨音数')
for b in range(N):
    t0,t1=b*BAR,(b+1)*BAR
    c0=len([n for n in old['tracks'][0]['notes'] if t0<=n[0]<t1])
    dc=len([d for d in old['drums'] if t0<=d[0]<t1])
    ca=[len([n for n in t['notes'] if t0<=n[0]<t1]) for t in old['tracks']]
    print(' bar%2d %5.1f-%5.1fs  mel%2d 鼓%2d  各轨%s'%(b,t0,t1,c0,dc,ca))
print('\nch5 主题（120音）映射到游戏时间：')
for t,m,du,v in mid['channels']['5']['notes'][:20]:
    print('  %.2fs → %.2fs m=%d dur=%.2f'%(t,t-OFF,m,du))
print('ch5 首末 %.2f-%.2fs → 游戏 %.2f-%.2fs'%(mid['channels']['5']['notes'][0][0],mid['channels']['5']['notes'][-1][0],mid['channels']['5']['notes'][0][0]-OFF,mid['channels']['5']['notes'][-1][0]-OFF))
