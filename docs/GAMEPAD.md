# 蓝牙 / USB 手柄支持（Gamepad API）

> 实现：`src/engine/gamepad.js`（`GamepadManager`）  
> 探针：`tools/_gp_probe.mjs`  
> 存档键：`localStorage['hks.gamepad.v1']`

手柄是「又一个输入源」，不是必须品：没插手柄、浏览器不给 Gamepad API、蓝牙断连，游戏都照常能用键盘 / 触屏玩。

---

## 1. 接入方式

```js
import { GamepadManager } from './engine/gamepad.js';

// Game 构造时
this.gamepad = new GamepadManager({ input: this.input });
this.gamepad.start();          // 挂 gamepadconnected / gamepaddisconnected / visibilitychange

// 每个逻辑帧（和 input.endFrame() 同一层，60Hz）
this.gamepad.poll();           // 读手柄 → input.setGamepadState(...)
// ... 逻辑更新 ...
this.input.endFrame();

// 销毁时
this.gamepad.stop();           // 摘监听、停震动、input.clearGamepad()
```

`poll()` 每帧最多做一次 `navigator.getGamepads()`；没有手柄时只做一次空扫描后立刻返回，开销接近零。

### 交给输入层的状态

```js
input.setGamepadState({
  x, y,                    // 左摇杆原值 -1..1（y 向下为正），死区由 Input 端统一处理
  actions: Set<string>,    // 本帧按住的实体按钮 / 扳机 / D-pad 动作
  pressed: Set<string>,    // 本帧新按下 + 菜单方向重复边沿
  released: Set<string>,   // 本帧松开 / 摇杆菜单方向回中
});
```

约定：

- `actions` 是**手柄这一路**的完整按住集合，Input 内部用 `_gpHeld` 与键盘 / 触屏取并集，松开手柄不会误删键盘按住的同一动作。
- 摇杆**不**合成 `left/right/up/down` 塞进 `actions`，移动只吃 `x/y` 模拟量。
- 菜单方向（D-pad 或摇杆）会产生 `pressed` 边沿；按住时按 300ms / 120ms 节奏重复，`released` 在回中 / 松开时给一次。
- `confirm` / `pause` 只给单次边沿。

---

## 2. 支持平台

| 平台 / 浏览器 | 手柄输入 | 震动 | 备注 |
| --- | --- | --- | --- |
| Windows / macOS / Linux · Chrome、Edge | ✅ | ✅（Chrome 68+ / Edge） | 主支持路径 |
| Android · Chrome | ✅ | ✅ | 蓝牙配对后可用 |
| iOS / iPadOS · Safari | ✅ | ❌ | Gamepad API 可用，但 Safari iOS 没有 `vibrationActuator` |
| macOS · Safari 16.4+ | ✅ | ✅ | 桌面 Safari 支持震动 |
| Firefox（桌面 / Android） | ✅ | ❌ | Firefox 未实现 `vibrationActuator` |
| 内嵌 WebView / 权限受限环境 | ⚠️ 可能没有 `navigator.getGamepads` | ❌ | 状态显示「不支持」，不影响键鼠 / 触屏 |

判断原则：浏览器暴露 `navigator.getGamepads` 就能读手柄；震动还要额外看 `pad.vibrationActuator`（或旧式 `pad.vibrate`）。

---

## 3. 配对步骤

### iOS / iPadOS

1. 打开「设置 → 蓝牙」。
2. 手柄进入配对模式：
   - Xbox 无线手柄：按住顶部 **配对键**（USB-C 口旁）约 3 秒，直到指示灯快闪；
   - DualSense：同时按住 **Create + PS 键** 约 3 秒；
   - DualShock 4：同时按住 **Share + PS 键**；
   - Switch Pro：按住顶部 **Sync 键**。
3. 在蓝牙列表里点选手柄。
4. 用 Safari 打开游戏，**按一下手柄任意键**（浏览器只在有输入后才把手柄暴露给页面）。
5. 设置页出现「已连接：手柄名」。

### Android

1. 打开「设置 → 蓝牙」，开启蓝牙。
2. 手柄进入配对模式（同上；部分第三方手柄要先拨到 Android / XInput 模式）。
3. 配对新设备，选中手柄。
4. 用 Chrome 打开游戏，按一下手柄任意键。
5. 状态显示「已连接：…」。

