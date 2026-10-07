import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()
orig = len(s)

# ── 先全部定位与校验，任何一步不符就直接退出（不写文件）──────────────
edits = []

# ① combatStep 安全闸②「静止即停手」
a1 = """      // ── 安全闸 ②：画面已连续静止 → 多半已退出战斗，本拍不点 ────────────────
      // 与 waitForEnd 的静止检测共用 this._stable：只有连续稳定帧数达到阈值才停手，
      // 避免战斗中短暂静止（被击倒、双方对峙）导致普攻突然松开。
      // 0.5.59：停手的同时必须松开「按住不放」的普攻，否则云端卡住按压态。
      const stableNeed = this.config.num('vision.stableFrames') || 3;
      if (this._stable >= stableNeed) { this.op.releaseHold(); return 0; }
"""
b1 = """      // ── 安全闸 ②（v0.6.18 已删除）────────────────────────────────────────
      // 原「画面连续静止 → 停手」已移除。用户 2026-09-21 口径：
      //   「静止确认完全不需要，有末尾的战斗结束判断，中间直接全部连点器就可以了」。
      //   战斗中短暂静止（被击倒 / 双方对峙 / 登场画面）本就是常态，一旦停手就会出现
      //   用户反馈过的「打一会儿不按键了」。现在只靠**结算图标 / 金色横幅 / 黑屏过场**
      //   这类离散 UI 事件收手，不再用「画面动能」这种连续量。
"""
assert s.count(a1) == 1, f'① count={s.count(a1)}'
edits.append((a1, b1))

# ② waitForEnd 的静止计数 + 静止判结束 + 静止兜底
i2 = s.find("          let diff = 1;\n          try {\n            diff = this.vision.frameDiff(region);")
assert i2 > 0, '② start not found'
j2 = s.find("          // ── 0.5.78：横幅观察窗结算（黑屏过场后画面是否重新动起来）──────────────", i2)
assert j2 > 0, '② end not found'
old2 = s[i2:j2]
assert 'staticBailMs' in old2 and "return 'stable'" in old2 and "return 'frozen'" in old2, '② 内容不符'
new2 = """          // ── v0.6.18：画面「静止」相关的三条判据全部删除 ──────────────────────
          // 删除：① 静止计数 stable/endStableNeed ② 静止判结束 return 'stable'
          //      ③ 静止兜底 return 'frozen'（staticBailMs 空转 20s）
          // 保留：结算图标 / 金色横幅 / 黑屏过场（darkEndAfterMs）—— 都是**离散 UI 事件**，
          //   不像「画面不动」既是战斗常态、又必须等好几秒才敢下结论。
          let diff = 1;
          try {
            diff = this.vision.frameDiff(region);
          } catch (e) {
            diff = 1;   // 视觉不可用 → 当作「画面在动」，绝不停手、绝不判结束
          }

"""
edits.append((old2, new2))

# ③ 任务层 waitQuiet 的「静止确认」日志
a3 = "        Utils.log('debug', `    静止确认 ${stable}/${need} (diff=${d.toFixed(4)})`);\n"
assert s.count(a3) == 1, f'③ count={s.count(a3)}'
edits.append((a3, ""))

for old, new in edits:
    s = s.replace(old, new, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print(f'3 处剪切完成，{orig} → {len(s)} 字节（-{orig-len(s)}）')
