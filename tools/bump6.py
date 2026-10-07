import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
R = r'C:\Users\chenyu\dsh\火影忍者'
OLD, NEW = '0.5.88', '0.5.89'

js = open(R + r'\naruto-auto.user.js', encoding='utf-8').read()
js = re.sub(r'(// @version\s+)' + re.escape(OLD), r'\g<1>' + NEW, js)
js = re.sub(r"(const VERSION = ')" + re.escape(OLD) + r"'", r"\g<1>" + NEW + "'", js)
open(R + r'\naruto-auto.user.js', 'w', encoding='utf-8').write(js)

rm = open(R + r'\README.md', encoding='utf-8').read()
open(R + r'\README.md', 'w', encoding='utf-8').write(
    rm.replace('version-' + OLD + '-blue', 'version-' + NEW + '-blue'))

BLOCK = '''## v0.5.89 (2026-09-21)

- **结算判据改为「左下角返回按钮」模板匹配 —— 从秘境录制里实测提取，不再套用忍术对战方案**。
  - 用户口径：「结算画面的判断，忍术对战和你的肯定不一样，我只是让你采用他的方案，
    不是照抄，你要从我给你的录制 json 里面提取正确的方案出来」+
    「结算明确左下角会出现返回，如果不点会持续十几秒，感觉比较适合作为判断依据」。
  - **从 10 份「XX秘境战斗.json」实测**：
    - 9/10 份录制最后阶段都有一次 click 落在 `x∈[112,146] y∈[666,677]`（中位 `122,670`），
      就是左下角「返回」；唯一没有的「缸体2」是直接点了确定类按钮。
    - 该 click 距上一个按键 **4.8~22.3s（中位 8.1s）** —— 印证「不点会持续十几秒」。
  - **模板与阈值都由数据定，不是拍脑袋**：模板取落岩该帧 `(105,653)-(141,685)` 36×32，
    在 `[85,640,190,705]` 内搜索 SAD：
    | | 最佳匹配差 |
    |---|---|
    | 正样本（9 份结算帧） | **0.00 ~ 33.72** |
    | 负样本（落岩宏 6 个战斗帧） | **76.67 ~ 82.87** |
    → 分离区宽 42.9，**阈值取 55**（两侧各留约 21.5 余量）。
  - 实现：新增 `detectSettleBack()` + `SECRET_REALM_SETTLE_BACK_TMPL/_REGION/_THRESH/_PROBE_MS`，
    **只在连点期间每 2s 探一次**（用户口径「连点期间每 2s 做一次判定」），
    不参与常态轮询（模板匹配比 scenes.detect 贵）。
  - 第①层（30s 等待）与第②层（连点兜底）**都改用这个判据**：
    - 第①层：每 2s 探一次，命中立刻走结算；`waitForEnd` 降级为**兜底识别**
      （万一模板因改版失效，还能认出 home/settlement，不至于把把超时）。
    - 第②层：后台跑 `waitForEnd` 驱动 combatStep 连点，主循环每 2s 探结算，
      **一旦探到立刻 `releaseHold()` 并收工** —— 直接回应用户的
      「战斗结束结算的验证一定要及时，不然会被连点器点入下一轮」。
  - 结算点击**优先用探测到的实际坐标**（`probe.x+18, probe.y+16`，即模板中心），
    探测失败才退回常量 —— 写死的 `(128,671)` 实测偏约 6px。

- **新增虚拟核对工具 `tools/realm_dryrun.py`**：用 10 份录制反过来校验脚本常量与流程。
  本次结果：
  ```
  A 点匹配(1183,617)     10/10 通过，最大偏差 16.1px（烈焰 1199,619）
  B 弹窗两步(645,406)/(653,460)  2/2 通过，罡体距离 0.0 / 0.0
  C 返回按钮落区          9/9 通过
  E 宏步数                 7/10 一致
  ```
  3 处宏步数差异（缸体2 38/28、落岩2 7/6、阴阳2 12/11）**都是文件名标注
  「以另一个为准」的备份录制** —— 脚本取的是主录制，符合预期。

---

'''
cg = open(R + r'\CHANGELOG.md', encoding='utf-8').read()
open(R + r'\CHANGELOG.md', 'w', encoding='utf-8').write(
    cg.replace('## v0.5.88 (', BLOCK + '## v0.5.88 (', 1))
print('已升版 %s → %s' % (OLD, NEW))
