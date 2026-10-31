/**
 * 曲库总表（按名字懒加载）。
 *
 * 数据格式（每条曲子 = 一个可无缝循环的片段，时间单位：秒）：
 *
 * {
 *   title: '妖魔夜行',            // 显示名（可选）
 *   duration: 57.4,              // 循环长度（秒），必须 > 0
 *   bpm: 147,                    // 参考 BPM（可选，仅供维护）
 *   tracks: [                    // 0~4 条旋律/伴奏声部
 *     {
 *       wave: 'square',          // 'square' | 'triangle' | 'sawtooth' | 'sine'
 *       gain: 0.14,              // 该声部峰值增益（0~0.3，建议 0.03~0.16）
 *       notes: [                 // 按时间升序
 *         [time, midi, dur, vel], // time/dur 秒，midi 0~127，vel 0~127
 *       ],
 *     },
 *   ],
 *   drums: [                     // 可选，按时间升序
 *     [time, kind, vel],         // kind: 0=底鼓 1=军鼓 2=闭镲 3=开镲 4=吊镲
 *   ],
 * }
 *
 * 约定：同一时刻最多 4 个旋律声部发声；音符时间 0 <= t < duration。
 *
 * ---------------------------------------------------------------------------
 * 懒加载（首访只带标题曲）
 * ---------------------------------------------------------------------------
 * 19 首曲子的音符表合起来占首访 JS 的四成多，而标题画面只需要 title 一首。
 * 所以这里只静态 import title_full.js，其余 18 个模块改成按名字动态 import：
 *
 *   getSong(name)        同步取曲目数据；没加载过就是 undefined（调用方自行降级）。
 *   ensureSong(name)     异步加载该曲目所属模块并 resolve 曲目数据。
 *                        同一模块的曲子一起到位；并发调用共享同一个 promise，幂等；
 *                        加载失败 resolve undefined（绝不 reject、不抛错）。
 *   preloadSongs(names)  批量预取，等全部有结果后 resolve。
 *   hasSong(name)        key 是否在曲库里（不要求已加载）。
 *   loadedSongKeys()     当前真正可用的曲目 key（= Object.keys(SONGS)）。
 *
 * SONGS 仍然导出，但它只是「已经加载过的曲目」的实时集合，未加载的 key 读出来是
 * undefined —— 不要用 `key in SONGS` / `!!SONGS[key]` 判断曲目是否存在，那会把
 * 未加载误判成不存在；需要判断存在性用 hasSong() 或 ensureSong()。
 *
 * 兼容：Node（tools/validate_songs.mjs、tools/qa_audio.mjs 等校验/分析脚本）在模块
 * 求值时用 require 同步装满全部曲目，保持既有工具链的同步语义；浏览器不做这件事。
 */

import { TITLE_FULL } from './title_full.js';

/**
 * 已加载曲目（实时集合）。首屏只有标题曲，其余由 ensureSong()/preloadSongs() 按需填入。
 * @type {Record<string, object>}
 */
export const SONGS = {
  // 标题画面：13 作主题曲融合 medley 的完整曲式版（去 8bit 音色，见 tools/title_arrange.py）
  title: TITLE_FULL.title,
};

/**
 * 每个动态模块一项：id 仅用于调试；url 是相对本文件的稳定 URL（刻意不带 ?v=，
 * 见 sw.js 的 codeHandler：同一发布版本内吃 SW 缓存，发布令牌变了自动整包失效）；
 * keys = 该模块负责的曲目 key（模块加载后一起进 SONGS）。
 * @type {{ id: string, url: string, keys: string[], pick: (m: object) => Record<string, object|undefined> }[]}
 */
