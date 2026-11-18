# ---------------------------------------------------------------- 报告
FENCE = chr(96) * 3


def md_table(header, rows):
    out = ['| ' + ' | '.join(str(h) for h in header) + ' |',
           '|' + '|'.join(['---'] * len(header)) + '|']
    for r in rows:
        out.append('| ' + ' | '.join('' if x is None else str(x) for x in r) + ' |')
    return '\n'.join(out)


def spans_of(notes, gap=1.2):
    """音符表 -> 连续活动区间。notes: [[t,m,d,v]]"""
    out = []
    if not notes:
        return out
    t0 = t1 = notes[0][0]
    for n in notes[1:]:
        if n[0] - t1 > gap:
            out.append((round(t0, 3), round(t1, 3)))
            t0 = n[0]
        t1 = max(t1, n[0] + n[2])
    out.append((round(t0, 3), round(t1, 3)))
    return out


def bar_runs(bars):
    runs = []
    for b in bars:
        if runs and abs(runs[-1][2] - b['bpm']) < 0.01 and runs[-1][1] == b['bar'] - 1:
            runs[-1][1] = b['bar']
            runs[-1][3] = b['end_sec']
            runs[-1][4] = b['start_sec']
        else:
            runs.append([b['bar'], b['bar'], b['bpm'], b['end_sec'], b['start_sec']])
    return runs


def chord_runs(harm):
    runs = []
    for h in harm:
        key = (h.get('chord'), h.get('roman'))
        if runs and runs[-1][0] == key[0] and runs[-1][2] == h['bar'] - 1:
            runs[-1][2] = h['bar']
            runs[-1][5] = h.get('bass_name')
            runs[-1][6] = ','.join(h.get('pcs') or [])
        else:
            runs.append([h.get('chord'), h.get('roman'), h['bar'], h['bar'],
                         h.get('bass_name'), ','.join(h.get('pcs') or []), h.get('confidence')])
    return runs


