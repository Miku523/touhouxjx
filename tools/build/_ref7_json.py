# -*- coding: utf-8 -*-
"""_ref7_json.py —— 汇总为 tools/build/_ref7_features.json（人工判读段落名 + 全部测量）。"""
import os, sys, json
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = json.load(open(os.path.join(HERE, '_ref7_raw.json'), encoding='utf-8'))
SEC = json.load(open(os.path.join(HERE, '_ref7_sec.json'), encoding='utf-8'))
EXT = {nm: json.load(open(os.path.join(HERE, '_ref7_ext_%s.json' % nm), encoding='utf-8'))
       for nm in ('ref4', 'ref5', 'ref6')}
ENV16 = json.load(open(os.path.join(HERE, '_ref7_env16.json'), encoding='utf-8'))

NAMES = list('C C# D D# E F F# G G# A A# B'.split())

SECTIONS = {
    'ref4': [(0, 8, 'Intro'), (8, 22, 'A段'), (22, 35, 'B段（E/Ddim 半音和弦）'),
             (35, 46, 'C段'), (46, 58, 'Breakdown（半速）'), (58, 74, 'Guitar Solo'),
             (74, 102, '终段（转 C 小调）'), (102, 109, 'Outro（静音收尾）')],
    'ref5': [(0, 1, 'Intro（空白）'), (1, 32, '主题A｜G#m↔Bb 半音中音 riff'),
             (32, 71, 'A2｜同 riff 变奏 + Em/Am'), (71, 84, 'B｜C#m/Asus4 半速'),
             (84, 95, 'Break｜底鼓抽空'), (95, 115, 'C｜A#7/B7 高密度'),
             (115, 133, 'B2｜C#m/Am'), (133, 147, 'Break2｜安静'),
             (147, 178, 'D｜大合奏（Em/Am/Cm 混搭）'), (178, 187, 'E｜Cm7/C5 转调'),
             (187, 196, 'Outro｜C5 渐隐 + 静音')],
    'ref6': [(0, 11, 'Intro｜无鼓稀疏'), (11, 23, 'A段'), (23, 35, 'A2段'),
             (35, 78, 'B段｜主部 60.7s'), (78, 92, 'C段｜稀疏'), (92, 105, 'D段｜D#5/Ddim 块'),
             (105, 113, 'D2段'), (113, 123, 'Break｜只剩和声'), (123, 131, 'Outro｜渐隐 + 静音')],
}

KEY = {
    'ref4': dict(key='D', mode='minor', conf=0.85, alt=[['C', 'major', 0.28], ['A', 'minor', 0.47]],
                 reason='KS 模板 D 小调 0.601 最高；音级 D0.108/E0.109/F0.096/A0.120；低音 D 占 30%；主和弦 Dm 32 小节（29%）；关系大调 F 仅 0.26'),
    'ref5': dict(key='E', mode='minor', conf=0.50, alt=[['A', 'minor', 0.69], ['E', 'major', 0.63], ['A', 'major', 0.56]],
                 reason='KS 模板 E 小调 0.669 与 A 小调 0.607 接近、加权后 0.702 vs 0.687 几乎并列；低音 A 占 23% 指向 A 小调；但主题 riff 是 G#m↔Bb、后段 Em/Am/D7、尾段 Cm/C5 —— 一首歌里至少 3 个调性中心，判 E 小调置信度只有 0.50'),
    'ref6': dict(key='D', mode='minor', conf=0.90, alt=[['A', 'minor', 0.44], ['F', 'major', 0.36]],
                 reason='KS 模板 D 小调 0.792 远高于第二名 0.559；音级 D0.128/E0.127/A0.116/F0.103；主和弦 Dm 34 小节（26%）+ Dsus4 20 小节；低音 C#/D/D# 为半音爬行而非转调'),
}

BPMNOTE = {
    'ref4': '16 分栅格自相关（div=4 相位梳状 + 拍/小节双层校验）168.000，候选 84.0 为半速、251.99≈1.5×、42.0 为 1/4 速；局部速度 20s 窗 167.95-168.16 → 全曲恒速',
    'ref5': '167.005 BPM（栅格拟合 0.60，prom 0.90 = 半速/倍速对手明显弱）；局部 166.88-167.30（±0.13%）→ 恒速，无变速段落',
    'ref6': '169.980 BPM（prom 0.59）；局部 169.75-171.34，仅前 10s 的稀疏 intro 有 ±0.5% 的自由起速，之后锁死',
}


