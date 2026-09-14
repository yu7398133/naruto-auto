# 火影忍者云游戏自动化 (Naruto Auto)

基于腾讯云游戏 TCGSDK / gamematrix 的火影忍者手游自动化脚本，浏览器直接运行。

![version](https://img.shields.io/badge/version-0.5.62-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/Tampermonkey-userscript-orange)

> ⚠️ 本项目仅供学习交流，使用风险自负。

## 功能概览

### ✅ 已实现（v0.5.62，28 个任务）

| 分类 | 任务 |
|------|------|
| **⚔ 日常（11）** | 赠送体力、一乐拉面、精英副本、组织祈福、丰饶之间、小队突袭、小队突袭助战、生存试炼、任务集会所、商店购买、积分赛段位领取 |
| **🎁 收获（9）** | 招财、邮件领取、每日签到、每日分享、情报社、排行榜点赞、特权商店、免费招募、活跃度宝箱 |
| **📅 周常（6）** | 忍法帖点赞、修行之路、追击晓组织、叛忍来袭、组织要塞、天地战场 |
| **🥊 战斗（2）** | 角斗场忍术对战（默认 15 局循环，局数可输入）、秘境挑战 |

> 面板按钮顺序即执行顺序：`⚔ 日常 → 🎁 收货 → 📅 周常 → 🥊 战斗`，日常全部排在收获之前。

### 核心能力

| 分类 | 功能 |
|------|------|
| **UI 面板（悬浮球）** | 默认收起为 54×54 🍥 悬浮球，运行时自动隐藏防遮挡；展开含任务开关、局数输入、实时日志、状态徽章、画面预览、点击取色、配置面板；双击悬浮球一键跑全部启用任务 |
| **调度系统** | 任务队列、失败重试、单任务超时、暂停/恢复、立即停止、每日/每周完成记忆 |
| **多 SDK 适配** | 优先 Oprate（`window.Oprate` 14 法）→ `_START_ARM_CG_`（touchControl）→ TCGSDK / GMSDK / gamematrix fallback |
| **视觉检测** | video→canvas 帧捕获、64×36 灰度签名帧差异、亮度标准差去噪、6 类场景打分制判定、颜色探针、SAD 模板匹配、白字行聚类（`findTextRows`） |
| **场景导航** | 主界面/战斗/结算/弹窗/加载/每日页/商店页识别；精准点关；强制回主界面 |
| **战斗辅助** | 普攻持续按住 + 每拍重建按压态、替身 0.4s 秒替、技能 1/2 0.5s 高频补点、大招/密卷/通灵 5s 轮询、15s 左右朝向调整；**胜负双探针**结算识别（见下） |
| **结算识别** | 「黑屏 → 结算」序列确认 + 金色胜利横幅 + 紫灰失败横幅双探针，胜败局都能在 1 局内识别，不再只靠超时兜底 |
| **登录管理** | Cookie 登录态检测（不强制拦截，仅做提示） |
| **坐标校准** | 面板「🎓 校准」录制点击 + 按键 + 长按时长，抓帧取色生成探针；支持命名/点号分组导出 |
| **自测环境** | `tools/selftest.html` 无登录验证脚本核心逻辑（21/21 通过，含悬浮球/自动隐藏用例） |

### 🚧 计划中

- OCR 辅助（需要联网，可选）
- 限时活动（丁次烤肉、樱花季）
- 任务执行报表（每日/每周统计）

## 快速开始

### 环境要求

- 浏览器：百分浏览器 / Chromium 134+（v0.5.62 已用真实环境验证）
- 扩展：[Tampermonkey](https://www.tampermonkey.net/)
- 云游戏：腾讯 START（start.qq.com / cg.qq.com / cloudgame.qq.com）

### 实际跑通的栈（真实环境）

| 层 | 真实值 |
| --- | --- |
| SDK | `window.Oprate`（14 个输入方法） + `window._START_ARM_CG_`（touchControl + WebRTC） |
| 视频元素 | `<video id="gmsdk-video-element" class="gmsdk-video-player">`（逻辑坐标 1280×720，云端可能以 1080p 推流） |
| 输入坐标 | Oprate 接受 `clientX/clientY`（视口像素），DOM 派发到 `elementFromPoint(x,y)` 的元素 |

### 安装步骤

方式一（GitHub，脚本更新自动提示）：

1. 安装 Tampermonkey 扩展
2. 打开 `https://raw.githubusercontent.com/yu7398133/naruto-auto/master/naruto-auto.user.js` 直接安装
3. 打开 `https://start.qq.com/webgame/gift-center/700724`

方式二（本地粘贴）：

1. 安装 Tampermonkey 扩展
2. Tampermonkey → 新建脚本 → 粘贴 `naruto-auto.user.js` 全部内容 → 保存
3. 打开 `https://start.qq.com/webgame/gift-center/700724`

随后（两种方式相同）：

4. **手动登录**（首次） → 点右下角蓝色「启动游戏」按钮 → 等待进入云游戏 session（URL 会跳到 `start.qq.com/game/arm-game/#/game/...`）
5. 游戏画面左下角出现 🍥 悬浮球即脚本就绪（面板默认收起，不遮挡右上角关闭按钮）

> 若 GitHub 访问不稳定，用方式二。

### 第一次使用建议

1. F12 控制台执行 `__narutoAuto.diag()` → 应输出 `sdk: {name: "Oprate"}`，剪贴板里有完整诊断 JSON
2. 点开悬浮球 → 「🔍 探测」列出所有视觉探针的实际距离 → 主界面 7 个探针应全 ✅
3. 点「🏠 回主界面」走一遍 → 应输出「完成（X秒）」
4. 跑「🎁 收获」里的邮件领取 → 验证端到端流程
5. **面板默认收起**：平时只留 🍥 悬浮球；单击展开/收起，双击直接跑全部已启用任务；`Ctrl+Shift+A` 也可切换显隐

## 战斗辅助详解

战斗环节是本项目迭代最多、也最容易踩坑的部分。当前实现（v0.5.62）如下：

### 连招节拍

| 动作 | 屏位 | 节奏 |
|------|------|------|
| **普攻** | `k` | **一直按住不放**（`battle.holdAttack`），按住期间照常轮询其他技能 |
| 技能 1 / 技能 2 | `j` / `i` | 0.5s 高频补点（`ASSIST.jiFast`） |
| 替身 | `space` | 0.4s「秒替」（`ASSIST.sub`） |
| 大招 / 密卷 / 通灵 | `o` / `e` / `r` | 5s 轮询组（`ASSIST.burst`），组内间隔 120ms |
| 左右朝向 | `a` / `d` | 进场 15s 起交替点击，之后每 15s 一次 |

**为什么技能要「补点」而不是「按住」**：云游戏鼠标通道是单指针模型，无法同时按住多个位置（0.5.59 实测确认）。所以只有普攻真正按住，技能 1/2 用高频补点近似「持续按」的手感。

**为什么普攻要每拍重建按压态**：单指针模型下，任何一次其他位置的点击都会把按压点挤走——替身 0.4s 秒替一跑，按住立刻失效（实测帧差从 25~41 跌回 2~9）。因此 `combatStep()` 每拍末尾都会 `_reassertHold()` 静默做一次 release+down，把按压态抢回来。

### 结算识别

战败局是早期最大的盲点：原金色横幅探针只认胜局，败局只能等超时。现在用**胜负双探针 + 黑屏序列**：

- `victoryBanner`：胜利「胜」字主体，金色（约 200,202,81），tol 45
- `defeatBanner`：失败「失败」大字主体，紫灰（约 79,83,107），**tol 25**
- 两者同归 `SCENE.BATTLE_END`；`detect()` 返回值新增 `byProbe` 字段，日志会区分「胜负已分 / 失败」
- 战斗结束后出现黑屏再进结算，用「黑屏 → 结算」的变化序列提高识别准确率

> 调 tol 的教训：tol 放到 40 时，胜局录制里有 9 个暗色帧会误命中失败探针，必须收紧到 25。

### 角斗场

- 默认循环 **15 局**，`arenaBattleRounds` 可在面板「🥊 战斗」组尾部直接输入
- 重复战斗**不回主界面**：打完自动续局；未自动续局则重复「选对手 → 开始对战」
- 单任务超时 5400s（90 分钟）

### 安全闸

1. **连招总时长上限**（`battle.assistMaxMs`，默认 150s）：战斗再久也不无限连点，防止战斗其实早已结束、辅助还在盲点把当前界面的按钮点开
2. **静止/超时/结算/stop 一律 `releaseHold()`**：不会把普攻按住状态带到结算或主界面

## 视觉识别

脚本用三种手段识别画面，按可靠性递进：

| 手段 | 用途 | 实现 |
|------|------|------|
| **颜色探针** | UI 定位（按钮、横幅、面板） | 区域平均色 + 曼哈顿距离容差 + 亮度标准差下限防纯色误判 |
| **SAD 模板匹配** | 文字/图标（如「普通招募」页签） | `Vision.findTemplate`，灰度 SAD 均值，阈值 25 |
| **白字行聚类** | 模板失效时的兜底 | `Vision.findTextRows`：grayMin 170 / satMax 60 / gap 8 / minCount 3 |

> **分辨率教训**：云端可能把 720p 重采样成 1080p 推流，抗锯齿变化会让 720p 时代抠的模板失准——「普通招募」页签 SAD 从 0 涨到 28.7，卡死在阈值 25 上（位置完全正确却判未命中）。修法是①按现场 1080p 帧重抠模板，②加 `findTextRows` 第二路径。**新增模板时务必在当前流分辨率下抠图。**

### 视觉探针（PROBES）

`PROBES` 对象集中存放所有 UI 颜色指纹：

```js
{
  area:   [x1, y1, x2, y2],   // 1280×720 逻辑空间
  color:  { r, g, b },        // 区域平均色
  tol:    35,                 // 颜色容差 (曼哈顿距离)
  minStd: 0..15,              // 区域亮度标准差下限 (防纯色背景误判)
  click:  [x, y],             // 命中后点击这个点（可选）
  label:  '中文名',
  verified: true/false,       // 是否来自上游实测标定
}
```

新加 UI 时用 `tools/vision-lab.html` 或面板「点击预览取色」生成片段。

## 技术架构

```
┌────────────────────────────────────────────────────────┐
│              浏览器 (Tampermonkey)                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  油猴脚本  naruto-auto.user.js                  │  │
│  │  ┌─ Config · Store · Progress                   │  │
│  │  ├─ SdkAdapter  (Oprate / _START_ARM_CG_ / legacy)  │  │
│  │  ├─ VisionCore  (video → canvas → 帧差异/模板)   │  │
│  │  ├─ SceneDetector (场景判定)                     │  │
│  │  ├─ GameOperator (click/swipe/key + hold)       │  │
│  │  ├─ Navigator     (弹窗 / 强制回主界面)          │  │
│  │  ├─ BattleFlow    (连招辅助 / 等战斗结束)        │  │
│  │  ├─ Tasks         (28 个)                       │  │
│  │  ├─ TaskScheduler (重试 / 超时 / 停止 / 去重)    │  │
│  │  └─ ControlPanel  (状态 / 按钮 / 预览 / 设置)    │  │
│  └────────────────────┬────────────────────────────┘  │
│                ┌──────▼──────┐                         │
│                │   云游戏 SDK  │                        │
│                └──────┬──────┘                         │
│                ┌──────▼──────┐                         │
│                │ <video> 画面 │                        │
│                └─────────────┘                         │
└────────────────────────────────────────────────────────┘
```

### 核心模块

| 模块 | 职责 |
|------|------|
| `Config` | GM_setValue / localStorage 持久化，深合并；版本升级自动补字段 |
| `Store` | GM_* 与 localStorage 双通道，注入环境无油猴也能跑 |
| `Progress` | 每日/每周成功记录，配合 `runtime.skipDoneToday` |
| `Runtime` | 全局中止信号，stop() 一秒内打断所有 sleep |
| `SdkAdapter` | 三组能力检测（Oprate / arm / legacy）；事件载荷多格式 + DOM 派发兜底；clientX/Y 视口坐标 |
| `VisionCore` | 帧捕获、短时缓存、64×36 灰度签名、亮度标准差、模板匹配、白字行聚类 |
| `SceneDetector` | 打分制场景判定，连续 2 帧一致才确认 |
| `GameOperator` | 基于 SdkAdapter 的 click/swipe/longPress/key/pressHold/releaseHold |
| `Navigator` | dismissOnce / goHome / ensureHome |
| `BattleFlow` | combatStep（连招节拍）/ waitForEnd / clearSettlement / run |
| `TaskContext` | 给 task 提供 tap / go / popups / home / fight / waitScene |
| `TaskScheduler` | 队列 / 重试 / 超时 / 事件 / 停止 / 每日去重 |
| `ControlPanel` | 拖拽面板、状态徽章、预览取色、设置面板、任务列表 |
| `NarutoAuto` | 主入口：异步检测 SDK，画面元素看门狗 |

## 坐标系统

所有坐标基于 **1280×720** 基准分辨率定义，运行时按视频元素真实尺寸（`videoWidth × videoHeight`）自动换算。

| 组 | 数据来源 | 可信度 |
|---|---------|-------|
| `COORDS.nav` | 实测标定 | ✅ 实战可用 |
| `COORDS.common.close` | 通用规则 | ✅ 已被 minStd 加固 |
| `COORDS.common.back` | 估算 | ⚠ 需校准 |
| `COORDS.collect / daily / weekly / battle` | 逐个录制校准 | ✅ 主要流程已校准 |
| `BattleFlow.PLACES` | 校准 JSON（a d 空格 j k i o e r 九个屏位） | ✅ 实战可用 |

> 注意：战斗里的 `j` / `i` / `k` 等是**屏幕位置**（按钮坐标），不是键盘按键——2026-09-13 起战斗辅助全部走位置点击，因为部分云游戏实例的键盘通道不可靠。

校准方式（任选其一）：

- **🎓 校准模式（推荐）**：面板「🎓 校准」或 `Ctrl+Shift+C` 开启 → 手动把任务做一遍（**点击和屏幕位置都会记录**，长按会记时长）→ Esc 结束 →「💾 导出」。生成的 `COORDS.calib` + `COORDS.calibFlow` 直接可用
  - 「▶ 回放」或 `Ctrl+Shift+P`：把录的序列重放一遍验证（回放中再按一次停止）
  - 「✏ 命名」：给每步起个有意义的名字，支持点号分组（如 `nav.store` → 导出为 `COORDS.nav.store`）；「📃 列表」打印当前步骤
  - 要录 Esc 键本身用 `Ctrl+Shift+E`（单独按 Esc 是结束校准）
- 控制面板「点击预览取色」：鼠标点预览图，自动生成探针代码片段
- `tools/vision-lab.html`：拖入离线截图批量标定

## 配置说明

配置通过 Tampermonkey 的 `GM_setValue` 持久化，注入场景回退到 `localStorage`。

| 路径 | 说明 | 默认 |
|------|------|------|
| `delay.click.min/max` | 单次点击后等待 | 350-700ms |
| `delay.pageLoad.min/max` | 页面切换等待 | 1800-3200ms |
| `battle.minWait/maxWait` | 战斗最短/最长等待 | 15s / 180s |
| `battle.autoBattle` | 进入战斗后开自动 | ✅ |
| `battle.speedUp` | 开倍速 | ✅ |
| `battle.keyAssist` | 战斗连招辅助 | ✅ |
| `battle.holdAttack` | 普攻持续按住（关闭则退回点击） | ✅ |
| `battle.assistMaxMs` | 单场连招点击上限 | 150000 |
| `battle.postRounds` | 结算循环轮数 | 8 |
| `arenaBattleRounds` | 角斗场循环局数 | 15 |
| `vision.enabled` | 启用视觉检测 | ✅ |
| `vision.diffThreshold` | 帧差异阈值 | 0.012 |
| `vision.stableFrames` | 连续静止帧数 | 3 |
| `vision.preview` | 显示预览 | ✅ |
| `nav.requireHome` | 每个任务前回主界面 | ✅ |
| `runtime.taskTimeout` | 单任务超时 | 240s |
| `runtime.skipDoneToday` | 跳过当日已成功的任务 | ✅ |
| `runtime.dailyResetHour` | 每日重置点 | 5 |
| `runtime.stopHotkey` | `Ctrl+Shift+Q` 紧急停止 | ✅ |
| `input.mode` | stream / dom | stream |
| `input.jitter` | 点击随机偏移 | 4px |
| `taskSwitches.*` | 各任务开关 | 大部分开启 |

## 控制台快捷 API

```js
__narutoAuto.probe()              // 探测场景（详细输出每个探针的距离）
__narutoAuto.diag()               // 一键自检（SDK/画面/场景/坐标映射），自动复制 JSON 到剪贴板
__narutoAuto.show()               // 展开面板
__narutoAuto.hide()               // 收起为悬浮球
__narutoAuto.toggle()             // 切换面板显隐
__narutoAuto.operator.click(x,y)  // 单点
__narutoAuto.scenes.current       // 当前场景
__narutoAuto.runtime              // 中止信号（接管调试时如遇「已中止」先 runtime.reset()）
__narutoAuto.vision.status()      // 画面状态：ok / no-element / not-ready / tainted
__narutoAuto.vision.saveSnapshot()// 下载当前帧 PNG
__narutoAuto.tasks                // 所有任务定义
__narutoAuto.probes               // 所有探针
__narutoAuto.coords               // 坐标表（唯一的坐标来源，1280x720 逻辑空间）
__narutoAuto.calib.code()         // 导出校准代码（按命名点号分组）
__narutoAuto.calib.rename(1,'nav.store')  // 给第 1 步改名
__narutoAuto.calib.renameAll('nav')       // 批量改名成 nav.1 / nav.2 …
__narutoAuto.calib.list()                 // 列出全部步骤
```

> 悬浮球快捷键：`Ctrl+Shift+A` 切换面板显隐；`Ctrl+Shift+Q` 紧急停止。双击悬浮球直接跑全部已启用任务。

## 开发工具

| 工具 | 用途 |
|------|------|
| `tools/tm-push.cjs` | 推送脚本到 Tampermonkey（CDP 连 CentBrowser 9222）：按 `@version` 取目标版本、已是目标版本直接跳过（幂等）、精确选择器多层连点、慢读校验、退出码 0/2 区分成功失败 |
| `tools/task-order-check.cjs` | 任务排序静态回归校验：断言按钮顺序 / GROUPS 顺序 / 已启用队列中日常全在收获前 |
| `tools/diagnose.user.js` | 独立诊断脚本（SDK / 画面 / 场景 / 坐标映射） |
| `tools/selftest.html` | 离线自测环境（伪 TCGSDK + 合成画面），21/21 通过 |
| `tools/vision-lab.html` | 视觉标定实验室：拖入截图生成探针片段 |
| `tools/coord-calibrator.html` | 坐标标定工具（上游） |
| `tools/tcgsdk-debug.user.js` | TCGSDK 调试助手 |

```bash
# 推送脚本到本机 Tampermonkey（需 CentBrowser 开 --remote-debugging-port=9222）
export NODE_PATH="C:/Users/chenyu/.workbuddy/binaries/node/workspace/node_modules"
node tools/tm-push.cjs 0.5.62

# 任务排序回归校验
node tools/task-order-check.cjs
```

> `tm-push.cjs` 依赖 Playwright：若未在项目内 `npm i playwright`，可先用 `NODE_PATH` 指向已装好的 node_modules。

## 自测（无登录 / 无游戏）

`tools/selftest.html` 内置一个伪 TCGSDK 和一个 1280×720 合成画面，可在没有云游戏、没有登录、纯离线的情况下验证脚本核心逻辑：

```bash
# 浏览器直接打开
file:///C:/Users/chenyu/WorkBuddy/2026-09-09-00-36-49/naruto-auto/tools/selftest.html
```

- 脚本初始化 / Vision 画面捕获 / SDK 适配 / 6 类场景判定（home/popup/battle/battle_end/loading/other）
- 弹窗精准点关 / 任务执行 / 每日去重
- 战斗结束检测 / 停止快速响应 / 面板渲染 / 无运行时错误
- 悬浮球用例（默认收起、位于左下远离右上角、单击展开、展开不占右上角、运行时自动收起）

## 真实页面回归

1. 安装 Tampermonkey + 脚本
2. 打开 https://start.qq.com/webgame/gift-center/700724
3. F12 看控制台，应有：
   - `✓ SDK 就绪: Oprate (...)`（腾讯云游戏新版；旧版仍兼容 TCGSDK / gamematrix 回退）
   - `✓ 已捕获画面元素 <video> 1920x1080`
   - `✓ 初始化完成。控制台可用 __narutoAuto.probe() ...`
4. 在云游戏主界面执行 `__narutoAuto.probe()`，看到 `场景: 主界面`
5. 点开悬浮球 → 「🔍 探测」，逐项对照实际画面是否符合（d<35 为命中）
6. 跑一个收集类任务验证（🎁 收获 → 邮件领取）

## 参考项目

- [NarutoScript](https://github.com/Elmyran/NarutoScript) — 任务流程 + UI 探针标定
- [Xuan-s-UltilityAutoNaruto](https://github.com/XBJF-X/Xuan-s-UltilityAutoNaruto) — 图像检测参考
- [AzurLaneAutoScript](https://github.com/LmeSzinc/AzurLaneAutoScript) — Alas 架构参考

## 文档

- [任务流程参考](docs/task-flow.md)
- [开发指南](docs/development.md)
- [常见问题](docs/faq.md)
- [版本记录](CHANGELOG.md) — v0.5.62
- [视觉探针集（生成版）](tools/vision-lab.html) — 拖入截图即可标定
- [自测环境](tools/selftest.html) — 无游戏验证脚本

## 许可证

MIT
