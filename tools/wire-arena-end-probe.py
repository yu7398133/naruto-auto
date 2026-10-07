import io, re

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ── 1) 在 isSettlementNow() 之后插入 detectArenaEnd() ──────────────
anchor = """    /** 轻量探一次「结算画面到了没」。用 scenes.detect(false)，比 waitForEnd 快得多
     *  （waitForEnd 有 minWaitMs 默认 15s 的下限，不适合连点期间的秒级轮询）。 */
    isSettlementNow() {
      try {
        return this.scenes.detect(false).scene === SCENE.BATTLE_END;
      } catch (e) {
        return false;
      }
    }
"""
assert s.count(anchor) == 1, f'anchor1 count={s.count(anchor)}'

new_method = anchor + '''
    /**
     * 忍术对战（角斗场）**结算画面**专用判据 —— 右上角「战斗详情」左侧的蓝色卷轴图标（v0.6.16）。
     *
     * 用户口径（2026-09-21）：「战斗结束的判断不对，我建议参考秘境的结束判定，找个图标，
     * 右上角战斗详情几个字的左边有个图标，只在战斗结束的时候出现，用这个作为判断依据」。
     *
     * 相对旧判据的优势：**这是一个离散的 UI 元素存在性判断**，而不是
     *   「画面动能」（静止/黑屏）或「大字配色」（横幅）这类连续量阈值判断 ——
     *   前者要等 6~20s，后者在战败局/登场画面分别漏报与误报。
     *
     * 返回 {ok, score, x, y}：ok=true 表示结算画面在（score < ARENA_END_ICON_THRESH）。
     * ⚠ 比 scenes.detect 贵（模板 SAD），只在 waitForEnd 的 300ms 节流拍上调用。
     */
    async detectArenaEnd() {
      try {
        const tmpl = await loadArenaEndIconTemplate();
        const res = this.vision.findTemplate(tmpl, ARENA_END_ICON_REGION,
          { step: 1, thresh: ARENA_END_ICON_THRESH });
        return {
          ok: !!(res && res.ok),
          score: res && res.score !== undefined ? res.score : null,
          x: res ? res.x : null,
          y: res ? res.y : null,
        };
      } catch (e) {
        return { ok: false, score: null, x: null, y: null, err: e.message };
      }
    }
'''
s = s.replace(anchor, new_method, 1)

# ── 2) waitForEnd：加 opts.arenaEndIcon 开关，在场景探测之后立刻做图标判据 ──
a2 = """          const r = this.scenes.detect(false);
          this._lastScene = r.scene;
"""
assert s.count(a2) == 1, f'anchor2 count={s.count(a2)}'

b2 = """          const r = this.scenes.detect(false);
          this._lastScene = r.scene;

          // ── v0.6.16：忍术对战结算图标判据（opts.arenaEndIcon）───────────────────
          //   放在最前面：它是离散的「UI 元素存在」判断，不像横幅/黑屏那样需要
          //   等序列确认或时间闸，命中即可落判（配合下面的观察窗决定续局还是收尾）。
          if (opts.arenaEndIcon) {
            const ae = await this.detectArenaEnd();
            if (ae.ok) {
              this._vsCnt = 0;
              Utils.log('info', `    ✓ 检测到结算图标（战斗详情·卷轴）score=${ae.score}`
                + ` @(${ae.x},${ae.y})`);
              if (graceMs > 0) {
                if (!this._holdUntil) {
                  this._holdUntil = nowX + graceMs;
                  this._holdBlack = false;
                  Utils.log('info', `    ⏸ 进入 ${Math.round(graceMs / 1000)}s 观察窗：自动续局则继续连招，否则判本局结束`);
                }
              } else {
                return 'settlement';
              }
            } else if (ae.score !== null && ae.score < ARENA_END_ICON_THRESH * 2) {
              // 贴近阈值时留个痕，便于真机复测时定准阈值（正负样本分布）
              Utils.log('info', `    …结算图标未命中但接近阈值 score=${ae.score}`);
            }
          }
"""
s = s.replace(a2, b2, 1)

# ── 3) 角斗场 FIGHT_OPTS 打开开关 ──
a3 = "          darkEndAfterMs: 25000,\n        };"
assert s.count(a3) == 1, f'anchor3 count={s.count(a3)}'
b3 = """          darkEndAfterMs: 25000,
          // 0.6.16：主判据改为**结算图标模板匹配**（右上角「战斗详情」卷轴图标）。
          //   旧的三条（横幅 / 黑屏 / 静止）全部保留作兜底 —— 万一 UI 改版导致
          //   模板失配，仍能靠它们收尾，不会整场卡死。
          arenaEndIcon: true,
        };"""
s = s.replace(a3, b3, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('OK: detectArenaEnd + waitForEnd hook + FIGHT_OPTS switch')
