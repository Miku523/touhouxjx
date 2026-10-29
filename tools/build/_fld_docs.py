# -*- coding: utf-8 -*-
import io, pathlib, sys

ROOT = pathlib.Path(r"C:\Users\GuSheng\Downloads\HKS")
fails = []

def read(p): return io.open(ROOT / p, encoding="utf-8").read()
def write(p, s): io.open(ROOT / p, "w", encoding="utf-8", newline="\n").write(s)

def sub(path, old, new, label):
    s = read(path)
    n = s.count(old)
    if n != 1:
        fails.append(f"{label}: count={n}")
        return
    write(path, s.replace(old, new))
    print("OK ", label)

R = "README.md"
sub(R, "合计 5.1 MB", "合计 5.0 MB", "README 25 total size")
sub(R, "EXTRA 终盘芙兰战 \x60src/assets/bgm/extra_mad.mp3\x60",
        "EXTRA 终盘芙兰战《恶魔之妹》\x60src/assets/bgm/flandre_devil.mp3\x60", "README 25 flandre mp3")
sub(R, "（只有 EXTRA 道中曲、U.N. 与结局曲例外，改成离线渲染的 WAV，见下）",
        "（只有 EXTRA 道中曲、芙兰终盘曲与结局曲例外，改成离线渲染的 WAV，见下）", "README 329 exceptions")
sub(R, "芙兰《U.N.オーエンは彼女なのか？》（按原谱重编，见下条）",
        "芙兰《U.N.オーエンは彼女なのか？》（重编成《恶魔之妹》，见下条）", "README 330 flandre")

s = read(R)
a = "EXTRA 中段与终盘两曲放弃自由改编，改为**按 ZUN 原版 MIDI 逐声部搬入**："
b = "；U.N. 155 BPM / 20 轨 / 8568 音 / 361 鼓 / 124.3 秒）"
c = "U.N. 要「空旷 + 孤独，后半段翻成狂气」——"
d = "没有被裁断的回声。"
if s.count(a) != 1 or s.count(b) != 1 or s.count(c) != 1 or s.count(d) != 1:
    fails.append(f"README 334 anchors: {s.count(a)},{s.count(b)},{s.count(c)},{s.count(d)}")
else:
    s = s.replace(a, "EXTRA 中段《亡き王女の為のセプテット》放弃自由改编，改为**按 ZUN 原版 MIDI 逐声部搬入**：")
    s = s.replace(b, "）", 1)
    i = s.index(c); j = s.index(d, i) + len(d)
    retire = ("（旧版 U.N. 搬入式改编已由《恶魔之妹》取代：\x60src/engine/songs/un_mad.js\x60、"
              "\x60tools/build/_ex_arrange.py\x60 与 \x60tools/build/_make_ex_un_wav.py\x60 留作档案，"
              "\x60extra_mad\x60 的母版 WAV 与 MP3 不再随仓库发布。）")
    s = s[:i] + retire + s[j:]

    bullet = ("  - EXTRA 终盘《恶魔之妹》把 最終鬼畜妹フランドール・S 的鬼畜手法灌进 U.N.オーエンは彼女なのか？：200 BPM / D 小调 / 100 小节正好 120.0 秒一循环"
              "（引子 I 8 / 引子 II 8 / A 16 / B 8 / C1 8 / C2 8 / bridge 8 / D1 8 / D2 8 / D2b 8 / coda 12），"
              "数据由 \x60tools/build/_fld_compose.py\x60 生成到 \x60src/engine/songs/flandre_devil.js\x60（15 轨 / 6470 音 / 2304 鼓）。"
              "引子只留钟摆、一颗八音盒音和低音里散不掉的雾；第 8 小节钢琴报出 U.N. 那条时钟琶音（原题逐音不改，只放慢），"
              "第 17 小节起十六分扫弦＋双踩的全编制压上来；B 段拿 最終鬼畜妹 的钟琴引用（U.N. 桥段改十六分）去跟高音半音对句对撞；"
              "副歌把 U.N. 第 20–27 小节的主题降八度逐音搬进来（音域 74–89），吉他十六分 cell、弦乐、合唱唱同一句，D2b 再升半音唱一遍；"
              "coda 不给解决，崩回八音盒接循环。母带后逐段 RMS：引子 -29.2 / A1 -19.4 / A2 -18.6 / B -18.8 / C1 -18.0 / C2 -18.0 / bridge -21.9 / D1 -17.6 / D2 -17.5 / coda -24.9，"
              "副歌 300–3kHz 比追逐段高 3 dB（狂气段靠密度不靠音量）。WAV 用同一套 \x60tools/build/_exsr_render.py\x60 离线渲染"
              "（22050 Hz 单声道 120.000 s PCM16，5,292,044 B）：峰值 0.470 / RMS -19.50 dBFS / 0 削顶 / 循环接缝 0.0033，"
              "转成 1,349,530 B 的 MP3 挂 \x60extra.audio\x60（带 \x60?v=\x60），fetch 失败自动回退 \x60flandre_devil.js\x60 的合成数据。\n")
    k = s.index(retire)
    line_end = s.index("\n", k) + 1
    s = s[:line_end] + bullet + s[line_end:]
    write(R, s)
    print("OK  README 334 rewrite + new bullet")

