/**
 * 结局演出脚本。
 *
 * 六份结局：
 *   ed1  灵梦 · 坏结局（REGRET ENDING）—— E 难度任意通关，或 N/H/L 续命通关
 *   ed2  灵梦 · 好结局（TRUE ENDING） —— N/H/L 不续命通关
 *   ed3  魔理沙 · 坏结局（REGRET ENDING）—— E 难度任意通关，或 N/H/L 续命通关
 *   ed4  魔理沙 · 好结局（TRUE ENDING） —— N/H/L 不续命通关
 *   edW1 灵梦 · Extra 结局（W ENDING） —— 灵梦通关 Extra
 *   edW2 魔理沙 · Extra 结局（W ENDING） —— 魔理沙通关 Extra
 *
 * 主题只有一个词：遗憾。
 * 坏结局不是“失败”，而是“做对了事，却错过了人”。
 */
export const ENDINGS = {
  /* ================================================================
     灵梦 · 坏结局
     ================================================================ */
  ed1: {
    key: 'ed1',
    char: 'reimu',
    charName: '博丽灵梦',
    code: 'ENDING 01',
    noLabel: 'END 01',
    kindLabel: 'REGRET ENDING',
    title: '不落之春',
    titleCn: '不落之春',
    en: 'The Spring That Never Fell',
    quote: '「我结束了异变。只是没有结束任何人的等待。」',
    still: 'shrine_2',
    glow: '120,150,190',
    mote: 'petals',
    shots: [
      {
        bg: 'shrine_2',
        cast: [{ key: 'reimu', x: 0.5, h: 470 }],
        lines: [
          { who: 'narrator', text: '春天在第七十天结束了。' },
          { who: 'narrator', text: '所有的花瓣同时落下，像一场迟到了太久的道歉。' },
          { who: 'player', text: '……结束了。' },
          { who: 'narrator', text: '博丽神社的樱，一夜落尽。扫帚靠在廊下，没有人去拿。' },
          { who: 'partner', text: '红魔馆那边，你去过了？' },
          { who: 'player', text: '去了。门开着。' },
          { who: 'partner', text: '你没进去？' },
          { who: 'player', text: '……在门口站了一会儿。' },
          { who: 'partner', text: '然后呢？' },
          { who: 'player', text: '回来了。' },
          { who: 'partner', text: '……那孩子呢？' },
          { who: 'player', text: '谁？' },
          { who: 'narrator', text: '灵梦张了张嘴。她忽然发现，自己连那个名字都没有问过。' },
        ],
      },
      {
        bg: 'mansion_2',
        cast: [
          { key: 'reimu', x: 0.3, h: 470 },
          { key: 'remilia', x: 0.7, h: 500, delay: 0.4 },
        ],
        lines: [
          { who: 'narrator', text: '后来她又去了一趟红魔馆。名义上是还书——魔理沙借的，逾期三个月。' },
          { who: 'remilia', text: '巫女。妹妹问起过你。' },
          { who: 'player', text: '问什么。' },
          { who: 'remilia', text: '问，祭典是不是明年还有。' },
          { who: 'player', text: '……你怎么说。' },
          { who: 'remilia', text: '我说有。' },
          { who: 'remilia', text: '她就不问了。' },
          { who: 'player', text: '那她现在……' },
          { who: 'remilia', text: '睡了。四百九十五年，她最会的是等。现在多了一样：睡。' },
          { who: 'player', text: '她叫什么。' },
          { who: 'remilia', text: '芙兰朵露。' },
          { who: 'player', text: '……芙兰朵露。' },
          { who: 'player', text: '……' },
          { who: 'narrator', text: '灵梦低头看了看手里。那根苹果糖已经化了一半，糖浆顺着纸棒，一滴一滴往下淌。' },
          { who: 'player', text: '（我把春天还给了幻想乡。可是她的春天，我没能还回去。）' },
        ],
      },
      {
        bg: 'shrine',
        cast: [{ key: 'reimu', x: 0.44, h: 460 }],
        lines: [
          { who: 'narrator', text: '那年夏天来得非常准时。西瓜很甜，冰很凉，蝉叫得让人心烦。' },
          { who: 'narrator', text: '神社的赛钱箱里，多了一颗蓝色的、不会融化的糖。' },
          { who: 'player', text: '……谁放的。' },
          { who: 'partner', text: '不知道。反正不是我。' },
          { who: 'player', text: '我记住了。只是叫得太晚了。' },
          { who: 'narrator', text: '风穿过空荡荡的走廊。灵梦没有回头。' },
          { who: 'player', text: '明年。去敲一次门吧。' },
          { who: 'narrator', text: '她说完，把糖放进口袋里。糖很凉，凉得像一句没来得及说的对不起。' },
        ],
      },
    ],
  },

  /* ================================================================
     灵梦 · 好结局
     ================================================================ */
  ed2: {
    key: 'ed2',
    char: 'reimu',
    charName: '博丽灵梦',
    code: 'ENDING 02',
    noLabel: 'END 02',
    kindLabel: 'TRUE ENDING',
    title: '春之尽头',
    titleCn: '春之尽头',
    en: 'At the End of Spring',
    quote: '「原来结束不是把门关上。是替谁把门留着。」',
    still: 'shrine_2',
    glow: '255,170,120',
    mote: 'ember',
    shots: [
      {
        bg: 'mansion_2',
        cast: [
          { key: 'reimu', x: 0.32, h: 480 },
          { key: 'flandre', x: 0.66, h: 440, delay: 0.5 },
        ],
        lines: [
          { who: 'narrator', text: '地下室的尽头，水晶树亮得像一场不肯醒的梦。树下坐着一个抱膝的女孩。' },
          { who: 'flandre', text: '你来了。你是来结束这场祭典的吗？' },
          { who: 'player', text: '我是来问你，祭典还去不去。' },
          { who: 'flandre', text: '……祭典？' },
          { who: 'player', text: '苹果糖、捞金鱼、太鼓、烟火。一年一次，会结束的那种。' },
          { who: 'flandre', text: '会结束的……祭典？' },
          { who: 'player', text: '嗯。正因为会结束，所以才要现在去。' },
          { who: 'flandre', text: '可是，结束了，我会难过的。' },
          { who: 'player', text: '会难过。然后明年还会再来。' },
          { who: 'flandre', text: '明年？' },
          { who: 'player', text: '我保证。' },
          { who: 'narrator', text: '芙兰朵露看着自己的手。那双手能捏碎任何东西，却不知道该往哪儿放。' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [
          { key: 'reimu', x: 0.18, h: 470 },
          { key: 'flandre', x: 0.5, h: 430, delay: 0.35 },
          { key: 'marisa', x: 0.82, h: 470, delay: 0.7 },
        ],
        lines: [
          { who: 'narrator', text: '那天晚上，博丽神社的灯全亮了。灯笼一直挂到山下。' },
          { who: 'flandre', text: '好多人……好吵。好亮。' },
          { who: 'player', text: '吵就对了。祭典不吵，叫什么祭典。' },
          { who: 'marisa', text: '喂，芙兰！尝尝这个——苹果糖，我捞金鱼赢的。' },
          { who: 'flandre', text: '……好甜。' },
          { who: 'narrator', text: '她咬了一口，忽然哭了。眼泪掉在糖上，她慌忙去擦。' },
          { who: 'flandre', text: '对不起，我不是难过。我只是……第一次吃到。' },
          { who: 'player', text: '那就多吃点。反正明年还有。' },
          { who: 'flandre', text: '明年……还有？' },
          { who: 'player', text: '有。我保证。' },
          { who: 'narrator', text: '灵梦说完，自己愣了一下。她好像很久没有对谁保证过“明年”了。' },
        ],
      },
      {
        bg: 'shrine',
        cast: [
          { key: 'reimu', x: 0.34, h: 470 },
          { key: 'marisa', x: 0.68, h: 470, delay: 0.4 },
        ],
        lines: [
          { who: 'narrator', text: '祭典结束的时候，天快亮了。灯笼一盏一盏灭下去。' },
          { who: 'partner', text: '你今天什么都没结束。' },
          { who: 'player', text: '嗯。' },
          { who: 'partner', text: '连异变都没提。' },
          { who: 'player', text: '异变已经结束了。在她咬下第一口苹果糖的时候。' },
          { who: 'partner', text: '……你这个人，偶尔也能说句好听的话。' },
          { who: 'player', text: '别习惯。明年不一定。' },
          { who: 'narrator', text: '灵梦把最后一盏灯笼摘下来，抱在怀里。明年还要挂上去。' },
          { who: 'player', text: '（这次，我记住名字了。）' },
        ],
      },
    ],
  },

  /* ================================================================
     魔理沙 · 坏结局
     ================================================================ */
  ed3: {
    key: 'ed3',
    char: 'marisa',
    charName: '雾雨魔理沙',
    code: 'ENDING 03',
    noLabel: 'END 03',
    kindLabel: 'REGRET ENDING',
    title: '借来的春天',
    titleCn: '借来的春天',
    en: 'A Spring That Was Only Borrowed',
    quote: '「我借来了春天，却不知道该还给谁。」',
    still: 'forest_2',
    glow: '170,140,90',
    mote: 'petals',
    shots: [
      {
        bg: 'forest_2',
        cast: [{ key: 'marisa', x: 0.5, h: 470 }],
        lines: [
          { who: 'narrator', text: '春天结束了。魔法森林的雾一夜散尽，像谁终于松开了手。' },
          { who: 'player', text: '结束了。收工。' },
          { who: 'narrator', text: '她把战利品一件件摆回柜子：冻住的花瓣、不会化的冰、从湖底敲下来的红结晶。' },
          { who: 'partner', text: '那个小女孩呢？' },
          { who: 'player', text: '谁？' },
          { who: 'partner', text: '红魔馆的妹妹。你不是去过了吗。' },
          { who: 'player', text: '……我没进去。' },
          { who: 'partner', text: '为什么。' },
          { who: 'player', text: '门锁着。' },
          { who: 'partner', text: '你骗谁呢。' },
          { who: 'player', text: '……骗我自己。' },
          { who: 'narrator', text: '她把那颗蓝色的星从帽子里摸出来，看了很久，又放了回去。' },
        ],
      },
      {
        bg: 'mansion_2',
        cast: [
          { key: 'marisa', x: 0.3, h: 470 },
          { key: 'remilia', x: 0.7, h: 500, delay: 0.4 },
        ],
        lines: [
          { who: 'narrator', text: '三个月后，魔理沙去红魔馆还书。名义上是还书，其实是去还一句“下次”。' },
          { who: 'remilia', text: '妹妹问，那个黑白魔法使还会来吗。' },
          { who: 'player', text: '会啊。下次带礼物。' },
          { who: 'remilia', text: '她问的不是礼物。' },
          { who: 'player', text: '那问什么。' },
          { who: 'remilia', text: '问你还会不会来。' },
          { who: 'player', text: '……' },
          { who: 'remilia', text: '我说会。她笑了。她笑起来，像很久没笑过。' },
          { who: 'player', text: '你骗她。' },
          { who: 'remilia', text: '你也骗她。你说了“下次”。' },
          { who: 'player', text: '下次又不是不来。' },
          { who: 'remilia', text: '下次是什么时候？' },
          { who: 'player', text: '……' },
          { who: 'narrator', text: '魔理沙没答上来。雷米莉亚也没再问，只把门留在了那里。' },
          { who: 'narrator', text: '走的时候，帽子里那颗星硌得她额头生疼。' },
        ],
      },
      {
        bg: 'forest',
        cast: [{ key: 'marisa', x: 0.42, h: 470 }],
        lines: [
          { who: 'narrator', text: '那天晚上，她把蓝色的星放在窗台上，旁边是那颗冻住的花瓣。' },
          { who: 'player', text: '本来想送人的。' },
          { who: 'partner', text: '送啊。' },
          { who: 'player', text: '不知道送谁了。' },
          { who: 'narrator', text: '星星亮了一整夜。第二天早上，她把窗关上了。' },
          { who: 'player', text: '……下次吧。下次一定。' },
          { who: 'partner', text: '你每次都说下次。' },
          { who: 'player', text: '所以下次才一定会来。' },
          { who: 'narrator', text: '她把那颗星重新塞回帽子最深处。帽子很轻，她却觉得头有点沉。' },
        ],
      },
    ],
  },

  /* ================================================================
     魔理沙 · 好结局
     ================================================================ */
  ed4: {
    key: 'ed4',
    char: 'marisa',
    charName: '雾雨魔理沙',
    code: 'ENDING 04',
    noLabel: 'END 04',
    kindLabel: 'TRUE ENDING',
    title: '还给春天的东西',
    titleCn: '还给春天的东西',
    en: 'What Was Returned to Spring',
    quote: '「这一次，我没有借。我把春天，还给了它一直在等的人。」',
    still: 'mansion_2',
    glow: '255,205,125',
    mote: 'star',
    shots: [
      {
        bg: 'mansion_2',
        cast: [
          { key: 'marisa', x: 0.34, h: 470 },
          { key: 'flandre', x: 0.66, h: 440, delay: 0.45 },
        ],
        lines: [
          { who: 'narrator', text: '地下室很暗，只有水晶树的光。魔理沙把手伸进帽子，摸到那颗一直没送出去的星，捏了捏，又放了回去。' },
          { who: 'flandre', text: '你要什么？我这里没有值钱的东西。' },
          { who: 'player', text: '我知道。我不是来要东西的。' },
          { who: 'flandre', text: '那你是来做什么的？' },
          { who: 'player', text: '来带你出去。今天有祭典。' },
          { who: 'flandre', text: '出去……？' },
          { who: 'player', text: '嗯。礼物先欠着。等我想好，再送你。' },
          { who: 'narrator', text: '她伸出手。芙兰朵露看着那只手，像看着一扇从没打开过的门。' },
          { who: 'flandre', text: '欠着……可以吗？' },
          { who: 'player', text: '可以。欠着，就还有下一次。' },
          { who: 'narrator', text: '地下室的门口，月光漏进来。魔理沙先走了出去，回头等她。' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [
          { key: 'flandre', x: 0.28, h: 430 },
          { key: 'marisa', x: 0.55, h: 470, delay: 0.4 },
          { key: 'remilia', x: 0.82, h: 490, delay: 0.75 },
        ],
        lines: [
          { who: 'narrator', text: '祭典那晚，芙兰朵露一直攥着魔理沙的袖子。攥得太紧，指节都发白。' },
          { who: 'remilia', text: '妹妹。别把人家袖子扯坏了。' },
          { who: 'flandre', text: '我没有！我只是……怕走丢。' },
          { who: 'player', text: '走丢了就找。反正我认得路。' },
          { who: 'flandre', text: '那……明年还有吗？' },
          { who: 'player', text: '有。' },
          { who: 'narrator', text: '魔理沙答得很快。快得连自己都愣了一下。' },
          { who: 'remilia', text: '魔理沙。谢谢你。' },
          { who: 'player', text: '别谢。谢了就要还人情。我可还不起。' },
          { who: 'narrator', text: '她说完，自己先笑了。笑声混进太鼓声里，很快就听不见了。' },
        ],
      },
      {
        bg: 'forest_2',
        cast: [{ key: 'marisa', x: 0.4, h: 470 }],
        lines: [
          { who: 'narrator', text: '第二天早上，魔法森林。架子上还摆着那颗蓝色的星，旁边多了一颗从祭典捞回来的金鱼糖。' },
          { who: 'partner', text: '没送出去？' },
          { who: 'player', text: '嗯。欠着。' },
          { who: 'partner', text: '你以前只借不还。' },
          { who: 'player', text: '……这次不一样。' },
          { who: 'partner', text: '哪不一样？' },
          { who: 'player', text: '这次是我自己想还。' },
          { who: 'narrator', text: '她把星往帽子深处塞了塞。窗外，春天已经来了。' },
          { who: 'player', text: '（明年。送她一颗真的星。）' },
          { who: 'narrator', text: '这是她第一次想“明年”这个词，而不是“下次去借”。' },
        ],
      },
    ],
  },

  /* ================================================================
     灵梦 · Extra 结局
     ================================================================ */
  edW1: {
    key: 'edW1',
    char: 'reimu',
    charName: '博丽灵梦',
    code: 'EXTRA ENDING · W1',
    noLabel: 'W1',
    kindLabel: 'W ENDING',
    title: '迟到的祭典',
    titleCn: '迟到的祭典',
    en: 'A Festival, Four Hundred Ninety-Five Years Late',
    quote: '「四百九十五年很长。可是今晚的灯，是替她亮的。」',
    still: 'shrine_2',
    glow: '255,160,175',
    mote: 'ember',
    shots: [
      {
        bg: 'mansion_2',
        cast: [
          { key: 'remilia', x: 0.24, h: 490 },
          { key: 'flandre', x: 0.5, h: 430, delay: 0.4 },
          { key: 'reimu', x: 0.78, h: 470, delay: 0.75 },
        ],
        lines: [
          { who: 'narrator', text: '弹幕散尽，红魔馆的茶已经凉了。雷米莉亚重新沏了一壶，甜得发腻。' },
          { who: 'remilia', text: '巫女。妹妹就交给你了。弄哭她，我把你关地下室。' },
          { who: 'player', text: '她自己会哭。不用我弄。' },
          { who: 'flandre', text: '我、我不会哭的！' },
          { who: 'remilia', text: '那就好。去吧。别太晚回来。' },
          { who: 'narrator', text: '芙兰朵露站在门口，第一次没有回头看她姐姐。' },
          { who: 'remilia', text: '……路上小心。' },
          { who: 'narrator', text: '声音很轻，轻得像怕被谁听见。' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [
          { key: 'flandre', x: 0.3, h: 430 },
          { key: 'reimu', x: 0.55, h: 470, delay: 0.35 },
          { key: 'marisa', x: 0.8, h: 470, delay: 0.7 },
        ],
        lines: [
          { who: 'narrator', text: '博丽神社的祭典，比往年多了一盏灯。挂在最高的地方，给走得最慢的人照路。' },
          { who: 'flandre', text: '灵梦，那个是什么？' },
          { who: 'player', text: '捞金鱼。捞不到别哭。' },
          { who: 'flandre', text: '我不哭！……哇，它跑了。' },
          { who: 'marisa', text: '哈哈，笨蛋。看我的——哎，我的也跑了。' },
          { who: 'flandre', text: '你也是笨蛋。' },
          { who: 'marisa', text: '你说什么？！' },
          { who: 'narrator', text: '三个人在摊子前笑成一团。灵梦站在旁边，忽然觉得，这样也不错。' },
          { who: 'player', text: '（原来祭典不是非得我一个人收尾。）' },
        ],
      },
      {
        bg: 'shrine',
        cast: [
          { key: 'flandre', x: 0.36, h: 430 },
          { key: 'remilia', x: 0.64, h: 480, delay: 0.4 },
        ],
        lines: [
          { who: 'narrator', text: '天快亮的时候，芙兰朵露靠在她姐姐肩上睡着了。手里还攥着装金鱼的袋子。' },
          { who: 'remilia', text: '四百九十五年。她第一次在外面睡着。' },
          { who: 'player', text: '以后会习惯的。' },
          { who: 'remilia', text: '巫女。你明年还会办祭典吗？' },
          { who: 'player', text: '会。' },
          { who: 'remilia', text: '会结束吗？' },
          { who: 'player', text: '会。然后明年再来。' },
          { who: 'remilia', text: '……那就好。' },
          { who: 'narrator', text: '灵梦把外衣披在芙兰朵露身上。这一次，她没有急着结束什么。' },
          { who: 'player', text: '（明年。我还会记得。）' },
        ],
      },
    ],
  },

  /* ================================================================
     魔理沙 · Extra 结局
     ================================================================ */
  edW2: {
    key: 'edW2',
    char: 'marisa',
    charName: '雾雨魔理沙',
    code: 'EXTRA ENDING · W2',
    noLabel: 'W2',
    kindLabel: 'W ENDING',
    title: '第一次送人的宝贝',
    titleCn: '第一次送人的宝贝',
    en: 'The First Treasure I Ever Gave Away',
    quote: '「送出去的东西，才是最好的收藏。」',
    still: 'forest_2',
    glow: '255,210,140',
    mote: 'star',
    shots: [
      {
        bg: 'mansion_2',
        cast: [
          { key: 'flandre', x: 0.32, h: 430 },
          { key: 'marisa', x: 0.68, h: 470, delay: 0.4 },
        ],
        lines: [
          { who: 'narrator', text: '弹幕散尽，水晶树的光落回地上。芙兰朵露坐在地上，翅膀还在轻轻发抖。' },
          { who: 'narrator', text: '魔理沙走过去，从帽子里摸出一样东西——不是符卡。' },
          { who: 'flandre', text: '……这是什么？' },
          { who: 'player', text: '送你。' },
          { who: 'flandre', text: '为什么？' },
          { who: 'player', text: '因为我想看看，它照在别人手里是什么样子。' },
          { who: 'narrator', text: '芙兰朵露接过星星。光从她指缝漏出来，把整间地下室照亮了一瞬。' },
          { who: 'flandre', text: '好漂亮。你一直带着它？' },
          { who: 'player', text: '嗯。一直没送出去。' },
          { who: 'flandre', text: '那为什么现在送？' },
          { who: 'player', text: '因为再放下去，就真的只是一件收藏了。' },
        ],
      },
      {
        bg: 'shrine_2',
        cast: [
          { key: 'flandre', x: 0.28, h: 430 },
          { key: 'marisa', x: 0.54, h: 470, delay: 0.35 },
          { key: 'remilia', x: 0.8, h: 490, delay: 0.7 },
        ],
        lines: [
          { who: 'narrator', text: '祭典上，芙兰朵露把星星举过头顶。灯笼的光和星光混在一起，照得她满脸都是亮的。' },
          { who: 'flandre', text: '魔理沙！你看！它比灯笼还亮！' },
          { who: 'player', text: '那当然。本魔法使的收藏，没有次品。' },
          { who: 'remilia', text: '你送出去的东西，还好意思叫收藏？' },
          { who: 'player', text: '送出去的，才是最好的收藏。' },
          { who: 'remilia', text: '……你这个人，偶尔也能说句像样的话。' },
          { who: 'narrator', text: '魔理沙别过脸，假装在看捞金鱼的摊子。' },
          { who: 'flandre', text: '魔理沙，明年还有吗？' },
          { who: 'player', text: '有。明年我再找一颗。' },
          { who: 'flandre', text: '那这颗呢？' },
          { who: 'player', text: '这颗是你的。不用还。' },
        ],
      },
      {
        bg: 'forest_2',
        cast: [{ key: 'marisa', x: 0.4, h: 470 }],
        lines: [
          { who: 'narrator', text: '第二天，魔法森林。架子上空了一块。魔理沙拿抹布擦了擦那圈灰，没放新东西上去。' },
          { who: 'partner', text: '空着不难受？' },
          { who: 'player', text: '难受。可是空着，才记得住送给了谁。' },
          { who: 'partner', text: '那明年呢？' },
          { who: 'player', text: '明年再找一颗。' },
          { who: 'partner', text: '然后呢？' },
          { who: 'player', text: '然后……再送出去。' },
          { who: 'narrator', text: '她说完，自己先笑了。窗外，春天已经来了。' },
          { who: 'player', text: '（原来送东西，比借东西开心。）' },
        ],
      },
    ],
  },
};

/**
 * 按主角与结局类型取剧本。
 * @param {'reimu'|'marisa'} char
 * @param {'bad'|'good'|'extra'} mode  兼容旧值 'easy'→bad、'main'→good
 */
export function endingFor(char, mode) {
  const route = char === 'marisa' ? 'marisa' : 'reimu';
  if (mode === 'extra') return route === 'marisa' ? ENDINGS.edW2 : ENDINGS.edW1;
  const good = mode === 'good' || mode === 'main';
  if (route === 'marisa') return good ? ENDINGS.ed4 : ENDINGS.ed3;
  return good ? ENDINGS.ed2 : ENDINGS.ed1;
}
