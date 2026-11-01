# -*- coding: utf-8 -*-
"""tools/build/_pret_engine.py —— 五首道中曲共用的「逐音搬入 + 重配器」引擎。

设计：
  * 每首曲子一个 _pretN_compose.py，里面只有 CONFIG（段落表 / 通道路由表 / 鼓型 / 场景层）
    和少量自写函数；引擎负责搬运、路由、加倍、鼓组、序列化。
  * 原曲音符一律来自 tools/build/_pret_lead/<src>_flat.json（bar/beat 已按网格校正）。
  * 通道路由表 voice[ch] = [(track, shift, vmul, dmul), ...]
      track  目标轨道名（必须在 TRACKS 里）
      shift  音高偏移（半音）
      vmul   力度系数
      dmul   时值系数
  * 段落表 SEGS = [(tag, src_b0, src_b1, new_b0, opts)]，src_b0/src_b1 为原曲小节号（含端点），
    new_b0 为新曲小节号；opts 可含 'tr'（整体移调）、'mode'（'thin'/'big'/'huge'）、'dyn'。
"""
import os, sys, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _pret_lib import Song, load_flat, pc, pcd


class Eng(object):
    def __init__(self, cfg):
        self.cfg = cfg
        self.name = cfg['name']
        self.song = Song(cfg['name'], cfg['title'], cfg['export'], cfg['keyname'],
                         cfg['bpm'], cfg['nbars'])
        self.flat = load_flat(cfg['src'], cfg['bpm'])
        self.notes = self.flat['notes']
        self.voice = cfg['voice']
        self.dyn = cfg.get('dyn', {})
        self.segs = cfg['segs']
        self.by_bar = collections.defaultdict(list)
        for n in self.notes:
            self.by_bar[n['k']].append(n)
        self.extra_fn = cfg.get('extra')
        self.lead_notes = []          # (t, m, d, v) 主旋律记录，用于加倍/装饰
        self.bar_pc = {}              # 新小节 → 出现的音级

    # ---- 基础
    def bt(self, bar, beat=0.0):
        return self.song.bt(bar, beat)

    def add(self, *a, **k):
        return self.song.add(*a, **k)

    def drum(self, *a, **k):
        return self.song.drum(*a, **k)

    def sec(self, *a, **k):
        return self.song.section(*a, **k)

    # ---- 搬入
    def copy(self, tag, src_b0, src_b1, new_b0, tr=0, dyn=None):
        """把原曲 [src_b0, src_b1] 小节搬到 new_b0 起，按通道路由表分发。"""
        if dyn is None:
            dyn = self.dyn.get(tag, 1.0)
        src_bar_n = src_b1 - src_b0 + 1
        for k in range(src_b0, src_b1 + 1):
            nb = new_b0 + (k - src_b0)
            for n in self.by_bar.get(k, ()):
                t = self.song.bt(nb, n['beat'])
                self.route(n, t, tr, dyn, nb)
        return new_b0 + src_bar_n

    DEFAULT_DRUM = {35: 0, 36: 0, 37: 1, 38: 1, 39: 1, 40: 1, 41: 6, 42: 2, 43: 6, 44: 2,
                    45: 5, 46: 3, 47: 5, 48: 6, 49: 4, 50: 6, 51: 7, 52: 4, 53: 7, 57: 4}

    def route(self, n, t, tr, dyn, nb):
        ch = n['ch']
        if ch == self.cfg.get('drum_ch', 9):
            dm = self.cfg.get('drum_map') or self.DEFAULT_DRUM
            kind = dm.get(n['m'])
            if kind is not None:
                self.song.drum(t, kind, max(1, min(127, n['v'] * dyn)))
            return
        rules = self.voice.get(ch)
        if not rules:
            return
        for track, shift, vmul, dmul in rules:
            m = n['m'] + shift + tr
            if track == 'bass':
                while m < 28:
                    m += 12
                while m > 52:
                    m -= 12
            elif track == 'sub':
                while m < 24:
                    m += 12
                while m > 45:
                    m -= 12
            v = n['v'] * vmul * dyn
            d = n['d'] * dmul
            if track == 'lead':
                self.lead_notes.append((t, m, d, v))
            self.song.add(track, t, m, d, v)
            if track in ('lead', 'brass', 'piano'):
                self.bar_pc.setdefault(nb, set()).add(pc(m))

    # ---- 主旋律加倍层
    def doubles(self, double_specs, lo_bar=1, hi_bar=10 ** 9, shift=0):
        """double_specs = [(track, shift, vmul, dmul, cap_high)]"""
        for t, m, d, v in list(self.lead_notes):
            bar = int(t / self.song.bar) + 1
            if not (lo_bar <= bar <= hi_bar):
                continue
            for track, sh, vm, dm, cap in double_specs:
                mm = m + sh + shift
                if mm > cap:
                    continue
                self.song.add(track, t, mm, d * dm, v * vm)

    # ---- 鼓
    def kick(self, bar, beat, v=110):
        self.song.drum(self.song.bt(bar, beat), 0, v)

    def snare(self, bar, beat, v=100):
        self.song.drum(self.song.bt(bar, beat), 1, v)

    def chh(self, bar, beat, v=60):
        self.song.drum(self.song.bt(bar, beat), 2, v)

    def ohh(self, bar, beat, v=60):
        self.song.drum(self.song.bt(bar, beat), 3, v)

    def crash(self, bar, beat=0.0, v=90):
        self.song.drum(self.song.bt(bar, beat), 4, v)

    def ride(self, bar, beat, v=56):
        self.song.drum(self.song.bt(bar, beat), 7, v)

    def tom(self, bar, beat, v=96, high=False):
        self.song.drum(self.song.bt(bar, beat), 6 if high else 5, v)

    def roll(self, bar, beat, span, v=60):
        self.song.drum(self.song.bt(bar, beat), 9, v, span)

    def drums_pattern(self, b0, b1, pat):
        """pat: dict with keys kick/snare/chh/ohh/ride/crash, values = list of beats。
        可传 dict(name=('4floor'|...)) 简写由各曲子自己展开。"""
        for b in range(b0, b1 + 1):
            for k in pat.get('kick', ()):
                self.kick(b, k, pat.get('kv', 112))
            for k in pat.get('snare', ()):
                self.snare(b, k, pat.get('sv', 100))
            for k in pat.get('chh', ()):
                self.chh(b, k, pat.get('hv', 56))
            for k in pat.get('ohh', ()):
                self.ohh(b, k, pat.get('ov', 58))
            for k in pat.get('ride', ()):
                self.ride(b, k, pat.get('rv', 52))

    # ---- 运行
    def run(self):
        # 先按段落表铺好逐小节拍数（3/4 段落在 pre6 的 27-42 小节），再搬音
        meters = [4] * self.song.nbars
        smet = self.flat.get('meters') or []
        for seg in self.segs:
            sb0, sb1, nb0 = seg[1], seg[2], seg[3]
            for i, k in enumerate(range(sb0, sb1 + 1)):
                nb = nb0 + i
                if 1 <= nb <= self.song.nbars and k - 1 < len(smet):
                    meters[nb - 1] = smet[k - 1]
        self.song.set_meters(meters)
        for seg in self.segs:
            tag, sb0, sb1, nb0 = seg[:4]
            opts = seg[4] if len(seg) > 4 else {}
            tr = opts.get('tr', 0)
            end = self.copy(tag, sb0, sb1, nb0, tr=tr, dyn=opts.get('dyn'))
            self.sec(tag, nb0, end - 1)
        if self.extra_fn:
            self.extra_fn(self)
        return self.song

    def write(self):
        return self.song.write()