### Windows

1. 「设置 → 蓝牙和设备 → 添加设备 → 蓝牙」。
2. Xbox 手柄：按住顶部配对键 3 秒；DualSense / DualShock：按住 **Create/Share + PS**；Switch Pro：按住 **Sync**。
3. 列表里选中手柄完成配对。也支持 USB 线直连（免配对）。
4. Chrome / Edge 打开游戏，按一下手柄任意键。
5. 若装了 Steam / DS4Windows / BetterJoy 等中间层，先退出或关闭其「独占 / 隐藏手柄」选项，避免浏览器读不到。

> 浏览器安全策略：**必须先在页面上按一次手柄按键**，`gamepadconnected` 才会触发；纯蓝牙配对完成但没按键时，游戏会显示「未连接」。

---

## 4. 默认映射

标准布局（`gamepad.mapping === 'standard'`）下：

| 物理键 | button index | 游戏动作 |
| --- | --- | --- |
| A / × | 0 | `jump` 跳跃 / 确认 |
| B / ○ | 1 | `cast` 符卡 |
| X / □ | 2 | `shoot` 射击 |
| Y / △ | 3 | `dash` 冲刺 |
| LB / L1 | 4 | `slow` 低速 |
| RB / R1 | 5 | `dash` 冲刺 |
| LT / L2 | 6 | `slow` 低速（模拟扳机 ≥ 0.4 算按下） |
| RT / R2 | 7 | `shoot` 射击（模拟扳机 ≥ 0.4 算按下） |
| Back / Share | 8 | `confirm` 确认 |
| Start / Options | 9 | `pause` 暂停 / 返回 |
| D-pad 上 | 12 | `up` |
| D-pad 下 | 13 | `down` |
| D-pad 左 | 14 | `left` |
| D-pad 右 | 15 | `right` |
| 左摇杆 X / Y | axes 0 / 1 | 模拟移动（y 向下为正） |

补充：

- 一个动作可以对应多个物理键（`shoot` 同时吃 X 和 RT，`dash` 吃 Y 和 RB，`slow` 吃 LB 和 LT）。
- **菜单导航**：D-pad 方向或左摇杆（死区归一化后超过 0.6）生成方向 `pressed` 边沿；按住后首次延迟 300ms，之后每 120ms 重复一次；`confirm` / `pause` 是单次边沿。摇杆导航只在菜单消费，不参与战斗移动。
- 摇杆过 0.6 的判断取**主导轴**；正对角线时优先纵向（菜单上下更常用）。
- 设置页若要做手柄改键：`setMapping(buttonIndex, action)` 单键覆盖，`resetMapping()` 回到本表；当前没有图形化改键 UI。
- 非标准布局手柄（`mapping !== 'standard'`）仍按上表 index 读，按键可能错位；状态文案会标「非标准布局」。

---

## 5. 死区与震动

### 死区

- 存档 `deadzone`（默认 **0.25**，范围 0–0.9）是**本模块自己的判断阈值**，主要用于菜单摇杆导航：  
  `归一化 = clamp((|摇杆| - deadzone) / (1 - deadzone), 0, 1)`，归一化值 ≥ 0.6 才算方向。
- 发给 Input 的 `x / y` 是**原值**，这里不做裁剪和再归一化：Input 端还有一层 0.12 的径向死区重归一化。两层都裁会让小幅度输入被吃掉，手感变钝。
- 也就是说：`setDeadzone()` 不会改变战斗中的移动死区，只影响菜单摇杆触发点和设置存档；移动死区由 Input 统一控制。

### 震动

- `setVibration(false)` 关闭震动并立刻停掉正在震的手柄；`getVibration()` 读当前值。
- `rumble(strong = 0.6, weak = 0.3, ms = 120)`：优先 `pad.vibrationActuator.playEffect('dual-rumble', ...)`（双马达），其次 `vibration` 类型，最后回退到旧式 `pad.vibrate(ms)`。
- 页面切到后台（`visibilitychange` → hidden）时停止震动并释放手柄按住状态，回前台恢复。
- Safari iOS / Firefox 没有震动接口，`rumble()` 返回 `false`，不报错。
- 震动开关与死区一起存在 `hks.gamepad.v1`，刷新后保留。

