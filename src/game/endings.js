/**
 * 结局脚本数据。
 *
 * 规则（m00001 + m00045）：
 *   魔理沙 · E 难度通关（第 5 面结束）      → END 03
 *   魔理沙 · N/H/L 通关（第 6 面结束）      → END 04
 *   灵梦   · E 难度通关（第 5 面结束）      → END 01
 *   灵梦   · N/H/L 通关（第 6 面结束）      → END 02
 *   EX 关失败                                → 无结局，回到标题
 *   EX 关胜利 · 魔理沙                       → W2
 *   EX 关胜利 · 灵梦                         → W1
 *
 * 每个结局是一段分镜演出：
 *   shots[]：{ bg, cast[], lines[] }
 *   lines[]：{ who, text }；who='narrator' 为旁白，player/partner 会自动替换成当前主控与搭档。
 *   cast[]：{ key, x(0..1 横向位置), h(像素高), delay(入场延迟秒) }
 * 文字里 {me}/{partner}/{self} 由 dialogue.js 统一替换。
 */
export const ENDINGS = {
  /* ------------------------------------------------------------------ */
  /* END 01 · 灵梦 / EASY CLEAR                                          */
  /* ------------------------------------------------------------------ */
  ed1: {
    key: 'ed1',
    code: 'END 01',
    noLabel: '01',
    kindLabel: 'EASY CLEAR ENDING',
    char: 'reimu',
    charName: '博丽灵梦',
    title: '五月的黄昏',
    titleCn: '春天停在这里',
    en: 'THE DUSK THAT WOULD NOT END',
    quote: '「春天还没有结束——所以，明天还得早起。」',
    still: 'shrine_2',
    glow: '255, 112, 130',
    mote: 'petal',
    shots: [
      {
        bg: 'shrine_2',
        cast: [],
        lines: [
          { who: 'narrator', text: '第五面结束后的黄昏。博丽神社的樱花，还在开。' },
          { who: 'partner', text: '喂，灵梦。那家伙最后说的「祭典永远不会结束」——到底是什么意思？' },
          { who: 'narrator', text: '从红魔馆方向吹来的风里，夹着一丝不属于这个季节的暖意。' },
        ],
      },
      {
        bg: 'forest_2',
        cast: [{ key: 'reimu', x: 0.68, h: 500 }],
        lines: [
          { who: 'player', text: '……线索够多了。红魔馆，会说话的樱花，还有那个「妹妹」。' },
          { who: 'partner', text: '那还等什么？今晚就冲进去，把幕后黑手揪出来！' },
          { who: 'player', text: '不行。今天已经太晚了。' },
          { who: 'partner', text: '哈？你什么时候这么守规矩了？' },
        ],
      },
      {
        bg: 'shrine',
        cast: [{ key: 'reimu', x: 0.62, h: 510 }],
        lines: [
          { who: 'narrator', text: '于是两人在神社的廊下分了茶。没有谁是赢家，也没有谁是输家。' },
          { who: 'player', text: '明天再来。反正春天还长。' },
          { who: 'partner', text: '……你这话，听着有点可怕啊。' },
          { who: 'narrator', text: '远处，红魔馆的窗里亮着灯。春天没有尽头，调查也还没有。' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [],
        lines: [
          { who: 'narrator', text: '后来，灵梦偶尔会想起那个黄昏。想起自己没能问出口的那句话。' },
          { who: 'player', text: '……下次，一定要把那个「妹妹」揪出来。' },
          { who: 'narrator', text: '五月的风穿过鸟居。春天停在这里，像一句没有说完的话。' },
          { who: 'narrator', text: '—— 未完待续 ——' },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* END 03 · 魔理沙 / EASY CLEAR                                        */
  /* ------------------------------------------------------------------ */
  ed3: {
    key: 'ed3',
    code: 'END 03',
    noLabel: '03',
    kindLabel: 'EASY CLEAR ENDING',
    char: 'marisa',
    charName: '雾雨魔理沙',
    title: '未完成的寻宝',
    titleCn: '明天走得更远',
    en: "TOMORROW'S TREASURE",
    quote: '「宝物还没到手呢。下次，走得更远一点。」',
    still: 'forest_2',
    glow: '255, 205, 96',
    mote: 'petal',
    shots: [
      {
        bg: 'forest_2',
        cast: [{ key: 'marisa', x: 0.7, h: 500 }],
        lines: [
          { who: 'player', text: '第五面就到此为止？我还以为能捞到什么好宝贝。' },
          { who: 'partner', text: '幽幽子都说了「祭典永不完结」，你还有心思找宝贝？' },
          { who: 'player', text: '两码事。麻烦是麻烦，宝贝是宝贝。' },
          { who: 'narrator', text: '红魔馆的灯火就在森林那头。魔理沙把扫帚扛上肩，却没有飞过去。' },
        ],
      },
      {
        bg: 'mansion_2',
        cast: [{ key: 'marisa', x: 0.72, h: 490 }],
        lines: [
          { who: 'player', text: '先记下来。那栋洋馆，那个妹妹，还有这满开的樱花——全是我下次的猎物。' },
          { who: 'partner', text: '你倒是把偷东西说得挺理直气壮。' },
          { who: 'player', text: '这叫寻宝。' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [{ key: 'marisa', x: 0.6, h: 500 }],
        lines: [
          { who: 'narrator', text: '这个春天的夜晚结束得很早。但魔理沙的寻宝清单，才刚刚写到第一页。' },
          { who: 'player', text: '明天先去红魔馆踩点。顺便「借」两本书。' },
          { who: 'partner', text: '……你就不怕灵梦先一步把异变解决了？' },
          { who: 'player', text: '那更好。省得我动手。' },
          { who: 'narrator', text: '未完的寻宝，未完的春天。下一次，她会走得更远。' },
          { who: 'narrator', text: '—— 未完待续 ——' },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* END 02 · 灵梦 / N·H·L CLEAR（真结局）                              */
  /* ------------------------------------------------------------------ */
  ed2: {
    key: 'ed2',
    code: 'END 02',
    noLabel: '02',
    kindLabel: 'TRUE ENDING',
    char: 'reimu',
    charName: '博丽灵梦',
    title: '四季流转',
    titleCn: '樱花再度盛开',
    en: 'THE SEASONS GO ROUND',
    quote: '「约好了。下次祭典，一起来。」',
    still: 'shrine',
    glow: '255, 112, 130',
    mote: 'petal',
    shots: [
      {
        bg: 'mansion_2',
        cast: [{ key: 'reimu', x: 0.3, h: 500 }, { key: 'flandre', x: 0.72, h: 470, delay: 0.35 }],
        lines: [
          { who: 'narrator', text: '红魔馆地下。最后一块红色结晶在灵梦的符卡下碎开，血月褪回苍白的颜色。' },
          { who: 'narrator', text: '第二天傍晚。红魔馆难得地安静。' },
          { who: 'flandre', text: '呐，灵梦。春天不会停下来了，对吧？' },
          { who: 'player', text: '嗯。已经停下来了。' },
          { who: 'flandre', text: '那……祭典是不是也不会结束？' },
          { who: 'player', text: '祭典会结束。不过——' },
          { who: 'player', text: '下次祭典，我带你一起去。' },
          { who: 'flandre', text: '……！真的？' },
          { who: 'player', text: '我什么时候骗过你。' },
        ],
      },
      {
        bg: 'shrine',
        cast: [{ key: 'reimu', x: 0.28, h: 510 }, { key: 'flandre', x: 0.68, h: 450, delay: 0.3 }],
        lines: [
          { who: 'narrator', text: '三天后的博丽神社。樱花开始落了——像终于想起自己该有的速度。' },
          { who: 'partner', text: '哟。还真带她来了？' },
          { who: 'player', text: '答应过的事。' },
          { who: 'flandre', text: '好多人！灵梦，那边那个会飞的团子是什么？' },
          { who: 'player', text: '……那是妖精。别乱指。' },
          { who: 'narrator', text: '宴会一直开到月亮升起。博丽灵梦坐在廊下，听着吵闹声，难得没有赶人。' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [{ key: 'reimu', x: 0.6, h: 510 }],
        lines: [
          { who: 'narrator', text: '春天结束了。夏天会来，秋天会来，然后又是春天。' },
          { who: 'player', text: '下一次樱花满开的时候，大概也会有麻烦事找上门吧。' },
          { who: 'player', text: '……不过，那样也不坏。' },
          { who: 'narrator', text: '博丽神社的巫女，今天也喝着茶，等着下一个不请自来的春天。' },
          { who: 'narrator', text: '—— 完 ——' },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* END 04 · 魔理沙 / N·H·L CLEAR（真结局）                            */
  /* ------------------------------------------------------------------ */
  ed4: {
    key: 'ed4',
    code: 'END 04',
    noLabel: '04',
    kindLabel: 'TRUE ENDING',
    char: 'marisa',
    charName: '雾雨魔理沙',
    title: '魔女的约定',
    titleCn: '下一次祭典',
    en: "A WITCH'S PROMISE",
    quote: '「说好了，下次带你看更好看的。」',
    still: 'shrine_2',
    glow: '255, 205, 96',
    mote: 'star',
    shots: [
      {
        bg: 'mansion_2',
        cast: [{ key: 'marisa', x: 0.28, h: 500 }, { key: 'flandre', x: 0.72, h: 470, delay: 0.35 }],
        lines: [
          { who: 'narrator', text: '红魔馆地下。最后一块结晶在八卦炉的光里碎开，血月褪回苍白的颜色。' },
          { who: 'player', text: '喂，芙兰。异变结束啦。你姐姐欠我一次人情——所以你也欠我一次。' },
          { who: 'flandre', text: '诶？为什么？' },
          { who: 'player', text: '因为我把你从「永远开着的樱花」里捞出来了呀。' },
          { who: 'flandre', text: '……那，要我怎么还？' },
          { who: 'player', text: '下次祭典，陪我去看烟火。就我们俩。' },
          { who: 'flandre', text: '真的？太好了！' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [{ key: 'marisa', x: 0.3, h: 500 }, { key: 'flandre', x: 0.7, h: 460, delay: 0.3 }],
        lines: [
          { who: 'narrator', text: '三天后，博丽神社的宴会。魔理沙提着一袋从红魔馆「借」来的点心，迟到了整整两个时辰。' },
          { who: 'partner', text: '你又去红魔馆顺东西了？' },
          { who: 'player', text: '这叫战利品。再说，我可是去接人的。' },
          { who: 'flandre', text: '魔理沙！烟火！烟火什么时候放？' },
          { who: 'player', text: '别急别急，先吃团子。' },
        ],
      },
      {
        bg: 'moon_2',
        cast: [{ key: 'marisa', x: 0.3, h: 500 }, { key: 'flandre', x: 0.7, h: 460, delay: 0.3 }],
        lines: [
          { who: 'narrator', text: '烟火升起来的时候，魔理沙想起自己原本只是去寻宝的。' },
          { who: 'flandre', text: '好漂亮……' },
          { who: 'player', text: '对吧？下次还有更好看的。' },
          { who: 'flandre', text: '下次是什么时候？' },
          { who: 'player', text: '等下一个春天结束的时候。' },
          { who: 'narrator', text: '魔女没有说谎。她只是把约定，藏进了下一个春天里。' },
          { who: 'narrator', text: '—— 完 ——' },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* W1 · 灵梦 / EXTRA CLEAR                                             */
  /* ------------------------------------------------------------------ */
  edW1: {
    key: 'edW1',
    code: 'EXTRA · W1',
    noLabel: 'W1',
    kindLabel: 'EXTRA CLEAR ENDING',
    char: 'reimu',
    charName: '博丽灵梦',
    title: '夏祭之约',
    titleCn: '三个人一起',
    en: 'THE SUMMER FESTIVAL PROMISE',
    quote: '「下次祭典——一起。」',
    still: 'shrine_2',
    glow: '255, 120, 132',
    mote: 'ember',
    shots: [
      {
        bg: 'mansion_2',
        cast: [{ key: 'flandre', x: 0.28, h: 470, delay: 0.35 }, { key: 'reimu', x: 0.7, h: 500 }],
        lines: [
          { who: 'narrator', text: 'EXTRA STAGE 结束后的深夜。红魔馆地下，水晶的微光还没熄灭。' },
          { who: 'flandre', text: '我输了。……不过，打得很开心。' },
          { who: 'player', text: '你姐姐要是知道你偷偷跑出来，又要闹了。' },
          { who: 'flandre', text: '所以，灵梦。下次祭典——' },
          { who: 'player', text: '知道了。我会来的。' },
          { who: 'flandre', text: '真的？说好了哦！' },
          { who: 'narrator', text: '地下走廊的灯一盏一盏熄灭，月亮还挂在红魔馆的塔尖上。' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [{ key: 'reimu', x: 0.62, h: 510 }],
        lines: [
          { who: 'narrator', text: '祭典当晚。博丽神社。夏天正在最盛的时候。' },
          { who: 'partner', text: '喂，灵梦。听说你答应带芙兰去祭典？' },
          { who: 'player', text: '嗯。怎么了。' },
          { who: 'partner', text: '没什么——就是有点意外，你居然会答应。' },
          { who: 'player', text: '答应过的事就要做到。' },
          { who: 'narrator', text: '远处传来太鼓声。祭典的灯笼，一盏一盏亮起来。' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [{ key: 'marisa', x: 0.3, h: 490, delay: 0.1 }, { key: 'reimu', x: 0.53, h: 500 }, { key: 'flandre', x: 0.78, h: 445, delay: 0.35 }],
        lines: [
          { who: 'narrator', text: '灵梦站在鸟居下，看着三个影子被灯笼拉得很长。' },
          { who: 'flandre', text: '灵梦！这边这边！' },
          { who: 'player', text: '……来了。' },
          { who: 'narrator', text: '夏天的夜风里，传来一声很轻的笑。' },
          { who: 'narrator', text: '—— EXTRA CLEAR · W1 ——' },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* W2 · 魔理沙 / EXTRA CLEAR                                           */
  /* ------------------------------------------------------------------ */
  edW2: {
    key: 'edW2',
    code: 'EXTRA · W2',
    noLabel: 'W2',
    kindLabel: 'EXTRA CLEAR ENDING',
    char: 'marisa',
    charName: '雾雨魔理沙',
    title: '星之祭典',
    titleCn: '更高更远的地方',
    en: 'FESTIVAL OF STARS',
    quote: '「下次，带你去更高更远的地方。」',
    still: 'moon_2',
    glow: '255, 205, 96',
    mote: 'star',
    shots: [
      {
        bg: 'mansion_2',
        cast: [{ key: 'marisa', x: 0.3, h: 500 }, { key: 'flandre', x: 0.72, h: 460, delay: 0.35 }],
        lines: [
          { who: 'narrator', text: 'EXTRA STAGE 的最后一击落下时，红魔馆塔尖上的月亮正好从云后露出来。' },
          { who: 'flandre', text: '我输了……不过，好开心。' },
          { who: 'player', text: '哈哈！那当然，也不看看对手是谁。' },
          { who: 'flandre', text: '魔理沙，你说的「祭典」——真的会带我去吗？' },
          { who: 'player', text: '本魔法使说话算话。' },
        ],
      },
      {
        bg: 'forest_2',
        cast: [{ key: 'marisa', x: 0.32, h: 500 }, { key: 'flandre', x: 0.7, h: 460, delay: 0.3 }],
        lines: [
          { who: 'narrator', text: '三个月后的夜晚，魔法森林。扫帚上坐着两个人，飞得比任何一次都慢。' },
          { who: 'flandre', text: '星星好近。' },
          { who: 'player', text: '别伸手，会掉下去的。' },
          { who: 'flandre', text: '掉下去的话，你会接住我吗？' },
          { who: 'player', text: '……会啦。坐稳。' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [{ key: 'marisa', x: 0.3, h: 500 }, { key: 'flandre', x: 0.7, h: 455, delay: 0.3 }],
        lines: [
          { who: 'narrator', text: '博丽神社的祭典灯火，从森林上方看下去，像撒了一地的星星。' },
          { who: 'flandre', text: '那就是祭典？' },
          { who: 'player', text: '嗯。下次，带你下去逛。' },
          { who: 'flandre', text: '下次是什么时候？' },
          { who: 'player', text: '就现在——抓紧了！' },
          { who: 'narrator', text: '扫帚划出一道银线，冲进灯火里。这个夏天，才刚刚开始。' },
          { who: 'narrator', text: '—— EXTRA CLEAR · W2 ——' },
        ],
      },
    ],
  },
};

/**
 * 根据角色与通关模式选结局。
 * @param {'reimu'|'marisa'} char
 * @param {'easy'|'main'|'extra'} mode  easy=E 难度普通流程；main=N/H/L 流程；extra=EX 胜利
 * @returns {object|null} ENDINGS 中的一项；未知组合返回 null（EX 失败由调用方处理，不进入此函数）
 */
export function endingFor(char, mode) {
  const reimu = char === 'reimu';
  if (mode === 'extra') return reimu ? ENDINGS.edW1 : ENDINGS.edW2;
  if (mode === 'easy') return reimu ? ENDINGS.ed1 : ENDINGS.ed3;
  if (mode === 'main') return reimu ? ENDINGS.ed2 : ENDINGS.ed4;
  return null;
}
