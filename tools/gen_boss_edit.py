#!/usr/bin/env python3
"""定向改图：拿现成立绘当底，只改一处（翅膀 / 服装），其余全部保留。

用法:
  python tools/gen_boss_edit.py <key> --ref <png> --tag v2 --prompt-file <txt>
输出: _cand/<key>-<i><tag>.png（抠白底 + 内容高 640）
"""
import argparse
import base64
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_boss_action as G  # noqa: E402

ROOT = G.ROOT
CAND = G.CAND


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('key')
    ap.add_argument('--ref', default='none')
    ap.add_argument('--tag', default='')
    ap.add_argument('--n', type=int, default=1)
    ap.add_argument('--prompt-file', required=True)
    ap.add_argument('--size', default=None)
    a = ap.parse_args()

    prompt = Path(a.prompt_file).read_text(encoding='utf-8').strip()
    ref = None if a.ref == 'none' else Path(a.ref)
    if ref is not None and not ref.exists():
        raise SystemExit('missing ref ' + str(ref))
    b64 = base64.b64encode(ref.read_bytes()).decode() if ref else None
    size = a.size or G.CHAR[a.key]['size']

    last = None
    for attempt in range(6):
        try:
            payload = {
                'model': G.MODEL,
                'prompt': prompt,
                'size': size,
                'response_format': 'url',
            }
            if b64:
                payload['image'] = ['data:image/png;base64,' + b64]
            url = G.post(payload)
            CAND.mkdir(parents=True, exist_ok=True)
            idx = attempt + 1
            raw = CAND / ('%s-%d%s.jpg' % (a.key, idx, a.tag))
            import urllib.request
            urllib.request.urlretrieve(url, raw)
            out = CAND / ('%s-%d%s.png' % (a.key, idx, a.tag))
            G.finish(raw, out)
            print('CAND %s' % out.name, flush=True)
        except Exception as e:  # noqa: BLE001
            last = e
            print('ERR %s #%d: %s' % (a.key, attempt + 1, str(e)[:300]), flush=True)
    if last:
        print('FAILED', last)


if __name__ == '__main__':
    main()
