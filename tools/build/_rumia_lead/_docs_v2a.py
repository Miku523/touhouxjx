# -*- coding: utf-8 -*-
"""把 stage1 v2 落到音乐室 / i18n / README / NETWORK / AUDIT + 版本串 1.6.58。"""
import os, re, json, subprocess

ROOT = r'C:\Users\GuSheng\Downloads\HKS'
os.chdir(ROOT)

ZH = ("一面 Boss 曲（1:44 · 第二版）。这一版把原曲整个搬了回来：ZUN 扒谱 MIDI 的 34 小节逐音搬入，"
      "风琴前奏、铁琴过门、钢琴对句、电吉他切分一个没删。改的全在编排上：引子压到 6 秒，八音盒把主题首句连同后半句一起哼完，"
      "红夜一开场就听得出是谁的曲子；风琴段只留八分闭镲与 ride，铁琴段换另一半镲，鼓组不再从头到尾一个样；"
      "钢琴加倍只在时值够长的音上叠，主旋律不再被对句糊住，长音上加一层高八度玻璃点音；"
      "变奏 II 中段整段抽空 4.8 秒，只剩钢琴三十二分下行、drone 与心跳，然后铜管加高八度砸回来；"
      "尾声 6.5 秒，drone、弦乐、心跳垫在八音盒底下，停在降 E 悬置和弦上接回引子，循环点不断气。"
      "她一天吃一次黎明，这条小径她走不出去。"
      "\\n——露米娅：「还没亮吧？那我再走一圈。」")

EN = ("Stage 1 boss theme (1:44, second version). The whole original is carried in again — all 34 bars of ZUN's "
      "transcribed MIDI, note for note: organ intro, glockenspiel bridge, piano answers, electric-guitar syncopation, "
      "nothing cut. The rework is all in the arrangement. The intro is down to six seconds: the music box hums the "
      "theme's first phrase together with its answering phrase, so from the first bar you know whose theme this is. "
      "The organ section keeps only eighth-note closed hats and a ride, the glockenspiel section takes the other half "
      "of the hats — the kit no longer sounds the same from start to finish. Piano doubling is laid only on notes long "
      "enough to carry it, so the counter-lines stop smothering the melody, and long notes get a glassy octave bell on "
      "top. In the middle of Variation II the whole band is hollowed out for 4.8 seconds — only a 32nd-note piano "
      "descent, a drone and a heartbeat — before the brass slams back an octave up. The 6.5-second coda lays drone, "
      "strings and heartbeat under the music box and settles on a suspended E-flat chord that loops straight back into "
      "the intro. She eats dawn once a day; she still cannot leave that little path."
      "\\n— Rumia: \"It's not light yet, is it? Then I'll walk one more lap.\"")

JA = ("一面ボス曲（1:44・第二版）。今回は原曲をまるごと持ち帰った。ZUN の採譜 MIDI、34 小節を一音ずつそのまま――"
      "オルガンの前奏、鉄琴のつなぎ、ピアノの応答、エレキギターのシンコペーション、どれも削っていない。手を入れたのは編曲の側だけ。"
      "前奏は 6 秒に縮め、オルゴールが主題の頭とその後の句をまとめて口ずさむので、最初の一音から誰の曲か分かる。"
      "オルガン段は八分のクローズドハットとライドだけ、鉄琴段は残りの半分のハットを引き受け、ドラムは最初から最後まで同じ顔をしなくなった。"
      "ピアノの重ねは長く伸びる音にだけ敷き、対旋律が主旋律を覆わないようにし、長い音にはオクターブ上のガラスの点音を乗せた。"
      "変奏 II の中盤は 4.8 秒まるごと空洞になり、三十二分のピアノ下降とドローン、心臓の鼓動だけが残る。そこから金管がオクターブ上で叩き戻す。"
      "6.5 秒の終結はオルゴールの下にドローン、弦、鼓動を敷き、変ホの保留和音で引っ張って前奏へ戻る。"
      "彼女は一日に一度夜明けを食べる。この小道からは出られない。"
      "\\n——ルーミア：「まだ明けない？ じゃあ、もう一周するね。」")

# ---------- 1. musicTracks ----------
p = 'src/game/musicTracks.js'
s = open(p, encoding='utf-8').read()
i = s.index("key: 'stage1',")
j = s.index("\n  },", i)
blk = s[i:j]
assert 'time: 113.0,' in blk and '一面 Boss 曲（1:53' in blk
blk2 = blk.replace('time: 113.0,', 'time: 103.7,')
_ns = blk2.index("    note:\n      '") + len("    note:\n      '")
_ne = blk2.rindex("'")
old_note = blk2[_ns:_ne]
assert '一面 Boss 曲' in old_note, old_note[:80]
print('old note len', len(old_note))
new_note = ZH.replace("\\n", "\n").replace("'", "\\'")
blk2 = blk2[:_ns] + new_note + blk2[_ne:]
s = s[:i] + blk2 + s[j:]
open(p, 'w', encoding='utf-8', newline='').write(s)
print('musicTracks stage1 ->', '103.7', len(ZH))

# ---------- 2. i18n ----------
def add_entry(pack, trans):
    p2 = 'src/i18n/packs/%s.js' % pack
    t = open(p2, encoding='utf-8').read()
    lines = t.split('\n')
    key_old = json.dumps(old_note, ensure_ascii=False)
    hit = [k for k, l in enumerate(lines) if l.startswith('  ') and l.startswith('  ' + key_old[:10])]
    # 更稳：找包含旧 note 开头片段的整行
    frag = old_note[:18]
    hit = [k for k, l in enumerate(lines) if frag in l]
    assert len(hit) == 1, (pack, hit[:5])
    lines.pop(hit[0])
    entry = '  ' + json.dumps(ZH.replace('\\n', '\n'), ensure_ascii=False) + ': ' + json.dumps(trans.replace('\\n', '\n'), ensure_ascii=False) + ','
    # 插到最后一个 "};" 之前
    k = max(kk for kk, l in enumerate(lines) if l.strip() == '};')
    lines.insert(k, entry)
    open(p2, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
    print(pack, 'note replaced, keys', len(lines))

add_entry('en', EN)
add_entry('ja', JA)
# zh-hant 用 opencc 转
import opencc
cc = opencc.OpenCC('s2twp')
add_entry('zh-hant', cc.convert(ZH))

# ---------- 3. 版本串 ----------
for vp, n in (('index.html', None), ('src/ui/platform.js', None), ('sw.js', None), ('src/engine/songs/index.js', None)):
    t = open(vp, encoding='utf-8').read()
    c = t.count('1.6.57')
    t = t.replace('1.6.57', '1.6.58')
    open(vp, 'w', encoding='utf-8', newline='').write(t)
    print('version', vp, c)
