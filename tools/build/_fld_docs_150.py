# -*- coding: utf-8 -*-
"""150s 版《恶魔之妹》接入：musicTracks / i18n / README / docs / 版本号。"""
import io, json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
os.chdir(ROOT)
BT = chr(96)

NOTE = ("EXTRA Boss 曲。开场只留钟摆、一颗八音盒音，和低音里散不掉的雾；第 9 小节羽管键琴把 U.N. 的时钟琶音一格一格拨出来。"
        "第 17 小节她第一次开口：八小节的「恶魔之妹」主题，甜、稳，像被关久了的人哼给自己听，句尾总在 A7 上留一个 C 自然。"
        "第 33 小节全部塌掉——半音对句、blast beat、十六分吉他，鬼畜妹的钟琴引用从谱面上摔进来。"
        "副歌把 U.N. 第 20–27 小节的主题逐音搬进来、落在正拍上，吉他、弦乐、合唱全唱同一句；第二遍副歌后面接十六分吉他墙，第三遍升半音唱到顶。"
        "中段时停只剩钢琴、钟摆和一把刀；收尾不给解决，直接崩回八音盒。她在门里坐了四百九十五年，脑子里的钟一直没停。")
DIA = "——芙兰朵露：「呐，陪我玩到坏掉为止吧？」"

N_EN = ("EXTRA boss theme. It still opens with a pendulum, a single music-box note, and a fog that never clears out of the low end; "
        "at bar 9 the harpsichord picks out U.N.'s clock arpeggio one step at a time. At bar 17 she speaks for the first time: "
        "an eight-bar theme for the younger sister of the devil, sweet and steady, the way someone locked away too long hums to herself, "
        "and every phrase ends by leaving a C natural on top of an A7. At bar 33 everything collapses: chromatic call-and-response, "
        "blast beats, sixteenth-note guitar, and the chime quote from The Finishing Devil drops in straight off the page. "
        "The chorus lifts U.N.'s theme from bars 20-27 note for note, lands it on the beat, and the guitar, strings and choir all sing it; "
        "a sixteenth-note guitar wall follows the second chorus, and the third takes it up a semitone to the ceiling. "
        "The middle section stops time and leaves only piano, pendulum and a knife; the ending refuses to resolve and collapses back into the music box. "
        "She has sat behind that door for four hundred and ninety-five years, and the clock in her head has never stopped.")
D_EN = "— Flandre: \"Come on, play with me until we break.\""

N_JA = ("EXTRA Boss 曲。始まりは振り子と、オルゴールの一音、そして低音に消えない霧。"
        "9小節目でチェンバロがU.N.の時計のアルペジオを一音ずつ弾き出す。17小節目で彼女は初めて口を開く——8小節の「悪魔の妹」の主題。"
        "甘くて落ち着いた、長く閉じ込められた人が自分にだけ歌うような旋律で、フレーズの終わりはいつもA7の上にCナチュラルを残す。"
        "33小節目で全部が崩れる——半音の掛け合い、ブラストビート、16分のギター。鬼畜妹の鐘琴の引用が譜面からそのまま落ちてくる。"
        "サビはU.N.の20〜27小節目の主題を一音ずつ移して拍の頭に置き、ギターも弦も合唱も同じフレーズを歌う。"
        "2回目のサビの後は16分のギターの壁、3回目は半音上げて天井まで。中盤は時が止まり、ピアノと振り子と一本のナイフだけ。"
        "終わりは解決せず、そのままオルゴールへ崩れ落ちる。彼女はあの扉の向こうに四百九十五年座っていた。頭の中の時計は一度も止まっていない。")
D_JA = "——フランドール：「ねえ、壊れるまで遊んでよ？」"

N_HT = ("EXTRA Boss 曲。開場還是鐘擺、一顆八音盒音，和低音裡散不掉的霧；第 9 小節羽管鍵琴把 U.N. 的時鐘琶音一格一格撥出來。"
        "第 17 小節她第一次開口：八小節的「惡魔之妹」主題，甜、穩，像被關久了的人哼給自己聽，句尾總在 A7 上留一個 C 自然。"
        "第 33 小節全部塌掉——半音對句、blast beat、十六分吉他，鬼畜妹的鐘琴引用從譜面上摔進來。"
        "副歌把 U.N. 第 20–27 小節的主題逐音搬進來、落在正拍上，吉他、弦樂、合唱全唱同一句；第二遍副歌後面接十六分吉他牆，第三遍升半音唱到頂。"
        "中段時停只剩鋼琴、鐘擺和一把刀；收尾不給解決，直接崩回八音盒。她在門裡坐了四百九十五年，腦子裡的鐘一直沒停。")
D_HT = "——芙蘭朵露：「吶，陪我玩到壞掉為止吧？」"


def read(p):
    return io.open(p, encoding='utf-8').read()


def write(p, s):
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)


# 1) musicTracks.js
p = 'src/game/musicTracks.js'
s = read(p)
start = s.index("    time: 120,\n    note:\n")
end = s.index("\n  },", start)
block = "    time: 150,\n    note:\n      '" + NOTE + "\\n' +\n      '" + DIA + "',"
s = s[:start] + block + s[end:]
write(p, s)
print('musicTracks ok')