def write_report(results, path):
    L = []
    A = L.append
    A('# ZUN 原曲 MIDI 音符级分析报告')
    A('')
    A('- 生成脚本：tools/build/_midi/analyze.py（只读分析；重复运行 python tools/build/_midi/analyze.py 即可复现全部数字）')
    A('- 数据源：tools/build/_midi/src/*.mid（原压缩包 tools/build/_midi/midi.zip，来源 https://github.com/AyHa1810/touhou-midi-collection）')
    A('- 本次未修改 src/ 下任何曲目或代码文件，未执行 git add/commit。')
    A('- 时间单位一律为秒（midi2js.extract_channels 已把 tick 换算成秒；division=480 ticks/四分音符）。')
    A('- 本报告所有数字均由脚本直接统计得出，判定依据见第 0 节口径表。')
    A('')
    A('## 0. 判定口径（可复现）')
    A('')
    A(md_table(['项目', '口径'], [
        ['主旋律通道', 'score = 最高声线持有率 x 该通道时间跨度占比，取最大者。最高声线 = 0.05s 栅格上每格最高的非鼓音符记给其通道；持有率 = 该通道在自己发声的栅格中占据最高位的比例。'],
        ['鼓通道', 'program >= 115，或 >=90% 音符落在 GM 打击乐音高 35-51 且密度 >= 8 音/秒。'],
        ['通道角色', '见各曲「通道与角色」表的依据列（每条依据都带数字）。同音双轨 = 两通道对齐 onset 中音高相同比例 >= 0.85；八度关系 = 音高差 +-12 半音命中比例 >= 0.55。'],
        ['段落边界', '(a) 主旋律音符停顿 > 1.2s，取停顿时段中点；(b) 织体能量分布 L1 突变 >= 0.45（前后各 2s 通道占比向量）。两者合并后吸附到最近小节线（误差 <= 0.4s）。'],
        ['段落标签', '无主旋律音符 = interlude（首段 = intro，末段追加 +outro）；主旋律平均时值 <= 0.22s 且 >=20 音 = ostinato；段落音符密度 >= 有旋律段中位数 x1.5 = chorus；<= x0.6 = verse；其余 = theme；与前段动机 n-gram Jaccard >= 0.35 = theme_recap。'],
        ['和弦', '逐小节模板匹配（maj/min/dim/aug/sus2/sus4/maj7/min7/dom7/m7b5/dim7/6/m6/7sus4/add9），权重 bass 1.0 / harmony 0.9 / pad 0.7 / counter 0.5 / arp 0.4 / lead 0.25，根音优先取最低音；级数按全曲调性换算。'],
        ['三全音', '同时三全音 = 同一 onset 内两音相差 6 个半音；旋律三全音跳进 = 相邻两音相差 6 个半音。'],
    ]))
    A('')

    titles = {
        'tillwhen': 'pre5《広有射怪鳥事 ～ Till When?》（魂魄妖梦主题，原 155 BPM）',
        'border13': 'stage5《幽雅に咲かせ、墨染の桜 ～ Border of Life》（西行寺幽幽子主题，144 -> 155 BPM）',
        'border14': '参考《Border of Life》（另一版，152 BPM，仅作对照）',
    }
    for idx, (key, out) in enumerate(results.items(), start=1):
        meta = out['meta']
        ch = out['channels']
        A('## %d. %s' % (idx, titles.get(key, key)))
        A('')
        A('### %d.1 文件头与速度地图' % idx)
        A('')
        A('- MIDI 文件：%s' % meta['source_file'])
        A('- division = %d ticks/四分音符，track 数 = %d' % (meta['division'], meta['track_count']))
        A('- 总时长 = %.3f s；拍号 = %s；共 %d 小节（4/4）' % (
            meta['duration_sec'],
            ' / '.join('%d/%d' % (t['num'], max(t['denom'], 1)) for t in meta['time_signature']) or '无',
            meta['total_bars']))
        A('- 调号元信息：%s' % (', '.join('tick%d sf=%d mi=%d' % (k['tick'], k['sharps_flats'], k['minor'])
                                   for k in meta['key_signature']) or '无'))
        A('')
        A('**tempo map（全部 %d 段）**' % len(meta['tempo_map']))
        A('')
        rows = []
        for i, t in enumerate(meta['tempo_map']):
            end = t['end_sec'] if t['end_sec'] is not None else meta['duration_sec']
            rows.append([i, t['tick'], '%.3f' % t['start_sec'], '%.3f' % end, '%.3f' % t['bpm'],
                         '%.4f' % (240.0 / t['bpm'])])
        A(md_table(['#', '起始 tick', '起始秒', '结束秒', 'BPM', '每小节秒数(4/4)'], rows))
        A('')
        A('**小节网格（按 BPM 分段）**')
        A('')
        rows = []
        for r in bar_runs(meta['bar_grid']):
            rows.append(['bar %d-%d' % (r[0], r[1]), '%.3f' % r[4], '%.3f' % r[3],
                         '%.2f' % r[2], '%.3f' % (r[3] - r[4])])
        A(md_table(['小节', '起始秒', '结束秒', 'BPM', '小节时长秒'], rows))
        A('')
        A('### %d.2 通道统计与角色判定' % idx)
        A('')
        rows = []
        for name, c in sorted(ch.items(), key=lambda kv: int(kv[0][2:])):
            rows.append([name, c['role'], c['note_count'],
                         '%d-%d' % (c['pitch_min'], c['pitch_max']),
                         ', '.join('%d x%d' % (k, v) for k, v in sorted(c['program'].items(), key=lambda kv: int(kv[0]))),
                         c['avg_velocity'], '%.2f' % c['density_per_sec'],
                         '%.2f' % c['avg_simultaneity'],
                         '%.3f-%.3f' % (c['start_sec'], c['end_sec']),
                         '%.3f' % c['top_line_ratio']])
        A(md_table(['通道', '角色', '音符数', '音域', '音色(program x 音符数)', '力度均值',
                    '密度(音/秒)', '同时发音', '跨度(秒)', '最高声线持有率'], rows))
        A('')
        A('**角色判定依据**')
        A('')
        for name, c in sorted(ch.items(), key=lambda kv: int(kv[0][2:])):
            A('- %s（%s）：%s' % (name, c['role'], '；'.join(c['role_evidence'])))
        A('')
        A('### %d.3 段落结构' % idx)
        A('')
        rows = []
        for s in out['segments']:
            rows.append([s['index'], '%.3f-%.3f' % (s['start_sec'], s['end_sec']),
                         'bar %d-%d' % (s['start_bar'], s['end_bar']), s['label'],
                         s['melody_onsets'], '%.2f' % s['onset_rate'], s['drum_onsets'],
                         s['key']['key'] if s.get('key') else '-', s['boundary_reason']])
        A(md_table(['#', '起止秒', '小节', '结构', '主旋律音数', '全曲音/秒', '鼓击数', '该段调性', '边界原因'], rows))
        A('')
        A('**每段织体与判定**')
        A('')
        for s in out['segments']:
            A('- 段落 #%d（%.3f-%.3f s，%s）：%s' % (s['index'], s['start_sec'], s['end_sec'], s['label'], s['texture']))
            A('  - 判定：%s' % s['label_reason'])
        A('')
        A('### %d.4 主旋律' % idx)
        A('')
        mn = out['melody_notes']
        A('- 主旋律通道：ch%d，%d 个音符，音域 %d-%d，全曲调性估计 %s（相关系数 %s）'
          % (meta['melody_channel'], len(mn), meta['melody_range'][0], meta['melody_range'][1],
             meta['melody_key']['key'], meta['melody_key']['confidence']))
        A('- 主旋律活动区间（间隔 > 1.2s 断开）：%s'
          % '，'.join('%.3f-%.3f s' % sp for sp in spans_of(mn)))
        A('- 全曲最高声线（所有非鼓通道叠加）%d 个音点；三全音跳进 %d 处。'
          % (len(out['melody_top_voice']), len(out['melody_top_voice_leaps'])))
        A('')
        A('**主旋律前 24 音符（[起始秒, MIDI音高, 时值秒, 力度]）**')
        A('')
        A(FENCE)
        for row in mn[:24]:
            A('%8.3f  %3d  %6.3f  %3d' % (row[0], row[1], row[2], row[3]))
        A(FENCE)
        A('')
        A('### %d.5 和声骨架（逐小节）' % idx)
        A('')
        rows = []
        for r in chord_runs(out['harmony_by_bar']):
            rows.append(['bar %d-%d' % (r[2], r[3]), r[0], r[1], r[4], r[5], r[6]])
        A(md_table(['小节', '和弦', '级数', '低音', '音级集合', '匹配度'], rows))
        A('')
        A('### %d.6 鼓组' % idx)
        A('')
        pit = collections.Counter()
        for b in out['drums_by_bar']:
            for h in b['hits']:
                pit[h['pitch']] += 1
        for name, c in sorted(ch.items(), key=lambda kv: int(kv[0][2:])):
            if not c['is_drum']:
                continue
            A('- %s：%d 个打击乐音符，音高集 %s，跨度 %.3f-%.3f s，密度 %.2f 音/秒'
              % (name, c['note_count'],
                 ', '.join('%d(%s) x%d' % (p, DRUM_NAMES.get(p, '?'), pit[p]) for p in sorted(pit)),
                 c['start_sec'], c['end_sec'], c['density_per_sec']))
        A('')
        A('### %d.7 重配器要点' % idx)
        A('')
        A('- **逐音搬入**：主旋律 = ch%d 的 %d 个音符（含时值与力度），JSON 字段 melody_notes；'
          '真正在响的最高声线版本见 melody_top_voice（%d 点）。'
          % (meta['melody_channel'], len(mn), len(out['melody_top_voice'])))
        keys = [(s['index'], s['key']['key'], s['key']['confidence']) for s in out['segments'] if s.get('key')]
        if keys:
            A('- **转调需求**：全曲 %s；分段调性估计：%s' % (
                meta['melody_key']['key'],
                '，'.join('段落#%d %s(%s)' % (i, k, c) for i, k, c in keys)))
        A('- **音域**：主旋律 %d-%d（MIDI），重配保持在同一音区；若降八度须保留音程关系。'
          % (meta['melody_range'][0], meta['melody_range'][1]))
        tri = out['tritones']
        A('- **三全音检查**：全曲同时三全音 %d 处、旋律三全音跳进 %d 处（明细见 JSON tritones / melody_leaps_tritone）。'
          % (tri['simultaneous_tritone_count'], tri['melodic_tritone_leap_count']))
        doubles = [(n, c) for n, c in sorted(ch.items(), key=lambda kv: int(kv[0][2:]))
                   if 'double' in c['role'] or c['role'] == 'lead_octave']
        if doubles:
            A('- **同音/八度叠录（重配可只保留一条）**：%s'
              % '，'.join('%s=%s' % (n, c['role']) for n, c in doubles))
        A('- **纪律**：只做 ZUN 原 MIDI 逐音搬入 + 重配器；禁止 blast beat、三全音簇、Eurobeat 外套等外来语法。')
        A('')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')


def main():
    results = {}
    for key, fn, out_name in SONGS:
        out, chans, segments, bars, roles, metrics, tl, drum_ch, duration = analyze(key, fn, out_name)
        results[key] = out
        print('%s -> %s  dur=%.2fs bars=%d melody=ch%d segments=%d'
              % (key, out_name, duration, len(bars), out['meta']['melody_channel'], len(segments)))
    write_report(results, os.path.join(BASE, 'REPORT_MIDI.md'))
    print('REPORT_MIDI.md written')


if __name__ == '__main__':
    main()
