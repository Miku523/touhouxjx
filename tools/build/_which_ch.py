# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import preview_song as PS, midi2js as M
ROOT = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil'
midi = M.parse_midi(ROOT + r'\5. Tomboyish Girl in Love (ZUN).mid')
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); bar=4*60/bpm
s = PS.load_song(r'C:\Users\GuSheng\Downloads\HKS\src\engine\songs\touhou.js','BOSS_SONGS','stage3')
def n_(n): return n if isinstance(n,dict) else dict(t=n[0],m=n[1],d=n[2],v=n[3])
t2=[n_(n) for n in s['tracks'][2]['notes']]
# 游戏轨2 取每时刻最高音
groups={}
for n in t2: groups.setdefault(round(n['t'],2),[]).append(n)
top=[max(g,key=lambda x:x['m']) for g in groups.values()]
top.sort(key=lambda n:n['t'])
def rhy(ns, bpm, n=40):
    beat=60/bpm
    return [round((x['t'])/beat,1) for x in ns[:n]]
print('游戏轨2 顶声部 前 24 拍位:', rhy(top, 148, 24))
best=[]
for ch,info in chans.items():
    if not info['notes']: continue
    ns=sorted(info['notes'],key=lambda x:x['t'])
    if len(ns)<20: continue
    # 音级序列重合
    a=[x['m']%12 for x in top[:60]]
    b=[x['m']%12 for x in ns[:60]]
    hit=sum(1 for x,y in zip(a,b) if x==y)
    best.append((hit, ch, len(ns), min(x['m'] for x in ns), max(x['m'] for x in ns)))
best.sort(reverse=True)
print('前 6 个音级命中:', best[:6])
