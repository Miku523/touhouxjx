# -*- coding: utf-8 -*-
import io, sys
P='tools/build/_youmu_compose.py'
s=io.open(P,encoding='utf-8').read()
OLD='''shadow = relocate(pick(4, 0.0, DUR), win(23, 24)[0], dm=-12, mul=0.60)
shadow = shadow + relocate(pick(5, 0.0, DUR), win(37, 38)[0], dm=-12, mul=0.45)
shadow = shadow + relocate(pick(4, 0.0, DUR), win(66, 67)[0], dm=-12, mul=0.55)'''
NEW='''# 妖侧对句 = 原谱自己的高音声部（ch4 高音冷线 / ch10 对位线）搬进别的段落
_ans_hot = pick(4, win(14, 22)[0], win(14, 22)[1])        # 原谱 ch4：A 段高音冷线
_ans_ctr = pick(10, win(55, 63)[0], win(63, 64)[0])       # 原谱 ch10：对位线
shadow = relocate(_ans_hot, win(23, 24)[0], dm=0, mul=0.55)          # B 段：妖侧应句
shadow = shadow + relocate(_ans_ctr, win(37, 38)[0], dm=0, mul=0.45) # 桥段：对句
shadow = shadow + relocate(pick(4, 0.0, DUR), win(66, 67)[0], dm=-12, mul=0.55)  # 尾声低八度鬼影'''
if OLD not in s:
    print('MISS shadow'); sys.exit(1)
s=s.replace(OLD,NEW,1)
OLD2="""    if sec_of(n['t']) in ('B', 'bridge', 'climax'):
        ticks.append(dict(n, t=round(n['t'], 3), m=n['m'] + 12, d=0.10,"""
NEW2="""    if sec_of(n['t']) in ('B', 'climax'):
        ticks.append(dict(n, t=round(n['t'], 3), m=n['m'] + 12, d=0.10,"""
if OLD2 not in s:
    print('MISS ticks'); sys.exit(1)
s=s.replace(OLD2,NEW2,1)
io.open(P,'w',encoding='utf-8',newline='\n').write(s)
print('patched youmu shadow/ticks')
