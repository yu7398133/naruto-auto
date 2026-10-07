import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ═══ 修复 3：把「每局重进」改成用户描述的真循环 ═══════════════════════
#   用户 2026-09-21 口径：
#     「按道理这应该是个循环才对，循环的内容是
#       识别战斗准备界面 - 点开战 - 连点器 - 识别结算图标（战斗详情·卷轴）- 点一下跳过结算
#       这个循环就结束了」
#     「第二局进入循环的时候应该点开战，结果点到调整阵容 1042,666 这附近去了」
#     「结算后跳过：你点 k 的位置就可以」→ k = (1137,589)
a = """          const t0 = Date.now();
          const reason = await ctx.fight(FIGHT_OPTS);   // 横幅(含观察窗) / 静止 / 冻结兜底 / 超时
          Utils.log('info', `⚔️ 角斗场 第 ${round}/${rounds} 局打完（本局耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s · 结束原因 ${reason}）`);
          if (round >= rounds) break;

          // ③ 战后处置（0.5.81 改）
          //   · 'timeout' 表示
          //     「本场不是靠胜负横幅正常收尾」—— 游戏一定在走「战绩 → 黑屏 → 奖励浮层 → 任务面板」
          //     那串页面，脚本并不知道自己停在哪一页。
          //     旧做法是让**下一轮**的「选对手」自检去发现（再逐个试 8 个解卡落点），
          //     但那些点击本身就可能把面板/别的页面点开。现在不猜：**直接回主界面，重新拖屏进场**。
          //   · 'settlement'（横幅+观察窗正常收尾）时角斗场通常停在房间页 → 保持原节奏，下一轮直接选对手。
          const churn = await ctx.waitQuiet(1200, 3);
          Utils.log('info', `    · 战后静默检查：期间画面重新变动 ${churn} 次`);
          if (reason !== 'settlement') {
            ctx.op.releaseHold();
            await Utils.sleep(1500);          // 让结算/奖励动画再走一会儿，别和它抢
            if (await ctx.nav.goHome()) {
              Utils.log('info', `    ↻ 结束原因 ${reason} → 已回主界面，重新进场`);
              await enterArena(`第 ${round} 局（${reason}）后重进`);
            } else {
              Utils.log('warn', '    ⚠ 回主界面未成功 → 交给下一轮的「点得动自检 + 解卡」处理（不在这里盲点）');
            }
          }
          await Utils.sleep(800);
        }
"""
b = """          const t0 = Date.now();
          const reason = await ctx.fight(FIGHT_OPTS);   // 只认结算图标 / 回主界面 / 超时
          Utils.log('info', `⚔️ 角斗场 第 ${round}/${rounds} 局打完（本局耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s · 结束原因 ${reason}）`);

          // ③ 跳过结算（v0.6.20）────────────────────────────────────────────────
          //   用户口径：「结算后点一下跳过结算 —— 你点 k 的位置就可以」→ k = (1137,589)。
          //   原因：结算画面在普攻位 k 上就是个「跳过/继续」热区，点一下就走完。
          //   ⚠ 必须**先松手**再点：holdAttack 一直按着 k，直接点等于没点。
          ctx.op.releaseHold();
          await Utils.sleep(300);
          for (let t = 0; t < 3; t++) {
            await ctx.op.clickNatural(1137, 589, null, `跳过结算 ${t + 1}/3`);
            await Utils.sleep(700);
          }
          ctx.op.releaseHold();
          await Utils.sleep(1000);            // 让结算动画/奖励浮层走完

          if (round >= rounds) break;

          // ④ 回到「战斗准备界面」（v0.6.20 改成真循环）──────────────────────────
          //   用户口径：循环 = 识别准备界面 → 点开战 → 连点器 → 识别结算图标 → 点跳过 → 回准备界面。
          //   旧实现是「回主界面 → 重新拖屏 → 点角斗场入口」，既慢又容易在陌生页面上盲点
          //   （实测第 2 局点 (315,637)「选对手」时人还在结算/奖励页，那坐标落在
          //     「调整阵容 (1042,666)」附近 → 点进去，用户反馈「点到调整阵容去了」）。
          //   现在不离开角斗场：跳过结算后**就地等「开始对战」按钮出现**（战斗准备界面），
          //   出现即证明循环回到起点。
          const ready = await ctx.waitArenaReady(20000);
          if (ready.ok) {
            Utils.log('info', `    ↻ 已回到战斗准备界面（${ready.ms}ms）→ 第 ${round + 1} 局`);
          } else {
            Utils.log('warn', '    ⚠ 20s 内没等到战斗准备界面 → 回主界面重进角斗场（不盲点）');
            ctx.op.releaseHold();
            if (await ctx.nav.goHome()) {
              await enterArena(`第 ${round} 局结算后未回到准备界面`);
            } else {
              Utils.log('warn', '    ⚠ 回主界面也失败 → 交给下一轮自检');
            }
          }
          await Utils.sleep(500);
        }
"""
assert s.count(a) == 1, f'③ count={s.count(a)}'
s = s.replace(a, b, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('修复 3 完成（循环结构重写）')
