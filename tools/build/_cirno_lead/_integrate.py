# -*- coding: utf-8 -*-
"""三面 Boss 接入：index.js DEFS + musicTracks stage3 块 + i18n 三包新键。"""
import os, json, io
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))

def rd(p):
    with io.open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()

def wr(p, s):
    with io.open(os.path.join(ROOT, p), 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)

# ---------- 1) index.js DEFS ----------
p = 'src/engine/songs/index.js'
s = rd(p)
old = ("  { id: 'ateam_stage3', url: './ateam_stage3.js', keys: ['stage3'],\n"
       "    pick: (m) => ({ stage3: m.ATEAM_STAGE3?.stage3 }) },\n")
new = ("  { id: 'cirno_stage3', url: './cirno_stage3.js', keys: ['stage3'],\n"
       "    pick: (m) => ({ stage3: m.CIRNO_STAGE3?.stage3\n"
       "      ? { ...m.CIRNO_STAGE3.stage3, audio: 'src/assets/bgm/cirno_stage3.mp3?v=1.6.61' }\n"
       "      : undefined }) },\n")
assert s.count(old) == 1, 'index DEFS anchor'
s = s.replace(old, new)
s = s.replace('  // 3 面 Boss：おてんば恋娘 —— Ateam 重低频编 + 花映塚 + 完美教室（见 tools/ateam_stage3.py）\n',
              '  // 3 面 Boss：おてんば恋娘 + 冒険 + 完美教室 —— 三曲逐音搬入重配器，176BPM / 88 小节 / 120s（见 tools/build/_cirno_compose.py）\n')
wr(p, s)

# ---------- 2) musicTracks ----------
p = 'src/game/musicTracks.js'
s = rd(p)
old_block = """    title: '活泼的恋之少女',
    sub: '琪露诺',
    cat: 'STAGE 3',
    place: '雾之湖 · 冰蓝晨曦',
    orig: '原曲「活泼的恋之少女」「活泼的恋之少女的冒险」「琪露诺的完美算数教室」/ 作曲：ZUN、IOSYS / 编曲：Miku523',
    tone: '#8ee9ff',
    glow: '142, 233, 255',
    time: 101.7,
    note:
      '三面 Boss 曲。三段拼起来：开头是她自己那首，后来接「冒险」，最后干脆闯进「完美教室」，把算术题唱成副歌。我一直觉得这是三首，她坚持是同一首，只是数错了。冰面下的雾之湖本来就是闷的。行吧，同一首。\\n' +
      '——琪露诺：「本来就是同一首。你才数错了。」',
"""
new_block = """    title: '活泼的恋之少女（冰上算术编）',
    sub: '琪露诺',
    cat: 'STAGE 3',
    place: '雾之湖 · 冰蓝晨曦',
    orig: '原曲「活泼的恋之少女」「活泼的恋之少女的冒险」「琪露诺的完美算数教室」/ 作曲：ZUN、IOSYS / 编曲：Miku523（逐音搬入重配器）',
    tone: '#8ee9ff',
    glow: '142, 233, 255',
    time: 120.0,
    note:
      '三面 Boss 曲（2:00 · 第六版）。三首原曲都整块搬进来，音符一个没改：恋娘的主歌还是 D 大调，冒险的降 B 小调 riff 整体升四度接上来，完美教室的算术副歌换到 D 小调再唱一遍。176 BPM 走满 88 小节：前半是她在冰面上跳——方波主旋律、十六分琶音、反拍贝斯，鼓只给四踩与反拍开镲；中段闯进教室，铜管喊题、弦乐齐奏，中间留四小节数拍子，数到九她自己先卡住；副歌是全曲最亮处，主旋律上挂高八度、钢琴跟低八度、每小节十六颗冰晶琶音；尾声转回 D 大调（皮卡第三度），八音盒把恋娘的动机哼一遍就收，停在最后一拍接回开头的雾。曲子会绕回开头——她数冰块也是，数到第九块就从头再数。\\n' +
      '——琪露诺：「九之后就是十，可我只数到九。厉害吧？」',
"""
assert s.count(old_block) == 1, 'musicTracks stage3 block anchor'
s = s.replace(old_block, new_block)
wr(p, s)

# ---------- 3) i18n ----------
zh_title = '活泼的恋之少女（冰上算术编）'
zh_orig = '原曲「活泼的恋之少女」「活泼的恋之少女的冒险」「琪露诺的完美算数教室」/ 作曲：ZUN、IOSYS / 编曲：Miku523（逐音搬入重配器）'
zh_note = ("三面 Boss 曲（2:00 · 第六版）。三首原曲都整块搬进来，音符一个没改：恋娘的主歌还是 D 大调，冒险的降 B 小调 riff 整体升四度接上来，"
           "完美教室的算术副歌换到 D 小调再唱一遍。176 BPM 走满 88 小节：前半是她在冰面上跳——方波主旋律、十六分琶音、反拍贝斯，鼓只给四踩与反拍开镲；"
           "中段闯进教室，铜管喊题、弦乐齐奏，中间留四小节数拍子，数到九她自己先卡住；副歌是全曲最亮处，主旋律上挂高八度、钢琴跟低八度、每小节十六颗冰晶琶音；"
           "尾声转回 D 大调（皮卡第三度），八音盒把恋娘的动机哼一遍就收，停在最后一拍接回开头的雾。曲子会绕回开头——她数冰块也是，数到第九块就从头再数。\n"
           "——琪露诺：「九之后就是十，可我只数到九。厉害吧？」")

