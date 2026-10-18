#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/build_extra_ending.py —— 《魔法少女達の百年祭》8-bit 柔和版（EXTRA 结局 W1/W2 专用 BGM）

流程：
  1) 用 tools/midi2js.py 自带的 MIDI 解析器读 ZUN 原版 MIDI
     （touhou-midi-collection / 6 - The Embodiment of Scarlet Devil /
      14. The Centennial Festival for Magical Girls (ZUN).mid）；
  2) 走 midi2js 的通用编排（选声部 / 循环窗口 / 移调 / 鼓组抽稀）；
  3) 再做一层「柔和化」后期处理，这一步是本脚本存在的理由：
       · 时间拉伸 1.25×：149 BPM → ~119 BPM，句子放宽，不赶；
       · 整体降 2 个半音：主旋律中位从 77 落到 75，高音不刺耳；
       · 主音色 = 方波 + 同度三角波混合（保留 8-bit 辨识度，削掉方波的硬边）；
       · 贝斯三角波、内声部正弦长音（不用方波，去掉毛刺）；
       · 鼓只留底鼓 + 军鼓，力度 ×0.55，闭镲/开镲/吊镲全删（那三种是噪声抽头，最扎耳）；
       · 旋律力度 ×0.86，整首比 BOSS 曲低一档；
  4) 写 src/engine/songs/extra_ending.js，歌曲带 soft: true，
     由 audio.js 的「柔和总线」（低通 + 短回声）再兜一层。

用法：
    python tools/build_extra_ending.py            # 生成并写文件
    python tools/build_extra_ending.py --check    # 只打印自检，不写文件
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import midi2js as M

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'extra_ending.js')

MIDI_PATH = os.path.join(
    r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main',
    '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
    '14. The Centennial Festival for Magical Girls (ZUN).mid')

# --- 柔和化参数 -------------------------------------------------------------
TIME_STRETCH = 1.25   # 149 BPM → ≈119 BPM
TRANSPOSE = -2        # 降两个半音，音色更暖
VEL_LEAD = 0.82       # 主旋律力度
VEL_DRUM = 0.48       # 鼓力度
DRUM_KEEP = (0, 1)    # 0=底鼓 1=军鼓；2/3/4 是噪声抽头，柔和版不要

# 循环窗口：第 17 小节 → 第 41 小节。
# 原曲结构（每小节 1.611s、149 BPM）：
#   第 1–8 小节  只有 8 分音符琶音动机，无鼓无贝斯（原曲的真正引子）
#   第 9 小节    底鼓 + 贝斯进，进入 A 段
#   第 17–19 小节 间奏（只剩贝斯 + 内声部，留白）
#   第 20–21 小节 半音上行过门
#   第 22 小节   ★ 主题旋律（A#5 A5 A#5 C6 A#5 A5 F5 …），百年祭最抓耳的一句
#   第 34 小节   B 句，第 40 小节半音上行过门
#   第 41 小节   回到琶音段
# 结局曲从第 17 小节起循环：开头几秒留白（柔和版正好当个喘息），
# 再过门进主题旋律（约第 10 秒出现），B 句 + 过门之后接回开头，循环自然。
BAR = 60.0 / 149.0 * 4
WINDOW = (round(BAR * 17, 3), round(BAR * 41, 3))

SONG = dict(
    key='endingW',
    title='魔法少女達の百年祭 ～ 8bit 柔和版',
    file=os.path.basename(MIDI_PATH),
    arrange=dict(
        lead_chs=[2],        # prog 80 square lead（ZUN 版主旋律）
        bass_ch=1,           # prog 36 贝斯
        harm_chs=[3],        # prog 0 内声部（钢琴和弦）
        window=WINDOW,
        transpose=TRANSPOSE,
        # 每 250ms 桶上限：底鼓 1、军鼓 1，其余全砍
        drum_limits={0: 1, 1: 1, 2: 0, 3: 0, 4: 0},
    ),
)


def stretch(notes, s, vel_scale=1.0):
    out = []
    for n in notes:
        t = round(n['t'] * s, 3)
        d = max(0.04, round(n['d'] * s, 3))
        v = max(16, min(127, int(round(n['v'] * vel_scale))))
        out.append([t, n['m'], d, v])
    out.sort(key=lambda x: (x[0], x[1]))
    return out


def js_notes(notes):
    return '[' + ','.join('[%s,%d,%s,%d]' % (M.num(t), m, M.num(d), v)
                          for (t, m, d, v) in notes) + ']'


