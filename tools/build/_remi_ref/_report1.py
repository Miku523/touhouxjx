# -*- coding: utf-8 -*-
import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='ascii', errors='replace')
OUT = r'C:\Users\GuSheng\Downloads\HKS\tools\build\_remi_ref'
d = json.load(open(os.path.join(OUT, 'analysis.json'), encoding='utf-8'))
PCN = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
NAMES = {'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb'}
BT = chr(96)
def nm(p):
    s = PCN[p % 12]; return NAMES.get(s, s) + str(p // 12 - 1)
SHORT = ['引子','A','A\'','B','C','D','E','F','Coda']
def sec_of(bar):
    for i, s in enumerate(d['sections']):
        if s['startBar'] <= bar <= s['endBar']: return SHORT[i]
    return ''
L = []
def w(s=''): L.append(s)
ch = {}
for s in d['sections']:
    for c in s['chords']: ch[c['bar']] = c

w('# 参考曲分析报告：献给已逝王女的七重奏（Septette for a Dead Princess）')
w('')
w('> 参考曲：ZUN「亡き王女の為のセプテット」（东方红魔乡 6 面 BOSS 曲）')
w('> 源文件：' + d['file'].replace('\\', '/'))
w('> 目标：为《东方新纪行》EX 面拦路曲（key ex_mid）重编曲提供可执行依据 ——「红月下威严满满的蕾米莉亚」')
w('> 全部小节号/拍号/音名按**文件实际音高**与**实测小节线**给出，口径见 §1。')
w('')
w('## 0. 结论摘要')
w('')
w('| 项目 | 实测值 | 说明 |')
w('| --- | --- | --- |')
w('| BPM | 145（起始）→ **144（主体）** | 140/142 只在 8-17 小节之间；24-25 小节 rit.(124) → accelerando 回 144 |')
w('| 拍号 | 4/4（全曲唯一 time signature） | division 480，1 小节 = 1920 tick |')
w('| 小节数 | **81**（1-based） | 原 MIDI 第 0 小节是空引子，已丢弃 |')
w('| 时长 | **137.03 s** | 最后一个音符结束点；81 小节 @144BPM 纯值 135.0s，差值来自 24-25 小节的 rit./accel. |')
w('| 调性 | 前半 **Eb 小调** → 后半 **Bb 小调**；全曲拟合 Bb 小调 | K-S 相关：bars1-40 Eb min 0.89；bars49-81 Bb min 0.88-0.90；全曲 Bb min 0.85 |')
w('| 段落数 | 9 | 引子 / A / A\' / B / C / D / E / F / Coda |')
w('| 通道 | 16（13 轨有声 + 3 空/占位） | 鼓在 MIDI ch10（0-based ch9） |')
w('| 音符总数 | 7,631（含鼓 2,277） | pitched 5,354 |')
w('| 关键工程提醒 | **生成器 shift 少 440 tick** | 见 §1.1，会让整曲相对小节网格提前 0.917 拍 |')
w('')
w('**一句话**：这首曲子是「下属（Eb 小调）起步、属向（Bb 小调）收束」的结构，靠 **i 与 ♭II（Bb 与 B）的三全音张力**、'
  '**边击/军鼓的进行曲式推进**、以及 **49-64 小节管风琴+高音弦乐的圣咏**撑起威严。改编的关键不是加音量，'
  '而是把这三件事做厚，并把原曲已有的 16 分驱动（贝斯+失真吉他）与动态层次做出来。')
w('')
w('## 1. 解析口径（先看这节，否则小节号对不上）')
w('')
w('### 1.1 网格：原文件整体偏移 440 tick')
w('')
w('原 MIDI 里全部 7,631 个音符的 tickOn 都满足 tickOn ≡ 80 (mod 120)，这是一层"伪装"偏移。'
  '对 80/200/320/440 四个候选相位做了加权 onset 直方图 + 逐通道落在 8 分网格的命中率：')
w('')
w('- 只有 **440** 让底鼓（461 个）稳落在 4/4 的四个拍点上，开镲（46 个）恰好落在每拍反拍；')
w('- 逐通道最佳相位全部收敛到 440/200（ch4 弦乐、ch11 吉他在 8 分网格命中率 100%）；')
w('- 按每 10 小节分段统计，相位恒定 440，不是演奏抖动。')
w('')
w('因此：**真实小节线 = 文件小节线 + 440 tick**。换算与生成器对应关系：')
w('')
w('- 本报告：music_tick = tick - 2360；bar = floor((tick-2360)/1920)+1；beat = ((tick-2360) mod 1920)/480 + 1（拍号 1-based）。')
w('- 生成器 tools/build/_ex_arrange.py 里是 shift = bar_t[1]（= 1920）：**少了这 440 tick**。'
  '结果：生成曲相对自身小节网格整体提前 0.917 拍 —— 鼓、段首吊镲、定音鼓滚全部"抢拍"。'
  '**建议改为 shift = bar_t[1] + 440 = 2360**（改完后第 1 个音落在 bar1 第 2 拍，主旋律第一个正拍音落在 bar9 第 1 拍，段落完美对齐）。')
w('- 原文件第 0 小节完全空（引子从原第 1 小节起），所以「游戏小节号」= 原 MIDI 小节号（丢弃空小节后 1-based），共 81 小节。')
w('')
w('### 1.2 速度表（文件内 tempo map，已换算到小节）')
w('')
w('| 小节 | 起点 tick | BPM | 备注 |')
w('| --- | --- | --- | --- |')
w('| 1 | 0 | 145.0 | 起始 |')
w('| 8.25 | 17240 | 140.0 | 略慢 |')
w('| 16.25 | 31640 | 142.0 | |')
w('| 17.25 | 33560 | 145.0 | 回 145 |')
w('| 24.25 | 47000 | 124.0 | **rit.**（A\' 段末）|')
w('| 24.33-25 | 47960-49081 | 125 → 144 渐快 | accelerando |')
w('| 25-81 | 49081+ | **144.0 恒定** | 曲主体 |')
w('')
w('→ 主体是 **144 BPM**。当前生成器写死 145（快 0.7%），并丢掉了 24-25 小节的 rit.→accel.。'
  '游戏引擎若只支持恒定 BPM，请用 **144**。')
w('')
w('## 2. 曲式表')
w('')
w('| # | 段落 | 小节 | 小节数 | 起止秒 | 局部调性 | 织体特征 | 能量 |')
w('| --- | --- | --- | --- | --- | --- | --- | --- |')
FEAT = [
 '钢琴右手摇曳双音 + 左手五度/三全音 + 鼓（无贝斯、无主旋律）',
 '小号主题第一次；尼龙吉他 16 分分解；贝斯只点缀',
 'Eb 踏板 + B/C 三全音 riff（贝斯每拍 2 音）；**主旋律 19-22 小节完全休止**',
 '主题第二次；Fiddle + 第二小号副旋律对答；鼓转 32 分 hi-hat',
 '主题第三次；弦乐 16 分织体加厚；鼓型与 B 段相同',
 'D-E-F-F# 低音半音上行的展开段，旋律改在 D Lydian 色彩；失真吉他+贝斯对偶驱动',
 '**管风琴（ch14）只在这 16 小节**，与高音弦乐逐音齐奏；贝斯 16 分推进',
 '全奏高潮：钢琴/小号 18-23 音/小节 16 分密流，贝斯满 16 分',
 '鼓滚奏（58/46/51 击/小节）+ Bb 小调长延 2 小节',
]
for i, s in enumerate(d['sections']):
    w('| %d | %s | %d-%d | %d | %.2f-%.2f | %s | %s | %s |' % (
        i+1, s['name'], s['startBar'], s['endBar'], s['bars'], s['secFrom'], s['secTo'],
        s['localKey'], FEAT[i], s['energy']))
w('')
w('> 校验：9 段之和 ≈ 135.4s，加 24-25 小节 rit./accel. 与末段余量 = 137.0s。')
w('')
w('## 3. 通道映射表（16 通道，0-based）')
w('')
w('| ch | GM 音色（program） | 角色 | 音数 | 音域 | 出现小节 | 最大复音 | 当前生成器层 |')
w('| --- | --- | --- | --- | --- | --- | --- | --- |')
for c in d['channels']:
    rng = c['range']
    rg = ('%s-%s' % (rng['loName'], rng['hiName'])) if c['notes'] else '—'
    bars = ('%d-%d' % (c['bars'][0], c['bars'][1])) if c['notes'] else '—'
    w('| %d | %s | %s | %s | %s | %s | %s | %s |' % (
        c['ch'], c['gm'], c['role'], c['notes'] or '—', rg, bars, c['poly'] or '—', c['layer'] or '—'))
w('')
w('要点：')
w('')
w('- **主旋律是 ch3 Trumpet**；ch10 是它逐音相同的 -12 八度复制（586 音的 on/off/pitch 全对应）—— 原曲"铜管齐奏"实质是八度双小号。')
w('- **ch2 钢琴右手**在 9-16 与主旋律同音高重复（+12 加倍），在 65-78 变成 16 分密流（18-23 音/小节）。')
w('- **ch13 钢琴左手**贯穿全曲（B1-F6），是实际的和声铺底；引子里的低音是独立的 ch8（B2-C#4，只 1-8 小节）。')
w('- **ch11 失真吉他完全没被使用**（405 音，8-80 小节），而它正是 41-48 小节驱动的来源之一。')
w('- **ch14 管风琴只在 49-64**（112 音，F5-C#7），与 ch12 高音弦乐（220 音，49-80）同音区齐奏。')
w('- ch0 / ch15 是空占位轨。')
w('')
w('## 4. 逐小节和弦表（81 小节）')
w('')
w('罗马数字以 **Bb 小调**为参照：i=Bbm，♭II=B，ii=Cm，♭III=Db，♯III=D，iv=Ebm，v=F，♭VI=Gb，♭vii=Abm，i=Bbm。'
  '人工核对的条目在 analysis.json 里 source=curated，其余为按小节时值加权的模板匹配（confidence 字段给出匹配度）。')
w('')
w('| 小节 | 和弦 | 罗马 | 段 | 小节 | 和弦 | 罗马 | 段 | 小节 | 和弦 | 罗马 | 段 |')
w('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
rows = []
for b in range(1, 82):
    c = ch[b]
    rows.append('| %d | **%s** | %s | %s |' % (b, c['symbol'], c['roman'], sec_of(b)[:6]))
for i in range(27):
    a = rows[i]; bb = rows[i+27] if i+27 < len(rows) else '| | | | |'
    c3 = rows[i+54] if i+54 < len(rows) else '| | | | |'
    w(a[:-1] + bb[:-1] + c3[:-1] + '|')
w('')
w('和声走向要点：')
w('')
w('- **1-7 引子**：Ebm 持续（iv）；5-6 小节左手在 B1/F#2 与 F2/C#3 之间三全音摇摆 ——「B(♭II) 与 F 的三全音」是这首曲子的"阴森"基因。')
w('- **9-16 A 段**：Ebm - B - Ebm - Db - Abm - Gb - B - Ebm；B(♭II) 两次插入，Db-Abm-Gb 是 ♭III-♭vii-♭VI 下行。')
w('- **17-24 A\'**：全段 Eb 踏板，贝斯固定 D#3 + B3/C4（三全音）每拍两次，是整曲最"压迫"的 8 小节。')
w('- **25-40 B/C**：同一主题但和声换成 Db - B - B - Cm7♭5 - Abm - Gb - Gb - Bbm（4 小节一循环）——B/C 是"同一主题、两种和声"的两次推进，不是两个新主题。')
w('- **41-48 D**：低音 D-D-E-F 半音上行（45-48 再重复一次），旋律落在 D Lydian（D E F# G# A B C#），末小节停在 F/B 三全音不解决。')
w('- **49-81 E/F/Coda**：落到 **Bb 小调**，Bbm - Gbmaj7 - Bbm7 - Gm7♭5 四小节循环，末段停在 Bb-Db-F。')
w('')
def melody_table(name, title, intro_line):
    m = d['motifs'][name]
    w('### %s（ch%d，%d-%d 小节，共 %d 音）' % (title, m['ch'], m['barFrom'], m['barTo'], m['count']))
    w('')
    w(intro_line)
    w('')
    w('| 小节 | 第1拍 | 第2拍 | 第3拍 | 第4拍 |')
    w('| --- | --- | --- | --- | --- |')
    bybar = {}
    for n in m['notes']:
        bar, beat, pitch, dur, vel = n
        bybar.setdefault(bar, []).append((beat, pitch, dur))
    for bar in sorted(bybar):
        cols = [''] * 4
        for (beat, pitch, dur) in sorted(bybar[bar]):
            slot = min(3, int((beat - 1) // 1))
            txt = '%s(%g)' % (nm(pitch), dur)
            if abs(beat - 1 - slot) > 0.01: txt = '@%g ' % round(beat - 1, 2) + txt
            cols[slot] = (cols[slot] + ' ' + txt).strip()
        w('| %d | %s | %s | %s | %s |' % (bar, cols[0] or '·', cols[1] or '·', cols[2] or '·', cols[3] or '·'))
    w('')
w('## 5. 主题旋律逐音（最核心的 8 小节，改编必须逐音照搬）')
w('')
melody_table('themeA', '主题 A（小号主旋律，第一次出现）',
  '括号内是**时值（拍）**；@x 表示音头不在整拍上（x = 相对小节头的拍偏移）。第 8 小节只有第 4 拍后半的 pickup Bb4（A#4）。')
melody_table('intro_rocking', '引子：钢琴摇曳双音动机',
  '引子最标志性的"钟摆"：右手在 Gb/Bb（F#4/A#4）与 Bb/Gb（A#4/F#5）两个双音之间来回摇摆，左手 Eb/Bb 五度（ch13），每 2 小节一循环；第 2 拍还落 F5→Ab4 的下行落句。')
melody_table('bridge_D', 'D 段展开旋律（41-48）',
  '低音 D-D-E-F 半音上行时的旋律；第 44 小节停在 B4-C#5，对应 F/B 三全音。')
melody_table('organ_E', 'E 段管风琴圣咏（49-56，前 8 小节）',
  '管风琴（ch14）与高音弦乐（ch12）逐音齐奏，原曲最"教堂/庄严"的素材，改编时应给最厚的配器。')
w('')
w('其余素材（完整逐音见 analysis.json 的 motifs）：')
w('')
w('| key | 内容 | 小节 | 音数 |')
w('| --- | --- | --- | --- |')
for k, m in d['motifs'].items():
    w('| %s | %s | %d-%d | %d |' % (k, m['name'], m['barFrom'], m['barTo'], m['count']))
w('')
open(os.path.join(OUT, 'REPORT.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('REPORT part1 lines', len(L), 'bytes', os.path.getsize(os.path.join(OUT, 'REPORT.md')))