def norm_energy(db):
    return round(float(np.clip((db + 24.0) / 17.0, 0, 1)), 3)


def build(nm):
    d = RAW[nm]
    bars = d['bars']
    e = EXT[nm]
    secs = []
    for a, b, name in SECTIONS[nm]:
        seg = bars[a:b]
        if len(seg) < 1:
            db = -120.0
        else:
            db = round(float(20 * np.log10(np.mean([x['rms'] for x in seg]) + 1e-9)), 1)
        kk = SEC[nm]['drums']['kick']['count_series'][a:b]
        sn = SEC[nm]['drums']['snare']['count_series'][a:b]
        ht = SEC[nm]['drums']['hat']['count_series'][a:b]
        simp_hist = {}
        for z in e['simple'][a:b]:
            simp_hist[z['chord']] = simp_hist.get(z['chord'], 0) + 1
        secs.append(dict(
            name=name, start=round(float(seg[0]['t0']), 2) if len(seg) else None,
            end=round(float(seg[-1]['t1']), 2) if len(seg) else None,
            dur=round(float(seg[-1]['t1'] - seg[0]['t0']), 2) if len(seg) else 0.0,
            bars=[a, b], energy_db=db, energy=norm_energy(db),
            density=round(float(np.mean([x['density'] for x in seg])), 2) if len(seg) else 0.0,
            kick_per_bar=round(float(np.mean(kk)), 2) if len(kk) else 0.0,
            snare_per_bar=round(float(np.mean(sn)), 2) if len(sn) else 0.0,
            hat_per_bar=round(float(np.mean(ht)), 2) if len(ht) else 0.0,
            cen=round(float(np.median([x['cen'] for x in seg])), 0) if len(seg) else 0,
            low=round(float(np.median([x['low'] for x in seg])), 3) if len(seg) else 0,
            high=round(float(np.median([x['high'] for x in seg])), 3) if len(seg) else 0,
            air=round(float(np.median([x['air'] for x in seg])), 3) if len(seg) else 0,
            chords=sorted(simp_hist.items(), key=lambda kv: -kv[1])[:6],
        ))
    dr = SEC[nm]['drums']
    drums = {}
    for k in ('kick', 'snare', 'hat'):
        v = dr[k]
        assert sum(v['hist16']) == v['n'], (nm, k, sum(v['hist16']), v['n'])
        drums[k] = dict(onsets=v['n'], per_bar=v['per_bar'], hist16=v['hist16'],
                        hit16_pct=v['hit16'], prof16=v['prof16'], beat_hist=v['beat_hist'],
                        max_per_bar=v['max_per_bar'], max_at_bar=v['max_at_bar'])
    for k in ('kick', 'snare', 'hat'):
        drums[k].update(ENV16[nm][k])
    drums['summary'] = dict(
        open_hat_ratio=dr['open_hat_ratio'],
        kick_dt_median_s=dr.get('kick_dt_median'),
        kick_dt_lt_120ms_frac=dr.get('kick_dt_lt_012'),
        four_on_floor_bars=dr['four_on_floor_bars'],
        four_on_floor_frac=dr['four_on_floor_frac'],
        kick_heavy_steps=[int(np.argmax(dr['kick']['hit16'])), int(np.argsort(-np.array(dr['kick']['hit16']))[1])],
        snare_heavy_steps=[int(np.argmax(dr['snare']['hit16'])), int(np.argsort(-np.array(dr['snare']['hit16']))[1])],
        hat_heavy_steps=[int(i) for i in np.argsort(-np.array(dr['hat']['hit16']))[:4]],
        hat_offbeat8_pct=round(float(np.mean(np.array(dr['hat']['hit16'])[[2, 6, 10, 14]])), 1),
        hat_downbeat_pct=round(float(np.mean(np.array(dr['hat']['hit16'])[[0, 4, 8, 12]])), 1),
        kick_syncopated_pct=round(float(np.mean(np.array(dr['kick']['hit16'])[[2, 6, 10, 14]])), 1),
        kick_beats13_pct=round(float(np.mean(np.array(dr['kick']['hit16'])[[0, 8]])), 1),
        snare_beat24_pct=round(float(np.mean(np.array(dr['snare']['hit16'])[[4, 12]])), 1),
        snare_beat13_pct=round(float(np.mean(np.array(dr['snare']['hit16'])[[0, 8]])), 1),
        index_note='hit16/env16 为 16 个 16 分格的数组（下标 0-15）。下标 0/4/8/12 = 第 1/2/3/4 拍；下标 2/6/10/14 = 1&/2&/3&/4&（8 分反拍）；下标 1/3/5/7/9/11/13/15 = 16 分的 e/a 位',
    )
    chords = []
    for i, b in enumerate(bars):
        s = e['simple'][i]
        chords.append(dict(
            bar=i, t=round(float(b['t0']), 2),
            chord=s['chord'], alt=s['chord2'], margin=s['margin'],
            bass=NAMES[b['bass_pc']] if b['bass_pc'] >= 0 else '-',
            halves=[[q['t'], q['chord']] for q in s['halves']],
            chord7=b['chord'],
        ))
    out = dict(
        tag=nm,
        file='tools/build/_ref7/%s.mp3' % nm,
        bpm=d['bpm'], bpm_confidence=d['bpm_conf'],
        bpm_confidence_detail=d['bpm_confidence_detail'],
        bpm_candidates=d['bpm_candidates'][:6],
        bpm_note=BPMNOTE[nm],
        key=KEY[nm]['key'], mode=KEY[nm]['mode'], key_confidence=KEY[nm]['conf'],
        key_alternatives=KEY[nm]['alt'], key_reason=KEY[nm]['reason'],
        duration=round(float(d['dur']), 2),
        meter='4/4', bar_sec=round(float(d['bar_sec']), 4),
        beat_offset=round(float(d['beat_offset']), 3),
        sections=secs,
        drums=drums,
        chords=chords,
        evidence=dict(
            pitch_classes=[round(float(v), 3) for v in e['pitch_classes']],
            bass_hist=[round(float(v), 3) for v in d['key']['bass_hist']],
            chroma_entropy=round(float(d['dissonance']['entropy_mean']), 3),
            m2_frames=int(d['dissonance']['m2_frames']),
            tt_frames=int(d['dissonance']['tt_frames']),
            m2_bar_mean=e['m2_mean'], tt_bar_mean=e['tt_mean'],
            m2_top=e['m2_top'][:5], tt_top=e['tt_top'][:5],
            dim_bars=e['dim_bars'],
            semitone_root_steps=e['semitone_root_steps'],
            semitone_root_times=e['semitone_root_times'],
            chromatic_runs=d['melody_chroma_runs'][:10],
            melody=d['melody'],
            silences=e['fine_silences'],
            spectral=dict(peak=e['peak'], rms_dbfs=e['rms_dbfs'], clip_frac_pct=e['clip_frac'],
                          cen_median=e['cen_median'], cen_min=e['cen_min'], cen_max=e['cen_max'],
                          low=e['low_median'], high=e['high_median'], air=e['air_median']),
            tempo=dict(local_range=e['tempo_local_range'],
                       drift_ms_per_100s=d['grid_drift_ms_per_100s'],
                       meter_scores=e['metre_global']),
            chord_ambiguity=dict(margin_median=e['chord_margin_median'],
                                 ambiguous_frac=e['ambiguous_frac']),
            onsets=d['onsets'],
        ),
        notes='',
    )
    return out


