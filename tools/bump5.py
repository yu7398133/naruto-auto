import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
R = r'C:\Users\chenyu\dsh\火影忍者'
OLD, NEW = '0.5.87', '0.5.88'

js = open(R + r'\naruto-auto.user.js', encoding='utf-8').read()
js = re.sub(r'(// @version\s+)' + re.escape(OLD), r'\g<1>' + NEW, js)
js = re.sub(r"(const VERSION = ')" + re.escape(OLD) + r"'", r"\g<1>" + NEW + "'", js)
open(R + r'\naruto-auto.user.js', 'w', encoding='utf-8').write(js)

rm = open(R + r'\README.md', encoding='utf-8').read()
rm = rm.replace('version-' + OLD + '-blue', 'version-' + NEW + '-blue')
open(R + r'\README.md', 'w', encoding='utf-8').write(rm)

cg = open(R + r'\CHANGELOG.md', encoding='utf-8').read()
block = '''## v0.5.88 (2026-09-21)

- **「点匹配」从 NAV 移入主循环，修正读券时序**。
  - 用户口径：「NAV 第六步也应该属于主循环，挑战券读数量应该在点匹配之前」。
  - 旧设计的时序错误：`NAV[0..5]` 里**第 5 步就把匹配点了**，循环第 1 轮再读券时
    画面已在加载战斗，券数区域可能已不可见/正在变化 —— 这正是用户早先反馈的
    「第一次开始的时候，都没识别券的数量就直接进了」的**根因**。
  - 改后分层：
    ```
    导航（只做一次，到**准备界面**为止）
      → 循环{ 读券 → 点匹配 → 探弹窗 → 轮询秘境名 → 战斗 → 结算 }
    ```
    保证每轮顺序都是「先读券、后点匹配」，**第 1 场与第 N 场走同一条路径**。
  - 具体改动：
    - `SECRET_REALM_NAV` 由 6 步减到 5 步（删 tap(1165,587)）；末步 tap(949,531) 的
      `pre` 2000 → 3000（它负责把「准备界面」推出来，缓冲要足）。
    - 循环内删掉 `if (matchTries > 1)` 分支，**每轮都点匹配** `(1183,617)`。
    - `SECRET_REALM_PRE_TAP_WAIT` 3000 → **3500**（现为所有场次点匹配前的唯一等待，
      要同时覆盖「第1场刚导航完」与「第N场上局刚结算完」两种情况）。
    - 日志改为 `🌀 秘境挑战：回主界面→导航到准备界面（只做一次；匹配由循环负责）`。
  - 顺带把任务面板 `steps` 说明文字改准（原文还写着已废弃的「退出战斗(430,500)」
    「继续战斗(850,500)」—— v0.5.85 已证实**不存在「继续战斗」按钮**）。

- **`home` 返回值不能当「该清结算」处理（修上一版引入的风险）**。
  - `waitForEnd` 的真实返回值集合（已核对，**无 `'settled'`**）：
    `settlement` / `frozen` / `home` / `reward` / `stable` / `darkend` / `timeout`
  - 上一版把「非 timeout 全当 settled」→ **误包含 `home`**。而 `home` 表示
    「结束时**已经在主界面**」，此时再跑 `clearSettlement()` + 盲点
    `(128,671)`/`(628,562)`，就是**在主界面上乱点**。
  - 已改为：`home` → `result='atHome'` → **跳过结算清理**，直接计一场。
  - 另经核查：`waitForEnd` 内部**不做任何结算点击**（253 行内唯一匹配是注释文字），
    纯观察后返回字符串，所以不会与外面的 `clearSettlement()` 重复执行。

---

'''
cg = cg.replace('## v0.5.87 (', block + '## v0.5.87 (', 1)
open(R + r'\CHANGELOG.md', 'w', encoding='utf-8').write(cg)
print('已升版 %s → %s' % (OLD, NEW))
