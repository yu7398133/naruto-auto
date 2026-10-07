import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
R = r'C:\Users\chenyu\dsh\火影忍者'
OLD, NEW = '0.5.85', '0.5.86'

# 1) JS：@version + const VERSION
js = open(R + r'\naruto-auto.user.js', encoding='utf-8').read()
js = re.sub(r'(// @version\s+)' + re.escape(OLD), r'\g<1>' + NEW, js)
js = re.sub(r"(const VERSION = ')" + re.escape(OLD) + r"'", r"\g<1>" + NEW + "'", js)
open(R + r'\naruto-auto.user.js', 'w', encoding='utf-8').write(js)

# 2) README badge
rm = open(R + r'\README.md', encoding='utf-8').read()
rm = rm.replace('version-' + OLD + '-blue', 'version-' + NEW + '-blue')
open(R + r'\README.md', 'w', encoding='utf-8').write(rm)

# 3) CHANGELOG：插新块
cg = open(R + r'\CHANGELOG.md', encoding='utf-8').read()
DATE = '2026-09-21'
block = '''## v0.5.86 (%s)

本轮修复 3 个用户真机实测暴露的问题，都影响「能不能打赢」。

### 1. 按键必须映射到屏幕坐标，不能再发键盘事件（最关键）

用户口径：「我键盘按键都需要映射到对应的屏幕点击位置的，而不是直接输入键盘按键」。

脚本早有同样结论（`BattleAssist.PLACES` 注释）：**键盘在部分云游戏实例下不可靠 —— 通道能"发送成功"但游戏无响应**。
之前 8 个秘境宏和连点器全走 `sdk.key()`，所以打不出伤害，最后只能靠连点器兜底蛮力磨赢。

- 新增 `SECRET_REALM_KEY_POS`：键 → 屏幕坐标。
  - WASD 用用户 2026-03-19 新标定的四点（`naruto-calib-2026-09-20T18-49-46-822Z.json`）：
    W(219,466) A(135,548) S(217,634) D(303,549)，十字形、中心≈(219,550)。
    与既有探针 `battleStick.area [190,520,280,610]` 吻合，且与 2026-09-13 旧校准的
    a(126,550)/d(297,550) 只差 6~9px —— 两处独立实测互相印证。旧表缺 w/s，本次补齐。
  - 技能键沿用旧 PLACES：j(998,633) k(1137,589) i(1023,496) o(1149,430) e(1153,279) r(1151,175) space(855,634)。
- 新增 `pressKeyPos()`：按下 → 按住 holdMs → 抬起（`pressHold`/`releaseHold`）。
- `replaySeq` 的 key 步、连点器的 jio/k 全部改走坐标。

### 2. 摇杆斜向：多个方向键同按取中点

用户口径：「因为这是个圆形摇杆，wd 或 wa 同时按下应取两个值的中间位置点击」；「as 和 sd 同时按，同理」。

- 新增 `stickPos(keys)`：任意方向键组合取坐标中点。
  w+d=(261,507) / w+a=(177,507) / s+d=(260,591) / s+a=(176,591)。
- 同按判定：某方向键步的 `hold` 未结束时下一个方向键已按下 → 视为同时按住，合成一个中点，后续步不再单独点。

### 3. 宏晚开场 → 改为轮询识别；补 lead 对齐时序

- **轮询替代死等**：原来「sleep 7s → 识别一次 → 才开宏」，用户实测「进入战斗后好几秒了都才开始战斗，
  宏无法如预期执行」。改为每 150ms 轮询一次，命中立刻返回（`pollRealmName`）。
  间隔必须 > `vision.capture()` 的 90ms 帧缓存，否则每次读同一帧白轮询。
- **补 leadMs**：宏的 `dt` 是相对「首个按键」的，丢掉了录制里「点匹配 → 首键」那段开场准备时间，
  导致脚本比录制**提前**按键。8 个宏各插入 `{kind:'lead', ms:N}`，实测值 leiting 4756 / lieyan 6454 /
  luoyan 5706 / yinyang 5531 / shuilao 5329 / dufeng 5505 / gangti 8603（含弹窗）/ gangti2 5560。
  `replaySeq` 支持 `sinceMs`：按**绝对时间**对齐，前面轮询识别花掉的时间会被抵扣，不会额外拖长。

### 4. 其它

- **导航段各步间隔 +0.5s**（用户要求）：原话「前面导航到秘境匹配到匹配战斗这几个流程的各个按键的间隔+0.5s」。
  NAV 五步 dt 各 +500ms（首步 dt=0 不变）。⚠ 只动导航段，战斗内的 lead/dt 是录制实测值，不动。
- **第一场补查券**：第 1 场的点匹配由 NAV 末步完成，用户实测「第一次开始的时候，都没有识别券的数量就直接进了」。
  券数检查失败（`!tk.ok`，如模板没加载）现在会显式告警，不再静默放过。
- 额外键处理（经用户确认）：宏里的 `space`(替身) / `e`(密卷) **保留**（录制里确实按过，还原才准）；
  `u` 出现 1 次（毒风，hold 49ms）无坐标，**跳过并告警**（影响很小）。

---

''' % DATE
cg = cg.replace('## v0.5.85 (%s)' % DATE, block + '## v0.5.85 (%s)' % DATE, 1)
open(R + r'\CHANGELOG.md', 'w', encoding='utf-8').write(cg)
print('已升版 %s → %s' % (OLD, NEW))
