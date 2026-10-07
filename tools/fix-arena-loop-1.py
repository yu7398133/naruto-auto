import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ═══ 修复 1：图标一旦命中就直接落判，不再被观察窗反复"续期" ═══════════
#   现状：图标命中 → 开 6s 观察窗；下一拍又命中（还是同一个结算画面）→ 但代码
#   只在 !this._holdUntil 时才开窗，所以窗口不被续期。问题在于观察窗内每拍都
#   重新置 _vsCnt=0 并重复打日志（日志里连打 15 条就是它），且窗口结束时才
#   return settlement —— 用户看到"结算画面明明在，却要等 6s"。
#   改法：图标是**结算画面的确定判据**（正 4.2 / 负 ≥41.7，分离 10 倍），命中即
#   直接 return 'settlement'，不需要观察窗去分辨"续局 or 打完"。
a1 = """          if (opts.arenaEndIcon) {
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
b1 = """          if (opts.arenaEndIcon) {
            const ae = await this.detectArenaEnd();
            if (ae.ok) {
              // v0.6.20：**命中即落判**，不再开观察窗。
              //   图标是结算画面的确定判据（实测 正样本 2.5 / 负样本 ≥41.7，10 倍分离），
              //   不需要像金色横幅那样靠 6s 观察窗去分辨「自动续局 or 真的打完」。
              //   旧写法开观察窗 → 结算画面一直在 → 每拍重复打日志、还要空等 6s
              //   （用户 2026-09-21 反馈「图标明明在却要等十几秒才结束」）。
              this._vsCnt = 0;
              this._holdUntil = 0; this._holdBlack = false;
              Utils.log('info', `    ✓ 检测到结算图标（战斗详情·卷轴）score=${ae.score}`
                + ` @(${ae.x},${ae.y}) → 判定本场结束`);
              return 'settlement';
            }
          }
"""
assert s.count(a1) == 1, f'① count={s.count(a1)}'
s = s.replace(a1, b1, 1)

# ═══ 修复 2：删掉金色横幅判据（用户口径：只用结算图标）═══════════════
i2 = s.find("          // 0.5.70：结算判定必须稳定。战斗帧常把 avatar/dailyIcon/settleConfirm 误判成")
j2 = s.find("          // ── v0.6.18：画面「静止」相关的三条判据全部删除 ──────────────────────", i2)
assert i2 > 0 and j2 > i2, f'② 定位失败 i2={i2} j2={j2}'
old2 = s[i2:j2]
assert 'strongBanner' in old2 and 'vsConfirm' in old2, '② 内容不符'
new2 = """          // ── v0.6.20：金色横幅判据已删除（用户 2026-09-21 口径）─────────────────
          //   「删掉横幅判据，只用结算图标」。
          //   横幅的问题：① 它前面那拍场景未必是 BATTLE_END ② 与图标同时命中会打架
          //   （实测 23:54:09 横幅先命中开观察窗 → 23:54:10 又判"自动续局" → 23:54:11
          //    图标才命中，白绕一圈）③ 战败局根本没有金色横幅。
          //   现在忍术对战的结算**只认右上角「战斗详情」卷轴图标**。

"""
s = s[:i2] + new2 + s[j2:]

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('修复 1、2 完成')
