
# -*- coding: utf-8 -*-
import json, sys
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
d = json.load(open(ROOT + '/tools/build/_aya2_ref/analysis.json', encoding='utf-8'))
k = d['kanade']
out = []
out.append('KEY %s (%s)  %s  bars %s  dur %.2f' % (k['key'], k['keyRoot'], k['timeSig'], k['musicalBars'], k['durationSec']))
out.append('STRUCTURE: ' + json.dumps(k['structure'], ensure_ascii=False))
out.append('SECTIONS:')
for s in k['sections']:
    ch = ' '.join('%d:%s' % (c['bar'], c['symbol']) for c in s['chords'][:8])
    out.append('  %-28s bars %3d-%3d  %.2f-%.2f  chords %s' % (s['name'], s['startBar'], s['endBar'], s['secFrom'], s['secTo'], ch))
out.append('ANSWERS: ' + json.dumps(d['answers'], ensure_ascii=False))
out.append('ARRANGE: ' + json.dumps(k['arrangementNotes'], ensure_ascii=False))
out.append('CHANNELS:')
for c in k['channels']:
    out.append('  ch%-2d %-16s n=%4d %s-%s bars %d-%d poly %.2f' % (c['ch'], c['gm'], c['notes'], c['loName'], c['hiName'], c['barFrom'], c['barTo'], c['avgPoly']))
out.append('HOOKS:')
for name, h in k['hooks'].items():
    out.append('  %s: %d notes, head %s' % (name, len(h), json.dumps(h[:6], ensure_ascii=False)))
out.append('DRUM PATTERNS:')
for name, p in k['drumPatterns'].items():
    out.append('  %s: %s' % (name, json.dumps(p, ensure_ascii=False)[:600]))
sys.stdout.write('\n'.join(out))
