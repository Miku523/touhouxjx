# -*- coding: utf-8 -*-
import io, os
BT = chr(96)
def T(x):
    return x.replace('~BT~', BT)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
def rw(rel, fn):
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    t = fn(s)
    io.open(p, 'w', encoding='utf-8', newline='').write(t)
    print('  ', rel, 'changed' if t != s else 'SAME!!')
def rep(s, a, b):
    a, b = T(a), T(b)
    assert s.count(a) == 1, (s.count(a), a[:48])
    return s.replace(a, b)

def readme(s):
    s = rep(s, '19 首曲目里 16 首由 WebAudio 实时合成，三首用预渲染 MP3（离线渲染母版转码，合计 5.6 MB：EXTRA 道中《红月下追逐不止的女仆》',
               '19 首曲目里 15 首由 WebAudio 实时合成，四首用预渲染 MP3（离线渲染母版转码，合计 7.3 MB：EXTRA 道中《红月下追逐不止的女仆》')
    s = rep(s, 'EXTRA 终盘芙兰战《恶魔之妹》~BT~src/assets/bgm/flandre_devil.mp3~BT~、EXTRA 结局曲 ~BT~src/assets/bgm/festival_box.mp3~BT~）：',
               'EXTRA 中段雷米莉亚拦路《献给已逝王女的七重奏》~BT~src/assets/bgm/remilia_septette.mp3~BT~、EXTRA 终盘芙兰战《恶魔之妹》~BT~src/assets/bgm/flandre_devil.mp3~BT~、EXTRA 结局曲 ~BT~src/assets/bgm/festival_box.mp3~BT~）：')
    s = rep(s, '  - 三首重点曲目的编排参数写在 ~BT~tools/midi2js.py~BT~ 的 ~BT~SONGS~BT~ 条目里（~BT~arrange~BT~ 字段），改完重跑 ~BT~python tools/midi2js.py~BT~ 即可复现。',
               '  - 三首重点曲目（道中 / 终盘 / 结局）的编排参数写在 ~BT~tools/midi2js.py~BT~ 的 ~BT~SONGS~BT~ 条目里（~BT~arrange~BT~ 字段），改完重跑 ~BT~python tools/midi2js.py~BT~ 即可复现；EXTRA 中段雷米莉亚战与它们不同，是一条独立的 MIDI 驱动管线，见本节最后一条。')
    lines = s.split('\n')
    idx = [i for i, ln in enumerate(lines) if ln.startswith('  - EXTRA 中段《亡き王女の為のセプテット》')]
    assert len(idx) == 1, idx
    new = T(
      '  - EXTRA 中段《亡き王女の為のセプテット（红月王座编）》是第二首「逐音搬入」的曲子，但比芙兰那首走得更远：'
      '~BT~tools/build/_remi_compose.py~BT~ 直接解析原曲 MIDI，把 14 条通道按角色重新配器——小号=主旋律（ch3 + ch10 低八度双层）、'
      '弦乐=和声（ch4 + 高音弦 ch12）、钢琴=右手织体（ch2）与引子钟摆（ch8）、贝斯=ch1（另加一层 -12 八度 sub）、'
      '羽管键琴=左手分解（ch13）、竖琴式琶音=尼龙吉他通道（ch5）、清音铜管=失真吉他通道（ch11）、管风琴=ch14；'
      '原曲里重复的 4 层（ch6=ch2+12、ch10=ch6、ch14=ch3、ch15=ch4）全部丢掉。'
      '更关键的是**原 MIDI 有 440 tick 的网格偏移**：所有 note-on 落在 tick%480==440 上，底鼓也只有按 440 偏移才落拍，'
      '所以真小节线是文件小节线 +440（第 1 小节真实起点 tick 2360 = 2.035 秒，与原曲 81 小节 / 137.03 秒的实测吻合）。'
      '这次改成自建 tick↔秒换算（~BT~midi2js.tick_to_sec~BT~，逐 tick 精确、不再线性插值），原曲 b1–81 落进新 b5–85，'
      '前后各接 4 小节新写的引子与尾声，145 BPM 变速度原样保留，总长 148.658 秒 / 89 小节。'
      '配器上新写了：引子 4 小节（Bb 小调管风琴踏板 + 弦乐渐强 + 羽管键琴 16 分琶音 + 教堂钟）、'
      '引子 II 的管风琴和弦床（Ebm / B / Db 每两小节换一次）、圣咏段（原曲 b49–64）的 16 尺管风琴踏板 Eb1/Bb1、'
      '终曲每小节一层管风琴持续音（取该小节最低贝斯音高八度，另加 16 尺踏板）+ 高八度弦乐加倍，以及尾声的全奏 Bb 小调终止。'
      '鼓组全部重写：定音鼓式底鼓踩正拍、军鼓走进行曲、段尾通鼓八连、吊镲只压在段落起点、ride 走八分、圆舞段 16 分通鼓加花。'
      '数据 22 轨 / 7,248 音 / 991 鼓，由 ~BT~tools/build/_exsr_render.py~BT~ 渲成 22050Hz 单声道 148.658 秒 PCM16 母版'
      '（6,555,862 B，峰值 0.485 / RMS -19.50 dBFS / 波峰因数 13.2 dB / 0 削顶 / 循环接缝 0.0004），'
      '段平衡：引子 +4.0dB、终曲 +0.8dB、终曲二 +1.0dB；逐段 RMS 引子 -24.8 → 主题 A -21.4 → 王座间奏 -22.2 → '
      '主题再现 -21.2 → -19.9 → 副歌段 -20.1 → 圣咏 -18.1 → -18.1 → 终曲 -16.9 → -16.9 → 尾声 -25.2，'
      '终曲的主旋律比鼓高 0.9–1.7dB；频谱中心 858 Hz，63–125Hz 占比 -10.2dB。'
      '转成 1,668,508 B 的 MP3（VBR 89.79 kbps，delay 576 / padding 1259，解码采样数与母版一致）挂到 ~BT~ex_mid.audio~BT~ 上，'
      'fetch 失败自动回退 ~BT~remilia_septette.js~BT~ 的合成数据。旧版自由改编（~BT~src/engine/songs/septette_ex.js~BT~、'
      '~BT~tools/build/_ex_arrange.py~BT~，13 轨 / 137.1 秒）留作档案，不再随曲库加载。')
    lines[idx[0]] = new
    return '\n'.join(lines)
