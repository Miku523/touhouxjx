# ---------------------------------------------------------------- 和弦级数
DEG = {0: ('', 'I', 'i'), 1: ('b', 'II', 'ii'), 2: ('', 'II', 'ii'), 3: ('b', 'III', 'III'),
       4: ('', 'III', 'iii'), 5: ('', 'IV', 'iv'), 6: ('b', 'V', 'v'), 7: ('', 'V', 'v'),
       8: ('b', 'VI', 'VI'), 9: ('', 'VI', 'vi'), 10: ('b', 'VII', 'VII'), 11: ('', 'VII', 'vii')}
QUAL_SUF = {'maj': '', 'min': 'm', 'dim': 'dim', 'aug': 'aug', 'sus2': 'sus2', 'sus4': 'sus4',
            'maj7': 'maj7', 'min7': 'm7', 'dom7': '7', 'm7b5': 'm7b5', 'dim7': 'dim7',
            '6': '6', 'm6': 'm6', '7sus4': '7sus4', 'add9': 'add9'}
MINORISH = set(['min', 'min7', 'm6', 'm7b5'])
DRUM_NAMES = {35: 'Kick2', 36: 'Kick', 37: 'SideStick', 38: 'Snare', 39: 'Clap', 40: 'Snare2',
              41: 'LowTom1', 42: 'ClosedHH', 43: 'LowTom2', 44: 'PedalHH', 45: 'MidTom',
              46: 'OpenHH', 47: 'LowMidTom', 48: 'HiTom', 49: 'Crash', 50: 'HiTom2',
              51: 'Ride', 52: 'China'}


def roman_of(chord, key):
    if not chord or not key or chord.get('root_pc') is None:
        return None
    kroot = PC.index(key['root']) if key['root'] in PC else 0
    kmode = key.get('mode', 'major')
    deg = (chord['root_pc'] - kroot) % 12
    acc, maj, mn = DEG[deg]
    num = maj if kmode == 'major' else mn
    q = chord['quality']
    if kmode == 'major' and q in MINORISH:
        num = num.lower()
    if kmode == 'minor' and q not in MINORISH:
        num = num.upper()
    return acc + num + QUAL_SUF.get(q, '')


