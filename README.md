# 火影忍者云游戏自动化 (Naruto Auto)

基于腾讯云游戏 TCGSDK / gamematrix 的火影忍者手游自动化脚本，浏览器直接运行。

> ⚠️ 本项目仅供学习交流，使用风险自负。

## 功能概览

### ✅ 已实现（v0.4.3）

| 分类 | 功能 |
|------|------|
| **每日收获** | 招财、邮件领取、每日签到、每日分享、赠送体力、情报社、排行榜点赞、活跃度宝箱、忍法帖、免费招募 |
| **日常任务** | 组织祈福、丰饶之间、小队突袭、生存试炼、装备扫荡、任务集会所、秘境挑战、商店购买 |
| **周常任务** | 修行之路、追击晓组织、叛忍来袭、组织要塞、天地战场 |
| **UI 面板（悬浮球）** | 默认收起为 54×54 🍥 悬浮球，运行时自动隐藏防遮挡；展开含任务开关、实时日志、状态徽章、画面预览、点击取色、配置面板；双击悬浮球一键跑全部启用任务 |
| **调度系统** | 任务队列、失败重试、单任务超时、暂停/恢复、立即停止、每日/每周完成记忆 |
| **多 SDK 适配** | 优先 Oprate（`window.Oprate` 14 法）→ `_START_ARM_CG_`（touchControl）→ TCGSDK / GMSDK / gamematrix fallback |
| **视觉检测** | video→canvas 帧捕获、64×36 灰度签名帧差异、亮度标准差去噪、6 类场景打分制判定 |
| **场景导航** | 主界面/战斗/结算/弹窗/加载/每日页/商店页识别；精准点关；强制回主界面 |
| **智能战斗** | 三级结束判定（结算指纹 → 中心区帧静止 → 超时）、自动开自动/倍速、结算 8 轮兜底 |
| **登录管理** | Cookie 登录态检测（不强制拦截，仅做提示） |
| **坐标校准** | 面板「🎓 校准」录制点击 + 按键 + 长按时长，抓帧取色生成探针；支持命名/点号分组导出 |
| **校准工具** | `tools/vision-lab.html` 拖入截图生成探针；面板内「点击取色」即时生成片段 |
| **自测环境** | `tools/selftest.html` 无登录验证脚本核心逻辑（21/21 通过，含悬浮球/自动隐藏用例） |

### 🚧 计划中

- OCR 辅助（需要联网，可选）
- 限时活动（丁次烤肉、樱花季）
- 任务执行报表（每日/每周统计）

## 快速开始

### 环境要求

