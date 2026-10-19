/**
 * 收尾：把 end04 / w2 的成功报告并入主 report.json，更新 verdict、findings、SUMMARY.md。
 * 运行：node tools/_pt_flow_chain_finalize2.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const P = (f) => JSON.parse(readFileSync(f, 'utf8'));
const report = P('_pt/flow_chain/report.json');
const findings = P('_pt/flow_chain/findings.json');
const end04 = P('_pt/flow_chain/end04/report.json');
const w2 = P('_pt/flow_chain/w2/report.json');

/* ---------- 1. 并入段落 ---------- */
report.end04 = end04;
report.w2 = w2;

/* ---------- 2. sectionsFinal / summary ---------- */
const order = ['easy', 'normal', 'extra', 'edge', 'gameover_kb', 'gameover_kb_fixed', 'end03', 'end04', 'w2'];
const summaryOf = (r) => ({ pass: !!r.pass, passCount: r.passCount || 0, failCount: r.failCount || 0, findings: r.findings || 0, ms: r.ms || 0 });
report.sectionsFinal = report.sectionsFinal || {};
report.sectionsFinal.end04 = summaryOf(end04);
report.sectionsFinal.w2 = summaryOf(w2);
report.summary = { sections: order.map((k) => ({ section: k, ...(report.sectionsFinal[k] || summaryOf(report[k] || {})) })) };

/* ---------- 3. meta ---------- */
report.meta = report.meta || {};
report.meta.generatedAt = new Date().toISOString();
report.meta.ports = { ...(report.meta.ports || {}), end04: 9412, w2: 9413 };
report.meta.accel = report.meta.accel || [];
if (!report.meta.accel.some((x) => /_pendingTimeout/.test(x))) {
  report.meta.accel.push('end04 把 STAGE CLEAR 的 1.8s 横幅等待（_pendingTimeout 逻辑计时器）拨到 0.12s，只缩短等待、不改变 clear→结算对话→_advanceLevel 路径');
}
report.meta.envNotes = report.meta.envNotes || [];
report.meta.envNotes.push(
  '12:00 前后起 headless Edge 长跑偶发「渲染进程卡死/CDP 超时/socket error」：断开时间点心跳显示游戏 state/level/stage.time 一直在推进（无游戏侧死循环），Windows 应用日志无 WER/crashpad dump、Edge 进程退出码 1，疑似同机其他测试的 Edge 清理（taskkill）波及；同一脚本串行重跑 8 次后 end04 通过（73/0）、w2 第 2 次通过（50/0）。lib.openGame 已加「端口占用等待 + 3 次启动重试」降低该噪声。'
);

/* ---------- 4. verdict ---------- */
const v = report.flow_chain_verdict || [];
const patch = (id, obj) => {
  const row = v.find((x) => x.id === id);
  if (row) Object.assign(row, obj);
};
patch('T4', { result: 'PASS（N 6 面链；N Boss HP 1901/3060 > E 1616/2600；END02 解锁写盘；END04 见 E4）', section: 'normal/end04' });
patch('T8', { result: 'PASS（E 不开锁、N 零续命开锁写盘、end04 魔理沙开锁写盘、EXTRA 解锁保持、reload 一致）', section: 'easy/normal/extra/end03/end04/w2' });
patch('E4', { result: 'PASS（N 魔理沙零续命 → ENDING 04/TRUE ENDING，写 {extraUnlocked:true,extraChar:"marisa"}，reload 保持）', section: 'end04' });
patch('EW2', { result: 'PASS（EXTRA 魔理沙 → EXTRA ENDING · W2/W ENDING/第一次送人的宝贝，reload 保持）', section: 'w2' });
report.flow_chain_verdict = v;

/* ---------- 5. findings ---------- */
const fc1 = findings.find((x) => x.id === 'FC-1');
if (fc1) {
  fc1.status = 'fixed-verified';
  fc1.fixedIn = 'src/main.js:1133-1171 _onGameOver：用与 _retryStage 相同的 extraResume 判定生成按钮文案（midboss→「从雷米莉亚战继续」、final→「从芙兰战继续」）与脚注（3:00/6:00 检查点），文案与接关行为一致';
  fc1.verification = {
    section: 'w2',
    passCount: 50,
    failCount: 0,
    evidence: [
      '_pt/flow_chain/w2/W2_mid_gameover_fixed.png',
      '_pt/flow_chain/w2/W2_mid_resume_fixed.png',
      '_pt/flow_chain/w2/W2_final_gameover_fixed.png',
      '_pt/flow_chain/w2/W2_final_resume_fixed.png',
    ],
    note: '修后 EXTRA 中途失败按钮=「从雷米莉亚战继续」+ 脚注「将从 3:00 雷米莉亚战的检查点继续」，按 Enter 真实回雷米莉亚战（extraT=180）；终盘失败按钮=「从芙兰战继续」+ 脚注 6:00，Enter 回芙兰战（extraT=360）；continues 不增加。',
  };
  fc1.evidence = [...new Set([...(fc1.evidence || []), ...fc1.verification.evidence])];
}
const fc2 = findings.find((x) => x.id === 'FC-2');
if (fc2) {
  fc2.evidence = [...new Set([...(fc2.evidence || []), '_pt/flow_chain/w2/W2_mid_gameover_fixed.png', '_pt/flow_chain/w2/W2_final_gameover_fixed.png'])];
  fc2.verification = fc2.verification || {};
  fc2.verification.note = `${fc2.verification.note || ''}；W2 段（50/0）在 EXTRA mid/final 两处 gameover 均用真实键盘 Enter 离开面板并续战，进一步验证修复覆盖 EXTRA。`;
}