rw('README.md', readme)

def net(s):
    s = rep(s, '| ~BT~flandre_devil~BT~ | EXTRA 终盘（恶魔之妹） | 6,615,044 B | **1,698,472 B** |',
               '| ~BT~flandre_devil~BT~ | EXTRA 终盘（恶魔之妹） | 6,615,044 B | **1,698,472 B** |\n| ~BT~remilia_septette~BT~ | EXTRA 中段（七重奏） | 6,555,862 B | **1,668,508 B** |')
    s = rep(s, '| 合计 | | 21,571,206 B | **5,613,730 B（−74.0%）** |',
               '| 合计 | | 28,127,068 B | **7,282,238 B（−74.1%）** |')
    return s
rw('docs/NETWORK_CN.md', net)

def audit(s):
    return rep(s, '| 15 | ~BT~ex_mid~BT~ | 亡き王女の為のセプテット（血月王座编） | EXTRA · 中段 | 红魔馆地下 · 血月水晶 | 原曲 / ZUN | 137.1 | ~BT~:263~BT~ |',
               '| 15 | ~BT~ex_mid~BT~ | 亡き王女の為のセプテット（红月王座编） | EXTRA · 中段 | 红魔馆地下 · 血月水晶 | 原曲 / ZUN（逐音搬入重配器） | 148.7 | ~BT~:263~BT~ |')
rw('docs/RE_STORY/AUDIT_CURRENT.md', audit)
print('docs done')