def notes_for(nm, o):
    secs = o['sections']
    loud = max(secs, key=lambda s: s['energy_db'])
    quiet = min([s for s in secs if s['dur'] > 3], key=lambda s: s['energy_db'])
    ev = o['evidence']
    su = o['drums']['summary']
    kh = o['drums']['kick']['hit16_pct']; sh = o['drums']['snare']['hit16_pct']
    hh = o['drums']['hat']['hit16_pct']
    L = []
    L.append('%s：BPM %.2f（conf %.2f），%s，%s %s（conf %.2f），%.2fs / %d 小节。' % (
        nm, o['bpm'], o['bpm_confidence'], o['meter'], o['key'], o['mode'],
        o['key_confidence'], o['duration'], len(o['chords'])))
    L.append('最响段 %s（%.1f s，%.1f dB）；最静段 %s（%.1f s，%.1f dB）。' % (
        loud['name'], loud['dur'], loud['energy_db'], quiet['name'], quiet['dur'], quiet['energy_db']))
    L.append('鼓：kick %d 次 = %.2f/小节，16 格最重为第 %d 格(%.0f%%)、第 %d 格(%.0f%%)；'
             'snare %d 次 = %.2f/小节，2/4 拍 %.0f%% vs 1/3 拍 %.0f%%；'
             'hat %d 次 = %.2f/小节，8 分反拍 %.0f%% vs 正拍 %.0f%%；'
             '四踩小节 %d 个（%.0f%%）；kick 相邻 <120ms %.0f%%。' % (
        o['drums']['kick']['onsets'], o['drums']['kick']['per_bar'],
        su['kick_heavy_steps'][0] + 1, kh[su['kick_heavy_steps'][0]],
        su['kick_heavy_steps'][1] + 1, kh[su['kick_heavy_steps'][1]],
        o['drums']['snare']['onsets'], o['drums']['snare']['per_bar'],
        su['snare_beat24_pct'], su['snare_beat13_pct'],
        o['drums']['hat']['onsets'], o['drums']['hat']['per_bar'],
        su['hat_offbeat8_pct'], su['hat_downbeat_pct'],
        su['four_on_floor_bars'], su['four_on_floor_frac'] * 100,
        su['kick_dt_lt_120ms_frac'] * 100))
    L.append('不协和：m2 帧 %d / tt 帧 %d；减和弦 %d 小节；低音半音相邻 %d 次。' % (
        ev['m2_frames'], ev['tt_frames'], len(ev['dim_bars']), ev['semitone_root_steps']))
    L.append('电平：RMS %s dBFS、peak %.2f、削波 %.2f%%、频谱重心 %d Hz、高频占比 %s、空气感 %s。' % (
        ev['spectral']['rms_dbfs'], ev['spectral']['peak'], ev['spectral']['clip_frac_pct'],
        ev['spectral']['cen_median'], ev['spectral']['high'], ev['spectral']['air']))
    return ''.join(L)


