# -*- coding: utf-8 -*-
import os, re, json
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
def rd(p):
    return open(os.path.join(ROOT, p), encoding='utf-8').read()
def wr(p, s):
    open(os.path.join(ROOT, p), 'w', encoding='utf-8', newline='').write(s)
ZH_TITLE = '蠢蠢秋月 ～ Mooned Insect（萤火夜雾编）'
ZH_ORIG = '原曲「蠢々秋月 ～ Mooned Insect」/ 作曲：ZUN / 编曲：Miku523（逐音搬入重配器）'
ZH_NOTE = ('二面 Boss 曲（1:59 · 原曲忠实改编）。ZUN 的 51 小节整块搬进来：A 段 E 小调（C-D-Am-Bm-Em-D 循环），B 段整体降三度转 C# 小调，两条旋律逐音不动，只换乐器。前面加了八小节夜雾引子，八音盒先把主句唱一遍，鼓只留心跳，像远远看见一点萤火；原曲第 1 小节的留白和第 2 小节的鼓过门留在那儿当循环口。B 段那种一记一记把鼓抽空的推进也照搬，中间插四小节呼吸——灯灭了，虫还在叫。末尾两段再现，先加铜管，再全编制；最后八小节八音盒把主句唱完整，收在 A→G→B 的悬置上，不给终止，直接绕回引子——莉格露的夜晚不打算结束。全曲只用 E、F#、G、A、B、C、D 七个音，没让 F 和 A# 出现一次，和原曲一样。' + chr(10) + '——莉格露·奈特巴格：「别急着走嘛，萤火还没灭呢。」')
EN_TITLE = 'Stirring an Autumn Moon ~ Mooned Insect (Firefly Mist Mix)'
EN_ORIG = 'Original "Stirring an Autumn Moon ~ Mooned Insect" / Composer: ZUN / Arrangement: Miku523 (note-for-note re-orchestration)'
EN_NOTE = ('STAGE 2 boss theme (1:59, faithful arrangement). All 51 of ZUN\'s bars are moved over whole: A section in E minor (C-D-Am-Bm-Em-D), B section three semitones down in C# minor; both melodies note for note, only the instruments change. An eight-bar night-mist intro comes first: a music box sings the main phrase while the drums keep only a heartbeat, like a single firefly far off; the empty first bar and the bar-two drum fill stay in place as the loop point. The B-section build where the drums are pulled away one hit at a time is kept too, with four bars of breathing in the middle - the lantern goes out, the insects keep singing. Two reprises close it: brass first, then the full ensemble; the last eight bars let the music box finish the phrase and end on a suspended A-G-B with no cadence, straight back into the intro - Wriggle\'s night is not going to end. Only E, F#, G, A, B, C, D appear; F and A# never do, same as the original.' + chr(10) + '-- Wriggle Nightbug: "Don\'t go yet. The fireflies are just getting started."')
JA_TITLE = '蠢々秋月 ～ Mooned Insect（蛍火夜霧編）'
JA_ORIG = '原曲「蠢々秋月 ～ Mooned Insect」/ 作曲：ZUN / 編曲：Miku523（一音ずつ移植して再配器）'
JA_NOTE = ('二面ボス曲（1:59・原曲忠実アレンジ）。ZUN の 51 小節を丸ごと持ってきている。A 段はホ短調（C-D-Am-Bm-Em-D の循環）、B 段は全体を 3 半音下げて嬰ハ短調、二本の旋律は一音も変えず、楽器だけを差し替えた。頭に 8 小節の夜霧のイントロ：オルゴールが主句を先に歌い、ドラムは心音だけ、遠くに蛍が一匹見える感じ。原曲 1 小節目の空白と 2 小節目のドラムフィルはそのまま循環の口として残した。B 段でドラムが一打ずつ抜けていく盛り上げもそのまま、中ほどに 4 小節の呼吸——灯が消えて、虫はまだ鳴いている。終わりは二度の再現、まず金管、そして全編成。最後の 8 小節でオルゴールが主句を歌い切り、A→G→B の宙吊りで終わる。終止は与えず、そのままイントロへ——リグルの夜は終わるつもりがない。使う音は E・F#・G・A・B・C・D の七つだけ。F と A# は一度も出てこない。原曲と同じ。' + chr(10) + '——リグル・ナイトバグ：「まだ帰らないで。蛍はこれからだよ。」')
def jsq(s):
    return s.replace(chr(92), chr(92)*2).replace("'", chr(92)+"'").replace(chr(10), chr(92)+'n')
