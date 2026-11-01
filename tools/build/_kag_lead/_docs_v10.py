# -*- coding: utf-8 -*-
import io, os, json
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BT = chr(96)
N = json.load(io.open(os.path.join(ROOT, 'tools/build/_kag_lead/_note_v10.json'), encoding='utf-8'))
zh, en, ja = N['zh'], N['en'], N['ja']

p = os.path.join(ROOT, 'src/game/musicTracks.js')
s = io.open(p, encoding='utf-8').read()
i0 = s.index("      '六面 Boss 曲（2:42 · 重制版）")
i1 = s.index("就是慢。」',", i0) + len("就是慢。」',")
head, tail2 = zh.split('\n——蓬莱山辉夜')
new_block = "      '" + head + "\\n' +\n      '——蓬莱山辉夜" + tail2 + "',"
s = s[:i0] + new_block + s[i1:]
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('musicTracks note replaced')

try:
    from opencc import OpenCC
    hant = OpenCC('s2twp').convert(zh)
except Exception as e:
    hant = None
    print('opencc missing', e)

for pack, val in (('en', en), ('ja', ja), ('zh-hant', hant)):
    if val is None:
        continue
    pp = os.path.join(ROOT, 'src/i18n/packs/%s.js' % pack)
    t = io.open(pp, encoding='utf-8').read()
    key = '  "六面 Boss 曲（2:42 · 重制版）'
    i = t.index(key)
    j = t.index('\n', i)
    line = t[i:j]
    assert line.rstrip().endswith(','), line[-40:]
    newline = '  ' + json.dumps(zh, ensure_ascii=False) + ': ' + json.dumps(val, ensure_ascii=False) + ','
    t = t[:i] + newline + t[j:]
    io.open(pp, 'w', encoding='utf-8', newline='\n').write(t)
    print(pack, 'replaced', len(line), '->', len(newline))

rp = os.path.join(ROOT, 'README.md')
r = io.open(rp, encoding='utf-8').read()
lines = r.split('\n')
idx = [k for k, l in enumerate(lines) if l.startswith('  - 六面 Boss《竹取飞翔（月之公主编）》')]
assert len(idx) == 1, idx
new_readme = (
  "  - 六面 Boss《竹取飞翔（月之公主编）》又是一首「逐音搬入」的曲子：~BT~tools/build/_kag_compose.py~BT~ 读 ZUN《竹取飛翔 ～ Lunatic Princess》的 MIDI"
  "（102 小节 / 154 BPM，bar 2–101 才是音乐），把原曲 bar 5–100 的 96 小节整块铺进新第 5–100 小节，音符一个没改，只做重配器与加倍——钢琴十六分跑句、"
  "双小号主题、大键琴固定音型、SquareLead 副歌依次照原曲顺序；调性 F 小调起，副歌转降 B 小调，最后十六小节整体升半音，尾声落回原调悬置。原曲两个要害照抄："
  "1:21 与 1:56 鼓整段抽空，改成底鼓 + 全曲每小节一根 65–123 Hz 的低音踏板 + 钟摆/木鱼；四小节新引子让八音盒先把主旋律哼一遍，免得非要等到一分二十一秒才认出是谁。"
  "第二版（v10）九处改动都在混音层：B 段小号主题后补弦乐齐奏与对答句、副歌高音区撤掉刺耳的高八度改铜管对答、两次「抽空」保留带身子的底鼓与低音长音、"
  "钟摆与木鱼加厚、引子与尾声补地基、全曲低频由 −10.2 dB 抬到 −7.2 dB（63–125 Hz）。16 轨 8,891 音 2,544 鼓，段增益把两次「抽空」压到 −1.4 / −0.7 dB、"
  "把升半音副歌与尾声抬到 +1.9 / +2.4 dB；母版 28,590,604 B / 162.078 s（44.1 kHz 立体声，超过 Cloudflare 单文件 25 MiB 上限，不入库），MP3 **3,891,408 B**"
  "（192 kbps CBR，解出采样数与母版完全一致）；~BT~kaguya_stage6.audio~BT~ 挂在 ~BT~src/engine/songs/index.js~BT~，fetch 失败照旧回退 ~BT~kaguya_stage6.js~BT~ 里的合成数据。"
).replace('~BT~', BT)
lines[idx[0]] = new_readme
io.open(rp, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print('README updated')
