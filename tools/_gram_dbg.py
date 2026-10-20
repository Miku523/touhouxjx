# -*- coding: utf-8 -*-
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import preboss_rewrite as R, midi2js as M
midi = M.parse_midi(R.MID); chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); bar = 4*60.0/bpm; bars = int(round((R.T1-R.T0)/bar))
orig = R.melody_onsets(chans)
oseq = [n['m'] for n in orig]
ograms = {tuple(oseq[i:i+4]) for i in range(len(oseq)-3)}
lead = R.render_melody(bpm, bars)
nseq = [n['m'] for n in lead]
for i in range(len(nseq)-3):
    g = tuple(nseq[i:i+4])
    if g in ograms:
        # 找出原曲中的位置
        pos = [j for j in range(len(oseq)-3) if tuple(oseq[j:j+4]) == g]
        print('重合', g, '新曲位置', i, '音高', nseq[max(0,i-2):i+6], '原曲位置', pos[:3])
        print('   新曲时间 %.2fs 小节 %d' % (lead[i]['t'], int(lead[i]['t']/bar)+1))