const DEFS = [
  // 失败 / 结局曲。original.js 里的 title 被 title_full.js 的完整版覆盖，这里不再取。
  { id: 'original', url: './original.js', keys: ['gameover', 'ending'],
    pick: (m) => ({ gameover: m.ORIGINAL_SONGS?.gameover, ending: m.ORIGINAL_SONGS?.ending }) },
  // EXTRA 结局曲：整曲八音盒版《今宵未尽的祭典》（离线渲染，见 tools/build/build_festival_ending.py
  // 与 _make_festival_wav.py）。audio 让引擎直接播 src/assets/bgm/festival_box.mp3，
  // fetch 失败时自动回退 extra_ending.js 里的合成数据。
  { id: 'extra_ending', url: './extra_ending.js', keys: ['endingW'],
    pick: (m) => ({ endingW: m.EXTRA_ENDING?.endingW ? { ...m.EXTRA_ENDING.endingW, audio: 'src/assets/bgm/festival_box.mp3' } : undefined }) },
  // 1 面道中：ほおずきみたいに紅い魂 —— 照 ZUN 扒谱 1:1 直译（见 tools/pre1_honou.py）
  { id: 'honou_pre1', url: './honou_pre1.js', keys: ['pre1'],
    pick: (m) => ({ pre1: m.HONOU_PRE1?.pre1 }) },
  // 2 面道中：幻視の夜 ～ Ghostly Eyes（EUROBEAT 157 BPM，见 tools/midi_to_eurobeat.py）
  { id: 'eurobeat_pre2', url: './eurobeat_pre2.js', keys: ['pre2'],
    pick: (m) => ({ pre2: m.PRE2_EURO?.pre2 }) },
  // 1 面 Boss：妖魔夜行 —— 照 ZUN 扒谱 1:1 直译（见 tools/stage1_youma.py）
  { id: 'youma_stage1', url: './youma_stage1.js', keys: ['stage1'],
    pick: (m) => ({ stage1: m.YOUMA_STAGE1?.stage1 }) },
  // 2 面 Boss：蠢々秋月 —— 融合版 × 游戏内原曲混合，贝斯贴原曲音高（见 tools/merge_stage2.py）
  { id: 'merge_stage2', url: './merge_stage2.js', keys: ['stage2'],
    pick: (m) => ({ stage2: m.MERGE_STAGE2?.stage2 }) },
  // 3 面道中：ルーネイトエルフ —— 幽閉サテライト 风重编（见 tools/yuuhei_pre3.py）
  { id: 'yuuhei_pre3', url: './yuuhei_pre3.js', keys: ['pre3'],
    pick: (m) => ({ pre3: m.YUUHEI_PRE3?.pre3 }) },
  // 3 面 Boss：おてんば恋娘 —— Ateam 重低频编 + 花映塚 + 完美教室（见 tools/ateam_stage3.py）
  { id: 'ateam_stage3', url: './ateam_stage3.js', keys: ['stage3'],
    pick: (m) => ({ stage3: m.ATEAM_STAGE3?.stage3 }) },
  // 4 面道中：フォールオブフォール ～ 秋めく滝 —— 瀑布动机 × 和风 × 重低频（见 tools/pre4_fall.py）
  { id: 'fall_pre4', url: './fall_pre4.js', keys: ['pre4'],
    pick: (m) => ({ pre4: m.FALL_PRE4?.pre4 }) },
  // 4 面 Boss：風神少女 —— 原曲双旋律原封不动 × 新编伴奏按原曲逐小节和声重写（见 tools/build/_fusion_b.py）
  { id: 'aya_stage4_b', url: './aya_stage4_b.js', keys: ['stage4'],
    pick: (m) => ({ stage4: m.AYA_STAGE4?.stage4 }) },
  // 5 面道中：広有射怪鳥事 ～ Till When? —— 摇滚乐队编制，原曲主旋律占大头（见 tools/pre5_tillwhen.py）
  { id: 'tillwhen_pre5', url: './tillwhen_pre5.js', keys: ['pre5'],
    pick: (m) => ({ pre5: m.TILLWHEN_PRE5?.pre5 }) },
  // 5 面 Boss：幽雅に咲かせ、墨染の桜 ～ Border of Life —— 照原曲 1:1 直译（见 tools/boss5_murasaki.py）
  { id: 'yuuga_stage5', url: './yuuga_stage5.js', keys: ['stage5'],
    pick: (m) => ({ stage5: m.YUGA_STAGE5?.stage5 }) },
  // 6 面道中：ヴォヤージュ1970 —— 原谱钢琴托卡塔顶线原样 × 六段起伏重编（见 tools/pre6_voyage.py）
  { id: 'voyage_pre6', url: './voyage_pre6.js', keys: ['pre6'],
    pick: (m) => ({ pre6: m.VOYAGE_PRE6?.pre6 }) },
  // 6 面 Boss：竹取飛翔 ～ Lunatic Princess —— 原曲三条轨逐音原样，外加月光琶音 / 铺底 / 补鼓（见 tools/kaguya_fuse2.py）
  { id: 'kaguya_stage6', url: './kaguya_stage6.js', keys: ['stage6'],
    pick: (m) => ({ stage6: m.KAGUYA_STAGE6?.stage6 }) },
  // EX Boss：恶魔之妹 —— 最終鬼畜妹フランドール・S × U.N.オーエンは彼女なのか？（见 tools/build/_fld_compose.py）
  // audio 让引擎直接播离线渲染成品 src/assets/bgm/flandre_devil.mp3，
  // fetch 失败时自动回退到 flandre_devil.js 里的合成数据。
  { id: 'flandre_devil', url: './flandre_devil.js', keys: ['extra'],
    pick: (m) => ({ extra: m.FLANDRE_DEVIL?.extra ? { ...m.FLANDRE_DEVIL.extra, audio: 'src/assets/bgm/flandre_devil.mp3?v=1.6.41' } : undefined }) },
  // EX 道中：红月下追逐不止的女仆（见 tools/build/_exsr_compose.py）
  // audio 让引擎直接播离线 band 渲染成品 src/assets/bgm/sakuya_ex.mp3，
  // fetch 失败时自动回退 sakuya_ex.js 里的合成数据。
  { id: 'sakuya_ex', url: './sakuya_ex.js', keys: ['ex_pre'],
    pick: (m) => ({ ex_pre: m.SAKUYA_EX?.ex_pre ? { ...m.SAKUYA_EX.ex_pre, audio: 'src/assets/bgm/sakuya_ex.mp3?v=1.6.36' } : undefined }) },
  // EX 中段（雷米莉亚拦路）：亡き王女の為のセプテット —— 逐音搬入 + 重新配器（见 tools/build/_remi_compose.py）
  // audio 让引擎直接播离线渲染成品 src/assets/bgm/remilia_septette.mp3，
  // fetch 失败时自动回退 remilia_septette.js 里的合成数据。
  { id: 'remilia_septette', url: './remilia_septette.js', keys: ['ex_mid'],
    pick: (m) => ({ ex_mid: m.REMILIA_EX?.ex_mid ? { ...m.REMILIA_EX.ex_mid, audio: 'src/assets/bgm/remilia_septette.mp3?v=1.6.55' } : undefined }) },
];