# ---------------------------------------------------------------- 主分析
def analyze(key, fn, out_name):
    path = os.path.join(SRC, fn)
    midi = M.parse_midi(path)
    chans, tsegs, div = M.extract_channels(midi)
    ts, ks = scan_meta(path)
    duration = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
    bars = bar_grid(tsegs, div, duration)
    tmap = tempo_segments(tsegs)

    metrics, drum_ch = {}, set()
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns:
            continue
        span = max(n['t'] + n['d'] for n in ns) - min(n['t'] for n in ns)
        metrics[ch] = chan_metrics(ns, span)
    for ch in list(metrics):
        ok, reason = is_drum_chan(metrics[ch], chans[ch]['notes'])
        metrics[ch]['is_drum'] = ok
        metrics[ch]['drum_reason'] = reason
        if ok:
            drum_ch.add(ch)

    tl = top_line(chans, drum_ch)
    pairs = {}
    for a in sorted(chans):
        for b in sorted(chans):
            if a < b:
                pairs[(a, b)] = unison_stats(chans, a, b)

    cand = []
    for ch, m in metrics.items():
        if ch in drum_ch or m['count'] == 0:
            continue
        cover = m['span_sec'] / max(duration, 1e-9)
        cand.append(dict(ch=ch, score=round(tl['ratio'].get(ch, 0.0) * cover, 4),
                         top_line_ratio=round(tl['ratio'].get(ch, 0.0), 4),
                         coverage=round(cover, 3)))
    cand.sort(key=lambda d: (-d['score'], d['ch']))
    melody_ch = cand[0]['ch']
    mel_scores = dict((c['ch'], c['score']) for c in cand)

    roles, evid = assign_roles(chans, metrics, drum_ch, melody_ch, pairs,
                                tl['ratio'], duration, mel_scores)

    mel_notes = chans[melody_ch]['notes']
    mel_line = melody_line(mel_notes)
    segments = detect_segments(chans, drum_ch, melody_ch, bars, duration)
    line_by_seg = [[x for x in mel_line if s['start_sec'] <= x['t'] < s['end_sec']] for s in segments]
    grams = [motif_of(l) for l in line_by_seg]
    label_segments(segments, line_by_seg, grams)

    weights = {'lead': 0.25, 'lead_alt': 0.3, 'lead_double': 0.25, 'lead_octave': 0.3,
               'harmony': 0.9, 'pad': 0.7, 'bass': 1.0, 'bass_double': 0.6,
               'arp': 0.4, 'arp_double': 0.3, 'counter': 0.5, 'counter_double': 0.3,
               'drums': 0.0, 'empty': 0.0}
    harm = harmony_by_bar(chans, roles, drum_ch, bars, weights)
    whole_key = key_of(mel_notes)
    for h in harm:
        h['roman'] = roman_of(h, whole_key) if h.get('chord') else None
    seg_keys = []
    for i, s in enumerate(segments):
        ln = line_by_seg[i]
        k = key_of([dict(m=x['m'], d=x['d']) for x in ln]) if ln else None
        seg_keys.append(k)
        s['key'] = k
        s['key_roman_base'] = k['key'] if k else None
        tot = s['total_onsets'] or 1
        tex = []
        for kk, vv in sorted(s['notes_by_channel'].items(), key=lambda kv: -kv[1])[:4]:
            tex.append('ch%s:%s×%d(%.0f%%)' % (kk, roles.get(int(kk), '?'), vv, 100.0 * vv / tot))
        s['texture'] = ' + '.join(tex)

    tri = tritone_scan(chans, drum_ch)
    gtv = global_top_voice(chans, drum_ch)
    # 主旋律三全音跳进（只用主旋律通道）
    mel_leaps = []
    for i in range(len(mel_line) - 1):
        if abs(mel_line[i + 1]['m'] - mel_line[i]['m']) == 6:
            mel_leaps.append([round(mel_line[i + 1]['t'], 3), mel_line[i]['m'], mel_line[i + 1]['m']])
    gtv_leaps = []
    for i in range(len(gtv) - 1):
        if abs(gtv[i + 1]['m'] - gtv[i]['m']) == 6:
            gtv_leaps.append([round(gtv[i + 1]['t'], 3), gtv[i]['m'], gtv[i + 1]['m']])

    drums_by_bar = []
    for h in harm:
        hits = []
        cnt = collections.Counter()
        for ch in sorted(chans):
            if ch not in drum_ch:
                continue
            for n in chans[ch]['notes']:
                if h['start_sec'] <= n['t'] < h['end_sec']:
                    hits.append(dict(ch=ch, t=round(n['t'], 3), pitch=n['m'],
                                     dur=round(n['d'], 3), vel=n['v']))
                    cnt[n['m']] += 1
        drums_by_bar.append(dict(bar=h['bar'], start_sec=h['start_sec'], end_sec=h['end_sec'],
                                 hits=hits,
                                 counts=[dict(pitch=p, name=DRUM_NAMES.get(p, 'p%d' % p), n=c)
                                         for p, c in sorted(cnt.items())]))

    out = dict(
        meta=dict(
            key=key, source_file=fn, source_url='https://github.com/AyHa1810/touhou-midi-collection',
            division=div, track_count=len(midi.get('tracks', [])),
            duration_sec=round(duration, 3),
            time_signature=[dict(tick=t[0], num=t[1], denom=t[2]) for t in ts],
            key_signature=[dict(tick=k[0], sharps_flats=k[1], minor=k[2]) for k in ks],
            tempo_map=[dict(tick=t['tick'], start_sec=t['start_sec'], end_sec=t['end_sec'],
                            bpm=t['bpm'], uspq=t['uspq']) for t in tmap],
            bar_grid=[dict(bar=b['bar'], start_sec=b['start_sec'], end_sec=b['end_sec'],
                           sec_per_bar=b['sec_per_bar'], bpm=b['bpm']) for b in bars],
            total_bars=len(bars),
            melody_channel=melody_ch,
            melody_channel_selection=dict(
                rule='score = 最高声线持有率 x 该通道时间跨度占比，取最大者',
                ranking=cand),
            melody_range=[min(n['m'] for n in mel_notes), max(n['m'] for n in mel_notes)],
            melody_note_count=len(mel_notes),
            melody_key=whole_key,
            drums_channels=sorted(drum_ch),
            note_units='seconds (midi2js.extract_channels 已把 tick 换算成秒)',
        ),
        channels=dict(
            ('ch%d' % ch, dict(
                role=roles.get(ch, 'empty'),
                is_drum=metrics[ch]['is_drum'],
                drum_reason=metrics[ch]['drum_reason'],
                program=metrics[ch]['progs'],
                note_count=metrics[ch]['count'],
                pitch_min=metrics[ch]['pitch_min'], pitch_max=metrics[ch]['pitch_max'],
                pitch_median=metrics[ch]['pitch_median'], pitch_mean=metrics[ch]['pitch_mean'],
                distinct_pitches=metrics[ch]['distinct_pitches'],
                avg_velocity=metrics[ch]['avg_vel'], avg_duration=metrics[ch]['avg_dur'],
                min_duration=metrics[ch]['min_dur'], max_duration=metrics[ch]['max_dur'],
                start_sec=metrics[ch]['start_sec'], end_sec=metrics[ch]['end_sec'],
                span_sec=metrics[ch]['span_sec'], density_per_sec=metrics[ch]['density'],
                avg_simultaneity=metrics[ch]['avg_simultaneity'],
                top_line_ratio=round(tl['ratio'].get(ch, 0.0), 4),
                top_line_abs_ratio=round(tl['abs_ratio'].get(ch, 0.0), 4),
                role_evidence=evid.get(ch, []),
                unison_with_melody=pairs.get((min(ch, melody_ch), max(ch, melody_ch)))
                if ch != melody_ch else None,
            )) for ch in sorted(metrics)),
        segments=segments,
        melody_notes=[[round(n['t'], 3), n['m'], round(n['d'], 3), n['v']] for n in mel_notes],
        melody_line=[[x['t'], x['m'], round(x['d'], 3), x['v']] for x in mel_line],
        melody_top_voice=[[x['t'], x['m'], round(x['d'], 3), x['v']] for x in gtv],
        melody_top_voice_leaps=gtv_leaps,
        melody_leaps_tritone=mel_leaps,
        segment_keys=seg_keys,
        harmony_by_bar=harm,
        drums_by_bar=drums_by_bar,
        tritones=tri,
    )
    with open(os.path.join(BASE, out_name), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    return out, chans, segments, bars, roles, metrics, tl, drum_ch, duration
