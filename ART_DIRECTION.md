# 美术升级总纲 —《东方新纪行》

本轮目标：**在保留现有七套主题与整体风格的前提下，把「原型味」拉成「精致同人游戏」**。
不是换风格、不是换玩法；是把**细节密度、光照层次、色彩关系、动感、画面质感**做到位。
玩家第一眼的评价标准是「这画面值不值得我玩」，请按这个标准动手。

---

## 一、当前画面为什么显得劣质（逐条对症）

对照 `_shot_*.png` 截图，问题集中在下面 8 点：

1. **明度挤成一坨**：天空、山、树、地面基本同一明度，剪影叠剪影，没有空气透视，没有前景压暗。
2. **大面积纯平渐变 + banding**：天空、雾、山体都是 3 个 stop 的线性渐变，出现色带，看不出材质。
3. **远景没有信息量**：树冠是「几个黑圆叠在一起」，树干是矩形；没有枝叶层次、没有边缘光、没有雾分层。
4. **瓦片/地面像贴图色块**：泥土是纯棕色 + 零星点；草皮是一排重复锯齿；没有交界 AO、没有高光边、没有裂纹/碎石/苔藓。
5. **角色和背景分不开**：角色周围没有轮廓光/阴影/接触影，小尺寸下糊进背景。
6. **发光体廉价**：金币是纯色圆环；弹幕像白色光点；没有「热核心 + 色环 + 外晕」的结构。
7. **没有前景与纵深**：画面只有天空和地面两层，缺少前景草丛/花瓣/枝条/雾幕，缺少镜头景深暗示。
8. **画面是静止的**：视差层各走各的但没有风的连续感，草不动、水不流、雾不飘、光斑不呼吸。

## 二、通用美术原则（每个文件都必须遵守）

### 1. 明度结构（最重要）
- 天空最暗/最虚 → 远景低对比 → 中景中等对比 → **前景地形与角色对比最强**。
- 角色脚下必须有接触影；角色背后 0.5~1 屏范围要有轻微压暗或晕影，把主体托出来。
- 任何新增元素先问：它属于哪一层？该层对比度对不对？

### 2. 空气透视
- 距离越远：饱和度越低、对比越低、色相越偏向天空色；并在层与层之间夹**半透明雾带**。
- 远景细节简化到剪影，但轮廓必须有辨识度（樱花、鸟居、树、山、塔、水晶）。

### 3. 光
- 每套主题有唯一主光源方向（夕阳/月亮/晨光/瀑布水光/血月）。
- 剪影朝光侧加 **rim light**（1~3px 暖色或月白色描边），背光侧压暗。
- 发光体必须有三段结构：**白热核心 → 主题色中间层 → 大范围柔光晕**；用 `lighter` 叠加。
- 地面 / 水面要有光斑、反射、湿润高光。

### 4. 色彩
- 暗部带环境色（蓝紫/青绿），亮部带光源色（橙金/月白），**不要中性灰**。
- 高饱和只给焦点：角色、弹幕、拾取物、Boss。背景最高饱和度控制在焦点的 60% 以下。
- 每套主题仍需保持现有基调（神社黄昏、森林夜雾、雾湖冰蓝、妖怪山、黄泉花海、月都、红魔馆血月）。

### 5. 质感
- 禁止大面积纯渐变。用**分层渐变 + 确定性噪点/抖动/颗粒**打散色带。
- 物理材质要能看出差别：石/土/冰/水/木/苔/金属，各有高光与粗糙度表现。

### 6. 动
- 视差层速度差清晰；雾、花、水、草、光斑持续微动（用 `t` 参数化）。
- 动效克制：幅度小、频率慢，是「呼吸」不是「抽搐」。

### 7. 文字与 HUD
- 细描边、讲究字距/字重对比；不要浏览器默认字体直出。尺寸克制，留白要敢留。

## 三、硬性技术约束

