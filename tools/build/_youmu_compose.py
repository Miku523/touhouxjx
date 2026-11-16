# -*- coding: utf-8 -*-
import sys, os, json
sys.path.insert(0, os.path.abspath('tools'))
from midi2js import parse_midi, extract_channels, DRUM_MAP

MID = 'tools/build/_midi/src/11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'
OUT_JS = 'src/engine/songs/tillwhen_pre5.js'
KIT = 'tools/build/_youmu_kit'
os.makedirs(KIT, exist_ok=True)

midi = parse_midi(MID)
chans, segs, div = extract_channels(midi)
bpm = 60.0e6/segs[0][2]
beat = 60.0/bpm
bar = beat*4
DUR = 106.84

SECTIONS = [('intro',1,4),('A',5,20),('B',21,36),('bridge',37,44),('Ap',45,53),('climax',54,69),('outro',70,70)]
def t_of(b): return (b-1)*bar
def win(b0,b1): return (t_of(b0), t_of(b1))
def pick(ch,a,b): return [n for n in chans[ch]['notes'] if a <= n['t'] < b]
def sec_of(t):
    for name,b0,b1 in SECTIONS:
        a,bb = win(b0,b1)
        if a <= t < bb: return name
    return 'outro'

LEAD_MUL = {'intro':1.05,'A':1.0,'B':0.98,'bridge':0.82,'Ap':1.05,'climax':1.12,'outro':0.85}
BASS_MUL = {'intro':0.88,'A':1.0,'B':1.0,'bridge':0.86,'Ap':1.0,'climax':1.06,'outro':0.85}

def scale(ns, mul=None):
    out=[]
    for n in ns:
        m = mul if mul is not None else LEAD_MUL[sec_of(n['t'])]
        out.append(dict(n, v=max(1,min(127,int(round(n['v']*m))))))
    return out

def shift(ns, dt=0.0, dm=0, mul=None):
    out=[]
    for n in ns:
        m = mul if mul is not None else 1.0
        out.append(dict(n, t=round(n['t']+dt,3), m=n['m']+dm, v=max(1,min(127,int(round(n['v']*m))))))
    return out

def fit(ns):
    out=[]
    for n in ns:
        d=min(max(n['d'],0.03),4.0)
        if n['t'] < DUR-0.01:
            out.append(dict(n, d=min(d, max(0.03, DUR-n['t']))))
    return out

# ---------- lead ----------
lead = fit(scale(pick(0, 0.0, DUR)))
aA, aB = win(45,53)
aC, aD = win(54,70)
counter = fit(shift(scale(pick(0,aA,aB)), dm=-12, mul=0.95) + shift(scale(pick(0,aC,aD)), dm=-12, mul=0.9))
sparkle = fit(shift(scale(pick(0,aC,aD)), dm=12, mul=0.85))

# ---------- warm layer: ch5 EP motif (A) + ch3 in bridge/A' ----------
b5,b6 = win(5,22)
b3,b4 = win(37,53)
piano = fit(scale(pick(5,b5,b6), 1.0) + scale(pick(3,b3,b4), 0.9))

# ---------- cold shimmer: ch3 early arpeggio ----------
c1,c2 = win(1,21)
shimmer = fit(scale(pick(3,c1,c2), 0.85))

# ---------- bell motif (ch4) + ostinato replay in B ----------
d1,d2 = win(13,22)
bell_src = pick(4,d1,d2)
bell = fit(scale(bell_src, 1.0))
if bell_src:
    span = max(n['t']+n['d'] for n in bell_src) - min(n['t'] for n in bell_src)
    base = min(n['t'] for n in bell_src)
    rep_t = win(22,30)[0]
    bell = bell + fit(shift([dict(n, t=n['t']-base) for n in bell_src], dt=rep_t, mul=0.8))

# ---------- stabs / pads ----------
s21 = win(21,71)
strings = fit(scale(pick(6,s21[0],s21[1]), 0.95))
brass = fit(scale(pick(7,s21[0],s21[1]), 0.9) + scale(pick(11,s21[0],s21[1]), 0.85))
choir = fit(scale(pick(8,s21[0],s21[1]), 0.9))
knife = fit(scale(pick(10,s21[0],s21[1]), 1.0))
bass = fit([dict(n, v=max(1,min(127,int(round(n['v']*BASS_MUL[sec_of(n['t'])]))))) for n in pick(2,0.0,DUR)])
bass2 = fit(scale(pick(1,s21[0],s21[1]), 0.9))

