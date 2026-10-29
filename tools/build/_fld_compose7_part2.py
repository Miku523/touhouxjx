
def write():
    tracks_js = []
    tracks_json = []
    for name, wave, gain in L.TRACK_DEFS:
        ns = sorted(L.TRACKS[name], key=lambda x: (x[0], x[1]))
        tracks_js.append((name, wave, gain, ns))
        tracks_json.append({'name': name, 'wave': wave, 'gain': gain, 'notes': ns})
    dr = sorted(L.DRUMS, key=lambda x: (x[0], x[1]))

    def num(v):
        s = ('%.4f' % v).rstrip('0').rstrip('.')
        return s if s else '0'

    def dj(ev):
        extra = ',' + num(ev[3]) if len(ev) > 3 else ''
        return '[%s,%d,%d%s]' % (num(ev[0]), int(ev[1]), int(ev[2]), extra)

    lines = []
    lines.append('/**')
    lines.append(' * EX 面 BOSS《恶魔之妹》v7 —— 红月下被囚禁 495 年的芙兰朵露。')
    lines.append(' * 160 BPM, D 小调, 4/4, 100 小节 = 150.0s 循环。这一版不再混入最終鬼畜妹的元素，')
    lines.append(' * 整首是 U.N. Owen Was Her? 的忠实改编：旋律逐音取自原曲 MIDI，和声照原曲段落，')
    lines.append(' * 只把织体换成钢琴 + 弦乐 + 八音盒的编制。段落对照原曲小节：')
    lines.append(' *   引子 I 1-6 / 引子 II 7-10（八音盒时钟 + 弱起）')
    lines.append(' *   A 11-21 = 原曲 b1-11（时钟琶音主题）')
    lines.append(' *   B 22-29 = 原曲 b12-19（C# 踏板半音下行，牢笼）')
    lines.append(' *   C1 30-45 = 原曲 b20-35（副歌 Bb-C / Dm-G）')
    lines.append(' *   D 46-57 = 原曲 b36-47（钢琴分解间奏）')
    lines.append(' *   E 58-73 = 原曲 b48-63（展开，加厚）')
    lines.append(' *   C2 74-89 = 原曲 b64-79（副歌再现）')
    lines.append(' *   尾句 90 = 原曲 b80（皮卡迪三度）')
    lines.append(' *   Outro 91-100（崩回八音盒，接回引子）。')
    lines.append(' * tools/build/_fld_compose7.py 生成，勿手改。')
    lines.append(' */')
    lines.append('export const FLANDRE_DEVIL = {')
    lines.append('  extra: {')
    lines.append("    title: '恶魔之妹',")
    lines.append('    duration: 150,')
    lines.append('    bpm: 160,')
    lines.append('    tracks: [')
    for name, wave, gain, ns in tracks_js:
        chunk = '[' + ','.join('[%s,%d,%s,%d]' % (num(t), p, num(d), v) for t, p, d, v in ns) + ']'
        lines.append("      { name: '%s', wave: '%s', gain: %s, notes: %s }," % (name, wave, gain, chunk))
    lines.append('    ],')
    lines.append('    drums: [' + ','.join(dj(ev) for ev in dr) + '],')
    lines.append('  },')
    lines.append('};')
    js = '\n'.join(lines) + '\n'

    root = os.path.dirname(os.path.dirname(HERE))
    out_js = os.path.join(root, 'src', 'engine', 'songs', 'flandre_devil.js')
    with open(out_js, 'w', encoding='utf-8') as f:
        f.write(js)
    json_path = os.path.join(HERE, '_fld_lead', 'song7.json')
    data = {'title': '恶魔之妹', 'duration': 150.0, 'bpm': 160,
            'tracks': tracks_json, 'drums': dr}
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print('wrote', out_js)
    print('wrote', json_path)
    print('notes:', sum(len(x['notes']) for x in tracks_json), 'drums:', len(dr))
    last = 0.0
    for name, _, _, ns in tracks_js:
        if ns:
            e = ns[-1][0] + ns[-1][2]
            last = max(last, e)
            print('  %-8s %4d notes  last=%.3f' % (name, len(ns), e))
        else:
            print('  %-8s EMPTY' % name)
    print('   last end %.3f' % last)

def main():
    intro(); sec_a(); sec_b(); sec_c1(); sec_d(); sec_e(); sec_c2(); sec_tail_outro()
    write()

if __name__ == '__main__':
    main()