def main():
    check_only = '--check' in sys.argv
    if not os.path.exists(MIDI_PATH):
        raise SystemExit('!! 找不到 MIDI: %s' % MIDI_PATH)

    midi = M.parse_midi(MIDI_PATH)
    chans, segs, div = M.extract_channels(midi)
    print('MIDI: %s' % os.path.basename(MIDI_PATH))
    print('  bpm=%.1f division=%d 通道=%s' % (M.bpm_of(segs), div, sorted(chans.keys())))

    data = M.build_song(SONG, chans, segs, limit=160 * 1024)
    for r in data['reasons']:
        print('  ' + r.strip())

    lead_src = data['tracks'][0]['notes']
    bass_src = data['tracks'][1]['notes']
    harm_src = data['tracks'][2]['notes'] if len(data['tracks']) > 2 else []

    lead = stretch(lead_src, TIME_STRETCH, VEL_LEAD)
    bass = stretch(bass_src, TIME_STRETCH, 0.92)
    harm = stretch(harm_src, TIME_STRETCH, 0.80)

    drums = [(round(d[0] * TIME_STRETCH, 3), d[1],
              max(16, min(127, int(round(d[2] * VEL_DRUM)))))
             for d in data['drums'] if d[1] in DRUM_KEEP]
    drums.sort()

    end = 0.0
    for notes in (lead, bass, harm):
        if notes:
            end = max(end, max(t + d for (t, _m, d, _v) in notes))
    if drums:
        end = max(end, drums[-1][0])
    duration = round(end + 0.35, 3)

    bpm = round(149.0 / TIME_STRETCH)

    tracks = [
        # 主旋律：方波为主，三角波同度叠加 → 还是有 8-bit 的芯，但边缘是软的
        ("lead", 'square', 0.062, lead),
        ("lead-soft", 'triangle', 0.056, lead),
        ("bass", 'triangle', 0.095, bass),
        ("pad", 'sine', 0.032, harm),
    ]

    print('\n柔和化结果：')
    print('  时长 %.2fs / %d BPM（原 149）/ 移调 %+d 半音 / 鼓 %d 击'
          % (duration, bpm, TRANSPOSE, len(drums)))
    for name, wave, gain, notes in tracks:
        ms = [n[1] for n in notes]
        print('  %-9s %-8s gain=%.3f notes=%-5d 音域 %s..%s'
              % (name, wave, gain,
                 len(notes), min(ms) if ms else '-', max(ms) if ms else '-'))

    body = []
    for name, wave, gain, notes in tracks:
        body.append("      // %s\n      { wave: '%s', gain: %s, notes: %s }"
                    % (name, wave, M.num(gain), js_notes(notes)))
    drums_js = '[' + ','.join('[%s,%d,%d]' % (M.num(t), k, v) for (t, k, v) in drums) + ']'

    header = '''/**
 * EXTRA 结局（W1 灵梦 / W2 魔理沙）专用 BGM ——《魔法少女達の百年祭》8-bit 柔和版。
 *
 * 数据格式见 src/engine/songs/index.js 顶部注释。
 * 由 tools/build_extra_ending.py 从 ZUN 原版 MIDI 提取后做柔和化处理，勿手改。
 *
 * 柔和化处理（相对 BOSS 曲的做法）：
 * - 时间拉伸 %.2f×：149 BPM → %d BPM，乐句放宽；
 * - 整体移调 %+d 半音，主旋律不再挂在刺耳的高音区；
 * - 主音色 = 方波 + 同度三角波叠加（保留 8-bit 芯，削掉硬边），增益比 BOSS 曲低一档；
 * - 贝斯三角波、内声部正弦长音；
 * - 鼓只留底鼓 / 军鼓，力度 ×%.2f，闭镲 / 开镲 / 吊镲全删；
 * - soft: true → audio.js 的柔和总线再兜一层（低通 + 短回声）。
 *
 * 循环窗口：原曲第 9–40 小节（A 段 → 主题旋律 → B 句 → 半音过门），
 * 第 41 小节起回到琶音段，所以过门之后从头接 A 段，循环自然。
 */

export const EXTRA_ENDING = {
  endingW: {
    // %s
    title: '%s',
    soft: true,
    duration: %s,
    bpm: %d,
    tracks: [
%s
    ],
    drums: %s,
  },
};
''' % (TIME_STRETCH, bpm, TRANSPOSE, VEL_DRUM,
       ' | '.join(r.strip() for r in data['reasons'][:3]),
       SONG['title'], M.num(duration), bpm, ',\n'.join(body), drums_js)

    if check_only:
        print('\n--check：不写文件（生成 %d 字节）' % len(header.encode('utf-8')))
        return

    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(header)
    print('\n写入 %s：%.1f KB' % (OUT_JS, len(header.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