N = "docs/NETWORK_CN.md"
sub(N, "### 3.2 预渲染 BGM 转 MP3（3 首，−14.8 MB）", "### 3.2 预渲染 BGM 转 MP3（3 首，−15.0 MB）", "NETWORK heading")
sub(N, "| \x60extra_mad\x60 | U.N. 终盘 | 5,483,526 B | **1,401,593 B** |",
        "| \x60flandre_devil\x60 | EXTRA 终盘（恶魔之妹） | 5,292,044 B | **1,349,530 B** |", "NETWORK asset row")
sub(N, "| 合计 | | 20,439,688 B | **5,316,851 B（−74.0%）** |",
        "| 合计 | | 20,248,206 B | **5,264,788 B（−74.0%）** |", "NETWORK totals")
sub(N, "三首 WAV（20.4 MB）", "三首 WAV（20.2 MB）", "NETWORK masters size")
sub(N, "\x60extra_mad\x60 源 WAV 开头有 0.717 s 数字静音；\x60sakuya_ex\x60 的循环点本身有素材级跳变（WAV 一致，MP3 未放大）。",
        "\x60flandre_devil\x60 开场就是满电平的八音盒与钟摆，没有数字静音；\x60sakuya_ex\x60 的循环点本身有素材级跳变（WAV 一致，MP3 未放大）。",
        "NETWORK known traits")

A = "docs/RE_STORY/AUDIT_CURRENT.md"
sub(A, "| 16 | \x60extra\x60 | U.N.オーエンは彼女なのか？（空旷编） | EXTRA | 红魔馆地下 · 血月水晶 | 原曲 / ZUN | 124.3 | \x60:282\x60 |",
        "| 16 | \x60extra\x60 | 恶魔之妹 | EXTRA | 红魔馆地下 · 血月水晶 | 原曲 / ZUN、COOL&CREATE（参考同人改编） | 120 | \x60:236\x60 |",
        "AUDIT row 16")

for p in ("index.html", "src/ui/platform.js", "sw.js"):
    s = read(p)
    n = s.count("1.6.32")
    if n == 0:
        fails.append(f"{p}: no 1.6.32"); continue
    write(p, s.replace("1.6.32", "1.6.33"))
    print(f"OK  {p} version x{n}")

sub("tools/verify_audio_mp3.html", "const TRACKS = ['sakuya_ex', 'festival_box', 'extra_mad'];",
    "const TRACKS = ['sakuya_ex', 'flandre_devil', 'festival_box'];", "verify html TRACKS")

print("FAILS:", fails)
sys.exit(1 if fails else 0)
