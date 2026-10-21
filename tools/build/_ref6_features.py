# -*- coding: utf-8 -*-
"""_ref6_features.py —— 汇总生成机器可读版 _ref6_features.json
输入：_ref6_sections.json、_ref6_raw.json、_ref6_melody_pc.json、_ref6_game_pc.json
"""
import os
import sys
import json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
JP = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

LABELS = {
    'ref1': ['前奏A(无鼓)', '前奏B(进鼓)', 'A主题', 'B段', 'C副歌', 'D中段(B小调)',
             '过渡T', "A'主题", "B'段", "C'副歌", "D'中段", "T'过渡", "A''收尾", '尾奏'],
    'ref3': ['前奏', '钩子主题', '主题发展', '发展', '主段(drop)', '变奏(半速鼓)',
             '冲击段', '主段2', '上升', '间奏', '重建', '最终副歌', '尾奏'],
    'ref5': ['前奏(无高频)', '前奏2', 'A主题', 'B段', 'C副歌', 'D中段(B小调)',
             '过渡T', "A'主题", "B'段", "C'副歌", "D'扩展", '尾奏'],
}

FORM = {
    'ref1': '前奏8+8 -> A20 -> B16 -> C24 -> D24(B小调) -> T8 || A20 -> B16 -> C24 -> D20 -> T8 || A12 -> 尾1',
    'ref3': '前奏8 -> 钩子8 -> 发展20+12 -> drop20 -> 变奏20(半速鼓) -> 冲击8 -> 主段16 -> 上升8 -> 间奏12 -> 重建8 -> 最终副歌44 -> 尾5',
    'ref5': '前奏12+8 -> A16 -> B16 -> C24 -> D24(B小调) -> T8 || A20 -> B16 -> C24 -> D32 -> 尾7',
}

BPM = {'ref1': (152.0, 'high', 0.26), 'ref3': (155.9, 'medium-high', 0.357), 'ref5': (152.0, 'high', 0.299)}
BPM_CAND = {
    'ref1': [152.0, 103.36, 76.0, 61.52, 123.05, 56.17],
    'ref3': [155.9, 77.96, 152.0, 103.36, 186.7],
    'ref5': [152.0, 99.38, 61.52, 76.0, 198.77],
}

KS = {
    'ref1': [['Fmin', 0.744], ['Bbmaj', 0.601], ['Fmaj', 0.577], ['Bbmin', 0.459]],
    'ref3': [['Bbmaj', 0.704], ['Bbmin', 0.684], ['Fmin', 0.649], ['Ebmaj', 0.634]],
    'ref5': [['Fmin', 0.643], ['Fmaj', 0.533], ['Bbmaj', 0.513], ['Bbmin', 0.409]],
}
GAME_SHIFT_R = {'ref1': 0.898, 'ref3': 0.887, 'ref5': 0.844}

TECH = {
    'ref1': [
        {'name': '三全音调性对置', 'where': '120.0-157.9s (24 小节)', 'how': '主调 F 小调整段切 B 小调：和声 G->Bm7->F#m->D，旋律只用 B/F#/A；157.9s 用 Bbm->Db 两小节滑回',
         'recipe': '该段单独写 B 小调音级 notes；主旋律 square gain 0.22，和声 triangle gain 0.14；鼓型不变只换音高'},
        {'name': '8bit 二音摆动副歌', 'where': '82.1-120.0s', 'how': '32 个半小节里 30 个是 F 或 Bb；和声 bVII-Ab 交替，无导音无终止式',
         'recipe': 'square gain 0.20，八分断奏 dur 0.18-0.25，F4/Bb4 交替 8 小节，每 4 小节末插 Ab4 长音 0.9s；和声 triangle 长音 Eb-Ab 两小节一换'},
        {'name': '三层递进前奏', 'where': '0 -> 12.6 -> 25.3s', 'how': '前 8 小节只有和声搏动+八分闭镲；12.6s 进底鼓(16分格 1/7/13)；25.3s 进满鼓，2-8k 从 8% 跳到 38%',
         'recipe': 'drums 按段拼接：前 8 小节只 kind=2 vel0.5 + 每 4 小节 kind=4；第 9 小节加 kind=0 vel0.8；第 17 小节加 kind=1'},
        {'name': '句尾落五度', 'where': '贯穿全曲', 'how': '每 4 小节乐句最后一格落 F(主音 5 度)或 Ab(b3)，不落主音八度',
         'recipe': '生成旋律时强制把每 4 小节第 8 格置为 F4 或 Ab4，dur 0.8s'},
    ],
    'ref3': [
        {'name': '反拍切分底鼓', 'where': '12.3-24.6s、73.9-104.7s', 'how': '底鼓落在每拍第 2 个十六分(16分格 2/6/10/14)；最终副歌 215.5s 改回正拍四踩 1/5/9/13 做落地',
         'recipe': 'kick 的 t = beat 起点 + (60/bpm)*0.25，一小节 4 个；段落切换时改回 beat 起点'},
        {'name': '半速鼓段', 'where': '104.7-135.5s (20 小节)', 'how': '军鼓只在 1、3 拍(X.x. X... X.x. X...)，底鼓仍密，闭镲减到八分 -> half-time；旋律保持原速',
         'recipe': 'snare 只放 beat1/beat3；hat 从十六分改八分；主旋律不动'},
        {'name': '军鼓四踩冲击', 'where': '135.5-147.8s (8 小节)', 'how': '军鼓每拍一击(16分格 1/5/9/13)，全曲 rms 最高 -8.9dB',
         'recipe': 'snare 每拍 vel0.95 + kick 四踩 + closed hat 十六分 vel0.4'},
        {'name': 'bII(Gb) 和声色彩', 'where': '全曲', 'how': '根音出现最多的是 Gb(37/188 窗)，与 Ebm 组成 Gb-Ebm 循环，比原曲更暗',
         'recipe': 'F 小调里把 Fm 换成 Gb(Gb Bb Db) 2 小节，立刻变黑'},
    ],
    'ref5': [
        {'name': '同一编曲两种混音', 'where': '全曲', 'how': '与 ref1 同速同调同段(56.8s 后段边界逐段重合)，低频 21% vs 9%，质心低约 700Hz',
         'recipe': '同一份 notes 只改 gain 与鼓 vel：kick vel 1.0 / snare vel 0.7 -> 重而闷'},
        {'name': '无高频前奏', 'where': '0-18.9s (12 小节)', 'how': '500-2k 占 69%，>8k=0%，<120 只 10%',
         'recipe': '前奏不放 kind=2/3，只 triangle 长音 + 稀疏 kick；第 13 小节一次性放进全部镲'},
        {'name': '同旋律换和声', 'where': '31.6-56.8s', 'how': 'A 段和声不是 ref1 的 Db-Cm-Ab-Fm，而是 Cm-Ab-Eb-Ab，旋律不动',
         'recipe': '只改和声层 midi，主旋律轨不动'},
    ],
}

