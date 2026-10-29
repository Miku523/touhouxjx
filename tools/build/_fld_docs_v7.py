# -*- coding: utf-8 -*-
import json, os, re
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
import opencc
cc = opencc.OpenCC('s2twp')

zh_note = ("EXTRA Boss 曲（2:30 · 第七版）。前六版不是堆金属就是套 Eurobeat，都像把外来的衣服硬套在芙兰身上。"
"这一版把那些东西全部撤掉，只做一件事：把她自己的曲子原样拆开、重新配器。\n"
"旋律、对位、贝斯线、十六分琶音、鼓组全部逐音来自 ZUN 的原 MIDI（去掉原文件里的重复层和 80 tick 偏移），只换乐器：钢琴、羽管键琴、弦乐、铜管、八音盒、合唱。"
"160 BPM、100 小节，原曲的 80 小节落在第 9–88 小节，前后各接一段新写的引子与尾声。\n"
"引子只有八音盒的钟摆和心跳，一圈一圈把发条拧紧；第 9 小节钢琴把时钟琶音原样倒出来，乐队跟着进——"
"A 段时钟 9–19、B 段半音下行 20–27、副歌 28–43、钢琴分解间奏 44–55、展开 56–71、副歌再现 72–87、尾句 88 收在 D 大调的皮卡迪三度上；"
"尾声 89–100 又崩回八音盒，末拍接回第 1 小节。\n"
"全曲没有一句「鬼畜」，但四百九十五年关在地下室的疯劲全在原曲的半音里：副歌每次回来都抬一点，时钟越转越快，最后收在一只上满发条的八音盒上。\n"
"——芙兰朵露：「呐，再陪我玩一会儿嘛，反正外面也是红的。」")

en_note = ("EXTRA boss theme (2:30, seventh version). The first six versions either piled on metal or wore a Eurobeat costume; both felt borrowed. "
"This one takes all of that away and does a single thing: pull Flandre's own song apart and re-orchestrate it.\n"
"Melody, counterpoint, bass line, sixteenth-note arpeggios and drum kit are taken note for note from ZUN's original MIDI (duplicate layers and the 80-tick offset removed); only the instruments change: piano, harpsichord, strings, brass, music box and choir. "
"160 BPM, 100 bars, with the original 80 bars sitting in bars 9-88 and a newly written intro and outro on either side.\n"
"The intro is only the music box pendulum and a heartbeat, winding the spring tighter turn by turn; at bar 9 the piano pours out the clock arpeggio and the band comes in - "
"clock section 9-19, chromatic descent 20-27, chorus 28-43, piano-breakdown interlude 44-55, development 56-71, chorus reprise 72-87, final phrase at 88 landing on a Picardy third in D major; "
"the outro 89-100 collapses back into the music box and its last beat hands over to bar 1.\n"
"Not a single bar is 'kikagaku', yet the madness of 495 years locked in the basement is all there in the original's semitones: the chorus comes back a little higher each time, the clock spins faster, and it ends on a music box that has been wound to the brim.\n"
"- Flandre: \"Hey, play with me a little longer. It's red outside anyway.\"")

