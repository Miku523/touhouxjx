# -*- coding: utf-8 -*-
"""《献给已逝王女的七重奏》v2 接入：index.js DEFS / musicTracks 条目 / 版本串。"""
import io, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
V = '1.6.55'

def rw(rel, fn):
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    t = fn(s)
    if t != s:
        io.open(p, 'w', encoding='utf-8', newline='').write(t)
    print('  ', rel, 'changed' if t != s else 'same')

# ---- 1) 引擎曲库：ex_mid 换到新文件并挂离线成品 MP3
def f_index(s):
    old = """  // EX 中段（雷米莉亚拦路）：亡き王女の為のセプテット —— 见 tools/ex_septette2.py
  { id: 'septette_ex', url: './septette_ex.js', keys: ['ex_mid'],
    pick: (m) => ({ ex_mid: m.REMILIA_EX?.ex_mid }) },"""
    new = """  // EX 中段（雷米莉亚拦路）：亡き王女の為のセプテット —— 逐音搬入 + 重新配器（见 tools/build/_remi_compose.py）
  // audio 让引擎直接播离线渲染成品 src/assets/bgm/remilia_septette.mp3，
  // fetch 失败时自动回退 remilia_septette.js 里的合成数据。
  { id: 'remilia_septette', url: './remilia_septette.js', keys: ['ex_mid'],
    pick: (m) => ({ ex_mid: m.REMILIA_EX?.ex_mid ? { ...m.REMILIA_EX.ex_mid, audio: 'src/assets/bgm/remilia_septette.mp3?v=%s' } : undefined }) },""" % V
    assert s.count(old) == 1, s.count(old)
    return s.replace(old, new)
rw('src/engine/songs/index.js', f_index)

# ---- 2) 音乐室条目
NOTE = ('EXTRA 中段。这一版我把原曲整块搬了进来：一百四十五 BPM、原调降 B 小调、八十一个小节，'
        '旋律、对位、贝斯、琶音一个音都没有改，只把配器换成了铜管、弦乐、合唱、管风琴和羽管键琴。'
        '开头的钢琴钟摆独自站了八小节，小号主题才进来——那是她的主题，不是我写的。\\n'
        '改的全在脚底下：定音鼓踩正拍，军鼓走进行曲，段尾用通鼓一层层垫上去；低音沉到八度，'
        '圆舞段补了管风琴十六尺踏板，最后那段全奏又加了一层高八度弦乐。红月下的王座不需要花招，只需要它真的沉、真的稳。\\n'
        '——雷米莉亚：「圆舞要跳完。你站着不动，我才难办。」')

def f_tracks(s):
    # 定位 ex_mid 条目：从 "  {\n    key: 'ex_mid'," 到其后第一个 "\n  }," 结束
    i = s.index("    key: 'ex_mid',")
    st = s.rindex('  {\n', 0, i)
    en = s.index('\n  },', i) + len('\n  },')
    blk = s[st:en]
    blk = re.sub(r"    time: [\d.]+,\n", "    time: 148.7,\n", blk)
    blk = re.sub(r"    note:\n(?:      '.*?'(?: \\+\n)?\n?)+", "", blk, flags=re.S)
    # 重新拼 note
    lines = NOTE.split('\\n')
    note_js = "    note:\n" + " +\n".join("      '%s'" % ln.replace("'", "\\'") for ln in lines) + ",\n"
    blk = blk.replace("    time: 148.7,\n", "    time: 148.7,\n" + note_js, 1)
    return s[:st] + blk + s[en:]
rw('src/game/musicTracks.js', f_tracks)

# ---- 3) 版本串
def f_ver(s):
    return s.replace('1.6.54', V)
for rel in ('index.html', 'src/ui/platform.js', 'sw.js'):
    rw(rel, f_ver)

io.open(os.path.join(ROOT, 'tools', 'build', '_remi_lead', '_note.txt'), 'w', encoding='utf-8').write(NOTE)
print('done')