INST = {
    'ref1': {'bands_pct': [9, 16, 44, 28, 3], 'lead_band': '690-1400Hz', 'pad': True, 'arp': False,
             'note': '游戏机+摇滚；2-8k 靠持续噪声型打击乐(A段 38%)；<120 只有 9%，底鼓不重靠军鼓/镲推'},
    'ref3': {'bands_pct': [45, 21, 13, 17, 4], 'lead_band': '500-1200Hz', 'pad': True, 'arp': True,
             'note': '电子，贝斯+底鼓主导，中频凹陷；模仿厚度要靠 triangle/sawtooth 在 100-200Hz 加倍'},
    'ref5': {'bands_pct': [21, 21, 41, 13, 1], 'lead_band': '690-1400Hz', 'pad': True, 'arp': False,
             'note': '母带压过的摇滚版；前奏 500-2k 69%、>8k=0%，闷'},
}

RECIPE = {
    'bpm': 152, 'bpm_fast': 156, 'duration_suggest': [168, 176],
    'key': 'F minor', 'scale': ['F', 'G', 'Ab', 'Bb', 'C', 'Db', 'Eb'],
    'melody_pc_weights': {'F': 0.27, 'Bb': 0.15, 'Eb': 0.11, 'Ab': 0.10, 'C': 0.07,
                          'Db': 0.05, 'G': 0.05, 'B': 0.04, 'F#': 0.03, 'A': 0.03,
                          'D': 0.03, 'E': 0.02},
    'bar_s': 1.5789,
    'drums_16grid': {'kick': [1, 5, 9, 13], 'snare': [5, 13], 'closed_hat': [1, 3, 5, 7, 9, 11, 13, 15],
                     'open_hat': [15, 16], 'crash': '每 8 小节第 1 拍'},
    'waves': {'lead': ['square', 0.22], 'counter': ['triangle', 0.14],
              'pad': ['sawtooth', 0.07], 'bass': ['triangle', 0.18]},
    'form_152bpm': [
        {'t': [0.0, 12.6], 'label': '前奏A', 'note': '只有和声搏动 + 闭镲'},
        {'t': [12.6, 25.3], 'label': '前奏B', 'note': '加底鼓 1/2&/4 拍'},
        {'t': [25.3, 56.8], 'label': 'A 主题', 'note': '满鼓，主旋律进；F<->Bb 交替 + A/G 装饰'},
        {'t': [56.8, 82.1], 'label': 'B 段', 'note': '长音铺底变厚、镲减半、主旋律下移'},
        {'t': [82.1, 120.0], 'label': 'C 副歌', 'note': 'bVII-bIII 二音摆动，最强'},
        {'t': [120.0, 141.7], 'label': 'D 中段', 'note': '切 B 小调(三全音)，纯 pad + 旋律'},
        {'t': [141.7, 155.0], 'label': '过渡', 'note': 'Bbm-Db 两小节滑回 F 小调'},
        {'t': [155.0, 176.0], 'label': "A' 收尾", 'note': '抬 2 度，结束在 F'},
    ],
}


