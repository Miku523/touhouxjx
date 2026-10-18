"""生成标题画面背景候选图（火山方舟 Seedream）。

用法：python tools/gen_title_bg.py
输出：_titlebg_cand1.jpg ... _titlebg_candN.jpg（放在项目根目录）
"""
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CRED = Path.home() / '.dsh' / '.credentials.yaml'

API = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
MODEL = 'doubao-seedream-5-0-pro-260628'
SIZE = '2048x1152'


def api_key() -> str:
    text = CRED.read_text(encoding='utf-8')
    m = re.search(r'ARK_API_KEY:\s*(\S+)', text)
    if not m:
        raise SystemExit('ARK_API_KEY not found')
    return m.group(1)


PROMPTS = [
    # 1. 黄昏神社 + 巨月 + 樱（横版，左侧留白给菜单）
    (
        '日系视觉小说标题画面背景插画，东方 Project 同人游戏风格，'
        '黄昏时分建在山丘上的博丽神社，巨大的淡金色满月从神社后方升起，'
        '盛开的樱花树从画面上方两侧垂下枝条，石灯笼透出暖橙色光，'
        '右侧一座红色鸟居剪影，远景是层层叠叠的蓝紫色山脉与薄雾，'
        '漫天飘落的樱花瓣，柔和水彩质感与干净的赛璐璐动画上色，'
        '深靛蓝与品红的黄昏色调，空气透视，电影感光晕，细节丰富，'
        '16:9 横构图，画面左侧留出较暗的空白区域给 UI 文字，'
        '不要人物，不要文字，不要 logo，不要水印'
    ),
    # 2. 月夜神社庭院 + 湖面倒影
    (
        '日系视觉小说标题画面背景，东方 Project 同人游戏风格，'
        '月夜下的日式神社庭院，一轮巨大的明亮满月，左侧红色鸟居，'
        '头顶垂下的樱花枝条，漂浮的纸灯笼，湖面映着月光与灯笼，'
        '远处山峦与夜雾，柔和的赛璐璐动画上色与水彩晕染，'
        '浓郁的紫、青绿夜色配暖橙灯光，纵深层次清晰，'
        '16:9 横构图，画面左下留出深色空白给菜单，'
        '不要人物，不要文字，不要 logo，不要水印'
    ),
    # 3. 云上参道 + 夕阳 + 鸟居
    (
        '日系标题画面背景插画，东方 Project 幻想风格，'
        '建在云海之上的神社参道，夕阳西下，一轮巨大的满月低垂在地平线，'
        '樱花瓣随风飞舞，一座座红色鸟居向远处延伸，石灯笼与萤火虫，'
        '水彩动画插画质感，粉金与靛蓝的戏剧性天空，细节丰富，'
        '16:9 横构图，左侧留出干净的负空间，'
        '不要人物，不要文字，不要 logo，不要水印'
    ),
]


def gen(prompt: str, idx: int) -> None:
    body = json.dumps({
        'model': MODEL,
        'prompt': prompt,
        'size': SIZE,
        'response_format': 'url',
        'watermark': False,
    }).encode()
    req = urllib.request.Request(API, data=body, headers={
        'Authorization': 'Bearer ' + api_key(),
        'Content-Type': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=240) as r:
        data = json.load(r)
    url = data['data'][0]['url']
    out = ROOT / f'_titlebg_cand{idx}.jpg'
    urllib.request.urlretrieve(url, out)
    print(f'cand{idx}: {out} ({out.stat().st_size} bytes)')


if __name__ == '__main__':
    for i, p in enumerate(PROMPTS, 1):
        gen(p, i)