### 存档结构

```json
{
  "deadzone": 0.25,
  "vibration": true,
  "mapping": {}
}
```

`mapping` 是 `buttonIndex → action` 的覆盖表，只存与默认不同的键；非法动作名 / 越界 index 在读取时会被丢弃。

---

## 6. 状态文案 API

设置页 / 提示条可以直接用：

```js
gamepad.statusText();   // 短文案：未连接 / 已连接：Xbox Wireless Controller · 蓝牙 / 不支持 / 接口受限
gamepad.getStatus();    // 完整快照 { connected, active, activeIndex, deadzone, vibration, supported, text, pads }
gamepad.connected;      // [{ index, id, type, transport, mapping }]
```

- `type`：`xbox` / `playstation` / `switch` / `generic`（按手柄 id 关键字分类，仅用于展示）。
- `transport`：`bluetooth` / `usb` / `unknown`。Gamepad API 不暴露真实连接方式，只能从 `id` 里的关键字推测（如 Chrome 的蓝牙手柄 id 常带 `Bluetooth`），推测不到时不要当权威。
- 多手柄时只接管一个：优先当前手柄，其次标准布局，最后列表第一个；不支持分屏。

---

## 7. 已知限制

1. **必须聚焦页面并先按一次手柄键**：浏览器不会在后台或未交互时暴露手柄。
2. **无法区分蓝牙 / USB**：`transport` 只是 id 关键字启发式；Xbox 手柄在 Windows 上走 XInput 时可能显示为普通设备名。
3. **iOS Safari 无震动**；Firefox 桌面 / Android 无震动。`rumble()` 在这些环境返回 `false`，不会抛错。
4. **非标准布局手柄可能错位**：只在 `mapping === 'standard'` 时保证本表；第三方手柄 / 手机夹持手柄可能报 `mapping === ''`。
5. **浏览器 / WebView 权限**：部分内嵌浏览器没有 `navigator.getGamepads`，或调用时抛异常；模块会静默降级并对异常退避 2 秒重试，绝不刷 console。
6. **蓝牙延迟 / 断连**：无线手柄的输入延迟高于键盘；断开时立即释放按住的动作并调用 `input.clearGamepad()`，避免角色持续移动。
7. **多个手柄不分区**：只接管一个手柄，其余手柄不参与游戏。
8. **Steam / DS4Windows / BetterJoy 等中间层**可能独占或改写手柄映射，遇到读不到时先关闭它们。
9. **摇杆菜单重复用的是真实时间**（`performance.now()`），与 60Hz 逻辑帧解耦；页面后台时浏览器节流仍可能让重复节奏变慢。
10. **不支持体感 / 陀螺仪 / 背键 / 手柄扬声器**：只读标准 axes + buttons。

---

## 8. 自测

```bash
# 本地静态服务器需已在 8137 端口（仓库惯例）
node tools/_gp_probe.mjs
```

探针做的事：

1. 用 CDP `Page.addScriptToEvaluateOnNewDocument` 在页面加载前 mock `navigator.getGamepads`，返回一个标准布局、带 17 个按钮和 4 轴、id 含 Bluetooth 的虚拟手柄；
2. 加载 `http://127.0.0.1:8137/index.html`，动态 import 模块，注入可控时钟与假 input：
   - 边沿（A 按下 / 按住 / 松开，confirm/pause 单次）；
   - 默认映射全键位、扳机模拟量阈值；
   - 摇杆原值直发、死区内不产生菜单方向、0.7 过阈值、300ms / 120ms 重复；
   - `setDeadzone` 只影响菜单门槛、不裁剪 x；
   - `setMapping` / `resetMapping`、`hks.gamepad.v1` 读写；
   - `rumble` 参数、关震动、后台停震、热插拔、`getGamepads` 抛异常退避恢复、`stop()` 释放；
   - 全程 `console.error/warn` 必须为 0；
3. 再开一个新文档，删除 `navigator.getGamepads`，确认 `start/poll/rumble/stop` 全链路无异常、状态显示「不支持」。

预期：46 项断言全部通过，无 Gamepad API 场景通过，页面无异常 / 警告。