- 浏览器：百分浏览器 / Chromium 134+（v0.4.3 已用真实环境验证）
- 扩展：[Tampermonkey](https://www.tampermonkey.net/)
- 云游戏：腾讯 START（start.qq.com / cg.qq.com / cloudgame.qq.com）

### 实际跑通的栈（v0.4.3 真实环境）

| 层 | 真实值 |
| --- | --- |
| SDK | `window.Oprate`（14 个输入方法） + `window._START_ARM_CG_`（touchControl + WebRTC） |
| 视频元素 | `<video id="gmsdk-video-element" class="gmsdk-video-player">` 1920×1080 流 / 1920×911 视口显示 |
| 输入坐标 | Oprate 接受 `clientX/clientY`（视口像素），DOM 派发到 `elementFromPoint(x,y)` 的元素 |

### 安装步骤

1. 安装 Tampermonkey 扩展
2. Tampermonkey → 新建脚本 → 粘贴 `naruto-auto.user.js` 全部内容 → 保存
3. 打开 `https://start.qq.com/webgame/gift-center/700724`
4. **手动登录**（首次） → 点右下角蓝色「启动游戏」按钮 → 等待进入云游戏 session（URL 会跳到 `start.qq.com/game/arm-game/#/game/...`）
5. 游戏画面左下角出现 🍥 悬浮球即脚本就绪（v0.4.3 起面板默认收起，不遮挡右上角关闭按钮）

### 第一次使用建议

1. F12 控制台执行 `__narutoAuto.diag()` → 应输出 `sdk: {name: "Oprate"}`，剪贴板里有完整诊断 JSON
2. 点开悬浮球 → 「🔍 探测」列出所有视觉探针的实际距离 → 主界面 7 个探针应全 ✅
3. 点「🏠 回主界面」走一遍 → 应输出「完成（X秒）」
4. 跑「🎁 收获」里的邮件领取 → 验证端到端流程
5. **面板默认收起**：平时只留 🍥 悬浮球；单击展开/收起，双击直接跑全部已启用任务；`Ctrl+Shift+A` 也可切换显隐

## 技术架构

```
┌────────────────────────────────────────────────────────┐
│              浏览器 (Tampermonkey)                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  油猴脚本  naruto-auto.user.js                  │  │
│  │  ┌─ Config · Store · Progress                   │  │
│  │  ├─ SdkAdapter  (Oprate / _START_ARM_CG_ / legacy)  │  │
│  │  ├─ VisionCore  (video → canvas → 帧差异)        │  │
│  │  ├─ SceneDetector (场景判定)                     │  │
│  │  ├─ GameOperator (click/swipe/key + jitter)     │  │
│  │  ├─ Navigator     (弹窗 / 强制回主界面)          │  │
│  │  ├─ BattleFlow    (等战斗结束 / 结算清理)        │  │
│  │  ├─ Tasks         (23 个)                       │  │
│  │  ├─ TaskScheduler (重试 / 超时 / 停止 / 去重)    │  │
│  │  └─ ControlPanel  (状态 / 按钮 / 预览 / 设置)    │  │
│  └────────────────────┬────────────────────────────┘  │
│                       │                                │
│                ┌──────▼──────┐                         │
│                │   云游戏 SDK  │                        │
│                └──────┬──────┘                         │
│                       │                                │
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
| `VisionCore` | 帧捕获、短时缓存、64×36 灰度签名、亮度标准差、下载快照 |
| `SceneDetector` | 打分制场景判定，连续 2 帧一致才确认 |
| `GameOperator` | 基于 SdkAdapter 的 click/swipe/longPress/key |
| `Navigator` | dismissOnce / goHome / ensureHome |
| `BattleFlow` | waitForEnd / clearSettlement / run |
| `TaskContext` | 给 task 提供 tap / go / popups / home / fight / waitScene |
| `TaskScheduler` | 队列 / 重试 / 超时 / 事件 / 停止 / 每日去重 |
| `ControlPanel` | 拖拽面板、状态徽章、预览取色、设置面板、任务列表 |
| `NarutoAuto` | 主入口：异步检测 SDK，画面元素看门狗 |

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

## 坐标系统

所有坐标基于 **1280×720** 基准分辨率定义，运行时按视频元素真实尺寸（`videoWidth × videoHeight`）自动换算。

| 组 | 数据来源 | 可信度 |
|---|---------|-------|
| `COORDS.nav` | NarutoScript 标定 | ✅ 实战可用 |
| `COORDS.common.close` | 通用规则 | ✅ 已被 minStd 加固 |
| `COORDS.common.back` | 估算 | ⚠ 需校准 |
| `COORDS.collect / daily / weekly / battle` | 估算 | ⚠ 需校准 |

校准方式（任选其一）：
- **🎓 校准模式（推荐，v0.4.7+）**：面板「🎓 校准」或 `Ctrl+Shift+C` 开启 → 手动把任务做一遍（**点击和键盘快捷键都会记录**，长按会记时长）→ Esc 结束 →「💾 导出」。生成的 `COORDS.calib` + `COORDS.calibFlow` 直接可用
  - 「▶ 回放」或 `Ctrl+Shift+P`：把录的序列重放一遍验证（回放中再按一次停止）
  - 「✏ 命名」（v0.5.5+）：给每步起个有意义的名字，支持点号分组（如 `nav.store` → 导出为 `COORDS.nav.store`）；「📃 列表」打印当前步骤
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
| `battle.postRounds` | 结算循环轮数 | 8 |
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
__narutoAuto.vision.status()      // 画面状态：ok / no-element / not-ready / tainted
__narutoAuto.vision.saveSnapshot()// 下载当前帧 PNG
__narutoAuto.tasks                // 所有任务定义
__narutoAuto.probes               // 所有探针
__narutoAuto.coords               // 坐标表（唯一的坐标来源，1280x720 逻辑空间）
__narutoAuto.calib.code()         // 导出校准代码（按命名点号分组）
__narutoAuto.calib.rename(1,'nav.store')  // 给第 1 步改名（v0.5.5+）
__narutoAuto.calib.renameAll('nav')       // 批量改名成 nav.1 / nav.2 …（v0.5.5+）
__narutoAuto.calib.list()                 // 列出全部步骤（v0.5.5+）
```

> 悬浮球快捷键：`Ctrl+Shift+A` 切换面板显隐；`Ctrl+Shift+Q` 紧急停止。双击悬浮球直接跑全部已启用任务。

## 自测（无登录 / 无游戏）

`tools/selftest.html` 内置一个伪 TCGSDK 和一个 1280×720 合成画面，可在没有云游戏、没有登录、纯离线的情况下验证脚本核心逻辑：

```bash
# 1) 浏览器打开
file:///C:/Users/chenyu/WorkBuddy/2026-09-09-00-36-49/naruto-auto/tools/selftest.html

# 2) 或用 playwright 自动化跑
node tools/run-selftest.mjs    # 已在 .tmp/ 里附脚本
```

当前 21/21 通过：
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
- [版本记录](CHANGELOG.md)
- [视觉探针集（生成版）](tools/vision-lab.html) — 拖入截图即可标定
- [自测环境](tools/selftest.html) — 无游戏验证脚本

## 许可证

MIT
