# -*- coding: utf-8 -*-
"""v5 文档接入：musicTracks note、i18n 三语、README、NETWORK_CN、版本号 1.6.37 -> 1.6.38"""
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = lambda *a: os.path.join(ROOT, *a)

ZH1 = ("EXTRA Boss 曲（2:30 · 第五版）。这一版只改一件事：让 U.N. 的旋律在前四十秒就现身，而且一直是主角。"
"引子 I 只有八音盒把第 20–27 小节的副歌 hook 一颗一颗掰开，第 9 小节乐队带着同一句进场，"
"第 33 小节在 blast beat 上第一次正面砸下来——不用等副歌，四十秒你就知道这是谁；"
"全曲只用了 U.N. 的三块真素材（第 3–4 小节时钟琶音、第 20–27 小节副歌 hook、第 12–19 小节半音下行），"
"逐音搬入、整体前移 0.25 拍落到正拍。200 BPM、D 小调、125 小节，其余全是给旋律让路的织体："
"A 段八分 riff 留空隙，副歌才把十五轨全开，重复的十六分音墙砍掉一半，"
"段尾用通鼓、滚奏、反向吊镲和半小节上行把切点磨圆。狂气靠密度而不是孤独："
"第 34–36 小节用三全音簇与半音颤音掀地板，第 63 小节半音下行叠双踩，第 79 小节整段升半音，"
"第 99 小节在 blast beat 上一路碾碎，飞刀轨在每处接缝撒一把，副歌每小节弱拍闪一下玻璃琶音。")
ZHQ = "——芙兰朵露：「呐，陪我玩到坏掉为止吧？」"
ZH = ZH1 + "\n" + ZHQ

EN1 = ("EXTRA Boss theme (2:30 · fifth version). This version changes one thing: U.N.'s melody shows up in the first forty seconds "
"and stays the lead for the whole track. Intro I is only the music box picking the bar 20–27 hook apart note by note, "
"the band enters with the same phrase at bar 9, and at bar 33 it finally slams in on a blast beat — you know whose theme this is "
"before the chorus even arrives. The track uses only three real U.N. fragments (the clock arpeggio in bars 3–4, the chorus hook in "
"bars 20–27, the chromatic descent in bars 12–19), transcribed note for note and shifted 0.25 beat forward onto the downbeat. "
"200 BPM, D minor, 125 bars; everything else is texture built to leave that melody room: the A section's eighth-note riff keeps gaps, "
"all fifteen tracks only open up in the chorus, half of the repeated sixteenth-note wall is gone, and section seams are rounded off "
"with toms, snare rolls, reverse crashes and half-bar risers. The madness comes from density, not loneliness: bars 34–36 lift the "
"floor with tritone clusters and semitone trills, bar 63 stacks the chromatic descent on double kick, bar 79 pushes the whole section "
"up a semitone, bar 99 grinds through on a blast beat, the knife track throws a handful at every seam, and a glass arpeggio glints "
"on the off-beat of each chorus bar.")
ENQ = "— Flandre: \"Hey, play with me until I break?\""
EN = EN1 + "\n" + ENQ

JA1 = ("EXTRA ボス曲（2:30・第五版）。この版が変えたのは一点だけ——U.N. の旋律を最初の四十秒で出し、そのまま主役に据えること。"
"イントロ I はオルゴールだけが 20–27 小節のサビフレーズを一粒ずつ崩していき、9 小節でバンドが同じ一節を携えて入り、"
"33 小節でブラストビートの上に初めて正面から叩きつけられる。サビを待たずとも、四十秒で誰の曲か分かる。"
"使った素材は U.N. の三つの実フレーズだけ（3–4 小節の時計アルペジオ、20–27 小節のサビフレーズ、12–19 小節の半音下降）。"
"音はそのまま移し、全体を 0.25 拍前へずらして頭拍に合わせた。200 BPM・ニ短調・125 小節、"
"残りはすべてその旋律に道を譲る織物：A セクションの八分リフは隙間を残し、十五トラックが全開になるのはサビだけ、"
"繰り返す十六分の壁は半分削り、段落の継ぎ目はタム・スネアロール・逆シンバル・半小節ライザーで丸めた。"
"狂気は孤独ではなく密度から来る——34–36 小節は三全音クラスターと半音トリルで床を剥がし、63 小節は半音下降にツーバスを重ね、"
"79 小節で段落ごと半音上げ、99 小節はブラストビートで碾き潰し、ナイフのトラックが各継ぎ目に一把ずつ撒かれ、"
"サビの各小節は裏拍でガラスのアルペジオが光る。")
JAQ = "——フランドール：「ねえ、壊れるまで遊んでよ？」"
JA = JA1 + "\n" + JAQ

