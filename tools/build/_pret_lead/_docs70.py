# -*- coding: utf-8 -*-
"""1.6.69 -> 1.6.70 版本串 + 五首道中 README 数据更新。"""
import io, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

def rw(rel, fn):
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    n = fn(s)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(n)
    return s.count('1.6.69'), n.count('1.6.70')

for rel in ('index.html', 'src/ui/platform.js', 'sw.js', 'src/engine/songs/index.js'):
    a, b = rw(rel, lambda s: s.replace('1.6.69', '1.6.70'))
    print(rel, 'old', a, 'new', b)

# README 数字
p = os.path.join(ROOT, 'README.md')
s = io.open(p, encoding='utf-8').read()
reps = [
 ('13 轨 3,686 音 1,504 鼓，段增益把引子抬 1.5 dB、C 段收 1.5 dB',
  '13 轨 4,072 音 1,509 鼓；第二版（v1.6.70）按九条清单再改：A 段补弦乐同度与铜管和声、C 段主奏再叠八音盒高八度、全曲每小节一根低音踏板、段头补点音，段增益重排成引子 -23 / A -18.8 / B -19.4 / C -16.8 dB（C 段最响）'),
 ('12 轨 2,043 音 1,337 鼓；原曲开头两小节本身是空拍（逐音搬入后成了 1.3 秒死气），这一版用雾状 pad、心跳底鼓与低音持续把空隙填住',
  '12 轨 2,152 音 1,561 鼓；原曲开头两小节本身是空拍（逐音搬入后成了 1.3 秒死气），这一版用雾状 pad、心跳底鼓与低音持续把空隙填住；第二版（v1.6.70）把 A 段开头那句旋律提前 15 秒用八音盒 + 低八度长笛预演（原来要等 21.4 秒才有第一个主旋律音），并补 ride 铺底与段头吊镲，大键琴 / 弦乐 / 钢琴各抬 1.8–2.3 dB'),
 ('11 轨 2,093 音 1,504 鼓；原曲开头两小节同样是休止，这里铺了冰面 pad、心跳与冰晶三十二分，1.6 秒的空洞不再出现',
  '11 轨 2,314 音 1,508 鼓；原曲开头两小节同样是休止，这里铺了冰面 pad、心跳与冰晶三十二分，1.6 秒的空洞不再出现；第二版（v1.6.70）给 B1 补合唱层、C 段八音盒点音加厚、大键琴与弦乐各抬 2.7 / 1.8 dB，段增益重排成 A1 -21.8 → B1 -18.9 → B2 -20.4 → C -17.7 dB'),
 ('13 轨 7,993 音 2,790 鼓；母版 21,817,372 B / 123.681 s',
  '13 轨 8,368 音 2,577 鼓；第二版（v1.6.70）把 656 记吊镲/水镲稀疏到 225 记、全场补 ride 四分、C1 闭镲减 1/4 并与 C2 一样补铜管和声、C2 旋律叠八度，段增益 A2 -0.9 / C1 +0.5 / C2 -0.6 / D +2.0 dB（六段电平从 0.7 dB 的平线拉开成 C2 -17.8 / D -18.9 / A2 -19.4 / C1 -20.2）；母版 21,817,372 B / 123.681 s'),
 ('11 轨 6,216 音 1,214 鼓；母版 14,634,716 B / 82.963 s',
  '12 轨 6,529 音 1,266 鼓；第二版（v1.6.70）给 16 小节 3/4 段补 ride 三连点、转 B 大调段补铜管和声与段头吊镲、钢琴收 1.7 dB 让顶线出来，段增益引子 +1.0 / 3-4 -0.3 / B 大调 +0.35 / 尾声 -0.5；母版 14,634,716 B / 82.963 s'),
]
for a, b in reps:
    assert s.count(a) == 1, a[:30]
    s = s.replace(a, b)
# 汇总行：五首 MP3 体积不变，但换版本
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('README updated')
