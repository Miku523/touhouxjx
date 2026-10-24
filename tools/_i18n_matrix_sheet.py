#!/usr/bin/env python
"""把 _pt/i18n-matrix 下同页面的四语言截图拼成 2×2 对照图。

用法：python tools/_i18n_matrix_sheet.py [screen ...]
输出：_pt/i18n-matrix/sheet-<screen>.png
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_pt', 'i18n-matrix')
LANGS = ['zh-Hans', 'zh-Hant', 'en', 'ja']
CELL_W, CELL_H = 640, 360
LABEL_H = 22


def sheet(screen):
    imgs = []
    for lang in LANGS:
        path = os.path.join(SRC, f'{screen}-{lang}.png')
        if not os.path.exists(path):
            print(f'skip {screen}: missing {lang}')
            return None
        imgs.append(Image.open(path).convert('RGB').resize((CELL_W, CELL_H), Image.LANCZOS))

    out = Image.new('RGB', (CELL_W * 2, (CELL_H + LABEL_H) * 2), (18, 14, 22))
    d = ImageDraw.Draw(out)
    for i, (lang, img) in enumerate(zip(LANGS, imgs)):
        x = (i % 2) * CELL_W
        y = (i // 2) * (CELL_H + LABEL_H)
        out.paste(img, (x, y + LABEL_H))
        d.text((x + 8, y + 4), lang, fill=(236, 226, 210))
    dst = os.path.join(SRC, f'sheet-{screen}.png')
    out.save(dst)
    print('wrote', dst)
    return dst


if __name__ == '__main__':
    screens = sys.argv[1:] or [
        'title', 'settings', 'keybinds', 'difficulty', 'charselect',
        'help', 'music', 'story', 'ending',
    ]
    for s in screens:
        sheet(s)