ja_note = ("EXTRA ボス曲（2:30・第七版）。最初の六版はメタルを積むかユーロビートを着せるかで、どちらもフランの身体に他人の服を無理に着せるようだった。"
"この版はそれを全部脱がせて、ひとつだけをやる。彼女自身の曲をそのまま分解して、編成を組み直す。\n"
"旋律も対旋律もベースラインも十六分のアルペジオもドラムも、すべて ZUN の原曲 MIDI から一音ずつ取っている（重複レイヤーと 80 tick のズレを除去）。変えるのは楽器だけ：ピアノ、チェンバロ、弦、金管、オルゴール、合唱。"
"160 BPM・100 小節で、原曲の 80 小節は 9〜88 小節に置き、前後に新しく書いたイントロとアウトロを継ぐ。\n"
"イントロはオルゴールの振り子と心臓の音だけ。少しずつぜんまいを巻き上げ、9 小節でピアノが時計のアルペジオをそのまま零し、バンドが入る——"
"A 時計 9〜19、B 半音下行 20〜27、サビ 28〜43、ピアノ分解の間奏 44〜55、展開 56〜71、サビ再現 72〜87、終句 88 はニ長調のピカルディの三度で着地。"
"アウトロ 89〜100 はまたオルゴールへ崩れ、最後の一拍が 1 小節へ戻る。\n"
"一曲を通して「鬼畜」な場所はないのに、地下室に 495 年閉じ込められた狂気は原曲の半音の中に全部ある。サビは回を追うごとに少し高くなり、時計はどんどん速くなり、最後はぜんまいを巻き切ったオルゴールで終わる。\n"
"——フランドール「ねえ、もう少し遊んでよ。どうせ外も赤いんだから。」")
zh_hant_note = cc.convert(zh_note)

zh_orig_old = "原曲「U.N.欧文就是她吗？」/ 作曲：ZUN / 编曲：Miku523（参考 COOL&CREATE《最終鬼畜妹フランドール・S》）"
zh_orig_new = "原曲「U.N.欧文就是她吗？」/ 作曲：ZUN / 编曲：Miku523（原曲忠实改编）"
orig_map = {
    'en.js': ('Original: U.N. Owen Was Her? / Composed by ZUN / Arranged by Miku523 (a faithful arrangement of the original)'),
    'ja.js': ('原曲「U.N.オーエンは彼女なのか？」/ 作曲：ZUN / 編曲：Miku523（原曲に忠実な編曲）'),
    'zh-hant.js': cc.convert(zh_orig_new),
}
note_map = {'en.js': en_note, 'ja.js': ja_note, 'zh-hant.js': zh_hant_note}

# ---- musicTracks.js ----
p = os.path.join(ROOT, 'src', 'game', 'musicTracks.js')
lines = open(p, encoding='utf-8').read().split('\n')
hit = None
for i, ln in enumerate(lines):
    if '第六版' in ln and 'EXTRA Boss' in ln:
        hit = i
        break
assert hit is not None, 'v6 note line not found'
lines[hit] = '      ' + json.dumps(zh_note, ensure_ascii=False) + '  },'
orig_i = None
for i, ln in enumerate(lines):
    if 'COOL&CREATE' in ln and 'orig:' in ln:
        orig_i = i
        break
if orig_i is None:
    for i, ln in enumerate(lines):
        if '最終鬼畜妹フランドール' in ln and 'orig:' in ln:
            orig_i = i
            break
assert orig_i is not None, 'orig line not found'
lines[orig_i] = "    orig: '" + zh_orig_new + "',"
open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('musicTracks patched note line', hit + 1, 'orig line', orig_i + 1)

# ---- i18n packs ----
for fn in ('en.js', 'ja.js', 'zh-hant.js'):
    p = os.path.join(ROOT, 'src', 'i18n', 'packs', fn)
    lines = open(p, encoding='utf-8').read().split('\n')
    newlines = []
    n_note = n_orig = 0
    for ln in lines:
        if '第六版' in ln and ln.strip().startswith('"'):
            newlines.append('  ' + json.dumps(zh_note, ensure_ascii=False) + ': ' + json.dumps(note_map[fn], ensure_ascii=False) + ',')
            n_note += 1
            continue
        if '最終鬼畜妹フランドール' in ln and ln.strip().startswith('"'):
            newlines.append('  ' + json.dumps(zh_orig_old, ensure_ascii=False) + ': ' + json.dumps(orig_map[fn], ensure_ascii=False) + ',')
            n_orig += 1
            continue
        newlines.append(ln)
    open(p, 'w', encoding='utf-8').write('\n'.join(newlines))
    print(fn, 'note lines replaced', n_note, 'orig lines replaced', n_orig)
