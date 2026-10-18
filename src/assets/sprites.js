/**
 * PIXEL DASH —— 程序化像素精灵表（零依赖、零构建）
 *
 * 本文件只导出 buildSprites() —— 契约 A 规定的唯一出口。
 * 所有精灵都用「字符地图 + 调色板」逐像素 fillRect(1,1) 绘制，
 * 禁止渐变 / 抗锯齿，1px 深色描边，整体明度偏低，便于从背景中分离。
 *
 * 精灵清单（尺寸严格按契约 A）：
 *   player.idle  1 帧 12x16 小冒险者站立（头盔 + 单只亮点眼睛 + 披风，朝右）
 *   player.run   4 帧 12x16 跑步（腿明显交替：跨步 / 抬腿 / 反向抬腿 / 跨步）
 *   player.jump  1 帧 12x16 起跳（双腿收紧）
 *   player.fall  1 帧 12x16 下落（双腿张开）
 *   slime        2 帧 16x16 地面史莱姆（直立呼吸 / 压扁）
 *   bat          2 帧 16x12 飞行蝙蝠（翅膀向上 / 翅膀向下）
 *   spike        1 帧 16x16 尖刺陷阱（四根钢刺，底边对齐）
 *   coin         4 帧 10x10 旋转金币（8 宽 → 6 宽 → 4 宽 → 6 宽）
 *   flag         1 帧 16x32 终点旗（旗杆 + 金色菱形徽记，底边对齐 y=32）
 *   tiles.solid  4 种 16x16 可无缝拼接的泥土块（随机碎石 / 暗斑）
 *   tiles.grass  1 种 16x16 顶部带草的土块
 *   tiles.brick  1 种 16x16 砖墙（两排错缝砖 + 高光）
 *   tiles.platform 1 种 16x16 单向平台（只有下半部分有内容，视觉轻薄）
 *   tiles.spike  1 种 16x16 尖刺瓷砖
 *   tiles.bg     3 种 16x16 半透明背景装饰块（点阵 / 竖纹 / 横纹）
 *   particle     3 帧 4x4 方形小点（1px → 2x2 → 3x3 爆闪，白色，运行时染色）
 *   heart        1 帧 8x8 满血爱心
 *   heartEmpty   1 帧 8x8 空心爱心
 */

/* ------------------------------------------------------------------ */
/* 绘制核心                                                            */
/* ------------------------------------------------------------------ */

/**
 * 用字符地图绘制一个精灵。
 * @param {number} w 画布宽（像素）
 * @param {number} h 画布高（像素）
 * @param {string[]} rows 每行一个字符串，第 x 个字符对应 palette 的键
 * @param {Object<string, string>} palette 字符 -> CSS 颜色
 * @returns {HTMLCanvasElement} 离屏画布
 */
