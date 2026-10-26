#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""汇总 _verify_bosscards.mjs 多次跑（--lockPower 固定挡位）的逐卡耗时，给出中位占比与建议血量倍率。
用法: python tools/_agg_lv3.py _pt/l3_s12345 _pt/l3_s202 _pt/l3_s303 [--target 0.75]
输出: 逐卡 CSV + 按卡型号汇总的 median ratio & 建议 hp
"""
import json, sys, os, statistics

def load(d):
    p = os.path.join(d, 'bosscards_summary.json')
    return json.load(open(p, encoding='utf-8'))

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    target = 0.75
    for a in sys.argv[1:]:
        if a.startswith('--target'):
            target = float(a.split('=')[1]) if '=' in a else target
    dirs = args
    runs = [load(d) for d in dirs]
    # key: (stage, boss, index)
    agg = {}
    order = []
    for r in runs:
        for c in r.get('cards', []):
            k = (c.get('stage'), c.get('boss'), c.get('index'))
            if k not in agg:
                agg[k] = {'stage': c.get('stage'), 'boss': c.get('boss'), 'index': c.get('index'),
                          'name': c.get('name'), 'limit': c.get('limit'), 'mode': c.get('mode'),
                          'hp': c.get('spellMaxHp'), 'el': [], 'ratios': [], 'dps': [], 'ok': []}
                order.append(k)
            a = agg[k]
            if c.get('elapsed') is not None:
                a['el'].append(c.get('elapsed'))
                a['ratios'].append(c.get('ratio'))
            if c.get('measuredDps') is not None:
                a['dps'].append(c.get('measuredDps'))
            a['ok'].append(c.get('ok'))
            if c.get('spellMaxHp'):
                a['hp'] = c.get('spellMaxHp')
            if c.get('limit'):
                a['limit'] = c.get('limit')
    out = []
    for k in order:
        a = agg[k]
        med = statistics.median(a['ratios']) if a['ratios'] else None
        print('%-3s %-9s #%-2s %-28s limit=%-4s mode=%-8s hp=%-6s ratios=%s med=%s' % (
            a['stage'], a['boss'], (a['index'] or 0) + 1, a['name'], a['limit'], a['mode'], a['hp'],
            ','.join('%.3f' % x for x in a['ratios']), ('%.3f' % med) if med is not None else '-'))
        if med:
            newhp = round(a['hp'] * target / med) if a['hp'] else None
            out.append((a['stage'], a['boss'], (a['index'] or 0) + 1, a['name'], a['limit'], a['mode'], a['hp'], med, newhp,
                        round(a['hp'] / (a['limit'] * med), 2) if a['hp'] else None))
    print()
    print('--- 建议（target=%.3f）: new_hp = round(old_hp * target / medRatio)；measuredDps_lv3 = old_hp/(limit*med) ---' % target)
    for row in out:
        print('%s %s #%s %s | limit=%s | mode=%s | hp %s -> %s | med=%.3f | lv3dps=%s' % (
            row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[8], row[7], row[9]))
    return 0

if __name__ == '__main__':
    sys.exit(main())
