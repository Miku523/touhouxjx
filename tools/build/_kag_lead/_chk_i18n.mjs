const packs = ['en','ja','zh-hant'];
const title = "竹取飞翔 ～ Lunatic Princess（月之公主编）";
const orig = "原曲「竹取飞翔 ～ Lunatic Princess」/ 作曲：ZUN / 编曲：Miku523（逐音搬入重配器）";
const noteZh = "六面 Boss 曲（2:42 · 重制版）。ZUN 原曲 102 小节整块搬进来：154 BPM、F 小调起头，副歌转降 B 小调，最后十六小节整体升半音，旋律、对位、低音、十六分琶音一个音没改，动的只有配器与脚底下。前面接四小节新写的引子——八音盒把主旋律先哼一遍，免得非得等到一分二十一秒才认出是谁；钢琴十六分跑句、双小号主题、大键琴固定音型照原曲顺序走完，一分二十一秒方轮到大键琴后面的 SquareLead 正式开口。鼓在 1:21 与 1:56 两次整段抽空，只剩钟摆和拍子在数——那是她翻月相表的时候。尾声四小节把主题收回八音盒里，落在降 E 大和弦上不给解决，接回第一小节。\n——蓬莱山辉夜：「地上的人也能弹出这样的曲子啊。就是慢。」";
for (const p of packs) {
  const m = await import('../../../src/i18n/packs/' + p + '.js');
  const dicts = Object.values(m).filter(v => v && typeof v === 'object');
  const d = dicts[0];
  const keys = Object.keys(d).length;
  const hit = [title, orig, noteZh].map(k => d[k] ? (String(d[k]).slice(0, 26) + ' | ' + String(d[k]).length) : 'MISS');
  console.log(p, 'keys', keys, JSON.stringify(hit));
}
