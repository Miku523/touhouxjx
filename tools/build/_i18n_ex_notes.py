# -*- coding: utf-8 -*-
"""把音乐室两条解说（EX 中段 / EX Boss）的新文本补进 en/ja/zh-hant 翻译包。"""
import json, sys

OLD_SEP = ('EXTRA 中段。圆舞曲，一转一转地逼过来。主旋律一个音没改，改的是脚下的重量：原本只有钢琴的弱前奏，'
           '我把整个乐队塞进去，开场就贴脸；中间她让开一小段，只剩钢琴打转，然后弦乐和管风琴一起压下来。'
           '一圈跳完，够她把那句谎说完。\n——雷米莉亚：「圆舞要跳完。你站着不动，我才难办。」')
OLD_UN = ('EXTRA Boss 曲。芙兰朵露把音量开到最大，说这样才听得见曲子里的心跳。鼓一推到底，踩镲像鞭子。'
          '最后砸下去的那个和弦，没回到该回的地方。她在门里待了四百九十五年，没有第二个晚上可以回。'
          '\n——芙兰朵露：「回去？回哪儿去？」')

NEW_SEP = ('EXTRA 中段。这回一个音都没有改：四四拍的原速、原段落、原编制，钢琴、弦乐、小号、管风琴照原样搬进来，'
           '连前奏那八小节都留着。改的只有脚下的重量——定音鼓踩在正拍上，大吊镲压在每段第一拍，贝斯沉到低八度。'
           '不抢、不飘，一圈一圈往下压。\n——雷米莉亚：「圆舞要跳完。你站着不动，我才难办。」')
NEW_UN = ('EXTRA Boss 曲。鼓组整个撤了，只留远处一下一下的心跳和一记吊镲。旋律也一个音没改，只是把织体抬到高音区、'
          '低音压到很低，中间空出来。每个音都落在很远的地方，混响比乐句还长——回来的时候，已经不是原来那个音了。'
          '她在门里待了四百九十五年，喊出去的话没有回声，只有回音。\n——芙兰朵露：「有人吗？」')

TR = {
 'en': {
  NEW_SEP: ('Extra midpoint theme. This time not a single note was changed: the original 4/4 tempo, the original sections, '
            'the original orchestration — piano, strings, trumpet and organ carried over as they are, down to the eight-bar intro. '
            'Only the weight underneath was rewritten: timpani on the downbeats, a crash cymbal on the first beat of every section, '
            'the bass sunk an octave lower. Nothing rushes, nothing floats; it presses down one turn at a time.\n'
            '— Remilia: "A waltz must be danced to the end. If you just stand there, it makes things difficult for me."'),
  NEW_UN: ('Extra boss theme. The drum kit is gone entirely; only a heartbeat thumps somewhere far away now and then, and one crash cymbal. '
           'Not one note of the melody was changed either — the texture was lifted into the high register, the bass pressed far down, '
           'and the middle left empty. Every note lands somewhere very far away, and the reverb outlasts the phrase; by the time it comes back '
           'it is no longer the same note. She waited four hundred and ninety-five years behind that door. What she shouted out came back '
           'as an echo, but never as an answer.\n— Flandre: "Is anyone there?"'),
 },
 'ja': {
  NEW_SEP: ('EXTRA 中段。今回は一音も変えていない。四四拍の元のテンポ、元の構成、元の編成——ピアノ、弦楽、トランペット、'
            'オルガンをそのまま持ち込み、八小節のイントロまで残した。書き直したのは足元の重さだけ。ティンパニが表拍を踏み、'
            '各段の一発目に大シンバル、ベースはオクターブ下へ。焦らず、浮かず、一巡ごとに下へ沈んでいく。\n'
            '——レミリア「円舞曲は最後まで踊るものよ。あなたが立ったまま動かないから、私が困るの。」'),
  NEW_UN: ('EXTRA Boss 曲。ドラムセットは丸ごと外した。遠くで時折鳴る心臓の音と、シンバル一発だけが残る。旋律も一音も変えていない。'
           'ただ織体を高音域へ上げ、低音を下げ、真ん中を空けた。どの音もとても遠い場所に落ちて、残響はフレーズより長い——'
           '戻ってきた頃には、もう元の音ではない。彼女はあの扉の向こうで四百九十五年待った。叫んだ声はこだまになって返ってきたけれど、'
           '返事にはならなかった。\n——フランドール「誰か、いる？」'),
 },
 'zh-hant': {
  NEW_SEP: ('EXTRA 中段。這回一個音都沒有改：四四拍的原速、原段落、原編制，鋼琴、弦樂、小號、管風琴照原樣搬進來，'
            '連前奏那八小節都留著。改的只有腳下的重量——定音鼓踩在正拍上，大吊鈸壓在每段第一拍，貝斯沉到低八度。'
            '不搶、不飄，一圈一圈往下壓。\n——蕾米莉亞：「圓舞要跳完。你站著不動，我才難辦。」'),
  NEW_UN: ('EXTRA Boss 曲。鼓組整個撤了，只留遠處一下一下的心跳和一記吊鈸。旋律也一個音沒改，只是把織體抬到高音區、'
           '低音壓到很低，中間空出來。每個音都落在很遠的地方，殘響比樂句還長——回來的時候，已經不是原來那個音了。'
           '她在門裡待了四百九十五年，喊出去的話沒有回聲，只有回音。\n——芙蘭朵露：「有人嗎？」'),
 },
}

for pack, table in TR.items():
    path = 'src/i18n/packs/%s.js' % pack
    lines = open(path, encoding='utf-8').read().split('\n')
    out, hit = [], 0
    for ln in lines:
        s = ln.strip()
        key = None
        if s.startswith('"') and '": "' in s:
            k = s.index('": "')
            try:
                key = json.loads(s[:k + 1])
            except Exception:
                key = None
        if key in (OLD_SEP, OLD_UN):
            new_key = NEW_SEP if key == OLD_SEP else NEW_UN
            val = table[new_key]
            out.append('  ' + json.dumps(new_key, ensure_ascii=False) + ': '
                       + json.dumps(val, ensure_ascii=False) + ',')
            hit += 1
        else:
            out.append(ln)
    assert hit == 2, (pack, hit)
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(out))
    print('%s: 替换 2 条解说' % pack)
