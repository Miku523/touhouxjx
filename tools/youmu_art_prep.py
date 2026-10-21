"""
把 AI 生成的白底妖梦立绘处理成游戏素材（与其余 Boss 同一套规范）。

用法：
    python tools/youmu_art_prep.py <源图> battle   # → src/art/gen/boss/youmu.png（战斗，内容高 640）
    python tools/youmu_art_prep.py <源图> dialog   # → src/art/gen/youmu.png      （对话，内容高 560）

源图应带纯色底（出图提示词要求 flat solid pale mint #BFEEDF）；白底图也能跑，
但白色衣物可能被抠穿 —— 那种情况请用 tools/_youmu_matting.py 的色键逻辑重出图。

色键抠图（出图要求的纯色浅薄荷底）、裁掉透明边、按内容高度等比缩放（脚底贴底）。
像素处理在 tools/_youmu_matting.py：白底泛洪会把白袜/白衬衫抠穿（幽灵腿），
纯色底 + 色键没有这个坑，也顺手把外围光晕切干净。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _youmu_matting import matte  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TARGETS = {
    # 战斗立绘：引擎按 BOSS_H.youmu(238) 缩放，640 的内容高留足细节（与 yuyuko.png 同档）
    "battle": (os.path.join(ROOT, "src/art/gen/boss/youmu.png"), 640),
    # 对话立绘：dialogue.js 按 560 高绘制（与 yuyuko.png 等对话立绘同档）
    "dialog": (os.path.join(ROOT, "src/art/gen/youmu.png"), 560),
}


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    mode = sys.argv[2]
    if mode not in TARGETS:
        print(f"未知模式：{mode}（可选：{', '.join(TARGETS)}）")
        sys.exit(1)
    if not os.path.exists(src):
        print(f"找不到源图：{src}")
        sys.exit(1)
    dst, height = TARGETS[mode]
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    matte(src, dst, height)
    print(f"→ {os.path.relpath(dst, ROOT)}  已就绪；刷新页面即生效（genboss.js 的 KEYS 已包含 youmu）")


if __name__ == "__main__":
    main()
