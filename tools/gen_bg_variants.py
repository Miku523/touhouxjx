"""生成每关的第二套时段背景（火山方舟 Seedream，直连 API）。

用法：
  python tools/gen_bg_variants.py shrine night
  python tools/gen_bg_variants.py all night

输出：src/art/gen/bg/<theme>_2.jpg
"""
import base64
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CRED = Path.home() / '.dsh' / '.credentials.yaml'
API = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
MODEL = 'doubao-seedream-5-0-pro-260628'
SIZE = '2048x1152'

SHIFT = ('同一构图、同一地点、同一镜头角度，只把时间推到深夜：天空变成深靛蓝与墨紫，'
         '挂满星与薄云，月光从画面侧上方洒下，把原本被夕阳照亮的屋顶、石灯笼、'
         '树冠换成一侧冷月光 + 一侧暖灯光的双色布光。保留所有建筑、鸟居、树木、'
         '山脊、小路的形状与位置不变。日系动画厚涂背景风格，清透空气感，'
         '不要人物，不要文字，不要 logo，不要水印。')

SUBJECT = {
    'shrine': '傍晚的博丽神社：樱花树、红色鸟居、石灯笼、参道、远处山峦与夕阳',
    'forest': '魔法森林：巨大的树干、发光的蘑菇、萤火、雾带、月亮',
    'lake': '雾之湖：结冰的湖面、芦苇、雪山、低垂的巨大月亮与光柱',
    'mountain': '雪山瀑布：雪峰、松树、瀑布、溪流、低垂的月亮与薄雾',
    'nether': '彼岸花田：血红彼岸花、鸟居、枯枝、远处的塔与月亮',
    'moon': '月都：巨大的满月、竹林、日式宅邸与灯笼、湖泊倒影',
    'mansion': '红魔馆：哥特洋馆、红月、枯枝、铁栅栏、雾',
}


LAYOUT = {
    'forest': ('严格保持原图构图：画面左侧是一棵巨大的古树，粗壮树干占据左侧三分之一并延伸到顶部；'
               '中景是长满苔藓的林间小径与成片发光蘑菇；右侧垂着藤蔓与雾气；'
               '视线尽头是树冠缝隙与月亮，月亮位于画面正中偏上（水平约 51%，垂直约 20%），与参考图同一位置、同一大小。'
               '不要添加房屋、鸟居、神社或任何建筑。'),
}


def api_key() -> str:
    text = CRED.read_text(encoding='utf-8')
    m = re.search(r'ARK_API_KEY:\s*(\S+)', text)
    if not m:
        raise SystemExit('ARK_API_KEY not found')
    return m.group(1)


def gen(theme: str, out: Path, with_ref: bool = True) -> None:
    layout = LAYOUT.get(theme, '')
    prompt = f"日系动画厚涂背景插画，东方 Project 同人游戏风格。{SUBJECT.get(theme, theme)}。{layout}{SHIFT}"
    payload = {
        'model': MODEL,
        'prompt': prompt,
        'size': SIZE,
        'response_format': 'b64_json',
        'watermark': False,
    }
    if with_ref:
        src = ROOT / 'src' / 'art' / 'gen' / 'bg' / f'{theme}.jpg'
        if src.exists():
            b64 = base64.b64encode(src.read_bytes()).decode()
            payload['image'] = 'data:image/jpeg;base64,' + b64

    req = urllib.request.Request(
        API,
        data=json.dumps(payload).encode(),
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + api_key(),
        },
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode())
    item = data['data'][0]
    if 'b64_json' in item and item['b64_json']:
        out.write_bytes(base64.b64decode(item['b64_json']))
    else:
        with urllib.request.urlopen(item['url'], timeout=180) as r:
            out.write_bytes(r.read())
    print('saved', out, out.stat().st_size)


if __name__ == '__main__':
    theme = sys.argv[1] if len(sys.argv) > 1 else 'shrine'
    out = ROOT / 'src' / 'art' / 'gen' / 'bg' / f'{theme}_2.jpg'
    gen(theme, out)