/** key → 所属动态模块 */
const DEF_BY_KEY = new Map();
for (const def of DEFS) {
  for (const key of def.keys) DEF_BY_KEY.set(key, def);
}

/** 每个模块的加载状态：{ loaded, promise }，promise 用于并发去重 */
const LOAD_STATE = new Map();

/** 把模块导出里属于 def 的曲目写进 SONGS（load 成功 / Node 同步兼容都用它） */
function absorb(def, mod) {
  const picked = def.pick(mod) || {};
  for (const key of def.keys) {
    const song = picked[key];
    if (song !== undefined) SONGS[key] = song;
  }
}

/**
 * 同步取曲目数据（未加载返回 undefined）。
 * 注意：直接读 SONGS 本体，qa_audio.mjs 往 SONGS 里注入的测试曲也能被取到。
 * @param {string} name
 * @returns {object|undefined}
 */
export function getSong(name) {
  return name ? SONGS[name] : undefined;
}

/** key 是否属于曲库（不要求已加载） */
export function hasSong(name) {
  return !!name && (SONGS[name] !== undefined || DEF_BY_KEY.has(name));
}

/** 该 key 的曲目数据是否已经可用 */
export function isSongLoaded(name) {
  return !!name && SONGS[name] !== undefined;
}

/** 当前已加载的曲目 key（实时） */
export function loadedSongKeys() {
  return Object.keys(SONGS);
}

/** 启动一次模块加载（并发去重；失败 resolve false 并允许以后重试，绝不 reject） */
function loadDef(def) {
  let st = LOAD_STATE.get(def);
  if (!st) {
    st = { loaded: false, promise: null };
    LOAD_STATE.set(def, st);
  }
  if (st.loaded) return Promise.resolve(true);
  if (st.promise) return st.promise;
  st.promise = import(def.url).then(
    (mod) => {
      absorb(def, mod);
      st.loaded = true;
      st.promise = null;
      return true;
    },
    () => {
      // 断网 / 404 / 语法错误：静默失败（调用方负责降级与告警），下次还能重试
      st.promise = null;
      return false;
    }
  );
  return st.promise;
}

/**
 * 确保某首曲目可用（幂等，并发去重）。失败时 resolve undefined，不抛错。
 * @param {string} name
 * @returns {Promise<object|undefined>}
 */
export function ensureSong(name) {
  if (!name) return Promise.resolve(undefined);
  const cached = getSong(name);
  if (cached) return Promise.resolve(cached);
  const def = DEF_BY_KEY.get(name);
  if (!def) return Promise.resolve(undefined);
  maybeWarmStage1(name);
  return loadDef(def).then(() => getSong(name));
}

