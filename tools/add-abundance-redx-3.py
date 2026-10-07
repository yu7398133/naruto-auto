import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
lines = io.open(P, encoding='utf-8').read().split('\n')

# 定位 `if (opts.arenaEndIcon) {` 这一行（在 waitForEnd 内，缩进 10 空格）
idx = [k for k, l in enumerate(lines) if l == '          if (opts.arenaEndIcon) {']
assert len(idx) == 1, f'arenaEndIcon 锚点数量={len(idx)}'
k = idx[0]

block = """          // ── v0.6.24：丰饶之间结算判据（opts.abundanceRedX）─────────────────────
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
                  Utils.log('info', `    ✓ 检测到右上角红叉（丰饶结算）红占比=${bx.pct} → 判定本场结束`);
                  this._vsCnt = 0; this._holdUntil = 0; this._holdBlack = false;
                  this.op && this.op.releaseHold && this.op.releaseHold();
                  return 'settlement';
                }
              } catch (e) { /* 取像素失败不影响主流程 */ }
            }
          }
""".split('\n')

lines[k:k] = block
s = '\n'.join(lines)

# 丰饶 run() 传参
a2 = """        await ctx.tap([546, 645], null, '点挑战');
        await ctx.fight();"""
assert s.count(a2) == 1, f'a2={s.count(a2)}'
s = s.replace(a2, """        await ctx.tap([546, 645], null, '点挑战');
        // v0.6.24：结束判据 = 右上角红叉（用户口径：「就用红x就行了」）。
        //   修复前没有任何结束判据 → 打完也不收手，停在丰饶页盲点到 300s 超时
        //   （用户 2026-09-23 trace 实证：最后 10 步 scene 全 other、画面恒定，直到手动 ⏹）。
        await ctx.fight({ abundanceRedX: true });""", 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('OK')
