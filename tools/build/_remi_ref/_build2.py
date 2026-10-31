# -*- coding: utf-8 -*-
import sys, os, json
from collections import defaultdict, Counter
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build\_exsr_ref')
import _midilib as M

BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
MID = os.path.join(BASE, '1 - Shooter Games', '6 - The Embodiment of Scarlet Devil',
                   '13. Septette for a Dead Princess (ZUN).mid')
OUT = r'C:\Users\GuSheng\Downloads\HKS\tools\build\_remi_ref'
SHIFT = 2360
p = M.parse_file(MID); g = M.build_grid(p); ns = M.notes(p, g)
NB = 81
PCN = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']

def gbar(t): return int((t - SHIFT) // 1920) + 1
def gbeat(t): return ((t - SHIFT) % 1920) / 480.0 + 1.0
def gpos16(t): return ((t - SHIFT) % 1920) // 120
def sec_of_bar(b):
    return round(M.tick_to_sec(SHIFT + (b - 1) * 1920, g['tmap'], g['division']), 3)

# ---------- tempo ----------
tmap = g['tmap']
tempos = sorted(tmap, key=lambda x: x[0])
tb = []
for i, (tick, us) in enumerate(tempos):
    tb.append({'tick': tick, 'bpm': round(60000000.0 / us, 2), 'atBar': round((tick - SHIFT) / 1920.0, 2)})

# ---------- sections ----------
SEC = [
 ('Intro 引子（Eb 小调摇曳动机）', 1, 8, 'Eb 小调（局部 i）', 'pp->mp'),
 ('A 主题（小号主旋律登场）', 9, 16, 'Eb 小调（局部 i）', 'mp'),
 ('A\' 低音踏板 riff 段', 17, 24, 'Eb 小调 + B/C 三全音', 'mf'),
 ('B 主题复述 + 副旋律对答', 25, 32, 'Eb 小调', 'mf'),
 ('C 主题复述 + 弦乐 16 分', 33, 40, 'Eb 小调', 'f'),
 ('D 半音模进展开', 41, 48, 'D-E-F-F# 半音上行（调性游离）', 'f'),
 ('E 管风琴圣咏', 49, 64, 'Bb 小调（局部 i）', 'f'),
 ('F 高潮全奏', 65, 78, 'Bb 小调', 'ff'),
 ('Coda 终止', 79, 81, 'Bb 小调', 'ff->长延'),
]

# ---------- channels ----------
CH_ROLE = {
 0:('Acoustic Grand Piano (GM 1)','占位轨，无音符','',0),
 1:('Slap Bass 1 (GM 37)','贝斯（后半 16 分驱动）','bass',0),
 2:('Bright Acoustic Piano (GM 2)','钢琴右手 / 主题加倍','piano',0),
 3:('Trumpet (GM 57)','**主旋律**（小号）','lead',0),
 4:('String Ensemble 1 (GM 49)','弦乐内声部 / C 段 16 分','strings',0),
 5:('Acoustic Guitar nyl (GM 25)','分解和弦琶音（A-C 段）','arp',0),
 6:('Fiddle (GM 111)','副旋律（与主旋律齐奏/装饰）','cnt6',0),
 7:('Trumpet (GM 57)','第二小号副旋律','cnt7',0),
 8:('Acoustic Grand Piano (GM 1)','引子低音（左手 8 度/五度）','intro_bass',0),
 9:('GM Drum Kit','鼓组','drums',1),
 10:('Trumpet (GM 57)','主旋律 -12 八度叠层','lead8',0),
 11:('Distortion Guitar (GM 31)','失真吉他 / 低音 riff','(unused)',0),
 12:('String Ensemble 1 (GM 49)','高音弦乐（E 段起）','str_hi',0),
 13:('Bright Acoustic Piano (GM 2)','钢琴左手 / 第二钢琴','piano_l',0),
 14:('Church Organ (GM 20)','管风琴（仅 E 段 49-64）','organ',0),
 15:('Fiddle (GM 111)','占位轨，无音符','',0),
}
byb = defaultdict(list)
for n in ns: byb[gbar(n['tickOn'])].append(n)

chan_out = []
for c in range(16):
    sub = [n for n in ns if n['ch'] == c and not n['isDrum']]
    drumsub = [n for n in ns if n['ch'] == c and n['isDrum']]
    if not sub and not drumsub:
        gm, role, layer, dr = CH_ROLE[c]
        chan_out.append({'ch': c, 'gm': gm, 'role': role, 'notes': 0, 'range': None,
                         'bars': [], 'poly': 0, 'layer': layer, 'isDrum': bool(dr)})
        continue
    allsub = sub + drumsub
    bars = sorted(set(gbar(n['tickOn']) for n in allsub))
    # polyphony: peak simultaneous
    ev = []
    for n in allsub:
        ev.append((n['tickOn'], 1)); ev.append((n['tickOff'], -1))
    ev.sort(); cur = 0; peak = 0
    for _, d in ev:
        cur += d; peak = max(peak, cur)
    gm, role, layer, dr = CH_ROLE[c]
    rng = None
    if sub:
        rng = {'lo': min(n['pitch'] for n in sub), 'hi': max(n['pitch'] for n in sub),
               'loName': M.pname(min(n['pitch'] for n in sub)), 'hiName': M.pname(max(n['pitch'] for n in sub))}
    else:
        rng = {'lo': min(n['pitch'] for n in drumsub), 'hi': max(n['pitch'] for n in drumsub),
               'loName': 'drum', 'hiName': 'drum'}
    chan_out.append({'ch': c, 'gm': gm, 'role': role, 'notes': len(allsub),
                     'range': rng, 'bars': [bars[0], bars[-1]], 'barsCount': len(bars),
                     'poly': peak, 'layer': layer, 'isDrum': bool(dr)})

# ---------- chords ----------
def chroma_bar(b, wbass=2.0):
    w = [0.0] * 12
    for n in byb.get(b, []):
        if n['isDrum']: continue
        dur = min(n['durSec'], 1.4)
        wt = wbass if (n['ch'] in (1, 13) and n['pitch'] < 55) else 1.0
        w[n['pitch'] % 12] += dur * wt
    return w
QUA = {
 'maj':[0,4,7], 'min':[0,3,7], 'dim':[0,3,6], 'maj7':[0,4,7,11], 'min7':[0,3,7,10],
 '7':[0,4,7,10], 'm7b5':[0,3,6,10], 'sus4':[0,5,7],
}
TW = [1.0,0.9,0.75,0.65]
def best_chord(b):
    w = chroma_bar(b)
    tot = sum(w) or 1
    basspc = None
    bs = [n for n in byb.get(b, []) if n['ch'] == 1]
    if not bs: bs = [n for n in byb.get(b, []) if n['ch'] == 13]
    if bs: basspc = min(bs, key=lambda x: x['pitch'])['pitch'] % 12
    best = None
    for r in range(12):
        for q, iv in QUA.items():
            sc = 0.0
            for pc in range(12):
                ww = w[pc] / tot
                if pc in [(r + i) % 12 for i in iv]:
                    idx = [(r + i) % 12 for i in iv].index(pc)
                    sc += ww * TW[min(idx, 3)]
                else:
                    sc -= ww * 0.9
            if basspc is not None:
                if basspc == r: sc += 0.9
                elif basspc in [(r + i) % 12 for i in iv]: sc += 0.25
            if best is None or sc > best[0]: best = (sc, r, q)
    return best, basspc, w, tot
ROMAN = {0:'i',1:'♭II',2:'ii',3:'♭III',4:'♯III',5:'iv',6:'♭V',7:'v',8:'♭VI',9:'VI',10:'♭VII',11:'VII'}
QUA_NAME = {'maj':'', 'min':'m', 'dim':'dim', 'maj7':'maj7', 'min7':'m7', '7':'7', 'm7b5':'m7♭5', 'sus4':'sus4'}
def roman_of(r, q):
    rn = ROMAN[(r - 10) % 12]
    if q in ('min','min7','m7b5','dim'): return rn.lower() if rn.isupper() or rn[0].isupper() else rn
    return rn
chords = []
for b in range(1, NB + 1):
    (sc, r, q), basspc, w, tot = best_chord(b)
    sym = PCN[r] + QUA_NAME[q]
    conf = round(min(1.0, max(0.0, (sc + 1.0) / 1.6)), 2)
    chords.append({'bar': b, 'beat': 1, 'symbol': sym, 'root': PCN[r], 'quality': q,
                   'roman': roman_of(r, q), 'bass': M.pname(basspc) if basspc is not None else None,
                   'confidence': conf})
print('chords done; low-confidence bars:',
      [c['bar'] for c in chords if c['confidence'] < 0.45])

# ---------- melodies ----------
def mel(ch, bars, name, role):
    lo, hi = bars
    sub = [n for n in ns if n['ch'] == ch and not n['isDrum'] and lo <= gbar(n['tickOn']) <= hi]
    sub.sort(key=lambda n: (n['tickOn'], n['pitch']))
    out = []
    for n in sub:
        out.append([gbar(n['tickOn']), round(gbeat(n['tickOn']), 3), n['pitch'],
                    round((n['tickOff'] - n['tickOn']) / 480.0, 3), n['vel']])
    return {'name': name, 'ch': ch, 'role': role, 'barFrom': lo, 'barTo': hi,
            'count': len(out), 'notes': out}

motifs = {}
motifs['intro_rocking'] = mel(2, (1, 8), '引子：钢琴摇曳双音动机', 'Eb 小调的 Gb/Bb 双音摇摆 + F5-G#4 落句')
motifs['intro_lh'] = mel(13, (1, 8), '引子：左手低音五度/三全音', 'D#/A# 五度与 B/F、F/C# 三全音交替')
motifs['themeA'] = mel(3, (8, 16), '主题 A（小号主旋律，8 小节）', '全曲核心；bar16 结束在 C-Db-Eb 上行')
motifs['themeA_2nd'] = mel(3, (25, 32), '主题 A 第二遍（B 段）', '旋律同 A，配器换成弦乐+副旋律对答')
motifs['themeA_3rd'] = mel(3, (33, 40), '主题 A 第三遍（C 段）', '旋律同 A，弦乐 16 分织体加厚')
motifs['counter_fiddle'] = mel(6, (24, 32), '副旋律：Fiddle', '与主旋律同度齐奏/加花')
motifs['counter_trumpet'] = mel(7, (24, 32), '副旋律：第二小号', '六度/三度叠置长音')
motifs['lead_octave'] = mel(10, (9, 16), '主旋律 -12 八度叠层', '与 ch3 逐音相同的低八度平行')
motifs['piano_double'] = mel(2, (9, 16), '钢琴右手（主题 +12 加倍）', '钢琴 8 度叠奏主旋律')
motifs['bridge_D'] = mel(3, (41, 48), 'D 段展开旋律（半音模进）', 'D-E-F-F# 低音模进上的新旋律')
motifs['organ_E'] = mel(14, (49, 56), 'E 段管风琴圣咏（8 小节）', '管风琴 + 高音弦乐齐奏')
motifs['climax_F'] = mel(3, (65, 72), 'F 段高潮旋律（8 小节）', '主题 A 的 16 分装饰变奏')
motifs['bass_riff_Ap'] = mel(1, (17, 24), 'A\' 段贝斯 riff', 'D#3 踏板 + B/C 三全音，每拍 2 音')
motifs['bass_chrom'] = mel(1, (41, 48), 'D 段贝斯半音模进', 'D-E-F-F# 每小节一换的 8 分对偶')
motifs['arp_A'] = mel(5, (9, 16), 'A 段尼龙吉他分解', '主旋律下方的 16 分分解和弦')

# ---------- drums ----------
DRUMMAP = {36:'kick', 37:'sidestick', 38:'snare', 40:'esnare', 41:'lowtom', 42:'hh_closed',
           44:'hh_pedal', 45:'tom', 46:'hh_open', 48:'hitom', 49:'crash', 51:'ride'}
drum = {}
for (name, a, z, key, en) in SEC:
    bins = defaultdict(lambda: [0] * 16)
    tot = z - a + 1
    for b in range(a, z + 1):
        for n in byb.get(b, []):
            if not n['isDrum']: continue
            bins[DRUMMAP.get(n['pitch'], 'p%d' % n['pitch'])][gpos16(n['tickOn'])] += 1
    pat = {}
    for k, v in bins.items():
        pat[k] = {'perBar': [round(x / float(tot), 2) for x in v],
                  'sixteenths': [i for i in range(16) if v[i] * 2 >= tot]}
    drum[name] = {'barFrom': a, 'barTo': z, 'bars': tot, 'pattern': pat}

# ---------- write ----------
data = {
 'file': MID,
 'title': 'Septette for a Dead Princess (亡き王女の為のセプテット) / 献给已逝王女的七重奏 — ZUN',
 'gameKey': 'ex_mid',
 'parser': 'tools/build/_exsr_ref/_midilib.py (self-written)',
 'division': g['division'],
 'meter': '4/4',
 'bpm': {'value': 145.0, 'main': 144.0,
         'note': 'tick0=145.0 起，tick17240(bar8.25)=140.0，tick31640(bar16.25)=142.0，tick33560(bar17.25)=145.0，'
                 'tick47000(bar24.25)=124.0 做 rit.，tick47960-49081 由 125 渐回 144.0，此后 144.0 恒定至结尾。'
                 '即曲主体实为 144 BPM，只有开头与 bar24-25 的 rit./accel. 是 145/140/142。',
         'tempoMap': tb},
 'bars': NB,
 'durationSec': round(g['seconds'], 3),
 'durationSecFromLastNote': round(max(n['secOff'] for n in ns), 3),
 'loopBars': NB,
 'barDefinition': {
   'shiftTicks': SHIFT,
   'note': 'MIDI 文件全部音符 tickOn ≡ 80 (mod 120)，真实小节线 = 文件小节线 + 440 tick。'
           '本文件所有 bar/beat 均按「文件第 1 小节线 + 440」为新原点（= 生成器 shift 应取 bar_t[1]+440=2360），'
           'bar 从 1 起、beat 从小节内 1 起。原文件里第 0 小节是空引子，已被丢弃。',
   'generatorWarning': 'tools/build/_ex_arrange.py 当前 shift=bar_t[1]=1920，漏掉 440 tick，'
                       '整曲相对自身小节网格提前 0.917 拍（鼓与段首吊镲错位）。应改为 2360。'},
 'key': {'name': 'Bb 小调（全局拟合）/ 前半 Eb 小调',
         'keyMethod': 'Krumhansl-Schmuckler 12 调相关 + 音级加权直方图 + 终止和弦人耳式核对。'
                      '全曲: Bb min 0.85 (次: Db maj 0.69, Eb min 0.61)。分段落: bars1-40 Eb min 0.89 / Bb min 0.57；'
                      'bars49-81 Bb min 0.88-0.90 / Eb min 低。故：前 40 小节以 Eb 小调为中心，'
                      '41-48 半音模进过渡，49-81 落到 Bb 小调，末和弦 Bb-Db-F。',
         'evidence': ['音级加权：Bb 17% F 17% Eb 13% Db 12% Ab 11% Gb 9% C 7%', '末小节持续和弦 = Bb-Db-F (Bb 小三)',
                      '前半每小节和声骨架 = Eb / B / Eb / Db / Abm / Gb / B / Eb'],
         'caveat': '网上钢琴谱常记作 D 小调；本文件比之低 4 个半音（Dm->Bbm）。本报告音名一律按文件实际音高。'},
 'channels': chan_out,
 'sections': [],
 'motifs': motifs,
 'drumPatterns': drum,
 'arrangementNotes': [],
}
for (name, a, z, key, en) in SEC:
    data['sections'].append({
        'name': name, 'startBar': a, 'endBar': z, 'bars': z - a + 1,
        'secFrom': sec_of_bar(a), 'secTo': sec_of_bar(z + 1) if z < NB else round(g['seconds'], 3),
        'localKey': key, 'energy': en,
        'chords': [c for c in chords if a <= c['bar'] <= z],
    })
json.dump(data, open(os.path.join(OUT, 'analysis.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('wrote analysis.json', os.path.getsize(os.path.join(OUT, 'analysis.json')))
for (name, a, z, key, en) in SEC:
    print('%-34s %2d-%2d  %6.2fs' % (name, a, z, sec_of_bar(z + 1) - sec_of_bar(a)))
print('motif counts:', ', '.join('%s=%d' % (k, v['count']) for k, v in motifs.items()))
