/**
 * 《东方新纪行》—— 角色名册（纯数据，零绘制代码）
 *
 * 人物造型一律来自 AI 生成素材：
 *   战斗立绘   src/art/gen/boss/<key>.png
 *   对话立绘   src/art/gen/<key>.png
 *   自机动作帧 src/art/gen/run/<char>_*.png
 *   妖精       src/art/gen/fairy/<color>.png
 *
 * 任何绘制入口在素材未就绪时都返回 false，由调用方留柔光占位；
 * 本仓库不再保留任何程序化人物/剪影路径，缺图也不许再画「矢量小人」。
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
};
