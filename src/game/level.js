/**
 * 关卡：把字符地图解析成瓦片网格 + 实体列表，并提供碰撞查询。
 *
 * 尺寸：一个 tile = 32 逻辑像素。22 行关正好一屏（704px），34 行关给 5/6 面做纵向空间。
 * 坐标约定：左上角为原点，y 向下为正，与 Canvas 一致。
 *
 * def.gen 存在时（见 levelgen.js），rows 由生成器产出，同时带回崩落砖坐标。
 */

import { buildLevelRows } from '../assets/levelgen.js';

export const T = 32;

/* ---------------- 瓦片类型 ---------------- */
export const EMPTY = 0;
export const SOLID = 1;     // 泥土 / 岩体
export const GRASS = 2;     // 草皮（实心，顶面带草）
export const BRICK = 3;     // 砖块（实心）
export const PLATFORM = 4;  // 单向平台（只能从上方踩）
export const SPIKE = 5;     // 尖刺（伤害）
export const ICE = 6;       // 冰面（实心 + 打滑）
export const MUSHROOM = 7;  // 蘑菇弹床（实心 + 踩上弹跳）
export const WATER = 8;     // 水（装饰，不实心）
export const VINE = 9;      // 藤蔓墙（实心，装饰用）

const TILE_CHARS = {
  '#': SOLID,
  'G': GRASS,
  'B': BRICK,
  '=': PLATFORM,
  '^': SPIKE,
  'I': ICE,
  'M': MUSHROOM,
  'W': WATER,
  'V': VINE,
};

const ENTITY_CHARS = {
  P: 'player',
  o: 'coin',
  p: 'power',
  U: 'life',      // 1UP 道具（拾取即回一条残机）
  s: 'fairy',
  f: 'flyer',
  C: 'checkpoint',
  F: 'goal',
};

const SOLID_SET = new Set([SOLID, GRASS, BRICK, ICE, MUSHROOM, VINE]);

export class Level {
  /**
   * @param {object} def  LEVELS 里的一项
   * @param {number} index 关卡序号（0-based）
   */
  constructor(def, index = 0) {
    this.def = def;
    this.index = index;
    this.id = def.id || `stage${index + 1}`;
    this.name = def.name || `STAGE ${index + 1}`;
    this.title = def.title || '';
    this.hint = def.hint || '';
    this.theme = def.theme || 'shrine';
    this.mode = def.mode || 'platform'; // 'platform' | 'stg'
    this.extra = !!def.extra;
    this.boss = def.boss || null;
    this.music = def.music || null;

    const built = def.gen ? buildLevelRows(def.gen) : null;
    const rows = built ? built.rows : def.rows || [];
    this.gen = def.gen || null;

    this.rows = rows.length;
    this.cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    this.w = this.cols * T;
    this.h = this.rows * T;

    /** @type {Uint8Array} */
    this.grid = new Uint8Array(this.cols * this.rows);
    /** @type {{type:string,cx:number,cy:number,x:number,y:number}[]} */
    this.spawns = [];
    /** @type {{type:string,x:number,y:number}[]} */
    this.entities = [];
    this.playerSpawn = { x: T * 2, y: T * (this.rows - 4) };

    /** 崩落砖：格子坐标 + 世界坐标，Stage 负责计时/复原 */
    this.crumble = (built ? built.crumble : []).map(([cx, cy]) => ({ cx, cy, x: cx * T, y: cy * T }));

    this._parse(rows);
  }

  /** 运行期改瓦片（崩落砖），越界忽略。 */
  setTile(cx, cy, tile) {
    if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return;
    this.grid[cy * this.cols + cx] = tile;
  }

