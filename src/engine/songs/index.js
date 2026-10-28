/**
 * 曲库总表。
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
 */

import { BOSS_SONGS } from './touhou.js';
import { ORIGINAL_SONGS } from './original.js';
import { EXTRA_ENDING } from './extra_ending.js';
import { TITLE_FULL } from './title_full.js';
import { HONOU_PRE1 } from './honou_pre1.js';
import { YOUMA_STAGE1 } from './youma_stage1.js';
import { PRE2_EURO } from './eurobeat_pre2.js';
import { MERGE_STAGE2 } from './merge_stage2.js';
import { YUUHEI_PRE3 } from './yuuhei_pre3.js';
import { ATEAM_STAGE3 } from './ateam_stage3.js';
import { FALL_PRE4 } from './fall_pre4.js';
import { AYA_STAGE4 } from './aya_stage4_b.js';
import { TILLWHEN_PRE5 } from './tillwhen_pre5.js';
import { VOYAGE_PRE6 } from './voyage_pre6.js';
import { YUGA_STAGE5 } from './yuuga_stage5.js';
import { KAGUYA_STAGE6 } from './kaguya_stage6.js';
import { UN_MAD } from './un_mad.js';
import { SAKUYA_EX } from './sakuya_ex.js';
import { REMILIA_EX } from './septette_ex.js';

export const SONGS = {
  ...ORIGINAL_SONGS,
  ...BOSS_SONGS,
  ...EXTRA_ENDING,
  // EXTRA 结局曲：整曲八音盒版《今宵未尽的祭典》（离线渲染，见 tools/build/build_festival_ending.py
  // 与 _make_festival_wav.py）。audio 让引擎直接播 src/assets/bgm/festival_box.mp3，
  // fetch 失败时自动回退 extra_ending.js 里的合成数据。
  endingW: { ...EXTRA_ENDING.endingW, audio: 'src/assets/bgm/festival_box.mp3' },
  // 标题画面：13 作主题曲融合 medley 的完整曲式版（去 8bit 音色，见 tools/title_arrange.py）
  title: TITLE_FULL.title,
  // 1 面道中：ほおずきみたいに紅い魂 —— 照 ZUN 扒谱 1:1 直译（见 tools/pre1_honou.py）
  pre1: HONOU_PRE1.pre1,
  // 2 面道中：幻視の夜 ～ Ghostly Eyes（EUROBEAT 157 BPM，见 tools/midi_to_eurobeat.py）
  pre2: PRE2_EURO.pre2,
  // 1 面 Boss：妖魔夜行 —— 照 ZUN 扒谱 1:1 直译（见 tools/stage1_youma.py）
  stage1: YOUMA_STAGE1.stage1,
  // 2 面 Boss：蠢々秋月 —— 融合版 × 游戏内原曲混合，贝斯贴原曲音高（见 tools/merge_stage2.py）
  stage2: MERGE_STAGE2.stage2,
  // 3 面道中：ルーネイトエルフ —— 幽閉サテライト 风重编（见 tools/yuuhei_pre3.py）
  pre3: YUUHEI_PRE3.pre3,
  // 4 面道中：フォールオブフォール ～ 秋めく滝 —— 瀑布动机 × 和风 × 重低频（见 tools/pre4_fall.py）
  pre4: FALL_PRE4.pre4,
  // 5 面道中：広有射怪鳥事 ～ Till When? —— 摇滚乐队编制，原曲主旋律占大头（见 tools/pre5_tillwhen.py）
  pre5: TILLWHEN_PRE5.pre5,
  // 6 面道中：ヴォヤージュ1970 —— 原谱钢琴托卡塔顶线原样 × 六段起伏重编（见 tools/pre6_voyage.py）
  pre6: VOYAGE_PRE6.pre6,
  // EX 道中：红月下追逐不止的女仆 —— 月時計 ～ ルナ・ダイアル / フラワリングナイト /
  // ナイト・オブ・ナイツ 三曲的 idiom 融合，G 小调 160 BPM 80 小节 = 120.0s（见 tools/build/_exsr_compose.py）。
  // audio 让引擎直接播离线 band 渲染成品 src/assets/bgm/sakuya_ex.mp3，
  // fetch 失败时自动回退 sakuya_ex.js 里的合成数据。
  ex_pre: { ...SAKUYA_EX.ex_pre, audio: 'src/assets/bgm/sakuya_ex.mp3?v=1.6.23' },
  // EX 中段（雷米莉亚拦路）：亡き王女の為のセプテット —— 主旋律照原曲扒谱、编制照 194s 蓝本重排到 160 BPM 圆舞（见 tools/ex_septette2.py）
  ex_mid: REMILIA_EX.ex_mid,
  // 3 面 Boss：おてんば恋娘 —— Ateam 重低频编 + 花映塚 + 完美教室（见 tools/ateam_stage3.py）
  stage3: ATEAM_STAGE3.stage3,
  // 4 面 Boss：風神少女 —— 原曲双旋律原封不动 × 新编伴奏按原曲逐小节和声重写（见 tools/build/_fusion_b.py）
  stage4: AYA_STAGE4.stage4,
  // 5 面 Boss：幽雅に咲かせ、墨染の桜 ～ Border of Life —— 照原曲 1:1 直译（见 tools/boss5_murasaki.py）
  stage5: YUGA_STAGE5.stage5,
  // 6 面 Boss：竹取飛翔 ～ Lunatic Princess —— 原曲三条轨逐音原样，外加月光琶音 / 铺底 / 补鼓（见 tools/kaguya_fuse2.py）
  stage6: KAGUYA_STAGE6.stage6,
  // EX Boss：U.N.オーエンは彼女なのか？～ 495年の孤独 —— 168 BPM 重编：主奏/副旋律/铺底/贝斯
  // 仍是游戏内原曲逐音搬移，新写鼓组、bII 强力和弦块、半音颤音与底鼓真空（见 tools/un_mad.py）
  // （audio 让引擎直接播离线渲染成品 src/assets/bgm/extra_mad.mp3，
  //  fetch 失败时自动回退到 un_mad.js 里的合成数据）
  extra: { ...UN_MAD.extra, audio: 'src/assets/bgm/extra_mad.mp3' },
};
