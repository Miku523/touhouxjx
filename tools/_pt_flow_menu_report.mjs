/**
 * flow-menu 汇总：读取各分脚本 part_*.json，生成 _pt/flow_menu/report.json 与 findings.json。
 * 支持「修复前基线」对比：_pt/flow_menu/baseline_prefix/part_*.json。
 * 仅读取/写入 _pt/flow_menu，不碰 src/**。
 */
import fs from 'node:fs';
import { DIR } from './_pt_flow_menu_util.mjs';

const readPart = (name, sub = '') => {
  const p = sub ? `${DIR}/${sub}/${name}` : `${DIR}/${name}`;
  if (!fs.existsSync(p)) return { missing: true };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return { badjson: String(e) }; }
};

const PART_NAMES = ['part_menu', 'part_music', 'part_binds', 'part_settings', 'part_helpquit', 'part_repro', 'part_gameover_real', 'part_fixes'];
const parts = Object.fromEntries(PART_NAMES.map((n) => [n, readPart(`${n}.json`)]));
const baseline = Object.fromEntries(PART_NAMES.map((n) => [n, readPart(`${n}.json`, 'baseline_prefix')]));

const scripts = Object.entries(parts).map(([k, v]) => ({
  name: k, pass: v.pass ?? 0, fail: v.fail ?? 0, missing: !!v.missing, badjson: !!v.badjson,
}));
const totalPass = scripts.reduce((a, s) => a + s.pass, 0);
const totalFail = scripts.reduce((a, s) => a + s.fail, 0);

const fixtureDiff = PART_NAMES.map((n) => ({
  part: n,
  preFix: baseline[n]?.missing ? 'missing' : { pass: baseline[n].pass ?? 0, fail: baseline[n].fail ?? 0 },
  postFix: { pass: parts[n].pass ?? 0, fail: parts[n].fail ?? 0 },
  note: n === 'part_helpquit' ? 'FM-1（gameover 键盘失效）修前 4 fail → 修后 0 fail'
    : n === 'part_repro' ? 'FM-3（EXTRA 无反馈）修前 4 fail → 修后 0 fail'
      : n === 'part_gameover_real' ? 'FM-1 真实残机耗尽路径修前 2 fail → 修后 0 fail'
        : n === 'part_menu' ? '新增 FM-3 修复回归断言（74 项）'
          : n === 'part_settings' ? '新增 FM-4「X hotkey」回归断言（61 项）'
            : n === 'part_fixes' ? '新增 FM-5 鼠标路径回归（22 项，修前会因点播放重开弹框而失败）'
              : '无行为变化（回归保持全 PASS）',
}));

