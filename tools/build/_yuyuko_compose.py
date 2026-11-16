# -*- coding: utf-8 -*-
"""tools/build/_yuyuko_compose.py —《幽雅に咲かせ、墨染の桜 ～ Border of Life》(ZUN TH07)
幽幽子 (Yuyuko Saigyouji) 主题重配器生成器。

做法 = 仓库既定风格「ZUN 原 MIDI 逐音搬入 + 重配器」：
  * 原谱 20 段 tempo map 原样保留（不压成固定 BPM）；
  * 主旋律 ch2 逐音照搬，ch12（= ch2 +12）作末段八度光环；
  * 低音 ch4 逐音照搬，鼓 = 原曲 ch9 重新配平（削镲/ride 力度，保鼓型）；
  * 和弦织体 ch0 重配为 harpsi(竖琴钢琴) + piano + strings，并派生
    竖琴/钟琴琶音、弦乐铺底、峰值人声铺底、段落钟声；
  * ZUN 自己的第 6/11 声道六度对位 = 唯一一条「优雅的对位线」；
  * 原谱没有任何新写的旋律：所有新声部都只是原谱已有音符的
    「持续化 / 琶音化 / 换音色 / 加八度」重配。

生成： src/engine/songs/yuuga_stage5.js
用法： python tools/build/_yuyuko_compose.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))

import midi2js  # noqa: E402

MIDI_PATH = os.path.join(
    ROOT, "tools", "build", "_midi", "src",
    "13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid")
OUT_JS = os.path.join(ROOT, "src", "engine", "songs", "yuuga_stage5.js")
OUT_JSON = os.path.join(HERE, "_yuyuko_kit", "arrangement.json")

TITLE = "幽雅に咲かせ、墨染の桜 ～ Border of Life"
EXPORT = "YUGA_STAGE5"
KEY = "stage5"

# ---------------------------------------------------------------- 原谱读取
midi = midi2js.parse_midi(MIDI_PATH)
CH, SEGS, DIV = midi2js.extract_channels(midi)


def t2s(tick):
    """tick -> 秒（原谱 tempo map 分段线性插值，20 段速度全部保留）"""
    seg = SEGS[0]
    for s in SEGS:
        if s[0] <= tick:
            seg = s
        else:
            break
    return seg[1] + (tick - seg[0]) * seg[2] / (DIV * 1e6)


BARS = [t2s(b * 1920) for b in range(0, 120)]          # 每小节 4/4 = 1920 tick
DURATION = round(max(n["t"] + n["d"] for ch in CH.values()
                   for n in (ch.get("notes") or [])), 3)   # 原曲总长
INTRO_END = round(BARS[9], 3)                         # bar 9  = 主歌起点
VERSE_END = round(BARS[42], 3)                        # bar 42 = 副歌起点
CHORUS_END = round(BARS[75], 3)                       # bar 75 = 尾奏起点
P3 = round(BARS[58], 3)                               # 副歌第 3 乐句
P4 = round(BARS[66], 3)                               # 副歌第 4 乐句（峰值）
LAST_BAR = 89


def bar_of(t):
    lo, hi = 0, len(BARS) - 1
    best = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        if BARS[mid] <= t:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def notes_of(ch):
    return CH.get(ch, {}).get("notes", []) or []


def groups_of(ch, tol=0.02):
    """把同一和弦的音符（同一击点）分组"""
    out = []
    cur = []
    for n in sorted(notes_of(ch), key=lambda x: x["t"]):
        if cur and n["t"] - cur[0]["t"] > tol:
            out.append(cur)
            cur = []
        cur.append(n)
    if cur:
        out.append(cur)
    return out


def clamp_d(d):
    return max(0.03, min(4.0, float(d)))


def vv(v, lo=1, hi=127):
    return int(max(lo, min(hi, round(v))))


def pack(items):
    """[[t,m,d,v]] -> 引擎可用格式；越界裁掉、时长夹到 [0.03,4.0]"""
    out = []
    for t, m, d, v in items:
        t = round(float(t), 3)
        if t < 0 or t >= DURATION:
            continue
        d = round(clamp_d(d), 3)
        # 留出尾巴空间：结尾音符不要顶到 duration，否则被硬切会咔哒
        if t + d > DURATION - 0.05:
            d = round(max(0.03, DURATION - 0.05 - t), 3)
        out.append([t, int(m), d, vv(v)])
    return out


def track(name, wave, gain, notes):
    return {"name": name, "wave": wave, "gain": gain, "notes": pack(notes)}


# ---------------------------------------------------------------- 段落力度
def sec_scale(t):
    """各段落的主织体力度（副歌稍收，给主旋律让位）"""
    if t < INTRO_END:
        return 1.0
    if t < VERSE_END:
        return 1.0
    if t < CHORUS_END:
        return 0.78
    return 0.9


# ================================================================ 声部构建
tracks = []

# --- 1) 主旋律：原谱 ch2（方波主音）逐音照搬，副歌独唱
lead_items = [(n["t"], n["m"], n["d"], n["v"]) for n in notes_of(2)]
tracks.append(track("lead", "square", 0.24, lead_items))

# --- 2) 八度光环：原谱 ch12（= ch2 +12），只在副歌后两个乐句（P3+P4）
halo_items = []
for n in notes_of(12):
    if n["t"] < P3:
        continue
    k = 0.55 if n["t"] < P4 else 1.0        # P3 轻、P4 托起（渐强进入峰值）
    halo_items.append((n["t"], n["m"], n["d"], n["v"] * k))
tracks.append(track("lead", "square", 0.19, halo_items))    # 八度光环：音色名 = lead

# --- 3) 对位线：原谱 ch6（铜管六度）+ ch11（= ch6 +12，弱化为余音）
counter_items = []
for n in notes_of(6):
    counter_items.append((n["t"], n["m"], n["d"], n["v"] * 0.95))
for n in notes_of(11):
    counter_items.append((n["t"], n["m"], n["d"], n["v"] * 0.42))
tracks.append(track("counter", "triangle", 0.085, counter_items))

# --- 4) 琶音：原谱 ch7（主旋律的十六分花音分解），副歌 P2 之后
arp_items = [(n["t"], n["m"], n["d"], n["v"] * 0.8) for n in notes_of(7)]
tracks.append(track("arp", "triangle", 0.115, arp_items))

# --- 5) 竖琴钢琴：原谱 ch0 主织体，重配音色 + 段落力度
harpsi_items = [(n["t"], n["m"], n["d"], n["v"] * sec_scale(n["t"])) for n in notes_of(0)]
tracks.append(track("harpsi", "triangle", 0.089, harpsi_items))

# --- 6) 钢琴：原谱 ch1(左手) + ch3(电钢) + ch5(十六分跑动) + ch8(副歌五度柱)
piano_items = []
for n in notes_of(1):
    piano_items.append((n["t"], n["m"], n["d"], n["v"] * 0.95))
for n in notes_of(3):
    piano_items.append((n["t"], n["m"], n["d"], n["v"] * 0.8))
for n in notes_of(5):
    piano_items.append((n["t"], n["m"], n["d"], n["v"] * 0.6))
for n in notes_of(8):
    piano_items.append((n["t"], n["m"], n["d"], n["v"] * 0.7))
tracks.append(track("piano", "triangle", 0.064, piano_items))

# --- 7) 弦乐：原谱 ch10 + ch14
strings_items = []
for n in notes_of(10):
    strings_items.append((n["t"], n["m"], n["d"], n["v"] * 0.95))
for n in notes_of(14):
    strings_items.append((n["t"], n["m"], n["d"], n["v"] * 0.8))
tracks.append(track("strings", "sawtooth", 0.075, strings_items))

# --- 8) 低音：原谱 ch4（十六分低音）逐音照搬 + ch15（副歌根音五度）
bass_items = [(n["t"], n["m"], n["d"], n["v"]) for n in notes_of(4)]
for n in notes_of(15):
    bass_items.append((n["t"], n["m"], n["d"], n["v"] * 0.85))
tracks.append(track("bass", "triangle", 0.13, bass_items))

# --- 9) 竖琴/钟琴琶音：由原谱 ch0 的和弦音高直接拆成上行琶音（不新写音）
G0 = groups_of(0)
celesta_items = []
for g in G0:
    t = g[0]["t"]
    span = max(n["t"] + n["d"] for n in g) - t
    if span < 0.12:
        continue
    b = bar_of(t)
    intro = t < INTRO_END
    outro = t >= CHORUS_END
    in_verse = INTRO_END <= t < VERSE_END
    first_in_bar = not any(
        bar_of(x["t"]) == b and x["t"] < t - 1e-6 for x in notes_of(0))
    if not (intro or outro or (in_verse and first_in_bar)):
        continue
    ps = sorted(set(n["m"] for n in g))
    if in_verse and not first_in_bar:
        continue
    n_notes = len(ps)
    if in_verse and first_in_bar:
        n_notes = min(4, n_notes)
    step = span / float(n_notes)
    for i, p in enumerate(ps[:n_notes]):
        vel = 52 + int(38.0 * i / max(1, n_notes - 1))
        celesta_items.append((t + i * step, p, min(step * 0.92, 0.9), vel))
# 尾奏：原谱 ch0 中断，改用原谱 ch1（左手琶音）上移八度当竖琴收束
for n in notes_of(1):
    if n["t"] < CHORUS_END:
        continue
    celesta_items.append((n["t"], n["m"] + 12, min(n["d"] * 1.6, 0.9), 58))
tracks.append(track("bell", "sine", 0.075, celesta_items))    # 竖琴/钟琴琶音：音色名 = bell

# --- 10) 弦乐铺底：把 ch0 的和弦音「拉长」成持续音（主歌 / 引子 / 尾奏）
pad_items = []
for g in G0:
    t = g[0]["t"]
    if VERSE_END <= t < CHORUS_END:
        continue
    span = max(n["t"] + n["d"] for n in g) - t
    if span < 0.18:
        continue
    ps = sorted(set(n["m"] for n in g))
    root = ps[0]
    pcs = []
    for p in ps:
        pc = p % 12
        if pc in [q % 12 for q in pcs]:
            continue
        cand = p
        while cand - root > 12:
            cand -= 12
        while cand <= root:
            cand += 12
        if cand > 72:
            cand -= 12
        pcs.append(cand)
    pcs = [root] + pcs[:2]
    for p in pcs:
        pad_items.append((t, p, min(span + 0.45, 4.0), 54))
# 尾奏：原谱 ch0 中断，用 ch1（左手琶音）拉长成暖底
for n in notes_of(1):
    if n["t"] < CHORUS_END:
        continue
    pad_items.append((n["t"], n["m"], min(n["d"] * 3.2, 3.2), 46))
tracks.append(track("pad", "sawtooth", 0.052, pad_items))

# --- 11) 人声铺底：副歌峰值 P4，按小节取原谱（含主旋律）出现最多的音级，
#         铺成持续和弦（全部取自原谱已有音高）
choir_items = []
for b in range(bar_of(P4), bar_of(CHORUS_END) + 1):
    t0 = BARS[b]
    t1 = BARS[b + 1] if b + 1 < len(BARS) else CHORUS_END
    weight = {}
    for ch in (0, 2, 12):
        for n in notes_of(ch):
            if t0 <= n["t"] < t1:
                weight[n["m"] % 12] = weight.get(n["m"] % 12, 0.0) + n["d"]
    if not weight:
        continue
    pcs = [pc for pc, _ in sorted(weight.items(), key=lambda kv: -kv[1])[:3]]
    v = 52 if b == bar_of(P4) else 62
    for pc in pcs:
        pitch = 75 + (pc % 12)
        while pitch > 87:
            pitch -= 12
        choir_items.append((t0, pitch, min((t1 - t0) + 0.35, 4.0), v))
tracks.append(track("choir", "sawtooth", 0.105, choir_items))

# --- 12) 段落钟声：引子 / 主歌 / 副歌 / 副歌第 3 句 / 尾奏 各一击
bell_items = []
for b in (1, 9, 42, 58, 75):
    t0 = BARS[b]
    mel = [n for n in notes_of(2) if t0 - 0.6 <= n["t"] < t0 + 1.2]
    if mel:
        pitch = min(mel, key=lambda n: abs(n["t"] - t0))["m"] + 12
    else:
        g = [gg for gg in G0 if t0 - 0.05 <= gg[0]["t"] < t0 + 1.0]
        if g:
            pitch = max(n["m"] for n in g[0]) - 12
        else:
            near = [n for ch in (3, 1) for n in notes_of(ch)
                    if t0 - 0.3 <= n["t"] < t0 + 1.2]
            if not near:
                continue
            pitch = max(n["m"] for n in near) + 12
    pitch = max(70, min(96, pitch))
    bell_items.append((t0, pitch, 4.0, 88))
tracks.append(track("bell", "sine", 0.095, bell_items))

# --- 12b) 风铃拟声：原谱 ch12 音高缩短成金属滴答（引子 / 尾奏）
tick_items = []
for n in notes_of(0):
    if not (n["t"] < INTRO_END or n["t"] >= CHORUS_END):
        continue
    if n["m"] < 76:
        continue
    tick_items.append((round(n["t"], 3), n["m"], 0.09, max(1, min(127, int(n["v"] * 0.45)))))
tick_items = tick_items[:40] + tick_items[-40:]
tracks.append(track("tick", "square", 0.085, tick_items))

# --- 12c) 绸缎上扬：副歌前 / 尾奏前的 riser（音高取原谱主旋律）
riser_items = []
for b, srcs in ((41, (2, 7, 10)), (74, (2, 7))):
    t0 = BARS[b]
    p = None
    for src in srcs:
        mel = [n for n in notes_of(src) if t0 - 2.0 <= n["t"] < t0 + 1.0]
        if mel:
            p = max(mel, key=lambda n: n["m"])["m"]
            break
    if p is None:
        mel = notes_of(10)
        p = max(mel, key=lambda n: n["m"])["m"] if mel else 72
    riser_items.append((round(t0 - 1.2, 3), p + 12, 1.6, 44))
tracks.append(track("riser", "triangle", 0.05, riser_items))

# --- 13) 鼓：原谱 ch9 重新配平（保鼓型，削镲/ride 力度）
DRUM_KIND = {36: 0, 38: 1, 40: 1, 41: 1, 42: 2, 44: 2, 45: 2,
             46: 3, 48: 4, 49: 4, 50: 4}
DRUM_VEL = {0: 0.92, 1: 0.88, 2: 0.52, 3: 0.63, 4: 0.70}
drums = []
for n in notes_of(9):
    k = DRUM_KIND.get(n["m"])
    if k is None:
        continue
    t = round(n["t"], 3)
    if t >= DURATION - 0.45:          # 结尾留白，别把军鼓/镲砍在缝上
        continue
    drums.append([t, k, vv(n["v"] * DRUM_VEL[k], 1, 127)])

# v3 拟声：引子钟摆（高音通鼓）、副歌/尾奏前一刀（reverse crash）
for b in range(1, 9):
    drums.append([round(BARS[b], 3), 6, 42])
drums.append([round(BARS[42] - 0.8, 3), 8, 74])
drums.append([round(BARS[75] - 0.8, 3), 8, 62])
drums.sort(key=lambda x: x[0])

# ================================================================ 写出 JS
song = {
    "title": TITLE,
    "duration": DURATION,
    "bpm": 144.0,
    "tracks": tracks,
    "drums": drums,
    "tail": {"pad": 1.0, "choir": 0.9, "strings": 0.6, "lead": 0.3,
             "counter": 0.3, "bell": 1.0},
}

lines = []
lines.append("// 生成物：tools/build/_yuyuko_compose.py（勿手改）")
lines.append("// 素材：ZUN《幽雅に咲かせ、墨染の桜 ～ Border of Life》TH07 原谱 MIDI，")
lines.append("//       原曲 20 段 tempo map（144→155→rall→155→148）与全部小节结构照搬，未压成固定 BPM。")
lines.append("// 配器：原旋律 ch2 逐音照搬作主唱；ch12(=ch2+12) 作副歌后段八度光环；")
lines.append("//       低音 ch4 逐音照搬；鼓 = 原曲 ch9 重新配平；ch0 重配为竖琴钢琴 + 琴 + 弦乐；")
lines.append("//       ch6/ch11 作唯一对位线；ch7 作副歌琶音；竖琴琶音 / 弦乐铺底 / 峰值人声 / 段落钟声")
lines.append("//       全部由原谱已有音高派生，未新写任何旋律。")
lines.append("export const %s = {" % EXPORT)
lines.append("  %s: {" % KEY)
lines.append("    title: %s," % json.dumps(TITLE, ensure_ascii=False))
lines.append("    duration: %s," % DURATION)
lines.append("    bpm: %s," % song["bpm"])
lines.append("    tracks: [")
for tr in tracks:
    lines.append("      { name: %s, wave: %s, gain: %s, notes: [" % (
        json.dumps(tr["name"]), json.dumps(tr["wave"]), tr["gain"]))
    row = []
    for i, n in enumerate(tr["notes"]):
        row.append(json.dumps(n, separators=(",", ":")))
        if len(row) >= 12:
            lines.append("        " + ",".join(row) + ",")
            row = []
    if row:
        lines.append("        " + ",".join(row))
    lines.append("      ] },")
lines.append("    ],")
lines.append("    drums: [")
row = []
for d in drums:
    row.append(json.dumps(d, separators=(",", ":")))
    if len(row) >= 12:
        lines.append("      " + ",".join(row) + ",")
        row = []
if row:
    lines.append("      " + ",".join(row))
lines.append("    ],")
lines.append("    tail: %s," % json.dumps(song["tail"]))
lines.append("  }")
lines.append("};")
js = "\n".join(lines) + "\n"

with open(OUT_JS, "w", encoding="utf-8", newline="\n") as f:
    f.write(js)

info = {
    "duration": DURATION,
    "bpm_map": [{"tick": s[0], "sec": round(s[1], 3), "bpm": round(60e6 / s[2], 3)}
                for s in SEGS],
    "bars": {"intro_end": INTRO_END, "verse_end": VERSE_END,
             "chorus_end": CHORUS_END, "P3": P3, "P4": P4},
    "tracks": [{"name": t["name"], "wave": t["wave"], "gain": t["gain"],
                "notes": len(t["notes"])} for t in tracks],
    "drums": len(drums),
    "channels_used": sorted(set([2, 12, 6, 11, 7, 0, 1, 3, 5, 8, 10, 14, 4, 15, 9])),
}
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(info, f, ensure_ascii=False, indent=1)

print("wrote", OUT_JS, len(js), "bytes")
for t in tracks:
    print("  track %-9s wave=%-9s gain=%.3f notes=%d" % (
        t["name"], t["wave"], t["gain"], len(t["notes"])))
print("  drums", len(drums), "duration", DURATION)
