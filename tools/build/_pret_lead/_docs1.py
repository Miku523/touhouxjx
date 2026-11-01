# -*- coding: utf-8 -*-
import io, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BT = chr(96)
K = ('pre1', 'pre2', 'pre3', 'pre4', 'pre6')
mp3 = {k: os.path.getsize(os.path.join(ROOT, 'src/assets/bgm', '%s.mp3' % k)) for k in K}
new_total = 26449683 + sum(mp3.values())
rp = os.path.join(ROOT, 'README.md')
r = io.open(rp, encoding='utf-8').read()
old = [l for l in r.split('\n') if l.startswith('| 音乐 | 19 首曲目里')]
assert len(old) == 1
line = old[0]
line2 = line.replace('10 首由 WebAudio 实时合成，九首用预渲染 MP3', '5 首由 WebAudio 实时合成，十四首用预渲染 MP3')
line2 = re.sub(r'合计 [0-9.]+ MB', '合计 %.1f MB' % (new_total / 1048576.0), line2)
ins = ('一面道中《像鬼灯一样鲜红的灵魂》' + BT + 'src/assets/bgm/pre1.mp3' + BT +
       '、二面道中《幻视之夜》' + BT + 'src/assets/bgm/pre2.mp3' + BT +
       '、三面道中《月牙精灵》' + BT + 'src/assets/bgm/pre3.mp3' + BT +
       '、四面道中《秋意渐浓之瀑》' + BT + 'src/assets/bgm/pre4.mp3' + BT +
       '、六面道中《旅人1970》' + BT + 'src/assets/bgm/pre6.mp3' + BT + '、')
a = '一面 Boss 露米娅《妖魔夜行》'
assert line2.count(a) == 1
line2 = line2.replace(a, ins + a)
r = r.replace(line, line2)
io.open(rp, 'w', encoding='utf-8', newline='\n').write(r)
print('README line ok', new_total)