function makeSprite(w, h, rows, palette) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (!ch || ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

/* ------------------------------------------------------------------ */
/* 玩家：12x16，朝右，头盔 + 单只亮眼 + 披风                             */
/* ------------------------------------------------------------------ */

const PLAYER_PAL = {
  o: '#0f0c16', // 深色描边
  h: '#4a6d96', // 头盔主色
  H: '#82aad4', // 头盔高光
  k: '#1b2233', // 面甲阴影带
  s: '#e3aa7a', // 皮肤
  e: '#f4fbff', // 单只亮点眼睛
  c: '#c2403f', // 披风
  C: '#8a2730', // 披风暗部
  t: '#3f8a63', // 上衣
  b: '#7a5533', // 腰带
  p: '#2a3550', // 裤子
  B: '#7d5638', // 靴子
};

// 上半身（12 行），跑步 / 站立 / 跳跃 / 下落共用
const PLAYER_UPPER = [
  '............',
  '....oooo....',
  '...oHHhho...',
  '...ohhhho...',
  '..ohhhhhho..',
  '..okkkkkko..',
  '..osssesso..',
  '.oCctttttto.',
  '.oCctttttso.',
  'oCcctttttto.',
  '.oCctttto...',
  '..oCcbbbo...',
];

// 下半身 4 行：不同动作换腿
const PLAYER_LEGS = {
  idle: [
    '...opo.opo..',
    '...opo.opo..',
    '..oBBo.oBBo.',
    '..oooo.oooo.',
  ],
  run: [
    // 帧 1：大跨步，双脚着地
    [
      '..opo...opo.',
      '..opo...opo.',
      '.oBBo..oBBo.',
      '.oooo..oooo.',
    ],
    // 帧 2：左腿蹬地，右腿抬起
    [
      '...opo.opo..',
      '...opo.opo..',
      '..oBBo.oBBo.',
      '..oooo......',
    ],
    // 帧 3：右脚着地，左脚抬起（与帧 2 交替）
    [
      '...opo.opo..',
      '...opo.opo..',
      '..oBBo.oBBo.',
      '......oooo..',
    ],
    // 帧 4：回收跨步，双腿张开幅度更大
    [
      '..opo...opo.',
      '.opo.....opo',
      '.oBBo...oBBo',
      '.oooo...oooo',
    ],
  ],
  jump: [
    '...oBBooBBo.',
    '...oBBooBBo.',
    '....oooo....',
    '............',
  ],
  fall: [
    '..opo...opo.',
    '.opo.....opo',
    '.oBo.....oBo',
    '.ooo.....ooo',
  ],
};

function makePlayer(legRows) {
  return makeSprite(12, 16, PLAYER_UPPER.concat(legRows), PLAYER_PAL);
}

/* ------------------------------------------------------------------ */
/* 史莱姆：16x16 两帧（直立呼吸 / 压扁）                                  */
/* ------------------------------------------------------------------ */

const SLIME_PAL = {
  o: '#101d17', // 描边
  G: '#3f9a63', // 身体
  H: '#6fd08c', // 顶部高光
  D: '#2c6e48', // 底部暗部
  W: '#f2fff6', // 眼白
  P: '#12241c', // 瞳孔
};

// 帧 A：正常体态
const SLIME_A = [
  '................',
  '................',
  '.....oooooo.....',
  '....oGGGGGGo....',
  '..oGGHHHHHHGGo..',
  '.oGGGGGGGGGGGGo.',
  '.oGGGGGGGGGGGGo.',
  '.oGGWWGGGGWWGGo.',
  '.oGGWPGGGGWPGGo.',
  '.oGGGGGGGGGGGGo.',
  '.oGDDDDDDDDDDGo.',
  '..oGDDDDDDDDGo..',
  '..oDDDDDDDDDDo..',
  '...oDDDDDDDDo...',
  '....oooooooo....',
  '................',
];

// 帧 B：压扁（更矮更宽）
const SLIME_B = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....oooooooo....',
  '..oGGHHHHHHGGo..',
  '.oGGGGGGGGGGGGo.',
  '.oGGWWGGGGWWGGo.',
  '.oGGWPGGGGWPGGo.',
  '.oGGGGGGGGGGGGo.',
  '.oGDDDDDDDDDDGo.',
  '..oGDDDDDDDDGo..',
  '..oDDDDDDDDDDo..',
  '...oooooooooo...',
  '................',
];

/* ------------------------------------------------------------------ */
/* 蝙蝠：16x12 两帧（翅膀向上 / 翅膀向下）                                */
/* ------------------------------------------------------------------ */

const BAT_PAL = {
  o: '#0e0a18', // 描边
  B: '#6b4f9e', // 身体 / 翼膜
  W: '#f0ecff', // 眼白
  P: '#1a1030', // 瞳孔
};

// 帧 A：翅膀上扬
const BAT_A = [
  '................',
  '..oo........oo..',
  '.oBBo......oBBo.',
  '.oBBo.oooo.oBBo.',
  '.oBBBBBBBBBBBBo.',
  '.oBBBBWBBWBBBBo.',
  '.oBBBBWBBWBBBBo.',
  '..oBBBBBBBBBBo..',
  '...oBBBBBBBBo...',
  '....oBBBBBBo....',
  '....oo....oo....',
  '................',
];

// 帧 B：翅膀下垂
const BAT_B = [
  '................',
  '.....oooooo.....',
  '....oBBBBBBo....',
  '....oBWBBWBo....',
  '....oBWBBWBo....',
  '...oBBBBBBBBo...',
  '..oBBBBBBBBBBo..',
  '.oBBoBBBBBBoBBo.',
  '.oBo.oBBBBo.oBo.',
  '..o...oBBo...o..',
  '......oBBo......',
  '................',
];

/* ------------------------------------------------------------------ */
/* 尖刺：16x16（四根钢刺 + 底座，底边对齐）                              */
/* ------------------------------------------------------------------ */

const SPIKE_PAL = {
  o: '#101419', // 描边
  L: '#a8b6c4', // 钢刺亮面
  D: '#5d6b7a', // 钢刺暗面
  H: '#dfe9f2', // 刺尖高光
};