/**
 * 批量预取（去重；等全部有结果后 resolve）。
 * @param {string[]} names
 * @returns {Promise<void>}
 */
export function preloadSongs(names) {
  const jobs = [];
  const seen = new Set();
  for (const name of names || []) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    jobs.push(ensureSong(name));
  }
  return Promise.all(jobs).then(() => undefined);
}

/* ------------------------------------------------------------------ */
/* 音乐预热队列（warmSongs）                                            */
/* ------------------------------------------------------------------ */
/**
 * 预热：把「马上要用」的曲目模块提前拉下来，让 playMusic 命中缓存而不是现场等。
 *
 * 动因：曲库是懒加载的（首访只带 title 曲），按需加载意味着「等 playMusic 那一拍才发
 * 请求」。弱网下每次换曲都要多等一个 RTT + 十几 KB 模块的下载，而 playMusic 会先掐掉
 * 旧曲 —— 听起来就是进关 / Boss 登场先静音一阵（audio.js 的不静音换曲只能兜住其中
 * 「模块还没到」这一段）。
 *
 * 调度：串行（一次只拉一个模块），排在空闲帧里。曲库模块本身很小（gzip 后 5~30KB），
 * 但弱网带宽窄，和关卡背景 / 立绘抢带宽只会两边都慢，所以先让路一两个空闲帧。
 * **刻意不按 linkTier() 跳过弱网**：弱网恰恰是最需要预热的地方，跳过等于回到「进关静音」。
 *
 * 只在进关 / 开局这类「已经离开标题页」的时机调用，首访字节不会多一个。
 * @param {(string|null|undefined)[]} names 曲目 key；未知 / 已加载的自动跳过
 */
const warmQueue = [];
const warmSeen = new Set();
let warmDraining = false;
let warmScheduled = false;

function warmDrain() {
  if (warmDraining) return;
  const name = warmQueue.shift();
  if (!name) return;
  warmDraining = true;
  const done = () => {
    warmDraining = false;
    if (warmQueue.length) scheduleWarmDrain();
  };
  ensureSong(name).then(done, done);
}

/** 把 warmDrain 排到下一个空闲帧；弱网 / 帧不空闲时会由 timeout 逼出来 */
function scheduleWarmDrain() {
  if (warmScheduled || warmDraining) return;
  warmScheduled = true;
  const run = () => {
    warmScheduled = false;
    warmDrain();
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2500 });
    return;
  }
  setTimeout(run, 800);
}

export function warmSongs(names) {
  if (typeof window === 'undefined') return;
  for (const name of names || []) {
    if (!name || warmSeen.has(name) || !DEF_BY_KEY.has(name)) continue;
    warmSeen.add(name);
    if (getSong(name)) continue; // 已经在曲库里：不用排队
    warmQueue.push(name);
  }
  if (warmQueue.length) scheduleWarmDrain();
}

/* 第 1 面的老兜底：拿到 pre1 / stage1 的第一次请求后，把同面另一首也排上
   （正式预热在 main.js 的 _warmStageMusic，这里只是不走那套流程时的保险）。 */
const STAGE1_SIBLINGS = { pre1: ['stage1'], stage1: ['pre1'] };
let stage1WarmArmed = false;

function maybeWarmStage1(name) {
  if (stage1WarmArmed || typeof window === 'undefined') return;
  const siblings = STAGE1_SIBLINGS[name];
  if (!siblings) return;
  stage1WarmArmed = true;
  warmSongs(siblings);
}

/* ------------------------------------------------------------------ */
/* Node 兼容：校验 / 分析脚本需要同步看到全部曲目                        */
/* ------------------------------------------------------------------ */
// 浏览器不会进这个分支（浏览器里没有 process.versions.node）。
// 用 require 同步加载：这些模块是纯数据、没有顶层 await，Node 的 require(esm) 支持。
const IS_NODE = typeof window === 'undefined'
  && typeof process !== 'undefined'
  && !!process.versions
  && !!process.versions.node;

if (IS_NODE) {
  try {
    const req = process.getBuiltinModule('module').createRequire(import.meta.url);
    for (const def of DEFS) {
      try {
        absorb(def, req(def.url));
        const st = LOAD_STATE.get(def) || { loaded: false, promise: null };
        st.loaded = true;
        LOAD_STATE.set(def, st);
      } catch (err) {
        // 单个模块坏掉不影响其余曲目：validate_songs 会直接报「缺少曲目」
      }
    }
  } catch (err) {
    // 拿不到 require（极老 Node）：SONGS 只剩 title，校验脚本会失败，浏览器不受影响
  }
}
