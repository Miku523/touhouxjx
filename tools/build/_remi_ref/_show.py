# -*- coding: utf-8 -*-
import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='ascii', errors='replace')
d = json.load(open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_remi_ref\analysis.json', encoding='utf-8'))
def A(s): return str(s).replace('\u266d','b').replace('\u266f','#')
for s in d['sections']:
    print('SEC %2d-%2d %-40s' % (s['startBar'], s['endBar'], s['name']))
    print('   ', ' '.join('%d:%s/%s' % (c['bar'], A(c['symbol']), A(c['roman'])) for c in s['chords']))
print()
print('channels:')
for c in d['channels']:
    if c['notes']:
        print(' ch%-2d %-34s %5d %-10s bars %s poly %d layer %s' % (c['ch'], A(c['gm']), c['notes'], c['range']['loName']+'-'+c['range']['hiName'], c['bars'], c['poly'], c['layer']))
print()
print('tempo:', [(t['atBar'], t['bpm']) for t in d['bpm']['tempoMap']])
