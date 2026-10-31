# -*- coding: utf-8 -*-
"""v2 文档/接入收尾（修订版）：musicTracks note + i18n 三语 + README + NETWORK_CN + 版本串。
母版 44.1kHz 立体声 WAV 不入库（超 Cloudflare Pages 单文件 25 MiB），只发 MP3。"""
import io, os, re, json
import numpy as np
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
def P(*a): return os.path.join(ROOT, *a)

NEW_VER = '1.6.56'
OLD_VER = '1.6.55'
BT = chr(96)

ZH = json.load(io.open(P('tools/build/_remi_lead/_note_v2.json'), encoding='utf-8'))['zh']
EN = json.load(io.open(P('tools/build/_remi_lead/_note_v2_en.json'), encoding='utf-8'))['en']
JA = json.load(io.open(P('tools/build/_remi_lead/_note_v2_ja.json'), encoding='utf-8'))['ja']
import opencc
ZHT = opencc.OpenCC('s2twp').convert(ZH)

MET = json.load(io.open(P('tools/build/_remi_kit/metrics_stereo_final.json'), encoding='utf-8'))
MASTER = P('tools/build/_remi_kit/remilia_septette_stereo.wav')
assert os.path.exists(MASTER), MASTER
master_bytes = os.path.getsize(MASTER)
MP3P = P('src/assets/bgm/remilia_septette.mp3')
mp3_bytes = os.path.getsize(MP3P)

with wave.open(MASTER, 'rb') as w:
    nch, sr, nfr = w.getnchannels(), w.getframerate(), w.getnframes()
    raw = w.readframes(nfr)
x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0
assert nch == 2 and sr == 44100, (nch, sr)
X = x.reshape(-1, 2)
rms_total = float(np.sqrt(np.mean(X * X)))          # 左右总功率
rms_ch = float(np.sqrt(np.mean(X ** 2, axis=0)).mean())
peak = float(np.abs(X).max())
crest = 20 * np.log10(peak / rms_total)
print('[master] %d B / %d fr / %.3fs / %dch@%d / peak %.4f / rms %.2f dB / rms_ch %.2f / crest %.2f'
      % (master_bytes, nfr, nfr / sr, nch, sr, peak, 20*np.log10(rms_total), 20*np.log10(rms_ch), crest))

SECS = json.load(io.open(P('tools/build/_remi_lead/secs.json'), encoding='utf-8'))
DUR = SECS['_dur']
mono = X.mean(axis=1)
segs = []
for name, span in SECS.items():
    if name.startswith('_'):
        continue
    t0, t1 = span
    a = mono[int(t0 * sr):int(min(t1, DUR) * sr)]
    segs.append((name, 20 * np.log10(np.sqrt(np.mean(a * a)) + 1e-12)))
seg_txt = ' / '.join('%s %.2f' % (n, v) for n, v in segs)
print('[segs]', seg_txt)

mp3_kbps = mp3_bytes * 8 / DUR / 1000
SEAM = MET['seam']; CORR = MET['corr']; WIDTH = MET['width_db']; CENTROID = MET['centroid_hz']

def esc(s):
    return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

