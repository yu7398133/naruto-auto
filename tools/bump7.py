import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
R = r'C:\Users\chenyu\dsh\火影忍者'
OLD, NEW = '0.5.89', '0.5.90'

js = open(R + r'\naruto-auto.user.js', encoding='utf-8').read()
js = re.sub(r'(// @version\s+)' + re.escape(OLD), r'\g<1>' + NEW, js)
js = re.sub(r"(const VERSION = ')" + re.escape(OLD) + r"'", r"\g<1>" + NEW + "'", js)
open(R + r'\naruto-auto.user.js', 'w', encoding='utf-8').write(js)

rm = open(R + r'\README.md', encoding='utf-8').read()
open(R + r'\README.md', 'w', encoding='utf-8').write(
    rm.replace('version-' + OLD + '-blue', 'version-' + NEW + '-blue'))

BLOCK = '''## v0.5.90 (2026-09-21)

- **发现宏回放的结构性缺陷：「方向键按住 + 同时按技能」做不到** —— 新增自检工具待实测确认。
  - 用户口径：「关于 wa 这种斜向的方向合成，我觉得可以不用做，游戏好像会自动进行方向合成」+
    「因为方向和战斗的按键也是经常同时按的」。
  - **用 10 份录制统计，共 806 处需要「真多指并存」**：
    | 录制 | 需并存处数 | 典型 |
    |---|---|---|
    | gangti2 | 392 | 步2 s(hold=214) 期间要按 j/i/i/o/o/o/d… |
    | gangti | 196 | 步2 d(hold=244) 期间要按 j/i…/k |
    | lieyan | 101 | 步3 d(hold=118) 期间要按 i/a/w |
    | dufeng | 34 | 步2 w(hold=471) 期间要按 i/i/o/i |
    | leiting | 33 | 步1 d(hold=700) 期间要按 i/i/o |
    | yinyang | 24 | 步2 s(hold=497) 期间要按 a/j/i/i/d/o/j/k |
    | shuilao | 18 | 步1 d(hold=1745) 期间要按 j/i/i/o/i |
    | luoyan | 8 | 步2 s(hold=221) 期间要按 j/i/i/o |
  - **现有实现是串行的，必然断掉其中一个点**：
    ```js
    pressKeyPos() { op.pressHold(W); await sleep(hold); op.releaseHold(); }  // 才轮到下一个键
    ```
    且 `pressHold()` 内部有 `if (this._hold) this.releaseHold(true)` ——
    **任何新按键都会先抬起前一个点**。
    → `leiting 步1 d(hold=700)` 实际变成「按d → 空等700ms → 松d → 按i → 松i → …」，
    **走位全程断裂、技能整体延后**。这是宏打不出伤害的深层原因之一。
  - **原 `combo` 方向合成代码是走错了路**：它想用「坐标平均」模拟多指，但
    - 会算出**同键重复合成**（`d+d`、`w+w`）与**多项误合**，最夸张的是
      `gangti2 步8` 把 `a+s+d+w+d+d+w+w+a+s+a` **11 个键平均到摇杆正中心**（等于不移动）；
    - 根因：`hold=0` 时 break 条件 `(n.dt - s.dt) >= 0` 在 dt 相同/递减时不触发，
      于是一路往后吃；而 `_done` 吞并用的却是另一个条件 `(n.dt - targetMs) < hold`，两套逻辑互相矛盾。
    - 方向合成本应由**游戏客户端**完成（用户用键盘录的，游戏收到的是「W+A 同时按下」）。
  - **主通道为什么要改**：`_domDispatch` 发的是**鼠标**事件
    （`pointerId: 1, isPrimary: true, pointerType: 'mouse'`），鼠标物理上只有一个指针，
    **做不到多指并存**。必须走触摸通道（`touchControl` / `sendTouchEventV2`，或 DOM TouchEvent）。
  - 本版**先加验证工具，不重构调度**（避免在未确认前大改）：
    - 新增 SDK 层 `_touchMulti(pts, kind)`：一次带多个 `identifier` 放下/抬起多点；
    - 新增面板按钮「🖐 多指自检」：四组对照，全用**画面差异**客观判断
      ```
      ① 单按 W            → 基线
      ② 同时按 W + J      → 关键（录制里的真实状态）
      ③ 串行 按W→松→按J   → 脚本当前做法
      ④ 单按 K            → 普攻参照
      ```
      判读：②明显强于③且>2% → 多指可行，值得改时间轴调度；②≈③ → 云端只认第一个点，别改。
  - 待实测确认后再决定是否把 `replaySeq` 重构成「按时间轴并发管理多个按压点」。

---

'''
cg = open(R + r'\CHANGELOG.md', encoding='utf-8').read()
open(R + r'\CHANGELOG.md', 'w', encoding='utf-8').write(
    cg.replace('## v0.5.89 (', BLOCK + '## v0.5.89 (', 1))
print('已升版 %s → %s' % (OLD, NEW))
