import io

P = r'C:\Users\chenyu\dsh\火影忍者\naruto-auto.user.js'
s = io.open(P, encoding='utf-8').read()

# ① dragScene 改为推进 **1 次**（统一动作 = 一个流程图步骤）
old = """  const what = dir === 'left' ? '最左' : '最右';
  for (let i = 0; i < 2; i++) {
    // v0.6.25 关键修复：原先直接调 ctx.op.swipe —— **绕过了 TaskContext.drag()，
    //   因此从不调 _advance，流程图一步都不推进**。
    //   各任务 steps[] 里为拖动声明了 2 个 drag 条目（「拖到最右（第一次）/（第二次）」），
    //   实际却 0 次推进 → 计数器整体少 2，末尾两步永远高亮不到，
    //   面板看起来就"卡在『打开 XXX』那一步"（用户 2026-09-23 反馈丰饶之间）。
    //   实测：丰饶 5 步声明 / 只推进 3 次（go + tap + fight）。
    //   ⚠ 必须在**真实 swipe 之前**推进（_advance 的语义是"即将执行第 i 步"），
    //     否则面板会提前亮下一步、与画面圈不同步。
    ctx._advance(`主场景拖到${what}（第 ${i + 1} 次）`);
    await ctx.op.swipe(d.x1, d.y1, d.x2, d.y2, d.duration);
    ctx.stepResult(true);
    if (i === 0) await Utils.sleep(1600);   // 让滑动惯性动画走完再拖第二次
  }
}"""
assert s.count(old) == 1, f'dragScene 锚点={s.count(old)}'

new = """  const what = dir === 'left' ? '最左' : '最右';
  // v0.6.25 关键修复：原先直接调 ctx.op.swipe —— **绕过了 TaskContext.drag()，
  //   因此从不调 _advance，流程图一步都不推进**。
  //   面板看起来就"卡在『打开 XXX』那一步"（用户 2026-09-23 反馈丰饶之间）。
  // ⚠ 拖动在流程图里算**一个**步骤（用户口径把「主场景拖到最右」当作一步，
  //   内部拖 2 次是实现细节）→ 整段只 _advance 一次，且必须在真实 swipe **之前**
  //   （_advance 语义是"即将执行第 i 步"，否则面板会提前亮下一步）。
  ctx._advance(`主场景拖到${what}`);
  for (let i = 0; i < 2; i++) {
    await ctx.op.swipe(d.x1, d.y1, d.x2, d.y2, d.duration);
    if (i === 0) await Utils.sleep(1600);   // 让滑动惯性动画走完再拖第二次
  }
  ctx.stepResult(true);
}"""
s = s.replace(old, new, 1)

# ② 丰饶 run()：fight 拆成「战斗 / 探测结算 / 回到主界面」三步
old2 = """        await ctx.tap([543, 648], null, '点挑战');
        // v0.6.24：结束判据 = 右上角红叉（复用 PROBES.closeX，用户口径「直接用回到主界面的那个红x」）。
        //   修复前丰饶**没有任何结束判据** → 打完也不收手，停在丰饶页盲点到 300s 超时，
        //   用户只能手动 ⏹（2026-09-23 trace 实证：最后 10 步 scene 全 other、画面恒定）。
        await ctx.fight({ abundanceRedX: true });"""
assert s.count(old2) == 1, f'run 锚点={s.count(old2)}'

new2 = """        await ctx.tap([543, 648], null, '点挑战');
        // v0.6.24：结束判据 = 右上角红叉（复用 PROBES.closeX，用户口径「直接用回到主界面的那个红x」）。
        //   修复前丰饶**没有任何结束判据** → 打完也不收手，停在丰饶页盲点到 300s 超时，
        //   用户只能手动 ⏹（2026-09-23 trace 实证：最后 10 步 scene 全 other、画面恒定）。
        // v0.6.25：按用户口径拆成三步显示 —— 战斗 / 探测结算 / 回到主界面。
        //   fight() 内部本身就含「打到结束 → 清结算 → 回主界面」，这里额外补两次
        //   _advance 只为让流程图如实反映阶段（不影响实际执行）。
        ctx.step('战斗');
        ctx.step('探测结算');
        await ctx.fight({ abundanceRedX: true });
        ctx.step('回到主界面');"""
s = s.replace(old2, new2, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('OK：dragScene 推进 1 次；丰饶 run 拆出 战斗/探测结算/回到主界面')
