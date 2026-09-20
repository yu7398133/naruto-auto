# 开发指南

> 对应 **v0.5.81**。架构总览见 [architecture.md](architecture.md)，**接手前必读 [HANDOFF.md](../HANDOFF.md)**。

## 1. 项目结构

```
naruto-auto/
├── naruto-auto.user.js      # 主脚本（单文件，无构建步骤）
├── HANDOFF.md               # 交接文档 ⭐ 接手必读
├── README.md                # 项目说明（面向使用者）
├── CHANGELOG.md             # 版本记录（改动理由写得非常细，是本项目最有价值的上下文）
├── LICENSE / package.json / install.html
├── docs/
│   ├── architecture.md      # 架构与图谱（含 Mermaid 图 + 代码地图）
│   ├── development.md       # 本文档
│   ├── task-flow.md         # 每个任务的游戏内操作步骤
│   └── faq.md
├── tools/                   # 开发与调试工具（见 §6）
└── assets/                  # 文档截图
```

**为什么是单文件**：Tampermonkey 的分发单位就是单个 `.js`（`@updateURL` 指向一个文件），
所以没有打包步骤 —— 改完直接推给 Tampermonkey 就算上线。

## 2. 开发环境

| 前置 | 说明 |
|---|---|
| 浏览器 | 百分浏览器 / Chromium 134+ |
| 扩展 | [Tampermonkey](https://www.tampermonkey.net/) |
| 账号 | 腾讯云游戏账号（真机验证用） |
| Node.js | 跑自检与工具脚本（`node --check` 必用） |

## 3. 改代码流程

### 3.1 基本循环

```bash
# ① 先备份（本项目 git 长期不 commit，git 不是回滚手段）
cp naruto-auto.user.js naruto-auto.user.js.pre082

# ② 改代码 —— 推荐用 Python 定点替换 + 锚点断言，不要手动大段替换
#    见 §3.2

# ③ 语法自检（必做）
node --check naruto-auto.user.js

# ④ 任务顺序回归（改了 TASK_DEFS 之后必做）
node tools/task-order-check.cjs

# ⑤ 推到本机 Tampermonkey 验证（需浏览器开 --remote-debugging-port=9222）
node tools/tm-push.cjs 0.5.82

# ⑥ 同步 4 处版本号 + 文档（见 §3.3）
```

### 3.2 改单文件的安全姿势

脚本有 7 千多行，且**同一文件的多处编辑会互相覆盖**（每次编辑基于同一份旧快照落盘）。
所以：

```python
# ✅ 推荐：一个 Python 脚本里跑完全部改动，每处都做锚点断言
import io
P = 'naruto-auto.user.js'
src = open(P, encoding='utf-8').read()

def rep(old, new, tag):
    global src
    n = src.count(old)
    assert n == 1, '[%s] 锚点命中 %d 次（应为 1）' % (tag, n)
    src = src.replace(old, new, 1)
    print('  ✓ %s' % tag)

rep("// @version      0.5.81", "// @version      0.5.82", "P1a @version")
rep("const VERSION = '0.5.81';", "const VERSION = '0.5.82';", "P1b VERSION")
# ... 其余改动

open(P, 'w', encoding='utf-8', newline='').write(src)   # newline='' 保持原换行符
```

铁律：

- **`assert count == 1`** —— 锚点必须唯一，命中 0 次或多次都立刻停下。
- **增行改动一律用「内容定位」，不要用行号** —— 先执行的增行会让后面所有行号整体偏移。
- **落盘后回读断言**（`readFileSync` 检查关键字符串），不要只信写入回执。
- **`newline=''`** —— 否则 Python 会改写换行符，git diff 会整文件飘红。

### 3.3 版本号必须同步 4 处

| 位置 | 内容 |
|---|---|
| 脚本头部 | `// @version      0.5.82` |
| 脚本内 | `const VERSION = '0.5.82';` |
| `CHANGELOG.md` | 顶部新增 `## v0.5.82 (日期)` 条目 |
| `README.md` | 徽章 `version-0.5.82-blue` |

`package.json` 的 `version` 也应同步。漏掉 `@version` → Tampermonkey 不提示更新；
漏掉 `VERSION` → 面板标题显示旧版本。

## 4. 添加新任务

任务系统是**声明式**的：在 `TASK_DEFS` 数组里追加一个对象即可，不需要改别的地方
（配置开关按默认值自动补齐，面板按分类自动渲染）。

### 4.1 完整步骤

**① 在 `TASK_DEFS` 里加一项**（搜 `const TASK_DEFS = [`）：

```js
{
  key: 'myNewTask',              // 唯一 ID；配置开关 taskSwitches[key] 用它
  name: '我的新任务',             // 面板显示名
  category: 'daily',             // daily | collect | weekly | battle
  timeout: 300000,               // 可选：单任务超时（缺省用 runtime.taskTimeout = 240s）
  steps: ['回主界面', '进入XX页', '点YY', '领奖励'],   // 画面流程图声明（展示用）
  async run(ctx) {
    // ── 用 ctx 提供的能力 ──
    await ctx.go('进入XX页', [812, 646]);      // 点一个落点，自动推进 steps
    const ok = await ctx.waitScene(SCENE.STORE, 8000);   // 等某个场景出现
    await ctx.tap([960, 520], null, '点YY');   // 再点一下
    ctx.stepResult(true);
  },
},
```

**② 补坐标**：在 `COORDS` 里加分组（搜 `const COORDS = {`）。
如果坐标比较多/较独立，也可以像 `MISSION` 那样在任务附近定义专属常量块。

**③ 验证**：

```bash
node --check naruto-auto.user.js
node tools/task-order-check.cjs      # 改了顺序/数量必跑
```

### 4.2 `steps` 与 `ctx.step()`

- `steps[]` 只是**流程图声明**，用于面板上展示"跑到第几步"。
- `ctx.tap / go / home / drag` 会**自动推进**索引（内部 `_advance`）。
- 用 `ctx.op.*` 等底层 API 时**必须手动 `ctx.step('说明')`**，否则流程图与实际不同步。
- **助手/循环内部的不定次点击一律用 `ctx.op.clickNatural(x, y, null, label)`** ——
  `ctx.tap` 会推进流程图索引，循环里用会让阶段整体错位。

### 4.3 分类与顺序规则

| 分类 | 键 | 面板顺序 | 记录「当天已做过」 |
|---|---|---|---|
| ⚔ 日常 | `daily` | RANK 0 | ✅ |
| 🎁 收获 | `collect` | RANK 1 | ✅ |
| 📅 周常 | `weekly` | RANK 2 | ✅ |
| 🥊 战斗 | `battle` | RANK 3 | ❌ 长期任务，点了就要跑 |

- 执行顺序 = **分类 RANK → 分类内数组顺序**；日常必须全部排在收获之前（有静态回归测试守着）。
- `hangLoop: true` 的任务不参与分类按钮的「都没勾选 → 跑全部」兜底，需要单独勾选。
- 新增任务开关默认值：`weekly` 默认**关**，其它默认**开**。

### 4.4 任务模板

```js
{
  key: 'demoTask',
  name: '示例任务',
  category: 'collect',
  steps: ['回主界面', '打开活动', '领取', '关闭'],
  async run(ctx) {
    // ① 先回主界面（大多数任务以此为起点）
    if (!(await ctx.home())) throw new Error('回主界面失败');

    // ② 清掉挡路的弹窗
    await ctx.popups();

    // ③ 导航到目标界面
    await ctx.go('打开活动', [1024, 128]);
    if (!(await ctx.waitScene(SCENE.OTHER, 8000))) throw new Error('活动页没打开');

    // ④ 执行操作（需要"点了有反应"的判断时，用 diff 自检，见 HANDOFF §7.2）
    await ctx.tap([640, 520], null, '领取奖励');
    await ctx.waitQuiet(1200, 3);        // 等画面安静（吸收动画）

    // ⑤ 关闭/返回
    ctx.step('关闭');
    if (!(await ctx.home())) throw new Error('关闭后回不去主界面');
    ctx.stepResult(true);
  },
},
```

## 5. 坐标与视觉标定

### 5.1 坐标系

- 所有坐标基于 **1280×720 逻辑空间**，运行时按 `videoWidth × videoHeight` 换算。
- ⚠️ 换分辨率后**点击坐标**会自动换算，但**视觉探针的区域**也需要同步缩放 —— 这块目前是手工的。

### 5.2 标定方式（三选一）

**① 🎓 校准模式（推荐，能录到手势）**

1. 面板「🎓 校准」或 `Ctrl+Shift+C` 开启
2. 手动把任务做一遍（点击和屏幕位置都会记录，长按会记时长）
3. `Ctrl+Shift+E` 可录 Esc 键本身（单独按 Esc 是结束校准）
4. Esc 结束 → 「💾 导出」→ 得到 `COORDS.calib` + `COORDS.calibFlow`
5. 「▶ 回放」或 `Ctrl+Shift+P` 把序列重放一遍验证

**② 点击预览取色**：面板里点预览图 → 自动生成探针代码片段

**③ `tools/vision-lab.html`**：拖入离线截图批量标定

### 5.3 加/改视觉探针

在 `PROBES` 里加一项（搜 `const PROBES = {`）：

```js
myProbe: {
  area: [x1, y1, x2, y2],   // 1280×720 逻辑空间
  color: { r, g, b },       // 区域平均色
  tol: 35,                  // 曼哈顿距离容差
  minStd: 0,                // 亮度标准差下限（防纯色背景误判）
  click: [x, y],            // 命中后可选的点击落点
  label: '中文名',
  verified: true,
},
```

> ⚠️ **模板/探针务必在当前流分辨率下抠图** —— 云端可能把 720p 重采样成 1080p 推流，
> 抗锯齿变化会让旧模板失准（实测「普通招募」SAD 从 0 涨到 28.7，卡死在阈值 25 上）。

> ⚠️ **定阈值必须看负样本**：把「命中类」与「未命中类」的分值区间都列出来，阈值取中间。
> 详见 [HANDOFF §5.5](../HANDOFF.md)。

## 6. 测试策略

### 6.1 离线自测（无需登录 / 无需游戏）

```bash
# 浏览器直接打开（用相对路径避免本机路径写死）
#   <项目目录>/tools/selftest.html
```

内置伪 TCGSDK + 1280×720 合成画面，覆盖：脚本初始化 / 画面捕获 / SDK 适配 /
6 类场景判定 / 弹窗点关 / 任务执行 / 每日去重 / 战斗结束检测 / 停止响应 / 面板渲染 / 悬浮球用例。

### 6.2 静态回归

```bash
node --check naruto-auto.user.js      # 语法
node tools/task-order-check.cjs       # 任务顺序 / 分组 / 已启用队列顺序
```

### 6.3 单任务测试（真机）

```js
// 控制台：只跑一个任务
const t = __narutoAuto.tasks.find(x => x.key === 'collectMail');
__narutoAuto.scheduler.addTasks([t]);
__narutoAuto.scheduler.start();
```

### 6.4 判据的"回放验证"（本项目特有，强烈推荐）

改完视觉判据后，**用 Python 复刻脚本的判据，对真实录制帧复算**：

```python
# ① 常量从脚本源码正则读出（不要在 Python 里手抄）
SRC = open('naruto-auto.user.js', encoding='utf-8').read()
GLOW_LO = float(re.search(r'MISSION_GLOW_V = (\d+)', SRC).group(1))
GLOW_HI = float(re.search(r'MISSION_GLOW_V_MAX = (\d+)', SRC).group(1))

# ② 复刻判据（与脚本同口径）
def glow(a, k): ...

# ③ 对命中样本 + 未命中样本都跑一遍，列出两个区间
```

判据常量从源码读出来这一步很关键 —— 否则"验证通过"验的是你手抄的值，不是真代码。

## 7. 调试

### 7.1 控制台入口

```js
__narutoAuto.probe()          // 探测场景（输出每个探针的色距）
__narutoAuto.diag()           // 一键自检，自动复制 JSON 到剪贴板
__narutoAuto.vision.status()  // ok / no-element / not-ready / tainted
__narutoAuto.scenes.current   // 当前场景
__narutoAuto.tasks            // 任务定义
__narutoAuto.coords           // 坐标表
__narutoAuto.runtime.reset()  // 遇到「已中止」错误时先重置
```

完整列表见 README「控制台快捷 API」。

### 7.2 取证：自动运行追踪器

跑偏了 / 卡住了 / 点了不该点的 —— 开追踪器录下来逐帧核对：

- 面板「🔬 追踪」或 `Ctrl+Shift+T` 开关
- 记录：逻辑坐标、步骤说明、当时的场景判定、命中的探针（含色距）、点击瞬间缩略帧
- 导出：面板「💾 导出」→ 自包含 HTML，可上一步/下一步/自动播放/跳步
- 环形缓冲 2000 步；`AutoTrace` **只记 tap 不记 drag**

> 用户报障时**先要 trace**，不要凭猜测改代码。完整的方法论（三段式核对法）见
> [HANDOFF §9](../HANDOFF.md)。

### 7.3 SDK 层调试

装 `tools/tcgsdk-debug.user.js`，`Ctrl+Shift+D` 重新检测 SDK。
`SdkAdapter` 里有 `_scanHint` / `keyChannels` / `overlayScan` 可以帮助定位"输入为什么没生效"。

## 8. 已知限制

完整清单见 [HANDOFF §7](../HANDOFF.md)。要点：

1. **坐标与判据都是单环境标定的** —— 换设备/分辨率需重新标定。
2. **游戏改版 = 需要重标** —— 小队突袭、组织祈福、任务集会所都因改版重写过。
3. **云游戏「无操作超时」是对抗性最强的坑** —— 集会所挂机方案已失败三次，见 HANDOFF §7.1。
4. **战斗探针按地图标定** —— 换地图后 `scene` 常判成 `other`，发点逻辑不能限定 `scene === BATTLE`。
5. **`SCENE.DAILY` / `SCENE.POPUP` 不能当页面判据** —— 战斗帧上误命中率极高。

## 9. 后续方向

见 [HANDOFF §8](../HANDOFF.md)：P0 先验证 v0.5.81 的三处改动，P1 补文档与技术债，
P2 功能增强（OCR / 多分辨率 / 报表），P3 工程化（commit 纪律 / CI）。
