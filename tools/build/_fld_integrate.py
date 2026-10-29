# -*- coding: utf-8 -*-
import io, json, re, sys, pathlib

ROOT = pathlib.Path(r"C:\Users\GuSheng\Downloads\HKS")
fails = []

def read(p):
    return io.open(ROOT / p, encoding="utf-8").read()

def write(p, s):
    io.open(ROOT / p, "w", encoding="utf-8", newline="\n").write(s)

def sub_once(path, old, new, label):
    s = read(path)
    if s.count(old) != 1:
        fails.append(f"{label}: count={s.count(old)} in {path}")
        return False
    write(path, s.replace(old, new))
    print(f"OK  {label}")
    return True

ZH1 = "EXTRA Boss 曲。开场只留钟摆、一颗八音盒音，和低音里散不掉的雾；第 8 小节钢琴把那条时钟琶音报出来——U.N. 的原题，一个音没改，只是比记忆里慢。第 17 小节起全编制压上来：十六分扫弦、双踩、半音对句一层层往上撞；副歌把 U.N. 第 20–27 小节的主题降八度逐音搬进来，吉他、弦乐、合唱全唱同一句——她想把这句歌唱给谁听，没有人知道。B 段把鬼畜妹的钟琴引用摔回谱面，升半音再唱一遍；收尾不给解决，直接崩回八音盒。她在门里坐了四百九十五年，脑子里的钟一直没停。"
ZH2 = "——芙兰朵露：「呐，陪我玩到坏掉为止吧？」"
NOTE = ZH1 + "\n" + ZH2
SUB = "芙兰朵露·斯卡雷特 · 495 年"
ORIG = "原曲「U.N.欧文就是她吗？」/ 作曲：ZUN / 编曲：Miku523（参考 COOL&CREATE《最終鬼畜妹フランドール・S》）"

EN_NOTE = "EXTRA boss theme. The intro leaves only a pendulum, one music-box note, and fog that will not settle out of the bass; at bar 8 the piano states that clock arpeggio — U.N.'s own theme, not one note changed, only slower than remembered. From bar 17 the full band comes down: sixteenth-note strumming, double kick, chromatic call-and-response piling up. The chorus brings U.N.'s bars 20–27 down an octave note for note, guitar, strings and choir all singing the same line — who she means to sing it to, nobody knows. The B section slams FLD's chime quote back onto the page and sings it a semitone higher; the ending refuses to resolve and collapses straight back into the music box. She sat behind that door for four hundred ninety-five years, and the clock in her head never stopped.\n— Flandre: \"Come play with me until we break.\""
JA_NOTE = "EXTRA ボス曲。イントロに残るのは振り子と、オルゴールの一音と、低音に沈みきらない霧だけ。8 小節目でピアノがその時計のアルペジオを出す——U.N. の原題、一音も変えず、ただ記憶より遅く。17 小節目から全編成が降りてくる。16 分のストローク、ツーバス、半音の掛け合いが積み上がり、サビでは U.N. の 20〜27 小節の主題をオクターブ下げて一音ずつ持ち込み、ギターも弦も合唱も同じ句を歌う——誰に歌っているのか、誰も知らない。B 段では鬼畜妹の鐘の引用を譜面に叩き戻し、半音上げてもう一度歌う。終止は解決せず、そのままオルゴールへ崩れ落ちる。彼女は扉の向こうで四百九十五年のあいだ座っていた。頭の中の時計は一度も止まらなかった。\n——フランドール「ねえ、壊れるまで遊ぼうよ？」"
ZHT_NOTE = "EXTRA Boss 曲。開場只留鐘擺、一顆八音盒音，和低音裡散不掉的霧；第 8 小節鋼琴把那條時鐘琶音報出來——U.N. 的原題，一個音沒改，只是比記憶裡慢。第 17 小節起全編制壓上來：十六分掃弦、雙踩、半音對句一層層往上撞；副歌把 U.N. 第 20–27 小節的主題降八度逐音搬進來，吉他、弦樂、合唱全唱同一句——她想把這句歌唱給誰聽，沒有人知道。B 段把鬼畜妹的鐘琴引用摔回譜面，升半音再唱一遍；收尾不給解決，直接崩回八音盒。她在門裡坐了四百九十五年，腦子裡的鐘一直沒停。\n——芙蘭朵露：「吶，陪我玩到壞掉為止吧？」"

EN_SUB = "Flandre Scarlet · 495 Years"
JA_SUB = "フランドール・スカーレット・495 年"
ZHT_SUB = "芙蘭朵露·斯卡雷特 · 495 年"
EN_ORIG = "Original \"U.N. Owen Was Her?\" / Composer: ZUN / Arrangement: Miku523 (after COOL&CREATE's \"Flandre S, the Finishing Devil\")"
JA_ORIG = "原曲「U.N.オーエンは彼女なのか？」/ 作曲：ZUN / 編曲：Miku523（COOL&CREATE「最終鬼畜妹フランドール・S」を参照）"
ZHT_ORIG = "原曲「U. N.歐文就是她嗎？」/ 作曲：ZUN / 編曲：Miku523（參考 COOL&CREATE《最終鬼畜妹フランドール・S》）"
ZHT_ORIG = ZHT_ORIG.replace("U. N.", "U.N.")

