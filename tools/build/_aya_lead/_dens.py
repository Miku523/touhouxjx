
import json, collections
ROOT = r'C:/Users/GuSheng/Downloads/HKS'
notes = json.load(open(ROOT + '/tools/build/_aya_lead/midi_flat.json', encoding='utf-8'))['notes']
dr = [n for n in notes if n['ch'] == 9]
print('原曲每小节鼓击数（file bar 85-112）：')
print(' '.join('%d:%d' % (b, sum(1 for d in dr if d['bar'] == b)) for b in range(85, 113)))
print()
print('原曲每小节 ch0 音数（file bar 85-112）：')
c0 = [n for n in notes if n['ch'] == 0]
print(' '.join('%d:%d' % (b, sum(1 for d in c0 if d['bar'] == b)) for b in range(85, 113)))
print()
print('riff 段（45-53）每通道音数：')
for ch in (0,1,2,6,10,11):
    print(' ch%2d %s' % (ch, ' '.join('%d' % sum(1 for n in notes if n['ch']==ch and n['bar']==b) for b in range(45,54))))
