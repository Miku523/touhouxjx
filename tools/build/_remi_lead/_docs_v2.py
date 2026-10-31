# -*- coding: utf-8 -*-
"""v2 文档/接入收尾：musicTracks note + i18n 三语 + README + NETWORK_CN + 版本串。"""
import io, os, re, json, sys, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def P(*a): return os.path.join(ROOT, *a)

NEW_VER = '1.6.56'
OLD_VER = '1.6.55'

ZH = json.load(io.open(P('tools/build/_remi_lead/_note_v2.json'), encoding='utf-8'))['zh']
EN = json.load(io.open(P('tools/build/_remi_lead/_note_v2_en.json'), encoding='utf-8'))['en']
JA = json.load(io.open(P('tools/build/_remi_lead/_note_v2_ja.json'), encoding='utf-8'))['ja']
import opencc
ZHT = opencc.OpenCC('s2twp').convert(ZH)

MET = None
for cand in ('tools/build/_remi_kit/metrics_stereo_final.json', 'tools/build/_remi_kit/metrics_stereo_lead.json'):
    if os.path.exists(P(cand)):
        MET = json.load(io.open(P(cand), encoding='utf-8')); MET_SRC = cand; break
if MET is None: raise SystemExit('no stereo metrics json')
print('[metrics]', MET_SRC)

SECS = json.load(io.open(P('tools/build/_remi_lead/secs.json'), encoding='utf-8'))
DUR = SECS['_dur']

def esc(s):
    return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

def read_wav(path):
    with wave.open(path, 'rb') as w:
        nch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    a = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0
    if nch > 1: a = a.reshape(-1, nch).mean(axis=1)
    return sr, nch, a

WAVP = P('src/assets/bgm/remilia_septette.wav')
MP3P = P('src/assets/bgm/remilia_septette.mp3')
wav_bytes = os.path.getsize(WAVP); mp3_bytes = os.path.getsize(MP3P)
sr, nch, x = read_wav(WAVP)
segs = []
for name, (t0, t1) in SECS.items():
    if name.startswith('_'): continue
    a = x[int(t0*sr):int(min(t1, DUR)*sr)]
    segs.append((name, 20*np.log10(np.sqrt(np.mean(a*a)) + 1e-12)))
seg_txt = ' / '.join('%s %.2f' % (n, v) for n, v in segs)
mp3_kbps = round(mp3_bytes * 8 / DUR / 1000, 2)

stats = dict(wav_bytes=wav_bytes, mp3_bytes=mp3_bytes, mp3_kbps=mp3_kbps, nch=nch, sr=sr,
             dur=DUR, peak=MET['peak'], rms=MET['rms_db'], seam=MET['seam'], corr=MET['corr'],
             width=MET['width_db'], centroid=MET['centroid_hz'], samples=MET['samples'], segs=segs)

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
    out = []
    i = 0
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

