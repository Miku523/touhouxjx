# -*- coding: utf-8 -*-
"""把两首琪露诺原曲 MIDI 展平成 {bar,beat,ch,midi,durBeats,vel,tOrig} 的 JSON。
- girl：offset 440 tick（已复核），div 480，主体 148 BPM
- adventure：offset 0，div 480，恒定 155 BPM
输出 tools/build/_cirno_lead/{girl_flat.json, adventure_flat.json}
"""
import os, sys, json, collections
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
FILES = {
  'girl': (os.path.join(BASE, '6 - The Embodiment of Scarlet Devil', '5. Tomboyish Girl in Love (ZUN).mid'), 440, 148.0),
  'adventure': (os.path.join(BASE, '9 - Phantasmagoria of Flower View', '7. Adventure of the Lovestruck Tomboy (ZUN).mid'), 0, 155.0),
}
OUT = os.path.join(ROOT, 'tools', 'build', '_cirno_lead')
os.makedirs(OUT, exist_ok=True)
for name, (MIDI, OFF, BPM) in FILES.items():
    mid = M.parse_midi(MIDI)
    div = mid['division'] or 480
    segs = M.build_tempo_map(mid['tracks'], div)
    # 收集 raw note on/off（track, tick, ch, midi, vel）
    ons, offs = [], {}
    for ti, tr in enumerate(mid['tracks']):
        for ev in tr['events']:
            k = ev[1]
            if k == 'on' and ev[4] > 0:
                ons.append((ev[0], ev[2], ev[3], ev[4], ti))
            elif k in ('on', 'off'):
                # off 用 (ch, midi) 配对队列
                pass
    # midi2js 的 note 已有配对好的 d，用它即可
    chans, _, _ = M.extract_channels(mid)
    notes = []
    # 用 raw events 精确取 tick：按 (ch,midi) 顺序配对
    raw = collections.defaultdict(list)
    for t, ch, m, v, ti in sorted(ons):
        raw[(ch, m)].append(t)
    # 与 extract_channels 的 notes 一一对应（同 ch/m 顺序）
    used = collections.Counter()
    for ch, c in chans.items():
        for n in c['notes']:
            key = (ch, n['m'])
            i = used[key]; used[key] += 1
            lst = raw.get(key) or []
            tk = lst[i] if i < len(lst) else int(round(n['t'] * 148.0 / 60.0 * div))
            b = (tk - OFF) // 1920 + 1
            bt = ((tk - OFF) % 1920) / 480.0
            notes.append(dict(ch=ch, bar=int(b), beat=round(bt, 4), m=int(n['m']),
                              db=round(n['d'] / (60.0 / BPM), 4), v=int(n['v']), tick=int(tk)))
    notes.sort(key=lambda z: (z['bar'], z['beat'], z['ch'], z['m']))
    bpm0 = 60e6 / segs[0][2]
    data = dict(bpm=BPM, bpm0=bpm0, div=div, off=OFF,
                tempo=[[s[0], round(60e6 / s[2], 3)] for s in segs],
                notes=notes)
    json.dump(data, open(os.path.join(OUT, name + '_flat.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(name, 'notes', len(notes), 'bar range', notes[0]['bar'], notes[-1]['bar'],
          'beat range', min(n['beat'] for n in notes), max(n['beat'] for n in notes))
    # 每通道每小节音数摘要（前若干）
    per = collections.defaultdict(lambda: collections.Counter())
    for n in notes:
        per[n['ch']][n['bar']] += 1
    for ch in sorted(per):
        bars = sorted(per[ch])
        print('  ch%-2d bars %s..%s n=%d' % (ch, bars[0], bars[-1], sum(per[ch].values())))
print('done')