const SPIKE_ROWS = [
  '................',
  '................',
  '................',
  '.H...H...H...H..',
  '.L...L...L...L..',
  'oLo.oLo.oLo.oLo.',
  'oLo.oLo.oLo.oLo.',
  'oLo.oLo.oLo.oLo.',
  'oLDooLDooLDooLDo',
  'oLDooLDooLDooLDo',
  'oLDooLDooLDooLDo',
  'oLDDoLDDoLDDoLDD',
  'oLDDoLDDoLDDoLDD',
  'oLDDoLDDoLDDoLDD',
  'oooooooooooooooo',
  '................',
];

/* ------------------------------------------------------------------ */
/* 金币：10x10 四帧旋转动画                                              */
/* ------------------------------------------------------------------ */

const COIN_PAL = {
  o: '#3a2a08', // 描边
  Y: '#ffe98a', // 高光金
  y: '#e0b030', // 金币主色
  D: '#9c6a10', // 暗部金
};

const COIN_1 = [
  '..........',
  '..oooooo..',
  '.oYYYYYYo.',
  '.oYyyyyDo.',
  '.oYyyyyDo.',
  '.oYyyyyDo.',
  '.oYyyyyDo.',
  '.oDyyyyDo.',
  '..oooooo..',
  '..........',
];

const COIN_2 = [
  '..........',
  '...oooo...',
  '..oYYYYo..',
  '..oYyyDo..',
  '..oYyyDo..',
  '..oYyyDo..',
  '..oYyyDo..',
  '..oDyyDo..',
  '...oooo...',
  '..........',
];

const COIN_3 = [
  '..........',
  '....oo....',
  '...oYYo...',
  '...oYyo...',
  '...oYyo...',
  '...oYyo...',
  '...oYyo...',
  '...oDyo...',
  '....oo....',
  '..........',
];

// 第 4 帧：转到背面，高光换到右侧
const COIN_4 = [
  '..........',
  '...oooo...',
  '..oYYYYo..',
  '..oDyyYo..',
  '..oDyyYo..',
  '..oDyyYo..',
  '..oDyyYo..',
  '..oDyyDo..',
  '...oooo...',
  '..........',
];

/* ------------------------------------------------------------------ */
/* 终点旗：16x32（旗杆 + 金色菱形徽记，底边对齐 y=32）                    */
/* ------------------------------------------------------------------ */

const FLAG_PAL = {
  o: '#141019', // 描边
  P: '#c0c6d0', // 旗杆亮面
  p: '#8a8f9a', // 旗杆（备用）
  r: '#c2403f', // 旗面
  R: '#8a2730', // 旗面暗部
  Y: '#f0c040', // 金色徽记
};

const FLAG_ROWS = [
  '................',
  '..ooo...........',
  '..oPo.ooooooooo.',
  '..oPo.orrrrrrro.',
  '..oPo.orrrrrrro.',
  '..oPo.orrrYrrro.',
  '..oPo.orrYYYrro.',
  '..oPo.orYYYYYro.',
  '..oPo.orrYYYrro.',
  '..oPo.orrrYrrro.',
  '..oPo.orrrrrrro.',
  '..oPo.orrrrrrro.',
  '..oPo.orRRRRRRo.',
  '..oPo.ooooooooo.',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '..oPo...........',
  '.oPPPo..........',
  'ooooooo.........',
];

/* ------------------------------------------------------------------ */
/* 地形瓦片：全部 16x16                                                  */
/* ------------------------------------------------------------------ */

const TILE_PAL = {
  o: '#141019', // 描边 / 灰缝
  d: '#5c4432', // 泥土主色
  D: '#3a2a1e', // 泥土暗部
  L: '#7a5c40', // 泥土亮部
  s: '#6e6a63', // 碎石
  S: '#3f3b36', // 碎石暗部
  b: '#7a3a2f', // 砖块主色
  B: '#9c4a3a', // 砖块亮部
  g: '#3f8a4a', // 草主色
  G: '#63c05a', // 草亮部
  w: '#a8794a', // 木板主色
  W: '#c49a63', // 木板亮部
};

// 4 种可无缝拼接的泥土变体（无外框，靠碎石/暗斑制造纹理）
const SOLID_1 = [
  'dddddddddddddddd',
  'dDddddddddddddDd',
  'ddddddLddddddddd',
  'dddddddddddddddd',
  'dddsdddddDdddddd',
  'dddssdddddddddsd',
  'ddddsddddddddssd',
  'ddddddddddddddss',
  'dddddddddddddddd',
  'ddddddLddddddddd',
  'ddddddddddddDddd',
  'dDdddddddddddddd',
  'ddddddddddLddddd',
  'ddddddDddddddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
];

