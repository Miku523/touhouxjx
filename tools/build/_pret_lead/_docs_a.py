# -*- coding: utf-8 -*-
"""tools/build/_pret_lead/_docs.py —— 五首道中曲的文档与版本更新"""
import io, os, re, json
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BT = chr(96)
K = ('pre1', 'pre2', 'pre3', 'pre4', 'pre6')
INFO = {
 'pre1': dict(mp3='pre1.mp3', stereo='pre1_stereo.wav', tag='STAGE 1 道中（夜樱小径编）'),
 'pre2': dict(mp3='pre2.mp3', stereo='pre2_stereo.wav', tag='STAGE 2 道中（萤火夜雾编）'),
 'pre3': dict(mp3='pre3.mp3', stereo='pre3_stereo.wav', tag='STAGE 3 道中（冰蓝晨曦编）'),
 'pre4': dict(mp3='pre4.mp3', stereo='pre4_stereo.wav', tag='STAGE 4 道中（瀑布溪谷编）'),
 'pre6': dict(mp3='pre6.mp3', stereo='pre6_stereo.wav', tag='STAGE 6 道中（月都航路编）'),
}
mp3size = {k: os.path.getsize(os.path.join(ROOT, 'src/assets/bgm', INFO[k]['mp3'])) for k in K}
wavsize = {k: os.path.getsize(os.path.join(ROOT, 'tools/build/_pret_kit', INFO[k]['stereo'])) for k in K}
new_mp3_total = 26449683 + sum(mp3size.values())
new_master_total = 163830486 + sum(wavsize.values())

rp = os.path.join(ROOT, 'README.md')
r = io.open(rp, encoding='utf-8').read()
old_line = [l for l in r.split('\n') if l.startswith('| 音乐 | 19 首曲目里')]
assert len(old_line) == 1
line = old_line[0]
mb = new_mp3_total / 1048576.0
line2 = line.replace('10 首由 WebAudio 实时合成，九首用预渲染 MP3', '5 首由 WebAudio 实时合成，十四首用预渲染 MP3')
line2 = re.sub(r'合计 [0-9.]+ MB', '合计 %.1f MB' % mb, line2)
insert = ('一面道中《像鬼灯一样鲜红的灵魂》' + BT + 'src/assets/bgm/pre1.mp3' + BT +
          '、二面道中《幻视之夜》' + BT + 'src/assets/bgm/pre2.mp3' + BT +
          '、三面道中《月牙精灵》' + BT + 'src/assets/bgm/pre3.mp3' + BT +
          '、四面道中《秋意渐浓之瀑》' + BT + 'src/assets/bgm/pre4.mp3' + BT +
          '、六面道中《旅人1970》' + BT + 'src/assets/bgm/pre6.mp3' + BT + '、')
anchor = '一面 Boss 露米娅《妖魔夜行》'
assert line2.count(anchor) == 1
line2 = line2.replace(anchor, insert + anchor)
r = r.replace(line, line2)
lines = r.split('\n')
idx = [i for i, l in enumerate(lines) if l.startswith('  - 六面 Boss《竹取飞翔（月之公主编）》')]
assert len(idx) == 1
io.open(os.path.join(ROOT, 'tools/build/_pret_lead/_readme_head.txt'), 'w', encoding='utf-8').write(str(idx[0]))
io.open(os.path.join(ROOT, 'tools/build/_pret_lead/_readme_new.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print('README staged', round(mb, 2), new_mp3_total, new_master_total)
