#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/midi_to_eurobeat.py —— 从 ZUN 原曲 MIDI 取一段，做成 EUROBEAT 骨架曲。

用于 2 面道中《幻視の夜 ～ Ghostly Eyes》的改编：
蓝本是酷狗那条 4:29 的匿名投稿（实测 ≈143 BPM、电子舞曲编制）。

流程：取原曲第 18–49 小节（32 小节主旋律段）→ 前 8 小节再后移一遍拼到
第 33–40 小节当回环尾声 → 统一改成 143 BPM 的 EUROBEAT 骨架
（四踩底鼓 / 反拍开镲 / 锯齿八分贝斯 / 反拍三音 stab）。

用法：
    python tools/midi_to_eurobeat.py --check
    python tools/midi_to_eurobeat.py
"""
import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
import eurobeatize as E

MID = os.path.join(M.SRC_BASE, '8 - Imperishable Night',
                   '2. Illusionary Night ~ Ghostly Eyes (ZUN).mid')
OUT_JS = os.path.join(ROOT, 'src', 'engine', 'songs', 'eurobeat_pre2.js')
EXPORT = 'PRE2_EURO'

SPEC = dict(
    key='pre2',
    title='幻視の夜 ～ Ghostly Eyes',
    start_bar=18,     # 第 18 小节起是主旋律段
    src_bars=32,      # 32 小节素材
    tail_bars=8,      # 前 8 小节再走一遍当回环尾声
    target_bpm=157.0,   # 与 2 面 Boss《蠢々秋月 EUROBEAT》统一速度（蓝本 A-One ≈157）
    lead_ch=3,        # 这段的主旋律通道（ch3 钢琴）
    bass_ch=4,        # 贝斯
    harm_chs=[1],     # 铺底和声
)


def crop_shift(chans_notes, t0, t1, extra=0.0):
    out = []
    for n in chans_notes:
        if t0 <= n['t'] < t1:
            out.append([round(n['t'] - t0, 3), int(n['m']), round(n['d'], 3), int(n['v'])])
    out.sort(key=lambda r: (r[0], r[1]))
    return out


def main():
    check_only = '--check' in sys.argv
    midi = M.parse_midi(MID)
    chans, segs, div = M.extract_channels(midi)
    bpm = M.bpm_of(segs)
    bar = 4 * 60.0 / bpm
    t0 = (SPEC['start_bar'] - 1) * bar
    t1 = t0 + SPEC['src_bars'] * bar
    print('原曲 %s BPM，小节 %.4fs；取第 %d–%d 小节（%.2f–%.2fs）'
          % (bpm, bar, SPEC['start_bar'], SPEC['start_bar'] + SPEC['src_bars'] - 1, t0, t1))

    lead_src = chans.get(SPEC['lead_ch'], {}).get('notes', [])
    lead_mono = M.to_monophonic(M.mono_ize([n for n in lead_src if t0 <= n['t'] < t1], keep='high'))
    lead = crop_shift(lead_mono, t0, t1)
    bass = crop_shift(M.mono_ize(chans.get(SPEC['bass_ch'], {}).get('notes', []), keep='low'), t0, t1)
    harm = []
    for ch in SPEC['harm_chs']:
        harm.extend(crop_shift(M.cap_poly(chans.get(ch, {}).get('notes', []), 2), t0, t1))
    harm.sort(key=lambda r: (r[0], r[1]))
    print('素材：lead %d / bass %d / harm %d' % (len(lead), len(bass), len(harm)))

    # 回环尾声：把窗口前 tail_bars 小节原样后移 src_bars 小节
    shift = SPEC['src_bars'] * bar
    cut = SPEC['tail_bars'] * bar
    def extend(rows):
        extra = [[round(r[0] + shift, 3), r[1], r[2], r[3]] for r in rows if r[0] < cut]
        return sorted(rows + extra, key=lambda r: (r[0], r[1]))
    lead, bass, harm = extend(lead), extend(bass), extend(harm)

    song = dict(bpm=bpm, duration=(SPEC['src_bars'] + SPEC['tail_bars']) * bar,
                tracks=[dict(notes=lead), dict(notes=bass), dict(notes=harm)])
    bars = SPEC['src_bars'] + SPEC['tail_bars']
    data = E.eurobeatize(song, SPEC['target_bpm'], bars)
    data['key'] = SPEC['key']
    data['title'] = SPEC['title'] + '（EUROBEAT 道中）'
    print('输出：%d 小节 / %.3fs / bpm %s / lead %d / bass %d / stab %d / drums %d'
          % (bars, data['duration'], data['bpm'], len(data['tracks'][0]['notes']),
             len(data['tracks'][1]['notes']), len(data['tracks'][2]['notes']), len(data['drums'])))
    if check_only:
        return

    body = M.render_song_js(data, data['reasons'])
    head = """/**
 * EUROBEAT 重排曲 —— 由 tools/midi_to_eurobeat.py 生成，勿手改。
 *
 * pre2 = 2 面道中《幻視の夜 ～ Ghostly Eyes》EUROBEAT 版。
 * 速度与 2 面 Boss《蠢々秋月 EUROBEAT》统一为 157 BPM（蓝本 A-One《月夜の泣き蟲》
 * 实测 ≈157）；音色走向参考酷狗 4:29 的匿名投稿（电子舞曲编制、高频擦片密）。
 * 原曲素材取 ZUN 版 MIDI 第 18–49 小节主旋律段，前 8 小节再走一遍做回环尾声。
 */
"""
    out = head + 'export const %s = {\n' % EXPORT + body + ',\n};\n'

    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('写入 %s：%.1f KB' % (OUT_JS, len(out.encode('utf-8')) / 1024.0))


if __name__ == '__main__':
    main()