# ---- 1. musicTracks.js ----
mt = rd('src/game/musicTracks.js')
pat = re.compile(r"  \{\n    key: 'stage2',.*?\n  \},\n", re.S)
block = ("  {\n    key: 'stage2',\n    no: '05',\n    title: '" + jsq(ZH_TITLE) + "',\n"
         "    sub: '莉格露·奈特巴格',\n    cat: 'STAGE 2',\n    place: '魔法森林 · 萤火夜雾',\n"
         "    orig: '" + jsq(ZH_ORIG) + "',\n    tone: '#8ff0b0',\n    glow: '143, 240, 176',\n"
         "    time: 119.2,\n    note:\n      '" + jsq(ZH_NOTE) + "',\n  },\n")
mt2, n = pat.subn(block, mt, count=1)
assert n == 1, 'musicTracks stage2 block not found'
wr('src/game/musicTracks.js', mt2)
print('musicTracks ok')
# ---- 2. i18n ----
OLD_KEYS = ['蠢蠢秋月 ～ Mooned Insect', '原曲「蠢々秋月 ～ Mooned Insect」/ 作曲：ZUN / 编曲：Miku523', '二面 Boss 曲。鼓和贝斯在后头推着，一层一层往上加。录的时候窗台上真有一只虫跟着叫，我没关窗。莉格露只提了一个要求：别让今晚结束。那我把速度压慢了，慢到有点赖着不走。结果这首最后成了萤火虫的送葬曲；我写的时候可没想那么远。']
try:
    from opencc import OpenCC
    cc = OpenCC('s2twp')
    hant = lambda s: cc.convert(s)
except Exception:
    hant = lambda s: s
for pack, tri in (('en', (EN_TITLE, EN_ORIG, EN_NOTE)), ('ja', (JA_TITLE, JA_ORIG, JA_NOTE)), ('zh-hant', (hant(ZH_TITLE), hant(ZH_ORIG), hant(ZH_NOTE)))):
    p = 'src/i18n/packs/%s.js' % pack
    s = rd(p)
    out = []
    for line in s.split(chr(10)):
        if any(('"' + k + '":') in line or (json.dumps(k, ensure_ascii=False) + ':') in line for k in OLD_KEYS):
            continue
        out.append(line)
    s = chr(10).join(out)
    add = ''.join(json.dumps(k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False) + ',\n' for k, v in zip(('蠢蠢秋月 ～ Mooned Insect（萤火夜雾编）', '原曲「蠢々秋月 ～ Mooned Insect」/ 作曲：ZUN / 编曲：Miku523（逐音搬入重配器）', '二面 Boss 曲（1:59 · 原曲忠实改编）。ZUN 的 51 小节整块搬进来：A 段 E 小调（C-D-Am-Bm-Em-D 循环），B 段整体降三度转 C# 小调，两条旋律逐音不动，只换乐器。前面加了八小节夜雾引子，八音盒先把主句唱一遍，鼓只留心跳，像远远看见一点萤火；原曲第 1 小节的留白和第 2 小节的鼓过门留在那儿当循环口。B 段那种一记一记把鼓抽空的推进也照搬，中间插四小节呼吸——灯灭了，虫还在叫。末尾两段再现，先加铜管，再全编制；最后八小节八音盒把主句唱完整，收在 A→G→B 的悬置上，不给终止，直接绕回引子——莉格露的夜晚不打算结束。全曲只用 E、F#、G、A、B、C、D 七个音，没让 F 和 A# 出现一次，和原曲一样。' + chr(10) + '——莉格露·奈特巴格：「别急着走嘛，萤火还没灭呢。」',), ('zh',) + tri))
    i = s.rfind('};')
    s = s[:i] + add + s[i:]
    wr(p, s)
    print(pack, 'ok')
