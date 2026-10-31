# -*- coding: utf-8 -*-
"""把《妖魔夜行》第二版接进游戏：曲目数据、音乐室、i18n、文档、版本串。"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))   # tools/build/_rumia_lead -> repo root
def P(*a):
    return os.path.join(ROOT, *a)
def bt(s):
    return s.replace('~BT~', chr(96))

NOTE = json.load(open(P('tools', 'build', '_rumia_lead', '_note.json'), encoding='utf-8'))
VER_OLD = '1.6.56'
VER_NEW = '1.6.57'

def rd(p):
    return open(p, encoding='utf-8').read()

def wr(p, s):
    open(p, 'w', encoding='utf-8', newline='').write(s)

# ---- 1. songs/index.js ----
p = P('src', 'engine', 'songs', 'index.js')
s = rd(p)
old_c = "  // 1 面 Boss：妖魔夜行 —— 照 ZUN 扒谱 1:1 直译（见 tools/stage1_youma.py）"
new_c = "  // 1 面 Boss：妖魔夜行 —— 逐音搬入 + 重配器（见 tools/build/_rumia_compose.py）"
assert s.count(old_c) == 1
s = s.replace(old_c, new_c)
old_p = "    pick: (m) => ({ stage1: m.YOUMA_STAGE1?.stage1 }) },"
new_p = ("    pick: (m) => ({ stage1: m.YOUMA_STAGE1?.stage1\n"
         "      ? { ...m.YOUMA_STAGE1.stage1, audio: 'src/assets/bgm/youma_stage1.mp3?v=" + VER_NEW + "' }\n"
         "      : undefined }) },")
assert s.count(old_p) == 1
s = s.replace(old_p, new_p)
wr(p, s)

# ---- 2. musicTracks.js ----
p = P('src', 'game', 'musicTracks.js')
s = rd(p)
i = s.index("    key: 'stage1',")
st = s.rindex("  {", 0, i)
en = s.index("\n  },", i) + len("\n  },")
blk = s[st:en]
nb = re.sub(r"time: [\d.]+,", "time: 113.0,", blk, count=1)
nb = re.sub(r"note:\s*\n?\s*'[^']*'", "note:\n      '" + NOTE['zh'] + "'", nb, count=1)
assert 'time: 113.0' in nb and NOTE['zh'] in nb
s = s[:st] + nb + s[en:]
wr(p, s)

# ---- 3. i18n packs ----
OLD_NOTE = '一面 Boss 曲。原曲我几乎没动：铁琴和弦乐先把走廊搭起来，长笛在后面才肯露头。中间本来有一处该亮的，我整段剪了——她一天吃一次黎明，你给她留个亮口子，她明天还得再饿一回。反正那条小径她也走不出去。'
for pack, note in (('en', NOTE['en']), ('ja', NOTE['ja'])):
    p = P('src', 'i18n', 'packs', pack + '.js')
    s = rd(p)
    s = re.sub(r'^  "' + re.escape(OLD_NOTE) + r'": ".*",\n', '', s, flags=re.M)
    assert s.rstrip().endswith('};')
    ins = '  "%s": %s,\n' % (NOTE['zh'], json.dumps(note, ensure_ascii=False))
    s = s.rstrip()[:-2] + ins + '};\n'
    wr(p, s)
    print('i18n', pack, 'ok')

try:
    from opencc import OpenCC
    tw = OpenCC('s2twp').convert(NOTE['zh'])
    p = P('src', 'i18n', 'packs', 'zh-hant.js')
    s = rd(p)
    s = re.sub(r'^  "' + re.escape(OLD_NOTE) + r'": ".*",\n', '', s, flags=re.M)
    s = s.rstrip()[:-2] + '  "%s": "%s",\n};\n' % (tw, tw)
    wr(p, s)
    print('i18n zh-hant ok')
except ImportError:
    print('!! opencc 缺失，zh-hant 先跳过')

# ---- 4. README ----
p = P('README.md')
s = rd(p)
old = '四首用预渲染 MP3（离线渲染母版转码，合计 8.8 MB：EXTRA 道中《红月下追逐不止的女仆》'
new = '五首用预渲染 MP3（离线渲染母版转码，合计 11.5 MB：一面 Boss 露米娅《妖魔夜行》~BT~src/assets/bgm/youma_stage1.mp3~BT~、EXTRA 道中《红月下追逐不止的女仆》'
assert s.count(old) == 1
s = s.replace(old, bt(new))
old = '露米娅《妖魔夜行》（改为 six-段完整循环，106 秒）'
new = '露米娅《妖魔夜行》（重编成 1:53 的《宵暗夜路编》，见下条）'
assert s.count(old) == 1
s = s.replace(old, new)
anchor = '  - EXTRA 中段《亡き王女の為のセプテット（红月王座编）》'
assert s.count(anchor) == 1
bullet = ('  - 一面 Boss《妖魔夜行（宵暗夜路编）》是继芙兰、雷米莉亚之后第三首「逐音搬入」的曲子，但搬的是全套原曲：'
          '~BT~tools/build/_rumia_compose.py~BT~ 直接解析 TH06 扒谱 MIDI（34 小节 / 55.77s / 146→144 BPM / 降 E 小调），'
          '把 14 条通道按角色重新配器——长笛=主旋律（另加同度钢琴）、编钟=铁琴、DrawbarOrgan=羽管键琴 + 低八度 pad、'
          'RockOrgan=pad 长和弦、弦乐=ch5、电吉他=ch10、AcousticBass=贝斯 + 同度 sine sub，原文件里重复的 ch4/ch11/ch12 层全部丢弃。'
          '原曲整块落在第 11.0–64.8 秒（风琴前奏 11–24、铁琴过门 24–29、主题 37.25 秒才进），前面接 11 秒新写的引子：'
          '八音盒先把主题头哼一遍，心跳鼓与钟摆垫在底下，第 8 秒管风琴把门推开；原曲走完接 10 秒黑暗桥段，所有声部一起被吃掉，'
          '只剩 drone、三颗八音盒音、心跳与反向吊镲；再进主题变奏——同一批原曲音符换成八音盒高八度、弦乐齐奏、铜管切分、加密的鼓；'
          '尾声回到八音盒，停在降 E 短调的和弦上接回引子。总长 112.998 秒，15 轨 3484 音 2111 鼓（底鼓 703 / 军鼓 249 / 镲 745）。'
          '混音时主旋律（lead 增益 0.325）压在鼓上 0.1dB、变奏段高 1.9dB；引子与桥段各加 +4.0/+3.2dB、尾声 +4.5dB 的段增益，'
          '逐段 RMS（单声道等效）intro -22.8 / 原曲 -19.0 / 桥 -27.2 / 变奏 -17.7 / 尾声 -24.5。'
          '母版是 44.1kHz 立体声（19,932,892 B / 4,983,212 帧 / 112.998 秒 / 峰值 0.333 / RMS -19.50 / 谱心 828 Hz / '
          '接缝 0.0004 / L-R 相关 0.68 / 宽度 -7.2dB），仓库与线上只留 MP3：2,713,390 B / 192.1 kbps CBR '
          '（MPEG-1 Layer III 44.1kHz 立体声，LAME delay 576 + padding 2068，浏览器解出 4,983,212 采样、与母版逐点对齐），'
          '母版放在 ~BT~tools/build/_rumia_kit/~BT~（不入库）。~BT~node tools/verify_audio_mp3.mjs~BT~ 五首 81 pass / 0 fail。\n')
s = s.replace(anchor, bt(bullet) + anchor)
wr(p, s)
print('README ok')

# ---- 5. docs/NETWORK_CN.md ----
p = P('docs', 'NETWORK_CN.md')
s = rd(p)
s = s.replace('### 3.2 预渲染 BGM 转 MP3（4 首）', '### 3.2 预渲染 BGM 转 MP3（5 首）')
old_tot = '| 合计 | | 21,571,206 B | **8,796,139 B（−59.2%）** |'
assert s.count(old_tot) == 1
row = '| ~BT~youma_stage1~BT~ | STAGE 1 Boss（妖魔夜行·宵暗夜路编） | —（母版 19,932,892 B 不入库） | **2,713,390 B** |\n'
s = s.replace(old_tot, bt(row) + old_tot)
s = s.replace('21,571,206 B | **8,796,139 B（−59.2%）**', '21,571,206 B | **11,509,529 B（−46.6%）**')
s = s.replace('~BT~remilia_septette~BT~ 的母版是 44.1 kHz 立体声，改走 MPEG-1 Layer III / 192 kbps CBR',
              '~BT~remilia_septette~BT~ 与 ~BT~youma_stage1~BT~ 的母版是 44.1 kHz 立体声，都走 MPEG-1 Layer III / 192 kbps CBR')
s = s.replace('（~BT~node tools/verify_audio_mp3.mjs~BT~，4 首 65 pass / 0 fail）', '（~BT~node tools/verify_audio_mp3.mjs~BT~，5 首 81 pass / 0 fail）')
s = s.replace('运行时只改 ~BT~src/engine/songs/index.js~BT~ 的四行 ~BT~audio~BT~ 路径', '运行时只改 ~BT~src/engine/songs/index.js~BT~ 的五处 ~BT~audio~BT~ 路径')
s = s.replace('三首单声道 WAV 母版仍在仓库里；~BT~remilia_septette~BT~ 的 44.1kHz 立体声母版',
              '三首单声道 WAV 母版仍在仓库里；~BT~youma_stage1~BT~ 的 44.1kHz 立体声母版 19,932,892 B 与 ~BT~remilia_septette~BT~ 的 44.1kHz 立体声母版')
s = bt(s)
wr(p, s)
print('NETWORK_CN ok')

# ---- 6. AUDIT_CURRENT.md ----
p = P('docs', 'RE_STORY', 'AUDIT_CURRENT.md')
s = rd(p)
old = '| 03 | ~BT~stage1~BT~ | 妖魔夜行 | STAGE 1 | 博丽神社 · 夜樱小径 | 原曲 / ZUN | 39.3 | ~BT~:62~BT~ |'
new = '| 03 | ~BT~stage1~BT~ | 妖魔夜行（宵暗夜路编） | STAGE 1 | 博丽神社 · 夜樱小径 | 原曲 / ZUN（逐音搬入重配器） | 113.0 | ~BT~:62~BT~ |'
old, new = bt(old), bt(new)
assert s.count(old) == 1
s = s.replace(old, new)
wr(p, s)
print('AUDIT ok')

# ---- 7. 版本串 ----
for rel in ['index.html', 'src/ui/platform.js', 'sw.js', 'src/engine/songs/index.js']:
    p = P(*rel.split('/'))
    s = rd(p)
    n = s.count(VER_OLD)
    s = s.replace(VER_OLD, VER_NEW)
    wr(p, s)
    print('ver', rel, n)

print('done')
