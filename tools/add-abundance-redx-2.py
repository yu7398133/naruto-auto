import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ① waitForEnd 里加 opts.abundanceRedX 分支（插在 arenaEndIcon 分支之后）
anchor = """          if (opts.arenaEndIcon) {"""
assert s.count(anchor) == 1
# 找 arenaEndIcon 分支的结束位置：下一个 "          if (" 同级
i = s.index(anchor)
j = s.index("\n          if (", i + 10)   # 下一个同级 if
ins = """
          // ── v0.6.24：丰饶之间结算判据（opts.abundanceRedX）─────────────────────
          //   用户口径：「就用红x就行了，这个的判定不需要那么及时」+「开始战斗后 10s 以后
          //   才开始轮询」。红叉是独立的 × 形（暂停按钮是两条竖线 ‖，形状不同，不会互混）。
          //   10s 闸的意义：跳过开场过场/加载，避免刚进场画面不稳定时误命中。
          //   每 ABUNDANCE_REDX_POLL_MS(1s) 才真正取一次像素（判定不需及时，省 CPU）。
          if (opts.abundanceRedX && nowX - this._fightStart >= ABUNDANCE_REDX_START_MS) {
            if (nowX - (this._abxAt || 0) >= ABUNDANCE_REDX_POLL_MS) {
              this._abxAt = nowX;
              try {
                const bx = await this.detectAbundanceRedX();
                if (bx.ok) {
                  Utils.log('info', `    ✓ 检测到右上角红叉（丰饶结算）红占比=${bx.pct} ≥ ${ABUNDANCE_REDX_MIN_PCT} → 判定本场结束`);
                  this._vsCnt = 0; this._holdUntil = 0; this._holdBlack = false;
                  this.op && this.op.releaseHold && this.op.releaseHold();
                  return 'settlement';
                }
              } catch (e) { /* 取像素失败不影响主流程 */ }
            }
          }

          if (opts.arenaEndIcon) {"""
s = s[:j] + ins + s[j + len("\n          if ("):]
# 上面替换把 "if (" 吞掉了，手工补回
assert 'if (opts.arenaEndIcon) {' in s

# ② 丰饶之间 run()：传 abundanceRedX
a2 = """        await ctx.tap([546, 645], null, '点挑战');
        await ctx.fight();"""
assert s.count(a2) == 1, f'a2={s.count(a2)}'
b2 = """        await ctx.tap([546, 645], null, '点挑战');
        // v0.6.24：结束判据 = 右上角红叉（用户口径：「就用红x就行了」）。
        //   修复前没有任何结束判据 → 打完也不收手，停在丰饶页盲点到 300s 超时
        //   （用户 2026-09-23 trace 实证：最后 10 步 scene 全 other、画面恒定，
        //     redPct=0.05 的背景，直到手动按 ⏹）。
        await ctx.fight({ abundanceRedX: true });"""
s = s.replace(a2, b2, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('OK')