# ---- 3. README ----
rm = rd('README.md')
rm = rm.replace('五首用预渲染 MP3（离线渲染母版转码，合计 11.3 MB：一面 Boss 露米娅《妖魔夜行》`src/assets/bgm/youma_stage1.mp3`、', '六首用预渲染 MP3（离线渲染母版转码，合计 11.7 MB：一面 Boss 露米娅《妖魔夜行》`src/assets/bgm/youma_stage1.mp3`、二面 Boss 莉格露《蠢蠢秋月》`src/assets/bgm/wriggle_stage2.mp3`、', 1)
marker = '  - EXTRA 中段《亡き王女の為のセプテット（红月王座编）》是第二首'
bullet = ('  - 二面 Boss《蠢蠢秋月（萤火夜雾编）》是第四首「逐音搬入」的曲子，`tools/build/_wrig_compose.py` 读 `tools/build/_wrig_lead/midi_flat.json`（原 MIDI 51 小节 / 3792 音，先把 bar10 与 bar50 两处 rit→accel 抹平成恒定 155 BPM），把 14 条通道按角色重新配器：EP2 主旋律=lead（另加钢琴同度与八音盒 +12 点音）、EP2 低八度=piano、EP1 和声=羽管键琴、Harpsichord 分解=arp（+羽管键琴薄层）、Ac.Guitar 低音=bass（+sine sub）、双音 stab=guitar、SynthBass riff=counter、Trumpet=brass、SynthStrings=弦乐（ch14 再叠合唱）、鼓按 GM 映射成 0–7。原曲落在第 9–59 小节：bar11–18（E 小调）/ bar19–26（同旋律加铜管）/ bar27–34（整体降三度转 C# 小调，鼓一记一记抽空）/ bar35–42（全编制）。前面接 8 小节夜雾引子（八音盒先唱主句、心跳 kick、第 5–8 小节叠原曲引子 riff），随后 4 小节呼吸（只留 pad、钟摆 tick 与 16 分颤音），再把 bar19–26 与 bar35–42 各做一次加厚再现（弦乐高八度、铜管、合唱、ride），最后 8 小节尾声让八音盒把主句唱完整，收在 A→G→B 的悬置上不给终止，循环回引子。全曲只用 E/F#/G/A/B/C/D，F 与 A# 一次都没有。数据 16 轨 6126 音 1964 鼓，总长 119.226 秒（77 小节）。母版 `tools/build/_wrig_kit/wriggle_stage2_stereo.wav` 是 21,031,512 B / 5,257,867 帧 / 119.226 秒的 44.1kHz 立体声 PCM16（不入库），MP3 2,863,228 B / 192.12 kbps（MPEG-1 Layer III 44.1kHz 立体声，LAME delay 576 + padding 2741）。母版实测：峰值 0.341 / RMS -19.50 dBFS（左右总功率；每声道 -22.51）/ 0.0 削顶 / 接缝 0.0045 / L-R 相关 0.68 / 宽度 -7.1 dB / 谱心 789 Hz；逐段 RMS：引子 -23.68 / A -18.80 / A2 -18.79 / B -19.89 / B2 -18.53 / 尾奏 -21.91 / 呼吸 -26.75 / 再现 I -18.01 / 再现 II -16.10 / 尾声 -24.60。\n')
assert marker in rm
rm = rm.replace(marker, bullet + marker, 1)
wr('README.md', rm)
print('README ok')
# ---- 4. NETWORK_CN ----
nc = rd('docs/NETWORK_CN.md')
old_row = '| `youma_stage1` | STAGE 1 Boss（妖魔夜行·宵暗夜路编） | —（母版 18,301,192 B 不入库） | **2,491,453 B** |\n'
new_row = old_row + '| `wriggle_stage2` | STAGE 2 Boss（蠢蠢秋月·萤火夜雾编） | —（母版 21,031,512 B 不入库） | **2,863,228 B** |\n'
assert old_row in nc
nc = nc.replace(old_row, new_row, 1)
nc = nc.replace('| 合计 | | 21,571,206 B | **11,287,592 B（−47.7%）** |', '| 合计 | | 21,571,206 B | **14,150,820 B（−34.4%）** |', 1)
nc = nc.replace('`remilia_septette` 与 `youma_stage1` 的母版是 44.1 kHz 立体声', '`remilia_septette`、`youma_stage1` 与 `wriggle_stage2` 的母版是 44.1 kHz 立体声', 1)
nc = nc.replace('验收（`node tools/verify_audio_mp3.mjs`，5 首 81 pass / 0 fail）', '验收（`node tools/verify_audio_mp3.mjs`，6 首 96 pass / 0 fail）', 1)
nc = nc.replace('运行时只改 `src/engine/songs/index.js` 的四行 `audio` 路径', '运行时只改 `src/engine/songs/index.js` 的五行 `audio` 路径', 1)
wr('docs/NETWORK_CN.md', nc)
print('NETWORK ok')
# ---- 5. AUDIT ----
au = rd('docs/RE_STORY/AUDIT_CURRENT.md')
old5 = '| 05 | `stage2` | 蠢々秋月 ～ Mooned Insect | STAGE 2 | 魔法森林 · 萤火夜雾 | 原曲 / ZUN | 112.6 | `:94` |'
new5 = '| 05 | `stage2` | 蠢々秋月 ～ Mooned Insect（萤火夜雾编） | STAGE 2 | 魔法森林 · 萤火夜雾 | 原曲 / ZUN（逐音搬入重配器） | 119.2 | `:94` |'
assert old5 in au
wr('docs/RE_STORY/AUDIT_CURRENT.md', au.replace(old5, new5, 1))
print('AUDIT ok')
# ---- 6. version / index.js DEFS ----
idx = rd('src/engine/songs/index.js')
old_def = ("  // 2 面 Boss：蠢々秋月 —— 融合版 × 游戏内原曲混合，贝斯贴原曲音高（见 tools/merge_stage2.py）\n"
           "  { id: 'merge_stage2', url: './merge_stage2.js', keys: ['stage2'],\n"
           "    pick: (m) => ({ stage2: m.MERGE_STAGE2?.stage2 }) },\n")
new_def = ("  // 2 面 Boss：蠢々秋月 —— 原曲 51 小节逐音搬入重配器（见 tools/build/_wrig_compose.py）\n"
           "  { id: 'wriggle_stage2', url: './wriggle_stage2.js', keys: ['stage2'],\n"
           "    pick: (m) => ({ stage2: m.WRIGGLE_STAGE2?.stage2\n"
           "      ? { ...m.WRIGGLE_STAGE2.stage2, audio: 'src/assets/bgm/wriggle_stage2.mp3?v=1.6.59' }\n"
           "      : undefined }) },\n")
assert old_def in idx
idx = idx.replace(old_def, new_def, 1)
wr('src/engine/songs/index.js', idx)
for p in ('index.html', 'src/ui/platform.js', 'sw.js', 'src/engine/songs/index.js'):
    s = rd(p)
    c = s.count('1.6.58')
    wr(p, s.replace('1.6.58', '1.6.59'))
    print('ver', p, c)
print('DONE')