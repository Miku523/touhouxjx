/**
 * 关卡数据
 *
 * 一个 tile = 32 逻辑像素。22 行关正好一屏（704px），34 行关（stage5/6）给纵向空间。
 *
 * 1–6 面的地形不再手写，改为 levelgen.js 按「地块模板」生成 2.1k–3.9k 列的关卡：
 * 纯跑图从 3:00 起逐面 +0:30（3:00 / 3:30 / 4:00 / 4:30 / 5:00 / 5:30），每关末尾自动留出 Boss 场。
 * Extra 走另一套节奏：零火力起手的 6:00 道中 → 3:00 雷米莉亚中途战 → 6:00 芙兰收尾（Boss 战约 10 分钟）。
 *
 * 瓦片字符（与 src/game/level.js 一一对应）：
 *   '.' / ' '  空气          '#'  泥土岩体（实心）     'G'  草皮（实心，地表最上层）
 *   'B'  砖块（实心，生成器产出的会崩落）
 *   '='  单向平台（只从上方踩）
 *   '^'  尖刺（伤害）        'I'  冰面（实心 + 打滑）  'M'  蘑菇弹床（踩上弹飞）
 *   'W'  水（可游泳）        'V'  藤蔓墙（实心装饰）
 *
 * 实体字符：
 *   'P' 出生点  'o' 金币  'p' 小 P 点（火力）
 *   's' 地面妖精（巡逻）  'f' 飞行妖精
 *   'C' 检查点  'F' 终点旗（飞行关省略）
 */

export const TILE = 32;

export const LEVELS = [
  {
    id: 'stage1',
    name: 'STAGE 1',
    title: '博丽神社 · 黄昏樱花',
    theme: 'shrine',
    mode: 'platform',
    boss: 'rumia',
    music: 'stage1',
    musicPre: 'pre1',
    hint: '← → 移动　空格 跳跃／二段跳　K 冲刺　↑／↓ 向上／下射击　砖块踩久会塌',
    fairyTint: { main: 'purple', mix: ['yellow', 'red', 'blue'] },
    gen: { kind: 'platform', rows: 22, ground: 19, cols: 600, seed: 1101, style: 'shrine' },
  },
  {
    id: 'stage2',
    name: 'STAGE 2',
    title: '魔法森林 · 萤火夜雾',
    theme: 'forest',
    mode: 'platform',
    boss: 'wriggle',
    music: 'stage2',
    musicPre: 'pre2',
    hint: '蘑菇会把自机弹飞　藤蔓墙下方留有空隙　可以下水游泳',
    fairyTint: { main: 'green', mix: ['yellow', 'blue', 'purple'] },
    gen: { kind: 'platform', rows: 22, ground: 19, cols: 755, seed: 2202, style: 'forest' },
  },
  {
    id: 'stage3',
    name: 'STAGE 3',
    title: '雾之湖 · 冰蓝晨曦',
    theme: 'lake',
    mode: 'platform',
    boss: 'cirno',
    musicPre: 'pre3',
    music: 'stage3',
    hint: '冰面会打滑，提前起跳　水面可以游泳　崩落砖别停太久',
    fairyTint: { main: 'blue', mix: ['purple', 'yellow', 'green'] },
    gen: { kind: 'platform', rows: 22, ground: 19, cols: 871, seed: 3303, style: 'lake' },
  },
  {
    id: 'stage4',
    name: 'STAGE 4',
    title: '妖怪之山 · 瀑布溪谷',
    theme: 'mountain',
    mode: 'stg',
    boss: 'aya',
    music: 'stage4',
    hint: '方向键 自由飞行　空格 加速　Z 连射　X 释放符卡',
    fairyTint: { main: 'green', mix: ['blue', 'yellow', 'purple'] },
    gen: { kind: 'stg', rows: 22, cols: 497 },
  },
  {
    id: 'stage5',
    name: 'STAGE 5',
    title: '白玉楼 · 冥界花海',
    theme: 'nether',
    mode: 'platform',
    boss: 'yuyuko',
    music: 'stage5',
    hint: '纵向高台落差更大　砖块踩久会塌　↑／↓ 上下射击',
    fairyTint: { main: 'purple', mix: ['red', 'yellow', 'blue'] },
    gen: { kind: 'platform', rows: 34, ground: 31, cols: 1170, seed: 5505, style: 'nether' },
  },
  {
    id: 'stage6',
    name: 'STAGE 6',
    title: '月都 · 永远亭',
    theme: 'moon',
    mode: 'platform',
    boss: 'kaguya',
    music: 'stage6',
    hint: '砖墙与浮台交错　崩落砖桥要快速通过　↑／↓ 上下射击',
    fairyTint: { main: 'blue', mix: ['purple', 'yellow', 'red'] },
    gen: { kind: 'platform', rows: 34, ground: 31, cols: 1324, seed: 6606, style: 'moon' },
  },
  {
    id: 'extra',
    name: 'EXTRA',
    title: '红魔馆地下 · 血月水晶',
    theme: 'mansion',
    mode: 'stg',
    boss: 'flandre',
    music: 'extra',
    extra: true,
    hint: '零火力起手的 6:00 道中　3:00 雷米莉亚拦路 → 6:00 芙兰朵露终盘　全程弹幕密度极高',
    fairyTint: { main: 'red', mix: ['purple', 'yellow', 'blue'] },
    // 道中要铺满 EXTRA_TIMELINE 的 6:00（165px/s × 360s = 59,400px）。
    // T=32，cols 1900 → w=60,800，滚动上限 w-1400=59,400 = 360 秒整。
    gen: { kind: 'stg', rows: 22, cols: 1900 },
  },
];