const SOLID_2 = [
  'dddddddddddddddd',
  'ddddddddddDddddd',
  'dddLdddddddddddd',
  'dddddddddddddddd',
  'ddddddddsddddddd',
  'ddddddddssdddddd',
  'ddddddddsddddddd',
  'dddddddddddddddd',
  'dDdddddddddddddd',
  'ddddddddddddLddd',
  'dddddddddddddddd',
  'dddddddddDdddddd',
  'ddddssdddddddddd',
  'dddddddddddddddd',
  'ddddddddddddddDd',
  'dddddddddddddddd',
];

const SOLID_3 = [
  'dddddddddddddddd',
  'dddddddddddddddd',
  'ddDddddddddddddd',
  'ddddddddddddLddd',
  'dddddddddddddddd',
  'ddsddddddddddddd',
  'dssddddddddddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'ddddddddDddddddd',
  'dddddddddddddddd',
  'ddddddddddssdddd',
  'dddddddddddddddd',
  'dDdddddddddddddd',
];

const SOLID_4 = [
  'dddddddddddddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'ddddddssdddddddd',
  'dddddssssddddddd',
  'dddddssSsdDddddd',
  'ddddddssdddddddd',
  'dddddddddddddddd',
  'dddddddddddLdddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'dDdddddddddddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'ddddddddddssdddd',
  'dddddddddddddddd',
];

// 顶部带草的泥土块
const GRASS_ROWS = [
  'GGGGGGGGGGGGGGGG',
  'gGGGGgGGGGgGGGGg',
  'gggggggggggggggg',
  'gdggdgggdggdgggd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'ddddddLddddddddd',
  'dddddddddddddddd',
  'dddsdddddDdddddd',
  'dddssdddddddddsd',
  'ddddsddddddddssd',
  'ddddddddddddddss',
  'dddddddddddddddd',
  'ddddddLddddddddd',
  'dddddddddddddDdd',
  'dDdddddddddddddd',
];

// 砖墙：两排错缝 + 顶部高光
const BRICK_ROWS = [
  'oooooooooooooooo',
  'oLLLLLLLoLLLLLLo',
  'oBBBBBBBoBBBBBBo',
  'oBBBBBBBoBBBBBBo',
  'oBBBBBBBoBBBBBBo',
  'oBBBBBBBoBBBBBBo',
  'oBBBBBBBoBBBBBBo',
  'oooooooooooooooo',
  'oooooooooooooooo',
  'oLLLLLoLLLLLLLLo',
  'oBBBBBoBBBBBBBBo',
  'oBBBBBoBBBBBBBBo',
  'oBBBBBoBBBBBBBBo',
  'oBBBBBoBBBBBBBBo',
  'oBBBBBoBBBBBBBBo',
  'oooooooooooooooo',
];

// 单向平台：只占下半部分（顶部 9 行透明），视觉轻薄
const PLATFORM_ROWS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  'oooooooooooooooo',
  'oGGGGGGGGGGGGGGo',
  'oggggggggggggggo',
  'oddddddddddddddo',
  'oDDDDDDDDDDDDDDo',
  'oooooooooooooooo',
  '................',
];

// 背景装饰块：半透明、低对比，不参与碰撞
const BG_PAL = {
  a: 'rgba(46, 60, 92, 0.45)',
};

const BG_1 = [
  '................',
  '..a...a....a....',
  '................',
  '....a....a....a.',
  '................',
  'a....a....a.....',
  '................',
  '...a....a....a..',
  '................',
  '.a....a....a....',
  '................',
  '....a....a...a..',
  '................',
  '..a....a....a...',
  '................',
  'a....a.....a....',
];

const BG_2 = [
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
  'a.......a.......',
];

const BG_3 = [
  '................',
  'aaaaaaaaaaaaaaaa',
  '................',
  '................',
  '................',
  'aaaaaaaaaaaaaaaa',
  '................',
  '................',
  '................',
  'aaaaaaaaaaaaaaaa',
  '................',
  '................',
  '................',
  'aaaaaaaaaaaaaaaa',
  '................',
  '................',
];

/* ------------------------------------------------------------------ */
/* 粒子：4x4 三帧（1px → 2x2 → 3x3，白色，运行时染色）                    */
/* ------------------------------------------------------------------ */

