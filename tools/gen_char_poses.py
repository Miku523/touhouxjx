#!/usr/bin/env python3
"""P2：用火山方舟 Seedream 以「现有帧」为参考，生成主角同身份的其他动作帧。

用法:
  python tools/gen_char_poses.py <key> <pose> [--dry]
    key : reimu | marisa
    pose: idle | jump | fall | run1 | run2 | run3 | dash
输出: src/art/gen/run/<key>_<pose>.png（透明、脚底对齐、画幅 260x260）
"""
import base64
import json
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'art' / 'gen' / 'run'
CRED = Path.home() / '.dsh' / '.credentials.yaml'
API = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
MODEL = 'doubao-seedream-5-0-pro-260628'

STYLE = ('retro doujin game art, chibi anime girl, thick hand-drawn black outlines, '
         'flat cel shading, pure white background, full body, no text, no watermark, no shadow')

REF = {
    'reimu': 'src/art/gen/run/reimu_run_0.png',
    'marisa': 'src/art/gen/run/marisa_run_0.png',
}

POSES = {
    'idle': 'standing upright in a relaxed idle stance, both feet together and flat on the ground, '
            'arms hanging down loosely at her sides, facing right in three-quarter side view, '
            'gentle neutral expression with eyes open',
    'jump': 'leaping upward through the air, both knees tucked up under her body, one arm raised, '
            'facing right in side view, hair and skirt lifted by the jump',
    'fall': 'falling downward through the air, arms slightly raised for balance, legs bent and trailing, '
            'facing right in side view, hair and skirt fluttering upward',
    'dash': 'dashing forward at high speed, body leaning forward, arms swung back, one leg pushed far behind, '
            'facing right in side view',
    'fly': 'hovering in midair and flying forward, body tilted slightly forward, both legs together and '
           'trailing a little behind, one arm slightly out to the side, the other arm holding her weapon up, '
           'facing right in side view, hair and skirt lifted by the wind',
}

EXTRA = {
    'reimu': 'a Japanese shrine maiden girl: black hair with long side locks, big red ribbon on top of her head, '
             'white detached sleeves, red skirt, white frilled blouse with red trim',
    'marisa': 'a witch girl: long blonde hair, huge black witch hat with white band, black and white dress, '
              'white apron, holding one single straight wooden broom in her right hand',
}


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
    with urllib.request.urlopen(req, timeout=240) as r:
        data = json.loads(r.read().decode('utf-8'))
    items = data.get('data') or []
    if not items or not items[0].get('url'):
        raise SystemExit('no url in response: ' + json.dumps(data)[:400])
    return items[0]['url']


def whiten_to_alpha(im: Image.Image, thresh=243) -> Image.Image:
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
                if mn >= thresh - 22 and max(r, g, b) - mn <= 12:
                    px[x, y] = (r, g, b, 110)
    return im


def trim_fringe(im: Image.Image) -> Image.Image:
    """去掉 alpha 边缘残留的白色毛边：把半透明且近白的像素 alpha 归零。"""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if a < 200 and min(r, g, b) > 200:
                px[x, y] = (r, g, b, 0)
    return im


def finish(src_path: Path, dst: Path, size=260, foot=8):
    im = Image.open(src_path).convert('RGBA')
    im = whiten_to_alpha(im)
    im = trim_fringe(im)
    bbox = im.getbbox()
    if not bbox:
        raise SystemExit('empty cutout for ' + str(dst))
    im = im.crop(bbox)
    scale = size / float(im.size[1])
    nw = max(1, int(round(im.size[0] * scale)))
    im = im.resize((nw, size), Image.LANCZOS)
    canvas = Image.new('RGBA', (max(nw, size), size + foot), (0, 0, 0, 0))
    canvas.paste(im, ((canvas.width - nw) // 2, canvas.height - foot - size), im)
    canvas.save(dst)
    print('OK %s %dx%d' % (dst.relative_to(ROOT), canvas.width, canvas.height))


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    key, pose = sys.argv[1], sys.argv[2]
    if key not in REF or pose not in POSES:
        raise SystemExit('bad args')
    ref = ROOT / REF[key]
    b64 = base64.b64encode(ref.read_bytes()).decode()
    prompt = ('Keep this exact same character with the identical face, hair, colors, outfit and art style; '
              'do not redesign and do not add any new object. Change ONLY the pose: %s.\nCharacter: %s.\n%s'
              % (POSES[pose], EXTRA[key], STYLE))
    url = post({
        'model': MODEL,
        'prompt': prompt,
        'image': ['data:image/png;base64,' + b64],
        'size': '1024x1024',
        'response_format': 'url',
    })
    tmp = ROOT / ('_p2_%s_%s.jpg' % (key, pose))
    urllib.request.urlretrieve(url, tmp)
    OUT.mkdir(parents=True, exist_ok=True)
    finish(tmp, OUT / ('%s_%s.png' % (key, pose)))
    tmp.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