en = {
 'title': 'Beloved Tomboyish Girl (Ice Arithmetic Mix)',
 'orig': 'Original "Beloved Tomboyish Girl", "Adventure of the Beloved Tomboyish Girl", "Cirno\'s Perfect Math Class" / Composer: ZUN, IOSYS / Arrangement: Miku523 (note-for-note re-orchestration)',
 'note': ("Stage 3 boss theme (2:00, sixth version). All three originals are carried in whole, not a note changed: the tomboyish girl's verse stays in D major, "
          "the adventure's B-flat-minor riff is lifted a fourth and spliced on, and the perfect math class's arithmetic chorus is re-sung in D minor. "
          "176 BPM across a full 88 bars: the first half has her skipping over the ice — square-wave lead, sixteenth-note arpeggios, off-beat bass, and a kit that gives only four-on-the-floor and off-beat open hats. "
          "The middle bursts into the classroom, brass shouting the questions over unison strings, with four bars left for counting — at nine she is the first to get stuck. "
          "The chorus is the brightest point of the piece: an octave lead above the melody, piano an octave below, sixteen ice-crystal arpeggios per bar. "
          "The coda returns to D major (Picardy third); the music box hums the tomboyish girl's motif once and stops on the final beat, looping back into the fog of the opening. "
          "The tune loops to the start — she counts ice cubes the same way, and at the ninth one she begins again.\n"
          "— Cirno: \"After nine comes ten, but I only count to nine. Pretty impressive, huh?\""),
}
ja = {
 'title': 'おてんば恋娘（氷上算術編）',
 'orig': '原曲「おてんば恋娘」「おてんば恋娘の冒険」「チルノのパーフェクトさんすう教室」/ 作曲：ZUN、IOSYS / 編曲：Miku523（音源をそのまま再配器）',
 'note': ("三面ボス曲（2:00・第六版）。三曲とも原曲をまるごと持ち込み、音は一つも変えていない：おてんば恋娘の主歌はそのままニ長調、"
          "冒険の変ロ短調リフは完全四度上げて接続、パーフェクトさんすう教室の算数コーラスはニ短調で歌い直す。"
          "176 BPM で 88 小節：前半は彼女が氷の上を跳ねる——矩形波の主旋律、十六分のアルペジオ、裏拍のベース、ドラムは四つ打ちと裏拍のオープンハットだけ。"
          "中盤は教室に突入し、金管が問題を叫び、弦がユニゾンで答える。数えるための四小節が空けてあり、九で彼女自身がまず詰まる。"
          "サビは全曲で一番明るい場所——主旋律の上にオクターブ、ピアノは下のオクターブ、毎小節に十六個の氷晶アルペジオ。"
          "コーダはニ長調（ピカルディの三度）へ戻り、オルゴールが恋娘の動機を一度だけ口ずさんで最後の拍で止まり、冒頭の霧へ循環する。"
          "曲は最初へ戻る——彼女が氷を数えるのも同じで、九個目でまた最初から数え直す。\n"
          "——チルノ「九の次は十だけど、私は九までしか数えないの。すごいでしょ？」"),
}

try:
    from opencc import OpenCC
    cc = OpenCC('s2twp')
    zh_hant = {'title': cc.convert(zh_title), 'orig': cc.convert(zh_orig), 'note': cc.convert(zh_note)}
except Exception as e:
    zh_hant = {'title': zh_title, 'orig': zh_orig, 'note': zh_note}
    print('[warn] opencc missing:', e)

def jsq(x):
    return json.dumps(x, ensure_ascii=False)

packs = {
 'en': (zh_title, en['title'], zh_orig, en['orig'], zh_note, en['note']),
 'ja': (zh_title, ja['title'], zh_orig, ja['orig'], zh_note, ja['note']),
 'zh-hant': (zh_title, zh_hant['title'], zh_orig, zh_hant['orig'], zh_note, zh_hant['note']),
}
for name, (t_k, t_v, o_k, o_v, n_k, n_v) in packs.items():
    p = 'src/i18n/packs/%s.js' % name
    s = rd(p)
    assert s.count(t_k) == 0, 'dup title key in ' + name
    assert s.count(n_k) == 0, 'dup note key in ' + name
    add = (',\n' + jsq(t_k) + ': ' + jsq(t_v)
           + ',\n' + jsq(o_k) + ': ' + jsq(o_v)
           + ',\n' + jsq(n_k) + ': ' + jsq(n_v))
    tail = '\n};'
    assert s.rstrip().endswith('};'), 'pack tail ' + name
    idx = s.rstrip().rfind('};')
    s2 = s[:idx] + add + '\n' + s[idx:]
    wr(p, s2)
    # 计数
    with io.open(os.path.join(ROOT, p), encoding='utf-8') as f:
        cnt = f.read().count('\n  "')
    print(name, 'keys~', cnt)

print('OK')
