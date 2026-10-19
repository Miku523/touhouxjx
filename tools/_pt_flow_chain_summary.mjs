// flow-chain 分区最终汇总：整理 report.json / findings.json，生成 SUMMARY.md
// 用法: node tools/_pt_flow_chain_summary.mjs
import fs from 'node:fs';
import path from 'node:path';

const DIR = '_pt/flow_chain';
const RP = path.join(DIR, 'report.json');
const FP = path.join(DIR, 'findings.json');

const report = JSON.parse(fs.readFileSync(RP, 'utf8'));
delete report.summary; // 清掉历史汇总脚本留下的自嵌套 section

const sections = {};
for (const k of ['easy', 'normal', 'extra', 'edge', 'gameover_kb', 'gameover_kb_fixed', 'end03']) {
  const v = report[k];
  if (!v) continue;
  sections[k] = { pass: !!v.pass, passCount: v.passCount || 0, failCount: v.failCount || 0, findings: v.findings || 0, ms: v.ms || 0 };
}

report.meta = {
  section: 'flow_chain',
  task: 'task-2 关卡链→结局→EXTRA 反向试玩连通性',
  generatedAt: new Date().toISOString(),
  seed: '?seed=12345',
  server: 'http://127.0.0.1:8138/index.html',
  runner: 'Node 26 + headless Edge CDP（tools/_pt_core.mjs + tools/_pt_flow_chain_lib.mjs）',
  ports: { easy: 9412, extra: 9413, normal: 9414, edge: 9415, gameover_kb: 9412, gameover_kb_fixed: 9416, end03: 9417 },
  accel: [
    'Boss：逐张调用 boss.damage(boss.spellHp+1) 走真实破卡→defeat→dead→clear（未直接改 hp/state）；仅把 defeatT 设为 2.25 跳过死亡动画',
    '平台关瞬移到 bossTrigger 线，STG 关把 stg.scroll 拨到 bossTriggerScroll-60，均由真实 update 触发 bossTrigger；玩家 invuln=999 保持存活',
    'EXTRA 用 stage.extraT 快进到 179/359，让 3:00 雷米莉亚 / 6:00 芙兰事件真实触发；未被跳过的对话均为真实 Enter 输入',
    '玩家死亡/掉命走真实 hurt→respawn→gameover；未直接改 g.state / g.levelIndex 伪造流转',
    '修前 GameOver 键盘失效（FC-2）时用鼠标点击面板按钮继续链路（等价用户操作，已在 findings 注明）；修后全部改用键盘 Enter/Esc',
  ],
  envNotes: [
    '服务器 8138 期间被重启过一次；headless Edge 并发时偶发 浏览器连接已断开: socket error / CDP 超时(Runtime.evaluate)，重试并串行运行后稳定；',
    '9411/9495 为其他队友 Edge，未干预；本分区运行结束后无残留 Edge/node 进程。',
  ],
};
report.flow_chain_verdict = [
  { id: 'T1', item: 'E/灵梦 5 面关卡链（levelIndex 递增、time 归零、player/HUD 重置、无残留弹幕/敌人、无 JS 错误、下一面可玩）', result: 'PASS', section: 'easy' },
  { id: 'T2', item: '每面 clear→结算对话→下一面过渡（无卡死/重复触发/黑屏；连按 Enter 不跳整段、不卡最后一页）', result: 'PASS', section: 'easy' },
  { id: 'T3', item: 'E 结局页（END01、Enter/Space 逐段推进、Esc 跳卡、返回标题；E 不给 EXTRA 解锁）', result: 'PASS', section: 'easy' },
  { id: 'T4', item: 'N 前 2 面/6 面链与难度倍率；有续命 END01 不解锁 vs 零续命 END02 写盘解锁', result: 'PASS', section: 'normal' },
  { id: 'T5', item: 'GameOver 链（死亡→gameover→续命 continues+1/当前面或 Boss 检查点重开→再死→返回标题→新局）', result: 'PASS（修前发现 FC-2 blocker，flow-menu 修复后 17/17 验证通过）', section: 'gameover_kb_fixed' },
  { id: 'T6', item: '暂停→退出到标题→再开一局无残留', result: 'PASS', section: 'easy' },
  { id: 'T7', item: 'EXTRA（零火力、3:00 remilia、6:00 flandre 10 符卡、6 分钟道中、计时、退出、失败 resumeFrom、W1 结局）', result: 'PASS', section: 'extra' },
  { id: 'T8', item: '持久化 reload（E 不开锁、N 零续命开锁写盘、EXTRA 解锁保持）', result: 'PASS', section: 'easy/normal/extra/end03' },
  { id: 'E1', item: '结局覆盖：END01（E 灵梦 / N 灵梦有续命）', result: 'PASS', section: 'easy/normal' },
  { id: 'E2', item: '结局覆盖：END02（N 灵梦零续命，写 hks.progress.v1）', result: 'PASS', section: 'normal' },
  { id: 'E3', item: '结局覆盖：END03（E 魔理沙）', result: 'PASS', section: 'end03' },
  { id: 'E4', item: '结局覆盖：END04（N/H/L 魔理沙零续命）', result: 'NOT COVERED（判定与 END02 共用 endingFor good 分支，未单独跑）', section: '-' },
  { id: 'EW1', item: '结局覆盖：EXTRA W1（灵梦）', result: 'PASS', section: 'extra' },
  { id: 'EW2', item: '结局覆盖：EXTRA W2（魔理沙）', result: 'NOT COVERED（与 W1 同分支，未单独跑）', section: '-' },
];
report.sectionsFinal = sections;
fs.writeFileSync(RP, JSON.stringify(report, null, 1), 'utf8');

