# -*- coding: utf-8 -*-
"""v2 收尾补丁：README 波峰因数、i18n 旧键清理、NETWORK_CN、版本串。"""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
def P(*a): return os.path.join(ROOT, *a)
BT = chr(96)
NEW_VER, OLD_VER = '1.6.56', '1.6.55'

# ---------- 1. README creast ----------
rd_p = P('README.md')
rd = io.open(rd_p, encoding='utf-8').read()
ls = rd.split(chr(10))
hit = [i for i, l in enumerate(ls) if l.startswith('  - EXTRA 中段《亡き王女の為のセプテット')]
assert len(hit) == 1, hit
b = ls[hit[0]]
if '波峰因数 13.38' in b:
    ls[hit[0]] = b.replace('波峰因数 13.38', '波峰因数 10.37')
else:
    print('[README] crest 已是 10.37，跳过')
io.open(rd_p, 'w', encoding='utf-8', newline='').write(chr(10).join(ls))
print('[README] crest 13.38 -> 10.37')

# ---------- 2. i18n 旧 note 键 ----------
MARK = '一百四十五'
for name in ('en', 'ja', 'zh-hant'):
    p = P('src/i18n/packs/%s.js' % name)
    s = io.open(p, encoding='utf-8').read()
    lines2 = s.split(chr(10))
    drop = [i for i, l in enumerate(lines2) if l.startswith('  "EXTRA 中段') and MARK in l]
    assert len(drop) == 1, (name, drop)
    kept = [l for i, l in enumerate(lines2) if i not in drop]
    s2 = chr(10).join(kept)
    io.open(p, 'w', encoding='utf-8', newline='').write(s2)
    print('[i18n] %s 删除旧 note 键 1 条，现 keys=%d' % (name, s2.count(chr(10) + '  "')))

# ---------- 3. NETWORK_CN ----------
nc_p = P('docs/NETWORK_CN.md')
nc = io.open(nc_p, encoding='utf-8').read()
def r1(pat, new, flags=0):
    global nc
    ms = list(re.finditer(pat, nc, flags))
    assert len(ms) == 1, (pat, len(ms))
    nc = nc[:ms[0].start()] + new + nc[ms[0].end():]

r1(r'### 3\.2 预渲染 BGM 转 MP3（3 首，−15\.0 MB）', '### 3.2 预渲染 BGM 转 MP3（4 首）')
r1(r'\| ' + BT + r'remilia_septette' + BT + r' \| EXTRA 中段（七重奏） \| [0-9,]+ B \| \*\*[0-9,]+ B\*\* \|',
   '| ' + BT + 'remilia_septette' + BT + ' | EXTRA 中段（七重奏） | —（母版 26,223,316 B 不入库） | **3,182,409 B** |')
r1(r'\| 合计 \| \| [0-9,]+ B \| \*\*[0-9,]+ B（−[0-9.]+%）\*\* \|',
   '| 合计 | | 21,571,206 B | **8,796,139 B（−59.2%）** |')
r1(r'- 脚本：' + BT + r'python tools/optimize_audio_mp3\.py' + BT + r'（MPEG-2 Layer III / 22050 Hz / 单声道 / VBR ≈ 91\.8 kbps）\.源是 22\.05 kHz 单声道母版，所以用 MPEG-2 L3，不用 44\.1k 的 MPEG-1。',
   '- 脚本：' + BT + 'python tools/optimize_audio_mp3.py' + BT + '。前三首源是 22.05 kHz 单声道母版，用 MPEG-2 Layer III / 单声道 / VBR ≈ 91 kbps；'
   + BT + 'remilia_septette' + BT + ' 的母版是 44.1 kHz 立体声，改走 MPEG-1 Layer III / 192 kbps CBR（帧长 1152、side info 32 B），'
   'LAME tag 的 padding 要跟着补 ' + BT + 'spf − delay' + BT + ' 的差，才能解出和母版一模一样的采样数。')
r1(r'验收（' + BT + r'node tools/verify_audio_mp3\.mjs' + BT + r'，49 pass / 0 fail）：',
   '验收（' + BT + 'node tools/verify_audio_mp3.mjs' + BT + '，4 首 65 pass / 0 fail）：')
assert nc.count('0.9994–0.99998') == 1
nc = nc.replace('0.9994–0.99998', '0.9994–0.99998（remilia 立体声 0.9992）')
assert nc.count('跨边界 SNR 25.0–26.2 dB') == 1
nc = nc.replace('跨边界 SNR 25.0–26.2 dB', '跨边界 SNR 25.0–30.0 dB')
old_tail = '- 运行时只改 ' + BT + 'src/engine/songs/index.js' + BT + ' 的三行 ' + BT + 'audio' + BT + ' 路径'
assert nc.count(old_tail) == 1
i0 = nc.index(old_tail)
i1 = nc.index('。', nc.index('三首 WAV 母版仍在仓库里。', i0)) + 1
nc = nc[:i0] + ('- 运行时只改 ' + BT + 'src/engine/songs/index.js' + BT + ' 的四行 ' + BT + 'audio' + BT + ' 路径；'
   + BT + 'audio.js' + BT + ' 一行没动（解码失败自动回退合成曲的 ' + BT + 'catch' + BT + ' 本来就覆盖了）。'
   '三首单声道 WAV 母版仍在仓库里；' + BT + 'remilia_septette' + BT + ' 的 44.1kHz 立体声母版 26,223,316 B（25.01 MiB）'
   '超过 Cloudflare Pages 单文件 25 MiB 上限，只留 MP3，母版放在 ' + BT + 'tools/build/_remi_kit/' + BT + '（不进版本库），'
   '重编 MP3 时脚本会自动回落到这份母版。') + nc[i1:]
io.open(nc_p, 'w', encoding='utf-8', newline='').write(nc)
print('[NETWORK_CN] ok')

# ---------- 4. version bump ----------
BUMPS = [('index.html', '?v=' + OLD_VER, '?v=' + NEW_VER), ('src/ui/platform.js', OLD_VER, NEW_VER),
         ('sw.js', OLD_VER, NEW_VER), ('src/engine/songs/index.js', OLD_VER, NEW_VER)]
for rel, old, new in BUMPS:
    p = P(rel)
    s = io.open(p, encoding='utf-8').read()
    c = s.count(old)
    assert c > 0, rel
    io.open(p, 'w', encoding='utf-8', newline='').write(s.replace(old, new))
    print('[ver] %s %d' % (rel, c))
print('[done]')
