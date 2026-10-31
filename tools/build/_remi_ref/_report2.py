# -*- coding: utf-8 -*-
import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='ascii', errors='replace')
OUT = r'C:\Users\GuSheng\Downloads\HKS\tools\build\_remi_ref'
d = json.load(open(os.path.join(OUT, 'analysis.json'), encoding='utf-8'))
L = []
def w(s=''): L.append(s)
CN = {'kick':'底鼓','snare':'军鼓','sidestick':'边击','esnare':'电子军鼓','lowtom':'落地鼓','tom':'中音鼓',
      'hitom':'高音鼓','hh_closed':'闭 hi-hat','hh_pedal':'踏 hi-hat','hh_open':'开 hi-hat','crash':'吊镲','ride':'ride'}
w('## 6. 鼓组（ch9，GM 鼓，全部按 16 分格 = 每小节 16 格，数字 0-15，0 = 第 1 拍正拍）')
w('')
w('原曲鼓组只用 8 个音高：底鼓 461、军鼓 360、边击 172、闭镲 837、开镲 235、ride 41、落地鼓 41、吊镲 16、高音鼓 32 —— **没有定音鼓音色**。')
w('')
for name, dp in d['drumPatterns'].items():
    w('### %s（%d-%d，%d 小节）' % (name, dp['barFrom'], dp['barTo'], dp['bars']))
    w('')
    w('| 乐器 | 每小节平均 | 稳定出现的 16 分位置 |')
    w('| --- | --- | --- |')
    for inst, p in sorted(dp['pattern'].items(), key=lambda kv: -sum(kv[1]['perBar'])):
        pb = p['perBar']
        if sum(pb) < 0.3: continue
        avg = sum(pb) / 16.0 * 16.0
        tot = sum(pb)
        pos = p['sixteenths']
        w('| %s | %.2f | %s |' % (CN.get(inst, inst), sum(pb) / float(dp['bars']) if False else (sum(pb)), ' '.join(str(x) for x in pos) if pos else '（无稳定位置）'))
    w('')
w('> 说明：表格第二列是该段"平均每小节击打次数"（同一 16 分位置多次出现会累加），'
  '第三列是出现率 ≥50% 的 16 分位置。')
w('')
w('**各段鼓型要点（实测）**')
w('')
w('- **引子 1-7**：没有底鼓也没有军鼓 —— 只有闭镲 14/小节（全 16 分）+ 开镲 1.3 + 边击 1.7。这是"钟表/心跳"式的铺垫，改编时不要提前进鼓。')
w('- **A 9-16**：kick 5.5/小节、边击 6.6/小节（落在 1,2,7,8,10,12 号 16 分 = 正拍与反拍的进行曲重音）、军鼓 2.1、闭镲 12.9、开镲 3.1。**边击 = 进行曲庄严感的核心，不能丢。**')
w('- **A\' 17-24**：边击消失（0.12）、军鼓升到 3.1、开镲 4.8、闭镲降到 6.0 —— 从"进行曲"换成"重踩"，配合三全音 riff。')
w('- **B 25-32 / C 33-40**：kick 7.1/小节、边击 6.4、军鼓 2.5、闭镲 11.9、开镲 4.1、ride 2.3；第 28/32/36/40 小节有 16 分 fill。')
w('- **D 41-48**：kick 7.9/小节（几乎全 8 分）、军鼓 6.0（正拍密集）、闭镲 7.0、吊镲 1.1/小节 —— 最"重"的 8 小节。')
w('- **E 49-64 / F 65-78**：kick 5.9-6.0、军鼓 6.8-7.0、闭镲 9.9-10.0、开镲 1.9-2.0（开镲减少 = 更"重"更闷）。')
w('- **Coda 79-81**：军鼓 7.7、电子军鼓 9.7、落地鼓 5.0、中音鼓 3.0、吊镲 8.7、hi-hat 9.0 —— 全曲唯一的鼓滚奏段（每小节 46-58 击）。')
w('')
w('## 7. 「威严」到底怎么落地（可直接执行）')
w('')
for i, n in enumerate(d['arrangementNotes'], 1):
    w('### 7.%d %s' % (i, n['title']))
    w('')
    w(n['detail'])
    w('')
