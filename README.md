# 火影忍者云游戏自动化 (Naruto Auto)

基于腾讯云游戏 TCGSDK 的火影忍者手游自动化脚本，无需模拟器，浏览器直接运行。

> ⚠️ 本项目仅供学习交流，使用风险自负。

## 功能概览

### ✅ 已实现（v0.1.0）

| 分类 | 功能 |
|------|------|
| **每日收获** | 招财、邮件领取、每日签到、每日分享、赠送体力、情报社、排行榜点赞、活跃度宝箱、忍法帖、免费招募 |
| **日常任务** | 组织祈福、丰饶之间、小队突袭、生存试炼、装备扫荡、任务集会所、秘境挑战、商店购买 |
| **周常任务** | 修行之路、追击晓组织、叛忍来袭、组织要塞、天地战场 |
| **UI 面板** | 拖拽式控制面板、任务开关配置、实时日志、状态显示 |
| **调度系统** | 任务队列、失败重试、暂停/恢复、进度追踪 |

### 🚧 计划中

- 坐标标定工具（截图+像素测量）
- 截图 OCR 辅助（画面状态检测）
- Cookie 持久化管理
- 多分辨率适配
- 限时活动任务（丁次烤肉、樱花季等）

## 快速开始

### 环境要求

- 浏览器：Chrome / Edge（推荐）
- 扩展：[Tampermonkey](https://www.tampermonkey.net/)
- 分辨率：1280×720（16:9）

### 安装步骤

1. **安装 Tampermonkey 浏览器扩展**

2. **打开云游戏页面**
   ```
   https://start.qq.com/webgame/gift-center/700724?ADTAG=10000000
   ```

3. **手动登录一次**（后续可复用 Cookie）

4. **安装脚本**
   - 方式 A：Tampermonkey 面板 → 新建脚本 → 粘贴 `naruto-auto.user.js` 内容 → 保存
   - 方式 B（开发中）：直接从 Greasy Fork 安装

5. **进入游戏**，右上角会出现控制面板

### 使用方法

1. 等待游戏加载完成，控制面板显示"就绪"
2. 点击 **▶ 开始执行** 运行所有已启用的任务
3. 或使用快捷按钮：
   - **🎁 一键收获**：只执行收获类任务
   - **⚔ 日常任务**：只执行日常战斗任务
   - **📅 周常任务**：只执行周常任务
4. 点击 **⚙ 配置** 可开关具体任务

## 技术架构

```
┌──────────────────────────────────────────────┐
│              浏览器 (Tampermonkey)             │
│                                              │
│  ┌────────────┐    ┌──────────────────────┐  │
│  │  油猴脚本   │───→│   NarutoAuto         │  │
│  └────────────┘    │                      │  │
│                    │  ┌─ Config           │  │
│                    │  ├─ GameOperator     │  │
│                    │  ├─ TaskScheduler    │  │
│                    │  ├─ Tasks (23个)     │  │
│                    │  ├─ COORDS           │  │
│                    │  └─ ControlPanel     │  │
│                    └──────────┬───────────┘  │
│                               │              │
│                    ┌──────────▼───────────┐  │
│                    │   TCGSDK (云游戏)     │  │
│                    └─────────────────────┘  │
└──────────────────────────────────────────────┘
```

### 核心模块

| 模块 | 职责 |
|------|------|
| `GameOperator` | TCGSDK 封装层，提供 click/swipe/keyPress/waitForBattle 等操作 |
| `TaskScheduler` | 最小堆调度器，支持队列、重试、暂停/恢复 |
| `BaseTask` | 任务基类，提供 goBack/goHome/tapConfirm 等通用操作 |
| `Config` | 配置管理，GM_setValue 持久化 |
| `COORDS` | 坐标定义（基于 1280×720） |
| `ControlPanel` | 可视化控制面板，拖拽、日志、状态显示 |

## 坐标系统

所有坐标基于 **1280×720** 基准分辨率定义，运行时按实际 canvas 尺寸自动缩放。

坐标定义在脚本的 `COORDS` 对象中，分为：
- `main` — 主界面导航
- `common` — 通用按钮（返回、确认、挑战等）
- `collect` — 收获类操作坐标
- `daily` — 日常任务坐标
- `weekly` — 周常任务坐标
- `battle` — 战斗相关坐标

> ⚠️ **重要**：当前坐标为估算值，实际使用前需要用坐标标定工具校准。

## 配置说明

配置通过 Tampermonkey 的 `GM_setValue` 持久化存储。

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `baseResolution` | 基准分辨率 | 1280×720 |
| `delay.click` | 点击后等待 | 300-600ms |
| `delay.pageLoad` | 页面加载等待 | 1500-3000ms |
| `delay.battle` | 战斗等待 | 30-90s |
| `retry.maxAttempts` | 最大重试次数 | 3 |
| `taskSwitches.*` | 各任务开关 | 大部分开启 |

## 开发指南

### 调试

在浏览器控制台中可通过 `window.__narutoAuto` 访问所有模块：

```javascript
// 查看调度器状态
__narutoAuto.scheduler.getStatus()

// 手动点击坐标
__narutoAuto.operator.click(640, 360)

// 查看当前配置
__narutoAuto.config.data

// 查看坐标定义
__narutoAuto.coords
```

### 添加新任务

1. 在 `COORDS` 中添加坐标
2. 继承 `BaseTask` 创建任务类
3. 实现 `execute(op, cfg)` 方法
4. 在 `TaskFactory` 中注册
5. 在 `DEFAULT_CONFIG.taskSwitches` 中添加开关

```javascript
class MyNewTask extends BaseTask {
  constructor() { super('我的新任务', 'daily'); }
  async execute(op, cfg) {
    // 1. 导航到目标界面
    await op.clickNatural(COORDS.main.adventure.x, COORDS.main.adventure.y);
    await Utils.randomDelay(cfg.get('delay.pageLoad.min'), cfg.get('delay.pageLoad.max'));

    // 2. 执行操作
    await op.clickNatural(COORDS.some.button.x, COORDS.some.button.y);
    await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));

    // 3. 等待/确认
    await this.tapConfirm(op);

    // 4. 返回
    await this.goBack(op);
  }
}
```

### 坐标标定方法

1. 在云游戏页面截图
2. 用图片编辑工具（如 Photoshop、GIMP）查看目标按钮的像素坐标
3. 坐标基于 1280×720 基准，如果不是此分辨率需按比例换算
4. 更新 `COORDS` 中对应值

## 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1.0 | 2026-09-08 | 初版：23个任务、控制面板、任务调度器、TCGSDK封装 |

## 许可证

MIT License

## 参考项目

- [NarutoScript](https://github.com/Elmyran/NarutoScript) — 任务流程参考
- [Xuan-s-UltilityAutoNaruto](https://github.com/XBJF-X/Xuan-s-UltilityAutoNaruto) — 图像检测参考
- [AzurLaneAutoScript](https://github.com/LmeSzinc/AzurLaneAutoScript) — Alas 架构参考