// findings 状态收尾
const findings = JSON.parse(fs.readFileSync(FP, 'utf8'));
for (const f of findings) {
  if (f.id === 'FC-2') {
    f.status = 'fixed-verified';
    f.fixedIn = 'src/main.js:428 _onMenuKey 接受 state==="gameover"（flow-menu FM-2 修复）；Enter=确认选中按钮、Esc=返回标题';
    f.verification = {
      section: 'gameover_kb_fixed',
      passCount: sections.gameover_kb_fixed?.passCount || 0,
      failCount: sections.gameover_kb_fixed?.failCount || 0,
      evidence: [
        '_pt/flow_chain/gameover_kb_fixed/F1_gameover.png',
        '_pt/flow_chain/gameover_kb_fixed/F2_enter_resume.png',
        '_pt/flow_chain/gameover_kb_fixed/F4_esc_title.png',
        '_pt/flow_chain/gameover_kb_fixed/F5_new_run.png',
      ],
      note: '修后 Enter 离开 gameover→再战 rumia（continues+1、Boss 满血、清弹、HUD Boss 条恢复）；Esc 返回标题；再开新局 continues=0/lives=3/power=4/无残留。修前复现见 G1-G4。',
      runFixed: 'gameover_kb_fixed',
    };
    f.evidence = [...new Set([...(f.evidence || []), ...f.verification.evidence])];
  }
  if (f.id === 'FC-1') {
    f.status = 'assigned-to-flow-menu';
    f.note = '已由 lead 派给 flow-menu 修按钮文案（游戏内 EXTRA GameOver 按钮「重新挑战本关」→ 应体现从 3:00/6:00 检查点再战）；本分区未复测修复。修后键盘已可用的前提下，该按钮由 Enter 触发，行为不变。';
  }
}
fs.writeFileSync(FP, JSON.stringify(findings, null, 1), 'utf8');

