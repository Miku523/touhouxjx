#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""回归守卫：仓库里不许再出现「抽象矢量小人」（程序化人物 / 剪影 fallback）。

背景：角色、Boss、对白立绘、妖精已全部改为 src/art/gen/ 下的 AI 生成素材；
      任何程序化人物绘制路径（drawCharacter / drawBoss / 剪影 fallback）都不允许回流。

用法：
    python tools/check_no_vector_people.py

退出码 0 = 干净；1 = 发现残留（会打印 文件:行 与命中内容）。
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEXT_EXT = {'.js', '.mjs', '.html', '.md', '.css', '.py', '.json'}
# 这些文件本身是「禁止清单」的载体，扫描时跳过
SKIP_FILES = {'tools/check_no_vector_people.py'}

# 1) 已删除的矢量人物模块与预览页，不许复活
FORBIDDEN_PATHS = [
    'src/art/chars.js',
    'src/art/bosses.js',
    'src/assets/sprites.js',
    'preview-chars.html',
    'preview-bosses.html',
]

# 2) 程序化人物专属标识符，任何 js / html / md 文本里都不该出现
FORBIDDEN_CODE = [
    (r'\bdrawCharacter\b', '程序化自机立绘函数'),
    (r'\bfallbackPortrait\b', '对话剪影 fallback'),
    (r'\bbuildSprites\b', '旧像素人物精灵表'),
    (r'\b_drawFlyer\b', '妖精矢量回退'),
    (r'\b_drawWraith\b', '怨灵矢量回退'),
    (r'\bdrawBoss\s*\(', '程序化 Boss 立绘'),
    (r'\bdrawPortrait\s*\(', '程序化对话立绘'),
    (r'\bCHAR_BOX\b', '程序化自机尺寸常量'),
    (r'\bBOSS_BOX\b', '程序化 Boss 尺寸常量'),
    (r'\bCHAR_INFO\b', '程序化自机资料'),
]

# 3) 文案层残留（只用于说明「已经删掉」的表述不算）
STALE_PHRASES = [
    '目前游戏内仍是矢量绘制',
    '超时直接用矢量版开播',
    '缺帧自动回退 run 帧 → 程序化',
    '[程序化 fallback]',
    '回退到程序化绘制',
    '回退到程序化 chars.js',
]

REQUIRED_AI = [
    *[f'src/art/gen/run/{ch}_{st}.png'
      for ch in ('reimu', 'marisa')
      for st in ('idle', 'run_0', 'run_1', 'run_2', 'run_3', 'jump', 'fall', 'fly')],
    *[f'src/art/gen/{k}.png'
      for k in ('reimu', 'marisa', 'rumia', 'wriggle', 'cirno', 'aya',
                'yuyuko', 'kaguya', 'flandre', 'remilia')],
    *[f'src/art/gen/boss/{k}.png'
      for k in ('rumia', 'wriggle', 'cirno', 'aya', 'yuyuko', 'kaguya',
                'flandre', 'remilia')],
    *[f'src/art/gen/fairy/{c}.png'
      for c in ('blue', 'red', 'green', 'yellow', 'purple')],
]


def tracked_files() -> list[str]:
    try:
        out = subprocess.run(
            ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
            cwd=ROOT, check=True, capture_output=True,
        ).stdout.decode('utf-8')
        files = [p for p in out.split('\0') if p]
        if files:
            return files
    except Exception:
        pass
    return [str(p.relative_to(ROOT)).replace('\\', '/')
            for p in ROOT.rglob('*') if p.is_file()]


def main() -> int:
    problems: list[str] = []

    # 1) 文件级
    for rel in FORBIDDEN_PATHS:
        if (ROOT / rel).exists():
            problems.append(f'[{rel}] 程序化人物文件仍然存在')

    # 2) 文本级
    code_rules = [(re.compile(pat), why) for pat, why in FORBIDDEN_CODE]
    for rel in tracked_files():
        rel_norm = rel.replace('\\', '/')
        if rel_norm in SKIP_FILES or (ROOT / rel_norm).suffix.lower() not in TEXT_EXT:
            continue
        p = ROOT / rel_norm
        if not p.exists():
            continue
        for lineno, line in enumerate(
                p.read_text(encoding='utf-8', errors='ignore').splitlines(), 1):
            for rx, why in code_rules:
                if rx.search(line):
                    problems.append(f'{rel_norm}:{lineno} 命中「{why}」：{line.strip()[:110]}')
            for phrase in STALE_PHRASES:
                if phrase in line:
                    problems.append(f'{rel_norm}:{lineno} 过期文案「{phrase}」：{line.strip()[:110]}')

    # 3) AI 素材完整性：人物不许有「缺图只能走矢量」的死角
    missing = [rel for rel in REQUIRED_AI if not (ROOT / rel).exists()]
    if missing:
        problems.append('AI 人物素材缺失：' + '、'.join(missing))

    if problems:
        print('FAIL — 发现程序化人物残留：')
        for x in problems:
            print('  -', x)
        return 1

    print('OK — 未发现程序化人物残留：人物全部走 src/art/gen/ 的 AI 素材，缺图只铺柔光。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