# ---------- drums ----------
drums=[]
kindcount={}
for n in pick(9, 0.0, DUR):
    k = DRUM_MAP.get(n['m'])
    if k is None: continue
    t=n['t']; s=sec_of(t); v=float(n['v'])
    if s=='intro':
        if k in (0,1): v*=0.85
        elif k==2:
            off = (t - t_of(int(t//bar)+1)) % beat
            if off > 0.06: continue
            v*=0.5
        else: continue
    elif s=='B':
        if k in (2,4): continue
        if k==0: v*=1.05
    elif s=='bridge':
        if k==0: v*=0.50
        elif k==1: v*=0.45
        else: continue
    elif s in ('A','Ap'):
        if k in (2,3): v*=1.25
        elif k==4: v*=0.90
    elif s=='climax':
        v*=1.06
    elif s=='outro':
        v*=0.80
    kindcount[k]=kindcount.get(k,0)+1
    drums.append((round(t,3), k, int(max(1,min(127,round(v))))))
# v3 拟声：桥段心跳（低音通鼓）、高潮 ride、段落前一刀（reverse crash）
BR = win(37, 45)[0]
for i in range(0, 16):
    if i % 4 == 0:
        drums.append((round(BR + i * (bar * 0.5), 3), 5, 60))
for i in range(0, 30):
    t = win(54, 70)[0] + i * (bar * 0.5)
    if t < win(69, 70)[0]:
        drums.append((round(t, 3), 7, 50))
drums.append((round(win(53, 54)[0], 3), 8, 80))
drums.append((round(win(70, 71)[0], 3), 4, 72))
drums.sort()

# ---------- v3: 妖侧对句（ch4 高音动机移接 B 段 / ch5 EP 动机移接桥段）+ 刀刃拟声 ----------
def relocate(ns, t_start, dm=0, mul=1.0):
    if not ns:
        return []
    base = min(n['t'] for n in ns)
    return fit(shift([dict(n, t=n['t']-base) for n in ns], dt=t_start, dm=dm, mul=mul))

# 妖侧对句 = 原谱自己的高音声部（ch4 高音冷线 / ch10 对位线）搬进别的段落
_ans_hot = pick(4, win(14, 22)[0], win(14, 22)[1])        # 原谱 ch4：A 段高音冷线
_ans_ctr = pick(10, win(55, 63)[0], win(63, 64)[0])       # 原谱 ch10：对位线
shadow = relocate(_ans_hot, win(23, 24)[0], dm=0, mul=0.55)          # B 段：妖侧应句
shadow = shadow + relocate(_ans_ctr, win(37, 38)[0], dm=0, mul=0.45) # 桥段：对句
shadow = shadow + relocate(pick(4, 0.0, DUR), win(66, 67)[0], dm=-12, mul=0.55)  # 尾声低八度鬼影

ticks = []
for n in pick(10, 0.0, DUR):
    if sec_of(n['t']) in ('B', 'climax'):
        ticks.append(dict(n, t=round(n['t'], 3), m=n['m'] + 12, d=0.10,
                          v=max(1, min(127, int(round(n['v'] * 0.50))))))
for n in pick(4, 0.0, DUR):
    if sec_of(n['t']) in ('bridge', 'climax'):
        ticks.append(dict(n, t=round(n['t'], 3), d=0.12,
                          v=max(1, min(127, int(round(n['v'] * 0.45))))))
ticks = fit(ticks)

TRACKS=[('lead','square',0.28,lead),
        ('counter','triangle',0.17,counter),
        ('harpsi','triangle',0.12,sparkle),
        ('piano','triangle',0.19,piano),
        ('harpsi','triangle',0.10,shimmer),
        ('bell','sine',0.13,bell),
        ('strings','sawtooth',0.14,strings),
        ('brass','sawtooth',0.15,brass),
        ('choir','triangle',0.13,choir),
        ('knife','square',0.115,knife),
        ('bass','triangle',0.19,bass),
        ('bass','square',0.115,bass2),
        ('counter','triangle',0.115,shadow),
        ('tick','square',0.10,ticks)]

def num(x):
    if abs(x-round(x))<1e-9: return str(int(round(x)))
    s=('%.3f'%x).rstrip('0').rstrip('.')
    return s if s not in ('','-') else '0'
def notes_js(ns):
    return '['+','.join('[%s,%d,%s,%d]'%(num(n['t']),n['m'],num(n['d']),int(n['v'])) for n in ns)+']'
def drums_js(ds):
    return '['+','.join('[%s,%d,%d]'%(num(d[0]),d[1],int(d[2])) for d in ds)+']'

parts=[]
for nm,w,g,ns in TRACKS:
    if not ns: continue
    parts.append("      { name: '%s', wave: '%s', gain: %s, notes: %s }"%(nm,w,num(g),notes_js(ns)))
head = ['/**',
 ' * 五面道中《広有射怪鳥事 ～ Till When?》—— 妖鳥编（魂魄妖梦版重配器）。',
 ' * 素材 = ZUN 原曲 TH07 扒谱 MIDI（155 BPM 原速、原调不移调），每一个音符逐音搬入；',
 ' * 重写的是编制与力度：人侧（主旋律/钢琴/弦乐/合唱）vs 妖侧（钟琴/大键琴/飞刀），高潮合体。',
 ' * tools/build/_youmu_compose.py 生成，勿手改。',
 ' */',
 'export const TILLWHEN_PRE5 = {',
 '  pre5: {',
 "    title: '広有射怪鳥事 ～ Till When?（妖鳥编）',",
 '    duration: %s,'%num(DUR),
 '    bpm: %d,'%round(bpm),
 '    tracks: [']
lines_out = list(head)
for i,p in enumerate(parts):
    lines_out.append('      '+p.strip()+(',' if i < len(parts)-1 else ''))
lines_out.append('    ],')
lines_out.append('    drums: '+drums_js(drums))
lines_out.append('  }')
lines_out.append('};')
lines_out.append('')
txt = '\n'.join(lines_out)
open(OUT_JS,'w',encoding='utf-8').write(txt)
info={'bpm':bpm,'bar':bar,'duration':DUR,'tracks':[(nm,w,g,len(ns)) for nm,w,g,ns in TRACKS if ns],'drums':len(drums),'drum_kinds':kindcount,'notes':sum(len(ns) for nm,w,g,ns in TRACKS if ns)}
json.dump(info, open(KIT+'/compose_info.json','w'), ensure_ascii=False, indent=1)
open(KIT+'/compose_log.txt','w').write(json.dumps(info, ensure_ascii=False, indent=1)+'\n')
print('done')
