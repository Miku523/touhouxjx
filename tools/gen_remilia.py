#!/usr/bin/env python3
"""雷米莉亚·斯卡雷特 对话立绘（正作形象）。

用法:
  python tools/gen_remilia.py              # 生成 2 张候选到 _cand/remilia-portrait-*.png
  python tools/gen_remilia.py --n 3
  python tools/gen_remilia.py --pick 1     # 把候选 1 装进 src/art/gen/remilia.png
  python tools/gen_remilia.py --pick 1 --refused   # 同上，但只安装不删候选

输出: _cand/remilia-portrait-<i>.jpg / .png，安装后 src/art/gen/remilia.png（透明、内容高 560）
"""
import argparse
import base64
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))

from PIL import Image  # noqa: E402
import gen_boss_action as gba  # noqa: E402

CAND = ROOT / '_cand'
OUT = ROOT / 'src' / 'art' / 'gen' / 'remilia.png'

# 对话立绘统一风格（与 gen_char_poses 一致：柔和、少阴影、正面站姿）
STYLE = ('retro doujin game art, chibi anime girl, 2.5 heads tall, thick hand-drawn black outlines, '
         'flat cel shading, soft pastel colors, pure white background, full body, front view, '
         'no text, no watermark, no shadow, no ground')

OUTFIT = (
    'pale lavender-blue (light indigo) hair in a soft chin-length bob with two long strands '
    'framing her face and reaching her chest, a red ribbon bow tied on the left side of her head, '
    'crimson red eyes with thin vertical slit pupils, a calm composed aristocratic little smile '
    'with one small fang, '
    'a pink pinafore dress with white puffy short sleeves, white frilled collar and a white frilled '
    'apron front, a red ribbon at the breast, a short puffy skirt with white frilled hem, '
    'white socks and red shoes, '
    'large bat wings with purple-blue leathery membrane and visible finger bones folded behind her back'
)

POSE = ('standing upright facing the viewer, both feet together and flat, arms relaxed and hanging '
        'at her sides, chin slightly raised with a proud composed look, bat wings partly spread '
        'behind her back')

VIBE = ('the eternal scarlet child, vampire aristocrat of the Scarlet Devil Mansion, '
        'proud and elegant but still a child, not scary, a little spoiled')

PROMPT = (
    'Draw a single character, full body, centered, nothing cropped by the image border.\n'
    'CHARACTER: Remilia Scarlet from Touhou Project, faithfully matching her original game design.\n'
    'OUTFIT: %s.\n'
    'POSE: %s.\n'
    'MOOD: %s.\n'
    'STYLE: %s'
) % (OUTFIT, POSE, VIBE, STYLE)


def one(i: int):
    t0 = time.time()
    payload = {
        'model': gba.MODEL,
        'prompt': PROMPT,
        'size': '1024x1536',
        'response_format': 'url',
    }
    url = gba.post(payload)
    CAND.mkdir(parents=True, exist_ok=True)
    raw = CAND / ('remilia-portrait-%d.jpg' % i)
    import urllib.request
    urllib.request.urlretrieve(url, raw)
    im = gba.whiten(Image.open(raw))
    bbox = im.getbbox()
    if not bbox:
        raise SystemExit('empty cutout')
    im = im.crop(bbox)
    s = 560 / float(im.size[1])
    im = im.resize((max(1, int(round(im.size[0] * s))), 560), Image.LANCZOS)
    dst = CAND / ('remilia-portrait-%d.png' % i)
    im.save(dst)
    print('CAND %s %dx%d  (%.0fs)' % (dst.name, im.size[0], im.size[1], time.time() - t0), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--n', type=int, default=2)
    ap.add_argument('--pick', type=int, default=None)
    a = ap.parse_args()
    if a.pick is not None:
        src = CAND / ('remilia-portrait-%d.png' % a.pick)
        if not src.exists():
            raise SystemExit('missing ' + str(src))
        if OUT.exists():
            (OUT.with_name('remilia.prev.png')).write_bytes(OUT.read_bytes())
        OUT.write_bytes(src.read_bytes())
        print('PICK %s -> %s' % (src.name, OUT.relative_to(ROOT)), flush=True)
        return
    for i in range(1, a.n + 1):
        for attempt in range(4):
            try:
                one(i)
                break
            except Exception as e:
                print('ERR #%d: %s' % (i, e), flush=True)
                if attempt == 3:
                    raise
                time.sleep(4)


if __name__ == '__main__':
    main()
