# 开发指南

## 项目结构

```
naruto-auto/
├── naruto-auto.user.js      # 主脚本（Tampermonkey 油猴脚本）
├── install.html              # 一键安装页面
├── README.md                 # 项目说明
├── CHANGELOG.md              # 版本记录
├── LICENSE                   # MIT 许可证
├── package.json              # 项目元数据
├── docs/
│   ├── task-flow.md          # 任务流程参考
│   └── development.md        # 本文档
└── tools/
    ├── coord-calibrator.html # 坐标标定工具（离线）
    └── tcgsdk-debug.user.js  # TCGSDK 调试助手
```

## 开发环境

### 前置条件

1. Chrome / Edge 浏览器
2. Tampermonkey 扩展
3. 腾讯云游戏账号

### 开发流程

1. **修改脚本**：编辑 `naruto-auto.user.js`
2. **更新 Tampermonkey**：复制内容到 Tampermonkey 编辑器 → 保存
3. **刷新云游戏页面**：F5 刷新，脚本自动加载
4. **调试**：打开 DevTools (F12) 查看 console 日志

### 调试技巧

#### 控制台访问

```javascript
// 访问全局对象
__narutoAuto.config          // 配置
__narutoAuto.operator        // 操作器
__narutoAuto.scheduler       // 调度器
__narutoAuto.coords          // 坐标定义
__narutoAuto.recorder        // 坐标录制器

// 手动点击测试
__narutoAuto.operator.click(640, 360)

// 查看配置
__narutoAuto.config.data

// 修改配置
__narutoAuto.config.set('delay.battle.max', 60000)
```

#### TCGSDK 调试

安装 `tools/tcgsdk-debug.user.js` 脚本，按 Ctrl+Shift+D 重新检测。

#### 坐标标定

1. **在线标定**：使用控制面板的「🎯 录制」按钮
2. **离线标定**：打开 `tools/coord-calibrator.html`，加载截图标定

## 架构说明

### 模块职责

| 模块 | 类名 | 职责 |
|------|------|------|
| 工具函数 | `Utils` | sleep、randomDelay、log、waitFor |
| 配置管理 | `Config` | GM_setValue 持久化、get/set/reset |
| Cookie 管理 | `CookieManager` | 登录态检测、登录提醒 |
| 场景检测 | `SceneDetector` | 识别当前游戏界面 |
| 战斗检测 | `BattleDetector` | 像素采样判断战斗结束 |
| 弹窗处理 | `PopupHandler` | 自动关闭已知弹窗 |
| 坐标录制 | `CoordRecorder` | 运行时录制坐标并导出 |
| 操作封装 | `GameOperator` | TCGSDK 封装 (click/swipe/key) |
| 任务调度 | `TaskScheduler` | 队列、重试、暂停、事件 |
| 任务基类 | `BaseTask` | 通用操作 (back/confirm/waitForBattle) |
| 具体任务 | `*Task` | 23 个任务的具体实现 |
| 任务工厂 | `TaskFactory` | 根据配置创建任务列表 |
| 控制面板 | `ControlPanel` | 可视化 UI |
| 主入口 | `NarutoAuto` | 初始化、组装、启动 |

### 数据流

```
用户点击 "开始"
    ↓
ControlPanel → TaskFactory.createAll(config)
    ↓
TaskScheduler.addTasks(tasks)
    ↓
TaskScheduler.start()
    ↓ (循环)
┌─ queue.shift() → task.execute(op, cfg, popup)
│   ├─ popup.dismissQuick()     // 关闭弹窗
│   ├─ op.clickNatural(...)     // 导航 + 操作
│   ├─ battleDetector.wait()    // 战斗等待
│   └─ task.back()              // 返回
├─ emit('taskDone'/'taskFailed')
└─ 继续下一个
    ↓
emit('complete') → 更新 UI
```

## 添加新任务

### 步骤

1. **定义坐标**：在 `COORDS` 对象中添加
2. **创建任务类**：继承 `BaseTask`
3. **注册到工厂**：在 `TaskFactory._map` 中添加
4. **添加配置开关**：在 `DEFAULT_CONFIG.taskSwitches` 中添加
5. **更新 UI 标签**：在 `ControlPanel._html()` 的 labels 中添加

### 模板

```javascript
class MyNewTask extends BaseTask {
  constructor() { super('我的新任务', 'daily'); } // category: collect/daily/weekly

  async execute(op, cfg, popup) {
    // 1. 关闭弹窗
    await popup.dismissQuick();

    // 2. 导航到目标界面
    await this.navigateTo(op, COORDS.myModule.entry, cfg);

    // 3. 执行操作
    await op.clickNatural(COORDS.myModule.button.x, COORDS.myModule.button.y);
    await Utils.randomDelay(cfg.get('delay.short.min'), cfg.get('delay.short.max'));

    // 4. 如果有战斗
    await this.waitForBattle(op, cfg, popup);

    // 5. 确认结果
    await this.confirm(op);

    // 6. 返回
    await this.back(op);
  }
}
```

## 坐标标定流程

### 在线标定（推荐）

1. 打开云游戏页面，进入游戏
2. 点击控制面板「🎯 录制」按钮
3. 依次点击需要标定的 UI 元素
4. 每次点击会弹出命名框，输入如 `main.adventure`
5. 点击「⏹ 停止录制」
6. 在控制台执行 `__narutoAuto.recorder.exportJS()` 获取代码
7. 更新 `COORDS` 对象

### 离线标定

1. 截图游戏画面（1280×720）
2. 打开 `tools/coord-calibrator.html`
3. 拖入截图
4. 输入坐标名称，点击画面标记
5. 点击「导出 JS」获取代码

## 测试策略

### 单任务测试

```javascript
// 只执行一个任务进行测试
const task = TaskFactory.createSingle('collectGold');
__narutoAuto.scheduler.queue = [];
__narutoAuto.scheduler.addTask(task);
__narutoAuto.scheduler.start();
```

### 坐标验证

```javascript
// 在指定坐标点击，观察游戏反应
__narutoAuto.operator.click(150, 650) // 主界面"冒险"按钮位置
```

### 配置调优

```javascript
// 增加延时（网络慢时）
__narutoAuto.config.set('delay.pageLoad.min', 3000)
__narutoAuto.config.set('delay.pageLoad.max', 5000)

// 减少延时（本地调试快时）
__narutoAuto.config.set('delay.click.min', 200)
__narutoAuto.config.set('delay.click.max', 400)
```

## 已知限制

1. **坐标固定**：不同设备/分辨率需要重新标定
2. **战斗检测**：像素采样可能被 CORS 限制，降级为固定延时
3. **弹窗识别**：仅支持已知弹窗位置，新弹窗可能无法自动关闭
4. **TCGSDK 版本**：不同版本 API 可能不同，需要适配

## 后续优化方向

- [ ] 基于 OCR 的画面文字识别
- [ ] 多分辨率自动适配
- [ ] 限时活动自动识别
- [ ] 执行统计和报表
- [ ] 远程控制（通过消息推送控制启停）
