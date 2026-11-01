
import os, sys, collections
import mido
sys_stdout_reconf = __import__('sys').stdout.reconfigure(encoding='utf-8', errors='replace')
BASE = r"C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games"
SONGS = [
 ('pre1', r"6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid"),
 ('pre2', r"8 - Imperishable Night\2. Illusionary Night ~ Ghostly Eyes (ZUN).mid"),
 ('pre3', r"6 - The Embodiment of Scarlet Devil\4. Lunate Elf (ZUN).mid"),
 ('pre4', r"10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Hisaraito).mid"),
 ('pre6', r"8 - Imperishable Night\16. Voyage 1970 (ZUN).mid"),
]
for name, rel in SONGS:
    p = os.path.join(BASE, rel)
    try:
        mf = mido.MidiFile(p)
    except Exception as e:
        print(name, 'FAIL', e); continue
    print('='*24, name, '| type', mf.type, '| tpb', mf.ticks_per_beat, '| len(s)', round(mf.length,3), '| tracks', len(mf.tracks))
    tempos = []
    tss = []
    keys = []
    names = []
    for ti, tr in enumerate(mf.tracks):
        for msg in tr:
            if msg.type == 'set_tempo': tempos.append((msg.time, msg.tempo))  # careful: absolute needed
            elif msg.type == 'time_signature': tss.append((ti, msg.numerator, msg.denominator))
            elif msg.type == 'key_signature': keys.append((ti, msg.key))
            elif msg.type == 'track_name': names.append((ti, msg.name))
    print('  track names:', names[:20])
    print('  time sigs:', tss[:10])
    print('  keys:', keys[:5])
    # absolute ticks
    tpb = mf.ticks_per_beat
    abs_ev = []
    for ti, tr in enumerate(mf.tracks):
        tick = 0
        for msg in tr:
            tick += msg.time
            abs_ev.append((tick, ti, msg))
    tp = sorted([(t, e.tempo) for (t, ti, e) in abs_ev if e.type == 'set_tempo'])
    ded = {}
    for t, u in tp: ded[t] = u
    tpl = sorted(ded.items())
    print('  tempo count', len(tpl), 'first', [(t, round(60e6/u,2)) for t, u in tpl[:8]])
    if len(tpl) > 8: print('   last', [(t, round(60e6/u,2)) for t, u in tpl[-4:]])
    # channels
    chans = collections.defaultdict(lambda: {'n':0,'progs':set(),'lo':999,'hi':0,'first':10**9,'last':0})
    mod480 = collections.Counter(); mod1920 = collections.Counter()
    for tick, ti, e in abs_ev:
        if e.type == 'note_on' and e.velocity > 0:
            c = chans[e.channel]; c['n'] += 1
            c['lo'] = min(c['lo'], e.note); c['hi'] = max(c['hi'], e.note)
            c['first'] = min(c['first'], tick); c['last'] = max(c['last'], tick)
            mod480[tick % 480] += 1; mod1920[tick % 1920] += 1
        elif e.type == 'program_change':
            chans[e.channel]['progs'].add(e.program)
    for ch in sorted(chans):
        c = chans[ch]
        print('   ch%2d n=%5d prog=%s range=%d-%d first=%d last=%d' % (ch, c['n'], sorted(c['progs']), c['lo'], c['hi'], c['first'], c['last']))
    print('  tick%480 top:', mod480.most_common(6))
    print('  tick%1920 top:', mod1920.most_common(6))