# ---------- 1. src/engine/songs/index.js ----------
idx = "src/engine/songs/index.js"
s = read(idx)
old_block = """  // EX Boss：U.N.オーエンは彼女なのか？～ 495年の孤独（见 tools/un_mad.py）
  // audio 让引擎直接播离线渲染成品 src/assets/bgm/extra_mad.mp3，
  // fetch 失败时自动回退到 un_mad.js 里的合成数据。
  { id: 'un_mad', url: './un_mad.js', keys: ['extra'],
    pick: (m) => ({ extra: m.UN_MAD?.extra ? { ...m.UN_MAD.extra, audio: 'src/assets/bgm/extra_mad.mp3' } : undefined }) },"""
new_block = """  // EX Boss：恶魔之妹 —— 最終鬼畜妹フランドール・S × U.N.オーエンは彼女なのか？（见 tools/build/_fld_compose.py）
  // audio 让引擎直接播离线渲染成品 src/assets/bgm/flandre_devil.mp3，
  // fetch 失败时自动回退到 flandre_devil.js 里的合成数据。
  { id: 'flandre_devil', url: './flandre_devil.js', keys: ['extra'],
    pick: (m) => ({ extra: m.FLANDRE_DEVIL?.extra ? { ...m.FLANDRE_DEVIL.extra, audio: 'src/assets/bgm/flandre_devil.mp3?v=1.6.33' } : undefined }) },"""
if s.count(old_block) == 1:
    s = s.replace(old_block, new_block)
    write(idx, s)
    print("OK  index.js un_mad -> flandre_devil")
else:
    fails.append(f"index.js block count={s.count(old_block)}")

sub_once(idx, "src/assets/bgm/sakuya_ex.mp3?v=1.6.32", "src/assets/bgm/sakuya_ex.mp3?v=1.6.33", "index.js sakuya audio v")

# ---------- 2. src/game/musicTracks.js ----------
mt = "src/game/musicTracks.js"
s = read(mt)
old = """    title: 'U.N.欧文就是她吗？',
    sub: '芙兰朵露·斯卡雷特',
    cat: 'EXTRA',
    place: '红魔馆 · 血月水晶',
    orig: '原曲「U.N.欧文就是她吗？」/ 作曲：ZUN / 编曲：Miku523',
    tone: '#ff7a8a',
    glow: '255, 122, 138',
    time: 124.3,
    note:
      'EXTRA Boss 曲。前半场几乎空着：鼓组全撤，织体抬到高音区、低音压到很深，中间空出来，每个音都落在很远的地方，混响比乐句还长——回来的时候，已经不是原来那个音了。第六十三小节起全翻过来：双踩底鼓、两小节军鼓滚卷进去，旋律再叠一层失真方波，残响收干，鼓贴到脸上。她在门里待了四百九十五年：前半场是没人回应，后半场是终于忍不住了。\\n' +
      '——芙兰朵露：「有人吗？」',"""
new = """    title: '恶魔之妹',
    sub: '""" + SUB + """',
    cat: 'EXTRA',
    place: '红魔馆 · 血月水晶',
    orig: '""" + ORIG + """',
    tone: '#ff7a8a',
    glow: '255, 122, 138',
    time: 120,
    note:
      '""" + ZH1 + """\\n' +
      '""" + ZH2 + """',"""
if s.count(old) == 1:
    write(mt, s.replace(old, new))
    print("OK  musicTracks extra entry")
else:
    fails.append(f"musicTracks old count={s.count(old)}")

# ---------- 3. i18n packs ----------
def js(v):
    return json.dumps(v, ensure_ascii=False)

PACKS = {
    "en":      (EN_ORIG, EN_SUB, EN_NOTE),
    "ja":      (JA_ORIG, JA_SUB, JA_NOTE),
    "zh-hant": (ZHT_ORIG, ZHT_SUB, ZHT_NOTE),
}
for lang, (orig_v, sub_v, note_v) in PACKS.items():
    p = f"src/i18n/packs/{lang}.js"
    s = read(p)
    # anchor: 恶魔之妹 entry line
    m = re.search(r'(?m)^  "恶魔之妹": .*?,\n', s)
    if not m:
        fails.append(f"{lang}: anchor 恶魔之妹 not found"); continue
    entries = []
    for k, v in ((ORIG, orig_v), (SUB, sub_v), (NOTE, note_v)):
        if s.count(js(k)) > 0:
            fails.append(f"{lang}: key already present: {k[:24]}")
        entries.append(f"  {js(k)}: {js(v)},\n")
    ins = "".join(entries)
    s = s[:m.end()] + ins + s[m.end():]
    write(p, s)
    print(f"OK  i18n {lang} 3 keys")

print("FAILS:", fails)
sys.exit(1 if fails else 0)
