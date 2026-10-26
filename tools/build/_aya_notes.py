# -*- coding: utf-8 -*-
"""同步《風神少女》音乐室解说：musicTracks.js + en/ja/zh-hant 三个 i18n pack。

用法：python tools/build/_aya_notes.py
"""
import io

BS = chr(92)
NL = chr(10)
Q = chr(34)

ZH_HEAD = ('四面 Boss 曲。这回连底下的东西也都是原曲：小号那两条旋律、钢琴、风琴、tuba、弦乐、贝斯，'
           '一个音都没改，原速 154、原段落；前四小节我只垫了一层极轻的闭镲，让风先跑起来。'
           '重写的全在脚下：十六分闭镲一路踩成细密的跑动，底鼓压轻了才跑得动，'
           '第九小节起每小节补两记双踩追着旋律，八小节一次的军鼓三连过门像急转。'
           '主旋律要到第二十八小节才出场——风先跑，人再露面。')
ZH_TAIL = '——射命丸文：「快？这是天狗的速度。你追不上的。」'

EN_HEAD = ('STAGE 4 boss theme. This time even the underlayer is the original: the two trumpet lines, '
           'piano, organ, tuba, strings and bass are untouched, at the original tempo of 154 and the '
           'original sections; in the first four bars I only laid down a whisper of closed hats so the '
           'wind starts running. Everything rewritten sits underfoot: sixteenth-note closed hats ticking '
           'tight, the kick pulled back so the beat can actually run, two extra double-kick hits every '
           'bar from bar nine chasing the melody, and a three-hit snare fill every eight bars that turns '
           'like a corner. The main melody does not show up until bar twenty-eight - the wind runs first, '
           'then she appears.')
EN_TAIL = '-- Aya Shameimaru: "Fast? That is tengu speed. You will not catch it."'

JA_HEAD = ('四面ボス曲。今度は下の音まで原曲のまま——トランペットの二本の旋律、ピアノ、オルガン、チューバ、'
           '弦、ベースは一音も変えていない。テンポも154、構成もそのまま。最初の四小節はごく薄いクローズハットを'
           '一枚敷いて、まず風を走らせただけ。書き換えたのは足元だけ：十六分のクローズハットを細かく刻み、'
           'キックは軽く抑えないと走れないので下げ、九小節目からは毎小節ツーバスを二発足して旋律を追い、'
           '八小節ごとにスネア三連のフィルで曲がる。主旋律が出てくるのは二十八小節目から——まず風が走り、'
           'それから彼女が来る。')
JA_TAIL = '——射命丸文「速い？これが天狗の速さだ。追いつけるものか」'

ZT_HEAD = ('四面 Boss 曲。這回連底下的東西也都是原曲：小號那兩條旋律、鋼琴、風琴、tuba、弦樂、貝斯，'
           '一個音都沒改，原速 154、原段落；前四小節我只墊了一層極輕的閉鑔，讓風先跑起來。'
           '重寫的全在腳下：十六分閉鑔一路踩成細密的跑動，底鼓壓輕了才跑得動，'
           '第九小節起每小節補兩記雙踩追著旋律，八小節一次的軍鼓三連過門像急轉。'
           '主旋律要到第二十八小節才出場——風先跑，人再露面。')
ZT_TAIL = '——射命丸文：「快？這是天狗的速度。你追不上的。」'

OLD_PREFIX = '四面 Boss 曲。文坚持号外'


def esc(s):
    return s.replace(BS, BS + BS).replace(Q, BS + Q).replace(NL, BS + 'n')


def pair(head, tail):
    return esc(head + NL + tail)


def patch_music_tracks(path):
    src = io.open(path, encoding='utf-8').read()
    i = src.index(OLD_PREFIX)
    line_start = src.rindex(NL, 0, i) + 1
    # 找到 note 末尾那行（以 "'," 结尾）
    j = src.index("',", i)
    new = "      '" + ZH_HEAD + BS + "n' +" + NL + "      '" + ZH_TAIL + "',"
    src = src[:line_start] + new + src[j + 2:]
    io.open(path, 'w', encoding='utf-8', newline=NL).write(src)
    print('patched', path)


def patch_pack(path, trans):
    lines = io.open(path, encoding='utf-8').read().split(NL)
    key = pair(ZH_HEAD, ZH_TAIL)
    line = '  ' + Q + key + Q + ': ' + Q + trans + Q + ','
    hit = 0
    for k, ln in enumerate(lines):
        if ln.startswith('  ' + Q + OLD_PREFIX):
            lines[k] = line
            hit += 1
    io.open(path, 'w', encoding='utf-8', newline=NL).write(NL.join(lines))
    print('patched', path, 'hits', hit)


if __name__ == '__main__':
    patch_music_tracks('src/game/musicTracks.js')
    patch_pack('src/i18n/packs/en.js', pair(EN_HEAD, EN_TAIL))
    patch_pack('src/i18n/packs/ja.js', pair(JA_HEAD, JA_TAIL))
    patch_pack('src/i18n/packs/zh-hant.js', pair(ZT_HEAD, ZT_TAIL))
