# 常见问题 (FAQ)

## 安装相关

### Q: 脚本安装后看不到控制面板？
**A:** 检查以下几点：
1. 确认已在 Tampermonkey 中启用脚本（绿色开关）
2. 确认已进入云游戏页面（URL 包含 `start.qq.com`）
3. 等待游戏画面完全加载（约 5-10 秒）
4. 按 F12 打开控制台，查看是否有 `[NarutoAuto]` 开头的日志

### Q: 提示"TCGSDK 未找到"？
**A:** 
1. 确认已进入云游戏页面，且游戏画面可见
2. 等待更长时间（有时 SDK 加载较慢）
3. 安装 `tools/tcgsdk-debug.user.js` 调试脚本检测
4. 按 Ctrl+Shift+D 重新检测

### Q: 提示"需要登录"？
**A:** 
1. 手动登录云游戏平台
2. 登录后刷新页面
3. Cookie 过期后需要重新登录

## 使用相关

### Q: 任务执行到一半卡住了？
**A:**
1. 点击「⏹ 停止」按钮
2. 手动返回游戏主界面
3. 检查日志查看卡在哪一步
4. 可能是坐标不准，需要重新标定

### Q: 点击位置不对？
**A:**
1. 使用「🎯 录制」模式重新标定坐标
2. 或使用 `tools/coord-calibrator.html` 离线标定
3. 将标定结果更新到 `COORDS` 对象中

### Q: 战斗等待时间太长/太短？
**A:**
调整配置：
```javascript
// 控制台执行
__narutoAuto.config.set('delay.battle.min', 20000)  // 最少等待 20s
__narutoAuto.config.set('delay.battle.max', 60000)  // 最多等待 60s
```

### Q: 弹窗没有自动关闭？
**A:**
1. 记录弹窗的位置（使用坐标录制）
2. 在 `PopupHandler.knownPopups` 中添加新弹窗坐标
3. 提交 Issue 反馈弹窗信息

### Q: 如何只执行部分任务？
**A:**
1. 点击「⚙」打开配置面板
2. 取消不需要的任务勾选
3. 点击「保存」
4. 或使用快捷按钮：「🎁 收获」「⚔ 日常」「📅 周常」

## 调试相关

### Q: 如何查看详细日志？
**A:**
1. 按 F12 打开 DevTools
2. 切换到 Console 标签
3. 过滤 `NarutoAuto` 关键词
4. 日志包含时间戳和级别

### Q: 如何测试单个任务？
**A:**
```javascript
const task = TaskFactory.createSingle('collectGold');
__narutoAuto.scheduler.queue = [];
__narutoAuto.scheduler.addTask(task);
__narutoAuto.scheduler.start();
```

### Q: 如何重置所有配置？
**A:**
```javascript
__narutoAuto.config.reset();
location.reload();
```

## 平台相关

### Q: 支持哪些浏览器？
**A:** 
- Chrome 80+ ✓
- Edge 80+ ✓
- Firefox 78+ ✓（需 Tampermonkey 4.12+）
- Safari 14+ ✓（需 Tampermonkey for Safari）

### Q: 支持哪些分辨率？
**A:**
理论支持所有 16:9 分辨率，坐标会自动缩放。但不同分辨率下 UI 布局可能略有差异，建议使用 1280×720 或 1920×1080。

### Q: 脚本会不会被检测？
**A:**
1. 脚本通过 TCGSDK 官方接口发送事件，与正常操作无异
2. 操作间隔加入随机延时，模拟人类行为
3. 但仍存在风险，建议使用小号测试
