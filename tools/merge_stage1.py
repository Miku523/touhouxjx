#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/merge_stage1.py —— 3 面...（不是）1 面 Boss：PHOENIX 版 × 游戏原本 ZUN 版 融合。

用户 m00862/m00916 口径：「st1 跟最原先的版本融合」= 融合对象是游戏里原本的
《妖魔夜行》（src/engine/songs/touhou.js → BOSS_SONGS.stage1，ZUN 原曲 120 BPM）。

融合思路（两个版本同速 120 BPM，时间轴天然对齐）：
  原曲贡献「内容」——ZUN 的贝斯线、和声织体、鼓型
  PHOENIX 版贡献「驱动」——四踩底鼓/开镲/16 分闭镲、反拍和弦 stab、高八度 sparkle
输出两个配比：
  A 原曲为主：原曲 4 轨全留 + PHOENIX 的镲片与 stab 轻叠（PHOENIX 只当调味）
  B PHOENIX 为主：PHOENIX 全编排 + 原曲和声铺回（原曲当底味）
"""
import os, sys
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
import preview_song as PS
import eurobeatize as E

ORIG_FILE = os.path.join(ROOT, 'src', 'engine', 'songs', 'touhou.js')
PHX_FILE = os.path.join(ROOT, 'src', 'engine', 'songs', 'phoenix_stage1.js')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'merge_stage1.js')


def load_phx():
    for key in ('stage1', 'stage1a'):
        try:
            return PS.load_song(PHX_FILE, 'PHOENIX_A', key)
        except Exception:
            continue
    raise SystemExit('无法从 phoenix_stage1.js 读取 PHOENIX_A')


def to_dict(notes):
    out = []
    for n in notes:
        if isinstance(n, dict):
            out.append(dict(n))
        else:
            t, m, d, v = n
            out.append({'t': t, 'm': m, 'd': d, 'v': v})
    return out


def scale_vel(notes, k):
    out = []
    for n in notes:
        t, m, d, v = (n['t'], n['m'], n['d'], n['v']) if isinstance(n, dict) else n
        out.append((round(t, 3), m, d, max(1, min(127, int(round(v * k))))))
    return out


def scale_drums(drums, k):
    return [(round(t, 3), kind, max(1, min(127, int(round(vel * k))))) for t, kind, vel in drums]


def merge(orig, phx, mode):
    ob, oh, od = orig['tracks'][1], orig['tracks'][2], orig['drums']   # 原曲贝斯 / 和声 / 鼓
    pl = phx['tracks'][0]
    tracks = []
    if mode == 'orig':
        tracks.append({'wave': pl['wave'], 'gain': 0.18, 'notes': scale_vel(pl['notes'], 1.0)})
        tracks.append({'wave': ob['wave'], 'gain': ob['gain'], 'notes': ob['notes']})
        tracks.append({'wave': oh['wave'], 'gain': oh['gain'], 'notes': oh['notes']})
        drums = scale_drums(od, 0.85)
        hats = [(round(t, 3), kind, max(1, min(127, int(round(v * 0.55)))))
                for t, kind, v in phx['drums'] if kind >= 2]
        drums = sorted(drums + hats)
        flavor = [(round(t, 3), m, d, int(v * 0.5)) for t, m, d, v in
                  [(n['t'], n['m'], n['d'], n['v']) if isinstance(n, dict) else n for n in phx['tracks'][2]['notes']]]
        tracks.append({'wave': 'square', 'gain': 0.02, 'notes': flavor})
    else:
        for tr in phx['tracks'][:1]:
            tracks.append({'wave': tr['wave'], 'gain': 0.19, 'notes': tr['notes']})
        tracks.append({'wave': oh['wave'], 'gain': 0.028, 'notes': oh['notes']})
        for tr in phx['tracks'][1:]:
            tracks.append(dict(tr))
        drums = scale_drums(phx['drums'], 0.7)
        drums = sorted(drums + [(round(t, 3), kind, max(1, min(127, int(round(v * 0.35)))))
                                for t, kind, v in od if kind in (0, 1)])
    for tr in tracks:
        tr['notes'] = to_dict(tr['notes'])
    # 时间轴以原曲长度为准：超出 loop 长度的音符/鼓全部剪掉，保证接缝不出界
    D = orig['duration']
    for tr in tracks:
        tr['notes'] = [n for n in tr['notes'] if n['t'] < D]
    drums = [d for d in drums if d[0] < D]
    return {'key': 'stage1', 'title': orig['title'], 'duration': orig['duration'], 'bpm': orig['bpm'],
            'tracks': tracks, 'drums': drums, 'reasons': []}


def main():
    orig = PS.load_song(ORIG_FILE, 'BOSS_SONGS', 'stage1')
    phx = load_phx()
    print('原曲 %s：%.3fs / bpm %s / %d 轨 / %d 鼓' % (orig['title'], orig['duration'], orig['bpm'], len(orig['tracks']), len(orig['drums'])))
    print('PHOENIX：%.3fs / bpm %s / %d 轨 / %d 鼓' % (phx['duration'], phx['bpm'], len(phx['tracks']), len(phx['drums'])))
    out = {}
    for mode, label in (('orig', 'A 原曲为主'), ('phx', 'B PHOENIX 为主')):
        d = merge(orig, phx, mode)
        d['key'] = 'stage1' + mode
        d['title'] = '%s（融合·%s）' % (orig['title'], label)
        d['reasons'] = [
            '融合对象 = 游戏原本的 ZUN 版（BOSS_SONGS.stage1，120 BPM / %.1fs）' % orig['duration'],
            '原曲贡献贝斯线与和声织体，PHOENIX 贡献四踩鼓与镲片驱动',
            '两版同速，时间轴天然对齐，主旋律不变',
        ]
        out[mode] = d
        print('%s：%d 轨 / %d 鼓' % (label, len(d['tracks']), len(d['drums'])))
    parts = [M.render_song_js(out['orig'], out['orig']['reasons']), M.render_song_js(out['phx'], out['phx']['reasons'])]
    js = ('/**\n * 1 面 Boss《妖魔夜行》：PHOENIX 版 × 游戏原本 ZUN 版 融合 —— tools/merge_stage1.py 生成，勿手改。\n */\n'
          'export const MERGE_STAGE1 = {\n' + parts[0] + ',\n' + parts[1] + ',\n};\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    print('写入', OUT_JS, '%.1f KB' % (len(js.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()