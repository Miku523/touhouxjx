# -*- coding: utf-8 -*-
import io
p='tools/un_fuse.py'
s=io.open(p,encoding='utf-8').read().replace('\r\n','\n')
s=s.replace("""# 低音再加一层八度下方的琴键（原 trk3 已经有低八度 saw，这里只把三角波推厚）
low = [list(n) for n in OLD['tracks'][3]['notes']]
tracks.append({'wave': 'triangle', 'gain': 0.06, 'notes': low})""",
"""# 低音再垫一层八度下方（三角波），把 8bit 的 saw 托厚
low = []
for (t, m, du, v) in OLD['tracks'][3]['notes']:
    if m - 12 >= 22:
        low.append([t, m - 12, du, 90])
tracks.append({'wave': 'triangle', 'gain': 0.07, 'notes': low})

# 把原曲那条被 8bit 版丢掉的钟琴十六分琶音叠回来（MIDI ch5，实测游戏时间 = 源时间 - 2.323s）
arp = []
for (t, m, du, v) in MID['channels']['5']['notes']:
    gt = t - 2.323
    if 0 <= gt < DUR - 0.02:
        arp.append([round(gt, 4), int(m), round(max(0.05, du), 4), 58])
tracks.append({'wave': 'sawtooth', 'gain': 0.042, 'notes': arp})""")
s=s.replace("OLD = json.load(open(os.path.join(BASE, 'tools', 'build', '_old_extra.json'), encoding='utf-8'))",
 "OLD = json.load(open(os.path.join(BASE, 'tools', 'build', '_old_extra.json'), encoding='utf-8'))\nMID = json.load(open(os.path.join(BASE, 'tools', 'build', '_un_orig.json'), encoding='utf-8'))")
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('patched')