FEAT = {}
for nm in ('ref4', 'ref5', 'ref6'):
    FEAT[nm] = build(nm)
    FEAT[nm]['notes'] = notes_for(nm, FEAT[nm])

FEAT['comparison'] = dict(
    most_mad='ref6',
    most_mad_reason='唯一把 bII（D#5 强力和弦，9 小节，集中 138-161s）当主材料用、连续 6 小节 Ddim7（138.28-152.4s）、m2 帧数 56（三首最多）、低音 C#0.324/D0.184/D#0.133/C0.131 构成半音爬行低音。',
    most_powerful='ref4',
    most_powerful_reason='最响段 40s（106.4-146.4s，-8.5 dB，kick 4.9/bar、hat 10.1/bar）；全曲 RMS -9.3 dBFS、削波 0.14%（三首最高）、低频占比 0.337（最厚）、peak 1.29。',
    most_lonely='ref5',
    most_lonely_reason='结尾 269.3-282.4s 只剩 C5 长音（-22.1 dB）+ 8.14s 静音；121.3-137.1s 与 191.7-211.8s 两段底鼓抽空（0.5/0.6 次每小节）；开头 2.02s 空白；全曲最长 282s。',
    same_tempo_family='三首 167.0-170.0 BPM、4/4、起始空白 1.4-2.0s、结尾 4.1-8.1s 静音、全曲恒速（±0.13%）——速度不是疯狂感来源。',
)

json.dump(FEAT, open(os.path.join(HERE, '_ref7_features.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('已写 _ref7_features.json  %.1f KB' % (os.path.getsize(os.path.join(HERE, '_ref7_features.json')) / 1024))
for nm in ('ref4', 'ref5', 'ref6'):
    o = FEAT[nm]
    print('\n' + '=' * 100)
    print('%s  %.2f BPM conf %.2f  %s %s conf %.2f  %.2fs  chords %d' % (
        nm, o['bpm'], o['bpm_confidence'], o['key'], o['mode'], o['key_confidence'],
        o['duration'], len(o['chords'])))
    for s in o['sections']:
        print('  %-26s %6.2f-%6.2f (%5.1fs) E %.2f %6.1fdB den %4.2f  k%.1f s%.1f h%.1f  %s' % (
            s['name'], s['start'], s['end'], s['dur'], s['energy'], s['energy_db'],
            s['density'], s['kick_per_bar'], s['snare_per_bar'], s['hat_per_bar'],
            ' '.join('%s×%d' % (c, n) for c, n in s['chords'][:4])))
    print('  notes:', o['notes'][:200], '...')
