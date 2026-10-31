import sys, os, collections
sys.path.insert(0, os.path.join(os.getcwd(),'tools','build'))
sys.path.insert(0, os.path.join(os.getcwd(),'tools'))
import midi2js as M
MIDI = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil\13. Septette for a Dead Princess (ZUN).mid'
m = M.parse_midi(MIDI)
ev = m['tracks'][0]['events']
kinds = collections.Counter(e[1] for e in ev)
print(kinds)
ons = [e for e in ev if e[1]=='on']
print(ons[:5])

def hist(vals, grid, shift=0, q=4):
    h = collections.Counter()
    for v in vals:
        ph = ((v - shift) % grid) / grid
        h[round(ph*q)/q % 1.0] += 1
    return h.most_common(6)

kick = sorted(set(e[0] for e in ev if e[1]=='on' and e[2]==9 and e[3]==36))
trp  = sorted(set(e[0] for e in ev if e[1]=='on' and e[2]==3))
print('kick n', len(kick), 'trumpet n', len(trp))
print('kick phase mod 480:', hist(kick, 480))
print('kick phase mod 1920:', hist(kick, 1920, q=8))
print('trumpet phase mod 480:', hist(trp, 480))
print('trumpet phase mod 1920:', hist(trp, 1920, q=8))
print('all onsets phase mod 480:', hist([e[0] for e in var] if False else [e[0] for e in ev if e[1]=='on'], 480))
