#!/usr/bin/env python3
"""P2：重做 Boss 战斗立绘（以 gen/<key>.png 对话立绘为身份参考，图生图）。

用法:
  python tools/gen_boss_battle.py <key> [<key> ...]
  python tools/gen_boss_battle.py --all
输出: src/art/gen/boss/<key>.png（透明、内容高 560、脚底贴底）
"""
import base64
import json
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'art' / 'gen' / 'boss'
CRED = Path.home() / '.dsh' / '.credentials.yaml'
API = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
MODEL = 'doubao-seedream-5-0-pro-260628'

STYLE = ('retro doujin game art, chibi anime girl, full body, floating in midair, legs together and slightly bent, '
         'arms slightly spread wide, thick hand-drawn black outlines, flat cel shading, '
         'pure white background, no text, no watermark, no ground, no shadow')

BODY = {
    'rumia': ('short blonde bob hair with a red ribbon, a black blindfold band covering her eyes, '
              'black dress with a red bow at the collar, clean healthy legs with pale skin, black shoes, '
              'thin wisps of black darkness smoke curling around her ankles'),
    'wriggle': ('short light green hair with two antennae, green and black dress, translucent insect wings, '
                'calm confident look'),
    'cirno': ('short pale blue hair with a blue ribbon, white and blue dress, exactly six clean sharp translucent '
              'ice crystal wings arranged symmetrically, cheerful expression'),
    'aya': ('short black hair, red tengu toque hat with a white pom-pom, red and white tengu outfit, '
            'holding a black feather fan, energetic smirk with a visible face and clear eyes'),
    'yuyuko': ('long pink hair, pale blue and white kimono with butterfly patterns, holding a folding fan, '
               'serene gentle smile'),
    'kaguya': ('very long black hair, pale pink and purple layered kimono, princess headdress, elegant pose, '
               'clear beautiful face'),
    'flandre': ('blonde hair in a side ponytail with a red ribbon, red and white dress, large translucent '
                'crystal wings with seven colorful crystals, wide fanged grin'),
}

ORDER = ['rumia', 'wriggle', 'cirno', 'aya', 'yuyuko', 'kaguya', 'flandre']


def api_key() -> str:
    text = CRED.read_text(encoding='utf-8')
    m = re.search(r'ARK_API_KEY:\s*(\S+)', text)
    if not m:
        raise SystemExit('ARK_API_KEY not found')
    return m.group(1)


def post(payload: dict) -> str:
    req = urllib.request.Request(
        API,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api_key()},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read().decode('utf-8'))
    items = data.get('data') or []
    if not items or not items[0].get('url'):
        raise SystemExit('no url: ' + json.dumps(data)[:400])
    return items[0]['url']


def whiten(im: Image.Image, thresh=241) -> Image.Image:
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= thresh and g >= thresh and b >= thresh:
                px[x, y] = (r, g, b, 0)
            else:
                mn = min(r, g, b)
                if mn >= thresh - 20 and max(r, g, b) - mn <= 14:
                    px[x, y] = (r, g, b, 0)
    return im


def finish(src: Path, dst: Path, height=560):
    im = whiten(Image.open(src))
    bbox = im.getbbox()
    if not bbox:
        raise SystemExit('empty cutout ' + str(dst))
    im = im.crop(bbox)
    s = height / float(im.size[1])
    w = max(1, int(round(im.size[0] * s)))
    im = im.resize((w, height), Image.LANCZOS)
    im.save(dst)
    print('OK %s %dx%d' % (dst.relative_to(ROOT), w, height))


def one(key: str):
    ref = ROOT / 'src' / 'art' / 'gen' / (key + '.png')
    if not ref.exists():
        raise SystemExit('missing portrait ref ' + str(ref))
    b64 = base64.b64encode(ref.read_bytes()).decode()
    prompt = ('Keep this exact same character: identical face, hairstyle, colors and outfit details; '
              'do not redesign. Redraw her as a full-body battle sprite: %s.\n%s' % (BODY[key], STYLE))
    url = post({
        'model': MODEL,
        'prompt': prompt,
        'image': ['data:image/png;base64,' + b64],
        'size': '1024x1536',
        'response_format': 'url',
    })
    tmp = ROOT / ('_p2_boss_%s.jpg' % key)
    urllib.request.urlretrieve(url, tmp)
    OUT.mkdir(parents=True, exist_ok=True)
    backup = OUT / (key + '.prev.png')
    cur = OUT / (key + '.png')
    if cur.exists() and not backup.exists():
        cur.rename(backup)
    finish(tmp, cur)
    tmp.unlink(missing_ok=True)


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    keys = ORDER if args[0] == '--all' else args
    for k in keys:
        if k not in BODY:
            raise SystemExit('unknown boss ' + k)
        print('==', k, flush=True)
        one(k)


if __name__ == '__main__':
    main()
