# -*- coding: utf-8 -*-
"""tools/build/_pret_lib.py -- 五首道中曲（pre1/pre2/pre3/pre4/pre6）重配器共用脚手架。

每首曲子一个 _pretN_compose.py：
  1) from _pret_lib import Song, load_flat
  2) Song(...) 设定 BPM / 标题 / 导出名 / 小节总数
  3) voice(n) 把原曲 midi_flat.json 的每个音路由到新轨道（逐音搬入）
  4) 自写 intro / break / coda，把「场景」加进去
  5) s.write() 输出 src/engine/songs/<id>.js 与 tools/build/_pret_lead/<name>/{song.json,secs.json}
"""
import os, json, collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEAD = os.path.join(ROOT, 'tools', 'build', '_pret_lead')

DRUM_NAMES = {0: 'kick', 1: 'snare', 2: 'chh', 3: 'ohh', 4: 'crash',
              5: 'tomL', 6: 'tomH', 7: 'ride', 8: 'revcrash', 9: 'roll'}


def load_flat(name, bpm):
    """读取 tools/build/_pret_ref/<name>/midi_flat.json（含正确拍号与网格校正），
    按目标 bpm 重算 t，并给出逐小节拍数 meters。"""
    path = os.path.join(ROOT, 'tools', 'build', '_pret_ref', name, 'midi_flat.json')
    d = json.load(open(path, encoding='utf-8'))
    beat = 60.0 / bpm
    src_bpm = d['bpm']
    ratio = (60.0 / src_bpm) / beat
    last_bar = max(n['bar'] for n in d['notes'])
    # 逐小节拍数：优先用 analysis.json 的 timeSigEvents（按 tick 换拍号），否则按音高兜底
    meters = None
    apath = os.path.join(ROOT, 'tools', 'build', '_pret_ref', name, 'analysis.json')
    if os.path.exists(apath):
        a = json.load(open(apath, encoding='utf-8'))
        ev = a.get('timeSigEvents') or []
        div = a.get('division') or 480
        if ev:
            ev = sorted([(int(e[0]), int(e[1]), int(e[2])) for e in ev])
            meters = []
            tick = 0
            idx = 0
            cur = ev[0][1]
            while len(meters) < last_bar:
                while idx + 1 < len(ev) and tick >= ev[idx + 1][0]:
                    idx += 1
                    cur = ev[idx][1]
                meters.append(cur)
                tick += cur * div
    if not meters:
        maxb = {}
        for n in d['notes']:
            maxb[n['bar']] = max(maxb.get(n['bar'], 0.0), n['beat'])
        meters = [3 if maxb.get(b, 4.0) < 2.95 else 4 for b in range(1, last_bar + 1)]
    starts = []
    acc = 0.0
    for m in meters:
        starts.append(acc)
        acc += m
    out = []
    for n in d['notes']:
        k = n['bar']
        t = (starts[k - 1] + n['beat']) * beat
        dd = n['d'] * ratio
        out.append({'ch': n['ch'], 'k': k, 'beat': n['beat'],
                    't': round(t, 4), 'm': n['m'], 'v': n['v'], 'd': round(dd, 4)})
    out.sort(key=lambda n: (n['t'], n['m']))
    return {'bpm': bpm, 'beat': beat, 'notes': out, 'meters': meters,
            'src_bpm': src_bpm, 'last_bar': last_bar}


