
import sys, os
sys.path.insert(0, os.path.join(os.getcwd(), 'tools'))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '12. The Young Descendant of Tepes (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
import inspect
print('segs', segs[:6])
# build tick->sec
def sec_of_tick(tick):
    prev_t, prev_s = 0, 0.0
    for (tk, s, uspq) in segs:
        if tk <= tick:
            prev_t, prev_s, p = tk, s, uspq
        else:
            break
    return prev_s + (tick - prev_t) * p / 1e6 / div
bars = [round(sec_of_tick(k*4*div),3) for k in range(0,20)]
print('bars(sec):', bars)
ch12 = sorted(chans[12]['notes'], key=lambda n:n['t'])
print('ch12 first 12:', [(round(n['t'],3), n['m'], round(n['d'],2)) for n in ch12[:12]])
ch9 = sorted(chans[9]['notes'], key=lambda n:n['t'])
print('ch9 first 10:', [(round(n['t'],3), n['m']) for n in ch9[:10]])
