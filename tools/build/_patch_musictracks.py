# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = 'src/game/musicTracks.js'
s = io.open(p, encoding='utf-8').read()
orig = s

def rep(old, new, cnt=1):
    global s
    assert s.count(old) == cnt, (s.count(old), old[:60])
    s = s.replace(old, new, cnt)

# ── 标题曲：完整曲式 + 去 8bit ──
rep("""    sub: '13th Anniversary Medley',
    cat: 'TITLE',""",
"""    sub: '13th Anniversary Medley · 完整曲式',
    cat: 'TITLE',""")
rep("""    time: 99.2,""", """    time: 144,""")
rep("""      '灵梦说太长了，魔理沙说再放一遍就好——于是时长停在了 99 秒，谁也没赢。',""",
"""      '灵梦说太长了，魔理沙说再放一遍就好——于是结尾又长出一段转调和一遍副歌，' +
      '最后停在两分二十四秒，谁也没赢。',""")

# ── 1 面道中（新插入）──
pre1_block = """  {
    key: 'pre1',
    no: '02',
    title: 'ほおずきみたいに紅い魂',
    sub: '露米娅 · 道中',
    cat: 'STAGE 1 · 道中',
    place: '博丽神社 · 夜樱小径',
    orig: '原曲「ほおずきみたいに紅い魂」/ 作曲：ZUN / 骨架重置改编',
    tone: '#ffc9a8',
    glow: '255, 201, 168',
    time: 66.2,
    note:
      '露米娅在午夜的小径上哼的歌。旋律整条重写过，只留下 ZUN 那版的和弦骨架与走路的贝斯。' +
      '柔和配器把方波磨成三角，副音故意压过主音——她说这样夜路才不吓人。' +
      '曲子走到第四十小节会自己绕回开头，像她在原地转的第三圈。',
  },
"""
rep("""  {
    key: 'stage1',
    no: '02',""", pre1_block + """  {
    key: 'stage1',
    no: '03',""")

# ── 1 面 Boss：融合版 ──
rep("""    orig: '原曲「妖魔夜行」/ 作曲：ZUN / 8bit 改编',
    tone: '#9aa6ff',""",
"""    orig: '原曲「妖魔夜行」/ 作曲：ZUN / PHOENIX 风重编 × 原曲融合',
    tone: '#9aa6ff',""")
rep("""      '夜路上的妖怪之歌。露米娅总是在第三小节迷路，于是干脆把整条夜路都当成了自己的家。' +
      '低音线是她的脚步声，鼓点是翅膀拍打；间奏里那两声走音不是失误，是她真的撞到了樱花树。' +""",
"""      '夜路上的妖怪之歌。融合版保留了游戏原本的贝斯与鼓，主音换成 PHOENIX 风那种短促切分，' +
      '脚踩原曲、手弹重编，两套节拍在同一首里对齐。' +
      '低音线是她的脚步声，鼓点是翅膀拍打；间奏里那两声走音不是失误，是她真的撞到了樱花树。' +""")

# ── 2 面道中（新插入）+ 2 面 Boss 改成 05 ──
pre2_block = """  {
    key: 'pre2',
    no: '04',
    title: '幻視の夜 ～ Ghostly Eyes',
    sub: '莉格露 · 道中',
    cat: 'STAGE 2 · 道中',
    place: '魔法森林 · 萤火夜雾',
    orig: '原曲「幻視の夜 ～ Ghostly Eyes」/ 作曲：ZUN / EUROBEAT 改编',
    tone: '#9fffd0',
    glow: '159, 255, 208',
    time: 61.1,
    note:
      '魔法森林的夜雾以一百五十七拍的速度流动。荧光是十六分音符的擦片，虫鸣被编进了八分贝斯。' +
      '没有人声，只留一条跑得比虫子快一点的合成主音——跟上它，就不会在雾里迷路。' +
      '曲子每四十小节回头一次，回头的地方是莉格露提灯的位置。',
  },
"""
rep("""  {
    key: 'stage2',
    no: '03',""", pre2_block + """  {
    key: 'stage2',
    no: '05',""")
rep("""    orig: '原曲「蠢々秋月 ～ Mooned Insect」/ 作曲：ZUN / 8bit 改编',""",
"""    orig: '原曲「蠢々秋月 ～ Mooned Insect」/ 作曲：ZUN / EUROBEAT 融合改编',""")
rep("""      '萤火与虫鸣。莉格露说这首要在没有月亮的晚上弹，因为月亮太亮，虫子的节拍会乱。' +
      '于是编曲把高频削薄、给底鼓垫了一层夜雾，听起来像一整片森林在打拍子。' +""",
"""      '萤火与虫鸣。融合版把鼓换成四踩、低频垫厚，贝斯贴着主旋律的音高走，虫子会跟着你一起唱。' +
      '莉格露说这首要在没有月亮的晚上弹，因为月亮太亮，虫子的节拍会乱。' +""")

# ── 后面顺延编号 ──
for old_no, new_no, key in [("'04'","'06'",'stage3'), ("'05'","'07'",'stage4'), ("'06'","'08'",'stage5'),
                            ("'07'","'09'",'stage6'), ("'08'","'10'",'extra'), ("'09'","'11'",'gameover'),
                            ("'10'","'12'",'ending'), ("'11'","'13'",'endingW')]:
    rep("    key: '%s',\n    no: %s," % (key, old_no), "    key: '%s',\n    no: %s," % (key, new_no))

io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('改写完成，字符数', len(orig), '->', len(s))