const PARTICLE_PAL = {
  W: '#f4fbff',
  Y: '#ffe066',
};

const PARTICLE_1 = [
  '....',
  '.W..',
  '....',
  '....',
];

const PARTICLE_2 = [
  '....',
  '.WW.',
  '.WW.',
  '....',
];

const PARTICLE_3 = [
  'WWW.',
  'WWW.',
  'WWW.',
  '....',
];

/* ------------------------------------------------------------------ */
/* 血量：8x8 满 / 空                                                    */
/* ------------------------------------------------------------------ */

const HEART_PAL = {
  o: '#2a0e14', // 描边
  R: '#c8323c', // 满血主色
  H: '#e8606a', // 高光
  E: '#3a2230', // 空血填充
};

const HEART_ROWS = [
  '........',
  '.oo..oo.',
  'oHHooRRo',
  'oHRRRRRo',
  'oRRRRRRo',
  '.oRRRRo.',
  '..oRRo..',
  '...oo...',
];

const HEART_EMPTY_ROWS = [
  '........',
  '.oo..oo.',
  'oEEooEEo',
  'oEEEEEEo',
  'oEEEEEEo',
  '.oEEEEo.',
  '..oEEo..',
  '...oo...',
];

/* ------------------------------------------------------------------ */
/* 导出                                                                */
/* ------------------------------------------------------------------ */

/**
 * 构建全部精灵。每次调用都会重新创建离屏 canvas，互不共享可变状态。
 * @returns {{
 *   player: {idle: HTMLCanvasElement[], run: HTMLCanvasElement[], jump: HTMLCanvasElement[], fall: HTMLCanvasElement[]},
 *   slime: HTMLCanvasElement[], bat: HTMLCanvasElement[], spike: HTMLCanvasElement[],
 *   coin: HTMLCanvasElement[], flag: HTMLCanvasElement[],
 *   tiles: {solid: HTMLCanvasElement[], grass: HTMLCanvasElement[], brick: HTMLCanvasElement[],
 *           platform: HTMLCanvasElement[], spike: HTMLCanvasElement[], bg: HTMLCanvasElement[]},
 *   particle: HTMLCanvasElement[], heart: HTMLCanvasElement[], heartEmpty: HTMLCanvasElement[]
 * }}
 */
export function buildSprites() {
  return {
    player: {
      idle: [makePlayer(PLAYER_LEGS.idle)],
      run: PLAYER_LEGS.run.map((legs) => makePlayer(legs)),
      jump: [makePlayer(PLAYER_LEGS.jump)],
      fall: [makePlayer(PLAYER_LEGS.fall)],
    },
    slime: [
      makeSprite(16, 16, SLIME_A, SLIME_PAL),
      makeSprite(16, 16, SLIME_B, SLIME_PAL),
    ],
    bat: [
      makeSprite(16, 12, BAT_A, BAT_PAL),
      makeSprite(16, 12, BAT_B, BAT_PAL),
    ],
    spike: [makeSprite(16, 16, SPIKE_ROWS, SPIKE_PAL)],
    coin: [COIN_1, COIN_2, COIN_3, COIN_4].map((rows) =>
      makeSprite(10, 10, rows, COIN_PAL)
    ),
    flag: [makeSprite(16, 32, FLAG_ROWS, FLAG_PAL)],
    tiles: {
      solid: [SOLID_1, SOLID_2, SOLID_3, SOLID_4].map((rows) =>
        makeSprite(16, 16, rows, TILE_PAL)
      ),
      grass: [makeSprite(16, 16, GRASS_ROWS, TILE_PAL)],
      brick: [makeSprite(16, 16, BRICK_ROWS, TILE_PAL)],
      platform: [makeSprite(16, 16, PLATFORM_ROWS, TILE_PAL)],
      spike: [makeSprite(16, 16, SPIKE_ROWS, SPIKE_PAL)],
      bg: [BG_1, BG_2, BG_3].map((rows) => makeSprite(16, 16, rows, BG_PAL)),
    },
    particle: [PARTICLE_1, PARTICLE_2, PARTICLE_3].map((rows) =>
      makeSprite(4, 4, rows, PARTICLE_PAL)
    ),
    heart: [makeSprite(8, 8, HEART_ROWS, HEART_PAL)],
    heartEmpty: [makeSprite(8, 8, HEART_EMPTY_ROWS, HEART_PAL)],
  };
}