/* ---------- 6. 写回 ---------- */
writeFileSync('_pt/flow_chain/report.json', JSON.stringify(report, null, 2));
writeFileSync('_pt/flow_chain/findings.json', JSON.stringify(findings, null, 2));

/* ---------- 7. SUMMARY.md ---------- */
const row = (k) => {
  const s = report.sectionsFinal[k];
  return `| ${k} | ${s.pass ? 'PASS' : 'FAIL'} | ${s.passCount} | ${s.failCount} | ${s.findings} | ${(s.ms / 1000).toFixed(1)}s |`;
};
const md = `# flow-chain（task-2 关卡链→结局→EXTRA）最终汇总

- 生成：${report.meta.generatedAt}
- 环境：http://127.0.0.1:8138/index.html?seed=12345 · Node 26 + headless Edge CDP
- 约束：未修改 tools/_pt_core.mjs 与 src/**；所有加速均走真实代码路径（见下）

## 各段结果

| 段落 | 结果 | PASS | FAIL | findings | 耗时 |
|---|---|---|---|---|---|
${order.map(row).join('\n')}

（gameover_kb 为 FC-2 修前复现段：4/2；gameover_kb_fixed 为修后验证段 17/0。）

## 结局 / 路线覆盖

| 结局 | 入口 | 结果 | 证据段 |
|---|---|---|---|
| ENDING 01（REGRET） | E/灵梦通关；N/灵梦有续命通关 | PASS | easy / normal |
| ENDING 02（TRUE） | N/灵梦零续命通关 + 解锁写盘 | PASS | normal |
| ENDING 03（REGRET） | E/魔理沙通关 | PASS | end03 |
| ENDING 04（TRUE） | N/魔理沙零续命通关 + 解锁写盘 | PASS | end04 |
| EXTRA ENDING · W1 | EXTRA 灵梦通关 | PASS | extra |
| EXTRA ENDING · W2 | EXTRA 魔理沙通关 | PASS | w2 |

## findings

| id | 严重度 | 状态 | 摘要 |
|---|---|---|---|
| FC-1 | minor | fixed-verified | EXTRA Boss 战失败按钮文案与 resumeFrom 行为不符（修前显示「重新挑战本关」实际从 3:00/6:00 接关）；flow-menu 修后按钮=从雷米莉亚战继续/从芙兰战继续，W2 段 50/0 验证 |
| FC-2 | blocker | fixed-verified | GameOver 面板对键盘完全无响应（Enter/Esc 无效），只能鼠标点击；flow-menu 修后 _onMenuKey 支持 gameover，gameover_kb_fixed 17/0 + W2 段真实键盘复验 |

## 任务 8 项对照

${v.map((x) => `- **${x.id}** ${x.item} → **${x.result}**（${x.section}）`).join('\n')}

## 加速说明（全部走真实代码路径）

${report.meta.accel.map((x) => `- ${x}`).join('\n')}

## 环境备注

${report.meta.envNotes.map((x) => `- ${x}`).join('\n')}

## 复跑

\`\`\`bash
node tools/_pt_flow_chain_easy.mjs      # E/灵梦 5 面 + END01 + GameOver/暂停/持久化
node tools/_pt_flow_chain_n.mjs         # N 6 面：零续命 END02 解锁 / 有续命 END01 不解锁
node tools/_pt_flow_chain_extra.mjs     # EXTRA/灵梦：零火力 3:00 remilia 6:00 flandre → W1
node tools/_pt_flow_chain_edge.mjs      # 对话中 Esc 等边界
node tools/_pt_flow_chain_gameover_kb_fixed.mjs  # FC-2 修后键盘验证
node tools/_pt_flow_chain_end03.mjs     # E/魔理沙 → END03
node tools/_pt_flow_chain_end04.mjs     # N/魔理沙 → END04 + 解锁写盘
node tools/_pt_flow_chain_w2.mjs        # EXTRA/魔理沙 → W2
\`\`\`
`;
writeFileSync('_pt/flow_chain/SUMMARY.md', md);
console.log('done: report.json / findings.json / SUMMARY.md updated');
console.log(JSON.stringify(order.map((k) => [k, report.sectionsFinal[k].pass, report.sectionsFinal[k].passCount, report.sectionsFinal[k].failCount])));
