import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
lines = io.open(P, encoding='utf-8').read().split('\n')

idx = [k for k, l in enumerate(lines) if l == '          if (opts.arenaEndIcon) {']
assert len(idx) == 1, f'锚点数量={len(idx)}'
k = idx[0]

block = """          // ── v0.6.24：丰饶之间结算判据（opts.abundanceRedX）─────────────────────
          //   用户口径：「就用红x就行了」「可以直接用回到主界面的那个红x的探针」
          //   「这个的判定不需要那么及时」，且「开始战斗后 10s 以后才开始轮询」。
          //   复用既有 PROBES.closeX（area [1185,2,1272,70]，label '关闭(X)'，verified:true）——
          //   实测在丰饶入口页上：区域均值 [106,62,42] vs 目标色 {102,56,34}，距离仅 17
          //   （tol 上限 105），std 40.04 ≥ minStd 10 ⇒ ok=true，判据本身是好的，无需新建探针。
          // ⚠ 不用 backBtnX：它的区域 [1040,0,1280,120] 太大被背景稀释，实测距离 199 不命中。
          //   10s 闸的意义：跳过开场过场/加载（刚进场画面不稳，红叉可能还没就位）。
          //   每 ABUNDANCE_REDX_POLL_MS(1s) 取一次即可 —— 用户明确「判定不需要那么及时」。
          if (opts.abundanceRedX && nowX - this._fightStart >= ABUNDANCE_REDX_START_MS) {
            if (nowX - (this._abxAt || 0) >= ABUNDANCE_REDX_POLL_MS) {
              this._abxAt = nowX;
              try {
                const m = this.vision.match(PROBES.closeX);
                if (m && m.ok) {
                  Utils.log('info', `    ✓ 检测到右上角红叉（丰饶结算）score=${m.score} → 判定本场结束`);
                  this._vsCnt = 0; this._holdUntil = 0; this._holdBlack = false;
                  this.op && this.op.releaseHold && this.op.releaseHold();
                  return 'settlement';
                }
              } catch (e) { /* 探针失败不影响主流程 */ }
            }
          }
""".split('\n')

lines[k:k] = block
s = '\n'.join(lines)

a2 = """        await ctx.tap([546, 645], null, '点挑战');
        await ctx.fight();"""
assert s.count(a2) == 1, f'a2={s.count(a2)}'
s = s.replace(a2, """        await ctx.tap([546, 645], null, '点挑战');
        // v0.6.24：结束判据 = 右上角红叉（复用 PROBES.closeX，用户口径「直接用回到主界面的那个红x」）。
        //   修复前丰饶**没有任何结束判据** → 打完也不收手，停在丰饶页盲点到 300s 超时，
        //   用户只能手动 ⏹（2026-09-23 trace 实证：最后 10 步 scene 全 other、画面恒定）。
        await ctx.fight({ abundanceRedX: true });""", 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('OK')
