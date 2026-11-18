
import sys, json
sys.path.insert(0,'tools')
from midi2js import parse_midi, extract_channels
def load(p):
    midi=parse_midi(p); chans,segs,div=extract_channels(midi); return chans,segs,div
def dump(p,ch,t0,t1,out):
    chans,segs,div=load(p)
    ns=chans[ch]['notes']
    ns=[n for n in ns if t0<=n['t']<t1]
    ns.sort(key=lambda n:(round(n['t'],3),n['m']))
    rows=[(round(n['t'],3),n['m'],round(n['d'],3),n['v']) for n in ns]
    open(out,'w',encoding='utf-8').write(json.dumps(rows))
B='tools/build/_midi/src/'
dump(B+'13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid',0,27.0,34.0,'tools/build/_midi/_b_ch0_27_34.json')
dump(B+'13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid',0,67.0,74.0,'tools/build/_midi/_b_ch0_67_74.json')
dump(B+'13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid',0,1.0,8.0,'tools/build/_midi/_b_ch0_1_8.json')
dump(B+'13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid',3,27.0,34.0,'tools/build/_midi/_b_ch3_27_34.json')
dump(B+'13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid',5,27.0,34.0,'tools/build/_midi/_b_ch5_27_34.json')
dump(B+'11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid',0,1.0,10.0,'tools/build/_midi/_t_ch0_1_10.json')
dump(B+'11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid',0,31.0,42.0,'tools/build/_midi/_t_ch0_31_42.json')
print('ok')