  _parse(rows) {
    for (let cy = 0; cy < this.rows; cy++) {
      const line = rows[cy] || '';
      for (let cx = 0; cx < this.cols; cx++) {
        const ch = line[cx] || ' ';
        const tile = TILE_CHARS[ch];
        if (tile !== undefined) {
          this.grid[cy * this.cols + cx] = tile;
          continue;
        }
        const ent = ENTITY_CHARS[ch];
        if (ent) {
          const x = cx * T;
          const y = cy * T;
          this.spawns.push({ type: ent, cx, cy, x, y });
          if (ent === 'player') {
            this.playerSpawn = { x, y };
          } else {
            this.entities.push({ type: ent, x, y, cx, cy });
          }
        }
      }
    }
  }

  /** 取瓦片。越界：左右视为实心墙，上下视为空气 */
  tileAt(cx, cy) {
    if (cx < 0 || cx >= this.cols) return SOLID;
    if (cy < 0 || cy >= this.rows) return EMPTY;
    return this.grid[cy * this.cols + cx];
  }

  isSolidTile(cx, cy) {
    return SOLID_SET.has(this.tileAt(cx, cy));
  }

  isPlatformTile(cx, cy) {
    return this.tileAt(cx, cy) === PLATFORM;
  }

  isSpikeTile(cx, cy) {
    return this.tileAt(cx, cy) === SPIKE;
  }

  isIceTile(cx, cy) {
    return this.tileAt(cx, cy) === ICE;
  }

  isMushroomTile(cx, cy) {
    return this.tileAt(cx, cy) === MUSHROOM;
  }

  isWaterTile(cx, cy) {
    return this.tileAt(cx, cy) === WATER;
  }

  /** 身体是否泡在水里（给游泳手感用） */
  isInWater(x, y, w, h) {
    const cx0 = Math.floor((x + 4) / T);
    const cx1 = Math.floor((x + w - 5) / T);
    const cy0 = Math.floor((y + 6) / T);
    const cy1 = Math.floor((y + h - 4) / T);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (this.isWaterTile(cx, cy)) return true;
      }
    }
    return false;
  }

  /** 是否踩在冰面上（脚下瓦片是冰） */
  isIceUnder(x, y, w, h) {
    const cx0 = Math.floor(x / T);
    const cx1 = Math.floor((x + w - 1) / T);
    const cy = Math.floor((y + h + 2) / T);
    for (let cx = cx0; cx <= cx1; cx++) {
      if (this.isIceTile(cx, cy)) return true;
    }
    return false;
  }

  /** 脚下的蘑菇弹床 */
  mushroomUnder(x, y, w, h) {
    const cx0 = Math.floor(x / T);
    const cx1 = Math.floor((x + w - 1) / T);
    const cy = Math.floor((y + h + 2) / T);
    for (let cx = cx0; cx <= cx1; cx++) {
      if (this.isMushroomTile(cx, cy)) return { cx, cy, x: cx * T + T / 2, y: cy * T };
    }
    return null;
  }

  /** 矩形是否与任意实心瓦片重叠 */
  rectHitsSolid(x, y, w, h) {
    const cx0 = Math.floor(x / T);
    const cx1 = Math.floor((x + w - 1) / T);
    const cy0 = Math.floor(y / T);
    const cy1 = Math.floor((y + h - 1) / T);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (this.isSolidTile(cx, cy)) return true;
      }
    }
    return false;
  }

  /** 矩形是否与尖刺重叠（判定内缩，手感更宽容） */
  rectHitsSpike(x, y, w, h, inset = 6) {
    const cx0 = Math.floor((x + inset) / T);
    const cx1 = Math.floor((x + w - 1 - inset) / T);
    const cy0 = Math.floor((y + inset) / T);
    const cy1 = Math.floor((y + h - 1 - inset) / T);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (this.isSpikeTile(cx, cy)) return true;
      }
    }
    return false;
  }

  isOutOfBounds(x, y) {
    return y > this.h + 96 || x < -96 || x > this.w + 96;
  }

  /** 从瓦片网格里收集所有某类型瓦片的世界坐标（给场景绘制用） */
  findTiles(type) {
    const out = [];
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        if (this.grid[cy * this.cols + cx] === type) out.push({ cx, cy });
      }
    }
    return out;
  }
}
