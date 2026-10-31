import sys, os, collections
sys.path.insert(0, os.path.join(os.getcwd(),'tools','build'))
sys.path.insert(0, os.path.join(os.getcwd(),'tools'))
import midi2js as M
MIDI = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil\13. Septette for a Dead Princess (ZUN).mid'
m = M.parse_midi(MIDI)
ev = m['tracks'][0]['events']
ons = [e for e in ev if e[1]=='on']
def hist(vals, mod, bins):
    h = collections.Counter(v % mod for v in vals)
    return [(k, v) for k, v in h.most_common(bins)]
print('onset mod 480:', hist([e[0] for e in ons], 480, 6))
print('kick  mod 480:', hist([e[0] for e in ons if e[2]==9 and e[3]==36], 480, 6))
print('hat42 mod 480:', hist([e[0] for e in ons if e[2]==9 and e[3]==42], 480, 6))
print('trumpet mod 480:', hist([e[0] for e in ons if e[2]==3], 480, 6))
print('onset mod 1920:', hist([e[0] for e in ons], 1920, 8))
print('kick  mod 1920:', hist([e[0] for e in ons if e[2]==9 and e[3]==36], 1920, 8))
first = min(e[0] for e in ons)
print('first onset', first, 'mod1920', first%1920, 'mod480', first%480)