# 2) i18n packs
packs = {'en': (N_EN, D_EN), 'ja': (N_JA, D_JA), 'zh-hant': (N_HT, D_HT)}
for lang in ('en', 'ja', 'zh-hant'):
    val, dia = packs[lang]
    p = 'src/i18n/packs/%s.js' % lang
    lines = read(p).split('\n')
    idx = [i for i, x in enumerate(lines) if x.startswith('  "EXTRA Boss') and '开场只留钟摆' in x]
    assert len(idx) == 1, (lang, idx)
    key = NOTE + '\n' + DIA
    value = val + '\n' + dia
    lines[idx[0]] = '  ' + json.dumps(key, ensure_ascii=False) + ': ' + json.dumps(value, ensure_ascii=False) + ','
    write(p, '\n'.join(lines))
    print('i18n', lang, 'ok')

# 3) README
p = 'README.md'
s = read(p)
assert '合计 5.0 MB' in s
s = s.replace('合计 5.0 MB', '合计 5.6 MB', 1)
start = s.index('  - EXTRA 终盘《恶魔之妹》')
end = s.index('\n  - 四面 Boss 曲《風神少女》', start)
new335 = ("  - EXTRA 终盘《恶魔之妹》把 最終鬼畜妹フランドール・S 的鬼畜手法灌进 U.N.オーエンは彼女なのか？：192 BPM / D 小调 / 120 小节正好 150.0 秒一循环"
          "（引子 I 8 / 引子 II 8 / A1 8 / A2 8 / B 8 / C1 16 / Bridge 8 / B2 8 / C2 16 / Solo 8 / Break 8 / C3 8 / Coda 8），"
          "数据由 " + BT + "tools/build/_fld_compose2.py" + BT + " 生成到 " + BT + "src/engine/songs/flandre_devil.js" + BT + "（15 轨 / 9608 音 / 2659 鼓）。"
          "引子只留钟摆、一颗八音盒音和低音里散不掉的雾；第 9 小节羽管键琴把 U.N. 那条时钟琶音一格一格拨出来（原题逐音不改，只放慢），"
          "第 17 小节她第一次开口——八小节可唱的「被囚禁的日常」主题，甜、稳、句尾总在 A7 上留一个 C 自然；A2 段同一主题加压（合唱、双踩、后半句抬到 Eb）。"
          "B 段拿 最終鬼畜妹 的钟琴引用去跟高音半音对句对撞、blast beat 铺底；"
          "副歌把 U.N. 第 20–27 小节的主题**整体前移 0.25 拍落到正拍**（上一版整段晚一个十六分、跟伴奏错位，听着发糊），降八度逐音搬入，"
          "lead 主奏＋钟琴高八度轻加倍，吉他、弦乐、合唱唱同一句；C2 后半接十六分吉他墙，Solo 用羽管键琴时钟琶音加 lead 十六分跑句，Break 半速 build，"
          "C3 整体升半音唱到顶，coda 不给解决、崩回八音盒接循环。重做时定下的三条硬指标：副歌 lead 只比鼓低 1.0 dB、比吉他高 5 dB（上一版被鼓压 8–10 dB），"
          "B／B2 段主旋律加高八度加倍，鼓组整体降 0.76 倍、吉他闷音由四音压成两音（上一版十六分吉他墙把旋律整个埋掉）。"
          "WAV 用同一套 " + BT + "tools/build/_exsr_render.py" + BT + " 离线渲染（22050 Hz 单声道 150.000 s PCM16，6,615,044 B）："
          "峰值 0.461 / RMS -19.50 dBFS / 0 削顶 / 循环接缝 0.0026（滑差 0.0245，全曲 8.5% 分位）/ 谱心 993 Hz，"
          "转成 1,716,023 B 的 MP3 挂 " + BT + "extra.audio" + BT + "（带 " + BT + "?v=" + BT + "），fetch 失败自动回退 " + BT + "flandre_devil.js" + BT + " 的合成数据。")
s = s[:start] + new335 + s[end:]
write(p, s)
print('README ok')

# 4) docs/NETWORK_CN.md
p = 'docs/NETWORK_CN.md'
s = read(p)
oldrow = '| ' + BT + 'flandre_devil' + BT + ' | EXTRA 终盘（恶魔之妹） | 5,292,044 B | **1,349,530 B** |'
newrow = '| ' + BT + 'flandre_devil' + BT + ' | EXTRA 终盘（恶魔之妹） | 6,615,044 B | **1,716,023 B** |'
assert oldrow in s, 'network row missing'
s = s.replace(oldrow, newrow)
write(p, s)
print('NETWORK ok')

# 5) AUDIT
p = 'docs/RE_STORY/AUDIT_CURRENT.md'
s = read(p)
oldrow = '| 16 | ' + BT + 'extra' + BT + ' | 恶魔之妹 | EXTRA | 红魔馆地下 · 血月水晶 | 原曲 / ZUN、COOL&CREATE（参考同人改编） | 120 | ' + BT + ':247' + BT + ' |'
newrow = oldrow.replace(' | 120 | ', ' | 150 | ')
assert oldrow in s, 'audit row missing'
s = s.replace(oldrow, newrow)
write(p, s)
print('AUDIT ok')

# 6) version bump
for p in ['index.html', 'sw.js', 'src/ui/platform.js', 'src/engine/songs/index.js']:
    s = read(p)
    n = s.count('1.6.33')
    s = s.replace('1.6.33', '1.6.34')
    write(p, s)
    print('ver', p, n)
