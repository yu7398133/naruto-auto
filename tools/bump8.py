import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
R = r'C:\Users\chenyu\dsh\火影忍者'
OLD, NEW = '0.5.90', '0.5.91'

js = open(R + r'\naruto-auto.user.js', encoding='utf-8').read()
js = re.sub(r'(// @version\s+)' + re.escape(OLD), r'\g<1>' + NEW, js)
js = re.sub(r"(const VERSION = ')" + re.escape(OLD) + r"'", r"\g<1>" + NEW + "'", js)
open(R + r'\naruto-auto.user.js', 'w', encoding='utf-8').write(js)

rm = open(R + r'\README.md', encoding='utf-8').read()
open(R + r'\README.md', 'w', encoding='utf-8').write(
    rm.replace('version-' + OLD + '-blue', 'version-' + NEW + '-blue'))

BLOCK = '''## v0.5.91 (2026-09-21)

- **宏回放改为「时间轴并发调度」，顺带修掉一个更致命的时序 bug**。
  - 起因：用户口径「关于 wa 这种斜向的方向合成，我觉得可以不用做，游戏好像会自动进行方向合成」+
    「因为方向和战斗的按键也是经常同时按的」。
  - **查出真正的问题不是「并存」而是「基准错了」**：
    旧代码把每步的 `dt`（**相对上一步**的间隔）直接和 `Date.now() - t0`（**距开始**的绝对时间）相减：
    ```js
    const targetMs = s.dt || 0;                          // 相对间隔
    const wait = Math.max(0, targetMs - (Date.now() - t0));  // 却按绝对时间比
    ```
    → 第一个键之后 `wait` 几乎恒为 0，**整个宏全速空转**。实测对比（录制真实 vs 旧实现末键时刻）：
    | 宏 | 录制真实 | 旧实现 | 偏差 |
    |---|---|---|---|
    | gangti | 33946ms | 14496ms | **早 19450ms** |
    | lieyan | 16954ms | 7902ms | 早 9052ms |
    | leiting | 13482ms | 6439ms | 早 7043ms |
    | yinyang | 13449ms | 6621ms | 早 6828ms |
    | shuilao | 15664ms | 10922ms | 早 4742ms |
    | dufeng | 15262ms | 12104ms | 早 3158ms |
    | luoyan | 2995ms | 3111ms | 晚 116ms |
    **宏比录制快一倍，节奏完全乱掉** —— 这才是「宏打得不对劲」的主因。
  - **同时，并存关系也确实被拉平**：旧 `pressKeyPos` 是「按 W → 等 hold → 松 W → 才按 J」，
    且 `op.pressHold()` 内部 `if (this._hold) this.releaseHold(true)` 会把上一个点抬起。
    实测峰值并存：录制 8/8 份为 **1~2 指**（`dufeng/lieyan/gangti/yinyang` 为 2，其余为 1），
    而旧实现**永远是 1 指**。
  - **改法**：新增 `buildKeyTimeline()`，把 key 步展开成 `(at, act)` 事件表：
    ```
    dt 累加 → 绝对按下时刻 at；hold>0 → up 在 at+hold；hold=0 → up 在 at+60ms
    稳定排序（同一时刻先 up 后 down，先腾手指）
    ```
    再由 `replaySeq` 按时间轴**并发**驱动 `sdk._down/_up`（**故意不用 pressHold**，
    因为它会抬掉上一个点）。tap/drag（导航）不含 key，走原路径不受影响。
  - **删除「摇杆坐标平均」合成**（`stickPos` + `SECRET_REALM_STICK_KEYS`）：
    用户明确说方向合成本应由游戏客户端做；且旧合成会算出 `gangti2 步8` 把
    `a+s+d+w+d+d+w+w+a+s+a` **11 个键平均到摇杆正中心**（等于不移动），
    根因是 `hold=0` 时 break 条件与 `_done` 吞并条件互相矛盾。
  - 新增 `GameOperator.releaseAllHolds()`：收尾把**所有**已知按键坐标各抬一次，
    确保时间轴跑完不残留按压态（0.5.42「点了没反应」的根源）。
  - **虚拟核对（`tools/verify_timeline.py` / `verify_dt.py` / `verify_peak.py`）**：
    - `dt` 累加语义：**7/7 主录制精确 0ms 误差**（对照组「缸体2》是 38 键备份录制，脚本用 28 键主录制）
    - down/up 配对、结束时归零、峰值并存 ≤5 指、hold 未被截断：**全部通过**
    - 峰值并存：录制 vs 脚本 **8/8 一致**（1~2 指）
  - 保留 `opts.legacySerial:true` 可回到旧的逐条串行行为（仅供回滚）。
  - ⚠ 本次改动**尚未真机验证**。第一次跑请盯这两行日志：
    ```
    🎬 时间轴 N 键 → M 事件 / Xms     ← Xms 应与录制总时长同量级
    （若出现）⚠ 未收录坐标的键被跳过
    ```

---

'''
cg = open(R + r'\CHANGELOG.md', encoding='utf-8').read()
open(R + r'\CHANGELOG.md', 'w', encoding='utf-8').write(
    cg.replace('## v0.5.90 (', BLOCK + '## v0.5.90 (', 1))
print('已升版 %s → %s' % (OLD, NEW))