def main():
    sec = json.load(open(os.path.join(HERE, '_ref6_sections.json'), encoding='utf-8'))
    raw = json.load(open(os.path.join(HERE, '_ref6_raw.json'), encoding='utf-8'))
    mel = json.load(open(os.path.join(HERE, '_ref6_melody_pc.json'), encoding='utf-8'))
    out = {'meta': {
        'title': '竹取飛翔 ~ Lunatic Princess 三版参考录音编曲蓝图',
        'sources': {'ref1': 'ZUN 原曲 331.2s', 'ref3': 'Silver Forest / Lunatic Beat 292.3s',
                    'ref5': 'ZUN 原曲另一版 327.4s'},
        'excluded': ['ref2 (幽閉サテライト 千花繚亂)', 'ref4 (Silver Forest つるぺったん)'],
        'method': 'mono 22050Hz; chroma_pass 8192/1024; 旋律音级=600-2100Hz 谱峰时长加权; 和声=160-650Hz 中值谱; 鼓=hop128 log-mel 通量',
        'tuning_cents': {'ref1': 2, 'ref3': -21, 'ref5': 4},
        'scripts': ['_ref6_lib.py', '_ref6_analyze.py', '_ref6_seg.py', '_ref6_probe_bpm3.py',
                    '_ref6_probe_key3.py', '_ref6_probe_peaks.py', '_ref6_probe_final.py', '_ref6_digest.py'],
        'caveats': ['和弦品质不可全信(低音5次谐波=大三度)；根音可信',
                    'ref1/ref5 底鼓网格饱和，定量鼓型以 ref3 为准',
                    '旋律格=每半小节 500Hz 以上最强势音级+中位音区，非转谱',
                    '_ref6_lib.refine_bpm 不可用(152->154)'],
    }, 'songs': {}}

    for tag in ('ref1', 'ref3', 'ref5'):
        s = sec[tag]
        labels = LABELS[tag]
        secs = []
        for i, x in enumerate(s['sections']):
            k = i if i < len(labels) else i
            top4 = []
            hist = {}
            for c in x.get('chords', []):
                hist[c['guess']] = hist.get(c['guess'], 0) + 1
            top4 = [{'chord': a, 'count': b} for a, b in sorted(hist.items(), key=lambda kv: -kv[1])[:4]]
            secs.append({
                'idx': x['idx'], 'label': labels[k] if k < len(labels) else 'sec%d' % x['idx'],
                'bar': [x['bar0'], x['bar1']], 't': [x['t0'], x['t1']], 'bars': x['bars'],
                'rms_db': x['rms_db'], 'centroid': x['centroid'],
                'bands_pct': [round(v * 100, 1) for v in x['bands']],
                'energy_lv': x['energy_lv'],
                'chords_2bar': [{'t': c['t'], 'guess': c['guess'], 'roman': c['roman'], 'top4_pc': c['top']}
                                for c in x.get('chords', [])],
                'chord_top4': top4,
                'drums_16': {d: {'val': x.get(d + '_val'), 'ratio': x.get(d + '_ratio'), 'accent': x.get(d + '_on')}
                             for d in ('kick', 'snare', 'hat')},
                'melody_cells': x.get('melody', []),
                'melody_motif': ''.join('%s%s' % (c['name'], c['reg'][0]) for c in x.get('melody', [])[:32]),
            })
        bpm, conf, acf = BPM[tag]
        out['songs'][tag] = {
            'bpm': bpm, 'bpm_confidence': conf, 'bpm_acf_peak': acf, 'bpm_candidates': BPM_CAND[tag],
            'bar_s': s['bar'], 'nbars': s['nbars'], 'duration': s['dur'],
            'tuning_cents': raw[tag].get('tuning_cents', 0.0),
            'key': {'tonic': 'F', 'mode': 'minor', 'scale': ['F', 'G', 'Ab', 'Bb', 'C', 'Db', 'Eb'],
                    'melody_pc': {JP[i]: mel[tag][i] for i in range(12)},
                    'melody_top6': sorted([(JP[i], mel[tag][i]) for i in range(12)], key=lambda x: -x[1])[:6],
                    'ks': KS[tag], 'same_key_as_game_midi_r_at_shift0': GAME_SHIFT_R[tag],
                    'no_transpose_needed': True},
            'form': FORM[tag],
            'sections': secs,
            'instrumentation': INST[tag],
            'techniques': TECH[tag],
        }
    out['arrangement_recipe'] = RECIPE
    p = os.path.join(HERE, '_ref6_features.json')
    json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('->', p, os.path.getsize(p), 'bytes')
    for t in out['songs']:
        print(t, 'sections', len(out['songs'][t]['sections']),
              'buttons', [s['label'] for s in out['songs'][t]['sections']])


main()