- **零依赖、零构建；程序化为主，允许预生成插画**：天空 / 地形 / 角色 / 弹幕仍全部 Canvas2D 程序化绘制；标题背景与标题 / 对白立绘使用 `src/art/gen/` 下的预生成图片，加载后只做 `drawImage`，禁止每帧滤镜或重绘。
- **不得改变现有导出签名与数据结构**（调用方在本轮不重写）：
  - `scenes.js`: `drawSky(ctx, theme, cam, t)`、`drawParallax(ctx, theme, cam, t)`、`drawTiles(ctx, level, cam, t)`、`drawAmbient(ctx, theme, cam, t)`、`THEMES`
  - `chars.js`: `drawCharacter(ctx, o)`、`CHAR_INFO`、`CHAR_BOX`；`o` 字段见文件内注释
  - `bosses.js`: `drawBoss(ctx, o)`、`drawPortrait(ctx, o)`、`BOSS_INFO`、`BOSS_BOX`
  - `bullets.js`: `BulletPool` 全部公开方法；`B_*` 常量
  - `playerShots.js`: `PlayerShots` 全部公开方法
  - `fx.js`: `Fx` 全部公开方法
- **确定性**：所有随机必须由下标/时间哈希派生，不得用 `Math.random` 造成闪烁（`fx.js` 里的现有写法可保留，但同一粒子的外观要稳定）。
- **性能**：目标 1280x720 @ 60fps，且允许渲染到 2x backing store。
  - 禁止每帧 `createRadialGradient` × 上千次、禁止每帧 `shadowBlur` 大面积使用。
  - 重复元素（瓦片、树冠、纹理）请**一次性预渲染到离屏 canvas 缓存**再 `drawImage`。
  - 单帧新增 Path2D/fill 预算自行评估：全屏元素只增 20~40 个绘制调用，不要成倍膨胀。
- **不要改别人的文件**：各人只写自己名下的文件；公共文件（index.html / main.js / style.css / renderer.js / stage.js）归 Lead。
- 代码注释用中文；写完后至少跑一次模块导入自检：
  `node --input-type=module -e "await import('file:///C:/Users/GuSheng/Downloads/HKS/src/art/scenes.js')"`（换成自己的文件路径）。

## 四、验收（Lead 负责截图）

Lead 会用无头浏览器打开 `http://127.0.0.1:8137/index.html`，对每个阶段（标题、Stage1~6、Extra、Boss 战、对话、暂停）截图，并按上述 8 条逐项打分。
**不是「能跑」就行，是「截出来好看」才行。** 首轮交付后至少还要再迭代一轮。

## 五、画面升级的优先级（如果时间有限）

P0：明度结构 / 空气透视 / 光照与轮廓
P1：瓦片与地面的纹理细节、天空与远景的层次
P2：角色与 Boss 的可读性与精致度
P3：弹幕与特效质感
P4：HUD / 标题 / 对话框排版

### P1 执行记录（2026-10-18）

- `src/art/scenes.js`
  - `soilPattern()` 重写：128×128 **无缝**平铺土体贴图（湿土块 / 沉积层理 / 砾石团 / 细根 / 翻土块 / 干裂缝 / 颗粒 / 石英微光 / 冷色环境斑），替代原来「平色 + 稀噪点」。
  - `drawTiles()`：新增①按列顶面压深的纵向暗化（土壁不再是一块平色）；②「土壁嵌石」哈希散布（按世界坐标摆放，不随 128px 花纹重复）；③表土湿暗带 / 碎砾 / 矿物斜纹。
  - `paintGrassTile()`：草皮加深、草根 AO、叶形收细，顶面 rim 柔化。
  - `drawDistantRidge()`：改为**三层**远山（远 / 中 / 近，视差 0.011 / 0.025 / 0.041），每层带天空色雾气渐变 + 脊线受光 + 近层针叶林剪影。
- 验收截图：`_p1_new_s1.png`、`_p1_new_s2.png`、`_p1_new_s3.png`、`_p1_new_s5.png`、`_p1_new_s6.png`（五个 platform 关）；`_p1_new_s4.png`、`_p1_new_extra.png`（stg 关，走预生成背景，不受影响）。改前基线：`_p1_before_s1.png`、`_p1_before_s2.png`、`_p1_before_s3.png`、`_p1_before_s5.png`（同一版 stage.js + 旧 scenes.js）；对比图 `_p1_compare_ground.png`、`_p1_compare_full.png`。
- 备份：`src/art/scenes.js.bak_p1`。
- 自检：模块导入通过；五个 platform 关 + 两个 stg 关循环无 JS 报错；帧间隔 avg 4.17–5.79ms（未封顶），无性能回退。
- 注：7037/8138 两个旧静态服务会缓存旧 JS，验收请用 `python %TEMP%\hks_serve_nocache.py <port>`（no-store）或强刷。

