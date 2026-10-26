/**
 * 《东方新纪行》—— 角色名册（纯数据，零绘制代码）
 *
 * 人物造型一律来自 AI 生成素材：
 *   战斗立绘   src/art/gen/boss/<key>.webp
 *   对话立绘   src/art/gen/<key>.webp
 *   自机动作帧 src/art/gen/run/<char>_*.webp
 *   妖精       src/art/gen/fairy/<color>.webp
 *
 * 任何绘制入口在素材未就绪时都返回 false，由调用方留柔光占位；
 * 本仓库不再保留任何程序化人物/剪影路径，缺图也不许再画「矢量小人」。
 *
 * 唯一例外：STAGE5 中途 Boss 魂魄妖梦（youmu）尚无 AI 立绘，由 genboss.js 的
 * 程序化分支同步绘制（中途 Boss 不允许空等图）。素材到位后把 'youmu' 加进
 * genboss.js 的 KEYS 即可切回 AI 立绘，无需改动本名册。
 */

export const BOSS_INFO = {
  rumia:   { name: '露米娅',           title: '宵暗的妖怪',         accent: '#c9a6ff', theme: 'darkness' },
  wriggle: { name: '莉格露',           title: '暗中蠢动的光虫',     accent: '#8ef07a', theme: 'bug' },
  cirno:   { name: '琪露诺',           title: '冰之妖精',           accent: '#7fd8ff', theme: 'ice' },
  aya:     { name: '射命丸文',         title: '最速的记者',         accent: '#ff6b6b', theme: 'wind' },
  yuyuko:  { name: '西行寺幽幽子',     title: '幽冥楼阁的亡灵少女', accent: '#ffa8d8', theme: 'ghost' },
  kaguya:  { name: '蓬莱山辉夜',       title: '永远与须臾的罪人',   accent: '#ffe9b0', theme: 'moon' },
  flandre: { name: '芙兰朵露',         title: '恶魔之妹',           accent: '#ff4d6a', theme: 'crimson' },
  remilia: { name: '雷米莉亚·斯卡雷特', title: '永远鲜红的幼月',     accent: '#ff4d6a', theme: 'crimson' },
  // STAGE5 中途 Boss（幽幽子之前的守门战）：半人半灵的庭师，薄荷绿主色
  youmu:   { name: '魂魄妖梦',         title: '半人半灵的庭师',     accent: '#9fe8d0', theme: 'ghost' },
};
