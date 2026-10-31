import sys, os, collections
sys.path.insert(0, os.path.join(os.getcwd(),'tools','build'))
sys.path.insert(0, os.path.join(os.getcwd(),'tools'))
import _ex_arrange as EX
import midi2js as M
chans, bar_t, beat_t = EX.load('13. Septette for a Dead Princess (ZUN).mid')
print('bar1 %.4f bar2 %.4f beat %.4f' % (bar_t[1], bar_t[2], bar_t[2]-bar_t[1]))
# 鼓相位：kick(36) 相对 beat（0.4138s）
beat = bar_t[2]-bar_t[1]
kicks = [n['t'] for n in chans[9]['notes'] if n['m']==36]
print('kicks', len(kicks))
def hist(vals, grid, shift=0.0):
    h = collections.Counter()
    for v in vals:
        ph = ((v - shift) / grid) % 1.0
        h[round(ph*16)/16 % 1.0] += 1
    return h.most_common(6)
print('kick 相对 bar_t[1] 相位(16分):', hist(kicks, beat/4, bar_t[1]))
print('kick 相对 bar_t[1]-440tick 相位:', hist(kicks, beat/4, bar_t[1]-440/480*beat))
# 旋律相位
mel = [n['t'] for n in chans[3]['notes']]
print('trumpet 相对 bar_t[1] 相位(8分):', hist(mel, beat/2, bar_t[1]))
print('trumpet 相对 2360 相位(8分):', hist(mel, beat/2, bar_t[1]-440/480*beat))
