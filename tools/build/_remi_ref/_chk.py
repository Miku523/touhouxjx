
import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '_exsr_ref'))
d = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'analysis.json'), encoding='utf-8'))
ta = d['motifs']['themeA']['notes']
sec = [n for n in d['sections'][1]['melody'] if n[0] <= 16]
ta9 = [n for n in ta if n[0] >= 9]
print('crosscheck','themeA(bars9-16)', len(ta9), 'vs sectionA', len(sec), 'MATCH', ta9 == sec)
print('themeA bars8-16 first3', ta[:3])
print('secA first3', sec[:3])
