# -*- coding: utf-8 -*-
import re, sys, io
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r'C:\Users\GuSheng\Downloads\HKS\src\game\musicTracks.js'
src = open(p, encoding='utf-8').read()

pre3 = """  {
    key: 'pre3',
    no: '06',
    title: 'ルーネイトエルフ',
    sub: '琪露诺 · 道中',
    cat: 'STAGE 3 · 道中',
    place: '雾之湖 · 冰蓝晨曦',
    orig: '原曲「ルーネイトエルフ」/ 作曲：ZUN / 幽閉サテライト 风重编',
    tone: '#bfe6ff',
    glow: '191, 230, 255',
    time: 66.7,
    note:
      '清晨的雾还没散，琪露诺就在湖面上练这首。重编版把钢琴换成锯齿，弦乐垫在下面，' +
      '开头三秒是从很远处慢慢走近的渐强——她说那是「冷气先到，人后到」。' +
      '曲子走到第四十小节会自己绕回开头，和她数冰块的习惯一样，数到第九块就从头再数。',
  },
"""

# 1) 在 stage3 条目之前插入 pre3
anchor = "  {\n    key: 'stage3',\n"
assert anchor in src
src = src.replace(anchor, pre3 + anchor, 1)

# 2) 更新 stage3 条目
old_stage3_head = """    title: 'おてんば恋娘',
    sub: '琪露诺',
    cat: 'STAGE 3',
    place: '雾之湖 · 冰蓝晨曦',
    orig: '原曲「おてんば恋娘」/ 作曲：ZUN / 8bit 改编',"""
new_stage3_head = """    title: 'おてんば恋娘',
    sub: '琪露诺',
    cat: 'STAGE 3',
    place: '雾之湖 · 冰蓝晨曦',
    orig: '原曲「おてんば恋娘」「おてんば恋娘の冒険」「チルノのパーフェクトさんすう教室」/ 作曲：ZUN・IOSYS / Ateam 低频重编',"""
assert old_stage3_head in src
src = src.replace(old_stage3_head, new_stage3_head, 1)
src = src.replace("""    glow: '142, 233, 255',
    time: 86.5,
    note:
      '湖面结冰的那一夜，琪露诺把这首曲子弹了九遍，每一遍都宣称自己是最强的。' +
      '前八遍都在同一个地方抢拍，第九遍忽然稳了，因为冰面开始裂。' +
      '第十遍她掉进了雾之湖，曲子一点没乱，只是副歌多了一串气泡音。',""",
"""    glow: '142, 233, 255',
    time: 101.7,
    note:
      '三段拼成的琪露诺：开头是红魔乡那首她自己，三十八秒处接花映塚的冒险，六十四秒干脆闯进' +
      '「完美教室」把算术题唱成副歌——她说这三首其实是同一首，只是她数错了拍子。' +
      '重编版把低频压得很低，因为冰面下的雾之湖本来就是闷的。',""", 1)

# 3) 按出现顺序重排 no
counter = [0]
def renum(m):
    counter[0] += 1
    return "%sno: '%02d'," % (m.group(1), counter[0])
src = re.sub(r"(\n    )no: '\d\d',", renum, src)
open(p, 'w', encoding='utf-8', newline='\n').write(src)
print('唱片条目数（no 出现次数）:', counter[0])
print('MUSIC_TOTAL 行:', [l for l in src.splitlines() if 'MUSIC_TOTAL' in l])
