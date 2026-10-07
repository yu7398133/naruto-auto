import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()
orig = len(s)
edits = []

# ① stillFighting 去掉恒真的 !this._stable
a1 = """        // 这里只排除已判定的结算/主界面（那两种情况上面已 return），再叠加 0.5.51 的「静止即停手」：
        // 画面一旦开始静止（退出战斗的典型征兆）就立刻停手，避免把新界面的按钮点下去。
        const stillFighting = !this._holdUntil && this._lastScene !== SCENE.BATTLE_END
          && this._lastScene !== SCENE.HOME && !this._stable;"""
b1 = """        // 只排除已判定的结算/主界面（那两种情况上面已 return）+ 横幅观察窗（_holdUntil，
        // 那时已确认结算、不该再连点）。v0.6.18 起不再看「画面静止」——
        // 用户口径「中间直接全部连点器就可以了」，静止与否都继续连招。
        const stillFighting = !this._holdUntil && this._lastScene !== SCENE.BATTLE_END
          && this._lastScene !== SCENE.HOME;"""
assert s.count(a1) == 1, f'① count={s.count(a1)}'
edits.append((a1, b1))

# ② 观察窗里的 this._stable 清零
a2 = "              this._stable = 0; stable = 0; this._bannerAt = 0;"
b2 = "              this._bannerAt = 0;"
assert s.count(a2) == 1, f'② count={s.count(a2)}'
edits.append((a2, b2))

# ③ 本场初始化去掉 this._stable
a3 = "      this._stable = 0; this._maxWarned = false;"
b3 = "      this._maxWarned = false;"
assert s.count(a3) == 1, f'③ count={s.count(a3)}'
edits.append((a3, b3))

# ④ staticBailMs 声明 + 其专属注释块（用实际文本）
a4 = """      // 0.5.79：画面「连续静止」兜底脱困。0.5.72 加的 battleStarted 闸有个致命副作用 ——
      //   它是局部变量、只认「先看到过动态帧」。若 waitForEnd 一开始就落在一个**静止的陌生页面**
      //   （战后「战斗结果 → 确定 → 奖励 → 任务面板」那一串），battleStarted 永远 false →
      //   「静止 = 打完」这条唯一出口被永久关掉 → 脚本在该页面上盲点直到 maxWaitMs
      //   （本次 trace 实测 360s/局，用户看到「卡住不动 + 点到别的页面」）。
      //   现在：只要画面**连续静止** ≥ staticBailMs 就无条件兜底结束本场。
      //   安全性：匹配/加载/双方登场这类正常过场不会像素级冻结这么久（登场上限实测约 4.5s）。
      const staticBailMs = opts.staticBailMs != null ? opts.staticBailMs : 0;
"""
assert s.count(a4) == 1, f'④ count={s.count(a4)}'
edits.append((a4, ""))

# ⑤ stable/endStableNeed/staticEndAfterMs/battleStarted 声明与引用
a5 = """      const endStableNeed = opts.stableEndFrames != null ? opts.stableEndFrames : stableNeed;
      const staticEndAfterMs = opts.staticEndAfterMs != null ? opts.staticEndAfterMs : 0;
"""
assert s.count(a5) == 1, f'⑤ count={s.count(a5)}'
edits.append((a5, ""))

a6 = """      const start = Date.now();
      let stable = 0;
      let battleStarted = false;   // 0.5.72：必须确认战斗真正开始过，才允许「画面静止」判结束，防止匹配/选忍界面直接判结算
"""
b6 = """      const start = Date.now();
"""
assert s.count(a6) == 1, f'⑥ count={s.count(a6)}'
edits.append((a6, b6))

for old, new in edits:
    s = s.replace(old, new, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print(f'清理 {len(edits)} 处，{orig} → {len(s)} 字节（-{orig-len(s)}）')
