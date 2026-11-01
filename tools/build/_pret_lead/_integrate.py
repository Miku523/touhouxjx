# -*- coding: utf-8 -*-
"""tools/build/_pret_lead/_integrate.py —— 五首道中曲接入 musicTracks + i18n 三包"""
import io, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(ROOT, 'tools/build/_pret_lead'))
import _notes as N

BLOCKS = json.load(io.open(os.path.join(ROOT, 'tools/build/_pret_lead/_old_blocks.json'), encoding='utf-8'))
OLD = json.load(io.open(os.path.join(ROOT, 'tools/build/_pret_lead/_old_keys.json'), encoding='utf-8'))
KEYS = ('pre1', 'pre2', 'pre3', 'pre4', 'pre6')
SUFFIX = {'pre1': '（夜樱小径编）', 'pre2': '（萤火夜雾编）', 'pre3': '（冰蓝晨曦编）',
          'pre4': '（瀑布溪谷编）', 'pre6': '（月都航路编）'}
SUFFIX_EN = {'pre1': ' (Night Cherry Path Mix)', 'pre2': ' (Firefly Mist Mix)',
             'pre3': ' (Ice Dawn Mix)', 'pre4': ' (Waterfall Ravine Mix)',
             'pre6': ' (Lunar Capital Route Mix)'}
SUFFIX_JA = {'pre1': '（夜桜小径編）', 'pre2': '（蛍火夜霧編）', 'pre3': '（氷青暁編）',
             'pre4': '（瀑布渓谷編）', 'pre6': '（月都航路編）'}

def js_note(text):
    parts = text.split('\n')
    out = []
    for i, p in enumerate(parts):
        p = p.replace('\\', '\\\\').replace("'", "\\'")
        tail = "\\n' +" if i < len(parts) - 1 else "',"
        out.append("      '" + p + tail)
    return '\n'.join(out)

p = os.path.join(ROOT, 'src/game/musicTracks.js')
s = io.open(p, encoding='utf-8').read()
for k in KEYS:
    i = s.index("key: '%s'" % k)
    j = s.index('\n  },', i)
    lines = s[i:j].split('\n')
    out = []
    skipping = False
    for ln in lines:
        st = ln.strip()
        if st.startswith('title:'):
            out.append("    title: '%s'," % N.TITLES[k]); continue
        if st.startswith('orig:'):
            out.append("    orig: '%s'," % N.ORIGS[k]); continue
        if st.startswith('time:'):
            out.append("    time: %s," % N.TIMES[k]); continue
        if st.startswith('note:'):
            out.append('    note:')
            out.append(js_note(N.NOTES['zh'][k]))
            skipping = True
            continue
        if skipping:
            if st.startswith("'") and st.endswith("',"):
                skipping = False
            continue
        out.append(ln)
    s = s[:i] + '\n'.join(out) + s[j:]
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('musicTracks: 5 blocks rewritten')

try:
    from opencc import OpenCC
    cc = OpenCC('s2twp')
except Exception:
    cc = None

def parse_line(ln):
    t = ln.strip()
    if not t.startswith('"'):
        return None, None
    pos = t.find('": ')
    if pos < 0:
        return None, None
    try:
        key = json.loads(t[:pos + 1])
    except Exception:
        return None, None
    return key, t[pos + 3:].rstrip(',')

for pack in ('en', 'ja', 'zh-hant'):
    pp = os.path.join(ROOT, 'src/i18n/packs/%s.js' % pack)
    t = io.open(pp, encoding='utf-8').read()
    lines = t.split('\n')
    kept, caps = [], {}
    removed = 0
    for ln in lines:
        key, val = parse_line(ln)
        hit = None
        if key is not None:
            for k in KEYS:
                o = OLD[k]
                if key == o['title']:
                    hit = (k, 'title')
                elif key == o['orig']:
                    hit = (k, 'orig')
                elif key.startswith(o['first'][:24]):
                    hit = (k, 'note')
                if hit:
                    break
        if hit:
            caps[(hit[0], hit[1])] = val
            removed += 1
            continue
        kept.append(ln)
    t = '\n'.join(kept)
    assert '};' in t[-8:], t[-60:]
    idx = t.rindex('};')
    add = []
    for k in KEYS:
        if pack == 'zh-hant':
            title_val = (cc.convert(N.TITLES[k]) if cc else N.TITLES[k])
            orig_val = (cc.convert(N.ORIGS[k]) if cc else N.ORIGS[k])
            note_val = (cc.convert(N.NOTES['zh'][k]) if cc else N.NOTES['zh'][k])
        elif pack == 'en':
            title_val = caps.get((k, 'title'), N.TITLES[k]) + SUFFIX_EN[k]
            ov = caps.get((k, 'orig'))
            orig_val = (ov.replace('"', '\\"').rstrip('"') + ' (note-for-note re-orchestration)') if ov else N.ORIGS[k]
            note_val = N.NOTES['en'][k].rstrip()
        else:
            title_val = caps.get((k, 'title'), N.TITLES[k]) + SUFFIX_JA[k]
            ov = caps.get((k, 'orig'))
            orig_val = (ov.replace('"', '\\"').rstrip('"') + '（一音ずつ移入・再編曲）') if ov else N.ORIGS[k]
            note_val = N.NOTES['ja'][k].rstrip()
        add.append('  ' + json.dumps(N.TITLES[k], ensure_ascii=False) + ': ' + json.dumps(title_val, ensure_ascii=False) + ',')
        add.append('  ' + json.dumps(N.ORIGS[k], ensure_ascii=False) + ': ' + json.dumps(orig_val, ensure_ascii=False) + ',')
        add.append('  ' + json.dumps(N.NOTES['zh'][k], ensure_ascii=False) + ': ' + json.dumps(note_val, ensure_ascii=False) + ',')
    t = t[:idx] + '\n'.join(add) + '\n' + t[idx:]
    io.open(pp, 'w', encoding='utf-8', newline='\n').write(t)
    print(pack, 'removed', removed, 'inserted', len(add), 'caps', len(caps))
print('DONE')
