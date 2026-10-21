# -*- coding: utf-8 -*-
"""_ref5_json.py —— 生成 tools/build/_ref5_features.json（报告的数字版）。
段落边界/和弦是人工判读结果（依据 _ref5_raw.json 的 8 小节表），
鼓/能量/频段等数字直接取自 _ref5_raw.json。"""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, '_ref5_raw.json'), encoding='utf-8'))
DR = json.load(open(os.path.join(HERE, '_ref5_drums.json'), encoding='utf-8'))

SEC = {
 'refA': [('intro+A1', 0, 31, ['Fm (i)', 'Db (VI)', 'Eb (VII)', 'Cm (v)']),
          ('A2', 32, 79, ['Fm (i)', 'Db (VI)', 'Eb (VII)', 'Cm (v)']),
          ('B_A-major', 80, 111, ['A (I)', 'F#m (vi)', 'D (IV)', 'E (V)']),
          ('A3', 112, 159, ['Fm (i)', 'Ab (III)', 'Eb (VII)', 'Db (VI)']),
          ('breakdown', 160, 167, ['Fm (i)', 'Ab (III)']),
          ('D', 168, 183, ['Ab (III)', 'Eb (VII)', 'Fm (i)', 'Db (VI)']),
          ('quiet-break', 184, 191, ['Gb (bII)', 'Ab (III)', 'Fm (i)']),
          ('E', 192, 230, ['Ab (III)', 'Eb (VII)', 'Cm (v)', 'Db (VI)']),
          ('outro', 231, 238, ['Ab (III)', 'Eb (VII)', 'Fm (i)'])],
 'refB': [('intro', 0, 15, ['Bb (iv)', 'Fm (i)']),
          ('A1', 16, 55, ['Fm (i)', 'C (V)', 'Ab (III)', 'Bb (iv)']),
          ('A2', 56, 103, ['Fm (i)', 'C (V)', 'Ab (III)', 'Bb (iv)']),
          ('A3', 104, 135, ['Fm (i)', 'C (V)', 'Ab (III)', 'Bb (iv)']),
          ('outro', 136, 142, ['Fm (i)', 'Bb (iv)'])],
 'refD': [('intro+A', 0, 79, ['Fm (i)', 'Db (VI)', 'Eb (VII)', 'Cm (v)']),
          ('B_A-major', 80, 111, ['A (I)', 'F#m (vi)', 'D (IV)', 'E (V)']),
          ('A2', 112, 183, ['Fm (i)', 'Ab (III)', 'Eb (VII)', 'Db (VI)']),
          ('breakdown', 184, 199, ['Ab (III)', 'A', 'C#']),
          ('E', 200, 215, ['Ab (III)', 'Eb (VII)', 'Fm (i)', 'C (V)']),
          ('outro', 216, 230, ['Fm (i)', 'Db (VI)', 'Eb (VII)'])],
 'refE': [('intro', 0, 15, ['Fm (i)', 'Ab (III)', 'Eb (VII)']),
          ('A', 16, 45, ['Fm (i)', 'Ab (III)', 'Eb (VII)', 'Db (VI)']),
          ('B', 46, 79, ['Fm (i)', 'Ab (III)', 'Cm (v)', 'Db (VI)']),
          ('chorus', 80, 95, ['Ab (III)', 'Fm (i)', 'Db (VI)', 'Eb (VII)']),
          ('climax_A-major', 96, 111, ['A (I)', 'F#m (vi)', 'D (IV)', 'E (V)']),
          ('tail', 112, 127, ['Fm (i)', 'C (V)', 'Db (VI)', 'Eb (VII)']),
          ('outro', 128, 131, ['Fm (i)', 'Ab (III)'])],
 'refF': [('intro', 0, 15, ['Fm (i)', 'Ab (III)']),
          ('A1', 16, 71, ['Fm (i)', 'Ab (III)', 'Eb (VII)', 'Db (VI)']),
          ('A2', 72, 103, ['Fm (i)', 'Ab (III)', 'Db (VI)', 'Eb (VII)']),
          ('B', 104, 143, ['Fm (i)', 'Db (VI)', 'Eb (VII)', 'Cm (v)']),
          ('C', 144, 167, ['Ab (III)', 'Db (VI)', 'Fm (i)']),
          ('interlude', 168, 183, ['Ab (III)', 'Db (VI)']),
          ('climax_Ab', 184, 199, ['Ab (III)', 'Db (VI)', 'Fm (i)', 'Eb (VII)']),
          ('A-major-tail', 200, 207, ['A (I)', 'F#m (vi)', 'E (V)', 'C#']),
          ('outro', 208, 214, ['F#m (vi)', 'C#', 'A (I)'])],
}

