# -*- coding: utf-8 -*-
import io, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BT = chr(96)
K = ('pre1', 'pre2', 'pre3', 'pre4', 'pre6')
lines = io.open(os.path.join(ROOT, 'README.md'), encoding='utf-8').read().split('\n')
i0 = [i for i, l in enumerate(lines) if l.startswith('  - 六面 Boss《竹取飞翔（月之公主编）》')]
assert len(i0) == 1
i0 = i0[0]
B = {}
B['pre1'] = ("  - 一面道中《像鬼灯一样鲜红的灵魂（夜樱小径编）》同样走「逐音搬入」：~BT~tools/build/_pret1_compose.py~BT~ 把原曲 52 小节整块铺进来"
 "（145 BPM / G 小调 / 56 小节），小号主题、钢琴副歌、风琴铺底一个音没改，只前后各加两小节新写的夜樱引子与走远的尾声。改动全在「听得见」上："
 "C 段原谱小号只剩两个音，真正的主奏是钢琴那条十六分琶音，这次把它扶到主旋律的位置接管整段；鼓组抬到与主旋律差 2 dB 以内，反拍补底鼓与 ghost 军鼓；"
 "低频补一根八分低音踏板。13 轨 3,686 音 1,504 鼓，段增益把引子抬 1.5 dB、C 段收 1.5 dB；母版 {W} B / 92.690 s（44.1 kHz 立体声，不入库），MP3 **{M} B**（192 kbps CBR）。")
B['pre2'] = ("  - 二面道中《幻视之夜 ～ Ghostly Eyes（萤火夜雾编）》：~BT~tools/build/_pret2_compose.py~BT~ 照扒谱把原曲 48 小节整块搬入"
 "（151 BPM / C# 小调 / 70 小节），B 段三声部钢琴原样保留。这一版把雾做厚：大键琴、弦乐、钢琴各抬一档（原比主旋律低 7–9 dB），"
 "每小节按原曲低音铺一层开放五度 pad 与合唱床；萤火用八音盒点在高音区，虫鸣交给贝斯十六分；接缝照旧不留尾奏，走到头就回头。"
 "12 轨 1,996 音 1,333 鼓；母版 {W} B / 111.258 s（不入库），MP3 **{M} B**（192 kbps CBR）。")
B['pre3'] = ("  - 三面道中《月牙精灵（冰蓝晨曦编）》：~BT~tools/build/_pret3_compose.py~BT~ 把原曲 52 小节整块搬入（143 BPM / E 大调 / 56 小节），"
 "长笛主旋律与颤音弦乐的同音齐奏照原谱保留，C 段移到降 B/D 小调的口子也没动。修两件事：把长笛抬到鼓上面去（原来差 5 dB）、"
 "尾声收短两拍让循环点不再爆音；冰晶用三十二分八音盒点在高音区，钟摆滴答铺满 A 段，钢琴与大键琴各抬一档填中频。"
 "11 轨 2,038 音 1,500 鼓；母版 {W} B / 93.986 s（不入库），MP3 **{M} B**（192 kbps CBR）。")
B['pre4'] = ("  - 四面道中《秋意渐浓之瀑（瀑布溪谷编）》：原曲 152 小节里真正循环的只有 40 小节（45–84 与 85–124 逐音相同），"
 "~BT~tools/build/_pret4_compose.py~BT~ 只搬 A1–C2 与结尾 D 段共 84 小节（163 BPM / B 小调），Calliope 三层同音的 riff、十六分贝斯与琶音一个音没改。"
 "改动在「别让它糊」上：长笛与第二长笛原来叠成 6 dB 的尖峰，这次压回与鼓齐平；贝斯补低八度，鼓组按原谱太鼓与通鼓重排；"
 "引子两小节先让水珠落下来，尾声收回水潭。13 轨 7,993 音 2,790 鼓；母版 {W} B / 123.681 s（不入库），MP3 **{M} B**（192 kbps CBR）。")
B['pre6'] = ("  - 六面道中《旅人1970（月都航路编）》：~BT~tools/build/_pret6_compose.py~BT~ 把原曲 58 小节整块搬入，连中间那 16 小节的 3/4 拍也照样留着"
 "（162 BPM / D 小调 / 60 小节），钢琴左手十六分托卡塔与右手顶线一个音没改。原谱没有独立低音轨，这次按每小节最低音补低音踏板与 sub；"
 "顶线最高写到 D#8，重建时整体折回八度；前后各加两小节「起飞」与「降落」，把车停在永远亭门口。"
 "11 轨 6,216 音 1,214 鼓；母版 {W} B / 82.963 s（不入库），MP3 **{M} B**（192 kbps CBR）。")
DUR = {'pre1': 92.690, 'pre2': 111.258, 'pre3': 93.986, 'pre4': 123.681, 'pre6': 82.963}
out = []
for k in K:
    M = os.path.getsize(os.path.join(ROOT, 'src/assets/bgm', '%s.mp3' % k))
    W = os.path.getsize(os.path.join(ROOT, 'tools/build/_pret_kit', '%s_stereo.wav' % k))
    out.append(B[k].replace('~BT~', BT).format(W='{:,}'.format(W), M='{:,}'.format(M)))
lines[i0 + 1:i0 + 1] = out
io.open(os.path.join(ROOT, 'README.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print('README bullets ok')
