# -*- coding: utf-8 -*-
import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BT = chr(96)
K = ('pre1', 'pre2', 'pre3', 'pre4', 'pre6')
TAG = {'pre1': 'STAGE 1 道中（夜樱小径编）', 'pre2': 'STAGE 2 道中（萤火夜雾编）',
       'pre3': 'STAGE 3 道中（冰蓝晨曦编）', 'pre4': 'STAGE 4 道中（瀑布溪谷编）',
       'pre6': 'STAGE 6 道中（月都航路编）'}
mp3 = {k: os.path.getsize(os.path.join(ROOT, 'src/assets/bgm', '%s.mp3' % k)) for k in K}
wav = {k: os.path.getsize(os.path.join(ROOT, 'tools/build/_pret_kit', '%s_stereo.wav' % k)) for k in K}
new_mp3 = 26449683 + sum(mp3.values())
new_master = 163830486 + sum(wav.values())
p = os.path.join(ROOT, 'docs/NETWORK_CN.md')
t = io.open(p, encoding='utf-8').read()
t = t.replace('### 3.2 预渲染 BGM 转 MP3（9 首）', '### 3.2 预渲染 BGM 转 MP3（14 首）')
anchor = '| 合计 | | 21,571,206 B'
assert t.count(anchor) == 1
rows = ['| ~BT~%s~BT~ | %s | —（母版 %s B 不入库） | **%s B** |' % (
    k, TAG[k], '{:,}'.format(wav[k]), '{:,}'.format(mp3[k])) for k in K]
t = t.replace(anchor, '\n'.join(rows) + '\n' + anchor)
ob = BT.join(['remilia_septette', 'youma_stage1', 'wriggle_stage2', 'cirno_stage3', 'aya_stage4'])
ob = BT + 'remilia_septette' + BT + '、' + BT + 'youma_stage1' + BT + '、' + BT + 'wriggle_stage2' + BT + '、' + BT + 'cirno_stage3' + BT + '、' + BT + 'aya_stage4' + BT + ' 与 ' + BT + 'kaguya_stage6' + BT
old_head = ob + ' 的母版是 44.1 kHz 立体声'
new_head = (BT + 'remilia_septette' + BT + '、' + BT + 'youma_stage1' + BT + '、' + BT + 'wriggle_stage2' + BT + '、' +
            BT + 'cirno_stage3' + BT + '、' + BT + 'aya_stage4' + BT + '、' + BT + 'kaguya_stage6' + BT + ' 与五首道中曲的母版是 44.1 kHz 立体声')
assert t.count(old_head) == 1, t.count(old_head)
t = t.replace(old_head, new_head)
old_total = '| 合计 | | 21,571,206 B（三首入库母版） | **26,449,683 B**（九首母版合计 163,830,486 B，MP3 占 16.1%，省 83.9%） |'
assert t.count(old_total) == 1
new_total = '| 合计 | | 21,571,206 B（三首入库母版） | **%s B**（十四首母版合计 %s B，MP3 占 %.1f%%，省 %.1f%%） |' % (
    '{:,}'.format(new_mp3), '{:,}'.format(new_master),
    100.0 * new_mp3 / new_master, 100.0 - 100.0 * new_mp3 / new_master)
t = t.replace(old_total, new_total)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t.replace('~BT~', BT))
print('NETWORK ok', new_mp3, new_master)