FEAT = {
 'refA': ['16 分连续跑动 + 每拍第 1 拍重音（154.5BPM 下 16 分=97ms）',
          'B 段整体上移大三度 Fm→A 大调域，亮度 cen 794→1496',
          '「抽空」过门：286.8-299.2s lo .57→.01、降 7.4dB，只留中高频 8 小节后砸回'],
 'refB': ['反拍 kick 的「半速错觉」：140BPM 配 dnb 式切分 kick（16 分格 2/6/9/11/14 位）',
          'i-V-III-iv 古典循环，不转调靠和声功能推进',
          '极简 loop：三遍 A 逐块重复，只在镲与装饰音加花'],
 'refD': ['1、4 拍双重重音底鼓（拍能量 9.3/8.7/8.2/9.7），持续前推',
          'B 段低频撤空 lo .13 + mh .61，5 首里最彻底的悬空处理',
          '峰值段用 Ab 域收束，制造未落地的余韵'],
 'refE': ['170BPM + 四踩 + 拍尾 16 分重镲（0.75 拍位最重），快门连拍感',
          'i-III-VII-VI 四和弦循环（Fm-Ab-Eb-Db），每和弦 4 小节，适合 Boss loop',
          '高潮段 +4 半音转 A 大调（136.6-159.2s，-1.4dB 峰值）'],
 'refF': ['抽掉低频（lo .04 vs 其他 .37-.50）的高空感',
          '中频 arp 铺满（md .51）替代低频推进',
          '高潮用 III 级当临时主音（302.5-341.8s，-0.9dB）'],
}

out = {}
for nm, d in D.items():
    bars = d['bars']
    off = d['beat_offset']; bar = d['bar_sec']
    dens = float(np.mean([b['density'] for b in bars]))
    bands = dict(low=round(float(np.mean([b['low'] for b in bars])), 3),
                 mid=round(float(np.mean([b['mid'] for b in bars])), 3),
                 midhigh=round(float(np.mean([b['midh'] for b in bars])), 3),
                 high=round(float(np.mean([b['high'] for b in bars])), 3),
                 centroid=round(float(np.mean([b['cen'] for b in bars])), 0))
    sections = []
    for label, b0, b1, chords in SEC[nm]:
        blk = bars[b0:b1 + 1]
        if not blk:
            continue
        sections.append(dict(
            name=label, bars=[b0, b1], n_bars=b1 - b0 + 1,
            start=round(blk[0]['t0'], 2), end=round(blk[-1]['t1'], 2),
            energy_dB=round(float(20 * np.log10(np.mean([b['rms'] for b in blk]) + 1e-9)
                                  - 20 * np.log10(max(b['rms'] for b in bars) + 1e-9)), 1),
            chords=chords))
    dr = DR[nm]
    out[nm] = dict(
        dur=d['dur'], bpm=d['bpm'], bpm_conf=d['bpm_conf'],
        bpm_candidates=d['bpm_cands'], bpm_candidates_drum=d['bpm_cands_drum'],
        meter='4/4', bar_sec=bar, beat_offset=off,
        key=dict(tonic='F', mode='aeolian/natural minor',
                 signature_accidentals=4, scale=['F', 'G', 'Ab', 'Bb', 'C', 'Db', 'Eb'],
                 ks_best=[dict(score=round(r, 3), tonic=n, mode=m) for r, n, m, _ in d['key'][:3]]),
        sections=sections,
        chords_family=['i', 'III', 'VII', 'VI', 'v'],
        drums=dict(
            four_on_floor=d['four_on_floor'],
            kick_per_bar=dr['kick']['per_bar'], snare_per_bar=dr['snare']['per_bar'],
            hat_per_bar=dr['hat']['per_bar'],
            kick_beats=dr['kick']['beat_hist'], snare_beats=dr['snare']['beat_hist'],
            kick_16th=dr['kick']['hist16'], snare_16th=dr['snare']['hist16'],
            hat_16th=dr['hat']['hist16'],
            hat_16th_density=dr.get('hat16_density'),
            long_hat_ratio=dr.get('open_hat')),
        melody=d['melody'],
        onset_per_sec=round(dens, 2),
        bands=bands,
        aya_features=FEAT[nm],
        notes=dict(
            refA='ZUN 文花帖长版；B 段 125-175s 转 A 大调域；286.8-299.2s 静默过门',
            refB='loop 版；kick 反拍（非四踩，four_on_floor .75）；最暗 cen 691',
            refD='与 refA 同源同速 154.5；B 段低频撤到 lo .13；1/4 拍双重重音',
            refE='最快 170BPM；拍尾 16 分重镲；高潮转 A 大调',
            refF='低频抽空 lo .04、中频 .51；BPM 置信仅 .40（146.5/150.75/142.25 打平）'
        )[nm])

    # 一致性提醒：段落首尾相接检查
    for a, b in zip(sections, sections[1:]):
        if b['bars'][0] != a['bars'][1] + 1:
            print('!! %s 段落 %s-%s 不连续' % (nm, a['name'], b['name']))

JSON = os.path.join(HERE, '_ref5_features.json')
json.dump(out, open(JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('已写', JSON)
for nm, v in out.items():
    print(nm, v['bpm'], v['key']['tonic'], v['key']['mode'], '段落', len(v['sections']),
          '末段结束', v['sections'][-1]['end'], '/', v['dur'])