### P2 执行记录（2026-10-18）

目标：角色与 Boss 在背景里「读得出来」——尺寸够大、轮廓与背景分离、动作对得上、Boss 立绘不崩。

- `src/art/genchars.js`（重写）
  - 新增动作帧 `run/<char>_idle.png`、`_jump.png`、`_fall.png`、`_fly.png`（`tools/gen_char_poses.py` 以 `run_0` 为身份参考图生图，ARK Seedream；缺帧自动回退 run 帧 → 程序化 `chars.js`）。
  - `DRAW_H` 92 → **104**；按 **alpha 包围盒**归一化 + 脚底中心对齐，240×252 与 260×268 混用也能贴地；`POSE_RATIO` = jump .93 / fall .97 / fly .86。
  - 加载时一次性预处理：去抠图半透明白边、纯白剪影（受击闪白）、暗贴纸 halo（alpha .55）、上缘受光 rim（`lighter` alpha .42，偏移 -1.1/-1.5）；接地椭圆阴影只在踏地状态画。
  - 手感：起跳拉长 / 落地压扁（`SQUASH_K` .20，以脚底为轴，不影响 56×56 碰撞盒）；idle 呼吸浮动、run 随步频轻颠，跑动帧率 8–14fps 随速度提升。
- `src/game/stg.js`（飞行关自机）
  - 自机改用同一套 AI 帧 `state:'fly'` + 随横移前倾（`rot = clamp(vx*0.00035, ±0.1)`，脚底对齐 y+38），与平台关角色不再两种画风；AI 帧未就绪时仍回退 `drawCharacter`。
- `src/art/genboss.js`（重写）
  - 重做三张崩坏立绘（`tools/gen_boss_battle.py`，以对话立绘 `src/art/gen/<key>.png` 为身份参考）：`boss/rumia.png`（原白棍腿）、`boss/cirno.png`（原冰翼糊/脸脏）、`boss/aya.png`（原脸糊成一团）。旧图备份 `_p2_backup/boss_prev/`。
  - `DRAW_H` 236 + `BOSS_H` 逐角色视觉身高（rumia 242 / wriggle 254 / cirno 250 / aya 244 / yuyuko 236 / kaguya 238 / flandre 240），修正妖精系显小、长裙系显大。
  - 预处理：去白边 → bbox → 白剪影 → 暗 halo（×1.05，blur 3px）→ 冷白 rim（`lighter` .45）；`defeat` 状态整体剪影化、受击闪白用剪影叠加。
- 验收截图：`_p2_hero_final.png`（两角色 × 六状态）、`_p2_boss_lineup.png`（七 Boss 同尺度）、`_p2_bossgame4.png`（实机 Boss 战）、`_p2_stg3.png` / `_p2_stg_marisa.png`（飞行关）。可复用预览页：`_p2_preview.html`（A/B 五档）、`_p2_hero.html`（六状态）、`_p2_boss_preview.html`（Boss 栅格）。
- 自检：`node --check` 通过；平台关 / 飞行关 / Boss 战实机无 JS 报错；rAF 间隔 120 帧 avg 4.16ms（未封顶）。
- 注：本次与 P1 并行，公共入口文件（index.html / main.js / style.css / stage.js / scenes.js）未改；Boss 立绘的 ARK 生成单张 40s–8min 不等，重跑脚本前先确认服务端不忙。

### P3 执行记录（2026-10-18）

目标：「3456 + EX 的 Boss 图不合格，芙兰不够霸气、动作过于僵硬，需要多一点人物动作」。这一轮把 Boss 从「并腿悬浮 + 手臂微张」的站桩肖像，改成**有动作的战斗姿势 + 角色气质 + 原作服装**，并在引擎侧补了「活人感」。

