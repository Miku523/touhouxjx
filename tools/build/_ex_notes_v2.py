# -*- coding: utf-8 -*-
"""U.N. 编曲改版后的解说文案同步：musicTracks.js + en/ja/zh-hant 三个 pack。"""
import io

BS = chr(92)
NL = chr(10)

ZH_MID = ('EXTRA 中段。这回一个音都没有改：四四拍的原速、原段落、原编制，钢琴、弦乐、小号、'
          '管风琴照原样搬进来，连前奏那八小节都留着。改的只有脚下的重量——定音鼓踩在正拍上，'
          '大吊镲压在每段第一拍，贝斯沉到低八度。不抢、不飘，一圈一圈往下压。' + NL +
          '——雷米莉亚：「圆舞要跳完。你站着不动，我才难办。」')

ZH_EXTRA = ('EXTRA Boss 曲。前半场几乎空着：鼓组全撤，织体抬到高音区、低音压到很深，中间空出来，'
            '每个音都落在很远的地方，混响比乐句还长——回来的时候，已经不是原来那个音了。'
            '第六十三小节起全翻过来：双踩底鼓、两小节军鼓滚卷进去，旋律再叠一层失真方波，'
            '残响收干，鼓贴到脸上。她在门里待了四百九十五年：前半场是没人回应，后半场是终于忍不住了。' + NL +
            '——芙兰朵露：「有人吗？」')

EN_MID = ('EXTRA mid-stage. Not one note was changed this time: the same 4/4 tempo, the same sections, '
          'the same instrumentation — piano, strings, trumpet and organ all carried over as they were, '
          'right down to those eight bars of intro. The only thing rewritten is the weight underfoot: '
          'timpani on the downbeat, a big crash on the first beat of every section, the bass sunk an octave. '
          'It does not rush, it does not drift; it just presses down, ring after ring.' + NL +
          '— Remilia: "The waltz has to finish. It is when you stand still that I am in trouble."')

EN_EXTRA = ('EXTRA boss theme. The first half is almost empty: no drum kit at all, the texture lifted into '
            'the high register, the bass pushed way down, the middle left hollow. Every note lands far away, '
            'and the reverb outlasts the phrase — by the time it comes back, it is not the same note. '
            'From bar 63 everything turns over: double-kick drums, a two-bar snare roll dragging you in, '
            'the melody doubled with a distorted square wave, the reverb pulled dry so the drums sit in your face. '
            'She waited four hundred and ninety-five years behind that door: the first half is no one answering, '
            'the second half is her finally losing patience.' + NL +
            '— Flandre: "Is anyone there?"')

JA_MID = ('EXTRA 中盤。今回は一音も変えていない。4/4 の元の速さ、元の構成、元の編成のまま、'
          'ピアノも弦もトランペットもオルガンもそのまま持ち込んだ。八小節の前奏まで残してある。'
          '変えたのは足元の重さだけ——ティンパニを表拍に、大シンバルを各段落の一発目に、ベースをオクターブ下へ。'
          '焦らず、浮かず、ぐるりと下へ押していく。' + NL +
          '——レミリア「円舞曲は最後まで踊るのよ。あなたが立ち止まるから、私が困るの。」')

JA_EXTRA = ('EXTRA ボス曲。前半はほとんど空っぽだ。ドラムは全部抜き、織りを高い音域に上げ、低音は深く沈め、'
            '真ん中を空洞にした。どの音も遠くに落ちて、残響はフレーズより長い——戻ってきたときには、もう元の音じゃない。'
            '63 小節目から全部が反転する。ツーバスのキック、二小節のスネアロールに巻き込まれ、'
            '旋律には歪んだ矩形波が重なり、残響は絞られてドラムが目の前に来る。'
            '彼女は扉の向こうで四百九十五年待っていた。前半は誰も応えない時間、後半はとうとう我慢できなくなった時間だ。'
            + NL + '——フランドール「だれかいる？」')

ZH_HANT_EXTRA = ('EXTRA Boss 曲。前半場幾乎空著：鼓組全撤，織體抬到高音區、低音壓到很深，中間空出來，'
                 '每個音都落在很遠的地方，殘響比樂句還長——回來的時候，已經不是原來那個音了。'
                 '第六十三小節起全翻過來：雙踩底鼓、兩小節軍鼓滾捲進去，旋律再疊一層失真方波，'
                 '殘響收乾，鼓貼到臉上。她在門裡待了四百九十五年：前半場是沒人回應，後半場是終於忍不住了。'
                 + NL + '——芙蘭朵露：「有人嗎？」')


def esc(s):
    return s.replace(BS, BS + BS).replace('"', BS + '"').replace(NL, BS + 'n')


def pair(zh, tr):
    return '  "%s": "%s",' % (esc(zh), esc(tr))


def patch_pack(path, old_prefixes, pairs):
    lines = io.open(path, encoding='utf-8').read().split(NL)
    out, done = [], 0
    for ln in lines:
        if any(ln.startswith('  "' + p) for p in old_prefixes):
            out.extend(pairs)
            done += 1
            continue
        out.append(ln)
    io.open(path, 'w', encoding='utf-8', newline=NL).write(NL.join(out))
    print('%-34s replaced %d line(s)' % (path, done))


# 1) musicTracks.js 里那段 extra 解说
p = 'src/game/musicTracks.js'
s = io.open(p, encoding='utf-8').read()
head = "      'EXTRA Boss 曲。鼓组整个撤了"
i = s.index(head)
tail_mark = '——芙兰朵露：「有人吗？」' + "',"
j = s.index(tail_mark, i) + len(tail_mark)
parts = ZH_EXTRA.split(NL)
new = NL.join("      '%s'" % x + (' +' if k < len(parts) - 1 else ',')
              for k, x in enumerate(parts))
s = s[:i] + new + s[j:]
io.open(p, 'w', encoding='utf-8', newline=NL).write(s)
print('musicTracks.js extra note replaced')

# 2) 三个 pack
patch_pack('src/i18n/packs/en.js', ['EXTRA 中段。圆舞曲', 'EXTRA Boss 曲。芙兰朵露'],
           [pair(ZH_MID, EN_MID), pair(ZH_EXTRA, EN_EXTRA)])
patch_pack('src/i18n/packs/ja.js', ['EXTRA 中段。圆舞曲', 'EXTRA Boss 曲。芙兰朵露'],
           [pair(ZH_MID, JA_MID), pair(ZH_EXTRA, JA_EXTRA)])
patch_pack('src/i18n/packs/zh-hant.js', ['EXTRA Boss 曲。鼓组整个撤了'],
           [pair(ZH_EXTRA, ZH_HANT_EXTRA)])