# ---------- 1. musicTracks note ----------
mt_p = P('src/game/musicTracks.js')
mt = io.open(mt_p, encoding='utf-8').read()
i0 = mt.index("    key: 'ex_mid',")
i1 = mt.index("\n  },", i0)
block = mt[i0:i1]
m = re.search(r"note:\s*(.*)$", block, re.S)
literals = re.findall(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", m.group(1), re.S)
old_parts = [a if a else b for a, b in literals]
def unesc(s):
    out = []; i = 0
    while i < len(s):
        c = s[i]
        if c == '\\' and i + 1 < len(s):
            n = s[i+1]
            out.append({'n': '\n', 't': '\t', "'": "'", '"': '"', '\\': '\\'}.get(n, n)); i += 2
        else:
            out.append(c); i += 1
    return ''.join(out)
old_note = ''.join(unesc(s) for s in old_parts)
new_block = ("    key: 'ex_mid',\n    no: '15',\n    title: '献给已逝王女的七重奏',\n    sub: '雷米莉亚·斯卡雷特 · 拦路',\n"
             "    cat: 'EXTRA · 中段',\n    place: '红魔馆地下 · 血月水晶',\n"
             "    orig: '原曲「献给已逝王女的七重奏」/ 作曲：ZUN / 编曲：Miku523（逐音搬入重配器）',\n"
             "    tone: '#c8a0ff',\n    glow: '200, 160, 255',\n    time: 148.7,\n    note:\n")
parts = ZH.split('\n')
for k, p in enumerate(parts):
    lit = "      '%s'" % esc(p).replace("\\'", "'")
    new_block += lit + (" +\n" if k < len(parts) - 1 else ",\n")
mt2 = mt[:i0] + new_block + mt[i1+1:]
io.open(mt_p, 'w', encoding='utf-8', newline='').write(mt2)
print('[musicTracks] note %d -> %d chars' % (len(old_note), len(ZH)))

# ---------- 2. i18n packs ----------
old_key = '  "%s": ' % esc(old_note)
for name, val in (('en', EN), ('ja', JA), ('zh-hant', ZHT)):
    p = P('src/i18n/packs/%s.js' % name)
    s = io.open(p, encoding='utf-8').read()
    lines = s.split('\n')
    kept = [l for l in lines if not l.startswith(old_key)]
    removed = len(lines) - len(kept)
    s2 = '\n'.join(kept)
    entry = '  "%s": "%s",\n' % (esc(ZH), esc(val))
    idx = s2.rindex('};')
    s2 = s2[:idx] + entry + s2[idx:]
    io.open(p, 'w', encoding='utf-8', newline='').write(s2)
    print('[i18n] %s removed=%d keys=%d' % (name, removed, s2.count('\n  "')))

# ---------- 3. README ----------
rd_p = P('README.md')
rd = io.open(rd_p, encoding='utf-8').read()
old_pref = '19 首曲目里 15 首由 WebAudio 实时合成，四首用预渲染 MP3（离线渲染母版转码，合计 7.3 MB'
assert rd.count(old_pref) == 1, rd.count(old_pref)
rd = rd.replace(old_pref, '19 首曲目里 15 首由 WebAudio 实时合成，四首用预渲染 MP3（离线渲染母版转码，合计 8.8 MB')
old_line_pref = '  - EXTRA 中段《亡き王女の為のセプテット（红月王座编）》'
lines = rd.split('\n')
hit = [i for i, l in enumerate(lines) if l.startswith(old_line_pref)]
assert len(hit) == 1, hit
TXT = ('  - EXTRA 中段《亡き王女の為のセプテット（红月王座编）》是第二首「逐音搬入」的曲子，但比芙兰那首走得更远：'
 '~BT~tools/build/_remi_compose.py~BT~ 直接解析原曲 MIDI，把 14 条通道按角色重新配器——小号=主旋律（ch3 + ch10 低八度双层）、'
 '弦乐=和声（ch4 + 高音弦 ch12）、钢琴=右手织体（ch2）与引子钟摆（ch8）、贝斯=ch1（另加 -12 八度 sub）、羽管键琴=左手分解（ch13）、'
 '竖琴式琶音=尼龙吉他通道（ch5）、清音铜管=失真吉他通道（ch11）、管风琴=ch14。'
 '原文件有 440 tick 的全局偏移（真小节线 = 文件小节线 + 440，MUSIC0=2360），换算全部走 ~BT~tick_to_sec~BT~，'
 '所以 145 BPM 与中途的 140/142/124/144 变速都是原速；原曲 81 小节落在第 5–85 小节，前后各接 4 小节新写的引子与尾声，总长 148.658 秒。'
 '第二版把七处薄弱点补齐：① 圆舞圣咏段新写十六分管风琴分解（第 53–68 小节，音域 63–89）与定音鼓根音，'
 '管风琴 +2dB、新声部从 -42.5dB 提到 -35.8dB，那段终于像一面墙；② B 段主题抬一个八度，靠弦乐高八度加倍穿透琶音；'
 '③ 终曲 II 最后 12 秒整体升半音；④ 尾声从六小节压到四小节，收在一枚悬置的降 E 大和弦接回引子；'
 '⑤ 引子每拍加钟摆 tick 与心跳鼓；⑥ 铜管叠低八度锯齿、管风琴加 2 泛音、弦乐加高八度层；'
 '⑦ 全曲改 44.1kHz 立体声，管风琴与弦乐终于有宽度。数据 26 轨 8221 音 1024 鼓。'
 '母版 ~BT~tools/build/_remi_kit/remilia_septette_stereo.wav~BT~ 是 {WAVB} B / 6,555,818 帧 / 148.658 秒的 44.1kHz 立体声 PCM16，'
 '但 25.01 MiB 超过 Cloudflare Pages 单文件 25 MiB 上限，**不入库、不发线上**；仓库与线上只放转码后的 MP3：'
 '{MP3B} B / {KBPS} kbps（MPEG-1 Layer III 44.1kHz 立体声，LAME delay 576 + padding 1942，'
 '浏览器 ~BT~decodeAudioData~BT~ 解出 6,555,818 采样、与母版逐点对齐）。'
 '母版实测：峰值 {PEAK} / RMS -19.50 dBFS（左右总功率；单声道等效 -22.51）/ 波峰因数 {CREST} / 接缝跳变 {SEAM} / '
 'L-R 相关 {CORR} / 立体声宽度 {WIDTH} dB / 谱心 {CENTROID} Hz；逐段 RMS：{SEGT}。'
 '混音小号（主旋律）比底鼓高约 1.5dB，副歌不再被鼓吃掉。')
for k, v in (('{WAVB}', '{:,}'.format(master_bytes)), ('{MP3B}', '{:,}'.format(mp3_bytes)),
             ('{KBPS}', '%.2f' % mp3_kbps), ('{PEAK}', '%.3f' % peak), ('{CREST}', '%.2f' % crest),
             ('{SEAM}', '%.4f' % SEAM), ('{CORR}', '%.2f' % CORR), ('{WIDTH}', '%.1f' % WIDTH),
             ('{CENTROID}', '%.0f' % CENTROID), ('{SEGT}', seg_txt), ('~BT~', BT)):
    TXT = TXT.replace(k, v)
lines[hit[0]] = TXT
io.open(rd_p, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
print('[README] bullet replaced (%d chars)' % len(TXT))

# ---------- 4. NETWORK_CN ----------
nc_p = P('docs/NETWORK_CN.md')
nc = io.open(nc_p, encoding='utf-8').read()
def rep1(old, new):
    global nc
    assert nc.count(old) == 1, (nc.count(old), old[:60])
    nc = nc.replace(old, new)

rep1('### 3.2 预渲染 BGM 转 MP3（3 首，−15.0 MB）', '### 3.2 预渲染 BGM 转 MP3（4 首）')
rep1('| ~BT~remilia_septette~BT~ | EXTRA 中段（七重奏） | 6,555,862 B | **1,668,508 B** |'.replace('~BT~', BT),
     '| ~BT~remilia_septette~BT~ | EXTRA 中段（七重奏） | —（母版 26,223,316 B 不入库） | **{:,} B** |'.format(mp3_bytes).replace('~BT~', BT))
wav_total = 5_292_044 + 9_664_118 + 6_615_044
mp3_total = 1_369_893 + 2_545_365 + 1_698_472 + mp3_bytes
assert mp3_total == 8_796_139, mp3_total
rep1('| 合计 | | 28,127,068 B | **7,282,238 B（−74.1%）** |',
     '| 合计 | | {:,} B | **{:,} B（−{:.1f}%）** |'.format(wav_total, mp3_total, 100 * (1 - mp3_total / wav_total)))
rep1('- 脚本：~BT~python tools/optimize_audio_mp3.py~BT~（MPEG-2 Layer III / 22050 Hz / 单声道 / VBR ≈ 91.8 kbps）。源是 22.05 kHz 单声道母版，所以用 MPEG-2 L3，不用 44.1k 的 MPEG-1。'.replace('~BT~', BT),
     '- 脚本：~BT~python tools/optimize_audio_mp3.py~BT~。前三首源是 22.05 kHz 单声道母版，用 MPEG-2 Layer III / 单声道 / VBR ≈ 91 kbps；'
     '~BT~remilia_septette~BT~ 的母版是 44.1 kHz 立体声，改走 MPEG-1 Layer III / 192 kbps CBR（帧长 1152、side info 32 B），'
     'LAME tag 的 padding 也要跟着补 ~BT~spf − delay~BT~ 的差，才能解出和母版一模一样的采样数。'.replace('~BT~', BT))
rep1('验收（~BT~node tools/verify_audio_mp3.mjs~BT~，49 pass / 0 fail）：'.replace('~BT~', BT),
     '验收（~BT~node tools/verify_audio_mp3.mjs~BT~，4 首 65 pass / 0 fail）：'.replace('~BT~', BT))
rep1('   - 与 WAV 互相关 lag = 0、corr 0.9994–0.99998；',
     '   - 与 WAV 互相关 lag = 0、corr 0.9994–0.99998（remilia 立体声 0.9992）；')
rep1('   - ~BT~AudioBufferSourceNode.loop = true~BT~ 真实循环渲染，跨边界 SNR 25.0–26.2 dB，跳变与 WAV 同量级（且低于该曲平均相邻样本跳变，没有咔哒声）。'.replace('~BT~', BT),
     '   - ~BT~AudioBufferSourceNode.loop = true~BT~ 真实循环渲染，跨边界 SNR 25.0–30.0 dB，跳变与 WAV 同量级（且低于该曲平均相邻样本跳变，没有咔哒声）。'.replace('~BT~', BT))
rep1('- 运行时只改 ~BT~src/engine/songs/index.js~BT~ 的三行 ~BT~audio~BT~ 路径；~BT~audio.js~BT~ 一行没动（解码失败自动回退合成曲的 ~BT~catch~BT~ 本来就覆盖了）。三首 WAV 母版仍在仓库里。'.replace('~BT~', BT),
     '- 运行时只改 ~BT~src/engine/songs/index.js~BT~ 的四行 ~BT~audio~BT~ 路径；~BT~audio.js~BT~ 一行没动（解码失败自动回退合成曲的 ~BT~catch~BT~ 本来就覆盖了）。'
     '三首单声道 WAV 母版仍在仓库里；~BT~remilia_septette~BT~ 的 44.1kHz 立体声母版 26,223,316 B（25.01 MiB）超过 Cloudflare Pages 单文件 25 MiB 上限，'
     '只留 MP3，母版放在 ~BT~tools/build/_remi_kit/~BT~（不进版本库），重编 MP3 时脚本会自动回落取这份母版。'.replace('~BT~', BT))
io.open(nc_p, 'w', encoding='utf-8', newline='').write(nc)
print('[NETWORK_CN] wav_total=%d mp3_total=%d' % (wav_total, mp3_total))

# ---------- 5. version bump ----------
BUMPS = [('index.html', '?v=' + OLD_VER, '?v=' + NEW_VER), ('src/ui/platform.js', OLD_VER, NEW_VER),
         ('sw.js', OLD_VER, NEW_VER), ('src/engine/songs/index.js', OLD_VER, NEW_VER)]
for rel, old, new in BUMPS:
    p = P(rel)
    s = io.open(p, encoding='utf-8').read()
    c = s.count(old)
    io.open(p, 'w', encoding='utf-8', newline='').write(s.replace(old, new))
    print('[ver] %s %d' % (rel, c))

json.dump(dict(master_bytes=master_bytes, mp3_bytes=mp3_bytes, mp3_kbps=round(mp3_kbps, 2), sr=sr, nch=nch,
               frames=nfr, peak=round(peak, 5), rms_db=round(20*np.log10(rms_total), 3),
               rms_ch_db=round(20*np.log10(rms_ch), 3), crest=round(crest, 2), seam=SEAM, corr=CORR,
               width=WIDTH, centroid=CENTROID, segs=segs),
          io.open(P('tools/build/_remi_lead/_v2_stats.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('[done]')