def js_sq(s):
    return s.replace("\\", "\\\\").replace("'", "\\'")

def note_block(para1, quote):
    return ("    note:\n"
            "      '" + js_sq(para1) + "\\n' +\n"
            "      '" + js_sq(quote) + "',\n")

# ---------- 1) musicTracks.js ----------
mt_path = P("src", "game", "musicTracks.js")
mt = io.open(mt_path, encoding="utf-8").read()
i = mt.index("    key: 'extra',")
note_start = mt.index("    note:\n", i)
endmark = "——芙兰朵露：「呐，陪我玩到坏掉为止吧？」'"
j = mt.index(endmark, note_start) + len(endmark)
if mt[j] == ",":
    j += 1
if mt[j] == "\n":
    j += 1
note_end = j
old_note = mt[note_start:note_end]
assert old_note.count("note:") == 1 and old_note.rstrip().endswith("',"), old_note[-80:]
mt_new = mt[:note_start] + note_block(ZH1, ZHQ) + mt[note_end:]
io.open(mt_path, "w", encoding="utf-8", newline="").write(mt_new)
print("[musicTracks] note replaced: %d -> %d chars" % (len(old_note), len(note_block(ZH1, ZHQ))))

# ---------- 2) i18n packs ----------
try:
    from opencc import OpenCC
    ZHT = OpenCC("s2twp").convert(ZH)
    print("[i18n] opencc ok, zht len", len(ZHT))
except Exception as e:
    ZHT = None
    print("[i18n] opencc FAILED:", e)

def esc_js_str(s):
    return json.dumps(s, ensure_ascii=False)

packs = {"en": EN, "ja": JA, "zh-hant": ZHT}
for name, val in packs.items():
    fp = P("src", "i18n", "packs", name + ".js")
    lines = io.open(fp, encoding="utf-8").read().split("\n")
    hit = [k for k, ln in enumerate(lines) if "整套重写第四版" in ln]
    assert len(hit) == 1, (name, hit)
    del lines[hit[0]]
    last = max(k for k, ln in enumerate(lines) if ln.strip() == "};")
    if val is None:
        print("[i18n] %s: skip value (opencc failed)" % name)
        continue
    entry = "  " + esc_js_str(ZH) + ": " + esc_js_str(val) + ","
    lines.insert(last, entry)
    io.open(fp, "w", encoding="utf-8", newline="").write("\n".join(lines))
    print("[i18n] %s: v4 key removed, v5 entry inserted at line %d (len %d)" % (name, last + 1, len(entry)))

