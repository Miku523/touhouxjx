import fs from 'node:fs';

const file = 'src/game/story.js';
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
`      reimu: [
        { who: 'narrator', text: '三个月后。博丽神社。夏天把神社的树晒得发亮。' },
        { who: 'narrator', text: '一封红魔馆的信放在赛钱箱上。没有署名，只写了一句：“妹妹想出门。先过我。”' },
        { who: 'player', text: '……先过你？' },
        { who: 'partner', text: '是雷米莉亚的字。她在红魔馆等你。' },
        { who: 'player', text: '等我？' },
        { who: 'partner', text: '等你把上次没做完的事做完。' },
        { who: 'player', text: '我上次做完了。' },
        { who: 'partner', text: '做完了，和做好了，是两回事。' },
        { who: 'narrator', text: '灵梦看着信，想起某个黄昏。她好像答应过谁，又好像没有。' },
        { who: 'player', text: '……走吧。这次别让我忘了。' },
        { who: 'partner', text: '你最近怎么老说这种话。' },
        { who: 'player', text: '夏天太热。脑子不清醒。' },
      ],`,
`      reimu: [
        { who: 'narrator', text: '三个月后。博丽神社。夏天把神社的树晒得发亮。' },
        { who: 'narrator', text: '一封红魔馆的信放在赛钱箱上。没有署名，只写了一句：“妹妹还想出门。先过我。”' },
        { who: 'player', text: '……先过你？' },
        { who: 'partner', text: '是雷米莉亚的字。她在红魔馆等你。' },
        { who: 'player', text: '等我？' },
        { who: 'partner', text: '等你带她去看夏天的祭典。' },
        { who: 'player', text: '春天那次，已经去过了。' },
        { who: 'partner', text: '去过一次，和每年都去，是两回事。' },
        { who: 'narrator', text: '灵梦看着信，想起某个黄昏。她好像答应过谁，又好像没有。' },
        { who: 'player', text: '……走吧。这次别让我忘了。' },
        { who: 'partner', text: '你最近怎么老说这种话。' },
        { who: 'player', text: '夏天太热。脑子不清醒。' },
      ],`,
  'extra-intro-reimu'
);

swap(
`      marisa: [
        { who: 'narrator', text: '三个月后。魔法森林。魔理沙的柜子又满了。' },
        { who: 'player', text: '奇怪。总觉得少了什么。' },
        { who: 'partner', text: '你少的东西多了。少还我三本书，少睡八个时辰。' },
        { who: 'player', text: '不是这些。是……一颗星的旁边，好像该有点别的东西。' },
        { who: 'partner', text: '红魔馆来信了。雷米莉亚说，妹妹想出门，先过她。' },
        { who: 'player', text: '出门？那得带礼物啊。' },
        { who: 'partner', text: '你终于想起要送礼了？' },
        { who: 'player', text: '我是说，带点能换钱的。' },
        { who: 'narrator', text: '她把那颗蓝色的星从帽子里摸出来，看了看，又放回去。' },
        { who: 'player', text: '……这次不卖。' },
      ],`,
`      marisa: [
        { who: 'narrator', text: '三个月后。魔法森林。魔理沙的柜子又满了。' },
        { who: 'player', text: '奇怪。总觉得少了什么。' },
        { who: 'partner', text: '你少的东西多了。少还我三本书，少睡八个时辰。' },
        { who: 'player', text: '不是这些。是……一颗星的旁边，好像该有点别的东西。' },
        { who: 'partner', text: '红魔馆来信了。雷米莉亚说，妹妹还想出门，先过她。' },
        { who: 'player', text: '出门？那得带礼物啊。' },
        { who: 'partner', text: '你终于想起要送礼了？' },
        { who: 'player', text: '……我本来就打算送。' },
        { who: 'partner', text: '打算了三个月？' },
        { who: 'player', text: '魔法使的三个月，很短。' },
        { who: 'narrator', text: '她把那颗蓝色的星从帽子里摸出来，看了看，又放回去。' },
        { who: 'player', text: '……这次，送出去。' },
      ],`,
  'extra-intro-marisa'
);

fs.writeFileSync(file, s);
