# -*- coding: utf-8 -*-
"""NETWORK_CN 行级替换 + 版本串（v2 收尾第二步）。"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
def P(*a): return os.path.join(ROOT, *a)
BT = chr(96)
NEW_VER, OLD_VER = '1.6.56', '1.6.55'

p = P('docs/NETWORK_CN.md')
ls = io.open(p, encoding='utf-8').read().split(chr(10))

def find(pref, n=1):
    hit = [i for i, l in enumerate(ls) if l.startswith(pref)]
    assert len(hit) == n, (pref, hit)
    return hit[0]

i = find('### 3.2 预渲染 BGM 转 MP3')
ls[i] = '### 3.2 预渲染 BGM 转 MP3（4 首）'

i = find('| ' + BT + 'remilia_septette' + BT + ' |')
ls[i] = ('| ' + BT + 'remilia_septette' + BT + ' | EXTRA 中段（七重奏） | —（母版 26,223,316 B 不入库） | **3,182,409 B** |')

i = find('| 合计 | |')
ls[i] = '| 合计 | | 21,571,206 B | **8,796,139 B（−59.2%）** |'

i = find('- 脚本：' + BT + 'python tools/optimize_audio_mp3.py' + BT)
ls[i] = ('- 脚本：' + BT + 'python tools/optimize_audio_mp3.py' + BT + '。前三首源是 22.05 kHz 单声道母版，用 MPEG-2 Layer III / 单声道 / VBR ≈ 91 kbps；'
         + BT + 'remilia_septette' + BT + ' 的母版是 44.1 kHz 立体声，改走 MPEG-1 Layer III / 192 kbps CBR（帧长 1152、side info 32 B），'
         'LAME tag 的 padding 要跟着补 ' + BT + 'spf − delay' + BT + ' 的差（MPEG-1 多 576），才能解出和母版一模一样的采样数。')

hit = [k for k, l in enumerate(ls) if '49 pass / 0 fail' in l]
assert len(hit) == 1, hit
ls[hit[0]] = ('- 关键在于**别让循环接缝变形**：lame 默认不写 Xing/Info 头，播放器只能猜时长；这里自己构造 Xing/Info + LAME tag，'
  '按 ' + BT + 'n = spf × 帧数 − delay − padding' + BT + ' 反解精确 padding（MPEG-2 spf=576、MPEG-1 spf=1152）、TOC 用真实帧偏移。'
  '验收（' + BT + 'node tools/verify_audio_mp3.mjs' + BT + '，4 首 65 pass / 0 fail）：')

i = find('  - Edge ' + BT + 'decodeAudioData' + BT)
ls[i] = '  - Edge ' + BT + 'decodeAudioData' + BT + ' 时长差 **0.000000 s**、采样数差 **0**（22050 native、44100 native、48000 三种 context 都比过）；'

i = find('  - 与 WAV 互相关 lag = 0')
ls[i] = '  - 与 WAV 互相关 lag = 0、corr 0.9994–0.99998（remilia 立体声 0.9999）；'

i = find('  - ' + BT + 'AudioBufferSourceNode.loop = true' + BT)
ls[i] = ('  - ' + BT + 'AudioBufferSourceNode.loop = true' + BT + ' 真实循环渲染，跨边界 SNR 25.0–30.0 dB，'
         '跳变与 WAV 同量级（且低于该曲平均相邻样本跳变，没有咔哒声）。')

i = find('- 运行时只改 ' + BT + 'src/engine/songs/index.js' + BT)
ls[i] = ('- 运行时只改 ' + BT + 'src/engine/songs/index.js' + BT + ' 的四行 ' + BT + 'audio' + BT + ' 路径；'
  + BT + 'audio.js' + BT + ' 一行没动（解码失败自动回退合成曲的 ' + BT + 'catch' + BT + ' 本来就覆盖了）。'
  '三首单声道 WAV 母版仍在仓库里；' + BT + 'remilia_septette' + BT + ' 的 44.1kHz 立体声母版 26,223,316 B（25.01 MiB）'
  '超过 Cloudflare Pages 单文件 25 MiB 上限，只留 MP3，母版放在 ' + BT + 'tools/build/_remi_kit/' + BT + '（不进版本库），'
  '重编 MP3 时脚本会自动回落到这份母版。')

i = find('| BGM MP3 |')
ls[i] = ls[i].replace('三行 ' + BT + 'audio' + BT, '四行 ' + BT + 'audio' + BT)

io.open(p, 'w', encoding='utf-8', newline='').write(chr(10).join(ls))
print('[NETWORK_CN] 8 行替换完成')

# ---------- version bump ----------
BUMPS = [('index.html', '?v=' + OLD_VER, '?v=' + NEW_VER), ('src/ui/platform.js', OLD_VER, NEW_VER),
         ('sw.js', OLD_VER, NEW_VER), ('src/engine/songs/index.js', OLD_VER, NEW_VER)]
for rel, old, new in BUMPS:
    q = P(rel)
    s = io.open(q, encoding='utf-8').read()
    c = s.count(old)
    assert c > 0, rel
    io.open(q, 'w', encoding='utf-8', newline='').write(s.replace(old, new))
    print('[ver] %s %d' % (rel, c))
print('[done]')