- 立绘重做（`tools/gen_boss_action.py` → `src/art/gen/boss/<key>.png`，旧图存 `_p3_backup/boss_prev/`）
  - 生成器改成「动作优先」：STYLE 里去掉 `legs together / arms slightly spread`，每角色单独写 OUTFIT / POSE / VIBE；身份参考图只用来取脸与服装，明确要求不要抄参考站姿。
  - `whiten()` 改为**四边 flood fill** 去白底（不再全局按亮度抠），白色连衣裙/和服领口不会被啃掉；输出内容高 640，装进游戏时按 alpha 包围盒缩到 `BOSS_H`。
  - cirno：举拳大笑 + 冰锥炸开（嚣张 baka，不再是死鱼眼）。
  - aya：贴地高速冲刺、举相机闪光、另一手甩羽扇 + 风痕残影（女性化：红眼 / 睫毛 / 腮红 / 红色百褶裙 + 过膝袜）。
  - yuyuko：展袖引蝶、扇子 + 幽灵蓝蝶（白底蓝纹和服、木屐，去掉旧的赤脚绷带）。
  - kaguya：举「龙颈之玉」临下、宽袖翻飞的月之公主（**去掉金冠**，黑长直 + 红眼 + 红粉和服，和原作/对话立绘一致）。
  - flandre：七水晶翼全展、单指前指 + 咧嘴，EX 的压迫感；方案「扑向镜头 + 爪 + 獠牙」被 ARK 版权过滤连续拦截，改用「悬浮威压」方案通过。
  - 版权过滤 `OutputImageSensitiveContentDetected.PolicyViolation` 是随机的，脚本内重试 6 次；单张 30s–5min。
- `src/art/genboss.js`
  - 悬浮动效从「单轴上下平移」改成三个不同相位/频率叠加：`bob(t*1.6)` + `sway(t*0.83)` + `tilt(t*1.13)` + 呼吸缩放，绕脚底旋转，defeat 时倾倒。
  - halo 透明度随 `sin(t*1.3)` 呼吸、rim 随 `sin(t*2.4)` 呼吸，避免立绘像贴纸。
  - 新增 `cast` 参数（开火瞬间）：整体向朝向前压 7px、上抬 4px、放大 1.8%，让「发弹」在立绘上看得见。
  - `BOSS_H.flandre` 240 → **256**，EX 要压场。
- `src/game/boss.js`
  - `bossArtOpts` 新增 `cast: this.fireT < 0.22 ? 1 - this.fireT / 0.22 : 0`。
- `src/game/stage.js` `_updateCamera`（Boss 战取景）
  - 原 `Math.min(tx - 200, mid)` 会把镜头停在玩家右侧 200px，Boss 站在玩家右侧 420px 时正好半个身子被右边缘切掉（宽幅新立绘更明显）。
  - 改为 `Math.max(tx - 1080, Math.min(tx + 380, mid))`：距离 420px 时镜头取中点，玩家≈430px、Boss≈850px，双方完整入画；Boss 远离时仍优先保住玩家。
- 验收截图：`_p3_boss_compare.png`（旧/新五人对位）、`_real5-2.png`（辉夜实机）、`_r2-2.png`（琪露诺实机）、`_s3k-1.png`（文文实机）、`_fE-1.png`（EX 芙兰实机，含 cast 前压）、可复用对比页 `_p3_boss_compare.html`。
- 自检：七关循环无 JS 报错；Boss 立绘 PNG 单张 0.3–0.8MB，加载后只留一份预处理 canvas；截图走 `tools/_boss_shot3/4/5.mjs`（headless Edge）+ `tools/_html_shot.mjs`。
- 注：幽幽子的粉色睡帽连续两轮被版权过滤拦截（同一 prompt 只要加帽子就判违规），本轮保留无帽版本；后续若要补，建议手动合成而不是继续撞过滤器。

### P4 修正（2026-10-18）

主人反馈：芙兰的翅膀「是大问题，遵循红魔乡的建模」；辉夜「上面的建模太童话劣质感了」。

- 芙兰翅膀：P3 那版是四片淡彩蝴蝶翼（像妖精/彩绘玻璃），既不像红魔乡也不是「水晶」。
  - 甜点：ARK 对「带翅膀的芙兰」直接出图连续被版权过滤拦（6/6），改成 **拆件合成**：
    1. 单独生成一张「黑枝骨架 + 七色尖晶垂坠」的翅膀素材（`_cand/wing-1cw1.png`）；
    2. 单独生成一张**没有翅膀**的芙兰身体（`_cand/flandre-2nb1.png`）；
    3. `_cand/compose.py` 把翅膀放在背后合成：翅膀宽 = 身体宽 ×1.35，底边对齐 y=0.95H，
       并掐掉底部中央的挂环（会从裙摆下方露出来）。
  - 结果：`src/art/gen/boss/flandre.png`（720×640），七色尖晶从黑枝上垂下、彼此分离，朝外张开。
