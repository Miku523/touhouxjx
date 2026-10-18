/**
 * 剧情剧本：《东方新纪行 ～ Chronicle of Gensokyo》——「四季不返异变」
 *
 * 结构约定：
 *   who: 'player' 表示当前操作的主角（灵梦或魔理沙），由对话系统替换
 *        'narrator' 为旁白（不显示立绘）
 *        其余为角色 key，见 dialogue.js 的 CHAR_NAMES
 *   mood: 'normal' | 'smile' | 'angry' | 'sad' | 'smug' | 'panic'
 *
 * 剧情主线：芙兰朵露被关在红魔馆地下，愿望是「永不结束的祭典」。
 * 她无意识地用「破坏一切」之力冻结了四季流转，于是幻想乡出现六处地脉异常。
 * 每一关的 Boss 都不是元凶，只是一层层把线索推向红魔馆。
 */

export const STORY = {
  /* ---------------- 开场 ---------------- */
  opening: [
    { who: 'narrator', text: '幻想乡的春天，本该在三月末就结束。' },
    { who: 'narrator', text: '可博丽神社的樱，已经开了一个月，一片花瓣也没有落下。' },
    { who: 'player', text: '……啊，好闲。' },
    { who: 'player', text: '这个季节本该有点变化才对。结果什么都没发生，连时间都像停住了。' },
    { who: 'partner', text: '喂——！出大事了啦！' },
    { who: 'player', text: '{partner}？跑这么急，又是捡到什么奇怪的东西了？', mood: 'smug' },
    { who: 'partner', text: '雾之湖整片冻成镜子了。这个季节结冰哦？连青蛙都冻在里头了。' },
    { who: 'partner', text: '而且魔法森林的雾，一个月都没散。萤火虫不睡，我也不用睡了。' },
    { who: 'player', text: '……', mood: 'normal' },
    { who: 'player', text: '（樱不落、雾不散、湖骤冻。这不是天气。是有什么东西，把「结束」按住了。）' },
    { who: 'partner', text: '这是异变吧？异变就有好东西可以捡吧？' },
    { who: 'player', text: '你是来解决异变的，还是来捡破烂的。' },
    { who: 'player', text: '……算了。总比在这儿待着发霉强，就当出门走走。' },
    { who: 'partner', text: '这才像你！那先从那片一直不落的樱花开始吧！' },
  ],

  /* ---------------- 各关 ---------------- */
  stages: {
    stage1: {
      intro: [
        { who: 'narrator', text: '博丽神社 · 境内。黄昏已经持续了很多天。' },
        { who: 'player', text: '天一直是这个颜色。落到一半，就不肯再暗下去了。' },
        { who: 'partner', text: '哎，前面有个小妖怪在晃。欸，是露米娅吧？' },
      ],
      preBoss: [
        { who: 'rumia', text: '……唔？有人来了。' },
        { who: 'rumia', text: '是天黑了吗？好久好久都没有天黑了，我都不知道要睡到什么时候。' },
        { who: 'player', text: '你不知道为什么天不黑？' },
        { who: 'rumia', text: '不知道呀。我只知道，好像有谁在很远的地方，一直说着「不要结束、不要结束」。' },
        { who: 'rumia', text: '所以大家都不敢结束。天也不敢。' },
        { who: 'player', text: '「不要结束」……' },
        { who: 'rumia', text: '你不信的话，就来试试看吧。反正我很闲。' },
      ],
      postBoss: [
        { who: 'rumia', text: '呜……好痛。你干嘛啦。' },
        { who: 'player', text: '「不要结束」的声音，是从哪个方向来的？' },
        { who: 'rumia', text: '唔……听不太清。好像是从很高的地方，又好像是从很低的地方。' },
        { who: 'rumia', text: '啊，对了。森林那边，雾一直不散。虫子们都在叫。' },
        { who: 'partner', text: '虫子啊……那应该是莉格露那边。去看看？' },
        { who: 'player', text: '嗯。总比在这儿发霉强。' },
      ],
    },

    stage2: {
      intro: [
        { who: 'narrator', text: '魔法森林 · 夜雾。萤火浮在半透明的雾里，一动不动。' },
        { who: 'partner', text: '这雾不对劲。平时早就散了。' },
        { who: 'player', text: '连萤火虫都不飞。它们也怕「结束」吗。' },
      ],
      preBoss: [
        { who: 'wriggle', text: '站住。前面是虫子的地盘。' },
        { who: 'wriggle', text: '雾不散，虫子们就不肯回巢。它们睡不着，我也睡不着。' },
        { who: 'player', text: '你知道雾为什么不散？' },
        { who: 'wriggle', text: '知道。因为「夜」不肯结束。' },
        { who: 'wriggle', text: '我只是在守着，不让谁去打扰那位大人——虽然我也不知道是谁。' },
        { who: 'partner', text: '不知道是谁还守着？你这虫子真是死脑筋。' },
        { who: 'wriggle', text: '死脑筋才好。反正我不让路。' },
      ],
      postBoss: [
        { who: 'wriggle', text: '……输了。你们要过去就过去吧。' },
        { who: 'wriggle', text: '不过我告诉你们一件事。雾是从湖那边飘过来的。而且是冻着的雾。' },
        { who: 'player', text: '冻着的雾。' },
        { who: 'wriggle', text: '对。湖面结冰了，可是冰不是从水面结的，是从湖底开始往上结的。' },
        { who: 'partner', text: '从湖底……那得去看看。琪露诺那家伙应该就在附近。' },
      ],
    },

    stage3: {
      intro: [
        { who: 'narrator', text: '雾之湖 · 冰蓝。整片湖面是一块完整的冰，冻着无数没来得及落下的花瓣。' },
        { who: 'partner', text: '哇，真的冻住了。而且冰里头有红色的东西在闪。' },
        { who: 'player', text: '像是……水晶？' },
      ],
      preBoss: [
        { who: 'cirno', text: '哼哼哼——终于有人来见识我的厉害了！' },
        { who: 'cirno', text: '这片冰是不是很美？我做的！……大概！' },
        { who: 'player', text: '「大概」是什么意思。', mood: 'smug' },
        { who: 'cirno', text: '就是……就是那个啦！总之我很厉害！最强！' },
        { who: 'partner', text: '冰里头那些红色结晶，也是你弄的？' },
        { who: 'cirno', text: '那个……不是我。' },
        { who: 'cirno', text: '我试过把它敲掉，敲不动。所以我只能装作是我做的。……不许笑！' },
      ],
      postBoss: [
        { who: 'cirno', text: '呜……你们、你们等着，我可是最强的……' },
        { who: 'player', text: '红色结晶，真的不是你？' },
        { who: 'cirno', text: '不是！冰是我冻的，但里头那个是别的东西冻住了我的冰。' },
        { who: 'cirno', text: '那东西从湖底长出来，一直往上冒。像要长到天上去。' },
        { who: 'player', text: '地脉。有东西在从地脉往上吸。' },
        { who: 'partner', text: '那山那边呢？风都停了，文那家伙肯定憋坏了。' },
      ],
    },

    stage4: {
      intro: [
        { who: 'narrator', text: '妖怪之山 · 溪谷。瀑布垂在半空，水珠悬着不落。' },
        { who: 'player', text: '连水都停住了。' },
        { who: 'partner', text: '有人影！举着相机那个，是文吧？' },
      ],
      preBoss: [
        { who: 'aya', text: '——拍到了！真是极好的素材，{me}亲自出马。' },
        { who: 'aya', text: '标题就叫《山风停歇之谜，巫女紧急出动》。你看，多有卖点。' },
        { who: 'player', text: '你先别忙着写稿。风为什么停了？' },
        { who: 'aya', text: '这才是重点。风停了，我的报纸就送不出去，也飞不进新素材。' },
        { who: 'aya', text: '所以我要拍下真相。而真相，就在你们要去的方向。' },
        { who: 'partner', text: '那我们是一路的？' },
        { who: 'aya', text: '不。我要拍的是「巫女解决异变」的独家，所以得先让你们打起来。' },
        { who: 'aya', text: '抱歉了，这是记者的职业操守。' },
      ],
      postBoss: [
        { who: 'aya', text: '……唔，镜头盖被吹跑了。真是失策。' },
        { who: 'player', text: '风停了，你怎么还这么能跑。' },
        { who: 'aya', text: '这就是天狗的脚力。不过说正事——我沿着地脉飞了一整圈。' },
        { who: 'aya', text: '六处异常，全都指向同一个方向：红魔馆的地底。' },
        { who: 'aya', text: '而且那里的月亮，红得不正常。' },
        { who: 'partner', text: '红魔馆地下……那不是关着那位妹妹的地方吗。' },
      ],
    },

    stage5: {
      intro: [
        { who: 'narrator', text: '白玉楼 · 花海。彼岸花开得极盛，一朵也没有凋。' },
        { who: 'player', text: '花不谢。这片花海，本该是给亡灵送行的。' },
        { who: 'partner', text: '不谢的话，亡灵就送不走了吧？' },
      ],
      preBoss: [
        { who: 'yuyuko', text: '哎呀，是{me}，还有旁边那位。' },
        { who: 'yuyuko', text: '来得正好呢。这花海开了一个月，我连赏花的兴致都没有了。' },
        { who: 'player', text: '开得太久，反而没意思？' },
        { who: 'yuyuko', text: '是呀。盛开的东西，就该凋谢才对。' },
        { who: 'yuyuko', text: '「永远」这种东西，最没有品味了。' },
        { who: 'player', text: '那你知道是谁在许这个愿吗？' },
        { who: 'yuyuko', text: '知道哦。不过我不打算直接告诉你。' },
        { who: 'yuyuko', text: '先陪我玩一局吧。赢了，我就说。' },
      ],
      postBoss: [
        { who: 'yuyuko', text: '啊啦，输了呢。真扫兴，不过也真痛快。' },
        { who: 'player', text: '说吧。' },
        { who: 'yuyuko', text: '是一个愿望。一个很小、很小孩的愿望——「祭典不要结束」。' },
        { who: 'yuyuko', text: '可许愿的人，拥有把愿望变成现实的力量。而且是那种，不管别人愿不愿意的力量。' },
        { who: 'partner', text: '……红魔馆的妹妹。' },
        { who: 'yuyuko', text: '谁知道呢。反正，月相乱掉的那边，会有人更清楚。' },
      ],
    },

    stage6: {
      intro: [
        { who: 'narrator', text: '月都 · 永远亭。月亮停在地平线上，盈亏都不再变化。' },
        { who: 'player', text: '月相停了。' },
        { who: 'partner', text: '月亮的圆缺是「永远」里最该变的东西吧。' },
      ],
      preBoss: [
        { who: 'kaguya', text: '……又是你们。真吵。' },
        { who: 'player', text: '月相为什么停了？' },
        { who: 'kaguya', text: '因为有人希望它别变。' },
        { who: 'kaguya', text: '永远与须臾——我比谁都懂这两个词。' },
        { who: 'kaguya', text: '「永远」是囚笼。把人关在一个再也不会结束的瞬间里。' },
        { who: 'player', text: '那你为什么不阻止？' },
        { who: 'kaguya', text: '因为不关我的事。而且——能许下这种愿望的人，很可怜吧。' },
        { who: 'kaguya', text: '可怜到，我想看看她最后会变成什么样。' },
        { who: 'partner', text: '你就不能直接说出来是谁吗！' },
        { who: 'kaguya', text: '打到我说为止吧。公主可不是白当的。' },
      ],
      postBoss: [
        { who: 'kaguya', text: '……行了，行了。我说。' },
        { who: 'kaguya', text: '红魔馆地下，关着一位妹妹。她的愿望是「永不结束的祭典」。' },
        { who: 'kaguya', text: '她并不知道自己在做什么。她只知道，祭典不能结束。' },
        { who: 'player', text: '所以四季才不流转。' },
        { who: 'kaguya', text: '对。她按住了一切的「结束」。' },
        { who: 'kaguya', text: '不过你要想清楚。她不是在作恶，她只是……一个被关了很久的小孩。' },
        { who: 'partner', text: '……走吧，{me}。' },
      ],
    },

    stage7: {
      intro: [
        { who: 'narrator', text: '红魔馆地下 · 血月水晶。头顶的月亮是红的，脚下是无数红色的结晶。' },
        { who: 'player', text: '这些结晶，是从她的愿望里长出来的。' },
        { who: 'partner', text: '像在给一场永远不会结束的祭典，搭舞台。' },
        { who: 'narrator', text: '水晶深处，有一位金发的少女，抱着膝盖坐在那里。' },
      ],
      preBoss: [
        { who: 'flandre', text: '啊，有人来了！' },
        { who: 'flandre', text: '是来参加祭典的吗？祭典还在开哦，一直、一直在开！' },
        { who: 'player', text: '……你叫什么名字？' },
        { who: 'flandre', text: '芙兰朵露！' },
        { who: 'flandre', text: '姐姐说，我不能出去。所以我就让外面变成我的祭典。' },
        { who: 'flandre', text: '这样，祭典就永远不会结束了，对不对？' },
        { who: 'partner', text: '……所以樱花才不落。' },
        { who: 'flandre', text: '樱花落了，祭典就结束了吧？' },
        { who: 'flandre', text: '我不想结束。我喜欢祭典。我喜欢大家都在的时候。' },
        { who: 'player', text: '（她不是在作恶。她只是不知道，不结束的东西，也会伤人。）' },
        { who: 'player', text: '那我告诉你一件事。' },
        { who: 'player', text: '祭典之所以是祭典，就是因为它会结束。' },
        { who: 'flandre', text: '……骗人。' },
        { who: 'flandre', text: '那我把你也留下好了。留在这里，就永远不会结束了！' },
      ],
      postBoss: [
        { who: 'narrator', text: '红色的结晶一块一块碎裂，落下来的时候，像樱花。' },
        { who: 'flandre', text: '……为什么。为什么一定要结束。' },
        { who: 'player', text: '因为会结束，所以现在才重要。' },
        { who: 'player', text: '祭典结束了，明年还会有。樱花落了，明年还会开。' },
        { who: 'player', text: '但如果你把「结束」按住了，明年就永远不会来了。' },
        { who: 'flandre', text: '……明年。' },
        { who: 'partner', text: '到时候，我带你去看真正的祭典。真的，我保证。' },
        { who: 'flandre', text: '……真的？' },
        { who: 'partner', text: '我{self}从来不骗人——啊不，偶尔骗，但这次不骗。' },
        { who: 'flandre', text: '……那、那我等。' },
        { who: 'narrator', text: '头顶的血月褪去，变回原本苍白的颜色。' },
        { who: 'narrator', text: '幻想乡的第一片樱花瓣，终于落了下来。' },
      ],
    },
  },

  /* ---------------- 结局 ---------------- */
  ending: [
    { who: 'narrator', text: '三天后。博丽神社。' },
    { who: 'narrator', text: '樱花开到极盛，然后开始落了。落樱铺了满地。' },
    { who: 'player', text: '……又要扫了。' },
    { who: 'partner', text: '这才是春天的样子嘛！' },
    { who: 'player', text: '对了。你答应带她去看祭典。' },
    { who: 'partner', text: '嗯，说了就要做到。不过在那之前，得先让她姐姐点头。' },
    { who: 'player', text: '……那可有得磨了。' },
    { who: 'narrator', text: '神社的钟声响了一下。' },
    { who: 'narrator', text: '这一次，不是被按住的，是真正会过去的黄昏。' },
    { who: 'narrator', text: '—— 东方新纪行 · 完 ——' },
  ],

  /* ---------------- Extra 关（通关后解锁） ---------------- */
  extra: {
    intro: [
      { who: 'narrator', text: '又是三个月后。红魔馆地下。' },
      { who: 'partner', text: '说好的，带你去看祭典——不过今天先看别的。' },
      { who: 'partner', text: '按她说的，得先穿过整条走廊——路上那些妖精，就当热身。' },
      { who: 'flandre', text: '什么什么？' },
      { who: 'player', text: '你姐姐说，想让你「活动一下」。' },
      { who: 'flandre', text: '诶——？我明明很乖的！' },
      { who: 'partner', text: '乖不乖，打过才知道！' },
      { who: 'flandre', text: '……好呀。那我就不客气了？' },
      { who: 'flandre', text: '这一次，是因为我想打哦。' },
    ],
    // EXTRA 的中途 Boss：雷米莉亚。只出旁白 / 队友 / 自机，不给她的立绘加负担
    midBoss: [
      { who: 'narrator', text: '走廊尽头，血色薄雾顺着台阶漫下来，把石阶染成一条发亮的血线。' },
      { who: 'remilia', text: '来了？真慢——我从正门数到这儿，整整五分零七秒哦。' },
      { who: 'partner', text: '红魔馆的主人亲自守在地下……这可不是她平时的作风。' },
      { who: 'remilia', text: '妹妹的客人，当然要先让我称一称分量。这家里的规矩，我定的，我不坏。' },
      { who: 'player', text: '我只是想让她看看外面的祭典。' },
      { who: 'remilia', text: '祭典？呵。那就先活过这一场再说——红雾可不是摆着看的。' },
      { who: 'remilia', text: '撑得住的话，打完我请你喝茶，正山小种，很甜的。' },
      { who: 'partner', text: '……残机别在这儿用光。她可不是路边的小妖精。' },
      { who: 'narrator', text: '血色长枪在雾中亮起。永远鲜红的幼月，挡在路中央。' },
    ],
    midBossOut: [
      { who: 'remilia', text: '……哼。只差一点点而已。' },
      { who: 'partner', text: '输了还挺有风度。' },
      { who: 'remilia', text: '别得意。我要是认真起来，姐姐的威仪可是能吓哭人的。' },
      { who: 'remilia', text: '芙兰在里面。她等这一天等很久了——别让她掉眼泪。' },
      { who: 'player', text: '嗯。' },
      { who: 'narrator', text: '红雾散开一条缝。台阶下面，水晶的光一闪一闪。' },
      { who: 'remilia', text: '对了，茶会给你留个位子。活着回来。' },
    ],
    postBoss: [
      { who: 'flandre', text: '呜——好强。' },
      { who: 'partner', text: '你也不赖嘛。' },
      { who: 'flandre', text: '下一次祭典，真的带我去？' },
      { who: 'player', text: '带。只要你别再把四季按住了。' },
      { who: 'flandre', text: '不会啦！反正——' },
      { who: 'flandre', text: '祭典结束了，明年还会来嘛。' },
      { who: 'narrator', text: '红魔馆地下，第一次有了笑声。' },
    ],
  },

  /* ---------------- 简短的操作提示（关卡开局用） ---------------- */
  tips: [
    '← → 移动　空格 跳跃　空中再按一次二段跳',
    'Z / J 射击　Shift 低速移动（显示判定点）　K / C 冲刺（冲刺有短暂无敌）',
    'X / L / V 释放符卡：清屏高伤，消耗 50 POWER，火力等级下降',
  ],
};