const md = `# flow-chain 分区交付摘要（关卡链→结局→EXTRA）

- 结论：**PASS**（7 段自动化共 ${Object.values(sections).reduce((a, s) => a + s.passCount, 0)} 项断言，除修前复现段外 0 FAIL；2 条 finding：FC-2 已修复验证，FC-1 已派修）
- 环境：${report.meta.server}，${report.meta.seed}，Node 26 + headless Edge CDP，端口 easy=9412 / extra=9413 / normal=9414 / edge=9415 / gameover_kb_fixed=9416 / end03=9417

## 各段最终结果

| 段 | PASS/FAIL | findings | 说明 |
| --- | --- | --- | --- |
| easy（E/灵梦 5 面+END01+续命+暂停+持久化） | 304/0 | 0 | 修后最终跑（245.9s） |
| normal（N 6 面 ×2 局：零续命 END02 / 有续命 END01） | 190/0 | 0 | nBossHp stage1=1901>E 1616、stage2=3060>E 2600 |
| extra（EXTRA 零火力→remilia→flandre→W1） | 83/0 | 1 | FC-1（按钮文案，minor，已派修） |
| edge（对话中 Esc / Boss 前对白 Esc / 修前 GameOver 键盘复现） | 29/0 | 0 | 修前基线；修后键盘行为见 gameover_kb_fixed |
| gameover_kb（修前复现） | 4/2 | 1 | 修前 Enter/Esc 无响应 → FC-2 blocker |
| gameover_kb_fixed（修后验证） | 17/0 | 0 | Enter 再战 / Esc 返回标题 / 新局无残留 |
| end03（E/魔理沙 5 面→END03 抽样） | 74/0 | 0 | END03 卡：REGRET ENDING / 借来的春天 / 不解锁 |

## 结局覆盖

| 结局 | 路线 | 结果 | 证据 |
| --- | --- | --- | --- |
| END01 | E 灵梦通关 | PASS | _pt/flow_chain/easy/B1_ending_scene.png、B2_ending_card.png |
| END01 | N 灵梦有续命通关 | PASS | _pt/flow_chain/normal/D2_ending_bad.png |
| END02（TRUE） | N 灵梦零续命通关 | PASS，写 progress {extraUnlocked:true,extraChar:'reimu'} | _pt/flow_chain/normal/B1_ending_scene.png、B3_title_unlocked.png、C1_reload_unlocked.png |
| END03 | E 魔理沙通关 | PASS | _pt/flow_chain/end03/E2_ending.png、E3_card.png |
| END04 | N/H/L 魔理沙零续命 | **未覆盖**（同 endingFor good 分支） | - |
| W1 | EXTRA 灵梦通关 | PASS | _pt/flow_chain/extra/X13_extra_ending.png、X14_extra_card.png |
| W2 | EXTRA 魔理沙通关 | **未覆盖** | - |

## findings 最终状态

| id | 严重度 | 状态 | 摘要 |
| --- | --- | --- | --- |
| FC-2 | blocker | **已修复并验证** | GameOver 面板 Enter/Esc 键盘无响应（src/main.js:416 修复前只在 menu/paused 处理键盘）。flow-menu 修复后 gameover_kb_fixed 17/0：Enter 再战、Esc 返回标题、新局无残留。修前证据 G1-G4，修后 F1/F2/F4/F5。 |
| FC-1 | minor | **已派 flow-menu 修** | EXTRA Boss 战失败时按钮写「重新挑战本关」，实际按 resumeFrom 从 3:00/6:00 检查点接上（mid/final 两分支都如此）。本分区未复测修复。 |

## 任务 8 项对照

${report.flow_chain_verdict.filter((v) => /^T/.test(v.id)).map((v) => `- ${v.id} ${v.item} → **${v.result}**（${v.section}）`).join('\n')}

## 加速说明（报告与 findings 均已注明）

${report.meta.accel.map((a) => `- ${a}`).join('\n')}

## 复跑命令

\`\`\`bat
node tools\\_pt_flow_chain_easy.mjs          :: E/灵梦 5 面+END01，port 9412
node tools\\_pt_flow_chain_n.mjs             :: N 零续命/有续命两局，port 9414（依赖 easy/report.json 的 stage1/2 boss 快照）
node tools\\_pt_flow_chain_extra.mjs         :: EXTRA 全链+W1，port 9413
node tools\\_pt_flow_chain_end03.mjs         :: E/魔理沙 END03 抽样，port 9417
node tools\\_pt_flow_chain_edge.mjs          :: 对白 Esc 边界 + 修前 GameOver 键盘基线，port 9415
node tools\\_pt_flow_chain_gameover_kb.mjs   :: 修前 FC-2 复现，port 9412
node tools\\_pt_flow_chain_gameover_kb_fixed.mjs :: 修后验证，port 9416
node tools\\_pt_flow_chain_probe.mjs         :: 冒烟探针，port 9412
\`\`\`

## 环境备注

${report.meta.envNotes.map((s) => `- ${s}`).join('\n')}

## 证据目录

\`_pt/flow_chain/{easy,normal,extra,end03,edge,gameover_kb,gameover_kb_fixed}/\`（截图+各段 report.json）、\`_pt/flow_chain/report.json\`、\`_pt/flow_chain/findings.json\`。
`;
fs.writeFileSync(path.join(DIR, 'SUMMARY.md'), md, 'utf8');

console.log(JSON.stringify({ sections, verdict: report.flow_chain_verdict.length, findings: findings.map((f) => `${f.id}:${f.status}`) }, null, 1));