class Song(object):
    def __init__(self, name, title, export, keyname, bpm, nbars):
        self.name = name
        self.title = title
        self.export = export
        self.keyname = keyname
        self.bpm = float(bpm)
        self.beat = 60.0 / self.bpm
        self.bar = 4 * self.beat
        self.nbars = int(nbars)
        self.meters = [4] * self.nbars
        self.starts = []
        self._recalc()
        self.meters_in = None
        self.BY = {}
        self.DRUMS = []
        self.SECS = []
        self.track_defs = []

    def _recalc(self):
        acc = 0.0
        self.starts = []
        for m in self.meters:
            self.starts.append(acc)
            acc += m
        self.dur = round(acc * self.beat, 3)

    def set_meters(self, meters):
        m = list(meters)
        while len(m) < self.nbars:
            m.append(4)
        self.meters = m[:self.nbars]
        self._recalc()

    def bar_len(self, bar):
        return self.meters[max(0, min(self.nbars - 1, bar - 1))] * self.beat

    # ---- geometry
    def bt(self, bar, beat=0.0):
        return self.starts[max(0, min(self.nbars - 1, bar - 1))] * self.beat + beat * self.beat

    def pb(self, t):
        """秒 → (bar, beat)，便于把原曲时间点转成新小节位置。"""
        x = t / self.bar
        bar = int(x) + 1
        return bar, (t - (bar - 1) * self.bar) / self.beat

    # ---- events
    def add(self, name, t, m, d, v=100):
        if t < 0 or t >= self.dur - 0.02 or not (0 <= m <= 127):
            return
        d = min(max(0.03, d), self.dur - t - 0.004, 2 * self.bar)
        if d <= 0.02:
            return
        if name == 'sub' and m < 28:
            m += 12
        self.BY.setdefault(name, []).append(
            [round(t, 3), int(round(m)), round(d, 3), int(max(1, min(127, round(v))))])

    def drum(self, t, kind, vel, span=None):
        if t < 0 or t >= self.dur:
            return
        if span is None:
            self.DRUMS.append([round(t, 3), int(kind), int(max(1, min(127, round(vel))))])
        else:
            self.DRUMS.append([round(t, 3), int(kind), int(max(1, min(127, round(vel)))), round(span, 3)])

    def section(self, name, b0, b1):
        self.SECS.append([name, round(self.bt(b0), 3), round(self.bt(b1) + self.bar_len(b1), 3)])

    def defs(self, tracks):
        self.track_defs = list(tracks)

    # ---- output
    def write(self):
        out_tracks = []
        for name, wave, gain in self.track_defs:
            ns = sorted(self.BY.get(name, []))
            if ns:
                out_tracks.append({'name': name, 'wave': wave, 'gain': float(gain), 'notes': ns})
        song = {'title': self.title, 'duration': self.dur, 'bpm': self.bpm,
                'tracks': out_tracks, 'drums': sorted(self.DRUMS)}
        os.makedirs(LEAD, exist_ok=True)
        js = ('// 由 tools/build/_pret%s_compose.py 生成，勿手改。\n' % self.name[-1])
        js += 'export const %s = {\n  %s: ' % (self.export, self.keyname)
        js += json.dumps(song, ensure_ascii=False, separators=(',', ':')) + ',\n};\n'
        outjs = os.path.join(ROOT, 'src', 'engine', 'songs', self.name + '.js')
        open(outjs, 'w', encoding='utf-8', newline='\n').write(js)
        json.dump(song, open(os.path.join(LEAD, self.name + '_song.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False)
        self.SECS.sort(key=lambda x: x[1])
        json.dump({'secs': self.SECS, '_dur': self.dur},
                  open(os.path.join(LEAD, self.name + '_secs.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False)
        nn = sum(len(t['notes']) for t in out_tracks)
        print('[%s] tracks %d notes %d drums %d dur %.3f bars %d -> %s'
              % (self.name, len(out_tracks), nn, len(song['drums']), self.dur, self.nbars, outjs))
        for t in out_tracks:
            ns = t['notes']
            print('   %-8s %-9s %.3f n=%-5d %d-%d' % (t['name'], t['wave'], t['gain'],
                                                      len(ns), min(x[1] for x in ns), max(x[1] for x in ns)))
        print('   secs', self.SECS)
        return song


# ---- 音乐工具
def pc(m):
    return m % 12


def pcd(a, b):
    d = abs(pc(a) - pc(b))
    return min(d, 12 - d)


def chord_notes(notes, bar):
    """某小节出现的音级集合（用于踏板/和声层）。"""
    return sorted(set(n['m'] for n in notes if n['k'] == bar))


def key_votes(notes, lo, hi):
    c = collections.Counter()
    for n in notes:
        if lo <= n['k'] <= hi:
            c[pc(n['m'])] += 1
    return c.most_common(7)