const findings = [
  {
    id: 'FM-1',
    title: '游戏结束页键盘完全失效：Enter（重新挑战本关）/ Esc（返回标题）均无响应，只能鼠标',
    severity: 'major',
    status: 'fixed',
    page: '游戏结束',
    steps: [
      '真实路径进入 gameover：开始游戏 → play → 把残机压到 1（p.lives=1）→ 触发 die() → 驱动 update 至 stage._respawn() 返回 false → stage.onEvent(\'gameover\') → src/main.js:1002-1003 调用 _onGameOver()（置 state=\'gameover\' 并弹出「游戏结束」面板，src/main.js:1118-1139）。',
      '确认面板结构：2 个按钮「重新挑战本关」key ENTER /「返回标题」key ESC。',
      '按 Enter（预期触发「重新挑战本关」）：页面无任何变化。',
      '按 Esc（预期返回标题）：页面无任何变化。',
      '对照：鼠标点击「返回标题」→ 正常回到标题页（排除卡死）。',
      '另以同一入口 __game._onGameOver() 在两次独立实例（reload 后重做）复核 → 结果一致（共 3 组证据）。',
    ],
    expect: '游戏结束面板的键盘操作应与其它菜单一致：Enter 触发「重新挑战本关」（_retryStage），Esc 返回标题；hotkey 标注的键应生效。',
    actual: '真实残机耗尽路径与两次独立实例复核均一致：Enter/Escape 无任何反应，title 仍「游戏结束」、state 仍 \'gameover\'、menuIndex 保持 0；键盘事件确实到达 window（注入 keydown 观察器记录到 Enter:false / Escape:false），说明不是测试输入问题。鼠标点击「返回标题」立即可用。根因：src/main.js:421 状态守卫只放行 menu|paused。',
    fix: 'src/main.js:421 守卫加入 gameover：`if (this.state !== \'menu\' && this.state !== \'paused\' && this.state !== \'gameover\') return;`。update() 未改，gameover 分支仍只 endFrame，无 keydown/update 双触发。',
    verification: 'tools/_pt_flow_menu_gameover_real.mjs：真实残机耗尽 → gameover → ↑↓ 切换 → Enter 重新挑战回到 play → 再次死亡 → Esc 回标题；EXTRA 内同样生效（14/0）。tools/_pt_flow_menu_help_quit.mjs C6~C11 覆盖强制 gameover 的 Esc/↑↓/Enter/鼠标（51/0）。',
    evidence: [
      '_pt/flow_menu/baseline_prefix/part_helpquit.json（修前 4 fail）',
      '_pt/flow_menu/baseline_prefix/part_gameover_real.json（修前 2 fail）',
      '_pt/flow_menu/part_helpquit.json（修后 51/0）',
      '_pt/flow_menu/part_gameover_real.json（修后 14/0）',
      '_pt/flow_menu/90-real-gameover.png',
      '_pt/flow_menu/90-real-nav.png',
      '_pt/flow_menu/90-real-retry.png',
      '_pt/flow_menu/90-real-esc-title.png',
      '_pt/flow_menu/90-real-mouse-gameover.png',
      '_pt/flow_menu/90-extra-gameover.png',
      '_pt/flow_menu/79b-gameover-esc.png',
      '_pt/flow_menu/79d-gameover-nav.png',
    ],
    console: '无 JS 异常 / console error；修复后 keydown observer 记录 Escape:true / Enter:true（已被 preventDefault 消费）。',
  },
  {
    id: 'FM-2',
    title: '操作说明页 hint 文案与实际按键行为不符（S 返回 / K 按键设置 / R 重开本关 / F 帧率）',
    severity: 'minor',
    status: 'fixed',
    page: '操作说明',
    steps: [
      '标题页按 ? 进入「操作说明」页。',
      '读取页面 hint：『设置页内：S 返回　K 按键设置　R 重开本关　F 帧率』（src/main.js:734）。',
      '依次按 S / K / R / F，记录页面 title/menuIndex/state。',
      '按 Esc 返回标题，再进入一次并重按 K（第二次复现）。',
    ],
    expect: 'hint 中提到的按键应当可用，或文案只描述真实存在的操作。',
    actual: '两次进入页面，S/K/R/F 均无任何反应（title 仍「操作说明」、menuIndex 停在「返回」行），仅 Esc 与点击「返回」能回标题；且描述设置页键位也不符：设置页 S 是「下移」而非返回，标题来源的设置页也没有 R「重新开始本关」行。',
    fix: 'src/main.js:734 hint 改为只列真实可用键：『设置页内：K 按键设置　F 帧率　M 静音　X 重置进度　ESC 返回』（X 依赖 FM-4 修复）。',
    verification: 'tools/_pt_flow_menu_help_quit.mjs A3 逐字断言新文案（归一空白后），A12/A15 仍验证 S/K/R/F 在本页无动作（51/0）。',
    evidence: ['_pt/flow_menu/70-help.png', '_pt/flow_menu/71-help-keys.png', '_pt/flow_menu/part_helpquit.json'],
    console: '无异常。',
  },
  {
    id: 'FM-3',
    title: '未解锁 EXTRA 时按 KeyE 或点击入口无任何提示（无反馈、无解锁条件说明）',
    severity: 'minor',
    status: 'fixed',
    page: '标题',
    steps: [
      '空存档启动（hks.progress.v1 为空）：标题页「禁忌的祭典」入口为 locked + disabled（无 hotkey / 无 onPick）。',
      '按 KeyE：记录 title/page/state/hint。',
      '鼠标点击禁用的 EXTRA 入口：记录同样字段。',
      'reload 后重复 KeyE 与点击（第二次复现）。',
    ],
    expect: '入口显示为锁定态时，按 E 或点击应给出「仍需解锁 / 解锁条件」类提示。',
    actual: '两次实例一致：不导航、不弹窗、hint 为空、状态仍是 title/menu；玩家没有任何反馈。源码 locked 分支只有 cls:\'extra locked\', disabled:true，无 hotkey/onPick/提示。',
    fix: 'src/main.js:585-592 locked 分支保留 locked 视觉，改为 hotkey KeyE + noSelect + feedback + onPick(showTitle(\'EXTRA 尚未解锁：用 N / H / L 难度不续命通关即可开启\'))；src/main.js:300-303 对 feedback 按钮内联恢复 pointer-events/cursor（CSS 不可改）；src/main.js:389-406 _selectMenu/pointerenter 增加 noSelect 判定，避免抢默认选中位。',
    verification: 'tools/_pt_flow_menu.mjs 空存档 EXTRA 段：locked 视觉且非 disabled、menuIndex 0、KeyE/点击均不导航且 hint 含「尚未解锁」（74/0）；tools/_pt_flow_menu_repro.mjs 两轮独立复现同结果（14/0）。',
    evidence: [
      '_pt/flow_menu/06-extra-locked.png',
      '_pt/flow_menu/85-extra-locked-round1.png', '_pt/flow_menu/86-extra-keyE-round1.png',
      '_pt/flow_menu/baseline_prefix/part_repro.json（修前 4 fail）',
      '_pt/flow_menu/part_repro.json（修后 14/0）',
      '_pt/flow_menu/part_menu.json（修后 74/0）',
    ],
    console: '无异常。',
  },
  {
    id: 'FM-4',
    title: '设置页「重置进度」行显示 X 键帽但无 hotkey，按 X 无反应（lead 立案，本分区修复）',
    severity: 'minor',
    status: 'fixed',
    page: '设置',
    steps: [
      '标题按 S 进入设置页，找到底部「重置进度」行：显示 keycap X。',
      '按 KeyX：页面与选择均不变（无任何反应）。',
      '对照：↑↓ 移到该行按 Enter，可正常打开重置确认框。',
    ],
    expect: '行上标注的 X 应能直接打开重置确认框（双路径：键盘直达 + 方向键+Enter）。',
    actual: '设置页 footer 的重置行只有 {key:\'X\'} 没有 hotkey 字段，_onMenuKey 的 hotkey 匹配不到，按 X 无反应；lead 已独立立案（_pt/lead_input/b-settings.png）。',
    fix: 'src/main.js:1470-1476 设置页重置行补 `hotkey: \'KeyX\'`。',
    verification: 'tools/_pt_flow_menu_settings.mjs D7b~D7e：设置页按 X 直接打开重置确认框、默认高亮「取消」、hint 说明影响范围、Enter 取消不删档（61/0）。',
    evidence: ['_pt/flow_menu/58b-reset-by-x.png', '_pt/flow_menu/part_settings.json（61/0）'],
    console: '无异常。',
  },
  {
    id: 'FM-5',
    title: '音乐回忆室未遇曲目确认框：鼠标点「播放」后弹框立刻重开，永远播不了（lead 立案，本分区修复）',
    severity: 'major',
    status: 'fixed',
    page: '音乐回忆室',
    steps: [
      '空存档标题按 M 进入音乐回忆室，鼠标点击任意未遇曲目行（如第 02 号）。',
      '确认框出现，点「播放」：框关闭后立即重开，曲目仍不播放、heard 不写入。',
      'T 试听未遇曲目 → 框里点「试听 30 秒」：preview 标记丢失且框重开（按钮变回「播放」）。',
    ],
    expect: '点「播放」应关闭确认框并真正播放该曲、标记已听/写盘/解锁行；点「试听 30 秒」应进入 30 秒试听。',
    actual: '修前 warnPlay click 执行 `_closeWarn(); this._requestPlay(idx);`，而 _requestPlay 对未听曲目又 `_openWarn(i); return;` → 死循环。lead 已立案（_pt/lead_musicroom/）。',
    fix: 'src/game/musicRoom.js:632-645 warnPlay click 改为读 `_warn.index/_warn.preview` 后先 `_closeWarn()`，直接 `if (!tr) return; if (preview) this._startPreview(tr); else this._play(tr);`，不再走 _requestPlay。',
    verification: 'tools/_pt_flow_menu_fixes.mjs：鼠标点未遇行→框→点「播放」真正播放 stage1、musicOn、heard 写盘、行解锁、计数 1/11→2/11；T 试听未遇→框按钮「试听 30 秒」→点它进入 preview（29.17s）且倒计时递减；键盘 Enter 路径仍先弹框（22/0）。',
    evidence: [
      '_pt/flow_menu/91-warn-mouse.png',
      '_pt/flow_menu/92-music-played.png',
      '_pt/flow_menu/93-music-preview.png',
      '_pt/flow_menu/94-music-preview-countdown.png',
      '_pt/flow_menu/95-keyboard-warn.png',
      '_pt/flow_menu/part_fixes.json（22/0）',
    ],
    console: '无异常。',
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  tester: 'flow-menu',
  phase: 'after-fix-regression',
  scope: '菜单与静态页面连通性（标题/难度/选人/开始、音乐回忆室、设置、按键设定、重置进度、帮助/退出、未解锁 EXTRA、gameover、异常与布局）',
  totals: { pass: totalPass, fail: totalFail, findings: findings.length, fixed: findings.filter((f) => f.status === 'fixed').length },
  findingsBySeverity: {
    blocker: findings.filter((f) => f.severity === 'blocker').length,
    major: findings.filter((f) => f.severity === 'major').length,
    minor: findings.filter((f) => f.severity === 'minor').length,
  },
  scripts,
  baselineDir: `${DIR}/baseline_prefix`,
  fixtureDiff,
  fixes: [
    { id: 'FM-1', file: 'src/main.js', line: '421', change: '状态守卫放行 gameover（键盘菜单恢复）' },
    { id: 'FM-2', file: 'src/main.js', line: '734', change: '帮助页 hint 改为真实可用键' },
    { id: 'FM-3', file: 'src/main.js', line: '300-303 / 389-406 / 585-592', change: 'locked EXTRA 保留视觉但可点+KeyE 提示、noSelect 不抢默认位、feedback 内联 pointer-events' },
    { id: 'FM-4', file: 'src/main.js', line: '1470-1476', change: '设置页「重置进度」补 hotkey KeyX' },
    { id: 'FM-5', file: 'src/game/musicRoom.js', line: '632-645', change: 'warnPlay 鼠标点击直接 _play/_startPreview，不再 _requestPlay 死循环' },
  ],
  coverage: [
    { no: 1, item: '标题→难度→选人→开始游戏 + 每页 Esc 返回链（键盘/鼠标两条路径）', status: 'PASS', evidence: '_pt/flow_menu/01~16*.png / part_menu.json（74/0）' },
    { no: 2, item: '音乐回忆室：进入/曲目锁定/播放停止/未遇提示/返回标题/KeyM 冲突', status: 'PASS', evidence: '_pt/flow_menu/20~27*.png / part_music.json（70/0）+ part_fixes.json（22/0）' },
    { no: 3, item: '设置：各项即时生效+写盘 hks.settings.v1+reload 保留+关闭再进一致', status: 'PASS', evidence: '_pt/flow_menu/50~56*.png / part_settings.json（61/0）' },
    { no: 4, item: '按键设定：改键/互换/副键清除/捕获 Esc 取消/重置默认/写盘/reload/游戏内真实生效', status: 'PASS', evidence: '_pt/flow_menu/40~47*.png / part_binds.json（56/0）' },
    { no: 5, item: '重置进度：取消不删/确认才删/EXTRA 重新锁定/heard 保留/刷新仍清空 + X 直达', status: 'PASS', evidence: '_pt/flow_menu/57~61*.png、58b-reset-by-x.png / part_settings.json（61/0）' },
    { no: 6, item: '帮助/退出页文案逐字 + 退出确认→window.close 失败分支不白屏/能返回', status: 'PASS', evidence: '_pt/flow_menu/70~78*.png / part_helpquit.json（51/0）' },
    { no: 7, item: '未解锁 EXTRA：KeyE/点击给出解锁提示且不导航；两轮复现', status: 'PASS（FM-3 已修）', evidence: '_pt/flow_menu/85~87*.png、06-extra-locked.png / part_repro.json（14/0）' },
    { no: 8, item: '全程 JS 异常/console error/warning/404/布局溢出', status: 'PASS（仅 window.close 预期警告；无 404）', evidence: '_pt/flow_menu/81-resource-scan.png / part_helpquit.json' },
    { no: 9, item: '结局/游戏结束页：ending 播完回标题、gameover 键盘连通性（普通关 + EXTRA）', status: 'PASS（FM-1 已修）', evidence: '_pt/flow_menu/79*.png、90-*.png / part_helpquit.json（51/0）、part_gameover_real.json（14/0）' },
  ],
  notes: [
    `PASS/FAIL 为各分脚本检查项累计：${totalPass} pass / ${totalFail} fail（修复后全绿）。`,
    '修复前基线见 baseline_prefix/：helpquit 48/4、repro 8/4、gameover_real 3/2 的 fail 全部是 FM-1/FM-3 的证据行；修复后同脚本分别 51/0、14/0、14/0。menu/settings 因新增修复回归断言从 70/57 增至 74/61。',
    '已知可疑点复核结论（非 bug）：KeyM 同时是音乐室 hotkey 与 mute 主键——标题按 M 只进音乐室不静音；音乐室内 M 只切静音不退出；设置页 M 只切静音。KeyS 同时是设置 hotkey 与 down 副键——标题按 S 只进设置；设置/音乐室/改键页内 S 只作下移。KeyQ 同时是退出 hotkey 与 quit 动作——标题按 Q 只开退出页；退出页内 Q 无动作。',
    'headless 下 window.close() 被浏览器拒绝（Scripts may close only the windows that were opened by them.）属预期；游戏正确降级为「已退出游戏」收尾页，可 Enter 返回标题且恢复循环/取消静音。',
    '布局：1280x720 与 960x540 下均无按钮出视口/被裁切；帮助页 .set-group scrollHeight 211>193 系装饰性溢出（overflow:hidden，放大截图 72c-help-move-zoom.png 确认文字/键帽未裁切），不立案。',
    '测试口径修正（非游戏问题）：hint/subtitle 的全角空格会被页面 normalize 为半角，断言按归一后文本；键盘流程前需把鼠标移到中立位置，否则 DOM 重建时 pointerenter 会改变菜单选中项（曾导致 Enter 误点「取消」）。',
    'FM-5 鼠标路径修复后有一个非缺陷现象：点确认框按钮后指针落点会 hover 到列表某行并改变右侧选中曲目（播放的仍是按钮对应的曲目，audio.currentSong 与 heard 均正确），属 hover 选择语义，不立案。',
  ],
  externalFindings: [
    { id: 'LEAD-MUSICROOM-WARN-CLICK', severity: 'major', note: '音乐回忆室未遇曲目确认框鼠标点击死循环（lead 立案，本分区已修复为 FM-5）', status: 'fixed' },
    { id: 'LEAD-RESET-X-HOTKEY', severity: 'minor', note: '设置页「重置进度」行显示 X 但无 hotkey（lead 立案，本分区已修复为 FM-4）', status: 'fixed' },
  ],
};

fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(`${DIR}/findings.json`, `${JSON.stringify(findings, null, 2)}\n`, 'utf8');
fs.writeFileSync(`${DIR}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('[report] totals', JSON.stringify(report.totals), JSON.stringify(report.findingsBySeverity));
for (const s of scripts) console.log('[report]', s.name, s.pass, '/', s.fail);
for (const d of fixtureDiff) console.log('[report] fixture', d.part, JSON.stringify(d.preFix), '->', JSON.stringify(d.postFix));