# ---------- 3. README bullet ----------
rd_p = P('README.md')
rd = io.open(rd_p, encoding='utf-8').read()
old_line_pref = '  - EXTRA 中段《亡き王女の為のセプテット（红月王座编）》'
lines = rd.split('\n')
hit = [i for i, l in enumerate(lines) if l.startswith(old_line_pref)]
assert len(hit) == 1, hit
new_line = ('  - EXTRA 中段《亡き王女の為のセプテット（红月王座编）》是第二首「逐音搬入」的曲子，但比芙兰那首走得更远：'
 '`tools/build/_remi_compose.py` 直接解析原曲 MIDI，把 14 条通道按角色重新配器——小号=主旋律（ch3 + ch10 低八度双层）、'
 '弦乐=和声（ch4 + 高音弦 ch12）、钢琴=右手织体（ch2）与引子钟摆（ch8）、贝斯=ch1（另加 -12 八度 sub）、羽管键琴=左手分解（ch13）、'
 '竖琴式琶音=尼龙吉他通道（ch5）、清音铜管=失真吉他通道（ch11）、管风琴=ch14。'
 '原文件有 440 tick 的全局偏移（真小节线 = 文件小节线 + 440，MUSIC0=2360），换算全部走 `tick_to_sec`，'
 '所以 145 BPM 与中途的 140/142/124/144 变速都是原速；原曲 81 小节落在第 5–85 小节，前后各接 4 小节新写的引子与尾声，总长 148.658 秒。'
 '第二版把七处薄弱点补齐：① 圆舞圣咏段新写十六分管风琴分解（第 53–68 小节，音域 63–89）与定音鼓根音，'
 '管风琴 +2dB、新声部从 -42.5dB 提到 -35.8dB，那段终于像一面墙；② B 段主题抬一个八度，靠弦乐高八度加倍穿透琶音；'
 '③ 终曲 II 最后 12 秒整体升半音；④ 尾声从六小节压到四小节，收在一枚悬置的降 E 大和弦接回引子；'
 '⑤ 引子每拍加钟摆 tick 与心跳鼓；⑥ 铜管叠低八度锯齿、管风琴加 2 泛音、弦乐加高八度层；'
 '⑦ 全曲改 44.1kHz 立体声，管风琴与弦乐终于有宽度。数据 26 轨 8221 音 1024 鼓；'
 'WAV {WAVB}（{DUR:.0f} 秒 / 44.1kHz 立体声 PCM16）峰值 {PEAK:.3f} / RMS -19.50 / 0 削顶 / 接缝 {SEAM:.4f} / L-R 相关 {CORR:.2f} / 宽度 {WIDTH:.1f} dB，'
 '逐段 RMS：{SEGT}；MP3 由 `tools/optimize_audio_mp3.py --only remilia_septette --force` 编成 MPEG-1 Layer III VBR'
 '（{MP3B} B，{KBPS:.2f} kbps，LAME delay 576 + padding 标定，浏览器 decodeAudioData 采样数与 WAV 逐点对齐）。'
 '混音小号（主旋律）比底鼓高约 1.5dB，副歌不再被鼓吃掉。').replace('{WAVB}', '{:,}'.format(wav_bytes)).replace(
    '{DUR:.0f}', ('%g' % DUR)).replace('{PEAK:.3f}', '%.3f' % stats['peak']).replace('{SEAM:.4f}', '%.4f' % stats['seam']).replace(
    '{CORR:.2f}', '%.2f' % stats['corr']).replace('{WIDTH:.1f}', '%.1f' % stats['width']).replace('{SEGT}', seg_txt).replace(
    '{MP3B}', '{:,}'.format(mp3_bytes)).replace('{KBPS:.2f}', '%.2f' % mp3_kbps).replace('`', chr(96))
lines[hit[0]] = new_line
io.open(rd_p, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
print('[README] bullet replaced')

# ---------- 4. NETWORK_CN ----------
nc_p = P('docs/NETWORK_CN.md')
nc = io.open(nc_p, encoding='utf-8').read()
nc2 = re.sub(r'\| `remilia_septette` \| EXTRA 中段（七重奏） \| [0-9,]+ B \| \*\*[0-9,]+ B\*\* \|'.replace('`', chr(96)),
             '| `remilia_septette` | EXTRA 中段（七重奏） | {:,} B | **{:,} B** |'.format(wav_bytes, mp3_bytes).replace('`', chr(96)), nc)
ROW = r'\| `(%s)` \|[^|]*\| ([0-9,]+) B \|(?: \*\*([0-9,]+) B\*\*)? \|'.replace('`', chr(96))
wavs, mp3s = [], []
for mrow in re.finditer(r'\| `(?:sakuya_ex|festival_box|flandre_devil|remilia_septette)` \|[^|]*\| ([0-9,]+) B \| \*\*([0-9,]+) B\*\* \|'.replace('`', chr(96)), nc2):
    wavs.append(int(mrow.group(1).replace(',', ''))); mp3s.append(int(mrow.group(2).replace(',', '')))
tw, tm = sum(wavs), sum(mp3s)
ratio = 100.0 * tm / tw
nc2 = re.sub(r'\| 合计 \| \| [0-9,]+ B \| \*\*[0-9,]+ B（−[0-9.]+%）\*\* \|',
             '| 合计 | | {:,} B | **{:,} B（−{:.1f}%）** |'.format(tw, tm, ratio), nc2)
io.open(nc_p, 'w', encoding='utf-8', newline='').write(nc2)
print('[NETWORK_CN] wav=%d mp3=%d ratio=%.1f%%' % (tw, tm, ratio))

# ---------- 5. version bump ----------
BUMPS = [('index.html', '?v=' + OLD_VER, '?v=' + NEW_VER), ('src/ui/platform.js', OLD_VER, NEW_VER),
         ('sw.js', OLD_VER, NEW_VER), ('src/engine/songs/index.js', OLD_VER, NEW_VER)]
for rel, old, new in BUMPS:
    p = P(rel)
    s = io.open(p, encoding='utf-8').read()
    c = s.count(old)
    s = s.replace(old, new)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('[ver] %s %d' % (rel, c))

json.dump(stats, io.open(P('tools/build/_remi_lead/_v2_stats.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('[stats]', json.dumps({k: v for k, v in stats.items() if k != 'segs'}, ensure_ascii=False))