# ---------- 3) README ----------
rd_path = P("README.md")
rd = io.open(rd_path, encoding="utf-8").read()
anchor = "  - EXTRA 终盘《恶魔之妹》"
k = rd.index(anchor)
kEnd = rd.index("\n", k)
new_readme = (
"  - EXTRA 终盘《恶魔之妹》第五次重做（v5）：上一版被指「重复音太多、中段乱、狂气不足、U.N. 主题太少」，"
"这一版只改一件事——让 U.N. 的旋律在前四十秒就现身、并且一直是主角。引子 I 只有八音盒把第 20–27 小节的副歌 hook "
"一颗一颗掰开，第 9 小节乐队带着同一句进场，第 33 小节在 blast beat 上第一次正面砸下来，不用等副歌，四十秒就知道这是谁；"
"全曲仍只用 U.N. 的三块真素材（第 3–4 小节时钟琶音、第 20–27 小节副歌 hook、第 12–19 小节半音下行），逐音搬入、"
"整体前移 0.25 拍落到正拍，按 200 BPM / D 小调 / 125 小节排成 150.0 秒一循环（引子 I 8 / 引子 II 8 / A1 8 / A2 8 / B1 8 / "
"C1 16 / Bridge 6 / B2 8 / C2 16 / Solo 8 / Break 4 / D 12 / Coda 8 / Outro 7），数据由 ~B~tools/build/_fld_compose5.py~B~"
"（复用 ~B~_fld_compose2.py~B~ 的鼓组与音色模型）生成到 ~B~src/engine/songs/flandre_devil.js~B~（15 轨 / 8112 音 / 2913 鼓）。"
"其余全是给旋律让路的织体：A 段八分 riff 带休止留空隙、重复的十六分音墙砍掉一半、十五轨只在副歌全开，段尾用通鼓、"
"军鼓滚奏、反向吊镲与半小节上行把切点磨圆（填充鼓力度乘 0.80 / 0.68 压峰，只剩第 24、32 小节比段内均值高约 2 dB）；"
"狂气改为靠密度：第 34–36 小节三全音簇加半音颤音、第 63 小节半音下行叠双踩、第 79 小节整段升半音、"
"第 99 小节在 blast beat 上一路碾碎、Bridge 放故障 drone 与刀声，飞刀轨在 B1 / Bridge / D / Solo 的接缝各撒一把，"
"副歌每小节弱拍闪一下玻璃琶音。混音把 lead 增益提到 0.250、鼓组压到 0.70、吉他 0.052、钢琴 0.075，"
"~B~--stems~B~ 复测副歌 lead 只比鼓低 1.4 dB、比吉他高 9.0 dB；再对 B1（40.8–48.0 s）−0.5 dB、C1（48.0–67.2 s）+1.0 dB、"
"B2（74.4–85.2 s）−0.5 dB、C2（85.2–103.2 s）+1.0 dB、Solo（103.2–112.8 s）−1.2 dB 做段平衡。"
"WAV 仍由 ~B~tools/build/_exsr_render.py~B~ 离线渲染（22050 Hz 单声道 150.000 s PCM16，6,615,044 B）：峰值 0.486 / "
"RMS -19.50 dBFS / 0 削顶 / 循环接缝 0.0008（滑差 0.0076，全曲 2.9% 分位，1 kHz 以下 0.0021）/ 谱心 893 Hz；"
"逐段 RMS：引子 I -26.5 / 引子 II -21.0 / A1 -19.4 / A2 -18.4 / B1 -20.0 / C1 -17.6 / Bridge -20.7 / B2 -20.2 / "
"C2 -17.5 / Solo -18.3 / Break -22.0 / D -18.8 / Coda -24.6 / Outro -28.1。"
"转成 1,703,438 B 的 MP3（VBR mean 90.85 kbps）挂 ~B~extra.audio~B~（带 ~B~?v=~B~），fetch 失败自动回退 ~B~flandre_devil.js~B~ 的合成数据。"
)
new_readme = new_readme.replace("~B~", chr(96))
rd_new = rd[:k] + new_readme + rd[kEnd:]
io.open(rd_path, "w", encoding="utf-8", newline="").write(rd_new)
print("[README] bullet replaced: %d -> %d chars" % (kEnd - k, len(new_readme)))

# ---------- 4) NETWORK_CN ----------
nw_path = P("docs", "NETWORK_CN.md")
nw = io.open(nw_path, encoding="utf-8").read()
old_row = "| ~B~flandre_devil~B~ | EXTRA 终盘（恶魔之妹） | 6,615,044 B | **1,702,478 B** |".replace("~B~", chr(96))
new_row = "| ~B~flandre_devil~B~ | EXTRA 终盘（恶魔之妹） | 6,615,044 B | **1,703,438 B** |".replace("~B~", chr(96))
assert old_row in nw, "row miss"
nw = nw.replace(old_row, new_row)
old_tot = "| 合计 | | 20,248,206 B | **5,612,058 B（−72.3%）** |"
new_tot = "| 合计 | | 20,248,206 B | **5,618,696 B（−72.3%）** |"
assert old_tot in nw, "total miss"
nw = nw.replace(old_tot, new_tot)
io.open(nw_path, "w", encoding="utf-8", newline="").write(nw)
print("[NETWORK] mp3 rows updated")

# ---------- 5) version 1.6.37 -> 1.6.38 ----------
files = ["index.html", "src/ui/platform.js", "sw.js", "src/engine/songs/index.js"]
tot = 0
for rel in files:
    fp = P(*rel.split("/"))
    s = io.open(fp, encoding="utf-8").read()
    n = s.count("1.6.37")
    s = s.replace("1.6.37", "1.6.38")
    io.open(fp, "w", encoding="utf-8", newline="").write(s)
    tot += n
    print("[ver] %-28s %d" % (rel, n))
print("[ver] total", tot)
