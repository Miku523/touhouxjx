/**
 * 结局连续性修补：
 *  - END 04 改为「先带她出去、礼物欠着」，把蓝色星星留到 Extra 的 W2 送出；
 *  - Extra 开场改成「三个月后的夏祭」，两条线都承接好结局；
 *  - 蕾米莉亚/芙兰的台词保持原风格。
 */
import fs from 'node:fs';

const file = 'src/game/endings.js';
let s = fs.readFileSync(file, 'utf8');
const swap = (from, to, label) => {
  const n = s.split(from).length - 1;
  if (n !== 1) {
    console.error(`FAIL ${label}: found ${n}`);
    process.exit(1);
  }
  s = s.replace(from, to);
  console.log(`OK ${label}`);
};

swap(
  "quote: '「这一次，我没有借。我把一颗星，还给了它一直在等的人。」',",
  "quote: '「这一次，我没有借。我把春天，还给了它一直在等的人。」',",
  'ed4-quote'
);

swap(
`        lines: [
          { who: 'narrator', text: '地下室很暗，只有水晶树的光。魔理沙把手伸进帽子，摸到那颗一直没送出去的星。' },
          { who: 'flandre', text: '你要什么？我这里没有值钱的东西。' },
          { who: 'player', text: '我知道。我是来送东西的。' },
          { who: 'flandre', text: '送我？为什么？' },
          { who: 'player', text: '因为你比我更需要一盏灯。' },
          { who: 'narrator', text: '她把蓝色的星放进芙兰朵露手心。星亮了一下，像终于想起自己该照哪儿。' },
          { who: 'flandre', text: '好暖。它一直在等你把它送出去吗？' },
          { who: 'player', text: '大概是吧。我一直没找到，配得上一颗星的人。' },
          { who: 'flandre', text: '那我不还了。' },
          { who: 'player', text: '嗯。别还。' },
        ],`,
`        lines: [
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
        ],`,
  'ed4-shot1'
);

swap(
`        lines: [
          { who: 'narrator', text: '祭典那晚，芙兰朵露一直握着那颗星。握得太紧，指缝里都是光。' },
          { who: 'remilia', text: '妹妹。别把人家送的东西捏碎了。' },
          { who: 'flandre', text: '我没有！我只是……怕它掉。' },
          { who: 'player', text: '掉了就掉了。反正天上的星星多得是。' },
          { who: 'flandre', text: '可这是你送的那一颗。' },
          { who: 'player', text: '……' },
          { who: 'narrator', text: '魔理沙把帽子往下压了压。她忽然觉得，自己收藏了那么多东西，今晚才算真的“有”了一件。' },
          { who: 'remilia', text: '魔理沙。谢谢你。' },
          { who: 'player', text: '别谢。谢了就要还人情。我可还不起。' },
          { who: 'narrator', text: '她说完，自己先笑了。笑声混进太鼓声里，很快就听不见了。' },
        ],`,
`        lines: [
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
        ],`,
  'ed4-shot2'
);

swap(
`        lines: [
          { who: 'narrator', text: '第二天早上，魔法森林。架子上空了一块。原来放星的地方，只剩一圈灰。' },
          { who: 'partner', text: '真送出去了？' },
          { who: 'player', text: '嗯。' },
          { who: 'partner', text: '不心疼？' },
          { who: 'player', text: '心疼。可是奇怪，心里比昨天满。' },
          { who: 'partner', text: '……你终于有点像正常人了。' },
          { who: 'player', text: '别。正常人可不会把蘑菇汤当早饭。' },
          { who: 'narrator', text: '她抬头看了一眼窗外。天很蓝。' },
          { who: 'player', text: '（明年。明年再找一颗。）' },
          { who: 'narrator', text: '这是她第一次想“明年”这个词，而不是“下次去借”。' },
        ],`,
`        lines: [
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
        ],`,
  'ed4-shot3'
);

fs.writeFileSync(file, s);