w('## 8. 当前 13 轨版本（src/engine/songs/septette_ex.js）的问题清单')
w('')
w('| # | 问题 | 证据（实测） | 建议 |')
w('| --- | --- | --- | --- |')
PR = [
 ('抢戏', 'ch2 钢琴在 65-78 每小节 18-23 音（16 分密流），当前 piano gain .038 + max_dur2.0', 'F 段把 piano 降到 .026 并 max_dur 收到 1.2；主旋律让给 lead/lead8'),
 ('织体糊', '41-48 同时有 ch1(16 分)+ch11(16 分)+ch4(16 分)+ch5(15 音) 满密度叠层', 'D 段只保留 ch1+ch11+ch3，ch5 琶音在第 40 小节后 fade 掉'),
 ('低频混', 'bass(ch1, .062) 与 sub(ch1,-12, sine .014) 同源同相', 'sub 改 trig/sine 但 -12 且 gain .008，或换成 16 尺踏板（Eb1/Bb1）只在 49-81 出现'),
 ('高频刺', 'lead=sawtooth 在 ch3 最高 F7（2794Hz）', 'lead 改 triangle+saw 混合，或整体 -12 八度演奏'),
 ('动态平', 'dyn 全程 0.92-1.10（约 1.5dB）', '改成 0.70/0.82/0.92/1.02/1.10/1.18 六档（见 7.9）'),
 ('缺 ch11', 'Distortion Guitar 405 音完全未用', '新增 gtr 层 square/saw .032，poly2，只 8-80 小节'),
 ('鼓被削弱', 'thin_hats 隔一丢一 + 只留四分底鼓，边击层丢失', '单独保留 sidestick 层；kick 至少 8 分'),
 ('时间网格', 'shift=1920，实测应为 2360', '改 shift = bar_t[1] + 440'),
 ('段首镲过多', '11 个段首各一记 v104 吊镲', '减到 5 个（1/25/41/49/65），v88-96'),
 ('时长多 2 小节', 'duration_bars=83 vs 实测 81 小节', '按 81 小节收，末小节 Bb 和弦直接留到循环点'),
]
for i, (a, b_, c) in enumerate(PR, 1):
    w('| %d | %s | %s | %s |' % (i, a, b_, c))
w('')
w('## 9. 存疑 / 未证实项（请勿当作定论引用）')
w('')
w('1. **调性的"两种说法"都成立**：前半 40 小节拟合 Eb 小调（0.89），后半拟合 Bb 小调（0.88-0.90）。'
  '既可描述为"Eb 小调 → 升五度到 Bb 小调"，也可描述为"以 iv 起、以 i 收的单调性曲子（Bb 小调）"。'
  '本报告采用后者做罗马数字（i=Bbm），但在段落地图里同时标注局部调性。')
w('2. **网上钢琴谱常记作 D 小调**，本文件比之低 4 个半音（Dm → Bbm）。无法确认这是原曲音高还是转录者移调；本报告一律按文件实际音高。')
w('3. **E 段（49-64）的单小节和弦标记可信度较低**：上层是管风琴+高音弦乐的浮动声部，低音是 F/F#/G#/A# 的 16 分推进，'
  '单小节三和弦只能近似（analysis.json 里这些条的 confidence 偏低）。和声走向宜按"4 小节一循环的 Bbm-Gbmaj7-Bbm7-Gm7♭5"理解。')
w('4. **44 小节的 B/F 三全音**：低音在 F3/B3 之间交替，旋律 B4-C#5，按 B 大三和弦还是 F 增三和弦都能解释，本报告标为 B/F。')
w('5. **定音鼓**：原曲鼓组没有定音鼓音色，本报告 §7 的定音鼓写法是按"庄严化"需求提出的建议，不是原曲事实。')
w('6. **24-25 小节的 rit./accel.** 在 124-144 BPM 之间连续变化（tempo map 有 26 个事件），精确复现需要引擎支持 tempo 曲线；'
  '若引擎只支持恒定 BPM，这段会损失约 2 秒的时间感。')
w('')
w('## 10. 数据文件与复现方式')
w('')
w('| 文件 | 内容 |')
w('| --- | --- |')
w('| analysis.json | 本报告的全部机器可读数据（bpm/tempoMap/channels/sections+chords/motifs 逐音/drumPatterns/arrangementNotes） |')
w('| REPORT.md | 本报告 |')
w('| _build2.py | 解析 + 统计 + 生成 analysis.json（含和弦模板匹配） |')
w('| _fix1.py | 用人工核对的和弦覆盖 1-48 等小节，并写入 arrangementNotes |')
w('| _report1.py / _report2.py | 生成 REPORT.md 前后两半 |')
w('| _probeH.py/_probeI.py/_probeJ.py/_probeK.py/_probeL.py/_probeM.py/_probeN.py/_probeO.py | 相位/和声/旋律/鼓/调性探测脚本 |')
w('| ../_exsr_ref/_midilib.py | 自写 MIDI 解析器（parse_file/build_grid/notes/tick_to_sec） |')
w('')
w('复现：python tools/build/_remi_ref/_build2.py && python tools/build/_remi_ref/_fix1.py && python tools/build/_remi_ref/_report1.py && python tools/build/_remi_ref/_report2.py')
w('')
w('---')
w('')
w('*分析口径：division 480，4/4，SHIFT=2360，bar/beat 均 1-based；音名按文件实际音高，♭/♯ 记法混用（C#/Db 同音时按调性偏好选择）。*')
p = os.path.join(OUT, 'REPORT.md')
cur = open(p, encoding='utf-8').read()
open(p, 'w', encoding='utf-8').write(cur + '\n'.join(L) + '\n')
print('total bytes', os.path.getsize(p))
