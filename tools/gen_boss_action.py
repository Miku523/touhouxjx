#!/usr/bin/env python3
"""P3：Boss 战斗立绘重做（动作 / 气质 / 原作还原）。

用法:
  python tools/gen_boss_action.py cirno                 # 生成 1 位（默认 2 张候选）
  python tools/gen_boss_action.py --all                 # 全部
  python tools/gen_boss_action.py cirno --n 3           # 3 张候选
  python tools/gen_boss_action.py cirno --pick 1        # 把候选 1 抠图后装进游戏

输出:
  _cand/<key>-<i>.jpg        原始生成图（白底）
  _cand/<key>-<i>.png        抠白底 + 内容高 640 的候选
  src/art/gen/boss/<key>.png  --pick 后安装
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CAND = ROOT / '_cand'
OUT = ROOT / 'src' / 'art' / 'gen' / 'boss'
CRED = Path.home() / '.dsh' / '.credentials.yaml'
API = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
MODEL = os.environ.get('ARK_MODEL', 'doubao-seedream-5-0-pro-260628')

STYLE = ('retro doujin game art, chibi anime girl, 2.5 heads tall, full body, '
         'thick hand-drawn black outlines, flat cel shading with crisp rim light, '
         'pure white background, no text, no watermark, no logo, no ground, no shadow, no frame, '
         'the character is alone, centered, nothing cropped by the image border')

# 身份/服装：尽量只抄参考立绘（对话立绘）的脸、发型、配色、服装细节
CHAR = {
    'cirno': {
        'ref': 'cirno',
        'size': '1024x1536',
        'outfit': ('short ice-blue bob hair with a big blue ribbon on the side, blue eyes, white and blue '
                   'pinafore dress with a blue waist ribbon and tiny stars on the hem, white socks, blue shoes, '
                   'exactly six translucent ice-crystal wings'),
        'pose': ('caught midair in a boastful, silly victory pose: twisting her body, one fist punched high '
                 'into the air, the other hand pointing at herself with her thumb, one leg kicked up behind '
                 'her, six ice wings flared wide open, mouth wide open in a smug laughing grin with a bit of '
                 'tongue showing, eyes half lidded and full of childish overconfidence, '
                 'blue ribbon and skirt whipping sideways, a ring of sharp ice shards and frost sparkles '
                 'bursting around her like she just shouted I AM THE STRONGEST'),
        'vibe': 'bratty, dumb, overconfident ice fairy, the number one baka',
    },
    'aya': {
        'ref': 'aya',
        'size': '1536x1024',
        'outfit': ('short black bob hair with a cute inward flip, big round crimson eyes with long eyelashes, '
                   'soft feminine face with a light blush, a black tengu tokin hat with a white triangle emblem and '
                   'a fluffy white pom-pom on top, a red and white reporter jacket with a PRESS armband over a '
                   'white blouse, a short red pleated skirt, black thigh-high socks, red shoes, black feathered '
                   'crow wings, a camera hanging from her neck'),
        'pose': ('a split second of an extreme high-speed dash toward the right: body leaning far forward, '
                 'one leg stretched back, huge black wings swept in a sharp V, one hand raising a camera to '
                 'her eye with the flash firing a starburst, the other hand flinging a black feather fan open, '
                 'jacket, skirt, scarf and hair streaming behind her, a bright mischievous girlish grin, '
                 'gusts of wind and faint afterimages of herself trailing behind'),
        'vibe': 'energetic, nosy, playful paparazzi girl tengu, the fastest in Gensokyo, cute but cheeky',
    },
    'yuyuko': {
        'ref': 'yuyuko',
        'size': '1024x1536',
        'outfit': ('very long pale pink hair, a pale pink frilled mob cap with a small red ribbon on top, '
                   'red eyes, a light blue and white layered kimono whose hem fades to pink, '
                   'butterfly patterns on the sleeves, a wide pale pink obi, bare feet in wooden sandals, '
                   'a folding fan'),
        'pose': ('floating high in the air, arms opened wide like a ghost welcoming the dead, long sleeves '
                 'billowing out into wing-like shapes, one hand holding an open folding fan, the other hand '
                 'raised as a spiral of pale blue spirit butterflies pours from her sleeve, '
                 'head tilted down with a gentle closed-eye smile that is somehow terrifying, '
                 'pink hair drifting upward as if underwater, ghostly blue wisps curling around her'),
        'vibe': 'serene, elegant, air-headed princess of the netherworld, calm as death itself',
    },
    'kaguya': {
        'ref': 'kaguya',
        'size': '1024x1536',
        'outfit': ('very long straight black hime-cut hair with a small red hair ornament, red eyes, '
                   'a red and pink layered kimono with a white inner collar, a wide red obi, '
                   'long flowing sleeves, no crown, no hat, wooden sandals'),
        'pose': ('floating regally above the ground with perfect posture, one arm raised high holding a '
                 'glowing jewel between two fingers, the other arm sweeping a long sleeve aside, '
                 'long black hair and layered kimono sleeves streaming in the air, '
                 'chin lifted, imperious red eyes looking down at the viewer, a faint knowing smile, '
                 'soft golden moon glow and drifting jewel sparks around her hand'),
        'vibe': 'the untouchable moon princess, arrogant and eternal, beautiful and cold',
    },
    'flandre': {
        'ref': 'flandre',
        'size': '1536x1024',
        'outfit': ('blonde hair in a side ponytail tied with a red ribbon, red eyes, a red and white '
                   'puff-sleeved dress with a white apron front and red shoes, huge crystal wings made of '
                   'seven colorful diamond crystals'),
        'pose': ('lunging at the viewer in midair, body twisted like a wild animal, one clawed hand thrust '
                 'straight toward the camera with fingers spread wide, the other arm flung back, '
                 'one knee raised and the other leg trailing, huge crystal wings spread wide and crackling, '
                 'blonde side ponytail and ribbons whipping, wide fanged grin, glowing crimson eyes, '
                 'crazed delighted expression, shattered glass shards and crimson sparks exploding around her'),
        'vibe': 'the demon sister, childish and utterly terrifying, about to break everything',
    },
    'remilia': {
        'ref': 'remilia',
        'size': '1536x1024',
        'outfit': ('pale lavender-blue hair in a soft chin-length bob with two long strands framing '
                   'her face, crimson red eyes with thin vertical slit pupils, a red ribbon bow tied '
                   'on the left side of her head, a pink pinafore dress with white puffy short sleeves '
                   'and white frilled collar, a white frilled apron front, a red ribbon at the breast, '
                   'a short puffy skirt with white frilled hem, white socks and red shoes, '
                   'large bat wings with purple-blue leathery membrane and visible finger bones'),
        'pose': ('floating high in the air, bat wings spread wide behind her, one arm raised elegantly '
                 'overhead summoning a cluster of long glowing crimson blood spears that fan out '
                 'diagonally, the other hand lowered with fingers gently curled, '
                 'head tilted slightly down at the viewer with a composed arrogant little smile and '
                 'one small fang, hair, ribbons and skirt lifted by the updraft, '
                 'crimson mist and drifting scarlet bat silhouettes around her'),
        'vibe': 'the eternal scarlet child, proud vampire aristocrat, elegant, imperious and a little spoiled',
    },
}

ORDER = ['cirno', 'aya', 'yuyuko', 'kaguya', 'flandre', 'remilia']


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
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        raise RuntimeError('HTTP %s %s' % (e.code, body[:600])) from None
    items = data.get('data') or []
    if not items or not items[0].get('url'):
        raise SystemExit('no url: ' + json.dumps(data)[:400])
    return items[0]['url']


def whiten(im: Image.Image, thresh=241) -> Image.Image:
    """去掉纯白 / 近白背景；保留角色身上的白色衣服（靠 floodfill 更安全）。"""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    # 从四边向内 flood fill：只有和画布边缘连通的近白区域才算背景
    seen = bytearray(w * h)
    stack = []
    for x in range(w):
        stack.append((x, 0))
        stack.append((x, h - 1))
    for y in range(h):
        stack.append((0, y))
        stack.append((w - 1, y))
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        if a == 0:
            px[x, y] = (r, g, b, 0)
            continue
        if r >= thresh and g >= thresh and b >= thresh:
            px[x, y] = (r, g, b, 0)
            stack.append((x + 1, y))
            stack.append((x - 1, y))
            stack.append((x, y + 1))
            stack.append((x, y - 1))
            continue
        # 白边过渡带（半透明白）
        if a < 230 and r > 225 and g > 225 and b > 225:
            px[x, y] = (r, g, b, 0)
            stack.append((x + 1, y))
            stack.append((x - 1, y))
            stack.append((x, y + 1))
            stack.append((x, y - 1))
    return im


def finish(src: Path, dst: Path, height=640):
    im = whiten(Image.open(src))
    bbox = im.getbbox()
    if not bbox:
        raise SystemExit('empty cutout ' + str(dst))
    im = im.crop(bbox)
    s = height / float(im.size[1])
    w = max(1, int(round(im.size[0] * s)))
    im = im.resize((w, height), Image.LANCZOS)
    im.save(dst)
    print('OK %s %dx%d' % (dst.relative_to(ROOT), w, height), flush=True)


def one(key: str, idx: int, tag: str = ''):
    cfg = dict(CHAR[key])
    # 版权过滤会让特定描述连续失败：用环境变量整段替换描述来换一种「画面」
    for field, env in (('outfit', 'OUTFIT_OVERRIDE'), ('pose', 'POSE_OVERRIDE'), ('vibe', 'VIBE_OVERRIDE')):
        v = os.environ.get(env)
        if v:
            cfg[field] = v
    # ref = 对话立绘的文件名；'none' 表示没有漫画像（例如新加的次要角色），只靠文字描述
    ref_path = os.environ.get('REF_PATH') or ('none' if cfg['ref'] == 'none' else
                                             str(ROOT / 'src' / 'art' / 'gen' / (cfg['ref'] + '.png')))
    ref = Path(ref_path) if ref_path != 'none' else None
    if ref is not None and not ref.exists():
        raise SystemExit('missing portrait ref ' + str(ref))
    b64 = base64.b64encode(ref.read_bytes()).decode() if ref else None
    prompt = (
        'Use the reference image ONLY for this character\'s identity and outfit. '
        'Keep her exact face, hairstyle, eye color, outfit colors and every clothing detail; do not redesign her.\n'
        'OUTFIT: %s.\n'
        'DO NOT copy the reference pose, its straight standing stance or its framing. '
        'Draw a completely new, high-energy full-body BOSS battle illustration:\n'
        'POSE: %s.\n'
        'MOOD: %s.\n'
        'STYLE: %s'
    ) % (cfg['outfit'], cfg['pose'], cfg['vibe'], STYLE)
    payload = {
        'model': MODEL,
        'prompt': prompt,
        'size': cfg['size'],
        'response_format': 'url',
    }
    if b64:
        payload['image'] = ['data:image/png;base64,' + b64]
    url = post(payload)
    CAND.mkdir(parents=True, exist_ok=True)
    raw = CAND / ('%s-%d%s.jpg' % (key, idx, tag))
    urllib.request.urlretrieve(url, raw)
    out = CAND / ('%s-%d%s.png' % (key, idx, tag))
    finish(raw, out)
    print('CAND %s  (%.0fs)' % (out.name, time.time() - t0), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('keys', nargs='*', choices=ORDER + [[]], default=[])
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--n', type=int, default=2)
    ap.add_argument('--pick', type=int, default=None)
    ap.add_argument('--tag', default='')
    ap.add_argument('--model', default=None)
    a = ap.parse_args()
    global MODEL
    if a.model:
        MODEL = a.model
    keys = ORDER if a.all else (a.keys or [])
    if not keys:
        raise SystemExit(__doc__)
    if a.pick is not None:
        for k in keys:
            src = CAND / ('%s-%d%s.png' % (k, a.pick, a.tag))
            if not src.exists():
                raise SystemExit('missing ' + str(src))
            dst = OUT / (k + '.png')
            if dst.exists():
                (OUT / (k + '.prev2.png')).write_bytes(dst.read_bytes())
            dst.write_bytes(src.read_bytes())
            print('PICK %s -> %s' % (src.name, dst.relative_to(ROOT)), flush=True)
        return
    global t0
    for k in keys:
        for i in range(1, a.n + 1):
            print('== %s #%d' % (k, i), flush=True)
            t0 = time.time()
            for attempt in range(6):
                try:
                    one(k, i, a.tag)
                    break
                except Exception as e:
                    print('ERR %s #%d: %s' % (k, i, e), flush=True)
                    if attempt == 5:
                        raise
                    time.sleep(5)


if __name__ == '__main__':
    t0 = time.time()
    main()