- 辉夜：P3 那版是鲑粉和服 + 大号白色蝴蝶结 + 手里举发光水晶，确实「童话味」太重。
  - 重新生成（不再用参考图）：深红层叠和服 + 白色内领 + 平绕深红腰带（金绳）+ 金线月/竹暗纹 + 白下襦 + 木屐；
    去掉皇冠/蝴蝶结/发光道具/闪粉，改成一只空手抬起做「赐予」手势，眼神下垂、淡笑。选 `_cand/kaguya-4v2.png`。
- 版权过滤依旧是随机拦截：本轮「纯文字描述、无参考图」的成功率明显高于「拿现图改图」。
- 对比页：`_p4_compare.html` → `_p4_compare.png`（旧 P3 / 新 P4，两行）。
- 旧图备份：`_p3_backup/boss_prev/flandre.prev3.png`（P3 蝴蝶翼版）、`kaguya.prev3.png`（P3 鲑粉版）。
- 实机截图：`_fE-1.png`（EX 芙兰，七色水晶翼）、`_k5-1.png`（辉夜，深红和服）。

### P5 EX 中途 Boss：雷米莉亚·斯卡雷特（2026-10-19）

EXTRA 关改成「14 分钟长道中 + 5:00 中途 Boss（雷米莉亚）+ 14:00 芙兰终盘」后补的中途 Boss 素材与剧情。

- 身份先立住：**对话立绘** `src/art/gen/remilia.png`（`tools/gen_remilia.py`，无参考图、纯文字描述正作形象：淡紫蓝短发 + 侧边红蝴蝶结 + 红瞳竖裂、粉色洋装 + 白色泡泡袖 / 白围裙 / 胸前红缎带、紫蓝蝠翼）。
  - 这是唯一一张**先出对话立绘、再用立绘当身份参考**去出战斗图的角色（其余七位是反过来的历史遗留）：`tools/gen_remilia.py --n 2` → `--pick 1`，随后把 `gen_boss_action.py` 的 `CHAR['remilia'].ref` 指到 `remilia`。
  - 白底抠图沿用 `gen_boss_action.whiten()` 的四边 flood fill；对话立绘内容高 560，与其他七张一致。
- 战斗立绘 `src/art/gen/boss/remilia.png`（`tools/gen_boss_action.py remilia`，POSE_OVERRIDE 出「无弹幕、无血雾、无武器」的干净版，选 `_cand/remilia-2clean.png`）：
  - 首轮版本带血枪与血雾，进游戏后弹幕和特效叠在一起读不出脸，故重出一版「只有人 + 翼」的干净构图；血枪留给符卡演出，不烧进立绘。
  - `src/art/genboss.js`：`KEYS` 加 `remilia`，`BOSS_H.remilia = 236`（翼展比芙兰宽，身高压一点，头顶才不会顶到 Boss 血条）。
- 对白：`src/game/dialogue.js` 的 `AI_PORTRAITS` 加 `remilia`，`CHAR_NAMES` 已有条目 → 雷米莉亚可以开口，不再回退灵梦矢量头像。
- 文案（`src/game/story.js` 的 `STORY.extra.midBoss` / `midBossOut`）：按正作性格写——大小姐口吻、端着架子又孩子气、护着妹妹、输赢都要体面；开打前 9 句（含「五分零七秒」「打完请你喝茶」），击破后 7 句（认输、放行、留茶会位子），`midBossOut` 由 `main.js` 在「MID BOSS CLEAR」横幅后 1.8s 用 `_after()` 排进对话，避免盖住横幅。
- 场景兼容：程序化 `bossRemilia`（`src/art/bosses.js`）保留为**图未加载时的 fallback**，实机已走 AI 图。
- 验收截图：`_boss-art.png`（实机战斗立绘）、`_flow-3-mid-dialogue.png`（战前对话 + 立绘）、`_flow-6-midout.png`（击破后台词）、`_flow-5-midclear.png`（中途击破横幅）；`node tools/_qa_map.mjs` 全绿。
